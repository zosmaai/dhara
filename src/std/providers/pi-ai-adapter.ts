import { completeSimple } from "@earendil-works/pi-ai";
import { getModel, getProviders as getPiAiProviders, getEnvApiKey } from "@earendil-works/pi-ai";
import type {
  AssistantMessage as PiAiAssistantMessage,
  Context as PiAiContext,
  KnownProvider,
  Message as PiAiMessage,
  Model as PiAiModel,
  Tool as PiAiTool,
} from "@earendil-works/pi-ai";
import type {
  AssistantMessage,
  CompleteParams,
  Provider,
  ProviderMessage,
  ToolDefinition,
} from "../../core/provider.js";

/**
 * Configuration for creating a pi-ai-backed provider adapter.
 */
export interface PiAiAdapterConfig {
  /** Provider name (e.g. "google", "mistral", "anthropic", "openai"). */
  provider: string;
  /** Model ID (e.g. "gemini-2.5-flash", "mistral-large-latest"). */
  model: string;
  /** Optional API key. If omitted, pi-ai auto-discovers from env vars. */
  apiKey?: string;
  /** Optional base URL for custom endpoints. */
  baseUrl?: string;
}

/**
 * Create a Dhara provider adapter backed by @earendil-works/pi-ai.
 *
 * This wraps pi-ai's unified LLM API, giving Dhara access to all providers
 * pi-ai supports: Anthropic, Google/Gemini, Google Vertex, Mistral,
 * Amazon Bedrock, Azure OpenAI, OpenAI, DeepSeek, Groq, and more.
 *
 * pi-ai handles API key resolution, OAuth, model discovery, and provider-
 * specific message formatting. This adapter handles the type translation
 * between Dhara's provider-agnostic format and pi-ai's format.
 */
export function createPiAiProvider(config: PiAiAdapterConfig): Provider {
  const { provider, model: modelId } = config;
  const apiKey = config.apiKey ?? getEnvApiKey(provider);
  const baseUrl = config.baseUrl;

  async function complete(
    params: CompleteParams,
    signal?: AbortSignal,
  ): Promise<AssistantMessage> {
    // Resolve the pi-ai model
    let piModel: PiAiModel<string>;
    try {
      piModel = getModel(provider as KnownProvider, modelId as never) as PiAiModel<string>;
    } catch {
      // Fallback: construct a minimal model for dynamic/unknown providers
      piModel = {
        id: modelId,
        name: modelId,
        api: "openai-completions" as const,
        provider,
        baseUrl: baseUrl ?? "",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128_000,
        maxTokens: 4096,
      } as PiAiModel<string>;
    }

    // Override baseUrl if provided
    if (baseUrl) {
      piModel = { ...piModel, baseUrl };
    }

    // Build pi-ai context
    const context: PiAiContext = {
      systemPrompt: params.systemPrompt,
      messages: params.messages.map(convertToPiAiMessage),
    };

    // Convert tool definitions
    if (params.tools && params.tools.length > 0) {
      context.tools = params.tools.map(convertToPiAiTool);
    }

    // Build options
    const options: Record<string, unknown> = {};
    if (signal) {
      options.signal = signal;
    }
    if (apiKey) {
      options.apiKey = apiKey;
    }

    // Call pi-ai
    const response = await completeSimple(piModel, context, options);

    // Convert response to Dhara format
    return convertFromPiAiResponse(response);
  }

  return { complete };
}

/**
 * Convert a Dhara ProviderMessage to a pi-ai Message.
 */
function convertToPiAiMessage(msg: ProviderMessage): PiAiMessage {
  switch (msg.role) {
    case "system":
      return {
        role: "user",
        content: msg.content.map((c) => ({ type: "text" as const, text: c.text ?? "" })),
        timestamp: Date.now(),
      };

    case "user": {
      const content = msg.content.map((c) => {
        if (c.type === "image" && c.data) {
          return { type: "image" as const, data: c.data, mimeType: c.mimeType ?? "image/png" };
        }
        return { type: "text" as const, text: c.text ?? "" };
      });
      return { role: "user", content, timestamp: Date.now() };
    }

    case "assistant": {
      const content: Array<{ type: "text"; text: string } | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> }> = [];
      for (const c of msg.content) {
        content.push({ type: "text", text: c.text ?? "" });
      }
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          content.push({
            type: "toolCall",
            id: tc.id,
            name: tc.name,
            arguments: tc.input,
          });
        }
      }
      return {
        role: "assistant",
        content,
        api: "openai-completions" as const,
        provider: "",
        model: "",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "stop" as const,
        timestamp: Date.now(),
      };
    }

    case "tool": {
      const text = msg.content.map((c) => c.text ?? "").join("\n");
      return {
        role: "toolResult",
        toolCallId: msg.toolCallId ?? "",
        toolName: msg.toolName ?? "",
        content: [{ type: "text", text }],
        isError: false,
        timestamp: Date.now(),
      };
    }
  }
}

/**
 * Convert a Dhara tool definition to pi-ai format.
 */
function convertToPiAiTool(tool: ToolDefinition): PiAiTool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters as PiAiTool["parameters"],
  };
}

/**
 * Convert a pi-ai AssistantMessage to Dhara format.
 */
function convertFromPiAiResponse(response: PiAiAssistantMessage): AssistantMessage {
  const content: AssistantMessage["content"] = [];
  const toolCalls: AssistantMessage["toolCalls"] = [];

  for (const block of response.content) {
    if (block.type === "text") {
      content.push({ type: "text", text: block.text });
    } else if (block.type === "thinking") {
      content.push({ type: "thinking", text: block.thinking });
    } else if (block.type === "toolCall") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.arguments,
      });
    }
  }

  return {
    content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage: response.usage
      ? {
          input: response.usage.input,
          output: response.usage.output,
        }
      : undefined,
  };
}

/**
 * Get all known pi-ai providers.
 */
export function getAvailableProviders(): string[] {
  try {
    return getPiAiProviders();
  } catch {
    return [];
  }
}
