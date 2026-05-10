import type {
  AssistantMessage,
  CompleteParams,
  Provider,
  ProviderMessage,
} from "../../core/provider.js";

/**
 * Configuration for creating an OpenAI provider adapter.
 */
export interface OpenAIProviderConfig {
  /** OpenAI API key. */
  apiKey: string;
  /** Custom base URL (for proxies or OpenAI-compatible endpoints). */
  baseUrl?: string;
}

interface OpenAIMessage {
  role: string;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  reasoning_content?: string;
}

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: OpenAIMessage["tool_calls"];
      reasoning_content?: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
  error?: { message: string };
}

/**
 * SSE delta chunk from a streaming response.
 */
interface StreamDelta {
  choices?: Array<{
    delta: {
      content?: string;
      reasoning_content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
    index: number;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

/**
 * Accumulated state for a streaming tool call.
 */
interface StreamingToolCall {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Create an OpenAI-compatible provider adapter.
 *
 * Supports OpenAI's Chat Completions API and any API that follows the same
 * schema (e.g. Groq, Cerebras, Ollama, vLLM).
 *
 * When `params.eventBus` is provided, the provider streams the response
 * via SSE and emits `message:delta` events as tokens arrive. Tool calls
 * are still accumulated and returned as a complete response.
 */
export function createOpenAIProvider(config: OpenAIProviderConfig): Provider {
  const baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
  const apiKey = config.apiKey;

  async function complete(params: CompleteParams, signal?: AbortSignal): Promise<AssistantMessage> {
    const messages: OpenAIMessage[] = [];

    if (params.systemPrompt) {
      messages.push({ role: "system", content: params.systemPrompt });
    }

    for (const msg of params.messages) {
      messages.push(convertMessage(msg));
    }

    const tools: OpenAITool[] | undefined = params.tools?.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    const body: Record<string, unknown> = {
      model: params.model.id,
      messages,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    // Use streaming when an event bus is provided
    if (params.eventBus) {
      body.stream = true;
      return streamComplete(body, params.eventBus, signal);
    }

    // Non-streaming path (no event bus)
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    const data = (await response.json()) as OpenAIResponse;

    if (!response.ok || data.error) {
      const message = data.error?.message ?? `HTTP ${response.status}`;
      throw new Error(message);
    }

    const choice = data.choices[0];
    if (!choice) {
      throw new Error("No response from OpenAI");
    }

    const content: AssistantMessage["content"] = [];
    if (choice.message.content) {
      content.push({ type: "text", text: choice.message.content });
    }

    const toolCalls: AssistantMessage["toolCalls"] = choice.message.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));

    return {
      content,
      toolCalls,
      reasoningContent: choice.message.reasoning_content,
      usage: data.usage
        ? {
            input: data.usage.prompt_tokens,
            output: data.usage.completion_tokens,
          }
        : undefined,
    };
  }

  /**
   * Execute a streaming completion via SSE.
   * Emits `message:delta` events and returns the full accumulated response.
   */
  async function streamComplete(
    body: Record<string, unknown>,
    eventBus: NonNullable<CompleteParams["eventBus"]>,
    signal?: AbortSignal,
  ): Promise<AssistantMessage> {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      let errorText = "";
      try {
        const errorData = (await response.json()) as { error?: { message: string } };
        errorText = errorData.error?.message ?? "";
      } catch {
        errorText = await response.text();
      }
      throw new Error(errorText || `HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Response body is not readable");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let fullReasoning = "";
    const accumulatedToolCalls: StreamingToolCall[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6); // Remove "data: " prefix
          if (data === "[DONE]") continue;

          let delta: StreamDelta;
          try {
            delta = JSON.parse(data) as StreamDelta;
          } catch {
            continue; // Skip malformed JSON
          }

          const choice = delta.choices?.[0];
          if (!choice) continue;

          const contentDelta = choice.delta?.content;
          const reasoningDelta = choice.delta?.reasoning_content;
          const toolCallDeltas = choice.delta?.tool_calls;

          // Accumulate content
          if (contentDelta) {
            fullContent += contentDelta;
            eventBus.emit("message:delta", {
              entry: { id: "" },
              content: [{ type: "text", text: contentDelta }],
              type: "text",
            });
          }

          // Accumulate reasoning content
          if (reasoningDelta) {
            fullReasoning += reasoningDelta;
          }

          // Accumulate tool call deltas
          if (toolCallDeltas) {
            for (const tc of toolCallDeltas) {
              // Ensure the tool call slot exists
              while (accumulatedToolCalls.length <= tc.index) {
                accumulatedToolCalls.push({ id: "", name: "", arguments: "" });
              }
              if (tc.id) accumulatedToolCalls[tc.index].id = tc.id;
              if (tc.function?.name) accumulatedToolCalls[tc.index].name = tc.function.name;
              if (tc.function?.arguments) {
                accumulatedToolCalls[tc.index].arguments += tc.function.arguments;
              }
            }
          }

          // Check finish reason
          if (choice.finish_reason) {
            // We could emit usage info here, but it's in the last chunk
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const content: AssistantMessage["content"] = [];
    if (fullContent) {
      content.push({ type: "text", text: fullContent });
    }

    const toolCalls: AssistantMessage["toolCalls"] = accumulatedToolCalls
      .filter((tc) => tc.name) // Only include complete tool calls
      .map((tc) => ({
        id: tc.id,
        name: tc.name,
        input: JSON.parse(tc.arguments || "{}") as Record<string, unknown>,
      }));

    return {
      content: toolCalls.length > 0 ? [] : content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      reasoningContent: fullReasoning || undefined,
    };
  }

  return { complete };
}

function convertMessage(msg: ProviderMessage): OpenAIMessage {
  const text = msg.content.map((c) => c.text ?? "").join("");

  switch (msg.role) {
    case "system":
      return { role: "system", content: text };
    case "user":
      return { role: "user", content: text };
    case "assistant":
      return {
        role: "assistant",
        content: text || null,
        reasoning_content: msg.reasoningContent,
        tool_calls: msg.toolCalls?.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.input),
          },
        })),
      };
    case "tool":
      return {
        role: "tool",
        content: text,
        tool_call_id: msg.toolCallId ?? "",
      };
  }
}
