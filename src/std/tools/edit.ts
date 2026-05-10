import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { ToolRegistration } from "../../core/provider.js";
import type { Sandbox } from "../../core/sandbox.js";

/**
 * A single edit operation: replace oldText with newText.
 */
export interface Edit {
  oldText: string;
  newText: string;
}

/**
 * Configuration for creating an edit tool.
 */
export interface EditToolConfig {
  /** Working directory — all relative paths resolve against this. */
  cwd: string;
  /** Sandbox for capability and path enforcement. */
  sandbox: Sandbox;
}

/**
 * Find all non-overlapping matches of searchText in content.
 */
function findAllMatches(content: string, searchText: string): number[] {
  if (searchText.length === 0) return [];
  const indexes: number[] = [];
  let pos = 0;
  while (pos < content.length) {
    const idx = content.indexOf(searchText, pos);
    if (idx === -1) break;
    indexes.push(idx);
    pos = idx + searchText.length;
  }
  return indexes;
}

/**
 * Apply edits to content. Each edit is matched against the *original* content.
 * Edits must not overlap.
 */
function applyEdits(content: string, edits: Edit[]): { result: string; error?: string } {
  // Collect all match positions, validated against original content
  const editPositions: { editIndex: number; start: number; end: number; edit: Edit }[] = [];

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];
    if (edit.oldText.length === 0) {
      return { result: "", error: `Edit ${i + 1}: oldText must not be empty` };
    }

    const matches = findAllMatches(content, edit.oldText);

    if (matches.length === 0) {
      return {
        result: "",
        error: `Edit ${i + 1}: oldText "${edit.oldText}" not found in file`,
      };
    }

    if (matches.length > 1) {
      return {
        result: "",
        error: `Edit ${i + 1}: oldText "${edit.oldText}" matches ${matches.length} times in file (must match exactly once)`,
      };
    }

    editPositions.push({
      editIndex: i,
      start: matches[0],
      end: matches[0] + edit.oldText.length,
      edit,
    });
  }

  // Check for overlapping edits
  editPositions.sort((a, b) => a.start - b.start);
  for (let i = 1; i < editPositions.length; i++) {
    if (editPositions[i].start < editPositions[i - 1].end) {
      return {
        result: "",
        error: `Edits ${editPositions[i - 1].editIndex + 1} and ${editPositions[i].editIndex + 1} overlap in the file`,
      };
    }
  }

  // Apply edits in reverse order (so positions don't shift)
  let result = content;
  for (let i = editPositions.length - 1; i >= 0; i--) {
    const { start, end, edit } = editPositions[i];
    result = result.slice(0, start) + edit.newText + result.slice(end);
  }

  return { result };
}

/**
 * Generate a simple unified-diff-style string showing changes.
 */
function generateDiff(original: string, modified: string, filePath: string): string {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");

  let diff = `--- ${filePath}\n+++ ${filePath}\n`;

  // Simple line-level diff: find the first and last changed lines
  let firstDiff = -1;
  let lastDiff = -1;
  const maxLines = Math.max(origLines.length, modLines.length);

  for (let i = 0; i < maxLines; i++) {
    if (origLines[i] !== modLines[i]) {
      if (firstDiff === -1) firstDiff = i;
      lastDiff = i;
    }
  }

  if (firstDiff === -1) return diff;

  const contextStart = Math.max(0, firstDiff - 1);
  const contextEnd = Math.min(maxLines, lastDiff + 2);
  const hunkSize = contextEnd - contextStart;

  diff += `@@ -${contextStart + 1},${hunkSize} +${contextStart + 1},${hunkSize} @@\n`;

  for (let i = contextStart; i < contextEnd; i++) {
    const origLine = origLines[i] ?? "";
    const modLine = modLines[i] ?? "";

    if (origLine === modLine) {
      diff += ` ${origLine}\n`;
    } else if (i < origLines.length && i < modLines.length) {
      diff += `-${origLine}\n+${modLine}\n`;
    } else if (i >= origLines.length) {
      diff += `+${modLine}\n`;
    } else {
      diff += `-${origLine}\n`;
    }
  }

  return diff;
}

/**
 * Create a tool that performs surgical text replacements in files.
 *
 * The tool accepts:
 * - `path` (required) — file path relative to cwd or absolute
 * - `edits` (required) — array of { oldText, newText } replacements
 *
 * Each edit's oldText must match exactly once in the original file.
 * Edits must not overlap. All edits are matched against the original file,
 * not incrementally.
 */
export function createEditTool(config: EditToolConfig): ToolRegistration {
  const { cwd, sandbox } = config;

  return {
    definition: {
      name: "edit",
      description:
        "Edit a file using exact text replacement. Every edits[].oldText must match a unique, non-overlapping region of the original file. If two changes affect the same block or nearby lines, merge them into one edit instead of emitting overlapping edits. Do not include large unchanged regions just to connect distant changes.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to edit (relative to cwd or absolute)",
          },
          edits: {
            type: "array",
            description:
              "One or more targeted replacements. Each edit is matched against the original file, not incrementally. Do not include overlapping or nested edits.",
            items: {
              type: "object",
              properties: {
                oldText: {
                  type: "string",
                  description:
                    "Exact text to replace. Must be unique in the file and must not overlap with any other edits[].oldText in the same call.",
                },
                newText: {
                  type: "string",
                  description: "Replacement text for this targeted edit.",
                },
              },
              required: ["oldText", "newText"],
              additionalProperties: false,
            },
            minItems: 1,
          },
        },
        required: ["path", "edits"],
        additionalProperties: false,
      },
    },

    async execute(input, _signal) {
      const { path: filePath, edits } = input as {
        path: string;
        edits: Edit[];
      };

      const resolvedPath = resolvePath(cwd, filePath);

      // Check sandbox: need both read and write
      const readPerm = sandbox.checkFileRead(resolvedPath);
      if (!readPerm.allowed) {
        return {
          content: [{ type: "text", text: readPerm.reason ?? "Access denied" }],
          isError: true,
        };
      }

      const writePerm = sandbox.checkFileWrite(resolvedPath);
      if (!writePerm.allowed) {
        return {
          content: [{ type: "text", text: writePerm.reason ?? "Access denied" }],
          isError: true,
        };
      }

      // Read original content
      let original: string;
      try {
        original = readFileSync(resolvedPath, "utf-8");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `File not found: ${filePath}. ${message}` }],
          isError: true,
        };
      }

      // Apply edits
      const { result, error } = applyEdits(original, edits);
      if (error) {
        return {
          content: [{ type: "text", text: error }],
          isError: true,
        };
      }

      // Generate diff
      const diff = generateDiff(original, result, filePath);

      // Write modified content
      try {
        writeFileSync(resolvedPath, result, "utf-8");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Failed to write file: ${filePath}. ${message}` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Successfully replaced ${edits.length} block(s) in ${filePath}.`,
          },
        ],
        metadata: { diff, editsCount: edits.length },
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
