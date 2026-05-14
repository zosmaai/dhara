import type { EventBus } from "./events.js";
import type {
  ApprovalRequest,
  AssistantMessage,
  Provider,
  ProviderMessage,
  ToolRegistration,
} from "./provider.js";
import type { Session, ToolResult } from "./session.js";

/**
 * Configuration for creating an {@link AgentLoop}.
 */
export interface AgentLoopConfig {
  provider: Provider;
  session: Session;
  tools?: Map<string, ToolRegistration>;
  systemPrompt?: string;
  maxIterations?: number;
  eventBus?: EventBus;
}

/**
 * The agent loop drives the LLM ↔ tool interaction cycle.
 *
 * ```
 * User prompt
 *   → Build context (system prompt + history + tools)
 *   → Call LLM via {@link Provider} (with AbortSignal)
 *   → If tool calls: execute tools (with AbortSignal), append results, loop
 *   → If text response: emit to user, done
 *   → If cancelled: stop gracefully
 * ```
 */
export interface AgentLoop {
  /**
   * Run one prompt through the agent loop.
   *
   * Emits `agent:start` → zero or more turns → `agent:end`.
   * If the signal is aborted mid-execution, the loop stops gracefully
   * and emits `agent:cancelled`.
   *
   * @param userPrompt - The user's message.
   * @param signal - Optional AbortSignal to cancel the entire run.
   * @param eventBus - Optional per-invocation EventBus. When provided,
   *   this overrides the default EventBus for this specific run.
   */
  run(userPrompt: string, signal?: AbortSignal, eventBus?: EventBus): Promise<void>;
}

/**
 * Create a new {@link AgentLoop} instance.
 */
