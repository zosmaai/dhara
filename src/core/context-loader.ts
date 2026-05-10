import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single discovered context file. */
export interface ContextFile {
  /** Absolute path to the file. */
  path: string;
  /** File contents. */
  content: string;
  /** Whether this came from the global config directory. */
  source: "global" | "project";
}

/** Result of loading all context files for a given working directory. */
export interface ContextLoaderResult {
  /** All discovered context files in loading order. */
  files: ContextFile[];
  /** Concatenated context content with header markers. */
  combined: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** The global config directory. */
export function getGlobalDir(): string {
  return join(homedir(), ".dhara");
}

/** Context file names to look for, in priority order. */
const CONTEXT_FILE_NAMES = ["AGENTS.md", "CLAUDE.md"];

// ─── Context Loader ──────────────────────────────────────────────────────────

/**
 * Discover all context files for a given working directory.
 *
 * Loads in this order (later files have higher priority):
 * 1. `~/.dhara/AGENTS.md` (global)
 * 2. `~/.dhara/CLAUDE.md` (global)
 * 3. Walk up from cwd to root, finding `AGENTS.md` and `CLAUDE.md`
 *
 * The walk-up stops at the first directory that contains either file.
 * This means a project-level AGENTS.md takes precedence over parent dirs.
 *
 * @param cwd - The working directory to start searching from.
 * @returns All discovered context files in loading order.
 */
export function loadContextFiles(cwd: string): ContextLoaderResult {
  const files: ContextFile[] = [];

  // 1. Global context files
  const globalDir = getGlobalDir();
  for (const name of CONTEXT_FILE_NAMES) {
    const filePath = join(globalDir, name);
    const content = tryReadFile(filePath);
    if (content !== undefined) {
      files.push({ path: filePath, content, source: "global" });
    }
  }

  // 2. Walk up from cwd
  const projectFiles = findProjectContextFiles(cwd);
  files.push(...projectFiles);

  // 3. Build combined string
  const combined = buildCombined(files);

  return { files, combined };
}

/**
 * Reload context files — re-reads all files from disk.
 * Uses {@link loadContextFiles} under the hood.
 */
export function reloadContextFiles(cwd: string): ContextLoaderResult {
  return loadContextFiles(cwd);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Walk up from `cwd` towards the filesystem root, collecting context files.
 *
 * At each directory level, looks for `AGENTS.md` and `CLAUDE.md`.
 * Stops at the first directory that contains either file.
 *
 * @returns Array of discovered context files, in walk-up order.
 */
function findProjectContextFiles(cwd: string): ContextFile[] {
  const found: ContextFile[] = [];

  // Normalize the path and split into segments for walking up
  const parts = cwd.split(sep);
  const paths: string[] = [];

  // Build all ancestor paths
  for (let i = parts.length; i > 0; i--) {
    const dir = parts.slice(0, i).join(sep);
    // On Unix, the root is "/"
    paths.push(dir === "" ? "/" : dir);
  }

  // The last path is the filesystem root — don't search there
  // (we stop at the first directory that has context files)
  for (const dir of paths) {
    const dirFiles: ContextFile[] = [];

    for (const name of CONTEXT_FILE_NAMES) {
      const filePath = join(dir, name);
      const content = tryReadFile(filePath);
      if (content !== undefined) {
        dirFiles.push({ path: filePath, content, source: "project" });
      }
    }

    if (dirFiles.length > 0) {
      // Found context files at this level — use them and stop
      found.push(...dirFiles);
      break;
    }
  }

  return found;
}

/**
 * Concatenate all context files into a single string with header markers.
 */
function buildCombined(files: ContextFile[]): string {
  if (files.length === 0) return "";

  const parts: string[] = [];

  for (const file of files) {
    const label = file.source === "global" ? "Global" : "Project";
    parts.push(`<context file="${file.path}" source="${label.toLowerCase()}">`);
    parts.push(file.content.trimEnd());
    parts.push("</context>");
  }

  return parts.join("\n\n");
}

/**
 * Try to read a file. Returns `undefined` if the file doesn't exist or can't be read.
 */
function tryReadFile(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return undefined;
  }
}
