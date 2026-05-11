/**
 * Theme loader: parses YAML theme files and returns Theme instances.
 *
 * Supports a minimal YAML subset (no external dependency).
 */
import { Theme, type ThemeDefinition, type StyleDefinition } from "./theme.js";
import { readFileSync } from "node:fs";

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
        name = trimmed.slice(5).trim().replace(/^["']|["']$/g, "");
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
