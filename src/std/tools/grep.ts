import { readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { ToolRegistration } from "../../core/provider.js";
import type { Sandbox } from "../../core/sandbox.js";

/**
 * Configuration for creating a grep tool.
 */
export interface GrepToolConfig {
  /** Working directory — all relative paths resolve against this. */
  cwd: string;
  /** Sandbox for capability and path enforcement. */
  sandbox: Sandbox;
}

interface Match {
  file: string;
  line: number;
  text: string;
}

/**
 * Create a tool that searches for patterns in files.
 *
 * The tool accepts:
 * - `pattern` (required) — search string or regex
 * - `path` (optional) — directory/file to search (defaults to cwd)
 * - `caseInsensitive` (optional) — case-insensitive search (default: false)
 */
export function createGrepTool(config: GrepToolConfig): ToolRegistration {
  const { cwd, sandbox } = config;

  return {
    definition: {
      name: "grep",
      description:
        "Search for a pattern across files within the project. Searches recursively into subdirectories. Returns matching lines with file paths and line numbers.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Search pattern (plain text, not regex)",
          },
          path: {
            type: "string",
            description:
              "File or directory to search (relative to cwd or absolute). Defaults to the current working directory.",
          },
          caseInsensitive: {
            type: "boolean",
            description: "Case-insensitive search (default: false)",
          },
        },
        required: ["pattern"],
        additionalProperties: false,
      },
    },

    async execute(input) {
      const {
        pattern,
        path: inputPath,
        caseInsensitive,
      } = input as {
        pattern: string;
        path?: string;
        caseInsensitive?: boolean;
      };

      const searchDir = inputPath ? resolvePath(cwd, inputPath) : cwd;

      // Check sandbox
      const permission = sandbox.checkFileRead(searchDir);
      if (!permission.allowed) {
        return {
          content: [{ type: "text", text: permission.reason ?? "Access denied" }],
          isError: true,
        };
      }

      // Collect all files recursively
      let files: string[];
      try {
        const stat = statSync(searchDir);
        if (stat.isFile()) {
          files = [searchDir];
        } else {
          files = collectFiles(searchDir);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `Cannot search: ${inputPath ?? searchDir}. ${message}`,
            },
          ],
          isError: true,
        };
      }

      // Search each file
      const matches: Match[] = [];

      for (const filePath of files) {
        // Check each file is within cwd
        const filePerm = sandbox.checkFileRead(filePath);
        if (!filePerm.allowed) continue;

        let content: string;
        try {
          content = readFileSync(filePath, "utf-8");
        } catch {
          continue; // Skip unreadable files
        }

        const lines = content.split("\n");
        const escapedPattern = escapeRegex(pattern);

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const re = caseInsensitive ? new RegExp(escapedPattern, "i") : new RegExp(escapedPattern);

          if (re.test(line)) {
            const relativePath = filePath.startsWith(cwd)
              ? filePath.slice(cwd.length + 1)
              : filePath;
            matches.push({ file: relativePath, line: i + 1, text: line });
          }
        }
      }

      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No matches found for "${pattern}" in ${inputPath ?? "project"}`,
            },
          ],
          metadata: { matchCount: 0 },
        };
      }

      // Format output
      const lines = matches.map((m) => `${m.file}:${m.line}:${m.text}`);

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        metadata: { matchCount: matches.length },
      };
    },
  };
}

/**
 * Recursively collect all files in a directory, skipping node_modules and .git.
 */
function collectFiles(dir: string): string[] {
  const results: string[] = [];
  const skipDirs = new Set(["node_modules", ".git", "dist", ".next", "build"]);

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) {
          results.push(...collectFiles(fullPath));
        }
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  } catch {
    // Skip directories we can't read
  }

  return results;
}

/**
 * Escape special regex characters for literal matching.
 */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
