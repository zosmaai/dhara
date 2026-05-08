import type {
  Provider,
  ProviderMessage,
  AssistantMessage,
  CompleteParams,
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
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
  error?: { message: string };
}

/**
 * Create an OpenAI-compatible provider adapter.
 *
 * Supports OpenAI's Chat Completions API and any API that follows the same
 * schema (e.g. Groq, Cerebras, Ollama, vLLM).
 */
export function createOpenAIProvider(config: OpenAIProviderConfig): Provider {
  const baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
  const apiKey = config.apiKey;

  async function complete(params: CompleteParams): Promise<AssistantMessage> {
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

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
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

    const toolCalls: AssistantMessage["toolCalls"] =
      choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      }));

    return {
      content,
      toolCalls,
      usage: data.usage
        ? {
            input: data.usage.prompt_tokens,
            output: data.usage.completion_tokens,
          }
        : undefined,
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
