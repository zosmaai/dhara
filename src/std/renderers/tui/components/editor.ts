import {
  DEFAULT_KEYBINDINGS,
  type KeyAction,
  type KeyBinding,
  isPrintable,
  isShiftEnter,
  mergeBindings,
  resolveBinding,
} from "../keybindings.js";
import type { Theme } from "../theme.js";
/**
 * Editor component: multiline text input with readline/emacs keybindings.
 *
 * This is the primary user input component. It supports:
 * - Arrow key navigation (left/right/up/down within and across lines)
 * - Home/End, Ctrl+A/E for line start/end
 * - Alt+B/F for word navigation
 * - Ctrl+K/U/W for deletion
 * - Shift+Enter for newline insertion
 * - Enter for submit
 * - Tab for autocomplete
 * - History navigation (up/down)
 * - Paste with bracketed paste mode
 *
 * The editor is theme-aware via style names.
 */
import { type FocusableComponent, truncateToWidth, visibleWidth } from "./component.js";

export interface EditorConfig {
  /** Prompt text shown before the input line. */
  prompt?: string;
  /** Placeholder shown when input is empty. */
  placeholder?: string;
  /** Maximum number of lines before scrolling. */
  maxLines?: number;
  /** Theme style for the prompt. */
  promptStyle?: string;
  /** Theme style for the input text. */
  textStyle?: string;
  /** Theme style for the placeholder. */
  placeholderStyle?: string;
  /** Theme style for the cursor. */
  cursorStyle?: string;
  /** Custom keybindings merged with defaults. */
  keybindings?: KeyBinding[];
  /** Maximum history entries. */
  historySize?: number;
  /** Autocomplete provider. Returns completions for current input. */
  autocomplete?: (text: string) => string[];
}

export class Editor implements FocusableComponent {
  private theme: Theme;

  // ── State ──
  private lines: string[] = [""];
  /** Cursor line index (0-based within the editor, not the viewport). */
  private cursorLine = 0;
  /** Cursor column (0-based, visual position). */
  private cursorCol = 0;

  // ── Config ──
  private prompt: string;
  private placeholder: string;
  private promptStyle: string;
  private textStyle: string;
  private placeholderStyle: string;
  private bindings: KeyBinding[];
  private historySize: number;
  private autocompleteProvider?: (text: string) => string[];

  // ── History ──
  private history: string[] = [];
  private historyIndex = -1;
  private savedInput: { lines: string[]; cursorLine: number; cursorCol: number } | null = null;

  // ── Autocomplete ──
  private completions: string[] = [];
  private completionIndex = -1;
  private completionPrefix = "";

  /** Whether this editor has focus. */
  focused = false;

  /** Called when the user presses Enter (not Shift+Enter). */
  onSubmit?: (text: string) => void;

  /** Called when the input changes. */
  onChange?: (text: string) => void;

  constructor(theme: Theme, config: EditorConfig = {}) {
    this.theme = theme;
    this.prompt = config.prompt ?? "> ";
    this.placeholder = config.placeholder ?? "Type here...";
    this.promptStyle = config.promptStyle ?? "editor.prompt";
    this.textStyle = config.textStyle ?? "editor.text";
    this.placeholderStyle = config.placeholderStyle ?? "dim";
    this.bindings = mergeBindings(DEFAULT_KEYBINDINGS, config.keybindings);
    this.historySize = config.historySize ?? 100;
    this.autocompleteProvider = config.autocomplete;
  }

  // ── Public API ──

  /** Get the current input text (all lines joined with newlines). */
  getText(): string {
    return this.lines.join("\n");
  }

  /** Set the editor content programmatically. */
  setText(text: string): void {
    this.lines = text.split("\n");
    this.cursorLine = Math.min(this.cursorLine, this.lines.length - 1);
    this.cursorCol = Math.min(this.cursorCol, this.lines[this.cursorLine]?.length ?? 0);
  }

  /** Clear the editor and reset cursor. */
  clear(): void {
    this.lines = [""];
    this.cursorLine = 0;
    this.cursorCol = 0;
    this.completions = [];
    this.completionIndex = -1;
  }

