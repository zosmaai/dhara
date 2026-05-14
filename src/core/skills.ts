import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single discovered skill following the Agent Skills standard. */
export interface Skill {
  /** Skill name (must match directory name per spec). */
  name: string;
  /** Description from SKILL.md frontmatter. */
  description: string;
  /** Absolute path to the skill directory. */
  dir: string;
  /** Absolute path to SKILL.md. */
  path: string;
  /** Optional license. */
  license?: string;
  /** Optional compatibility info. */
  compatibility?: string;
  /** Body content (after YAML frontmatter). */
  body: string;
  /** Where the skill was discovered. */
  source: "global" | "project";
}

/** Result of discovering all skills. */
export interface SkillsResult {
  /** All discovered skills, in load order (global first, then project). */
  skills: Skill[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Directories to scan for skills, in priority order. */
const SKILL_DIRECTORIES = [".agents/skills", ".dhara/skills"];

// ─── Discovery ───────────────────────────────────────────────────────────────

/**
 * Discover all skills from all locations.
 *
 * Order (later = higher priority):
 * 1. `~/.dhara/skills/` — global skills
 * 2. `.agents/skills/` from cwd walk-up (industry standard)
 * 3. `.dhara/skills/` from cwd walk-up (Dhara-specific)
 *
 * Skills with the same name from higher-priority sources override
 * lower-priority ones.
 */
export function discoverSkills(cwd: string): SkillsResult {
  const skillsMap = new Map<string, Skill>();

  // 1. Global skills
  const globalDir = join(homedir(), ".dhara", "skills");
  loadSkillsFromDir(globalDir, "global", skillsMap);

  // 2. Walk up from cwd to find project skills
  const ancestors = getAncestorDirs(cwd);
  for (const dir of ancestors) {
    for (const relDir of SKILL_DIRECTORIES) {
      const skillsDir = join(dir, relDir);
      loadSkillsFromDir(skillsDir, "project", skillsMap);
    }
    // Stop at the first ancestor that has any skill directory
    if (hasAnySkillDir(dir, SKILL_DIRECTORIES)) {
      break;
    }
  }

  return {
    skills: Array.from(skillsMap.values()),
  };
}

/**
 * Re-discover skills (same as discoverSkills).
 */
export function reloadSkills(cwd: string): SkillsResult {
  return discoverSkills(cwd);
}

// ─── SKILL.md Parsing ────────────────────────────────────────────────────────

/**
 * Result of parsing a single SKILL.md file.
 */
interface ParsedSkill {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  body: string;
}

/**
 * Parse a SKILL.md file and return its metadata and body.
 * Returns undefined if the file cannot be parsed or is invalid.
 */
function parseSkillMd(filePath: string): ParsedSkill | undefined {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return undefined;
  }

  // Check for YAML frontmatter (between --- markers)
  if (!content.startsWith("---")) {
    return undefined;
  }

  const endOfFrontmatter = content.indexOf("---", 3);
  if (endOfFrontmatter === -1) {
    return undefined;
  }

  const frontmatter = content.slice(3, endOfFrontmatter).trim();
  const body = content.slice(endOfFrontmatter + 3).trim();

  // Parse YAML frontmatter (simple key: value parser)
  const fields = parseSimpleYaml(frontmatter);
  const name = fields.get("name");
  const description = fields.get("description");

  if (!name || !description) {
    return undefined;
  }

  return {
    name,
    description,
    license: fields.get("license"),
    compatibility: fields.get("compatibility"),
    body: body || "(no instructions)",
  };
}

/**
 * Simple YAML frontmatter parser.
 * Handles `key: value` pairs, multi-line values, and quoted strings.
 */
function parseSimpleYaml(yaml: string): Map<string, string> {
  const fields = new Map<string, string>();
  let currentKey: string | null = null;
  let currentValue: string | null = null;

  for (const line of yaml.split("\n")) {
    // Check if this is a new key-value pair
    const match = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (match) {
      // Save previous key-value if any
      if (currentKey !== null && currentValue !== null) {
        fields.set(currentKey, currentValue.trim());
      }
      currentKey = match[1];
      currentValue = match[2].trim();
    } else if (currentKey !== null && line.startsWith(" ")) {
      // Continuation of previous value
      currentValue += ` ${line.trim()}`;
    }
  }

  // Save last key-value
  if (currentKey !== null && currentValue !== null) {
    fields.set(currentKey, currentValue.trim());
  }

  return fields;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Load skills from a single directory.
 * Each subdirectory should contain a SKILL.md file.
 */
function loadSkillsFromDir(
  skillsDir: string,
  source: "global" | "project",
  skillsMap: Map<string, Skill>,
): void {
  let entries: string[];
  try {
    entries = readdirSync(skillsDir);
  } catch {
    return; // Directory doesn't exist
  }

  for (const entry of entries) {
    const skillDir = join(skillsDir, entry);
    const skillPath = join(skillDir, "SKILL.md");

    // Must be a directory with a SKILL.md inside
    try {
      if (!statSync(skillDir).isDirectory()) continue;
    } catch {
      continue;
    }

    const parsed = parseSkillMd(skillPath);
    if (!parsed) continue;

    // Per Agent Skills spec: name must match directory name
    if (parsed.name !== entry) continue;

    const skill: Skill = {
      name: parsed.name,
      description: parsed.description,
      dir: skillDir,
      path: skillPath,
      license: parsed.license,
      compatibility: parsed.compatibility,
      body: parsed.body,
      source,
    };

    // Higher-priority sources override lower-priority ones
    skillsMap.set(entry, skill);
  }
}

/**
 * Get all ancestor directories of a path (from closest to root).
 */
function getAncestorDirs(cwd: string): string[] {
  const parts = cwd.split(sep);
  const dirs: string[] = [];

  for (let i = parts.length; i > 0; i--) {
    const dir = parts.slice(0, i).join(sep);
    dirs.push(dir === "" ? "/" : dir);
  }

  return dirs;
}

/**
 * Check if any of the given relative directories exist under `baseDir`.
 */
function hasAnySkillDir(baseDir: string, relDirs: string[]): boolean {
  for (const rel of relDirs) {
    const fullPath = join(baseDir, rel);
    try {
      if (statSync(fullPath).isDirectory()) return true;
    } catch {}
  }
  return false;
}
