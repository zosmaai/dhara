import type {
  Provider,
  ProviderMessage,
  AssistantMessage,
  CompleteParams,
} from "../../core/provider.js";

/**
 * Configuration for creating an Anthropic provider adapter.
 */
export interface AnthropicProviderConfig {
  /** Anthropic API key. */
  apiKey: string;
  /** Custom base URL (for proxies). */
  baseUrl?: string;
}

interface AnthropicContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicContentBlock[];
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  error?: { type: string; message: string };
}

/**
 * Create an Anthropic Messages API provider adapter.
 */
export function createAnthropicProvider(
  config: AnthropicProviderConfig,
): Provider {
  const baseUrl = config.baseUrl ?? "https://api.anthropic.com/v1";
  const apiKey = config.apiKey;

  async function complete(params: CompleteParams): Promise<AssistantMessage> {
    const messages: AnthropicMessage[] = [];

    for (const msg of params.messages) {
      const converted = convertMessage(msg);
      if (converted) {
        messages.push(converted);
      }
    }

    const tools: AnthropicTool[] | undefined = params.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));

    const body: Record<string, unknown> = {
      model: params.model.id,
      messages,
      max_tokens: 4096,
    };

    if (params.systemPrompt) {
      body.system = params.systemPrompt;
    }

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as AnthropicResponse;

    if (!response.ok || data.error) {
      const message = data.error?.message ?? `HTTP ${response.status}`;
      throw new Error(message);
    }

    const content: AssistantMessage["content"] = [];
    const toolCalls: AssistantMessage["toolCalls"] = [];

    for (const block of data.content) {
      if (block.type === "text" && block.text) {
        content.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use" && block.id) {
        toolCalls.push({
          id: block.id,
          name: block.name ?? "",
          input: (block.input as Record<string, unknown>) ?? {},
        });
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usage
        ? {
            input: data.usage.input_tokens,
            output: data.usage.output_tokens,
          }
        : undefined,
    };
  }

  return { complete };
}

function convertMessage(msg: ProviderMessage): AnthropicMessage | null {
  const text = msg.content.map((c) => c.text ?? "").join("");

  switch (msg.role) {
    case "system":
      // Anthropic doesn't allow system messages in the messages array;
      // system prompt is handled via the top-level `system` field.
      return null;
    case "user":
      return {
        role: "user",
        content: [{ type: "text", text }],
      };
    case "assistant": {
      const content: AnthropicContentBlock[] = [];
      if (text) {
        content.push({ type: "text", text });
      }
      for (const tc of msg.toolCalls ?? []) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.input,
        });
      }
      return { role: "assistant", content };
    }
    case "tool":
      return {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.toolCallId ?? "",
            content: text,
          },
        ],
      };
  }
}
