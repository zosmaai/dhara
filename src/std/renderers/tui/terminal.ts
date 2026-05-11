/**
 * Terminal abstraction for TUI rendering.
 *
 * Decouples the TUI engine from the actual terminal implementation,
 * enabling headless testing via {@link VirtualTerminal}.
 */
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
  /** Move cursor up by N lines. */
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
const SYNC_START = `${CSI}?2026h`;
const SYNC_END = `${CSI}?2026l`;

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
    if (
      this.started &&
      (oldCols !== this._columns || oldRows !== this._rows) &&
      this.onResizeCb
    ) {
      this.onResizeCb();
    }
  }

  start(onInput: (data: string) => void, onResize: () => void): void {
    if (this.started) return;
    this.started = true;
    this.onInputCb = onInput;
    this.onResizeCb = onResize;
    this.refreshSize();

    this.input.setRawMode(true);
    this.input.resume();
    this.input.setEncoding("utf-8");

    this.output.write(ALT_SCREEN_ENTER);
    this.output.write(BRACKETED_PASTE_START);
    this.output.write(CURSOR_HIDE);

    this.input.on("data", this.handleData);
    this.output.on("resize", this.handleResize);

    // Poll for resize on terminals that don't emit events
    this.resizeTimer = setInterval(() => this.refreshSize(), RESIZE_POLL_MS);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;

    if (this.resizeTimer) {
      clearInterval(this.resizeTimer);
      this.resizeTimer = null;
    }

    this.input.removeListener("data", this.handleData);
    this.output.removeListener("resize", this.handleResize);

    this.output.write(CURSOR_SHOW);
    this.output.write(BRACKETED_PASTE_END);
    this.output.write(ALT_SCREEN_EXIT);
    this.input.setRawMode(false);
    this.input.pause();
  }

  write(data: string): void {
    this.output.write(data);
  }

  moveBy(lines: number): void {
    if (lines > 0) {
      this.output.write(`${CSI}${lines}A`);
    } else if (lines < 0) {
      this.output.write(`${CSI}${-lines}B`);
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

  private handleData = (data: string): void => {
    this.onInputCb?.(data);
  };

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
    // We track cursor movements and content writes in a simplified way.
    // For testing, getViewport() is the primary inspection method.
    const lines = data.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i > 0) {
        // Newline
        this.cursorY = Math.min(this._rows - 1, this.cursorY + 1);
        this.cursorX = 0;
      }
      // Strip ANSI sequences from output for clean viewport
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
  return `${SYNC_START}${output}${SYNC_END}`;
}
