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
 */
export interface FocusableComponent extends Component {
  /** Whether this component currently has focus. */
  focused: boolean;

  /**
   * Return the line and column indices where the cursor should be placed
   * when this component has focus. Returns null to hide the cursor.
   * @param width The render width (may affect wrapped line counts).
   */
  getCursorPosition?(width?: number): { line: number; column: number } | null;
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

const ESC = String.fromCharCode(27);
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;]*[a-zA-Z]`, "g");

/**
 * Measure the visible (printable) width of a string by stripping ANSI codes.
 */
export function visibleWidth(text: string): number {
  return text.replace(ANSI_RE, "").length;
}

/**
 * Truncate a string to fit within a visible width, preserving ANSI codes.
 */
export function truncateToWidth(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  const visible = text.replace(ANSI_RE, "");
  if (visible.length <= maxWidth) return text;

  // Walk character by character, tracking visible vs raw positions
  let visibleCount = 0;
  let rawIndex = 0;
  while (rawIndex < text.length && visibleCount < maxWidth) {
    if (text[rawIndex] === "\x1b") {
      // Skip the entire ANSI sequence
      rawIndex++;
      while (rawIndex < text.length && !/[a-zA-Z]/.test(text[rawIndex])) {
        rawIndex++;
      }
      rawIndex++; // skip the terminating letter
    } else {
      visibleCount++;
      rawIndex++;
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
