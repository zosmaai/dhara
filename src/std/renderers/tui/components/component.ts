/**
 * TUI component interface and base classes.
 *
 * Inspired by pi-tui's retained-mode Component model, but with
 * theme integration via named style references.
 */
import type { Theme } from "../theme.js";

// ── Component interface ────────────────────────────────────────────────

/**
 * A renderable TUI component.
 *
 * Components are retained-mode: the TUI engine calls `render()`
 * each frame and diffs the output against the previous frame.
 */
export interface Component {
  /**
   * Render this component to an array of strings, one per line.
   * Each line **must not exceed** the given `width`.
   * If `height` is provided, the component should fill that many rows.
   */
  render(width: number, height?: number): string[];

  /**
   * Handle keyboard input when this component has focus.
   * `data` is raw terminal input (may include ANSI escape sequences).
   * Return `true` if the input was consumed (suppresses default handling).
   */
  handleInput?(data: string): boolean;

  /** Clear any cached render state. Called after theme/style changes. */
  invalidate(): void;
}

/**
 * Component that can receive focus for keyboard input.
 *
 * Cursor positioning is handled automatically via the CURSOR_MARKER
 * mechanism: focused components embed a zero-width marker at the cursor
 * position in their render() output, and the TUI engine extracts it.
 * See tui.ts for the CURSOR_MARKER constant.
 */
export interface FocusableComponent extends Component {
  /** Whether this component currently has focus. */
  focused: boolean;
}

// ── Base component with theme reference ────────────────────────────────

/**
 * Base class for components that use the theme system.
 *
 * Subclasses call {@link style} or {@link styled} to apply theme styles
 * by name rather than receiving raw ANSI codes.
 */
export abstract class ThemedComponent implements Component {
  protected theme: Theme;

  constructor(theme: Theme) {
    this.theme = theme;
  }

  abstract render(width: number): string[];

  handleInput?(_data: string): boolean;

  invalidate(): void {
    // Default: do nothing. Subclasses override to clear caches.
  }

  /**
   * Apply a named theme style to text.
   * Returns the text wrapped in ANSI codes from the theme.
   */
  protected style(name: string, text: string): string {
    return this.theme.apply(name, text);
  }

  /**
   * Resolve a named style to raw ANSI codes (prefix) and reset (suffix).
   * Useful for multi-line rendering where you need to re-apply per line.
   */
  protected styleCodes(name: string): { prefix: string; reset: string } {
    return this.theme.resolve(name);
  }
}

// ── Utility: measure visible width (strip ANSI) ────────────────────────

const ESC = "\x1b";

/**
 * Strip ALL ANSI escape sequences from a string.
 * Handles CSI (ESC [ ...), OSC (ESC ] ...), APC (ESC _ ...), SS3 (ESC O).
 */
function stripAnsi(text: string): string {
  let result = "";
  let i = 0;

  while (i < text.length) {
    if (text[i] !== ESC) {
      result += text[i];
      i++;
      continue;
    }

    // ESC found — determine sequence type
    if (i + 1 >= text.length) {
      i++;
      continue;
    }

    const next = text[i + 1];
    if (!next) {
      i++;
      continue;
    }

    if (next === "[") {
      // CSI: ESC [ <params> <final> (final byte 0x40-0x7E)
      let j = i + 2;
      while (j < text.length) {
        const code = text.charCodeAt(j);
        if (code >= 0x40 && code <= 0x7e) {
          i = j + 1;
          break;
        }
        j++;
      }
      if (j >= text.length) i = text.length; // unterminated
    } else if (next === "]") {
      // OSC: ESC ] ... BEL (\x07) or ESC ] ... ST (ESC \)
      let j = i + 2;
      while (j < text.length) {
        if (text[j] === "\x07") {
          i = j + 1;
          break;
        }
        if (text[j] === ESC && j + 1 < text.length && text[j + 1] === "\\") {
          i = j + 2;
          break;
        }
        j++;
      }
      if (j >= text.length) i = text.length;
    } else if (next === "_") {
      // APC: ESC _ ... BEL or ESC _ ... ST
      let j = i + 2;
      while (j < text.length) {
        if (text[j] === "\x07") {
          i = j + 1;
          break;
        }
        if (text[j] === ESC && j + 1 < text.length && text[j + 1] === "\\") {
          i = j + 2;
          break;
        }
        j++;
      }
      if (j >= text.length) i = text.length;
    } else if (next === "O") {
      // SS3: ESC O <char> (3 bytes)
      i += 3;
    } else {
      // Two-byte escape: ESC <char>
      i += 2;
    }
  }

  return result;
}

/**
 * Measure the visible (printable) width of a string by stripping ANSI codes.
 */
export function visibleWidth(text: string): number {
  return stripAnsi(text).length;
}

/**
 * Truncate a string to fit within a visible width, preserving ANSI codes.
 */
export function truncateToWidth(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  const visible = stripAnsi(text);
  if (visible.length <= maxWidth) return text;

  // Walk character by character, tracking visible vs raw positions
  let visibleCount = 0;
  let rawIndex = 0;
  while (rawIndex < text.length && visibleCount < maxWidth) {
    if (text[rawIndex] !== ESC) {
      visibleCount++;
      rawIndex++;
      continue;
    }

    // ESC sequence — skip entirely
    if (rawIndex + 1 >= text.length) {
      rawIndex++;
      continue;
    }
    const next = text[rawIndex + 1];
    if (!next) {
      rawIndex += 2;
      continue;
    }
    if (next === "[") {
      // CSI
      let j = rawIndex + 2;
      while (j < text.length) {
        const code = text.charCodeAt(j);
        if (code >= 0x40 && code <= 0x7e) {
          rawIndex = j + 1;
          break;
        }
        j++;
      }
      if (j >= text.length) rawIndex = text.length;
    } else if (next === "]") {
      // OSC
      let j = rawIndex + 2;
      while (j < text.length) {
        if (text[j] === "\x07") {
          rawIndex = j + 1;
          break;
        }
        if (text[j] === ESC && j + 1 < text.length && text[j + 1] === "\\") {
          rawIndex = j + 2;
          break;
        }
        j++;
      }
      if (j >= text.length) rawIndex = text.length;
    } else if (next === "_") {
      // APC
      let j = rawIndex + 2;
      while (j < text.length) {
        if (text[j] === "\x07") {
          rawIndex = j + 1;
          break;
        }
        if (text[j] === ESC && j + 1 < text.length && text[j + 1] === "\\") {
          rawIndex = j + 2;
          break;
        }
        j++;
      }
      if (j >= text.length) rawIndex = text.length;
    } else if (next === "O") {
      rawIndex += 3; // SS3
    } else {
      rawIndex += 2; // Two-byte escape
    }
  }
  return text.slice(0, rawIndex);
}

/**
 * Pad a string to a minimum visible width.
 */
export function padToWidth(text: string, minWidth: number): string {
  const current = visibleWidth(text);
  if (current >= minWidth) return text;
  return text + " ".repeat(minWidth - current);
}
