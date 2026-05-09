import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { ToolRegistration } from "../../core/provider.js";
import type { Sandbox } from "../../core/sandbox.js";

/**
 * Configuration for creating a read tool.
 */
export interface ReadToolConfig {
  /** Working directory — all relative paths resolve against this. */
  cwd: string;
  /** Sandbox for capability and path enforcement. */
  sandbox: Sandbox;
}

/**
 * Create a tool that reads file contents with offset/limit support.
 *
 * The tool accepts:
 * - `path` (required) — file path relative to cwd or absolute
 * - `offset` (optional) — 1-indexed starting line
 * - `limit` (optional) — max lines to return
 */
export function createReadTool(config: ReadToolConfig): ToolRegistration {
  const { cwd, sandbox } = config;

  return {
    definition: {
      name: "read",
      description:
        "Read the contents of a file. Supports text files. For large files, use offset and limit to read specific line ranges. Use offset=1 to start from the beginning, then continue with offset=(last line + 1) until complete.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to read (relative to cwd or absolute)",
          },
          offset: {
            type: "integer",
            description: "Line number to start reading from (1-indexed)",
            minimum: 1,
          },
          limit: {
            type: "integer",
            description: "Maximum number of lines to read",
            minimum: 1,
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },

    async execute(input) {
      const {
        path: filePath,
        offset,
        limit,
      } = input as {
        path: string;
        offset?: number;
        limit?: number;
      };

      // Resolve the path
      const resolvedPath = resolvePath(cwd, filePath);

      // Check sandbox
      const permission = sandbox.checkFileRead(resolvedPath);
      if (!permission.allowed) {
        return {
          content: [{ type: "text", text: permission.reason ?? "Access denied" }],
          isError: true,
        };
      }

      // Read file
      let content: string;
      try {
        content = readFileSync(resolvedPath, "utf-8");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `File not found: ${filePath}. ${message}` }],
          isError: true,
        };
      }

      const allLines = trimTrailingEmptyLines(content.split("\n"));
      const totalLines = allLines.length;

      // Apply offset (1-indexed → 0-indexed)
      const startLine = offset ? Math.max(0, offset - 1) : 0;

      // Empty file
      if (allLines.length === 0) {
        return {
          content: [{ type: "text", text: "" }],
          metadata: { lineCount: 0, outputLines: 0, truncated: false },
        };
      }

      // Check if offset is beyond the file
      if (offset !== undefined && startLine >= allLines.length) {
        return {
          content: [
            {
              type: "text",
              text: `Offset ${offset} is beyond end of file (${allLines.length} lines total)`,
            },
          ],
          isError: true,
        };
      }

      // Apply limit
      const endLine = limit ? Math.min(startLine + limit, allLines.length) : allLines.length;
      const selectedLines = allLines.slice(startLine, endLine);
      const outputText = selectedLines.join("\n");
      const outputLines = selectedLines.length;

      // Build truncation hint if limited
      const truncated = limit !== undefined && startLine + limit < allLines.length;
      const text = truncated
        ? `${outputText}\n\n[Showing lines ${startLine + 1}-${endLine} of ${totalLines}. Use offset=${endLine + 1} to continue.]`
        : outputText;

      return {
        content: [{ type: "text", text }],
        metadata: {
          lineCount: totalLines,
          outputLines,
          truncated,
        },
      };
    },
  };
}

/**
 * Resolve a path relative to cwd, normalizing and blocking traversal.
 */
/**
 * Remove trailing empty lines from an array (caused by trailing newlines).
 */
function trimTrailingEmptyLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1] === "") {
    end--;
  }
  return lines.slice(0, end);
}

/**
 * Resolve a path relative to cwd, normalizing separators.
 */
function resolvePath(cwd: string, inputPath: string): string {
  if (isAbsolute(inputPath)) {
    return inputPath;
  }

  // Resolve relative path
  const normalized = inputPath.replace(/\\/g, "/");
  return resolve(cwd, normalized);
}
