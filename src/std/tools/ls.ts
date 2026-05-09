import { readdirSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { ToolRegistration } from "../../core/provider.js";
import type { Sandbox } from "../../core/sandbox.js";

/**
 * Configuration for creating an ls tool.
 */
export interface LsToolConfig {
  /** Working directory — all relative paths resolve against this. */
  cwd: string;
  /** Sandbox for capability and path enforcement. */
  sandbox: Sandbox;
}

/**
 * Create a tool that lists directory contents.
 *
 * The tool accepts:
 * - `path` (optional) — directory path (defaults to cwd)
 *
 * Returns entries sorted alphabetically, with '/' suffix for directories.
 */
export function createLsTool(config: LsToolConfig): ToolRegistration {
  const { cwd, sandbox } = config;

  return {
    definition: {
      name: "ls",
      description:
        "List directory contents. Returns entries sorted alphabetically, with '/' suffix for directories.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Directory to list (relative to cwd or absolute). Defaults to the current working directory.",
          },
        },
        additionalProperties: false,
      },
    },

    async execute(input) {
      const { path: inputPath } = input as { path?: string };
      const targetDir = inputPath ? resolvePath(cwd, inputPath) : cwd;

      // Check sandbox (capability + path within cwd)
      const permission = sandbox.checkFileRead(targetDir);
      if (!permission.allowed) {
        return {
          content: [{ type: "text", text: permission.reason ?? "Access denied" }],
          isError: true,
        };
      }

      // Read directory
      let entries: string[];
      try {
        entries = readdirSync(targetDir);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            { type: "text", text: `Cannot list directory: ${inputPath ?? targetDir}. ${message}` },
          ],
          isError: true,
        };
      }

      // Sort and annotate entries
      entries.sort((a, b) => a.localeCompare(b));
      const lines: string[] = [];

      for (const entry of entries) {
        const fullPath = resolve(targetDir, entry);
        try {
          const stats = statSync(fullPath);
          if (stats.isDirectory()) {
            lines.push(`${entry}/`);
          } else {
            lines.push(entry);
          }
        } catch {
          lines.push(entry);
        }
      }

      return {
        content: [
          { type: "text", text: lines.length > 0 ? lines.join("\n") : "(empty directory)" },
        ],
        metadata: { entryCount: entries.length },
      };
    },
  };
}

/**
 * Resolve a path relative to cwd.
 */
function resolvePath(cwd: string, inputPath: string): string {
  if (isAbsolute(inputPath)) {
    return inputPath;
  }
  const normalized = inputPath.replace(/\\/g, "/");
  return resolve(cwd, normalized);
}
