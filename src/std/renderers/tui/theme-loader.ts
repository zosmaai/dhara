import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
/**
 * Theme loader: parses YAML theme files and returns Theme instances.
 *
 * Supports a minimal YAML subset (no external dependency).
 */
import { type StyleDefinition, Theme, type ThemeDefinition } from "./theme.js";
import { BUILTIN_THEME_NAMES, BUILTIN_THEMES } from "./themes/index.js";

/**
 * Parse a minimal YAML theme definition string.
 *
 * This is intentionally minimal to avoid a YAML dependency.
 * Supports:
 * - Top-level `name` scalar
 * - `styles:` block with nested style objects
 * - Style objects with: fg, bg, bold, dim, italic, underline, strikethrough
 * - Hex colors (#rrggbb), ANSI names (red, blue, etc.)
 * - Indentation-based nesting (2-space or 4-space)
 */
function parseThemeYaml(yaml: string): ThemeDefinition {
  const lines = yaml.split("\n");
  let name = "custom";
  const styles: Record<string, StyleDefinition> = {};

  let currentStyleName: string | null = null;
  let currentStyle: StyleDefinition | null = null;
  let inStyles = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line === "" || line.trimStart().startsWith("#")) continue;

    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;

    if (!inStyles) {
      if (trimmed.startsWith("name:")) {
        name = trimmed
          .slice(5)
          .trim()
          .replace(/^["']|["']$/g, "");
      } else if (trimmed === "styles:") {
        inStyles = true;
      }
      continue;
    }

    // Inside styles block
    if (indent === 0 && !trimmed.startsWith(" ")) {
      // Back to top level
      inStyles = false;
      continue;
    }

    if (indent <= 2 && !trimmed.startsWith("  ") && !trimmed.startsWith("\t")) {
      // New style name (top-level key in styles)
      if (trimmed.endsWith(":")) {
        currentStyleName = trimmed.slice(0, -1).trim();
        currentStyle = {};
        styles[currentStyleName] = currentStyle;
      }
      continue;
    }

    // Property inside a style
    if (currentStyle && trimmed.endsWith(":")) {
      // Skip nested objects (we only support flat styles)
      continue;
    }

    if (currentStyle) {
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) continue;

      const prop = trimmed.slice(0, colonIdx).trim();
      let value = trimmed.slice(colonIdx + 1).trim();
      // Strip quotes
      value = value.replace(/^["']|["']$/g, "");

      switch (prop) {
        case "fg":
          currentStyle.fg = value;
          break;
        case "bg":
          currentStyle.bg = value;
          break;
        case "bold":
          currentStyle.bold = value === "true";
          break;
        case "dim":
          currentStyle.dim = value === "true";
          break;
        case "italic":
          currentStyle.italic = value === "true";
          break;
        case "underline":
          currentStyle.underline = value === "true";
          break;
        case "strikethrough":
          currentStyle.strikethrough = value === "true";
          break;
      }
    }
  }

  return { name, styles };
}

/**
 * Load a theme from a YAML file path.
 */
export function loadThemeFile(path: string, colorEnabled = true): Theme {
  try {
    const yaml = readFileSync(path, "utf-8");
    const definition = parseThemeYaml(yaml);
    return new Theme(definition, colorEnabled);
  } catch (err) {
    throw new Error(
      `Failed to load theme from "${path}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export { parseThemeYaml };

/**
 * Directory where user-installed custom themes are stored.
 */
export function getUserThemeDir(): string {
  return join(homedir(), ".dhara", "themes");
}

/**
 * Discover and load all available themes (built-in + user custom).
 * Returns a record keyed by theme name.
 */
export function discoverThemes(colorEnabled = true): Record<string, Theme> {
  const themes: Record<string, Theme> = {};

  // Built-in themes
  for (const name of BUILTIN_THEME_NAMES) {
    themes[name] = new Theme(BUILTIN_THEMES[name], colorEnabled);
  }

  // User custom themes from ~/.dhara/themes/
  const userDir = getUserThemeDir();
  if (existsSync(userDir)) {
    let entries: string[] = [];
    try {
      entries = readdirSync(userDir);
    } catch {
      // ignore
    }

    for (const entry of entries) {
      if (!entry.endsWith(".yaml") && !entry.endsWith(".yml")) continue;
      const themePath = join(userDir, entry);
      try {
        const theme = loadThemeFile(themePath, colorEnabled);
        themes[theme.name] = theme;
      } catch {
        // skip invalid themes
      }
    }
  }

  return themes;
}

/**
 * Resolve a theme by name, checking built-in themes first,
 * then user custom themes.
 */
export function resolveTheme(name: string, colorEnabled = true): Theme | undefined {
  // Built-in check
  const builtinDef = BUILTIN_THEMES[name];
  if (builtinDef) return new Theme(builtinDef, colorEnabled);

  // User custom check — try loading from ~/.dhara/themes/{name}.yaml
  const userFile = join(getUserThemeDir(), `${name}.yaml`);
  if (existsSync(userFile)) {
    try {
      return loadThemeFile(userFile, colorEnabled);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/**
 * List all available theme names (built-in + custom).
 */
export function listThemeNames(): string[] {
  const names = new Set(BUILTIN_THEME_NAMES);

  const userDir = getUserThemeDir();
  if (existsSync(userDir)) {
    try {
      for (const entry of readdirSync(userDir)) {
        if (entry.endsWith(".yaml") || entry.endsWith(".yml")) {
          names.add(entry.replace(/\.ya?ml$/, ""));
        }
      }
    } catch {
      // ignore
    }
  }

  return Array.from(names).sort();
}