export function createAgentLoop(config: AgentLoopConfig): AgentLoop {
  const {
    provider,
    session,
    tools = new Map(),
    systemPrompt,
    maxIterations = 10,
    eventBus: defaultEventBus,
  } = config;

  /**
   * Resolve which event bus to use: per-invocation override or default.
   */
  function resolveBus(invocationBus?: EventBus): EventBus | undefined {
    return invocationBus ?? defaultEventBus;
  }

  /**
   * Check if the signal has been aborted, and emit cancellation event if so.
   * Returns true if cancelled.
   */
  function isCancelled(signal?: AbortSignal, eventBus?: EventBus): boolean {
    if (signal?.aborted) {
      eventBus?.emit("agent:cancelled", { reason: signal.reason });
      return true;
    }
    return false;
  }

  async function run(
    userPrompt: string,
    signal?: AbortSignal,
    invocationEventBus?: EventBus,
  ): Promise<void> {
    const eb = resolveBus(invocationEventBus);

    // Check initial cancellation
    if (isCancelled(signal, eb)) return;

    eb?.emit("agent:start", { prompt: userPrompt });

    // Append user message to session
    const userEntry = session.append({
      role: "user",
      content: [{ type: "text", text: userPrompt }],
    });

    eb?.emit("message:start", { entry: userEntry });
    eb?.emit("message:end", { entry: userEntry });
    eb?.emit("agent:prompt", { prompt: userPrompt, entryId: userEntry.id });

    // Track last response for agent:end event
    let lastUsage: { input: number; output: number } | undefined;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      if (isCancelled(signal, eb)) {
        eb?.emit("agent:end", { messages: [] });
        return;
      }

      eb?.emit("turn:start", { iteration });

      const messages = buildMessages(session);
      const toolDefs = Array.from(tools.values()).map((t) => t.definition);

      // Call LLM
      let response: AssistantMessage | undefined;
      try {
        response = await provider.complete(
          {
            systemPrompt,
            messages,
            tools: toolDefs.length > 0 ? toolDefs : undefined,
            model: session.meta.model ?? { id: "unknown", provider: "unknown" },
            eventBus: eb,
          },
          signal,
        );
      } catch (err) {
        // Check if cancellation caused the error
        if (signal?.aborted) {
          eb?.emit("agent:cancelled", { reason: signal.reason });
          eb?.emit("agent:end", { messages: [] });
          return;
        }
        eb?.emit("agent:error", {
          error: err instanceof Error ? err.message : String(err),
          iteration,
        });
        eb?.emit("agent:end", { messages: [] });
        return;
      }

      if (isCancelled(signal, eb)) {
        eb?.emit("agent:end", { messages: [] });
        return;
      }

      // Append assistant response to session
      const assistantEntry = session.append({
        role: "assistant",
        content: response.content,
        toolCalls: response.toolCalls,
        reasoningContent: response.reasoningContent,
        metadata: response.usage
          ? {
              tokenCount: {
                input: response.usage.input,
                output: response.usage.output,
              },
            }
          : undefined,
      });

      // Emit message events for the assistant response
      eb?.emit("message:start", { entry: assistantEntry, content: response.content });

      // Emit reasoning/thinking content if present
      if (response.reasoningContent) {
        eb?.emit("message:reasoning", { entry: assistantEntry, text: response.reasoningContent });
      }

      // If streaming content, emit deltas (for now, emit the full content)
      if (response.content.length > 0) {
        const deltaText = response.content
          .filter((c: { type: string; text?: string }) => c.type === "text")
          .map((c: { text?: string }) => c.text ?? "")
          .join("");
        eb?.emit("message:delta", {
          entry: assistantEntry,
          content: response.content,
          type: "text",
          delta: deltaText,
        });
      }

      eb?.emit("message:end", { entry: assistantEntry });
      // Track usage for agent:end
      if (response.usage) {
        lastUsage = response.usage;
      }

      eb?.emit("agent:response", {
        entryId: assistantEntry.id,
        content: response.content,
        toolCalls: response.toolCalls,
        usage: response.usage,
      });

      // If no tool calls, this turn is complete
      if (!response.toolCalls || response.toolCalls.length === 0) {
        eb?.emit("turn:end", {
          iteration,
          message: assistantEntry,
          toolResults: [],
        });
        break;
      }

      // Execute tool calls
      const toolResults: Array<{ entry: unknown; toolName: string; toolCallId: string }> = [];

      for (const toolCall of response.toolCalls) {
        if (isCancelled(signal, eb)) break;

        eb?.emit("tool:call_start", {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          input: toolCall.input,
        });

        eb?.emit("tool:execution_start", {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          args: toolCall.input,
        });

        // Check if signal was aborted before execution
        if (signal?.aborted) {
          eb?.emit("tool:call_cancelled", {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
          });
          break;
        }

        // ── Human-in-the-loop approval ──────────────────────────────────
        const toolReg = tools.get(toolCall.name);
        if (toolReg && eb && needsApprovalCheck(toolReg.definition, toolCall.input)) {
          const approvalReq: ApprovalRequest = {
            id: `${session.meta.sessionId ?? "sess"}:${toolCall.id}`,
            toolName: toolCall.name,
            input: toolCall.input,
            description: toolReg.definition.description,
            context: userPrompt.slice(0, 200),
          };

          const emitResult = eb.emit("tool:approval_required", approvalReq);

          if (emitResult.blocked) {
            // Approval denied — inject rejection as tool result
            eb?.emit("tool:approval_denied", {
              toolName: toolCall.name,
              input: toolCall.input,
              reason: emitResult.reason ?? "Approval denied",
            });

            const rejectionResult: ToolResult = {
              content: [
                {
                  type: "text",
                  text: `Tool call "${toolCall.name}" was rejected: ${emitResult.reason ?? "Approval denied by human"}`,
                },
              ],
              isError: true,
            };

            const toolEntry = session.append({
              role: "tool_result",
              content: rejectionResult.content,
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              isError: true,
            });

            eb?.emit("tool:execution_end", {
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              result: rejectionResult,
              isError: true,
            });

            toolResults.push({
              entry: toolEntry,
              toolName: toolCall.name,
              toolCallId: toolCall.id,
            });
            continue;
          }

          // Approval granted
          eb?.emit("tool:approval_granted", {
            toolName: toolCall.name,
            input: toolCall.input,
          });
        }

        const result = await executeTool(toolCall.name, toolCall.input, tools, signal);

        // Check if tool was cancelled
        if (result.metadata?.cancelled || (signal?.aborted && !result.isError === false)) {
          eb?.emit("tool:call_cancelled", {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
          });
        }

        const toolEntry = session.append({
          role: "tool_result",
          content: result.content,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          isError: result.isError,
        });

        eb?.emit("tool:execution_end", {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          result,
          isError: result.isError ?? false,
        });

        eb?.emit("tool:call_end", {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          result,
        });

        toolResults.push({
          entry: toolEntry,
          toolName: toolCall.name,
          toolCallId: toolCall.id,
        });
      }

      // Emit turn end event
      eb?.emit("turn:end", {
        iteration,
        message: assistantEntry,
        toolResults,
      });
    }

    // Emit agent:end with usage info so the TUI can display tokens
    eb?.emit("agent:end", {
      messages: [],
      result: {
        tokens: lastUsage,
      },
    });
  }

  return { run };
}

/**
 * Check whether a tool call requires human approval.
 */
function needsApprovalCheck(
  def: import("./provider.js").ToolDefinition,
  input: Record<string, unknown>,
): boolean {
  if (def.needsApproval === undefined) return false;
  if (typeof def.needsApproval === "function") {
    return def.needsApproval(input);
  }
  return def.needsApproval === true;
}

function buildMessages(session: Session): ProviderMessage[] {
  const path = session.getPath();
  const messages: ProviderMessage[] = [];

  for (const id of path) {
    const entry = session.getEntry(id);
    if (!entry || entry.type !== "entry") continue;

    switch (entry.role) {
      case "system":
        messages.push({ role: "system", content: entry.content });
        break;
      case "user":
        messages.push({ role: "user", content: entry.content });
        break;
      case "assistant":
        messages.push({
          role: "assistant",
          content: entry.content,
          toolCalls: entry.toolCalls,
          reasoningContent: entry.reasoningContent,
        });
        break;
      case "tool_result":
        messages.push({
          role: "tool",
          content: entry.content,
          toolCallId: entry.toolCallId,
          toolName: entry.toolName,
        });
        break;
    }
  }

  return messages;
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  toolMap: Map<string, ToolRegistration>,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const tool = toolMap.get(name);
  if (!tool) {
    return {
      content: [{ type: "text", text: `Tool "${name}" not found` }],
      isError: true,
    };
  }

  try {
    return await tool.execute(input, signal);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: message }],
      isError: true,
    };
  }
}