  /** Add a line to history. Called on successful submit. */
  addHistory(text: string): void {
    if (text.trim() === "") return;
    // Don't add duplicate consecutive entries
    if (this.history.length > 0 && this.history[0] === text) return;
    this.history.unshift(text);
    if (this.history.length > this.historySize) {
      this.history.pop();
    }
    this.historyIndex = -1;
  }

  /** Get the combined text. */
  get value(): string {
    return this.getText();
  }

  // ── Component interface ──

  render(_width: number, _height?: number): string[] {
    const width = _width;
    const promptCode = this.theme.resolve(this.promptStyle);
    const textCode = this.theme.resolve(this.textStyle);
    const placeholderCode = this.theme.resolve(this.placeholderStyle);
    const borderStyle = this.theme.resolve("panel.border");
    const dimStyle = this.theme.resolve("dim");

    const result: string[] = [];
    const displayLines = this.getDisplayLines();

    // Top border
    result.push(borderStyle.prefix + "─".repeat(width) + borderStyle.reset);

    for (let i = 0; i < displayLines.length; i++) {
      const isFirstLine = i === 0;
      const lineContent = displayLines[i];

      if (isFirstLine) {
        const prefix = promptCode.prefix + this.prompt + promptCode.reset + textCode.prefix;
        const suffix = textCode.reset;
        const available = width - visibleWidth(this.prompt) - 2;

        if (lineContent === "" && this.lines.join("") === "" && !this.focused) {
          // Show placeholder when empty and unfocused
          result.push(
            ` ${promptCode.prefix}${this.prompt}${promptCode.reset}${placeholderCode.prefix}${truncateToWidth(this.placeholder, available)}${placeholderCode.reset}`,
          );
        } else {
          result.push(` ${prefix}${truncateToWidth(lineContent, available)}${suffix}`);
        }
      } else {
        // Continuation lines: indent same as prompt + space
        const indent = " ".repeat(visibleWidth(this.prompt) + 1);
        result.push(indent + truncateToWidth(lineContent, width - visibleWidth(this.prompt) - 1));
      }
    }

    // Multiline indicator
    if (this.lines.length > 1) {
      const mlIndicator = `${dimStyle.prefix}└ ${this.lines.length} lines — Shift+Enter for newline, Enter to submit${dimStyle.reset}`;
      result.push(` ${truncateToWidth(mlIndicator, width - 2)}`);
    }

    return result;
  }

  handleInput(data: string): boolean {
    // Shift+Enter: insert newline
    if (isShiftEnter(data)) {
      this.insertNewline();
      return true;
    }

    const action = resolveBinding(this.bindings, data);
    if (action) {
      return this.executeAction(action, data);
    }

    // Printable character
    if (isPrintable(data)) {
      this.insertText(data);
      return true;
    }

    return false;
  }

  invalidate(): void {
    // No cache to clear
  }

  getCursorPosition(): { line: number; column: number } | null {
    if (!this.focused) return null;
    // Calculate visual cursor position
    const promptLen = visibleWidth(this.prompt);
    // Cursor line within the viewport
    const visualLine = this.cursorLine;
    // Cursor column: prompt width + cursor position in current line
    const visualCol = visualLine === 0 ? promptLen + this.cursorCol : this.cursorCol;
    return { line: visualLine, column: visualCol };
  }

  // ── Get display lines (with wrapping applied) ──
  private getDisplayLines(): string[] {
    // For now, each internal line maps to one display line
    // TODO: wrap long lines
    return this.lines;
  }

  // ── Actions ──

