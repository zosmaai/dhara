import { readFileSync } from "node:fs";
import { join, sep } from "node:path";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Project-level settings read from `.dhara/config.json`.
 *
 * Mirrors the same structure as the global `~/.dhara/config.json` for
 * shared settings (e.g. `session.maxIterations`), with additional
 * project-specific overrides at the top level.
 *
 * Legacy `.dhara/settings.json` files with flat settings are still
 * loaded for backward compatibility — the intent is one consistent
 * `config.json` file everywhere.
 */
export interface ProjectSettings {
  /** Session behaviour overrides (mirrors ~/.dhara/config.json session.*). */
  session?: {
    /** Maximum agent loop iterations before forced stop. */
    maxIterations?: number;
    /** Whether to auto-save sessions. */
    autoSave?: boolean;
  };
  /** Default provider ID. */
  provider?: string;
  /** Default model ID. */
  model?: string;
  /** Base URL for the provider. */
  baseUrl?: string;
  /** Maximum tokens to generate per response. */
  maxTokens?: number;
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
  session: {
    maxIterations: 100,
    autoSave: true,
  },
};

// ─── Project Config Loader ───────────────────────────────────────────────────

/**
 * Find and load project-level configuration from `.dhara/config.json`.
 *
 * Walks up from `cwd` towards the filesystem root looking for a `.dhara/`
 * directory containing `config.json`. Uses the **first** one found (closest
 * to cwd).
 *
 * For backward compatibility, also checks for legacy `.dhara/settings.json`
 * if `config.json` is not found. Legacy flat-format settings (e.g.
 * `maxIterations` at top level) are normalized into the new nested shape.
 *
 * @param cwd - The working directory to start searching from.
 * @returns The project config, or `undefined` if no config file
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

    // Try new file name first, then legacy
    const raw =
      tryReadFile(join(configDir, "config.json")) ?? tryReadFile(join(configDir, "settings.json"));

    if (raw !== undefined) {
      try {
        const parsed = JSON.parse(raw);

        // Normalize legacy flat format into new nested shape
        if (typeof parsed === "object" && parsed !== null) {
          if (!parsed.session && typeof parsed.maxIterations === "number") {
            parsed.session = { maxIterations: parsed.maxIterations };
            delete parsed.maxIterations;
          }
          if (!parsed.session && typeof parsed.autoSave === "boolean") {
            parsed.session = { ...parsed.session, autoSave: parsed.autoSave };
            delete parsed.autoSave;
          }
        }

        return {
          configDir,
          settings: mergeSettings(DEFAULT_SETTINGS, parsed as ProjectSettings),
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

    const raw =
      tryReadFile(join(configDir, "config.json")) ?? tryReadFile(join(configDir, "settings.json"));

    if (raw !== undefined) {
      try {
        const parsed = JSON.parse(raw);

        // Normalize legacy flat format
        if (typeof parsed === "object" && parsed !== null) {
          if (!parsed.session && typeof parsed.maxIterations === "number") {
            parsed.session = { maxIterations: parsed.maxIterations };
            delete parsed.maxIterations;
          }
          if (!parsed.session && typeof parsed.autoSave === "boolean") {
            parsed.session = { ...parsed.session, autoSave: parsed.autoSave };
            delete parsed.autoSave;
          }
        }

        results.push({
          configDir,
          settings: mergeSettings(DEFAULT_SETTINGS, parsed as ProjectSettings),
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

/**
 * Deep-merge user settings over defaults, handling the `session` sub-object.
 * This preserves any session fields the user set while applying defaults
 * for anything they omitted.
 */
function mergeSettings(defaults: ProjectSettings, user: Partial<ProjectSettings>): ProjectSettings {
  return {
    ...defaults,
    ...user,
    session: {
      ...defaults.session,
      ...(user.session ?? {}),
    },
  };
}

function tryReadFile(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return undefined;
  }
}
