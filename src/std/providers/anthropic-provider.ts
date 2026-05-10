import type {
  AssistantMessage,
  CompleteParams,
  Provider,
  ProviderMessage,
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

// ── SSE event types (Anthropic streaming API) ────────────────────────

interface MessageStartEvent {
  type: "message_start";
  message: {
    id: string;
    type: "message";
    role: "assistant";
    content: unknown[];
    model: string;
    stop_reason: string | null;
    stop_sequence: string | null;
    usage: { input_tokens: number; output_tokens: number };
  };
}

interface ContentBlockStartEvent {
  type: "content_block_start";
  index: number;
  content_block: {
    type: "text" | "tool_use";
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  };
}

interface ContentBlockDeltaEvent {
  type: "content_block_delta";
  index: number;
  delta: { type: "text_delta"; text: string } | { type: "input_json_delta"; partial_json: string };
}

interface ContentBlockStopEvent {
  type: "content_block_stop";
  index: number;
}

interface MessageDeltaEvent {
  type: "message_delta";
  delta: { stop_reason: string | null; stop_sequence: string | null };
  usage: { output_tokens: number };
}

interface MessageStopEvent {
  type: "message_stop";
}

type AnthropicStreamEvent =
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent;

/**
 * Accumulated state for a streaming content block.
 */
interface StreamingBlock {
  index: number;
  type: "text" | "tool_use";
  text: string;
  toolUseId?: string;
  toolName?: string;
  toolInput: string; // Accumulated JSON string for input_json_delta
}

/**
 * Create an Anthropic Messages API provider adapter.
 *
 * Supports SSE streaming when `params.eventBus` is provided.
 * Uses the `system` top-level field (not in messages array).
 */
export function createAnthropicProvider(config: AnthropicProviderConfig): Provider {
  const baseUrl = config.baseUrl ?? "https://api.anthropic.com/v1";
  const apiKey = config.apiKey;

  async function complete(params: CompleteParams, signal?: AbortSignal): Promise<AssistantMessage> {
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

    // Use streaming when an event bus is provided
    if (params.eventBus) {
      body.stream = true;
      return streamComplete(body, params.eventBus, signal);
    }

    // Non-streaming path
    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal,
    });

    const data = (await response.json()) as AnthropicResponse;

    if (!response.ok || data.error) {
      const message = data.error?.message ?? `HTTP ${response.status}`;
      throw new Error(message);
    }

    return parseResponse(data);
  }

  /**
   * Execute a streaming completion via Anthropic SSE.
   * Emits `message:delta` events and returns the full accumulated response.
   */
  async function streamComplete(
    body: Record<string, unknown>,
    eventBus: NonNullable<CompleteParams["eventBus"]>,
    signal?: AbortSignal,
  ): Promise<AssistantMessage> {
    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
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
    let currentEventType = "";
    let currentData = "";

    const blocks: StreamingBlock[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed === "") {
            // Empty line = end of event — process accumulated data
            if (currentEventType && currentData) {
              processStreamEvent(currentData, eventBus, blocks);
            }
            currentEventType = "";
            currentData = "";
            continue;
          }

          if (trimmed.startsWith("event: ")) {
            currentEventType = trimmed.slice(7);
          } else if (trimmed.startsWith("data: ")) {
            currentData = trimmed.slice(6);
          }
        }
      }

      // Process any remaining event
      if (currentEventType && currentData) {
        processStreamEvent(currentData, eventBus, blocks);
      }
    } finally {
      reader.releaseLock();
    }

    // Build the final response from accumulated blocks
    return buildResponseFromBlocks(blocks);
  }

  return { complete };
}

/**
 * Process a single SSE event from the Anthropic stream.
 */
function processStreamEvent(
  data: string,
  eventBus: NonNullable<CompleteParams["eventBus"]>,
  blocks: StreamingBlock[],
): void {
  let event: AnthropicStreamEvent;
  try {
    event = JSON.parse(data) as AnthropicStreamEvent;
  } catch {
    return;
  }

  switch (event.type) {
    case "content_block_start": {
      const idx = event.index;
      while (blocks.length <= idx) {
        blocks.push({
          index: blocks.length,
          type: "text",
          text: "",
          toolInput: "",
        });
      }
      const block = event.content_block;
      blocks[idx].type = block.type as "text" | "tool_use";
      if (block.type === "tool_use") {
        blocks[idx].toolUseId = block.id;
        blocks[idx].toolName = block.name;
        if (block.input) {
          blocks[idx].toolInput = JSON.stringify(block.input);
        }
      }
      break;
    }

    case "content_block_delta": {
      const idx = event.index;
      while (blocks.length <= idx) {
        blocks.push({
          index: blocks.length,
          type: "text",
          text: "",
          toolInput: "",
        });
      }
      const delta = event.delta;
      if (delta.type === "text_delta") {
        blocks[idx].type = "text";
        blocks[idx].text += delta.text;
        eventBus.emit("message:delta", {
          entry: { id: "" },
          content: [{ type: "text", text: delta.text }],
          type: "text",
        });
      } else if (delta.type === "input_json_delta") {
        blocks[idx].toolInput += delta.partial_json;
      }
      break;
    }

    case "message_start":
    case "content_block_stop":
    case "message_delta":
    case "message_stop":
      // No per-delta action needed for these
      break;
  }
}

/**
 * Build AssistantMessage from accumulated streaming blocks.
 */
function buildResponseFromBlocks(blocks: StreamingBlock[]): AssistantMessage {
  const content: AssistantMessage["content"] = [];
  const toolCalls: AssistantMessage["toolCalls"] = [];

  for (const block of blocks) {
    if (block.type === "text" && block.text) {
      content.push({ type: "text", text: block.text });
    } else if (block.type === "tool_use" && block.toolUseId) {
      let input: Record<string, unknown> = {};
      if (block.toolInput) {
        try {
          input = JSON.parse(block.toolInput) as Record<string, unknown>;
        } catch {
          input = {};
        }
      }
      toolCalls.push({
        id: block.toolUseId,
        name: block.toolName ?? "",
        input,
      });
    }
  }

  return {
    content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

/**
 * Parse a non-streaming JSON response.
 */
function parseResponse(data: AnthropicResponse): AssistantMessage {
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
