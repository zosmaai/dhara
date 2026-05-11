import { readFileSync } from "node:fs";
import { join, sep } from "node:path";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Project-level settings read from `.dhara/settings.json`.
 *
 * These override global defaults and CLI defaults on a per-project basis.
 */
export interface ProjectSettings {
  /** Default provider ID. */
  provider?: string;
  /** Default model ID. */
  model?: string;
  /** Maximum agent loop iterations. */
  maxIterations?: number;
  /** Base URL for the provider. */
  baseUrl?: string;
  /** Maximum tokens to generate per response. */
  maxTokens?: number;
  /** Whether to enable auto-save for sessions. */
  autoSave?: boolean;
  /** Extra directories to search for skills. */
  skillDirectories?: string[];
  /** Tools to enable/disable. Format: { "tool-name": true | false } */
  tools?: Record<string, boolean>;
}

/**
 * Result of loading project-level configuration.
 */
export interface ProjectConfigResult {
  /** Absolute path to the `.dhara/` directory that was found. */
  configDir: string;
  /** The parsed settings. Returns defaults if file doesn't exist. */
  settings: ProjectSettings;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: ProjectSettings = {
  maxIterations: 10,
};

// ─── Project Config Loader ───────────────────────────────────────────────────

/**
 * Find and load project-level configuration from `.dhara/settings.json`.
 *
 * Walks up from `cwd` towards the filesystem root looking for a `.dhara/`
 * directory containing `settings.json`. Uses the **first** one found (closest
 * to cwd).
 *
 * @param cwd - The working directory to start searching from.
 * @returns The project config, or `undefined` if no `.dhara/settings.json`
 *          exists in any ancestor directory.
 */
export function loadProjectConfig(cwd: string): ProjectConfigResult | undefined {
  const parts = cwd.split(sep);
  const paths: string[] = [];

  // Build all ancestor paths
  for (let i = parts.length; i > 0; i--) {
    const dir = parts.slice(0, i).join(sep);
    paths.push(dir === "" ? "/" : dir);
  }

  for (const dir of paths) {
    const configDir = join(dir, ".dhara");
    const settingsPath = join(configDir, "settings.json");

    const raw = tryReadFile(settingsPath);
    if (raw !== undefined) {
      try {
        const parsed = JSON.parse(raw) as ProjectSettings;
        return {
          configDir,
          settings: { ...DEFAULT_SETTINGS, ...parsed },
        };
      } catch {}
    }
  }

  return undefined;
}

/**
 * Find all `.dhara/` directories in ancestor directories.
 *
 * This is useful for discovering nested `.dhara/` configs (e.g. a parent
 * repo config and a subdirectory override).
 *
 * @param cwd - The working directory to start searching from.
 * @returns Array of found config directories, closest to cwd first.
 */
export function findAllProjectConfigs(cwd: string): ProjectConfigResult[] {
  const results: ProjectConfigResult[] = [];
  const parts = cwd.split(sep);
  const paths: string[] = [];

  for (let i = parts.length; i > 0; i--) {
    const dir = parts.slice(0, i).join(sep);
    paths.push(dir === "" ? "/" : dir);
  }

  for (const dir of paths) {
    const configDir = join(dir, ".dhara");
    const settingsPath = join(configDir, "settings.json");

    const raw = tryReadFile(settingsPath);
    if (raw !== undefined) {
      try {
        const parsed = JSON.parse(raw) as ProjectSettings;
        results.push({
          configDir,
          settings: { ...DEFAULT_SETTINGS, ...parsed },
        });
      } catch {}
    }
  }

  return results;
}

/**
 * Get the absolute path to the `.dhara/skills/` directory for a project.
 *
 * @param configDir - The `.dhara/` directory path from {@link loadProjectConfig}.
 * @returns Absolute path to the skills directory.
 */
export function getProjectSkillsDir(configDir: string): string {
  return join(configDir, "skills");
}

/**
 * Get the absolute path to the `.dhara/sessions/` directory for a project.
 *
 * @param configDir - The `.dhara/` directory path from {@link loadProjectConfig}.
 * @returns Absolute path to the sessions directory.
 */
export function getProjectSessionsDir(configDir: string): string {
  return join(configDir, "sessions");
}

/**
 * Get the absolute path to the `.dhara/extensions/` directory for a project.
 *
 * @param configDir - The `.dhara/` directory path from {@link loadProjectConfig}.
 * @returns Absolute path to the extensions directory.
 */
export function getProjectExtensionsDir(configDir: string): string {
  return join(configDir, "extensions");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tryReadFile(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return undefined;
  }
}
