import type { EventBus } from "./events.js";
import type { Provider, ProviderMessage, ToolRegistration } from "./provider.js";
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
 *   → Call LLM via {@link Provider}
 *   → If tool calls: execute tools, append results, loop
 *   → If text response: emit to user, done
 * ```
 */
export interface AgentLoop {
  /**
   * Run one turn of the agent loop.
   *
   * @param userPrompt - The user's message.
   */
  run(userPrompt: string): Promise<void>;
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
    eventBus,
  } = config;

  async function run(userPrompt: string): Promise<void> {
    session.append({
      role: "user",
      content: [{ type: "text", text: userPrompt }],
    });

    eventBus?.emit("agent:prompt", { prompt: userPrompt });

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const messages = buildMessages(session);
      const toolDefs = Array.from(tools.values()).map((t) => t.definition);

      const response = await provider.complete({
        systemPrompt,
        messages,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        model: session.meta.model ?? { id: "unknown", provider: "unknown" },
      });

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

      eventBus?.emit("agent:response", {
        entryId: assistantEntry.id,
        content: response.content,
        toolCalls: response.toolCalls,
        usage: response.usage,
      });

      if (!response.toolCalls || response.toolCalls.length === 0) {
        break;
      }

      for (const toolCall of response.toolCalls) {
        eventBus?.emit("agent:tool_call_start", {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          input: toolCall.input,
        });

        const result = await executeTool(toolCall.name, toolCall.input, tools);

        session.append({
          role: "tool_result",
          content: result.content,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          isError: result.isError,
        });

        eventBus?.emit("agent:tool_call_end", {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          result,
        });
      }
    }
  }

  return { run };
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
  tools: Map<string, ToolRegistration>,
): Promise<ToolResult> {
  const tool = tools.get(name);
  if (!tool) {
    return {
      content: [{ type: "text", text: `Tool "${name}" not found` }],
      isError: true,
    };
  }

  try {
    return await tool.execute(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: message }],
      isError: true,
    };
  }
}