  private executeAction(action: KeyAction, _data: string): boolean {
    switch (action) {
      case "cursor.left":
        return this.moveCursorLeft();
      case "cursor.right":
        return this.moveCursorRight();
      case "cursor.up":
        return this.cycleHistory("prev");
      case "cursor.down":
        return this.cycleHistory("next");
      case "cursor.home":
        return this.moveToLineStart();
      case "cursor.end":
        return this.moveToLineEnd();
      case "cursor.wordLeft":
        return this.moveWordLeft();
      case "cursor.wordRight":
        return this.moveWordRight();
      case "delete.left":
        return this.deleteBeforeCursor();
      case "delete.right":
        return this.deleteAtCursor();
      case "delete.wordLeft":
        return this.deleteWordLeft();
      case "delete.wordRight":
        return this.deleteWordRight();
      case "delete.line":
        return this.deleteLine();
      case "delete.toEnd":
        return this.deleteToEnd();
      case "submit":
        return this.handleSubmit();
      case "newline":
        this.insertNewline();
        return true;
      case "autocomplete":
        return this.doAutocomplete();
      case "history.prev":
        return this.cycleHistory("prev");
      case "history.next":
        return this.cycleHistory("next");
      case "cancel":
      case "interrupt":
        // Clears the current input
        this.clear();
        this.onChange?.("");
        return true;
      default:
        return false;
    }
  }

  // ── Cursor movement ──

  private moveCursorLeft(): boolean {
    if (this.cursorCol > 0) {
      this.cursorCol--;
    } else if (this.cursorLine > 0) {
      this.cursorLine--;
      this.cursorCol = this.lines[this.cursorLine].length;
    }
    return true;
  }

  private moveCursorRight(): boolean {
    const currentLine = this.lines[this.cursorLine] ?? "";
    if (this.cursorCol < currentLine.length) {
      this.cursorCol++;
    } else if (this.cursorLine < this.lines.length - 1) {
      this.cursorLine++;
      this.cursorCol = 0;
    }
    return true;
  }

  private moveToLineStart(): boolean {
    this.cursorCol = 0;
    return true;
  }

  private moveToLineEnd(): boolean {
    this.cursorCol = (this.lines[this.cursorLine] ?? "").length;
    return true;
  }

  private moveWordLeft(): boolean {
    const line = this.lines[this.cursorLine] ?? "";
    let col = this.cursorCol;

    // Skip non-word characters
    while (col > 0 && !this.isWordChar(line[col - 1])) {
      col--;
    }
    // Skip word characters
    while (col > 0 && this.isWordChar(line[col - 1])) {
      col--;
    }
    this.cursorCol = col;
    return true;
  }

  private moveWordRight(): boolean {
    const line = this.lines[this.cursorLine] ?? "";
    let col = this.cursorCol;

    // Skip word characters
    while (col < line.length && this.isWordChar(line[col])) {
      col++;
    }
    // Skip non-word characters
    while (col < line.length && !this.isWordChar(line[col])) {
      col++;
    }
    this.cursorCol = col;
    return true;
  }

  private isWordChar(ch: string | undefined): boolean {
    if (!ch) return false;
    return /[\w]/.test(ch);
  }

  // ── Deletion ──

  private deleteBeforeCursor(): boolean {
    if (this.cursorCol > 0) {
      const line = this.lines[this.cursorLine];
      this.lines[this.cursorLine] = line.slice(0, this.cursorCol - 1) + line.slice(this.cursorCol);
      this.cursorCol--;
      this.onChange?.(this.getText());
    } else if (this.cursorLine > 0) {
      // Join with previous line
      const prevLine = this.lines[this.cursorLine - 1];
      const currentLine = this.lines[this.cursorLine];
      this.cursorCol = prevLine.length;
      this.lines[this.cursorLine - 1] = prevLine + currentLine;
      this.lines.splice(this.cursorLine, 1);
      this.cursorLine--;
      this.onChange?.(this.getText());
    }
    return true;
  }

  private deleteAtCursor(): boolean {
    const line = this.lines[this.cursorLine] ?? "";
    if (this.cursorCol < line.length) {
      this.lines[this.cursorLine] = line.slice(0, this.cursorCol) + line.slice(this.cursorCol + 1);
      this.onChange?.(this.getText());
    } else if (this.cursorLine < this.lines.length - 1) {
      // Join with next line
      const nextLine = this.lines[this.cursorLine + 1];
      this.lines[this.cursorLine] = line + nextLine;
      this.lines.splice(this.cursorLine + 1, 1);
      this.onChange?.(this.getText());
    }
    return true;
  }

