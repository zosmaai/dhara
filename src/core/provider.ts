import type { ContentBlock, ModelRef, ToolResult } from "./session.js";

export type { ContentBlock, ToolResult } from "./session.js";

/**
 * A message in the provider-agnostic conversation format.
 *
 * The agent loop converts {@link SessionEntry} values into this shape
 * before handing them to a provider adapter.
 */
export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: ContentBlock[];
  toolCalls?: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>;
  toolCallId?: string;
  toolName?: string;
}

/**
 * Definition of a tool exposed to the LLM.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Parameters for a provider completion request.
 */
export interface CompleteParams {
  systemPrompt?: string;
  messages: ProviderMessage[];
  tools?: ToolDefinition[];
  model: ModelRef;
}

/**
 * Response from a provider completion request.
 */
export interface AssistantMessage {
  content: ContentBlock[];
  toolCalls?: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>;
  usage?: {
    input: number;
    output: number;
  };
}

/**
 * A provider adapter turns Dhara's provider-agnostic {@link CompleteParams}
 * into a provider-specific API call and returns an {@link AssistantMessage}.
 */
export interface Provider {
  /**
   * Send a completion request to the LLM.
   */
  complete(params: CompleteParams): Promise<AssistantMessage>;
}

/**
 * Executable tool registered with the agent loop.
 */
export interface ToolExecutor {
  /**
   * Execute the tool with the given input.
   */
  execute(input: Record<string, unknown>): Promise<ToolResult>;
}

/**
 * A tool registration bundles its LLM-facing definition with its
 * runtime executor.
 */
export interface ToolRegistration {
  definition: ToolDefinition;
  execute: (input: Record<string, unknown>) => Promise<ToolResult>;
}
