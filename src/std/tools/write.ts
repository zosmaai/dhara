import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { ToolRegistration } from "../../core/provider.js";
import type { Sandbox } from "../../core/sandbox.js";

/**
 * Configuration for creating a write tool.
 */
export interface WriteToolConfig {
  /** Working directory — all relative paths resolve against this. */
  cwd: string;
  /** Sandbox for capability and path enforcement. */
  sandbox: Sandbox;
}

/**
 * Create a tool that writes content to files.
 *
 * The tool accepts:
 * - `path` (required) — file path relative to cwd or absolute
 * - `content` (required) — text content to write
 *
 * Creates parent directories if they don't exist.
 */
export function createWriteTool(config: WriteToolConfig): ToolRegistration {
  const { cwd, sandbox } = config;

  return {
    definition: {
      name: "write",
      description:
        "Create a new file or overwrite an existing file with the given content. Creates parent directories automatically if they don't exist. Use for creating new files or full-file replacements. For surgical changes, use edit instead.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to write (relative to cwd or absolute)",
          },
          content: {
            type: "string",
            description: "Text content to write to the file",
          },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },

    async execute(input) {
      const { path: filePath, content } = input as {
        path: string;
        content: string;
      };

      const resolvedPath = resolvePath(cwd, filePath);

      // Check sandbox
      const permission = sandbox.checkFileWrite(resolvedPath);
      if (!permission.allowed) {
        return {
          content: [{ type: "text", text: permission.reason ?? "Access denied" }],
          isError: true,
        };
      }

      // Create parent directories if needed
      const parentDir = dirname(resolvedPath);
      try {
        mkdirSync(parentDir, { recursive: true });
      } catch {
        return {
          content: [{ type: "text", text: `Failed to create parent directories for: ${filePath}` }],
          isError: true,
        };
      }

      // Write file
      try {
        writeFileSync(resolvedPath, content, "utf-8");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Failed to write file: ${filePath}. ${message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: `Wrote ${content.length} bytes to ${filePath}` }],
        metadata: { bytesWritten: content.length },
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
