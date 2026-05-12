/**
 * Terminal abstraction for TUI rendering.
 *
 * Decouples the TUI engine from the actual terminal implementation,
 * enabling headless testing via {@link VirtualTerminal}.
 *
 * ProcessTerminal follows pi-tui's approach:
 * - StdinBuffer: splits batched input into individual sequences
 * - Kitty keyboard protocol query with proper response handling
 * - Bracketed paste detection via StdinBuffer
 * - Write logging via PI_TUI_WRITE_LOG env var
 */
import { StdinBuffer } from "./stdin-buffer.js";

export interface Terminal {
  /** Start listening for input. Calls onInput for each chunk of terminal data. */
  start(onInput: (data: string) => void, onResize: () => void): void;
  /** Stop listening and restore terminal state. */
  stop(): void;
  /** Write raw data to the terminal. */
  write(data: string): void;
  /** Current terminal width in columns. */
  readonly columns: number;
  /** Current terminal height in rows. */
  readonly rows: number;
  /** Move cursor by N lines (positive = up, negative = down). */
  moveBy(lines: number): void;
  /** Hide the cursor. */
  hideCursor(): void;
  /** Show the cursor. */
  showCursor(): void;
  /** Clear the current line from cursor position. */
  clearLine(): void;
  /** Clear from cursor position to end of screen. */
  clearFromCursor(): void;
  /** Clear the entire screen and move cursor to top-left. */
  clearScreen(): void;
}

// ── ANSI escape sequences ──────────────────────────────────────────────

const CSI = "\x1b[";

const CURSOR_HIDE = `${CSI}?25l`;
const CURSOR_SHOW = `${CSI}?25h`;
const CLEAR_LINE = `${CSI}2K`;
const CLEAR_FROM_CURSOR = `${CSI}0J`;
const CLEAR_SCREEN = `${CSI}2J${CSI}H`;

const BRACKETED_PASTE_START = `${CSI}?2004h`;
const BRACKETED_PASTE_END = `${CSI}?2004l`;
const ALT_SCREEN_ENTER = `${CSI}?1049h`;
const ALT_SCREEN_EXIT = `${CSI}?1049l`;

const RESIZE_POLL_MS = 50;

/**
 * Terminal implementation backed by process.stdin/stdout.
 *
 * Enters raw mode on `start()`, restores on `stop()`.
 * Uses StdinBuffer to split batched input into individual sequences.
 * Queries and enables Kitty keyboard protocol for proper detection
 * of modified keys (Shift+Enter, Ctrl+arrows, etc.).
 */
export class ProcessTerminal implements Terminal {
  private input = process.stdin;
  private output = process.stdout;
  private onInputCb: ((data: string) => void) | null = null;
  private onResizeCb: (() => void) | null = null;
  private resizeTimer: ReturnType<typeof setInterval> | null = null;
  private _columns = 0;
  private _rows = 0;
  private started = false;

  /** Previous raw mode state for proper restore. */
  private wasRaw = false;

  /** Whether Kitty keyboard protocol is active. */
  private kittyProtocolActive = false;
  /** Whether xterm modifyOtherKeys mode was enabled as fallback. */
  private modifyOtherKeysActive = false;

  /** StdinBuffer for splitting input into individual sequences. */
  private stdinBuffer: StdinBuffer | null = null;
  private stdinDataHandler: ((data: string) => void) | null = null;

  get columns(): number {
    return this._columns || this.output.columns || 80;
  }

  get rows(): number {
    return this._rows || this.output.rows || 24;
  }

  private refreshSize(): void {
    const oldCols = this._columns;
    const oldRows = this._rows;
    this._columns = this.output.columns || 80;
    this._rows = this.output.rows || 24;
    if (this.started && (oldCols !== this._columns || oldRows !== this._rows) && this.onResizeCb) {
      this.onResizeCb();
    }
  }

