/**
 * @zosmaai/dhara-extension — TypeScript SDK for building Dhara extensions.
 *
 * Handles the JSON-RPC 2.0 stdin/stdout protocol, type definitions,
 * and tool dispatch so extension authors focus on their logic.
 *
 * @example
 * ```typescript
 * import { createExtension } from "@zosmaai/dhara-extension";
 * import type { ToolDescriptor } from "@zosmaai/dhara-extension";
 *
 * const ext = createExtension({
 *   name: "my-extension",
 *   version: "1.0.0",
 *   tools: [{
 *     descriptor: {
 *       name: "my_tool",
 *       description: "Does something useful",
 *       parameters: { type: "object", properties: {} }
 *     },
 *     handler: async (input) => ({
 *       content: [{ type: "text", text: "Done!" }]
 *     })
 *   }]
 * });
 *
 * ext.run();
 * ```
 */

export type { ExtensionOptions } from "./extension.js";
export { createExtension } from "./extension.js";
export type {
  ContentBlock,
  ErrorCodes,
  InitializeParams,
  InitializeResult,
  JsonRpcError,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcSuccess,
  ToolContext,
  ToolDescriptor,
  ToolHandler,
  ToolResult,
} from "./types.js";
