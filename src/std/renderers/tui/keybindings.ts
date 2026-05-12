/**
 * Configurable keybinding system.
 *
 * Keybindings map terminal input sequences to named actions.
 * Users can customize bindings via their theme or config.
 *
 * Default bindings follow readline/emacs conventions:
 * - Arrow keys: move cursor
 * - Ctrl+A/E: line start/end
 * - Alt+B/F: word back/forward
 * - Ctrl+K/U: kill line
 * - Ctrl+W: kill word
 * - Enter: submit (with Shift+Enter for newline)
 * - Tab: autocomplete
 */

/** A keybinding action identifier. */
export type KeyAction =
  | "cursor.left"
  | "cursor.right"
  | "cursor.up"
  | "cursor.down"
  | "cursor.home"
  | "cursor.end"
  | "cursor.wordLeft"
  | "cursor.wordRight"
  | "delete.left"
  | "delete.right"
  | "delete.wordLeft"
  | "delete.wordRight"
  | "delete.line"
  | "delete.toEnd"
  | "submit"
  | "newline"
  | "autocomplete"
  | "history.prev"
  | "history.next"
  | "paste"
  | "cancel"
  | "interrupt";

/** A keybinding entry: sequence → action. */
export interface KeyBinding {
  /** The raw terminal input sequence (e.g. "\\x1b[A" for up arrow, "\\r" for enter). */
  sequence: string;
  /** The action to trigger. */
  action: KeyAction;
  /** Optional description shown in help. */
  description?: string;
}

// ── ANSI escape sequences used by terminals ─────────────────────────────

const ESC = "\x1b";

// Arrow keys
const UP = `${ESC}[A`;
const DOWN = `${ESC}[B`;
const RIGHT = `${ESC}[C`;
const LEFT = `${ESC}[D`;

// Extended keys (some terminals send these)
const HOME = `${ESC}[H`;
const END = `${ESC}[F`;
const ALT_BACKSPACE = `${ESC}\x7f`;
const ALT_DEL = `${ESC}[3;3~`;

// Ctrl+arrow combinations (some terminals)
const CTRL_LEFT = `${ESC}[1;5D`;
const CTRL_RIGHT = `${ESC}[1;5C`;

/** Default keybindings. */
export const DEFAULT_KEYBINDINGS: KeyBinding[] = [
  // ── Cursor movement ──
  { sequence: LEFT, action: "cursor.left", description: "Move cursor left" },
  { sequence: RIGHT, action: "cursor.right", description: "Move cursor right" },
  { sequence: UP, action: "history.prev", description: "Previous history" },
  { sequence: DOWN, action: "history.next", description: "Next history" },
  { sequence: HOME, action: "cursor.home", description: "Move to line start" },
  { sequence: END, action: "cursor.end", description: "Move to line end" },
  { sequence: CTRL_LEFT, action: "cursor.wordLeft", description: "Move left by word" },
  { sequence: CTRL_RIGHT, action: "cursor.wordRight", description: "Move right by word" },

  // ── Ctrl combinations ──
  { sequence: "\x01", action: "cursor.home", description: "Ctrl+A: line start" },
  { sequence: "\x05", action: "cursor.end", description: "Ctrl+E: line end" },
  { sequence: "\x02", action: "cursor.left", description: "Ctrl+B: back one char" },
  { sequence: "\x06", action: "cursor.right", description: "Ctrl+F: forward one char" },
  { sequence: "\x08", action: "delete.left", description: "Ctrl+H: backspace" },
  { sequence: "\x7f", action: "delete.left", description: "Backspace" },
  { sequence: "\x04", action: "delete.right", description: "Ctrl+D: delete forward" },
  { sequence: "\x0b", action: "delete.toEnd", description: "Ctrl+K: kill to end of line" },
  { sequence: "\x15", action: "delete.line", description: "Ctrl+U: kill line" },
  { sequence: "\x17", action: "delete.wordLeft", description: "Ctrl+W: kill word" },
  { sequence: "\x0c", action: "autocomplete", description: "Ctrl+L: autocomplete" },
  { sequence: "\x03", action: "cancel", description: "Ctrl+C: cancel" },

  // ── Alt combinations ──
  { sequence: "\x1bb", action: "cursor.wordLeft", description: "Alt+B: word left" },
  { sequence: "\x1bf", action: "cursor.wordRight", description: "Alt+F: word right" },
  { sequence: ALT_BACKSPACE, action: "delete.wordLeft", description: "Alt+Backspace: kill word" },
  { sequence: ALT_DEL, action: "delete.wordRight", description: "Alt+Del: kill word forward" },

  // ── Enter/Return ──
  { sequence: "\r", action: "submit", description: "Enter: submit" },
  { sequence: "\n", action: "submit", description: "Enter: submit" },

  // ── Tab ──
  { sequence: "\t", action: "autocomplete", description: "Tab: autocomplete" },

  // ── CSI-u sequences (Kitty keyboard protocol) ──
  { sequence: "\x1b[13;1u", action: "submit", description: "Enter (CSI-u)" },
  { sequence: "\x1b[13;2u", action: "newline", description: "Shift+Enter (CSI-u)" },
  { sequence: "\x1b[27;1u", action: "cancel", description: "Escape (CSI-u)" },
  { sequence: "\x1b[127;1u", action: "delete.left", description: "Backspace (CSI-u)" },
  { sequence: "\x1b[9;1u", action: "autocomplete", description: "Tab (CSI-u)" },
  { sequence: "\x1b[A", action: "history.prev" },
  { sequence: "\x1b[B", action: "history.next" },
  { sequence: "\x1b[C", action: "cursor.right" },
  { sequence: "\x1b[D", action: "cursor.left" },
];