  private deleteWordLeft(): boolean {
    const line = this.lines[this.cursorLine] ?? "";
    const oldCol = this.cursorCol;
    this.moveWordLeft();
    const newCol = this.cursorCol;
    this.lines[this.cursorLine] = line.slice(0, newCol) + line.slice(oldCol);
    this.cursorCol = newCol;
    this.onChange?.(this.getText());
    return true;
  }

  private deleteWordRight(): boolean {
    const line = this.lines[this.cursorLine] ?? "";
    const oldCol = this.cursorCol;
    this.moveWordRight();
    const newCol = this.cursorCol;
    this.lines[this.cursorLine] = line.slice(0, oldCol) + line.slice(newCol);
    this.cursorCol = oldCol;
    this.onChange?.(this.getText());
    return true;
  }

  private deleteLine(): boolean {
    this.lines[this.cursorLine] = "";
    this.cursorCol = 0;
    this.onChange?.(this.getText());
    return true;
  }

  private deleteToEnd(): boolean {
    const line = this.lines[this.cursorLine] ?? "";
    this.lines[this.cursorLine] = line.slice(0, this.cursorCol);
    this.onChange?.(this.getText());
    return true;
  }

  // ── Text insertion ──

  private insertText(text: string): void {
    const line = this.lines[this.cursorLine] ?? "";
    this.lines[this.cursorLine] = line.slice(0, this.cursorCol) + text + line.slice(this.cursorCol);
    this.cursorCol += text.length;
    this.completions = [];
    this.completionIndex = -1;
    this.onChange?.(this.getText());
  }

  private insertNewline(): void {
    const line = this.lines[this.cursorLine] ?? "";
    const before = line.slice(0, this.cursorCol);
    const after = line.slice(this.cursorCol);
    this.lines[this.cursorLine] = before;
    this.lines.splice(this.cursorLine + 1, 0, after);
    this.cursorLine++;
    this.cursorCol = 0;
    this.onChange?.(this.getText());
  }

  // ── Submit ──

  private handleSubmit(): boolean {
    const text = this.getText();
    if (text.trim() === "") return true; // Don't submit empty

    // Save to history
    this.addHistory(text);

    // Notify
    const cb = this.onSubmit;
    this.clear();
    this.onChange?.("");

    if (cb) {
      // Use setImmediate to let render happen first
      setImmediate(() => cb(text));
    }

    return true;
  }

  // ── History navigation ──

  private cycleHistory(direction: "prev" | "next"): boolean {
    if (this.history.length === 0) return true;

    // Save current input when starting history navigation
    if (this.historyIndex === -1) {
      this.savedInput = {
        lines: [...this.lines],
        cursorLine: this.cursorLine,
        cursorCol: this.cursorCol,
      };
    }

    if (direction === "prev") {
      if (this.historyIndex < this.history.length - 1) {
        this.historyIndex++;
      }
    } else {
      if (this.historyIndex > -1) {
        this.historyIndex--;
      }
    }

    if (this.historyIndex === -1) {
      // Restore saved input
      if (this.savedInput) {
        this.lines = this.savedInput.lines;
        this.cursorLine = this.savedInput.cursorLine;
        this.cursorCol = this.savedInput.cursorCol;
        this.savedInput = null;
      }
    } else {
      const entry = this.history[this.historyIndex];
      this.lines = entry.split("\n");
      this.cursorLine = this.lines.length - 1;
      this.cursorCol = this.lines[this.cursorLine].length;
    }

    this.onChange?.(this.getText());
    return true;
  }

  // ── Autocomplete ──

  private doAutocomplete(): boolean {
    if (!this.autocompleteProvider) return true;

    const text = this.getText();
    if (text.trim() === "") return true;

    if (this.completions.length === 0 || this.completionPrefix !== text) {
      this.completionPrefix = text;
      this.completions = this.autocompleteProvider(text);
      this.completionIndex = 0;
    } else {
      this.completionIndex = (this.completionIndex + 1) % this.completions.length;
    }

    if (this.completions.length > 0) {
      const completion = this.completions[this.completionIndex];
      this.setText(completion);
      this.onChange?.(completion);
    }

    return true;
  }
}
