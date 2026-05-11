/**
 * Theme system for the TUI renderer.
 *
 * Themes are defined as YAML files with named styles. Components
 * reference styles by name (e.g. "chat.user") rather than receiving
 * raw ANSI codes. The Theme class resolves styles to ANSI sequences.
 *
 * Theme format (YAML):
 * ```yaml
 * name: dracula
 * styles:
 *   text:            { fg: "#f8f8f2" }
 *   dim:             { fg: "#6272a4" }
 *   chat.user:       { fg: "#50fa7b", bold: true }
 *   editor.prompt:   { fg: "#bd93f9" }
 *   status.bar:      { fg: "#282a36", bg: "#6272a4" }
 * ```
 *
 * Color values: hex (#rrggbb), ANSI names (red, green, blue, ...),
 * or ANSI color numbers (0-255).
 */

// ── Style types ────────────────────────────────────────────────────────

export interface StyleDefinition {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  /** Colors defined by this style are enabled, even when --no-color is passed. */
  forceColor?: boolean;
}

export interface ThemeDefinition {
  name: string;
  styles: Record<string, StyleDefinition>;
}

/** Resolved ANSI codes for a style. */
export interface ResolvedStyle {
  prefix: string;
  reset: string;
}

// ── ANSI code constants ────────────────────────────────────────────────

const FG_BASE = 30;
const BG_BASE = 40;
const FG_BRIGHT = 90;
const BG_BRIGHT = 100;

/** ANSI 16-color name mapping. */
const COLOR_NAMES: Record<string, number> = {
  black: 0,
  red: 1,
  green: 2,
  yellow: 3,
  blue: 4,
  magenta: 5,
  cyan: 6,
  white: 7,
};

/** RGB to ANSI 256-color palette index (approximation). */
function rgbToAnsi256(r: number, g: number, b: number): number {
  // Grayscale detection
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }
  // 6x6x6 color cube
  const ri = Math.round((r / 255) * 5);
  const gi = Math.round((g / 255) * 5);
  const bi = Math.round((b / 255) * 5);
  return 16 + 36 * ri + 6 * gi + bi;
}

/** Hex color to ANSI codes. Returns {fg, bg} ANSI sequences. */
function hexToAnsi(hex: string): { fgCode: string | null; bgCode: string | null } {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return { fgCode: null, bgCode: null };

  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  const color8 = rgbToAnsi256(r, g, b);

  return {
    fgCode: `\x1b[38;5;${color8}m`,
    bgCode: `\x1b[48;5;${color8}m`,
  };
}

/** Resolve a color value (hex, name, or ANSI number) to SGR code. */
function resolveColor(value: string | undefined, isForeground: boolean): string | null {
  if (!value) return null;

  // Try hex
  if (value.startsWith("#")) {
    const codes = hexToAnsi(value);
    return isForeground ? codes.fgCode : codes.bgCode;
  }

  // Try ANSI color name
  const name = value.toLowerCase();
  if (COLOR_NAMES[name] !== undefined) {
    const code = COLOR_NAMES[name];
    const base = isForeground ? FG_BASE : BG_BASE;
    const brightBase = isForeground ? FG_BRIGHT : BG_BRIGHT;
    // Colors 0-7 are normal, 8-15 are bright
    if (code < 8) {
      return `\x1b[${base + code}m`;
    }
    return `\x1b[${brightBase + (code - 8)}m`;
  }

  // Try ANSI 256-color number
  const num = Number.parseInt(value, 10);
  if (!Number.isNaN(num) && num >= 0 && num <= 255) {
    const target = isForeground ? 38 : 48;
    return `\x1b[${target};5;${num}m`;
  }

  return null;
}

// ── Theme class ────────────────────────────────────────────────────────

/**
 * Resolves named styles to ANSI escape sequences.
 */
export class Theme {
  readonly name: string;
  private styles: Record<string, StyleDefinition>;
  private cache: Map<string, ResolvedStyle> = new Map();
  /** Whether color output is enabled (may be overridden per-style). */
  private colorEnabled: boolean;

  constructor(definition: ThemeDefinition, colorEnabled = true) {
    this.name = definition.name;
    this.styles = { ...definition.styles };
    this.colorEnabled = colorEnabled;
  }

  /**
   * Apply a named style to text. Returns styled string with ANSI codes.
   */
  apply(styleName: string, text: string): string {
    const resolved = this.resolve(styleName);
    if (!resolved.prefix) return text;
    return `${resolved.prefix}${text}${resolved.reset}`;
  }

