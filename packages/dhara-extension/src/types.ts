/**
 * JSON-RPC 2.0 request.
 */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
  id?: string | number;
}

/**
 * JSON-RPC 2.0 success response.
 */
export interface JsonRpcSuccess<T = unknown> {
  jsonrpc: "2.0";
  result: T;
  id: string | number;
}

/**
 * JSON-RPC 2.0 error response.
 */
export interface JsonRpcError {
  jsonrpc: "2.0";
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
  id: string | number | null;
}

/**
 * JSON-RPC 2.0 notification (no response expected).
 */
export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcSuccess | JsonRpcError | JsonRpcNotification;

/**
 * Tool descriptor returned during extension initialization.
 */
export interface ToolDescriptor {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  returns?: Record<string, unknown>;
  capabilities?: string[];
}

/**
 * Response content block that will be rendered to the LLM.
 */
export interface ContentBlock {
  type: "text" | "image" | "file" | "thinking";
  text?: string;
  data?: string;
  mimeType?: string;
}

/**
 * Result of a tool execution.
 */
export interface ToolResult {
  content: ContentBlock[];
  isError?: boolean;
  display?: unknown[];
  metadata?: Record<string, unknown>;
}

/**
 * Handler function for a tool.
 */
export type ToolHandler = (
  input: Record<string, unknown>,
  context?: ToolContext,
) => ToolResult | Promise<ToolResult>;

/**
 * Context passed to tool handlers during execution.
 */
export interface ToolContext {
  cwd?: string;
  sessionId?: string;
  turnNumber?: number;
}

/**
 * Initialize params sent by the core.
 */
export interface InitializeParams {
  protocolVersion: string;
  capabilities: {
    tools?: boolean;
    hooks?: string[];
    commands?: boolean;
  };
  config?: Record<string, unknown>;
}

/**
 * Initialize result sent back to the core.
 */
export interface InitializeResult {
  protocolVersion: string;
  name: string;
  version: string;
  tools?: ToolDescriptor[];
  hooks?: string[];
  commands?: Array<{
    name: string;
    description: string;
  }>;
}

/**
 * Standard JSON-RPC error codes.
 */
export const ErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  TOOL_EXECUTION_ERROR: -32001,
  CAPABILITY_DENIED: -32002,
  EXTENSION_CRASHED: -32003,
  CANCELLED: -32004,
  PROVIDER_ERROR: -32010,
} as const;