/**
 * Resolve a terminal input sequence to a key action.
 * Returns null if no binding matches.
 */
export function resolveBinding(bindings: KeyBinding[], data: string): KeyAction | null {
  for (const binding of bindings) {
    if (data === binding.sequence) {
      return binding.action;
    }
  }
  return null;
}

/** CSI-u sequence regex: ESC [ <codepoint> [ ; <mod> ] [ : <event> ] u */
const ESC_CHAR = String.fromCharCode(27);
const CSI_U_RE = new RegExp(`^${ESC_CHAR}\\[(\\d+)(?:;(\\d+))?(?::(\\d+))?u$`);

/**
 * Decode a Kitty CSI-u sequence into a printable character, if applicable.
 * When Kitty keyboard protocol is active, ALL keys arrive as CSI-u sequences,
 * including regular printable characters. This extracts the character.
 * Only accepts plain (mod=1) or Shift-modified keys.
 */
export function decodeKittyPrintable(data: string): string | undefined {
  const match = data.match(CSI_U_RE);
  if (!match) return undefined;

  const codepoint = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(codepoint)) return undefined;

  // modifier is 1-indexed in CSI-u: 1 = none, 2 = shift
  const modValue = match[2] ? Number.parseInt(match[2], 10) : 1;
  const modifier = modValue - 1;

  // Only accept plain or Shift-modified keys
  if (modifier & ~1) return undefined;
  if (codepoint < 32) return undefined;

  try {
    return String.fromCodePoint(codepoint);
  } catch {
    return undefined;
  }
}

/**
 * Decode any terminal sequence into a printable character, if applicable.
 * Handles Kitty CSI-u and xterm modifyOtherKeys formats.
 */
export function decodePrintableKey(data: string): string | undefined {
  return decodeKittyPrintable(data);
}

/**
 * Check if a sequence matches a Shift+Enter (newline) combination.
 * Different terminals send different sequences.
 */
export function isShiftEnter(data: string): boolean {
  return (
    data === `${ESC}[13;2~` || // xterm (CSI ~)
    data === `${ESC}[27;2;13~` || // kitty/foot (CSI ~)
    data === `${ESC}[13;2u` || // Ghostty/kitty protocol (CSI u)
    data === `${ESC}[13;2u\n` || // Ghostty (CSI u + newline variant)
    data === `${ESC}OM` || // old xterm
    data === "\x1b\x0d" || // ESC + CR
    data === "\x1b\x0a" || // ESC + LF
    data === "\x1b\r\n" // ESC + CRLF
  );
}

/**
 * Check if a sequence is printable text (not a control sequence).
 */
export function isPrintable(data: string): boolean {
  if (data.length === 0) return false;
  // Control characters and escape sequences are not printable
  const code = data.charCodeAt(0);
  if (code < 0x20 && code !== 0x09) return false; // Exclude tab
  if (code === 0x7f) return false; // DEL
  if (data.startsWith(ESC)) return false;
  return true;
}

/**
 * Merge user-defined keybindings with defaults.
 * User bindings take precedence.
 */
export function mergeBindings(defaults: KeyBinding[], user?: KeyBinding[]): KeyBinding[] {
  if (!user || user.length === 0) return defaults;

  const seen = new Set(user.map((b) => b.sequence));
  return [...user, ...defaults.filter((b) => !seen.has(b.sequence))];
}
