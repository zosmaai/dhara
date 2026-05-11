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

/**
 * Check if a sequence matches a Shift+Enter (newline) combination.
 * Different terminals send different sequences.
 */
export function isShiftEnter(data: string): boolean {
  return data === `${ESC}[13;2~` || data === `${ESC}OM` || data === "\x1b\x0d";
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