  start(onInput: (data: string) => void, onResize: () => void): void {
    if (this.started) return;
    this.started = true;
    this.onInputCb = onInput;
    this.onResizeCb = onResize;
    this.refreshSize();

    // Save previous raw mode state
    this.wasRaw = this.input.isRaw || false;

    // Enable raw mode
    this.input.setRawMode(true);
    this.input.resume();
    this.input.setEncoding("utf-8");

    // Enter alt-screen, enable bracketed paste, hide cursor
    this.output.write(ALT_SCREEN_ENTER);
    this.output.write(BRACKETED_PASTE_START);
    this.output.write(CURSOR_HIDE);

    // Set up resize handler
    this.output.on("resize", this.handleResize);

    // Refresh terminal dimensions — they may be stale after suspend/resume
    // (SIGWINCH is lost while process is stopped). Unix only.
    if (process.platform !== "win32") {
      process.kill(process.pid, "SIGWINCH");
    }

    // Poll for resize on terminals that don't emit events
    this.resizeTimer = setInterval(() => this.refreshSize(), RESIZE_POLL_MS);

    // Query and enable Kitty keyboard protocol via StdinBuffer
    this.setupStdinBuffer();
  }

  /**
   * Set up StdinBuffer to split batched input into individual sequences.
   * Also handles Kitty protocol response detection.
   */
  private setupStdinBuffer(): void {
    this.stdinBuffer = new StdinBuffer();

    // Kitty protocol response pattern: ESC [ ? <flags> u
    const kittyResponsePattern = new RegExp(`^${String.fromCharCode(27)}\\[\\?(\\d+)u$`);

    // Forward individual sequences to the input handler, with Kitty response detection
    this.stdinBuffer.on("data", (sequence: string) => {
      if (!this.kittyProtocolActive) {
        const match = sequence.match(kittyResponsePattern);
        if (match) {
          this.kittyProtocolActive = true;
          // Enable Kitty keyboard protocol (push flags 1+2+4)
          // 1 = disambiguate escape codes
          // 2 = report event types (press/repeat/release)
          // 4 = report alternate keys
          this.output.write(`${CSI}>7u`);
          return; // Don't forward protocol response
        }
      }
      this.onInputCb?.(sequence);
    });

    // Re-wrap paste content with bracketed paste markers for existing editor handling
    this.stdinBuffer.on("paste", (content: string) => {
      this.onInputCb?.(`\x1b[200~${content}\x1b[201~`);
    });

    // Pipe stdin through the buffer
    this.stdinDataHandler = (data: string) => {
      this.stdinBuffer?.process(data);
    };

    this.input.on("data", this.stdinDataHandler);

    // Query Kitty protocol support
    this.output.write(`${CSI}?u`);

    // Fallback: if no kitty response after 150ms, use modifyOtherKeys
    setTimeout(() => {
      if (!this.kittyProtocolActive && !this.modifyOtherKeysActive) {
        this.output.write(`${CSI}>4;2m`);
        this.modifyOtherKeysActive = true;
      }
    }, 150);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;

    if (this.resizeTimer) {
      clearInterval(this.resizeTimer);
      this.resizeTimer = null;
    }

    // Clean up StdinBuffer
    if (this.stdinBuffer) {
      this.stdinBuffer.destroy();
      this.stdinBuffer = null;
    }

    if (this.stdinDataHandler) {
      this.input.removeListener("data", this.stdinDataHandler);
      this.stdinDataHandler = null;
    }

    this.output.removeListener("resize", this.handleResize);

    // Disable Kitty protocol if active
    if (this.kittyProtocolActive) {
      this.output.write(`${CSI}<u`);
      this.kittyProtocolActive = false;
    }
    if (this.modifyOtherKeysActive) {
      this.output.write(`${CSI}>4;0m`);
      this.modifyOtherKeysActive = false;
    }

    this.output.write(CURSOR_SHOW);
    this.output.write(BRACKETED_PASTE_END);
    this.output.write(ALT_SCREEN_EXIT);
    this.input.setRawMode(this.wasRaw);
    this.input.pause();
  }

  write(data: string): void {
    this.output.write(data);
  }

  moveBy(lines: number): void {
    if (lines > 0) {
      this.output.write(`${CSI}${lines}A`); // Cursor Up
    } else if (lines < 0) {
      this.output.write(`${CSI}${-lines}B`); // Cursor Down
    }
  }