  /**
   * Resolve a named style to prefix/reset ANSI codes.
   * Results are cached for performance.
   */
  resolve(styleName: string): ResolvedStyle {
    const cached = this.cache.get(styleName);
    if (cached) return cached;

    const definition = this.styles[styleName];
    if (!definition) {
      // Return empty style for unknown names
      const empty: ResolvedStyle = { prefix: "", reset: "" };
      this.cache.set(styleName, empty);
      return empty;
    }

    const codes: string[] = [];

    // Foreground color
    if (definition.fg) {
      const fgCode = resolveColor(definition.fg, true);
      if (fgCode) codes.push(fgCode);
    }

    // Background color
    if (definition.bg) {
      const bgCode = resolveColor(definition.bg, false);
      if (bgCode) codes.push(bgCode);
    }

    // Text attributes
    if (definition.bold) codes.push("\x1b[1m");
    if (definition.dim) codes.push("\x1b[2m");
    if (definition.italic) codes.push("\x1b[3m");
    if (definition.underline) codes.push("\x1b[4m");
    if (definition.strikethrough) codes.push("\x1b[9m");

    const styleEnabled = this.colorEnabled || definition.forceColor === true;

    const resolved: ResolvedStyle = {
      prefix: styleEnabled ? codes.join("") : "",
      reset: styleEnabled && codes.length > 0 ? "\x1b[0m" : "",
    };

    this.cache.set(styleName, resolved);
    return resolved;
  }

  /**
   * Invalidate the style cache (called when theme changes).
   */
  invalidate(): void {
    this.cache.clear();
  }
}

// ── Built-in default theme ─────────────────────────────────────────────

/**
 * The default "Dhara" theme. Used when no custom theme is provided.
 */
export const DEFAULT_THEME: ThemeDefinition = {
  name: "dhara-default",
  styles: {
    // ── Base text ──
    text: { fg: "#e0e0e0" },
    dim: { fg: "#6c6c6c" },
    bold: { bold: true },
    muted: { fg: "#888888", dim: true },

    // ── Chat messages ──
    "chat.user": { fg: "#50fa7b", bold: true },
    "chat.assistant": { fg: "#f8f8f2" },
    "chat.tool": { fg: "#ffb86c", italic: true },
    "chat.error": { fg: "#ff5555", bold: true },
    "chat.reasoning": { fg: "#6c6c6c", dim: true },
    "chat.thinking": { fg: "#bd93f9", italic: true },

    // ── Editor ──
    "editor.prompt": { fg: "#bd93f9", bold: true },
    "editor.text": { fg: "#f8f8f2" },
    "editor.cursor": { fg: "#282a36", bg: "#ff79c6" },

    // ── Status bar ──
    "status.bar": { fg: "#1e1e2e", bg: "#6272a4" },
    "status.model": { fg: "#1e1e2e", bg: "#6272a4", bold: true },
    "status.tokens": { fg: "#1e1e2e", bg: "#6272a4" },

    // ── Tool progress ──
    "tool.name": { fg: "#8be9fd", bold: true },
    "tool.output": { fg: "#f8f8f2" },
    "tool.diff.add": { fg: "#50fa7b" },
    "tool.diff.remove": { fg: "#ff5555" },

    // ── UI elements ──
    "panel.border": { fg: "#44475a" },
    "panel.title": { fg: "#bd93f9", bold: true },
    "overlay.bg": { fg: "#f8f8f2", bg: "#282a36" },
    "selector.active": { fg: "#282a36", bg: "#bd93f9" },
    "selector.inactive": { fg: "#6272a4" },
    loader: { fg: "#f1fa8c" },

    // ── Syntax highlighting ──
    "syntax.keyword": { fg: "#ff79c6", bold: true },
    "syntax.string": { fg: "#f1fa8c" },
    "syntax.comment": { fg: "#6272a4", italic: true },
    "syntax.number": { fg: "#bd93f9" },
    "syntax.function": { fg: "#50fa7b" },
    "syntax.type": { fg: "#8be9fd" },
    "syntax.operator": { fg: "#ff79c6" },
    "syntax.punctuation": { fg: "#f8f8f2" },
    "syntax.property": { fg: "#8be9fd" },
    "syntax.tag": { fg: "#ff79c6" },
    "syntax.attribute": { fg: "#50fa7b" },
    "syntax.plain": { fg: "#f8f8f2" },

    // ── Markdown ──
    "markdown.h1": { fg: "#bd93f9", bold: true },
    "markdown.h2": { fg: "#bd93f9", bold: true },
    "markdown.h3": { fg: "#bd93f9", bold: true },
    "markdown.bold": { bold: true },
    "markdown.italic": { italic: true },
    "markdown.code": { fg: "#f1fa8c" },
    "markdown.link": { fg: "#8be9fd", underline: true },
    "markdown.bullet": { fg: "#50fa7b" },
    "markdown.number": { fg: "#50fa7b" },
    "markdown.quote": { fg: "#6272a4", italic: true },

    // ── Tool call boxes ──
    "tool.box.border": { fg: "#44475a" },
    "tool.box.title": { fg: "#8be9fd", bold: true },
    "tool.box.icon": { fg: "#50fa7b" },
    "tool.box.path": { fg: "#f1fa8c" },
    "tool.box.meta": { fg: "#6272a4" },

    // ── Accent colors ──
    accent: { fg: "#bd93f9" },
    success: { fg: "#50fa7b" },
    warning: { fg: "#ffb86c" },
    error: { fg: "#ff5555" },
    info: { fg: "#8be9fd" },
  },
};
