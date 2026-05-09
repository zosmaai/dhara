import type { ToolRegistration } from "../../core/provider.js";
import type { Sandbox } from "../../core/sandbox.js";
import { createBashTool } from "./bash.js";
import { createEditTool } from "./edit.js";
import { createGrepTool } from "./grep.js";
import { createLsTool } from "./ls.js";
import { createReadTool } from "./read.js";
import { createWriteTool } from "./write.js";

export { createBashTool } from "./bash.js";
export { createEditTool } from "./edit.js";
export { createGrepTool } from "./grep.js";
export { createLsTool } from "./ls.js";
export { createReadTool } from "./read.js";
export { createWriteTool } from "./write.js";

export type { BashToolConfig } from "./bash.js";
export type { EditToolConfig } from "./edit.js";
export type { GrepToolConfig } from "./grep.js";
export type { LsToolConfig } from "./ls.js";
export type { ReadToolConfig } from "./read.js";
export type { WriteToolConfig } from "./write.js";

/**
 * Default tool names provided by the standard library.
 */
export const STANDARD_TOOL_NAMES = ["read", "write", "edit", "ls", "grep", "bash"] as const;

export type StandardToolName = (typeof STANDARD_TOOL_NAMES)[number];

/**
 * A record of all standard tools, keyed by name.
 */
export type StandardTools = Record<StandardToolName, ToolRegistration>;

/**
 * Create all standard tools configured for a given cwd and sandbox.
 *
 * This is the primary way to instantiate the standard library:
 *
 * ```ts
 * const tools = createStandardTools({ cwd: "/project", sandbox });
 * tools.read.definition  // { name: "read", ... }
 * await tools.bash.execute({ command: "ls" })
 * ```
 */
export function createStandardTools(config: {
  cwd: string;
  sandbox: Sandbox;
}): StandardTools {
  return {
    read: createReadTool(config),
    write: createWriteTool(config),
    edit: createEditTool(config),
    ls: createLsTool(config),
    grep: createGrepTool(config),
    bash: createBashTool(config),
  };
}

/**
 * Create all standard tools as a Map (for use with the agent loop).
 *
 * ```ts
 * const toolMap = createStandardToolMap({ cwd: "/project", sandbox });
 * agentLoop({ provider, session, tools: toolMap })
 * ```
 */
export function createStandardToolMap(config: {
  cwd: string;
  sandbox: Sandbox;
}): Map<string, ToolRegistration> {
  const tools = createStandardTools(config);
  const map = new Map<string, ToolRegistration>();
  for (const [name, tool] of Object.entries(tools)) {
    map.set(name, tool);
  }
  return map;
}