  hideCursor(): void {
    this.output.write(CURSOR_HIDE);
  }

  showCursor(): void {
    this.output.write(CURSOR_SHOW);
  }

  clearLine(): void {
    this.output.write(CLEAR_LINE);
  }

  clearFromCursor(): void {
    this.output.write(CLEAR_FROM_CURSOR);
  }

  clearScreen(): void {
    this.output.write(CLEAR_SCREEN);
  }

  // ── Event handlers (arrow functions for stable binding) ─────────

  private handleResize = (): void => {
    this.refreshSize();
  };
}

// ── VirtualTerminal for testing ─────────────────────────────────────────

/**
 * A headless {@link Terminal} for testing TUI components.
 *
 * Simulates terminal input/output without a real TTY.
 */
export class VirtualTerminal implements Terminal {
  private _columns: number;
  private _rows: number;
  private _buffer: string[][] = [];
  private onInputCb: ((data: string) => void) | null = null;
  private onResizeCb: (() => void) | null = null;
  private cursorX = 0;
  private cursorY = 0;

  /** All data written to this terminal, joined as a single string. */
  output = "";

  constructor(width = 80, height = 24) {
    this._columns = width;
    this._rows = height;
    this._initBuffer();
  }

  private _initBuffer(): void {
    this._buffer = Array.from({ length: this._rows }, () =>
      Array.from({ length: this._columns }, () => " "),
    );
    this.cursorX = 0;
    this.cursorY = 0;
  }

  get columns(): number {
    return this._columns;
  }
  get rows(): number {
    return this._rows;
  }

  /** Resize the virtual terminal. Triggers onResize callback. */
  resize(width: number, height: number): void {
    this._columns = width;
    this._rows = height;
    this._initBuffer();
    this.onResizeCb?.();
  }

  start(onInput: (data: string) => void, onResize: () => void): void {
    this.onInputCb = onInput;
    this.onResizeCb = onResize;
  }

  stop(): void {
    this.onInputCb = null;
    this.onResizeCb = null;
  }

  write(data: string): void {
    this.output += data;
    this._processAnsi(data);
  }

  /** Simulate user typing input. */
  feedInput(data: string): void {
    this.onInputCb?.(data);
  }

  /** Get the visible viewport as an array of trimmed strings. */
  getViewport(): string[] {
    return this._buffer.map((row) => row.join("").trimEnd());
  }

  // ── Cursor control ──────────────────────────────────────────────

  moveBy(lines: number): void {
    this.cursorY = Math.max(0, Math.min(this._rows - 1, this.cursorY - lines));
  }

  hideCursor(): void {
    // No-op: VirtualTerminal doesn't render cursor
  }
  showCursor(): void {
    // No-op: VirtualTerminal doesn't render cursor
  }

  clearLine(): void {
    this._buffer[this.cursorY] = Array.from({ length: this._columns }, () => " ");
  }

  clearFromCursor(): void {
    for (let y = this.cursorY; y < this._rows; y++) {
      this._buffer[y] = Array.from({ length: this._columns }, () => " ");
    }
  }

  clearScreen(): void {
    this._initBuffer();
  }

  // ── Minimal ANSI parsing ────────────────────────────────────────

  private _processAnsi(data: string): void {
    const lines = data.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i > 0) {
        this.cursorY = Math.min(this._rows - 1, this.cursorY + 1);
        this.cursorX = 0;
      }
      const ESC_CHAR = String.fromCharCode(27);
      const ansiCleanRegex = new RegExp(`${ESC_CHAR}\\[[0-9;]*[a-zA-Z]`, "g");
      const clean = line.replace(ansiCleanRegex, "");
      if (clean && this.cursorY < this._rows) {
        for (let j = 0; j < clean.length && this.cursorX + j < this._columns; j++) {
          this._buffer[this.cursorY][this.cursorX + j] = clean[j];
        }
      }
    }
  }
}

/**
 * Wrap output in synchronized update markers for flicker-free rendering.
 */
export function synchronized(output: string): string {
  return `\x1b[?2026h${output}\x1b[?2026l`;
}
