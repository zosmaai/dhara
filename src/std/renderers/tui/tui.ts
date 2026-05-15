/**
 * TUI rendering engine with differential rendering.
 *
 * Uses the CURSOR_MARKER approach from pi-tui: focused components embed
 * a zero-width marker at the cursor position in their rendered output,
 * and the engine extracts it automatically for hardware cursor positioning.
 * This avoids fragile separate cursor-position calculations.
 *
 * Viewport model:
 * - Content lines are NOT padded to terminal height.
 * - Lines track the natural length of rendered content.
 * - viewportTop indicates which portion of the content buffer is visible.
 * - When content exceeds terminal height, viewportTop shows the bottom
 *   portion (scroll-to-bottom behavior for chat).
 * - hardwareCursorRow tracks the actual terminal cursor position
 *   (screen-relative), separate from the logical content cursor.
 */
import type { Component, FocusableComponent } from "./components/component.js";
import { visibleWidth } from "./components/component.js";
import type { Terminal } from "./terminal.js";
import { synchronized } from "./terminal.js";

// ── Cursor marker ──────────────────────────────────────────────────────

/**
 * Zero-width APC (Application Program Command) sequence embedded by
 * focused components at the cursor position. The renderer finds this
 * marker, strips it from the output, and positions the hardware cursor.
 */
export const CURSOR_MARKER = "\x1b_pi:c\x07";

// ── Types ──────────────────────────────────────────────────────────────

export interface OverlayHandle {
  hide(): void;
}

interface OverlayEntry {
  component: Component;
  handle: OverlayHandle;
}

/**
 * Full SGR reset + OSC 8 reset appended to every rendered line
 * to prevent style/hyperlink bleed into the next line.
 * Matches pi-tui's approach.
 */
const SEGMENT_RESET = "\x1b[0m\x1b]8;;\x07";

// SGR mouse tracking
const ESC = String.fromCharCode(27);
/** SGR mouse sequence pattern: ESC [ < btn ; col ; row M|m */
const SGR_MOUSE_RE = new RegExp(`^${ESC}\\[<(\\d+);(\\d+);(\\d+)([Mm])$`);
/** Mouse scroll button codes in SGR protocol */
const MOUSE_SCROLL_UP = 64;
const MOUSE_SCROLL_DOWN = 65;

// ── TUI class ──────────────────────────────────────────────────────────

export class TUI {
  private terminal: Terminal;
  private root: Component | null = null;
  private focusedComponent: FocusableComponent | null = null;
  private overlays: OverlayEntry[] = [];

  // Rendering state
  private previousLines: string[] = [];
  private started = false;
  private stopped = false;
  private renderRequested = false;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRenderAt = 0;
  private static readonly MIN_RENDER_INTERVAL_MS = 16;

  /**
   * Actual terminal cursor row (0-indexed from terminal top).
   * Tracks where the hardware cursor actually is on screen (screen-relative).
   * Used for accurate viewport-relative cursor movement.
   */
  private hardwareCursorRow = 0;

  /**
   * How many lines the user has scrolled up from the bottom.
   * 0 = at bottom (auto-scroll mode).
   * >0 = scrolled up by N lines.
   */
  private scrollOffset = 0;

  /**
   * The top line of the visible viewport in the content buffer.
   * When content exceeds terminal height, this shifts up so the
   * bottom of content stays visible (auto-scroll behavior).
   */
  private viewportTop = 0;

  /**
   * High-water mark of lines ever rendered. Used to know how much
   * of the terminal working area needs clearing when content shrinks.
   */
  private maxLinesRendered = 0;

  // Input handling
  private inputBuffer = "";
  private pasteActive = false;

  /** Number of full redraws performed (useful for testing). */
  fullRedraws = 0;

  /** Callback for debug key (default: Shift+Ctrl+D). */
  onDebug?: () => void;

  /** Callback before the TUI shuts down. */
  onShutdown?: () => void;

  constructor(terminal: Terminal) {
    this.terminal = terminal;
  }

  // ── Public API ──────────────────────────────────────────────────────

  setRoot(component: Component): void {
    this.root = component;
  }

  focus(component: FocusableComponent | null): void {
    if (this.focusedComponent) {
      this.focusedComponent.focused = false;
    }
    this.focusedComponent = component;
    if (component) {
      component.focused = true;
    }
  }

  showOverlay(component: Component): OverlayHandle {
    let hidden = false;
    const entry: OverlayEntry = {
      component,
      handle: {
        hide: () => {
          if (!hidden) {
            hidden = true;
            this.overlays = this.overlays.filter((e) => e !== entry);
            this.requestRender();
          }
        },
      },
    };
    this.overlays.push(entry);
    this.requestRender();
    return entry.handle;
  }

  requestRender(): void {
    if (!this.started) return;
    if (this.renderRequested) return;
    this.renderRequested = true;
    process.nextTick(() => this.scheduleRender());
  }

  private scheduleRender(): void {
    if (this.stopped || this.renderTimer || !this.renderRequested) {
      return;
    }
    const elapsed = performance.now() - this.lastRenderAt;
    const delay = Math.max(0, TUI.MIN_RENDER_INTERVAL_MS - elapsed);
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      if (this.stopped || !this.renderRequested) {
        return;
      }
      this.renderRequested = false;
      this.lastRenderAt = performance.now();
      this.render();
      if (this.renderRequested) {
        this.scheduleRender();
      }
    }, delay);
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    this.terminal.start(
      (data) => this.handleInput(data),
      () => this.handleResize(),
    );

    this.render();
  }

  stop(): void {
    if (!this.started) return;
    this.stopped = true;

    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }

    this.onShutdown?.();

    // Move cursor past rendered content before clearing
    if (this.maxLinesRendered > 0) {
      const lineDiff = this.maxLinesRendered - this.hardwareCursorRow;
      if (lineDiff > 0) {
        this.terminal.write(`\x1b[${lineDiff}B`);
      }
      this.terminal.write("\r\n");
    }

    this.terminal.clearScreen();
    this.terminal.showCursor();
    this.terminal.stop();

    this.started = false;
    this.previousLines = [];
    this.maxLinesRendered = 0;
    this.viewportTop = 0;
    this.hardwareCursorRow = 0;
  }

  // ── Input handling ──────────────────────────────────────────────────

  private handleInput(data: string): void {
    if (data === "\x1b[200~") {
      this.pasteActive = true;
      this.inputBuffer = "";
      return;
    }
    if (data === "\x1b[201~") {
      this.pasteActive = false;
      const text = this.inputBuffer;
      this.inputBuffer = "";
      for (const char of text) {
        this.dispatchInput(char);
      }
      return;
    }

    if (this.pasteActive) {
      this.inputBuffer += data;
      return;
    }

    this.dispatchInput(data);
  }

  private dispatchInput(data: string): void {
    // Check for SGR mouse events (scroll wheel clicks, mouse clicks)
    const mouseMatch = data.match(SGR_MOUSE_RE);
    if (mouseMatch) {
      const btn = Number.parseInt(mouseMatch[1], 10);
      if (btn === MOUSE_SCROLL_UP || btn === MOUSE_SCROLL_DOWN) {
        this.handleMouseScroll(btn);
      }
      // Other mouse button events are ignored for now
      return;
    }

    if (data === "\x04" && this.onDebug) {
      this.onDebug();
      return;
    }

    if (this.focusedComponent?.handleInput) {
      this.focusedComponent.handleInput(data);
      this.requestRender();
      return;
    }

    if (this.root?.handleInput) {
      this.root.handleInput(data);
      this.requestRender();
    }
  }

  private handleResize(): void {
    // Force full re-render on resize since width changes alter line wrapping
    this.previousLines = [];
    this.render();
  }

  // ── Cursor marker extraction ────────────────────────────────────────

  /**
   * Find CURSOR_MARKER in rendered lines, strip it, and return
   * the position where the hardware cursor should be placed.
   * Returns null if no marker is found.
   */
  private extractCursorPosition(lines: string[]): { row: number; col: number } | null {
    for (let row = 0; row < lines.length; row++) {
      const line = lines[row];
      const idx = line.indexOf(CURSOR_MARKER);
      if (idx !== -1) {
        const col = visibleWidth(line.slice(0, idx));
        // Remove marker from the line
        lines[row] = line.slice(0, idx) + line.slice(idx + CURSOR_MARKER.length);
        return { row, col };
      }
    }
    return null;
  }

  // ── Mouse scroll handling ────────────────────────────────────────────

  private handleMouseScroll(btn: number): void {
    const scrollAmount = 4;
    const height = this.terminal.rows;
    const totalLines = this.previousLines.length;
    const maxScroll = Math.max(0, totalLines - height);

    if (btn === MOUSE_SCROLL_UP) {
      this.scrollOffset = Math.min(this.scrollOffset + scrollAmount, maxScroll);
    } else {
      this.scrollOffset = Math.max(0, this.scrollOffset - scrollAmount);
    }

    this.requestRender();
  }

  /**
   * Compute the viewport top line number adjusted for user scroll offset.
   * viewportTop = maxScroll - scrollOffset, where maxScroll is the maximum
   * we can scroll (total lines - terminal height). scrollOffset = 0 means
   * showing the bottom of content (auto-scroll).
   */
  private getViewportTop(totalLines: number, height: number): number {
    const maxScroll = Math.max(0, totalLines - height);
    this.scrollOffset = Math.min(this.scrollOffset, maxScroll);
    return maxScroll - this.scrollOffset;
  }

  // ── Rendering ───────────────────────────────────────────────────────

  private render(): void {
    if (!this.root) return;

    const width = this.terminal.columns;
    const height = this.terminal.rows;

    // Render all lines (natural length, NOT padded to terminal height)
    let lines = this.root.render(width, height);

    // Composite overlays
    for (const overlay of this.overlays) {
      const overlayLines = overlay.component.render(width, height);
      lines = this.blendOverlay(lines, overlayLines);
    }

    // Extract cursor marker before applying line resets
    const cursorPos = this.extractCursorPosition(lines);

    // Apply SEGMENT_RESET to prevent style bleed across lines
    for (let i = 0; i < lines.length; i++) {
      lines[i] = lines[i] + SEGMENT_RESET;
    }

    // Determine rendering strategy
    if (this.previousLines.length === 0) {
      this.firstRender(lines, height);
    } else {
      this.differentialRender(lines, height);
    }

    this.previousLines = lines;
    this.maxLinesRendered = Math.max(this.maxLinesRendered, lines.length);

    // Position hardware cursor using extracted marker position
    if (cursorPos && cursorPos.row < lines.length) {
      this.positionCursor(cursorPos, lines.length, height);
    } else {
      this.terminal.hideCursor();
    }
  }

  /**
   * First render: write all content lines from the current terminal position.
   * Assumes a clean terminal (alt screen just entered).
   */
  private firstRender(lines: string[], height: number): void {
    const output = lines.map((l) => `\r${l}`).join("\n");
    this.terminal.write(synchronized(output));
    // After writing all lines, the terminal cursor is at the last line
    // on screen. Cap at height-1 since lines beyond the terminal height
    // scroll off and end up at the bottom row.
    this.hardwareCursorRow = Math.min(lines.length - 1, height - 1);
    this.viewportTop = this.getViewportTop(lines.length, height);
    this.maxLinesRendered = lines.length;
  }

  /**
   * Differential render: find changed lines and update only those.
   * Handles content growth, shrinkage, and terminal overflow.
   */
  private differentialRender(newLines: string[], height: number): void {
    const oldLines = this.previousLines;
    const newLen = newLines.length;
    const oldLen = oldLines.length;

    // Find first and last changed lines
    let firstChange = -1;
    let lastChange = -1;
    const maxLen = Math.max(newLen, oldLen);

    for (let i = 0; i < maxLen; i++) {
      const oldLine = i < oldLen ? oldLines[i] : "";
      const newLine = i < newLen ? newLines[i] : "";
      if (oldLine !== newLine) {
        if (firstChange === -1) firstChange = i;
        lastChange = i;
      }
    }

    // If content grew, the appended lines are new
    if (newLen > oldLen) {
      if (firstChange === -1) firstChange = oldLen;
      lastChange = newLen - 1;
    }

    if (firstChange === -1) {
      // No content changes — only need to reposition cursor if marker moved
      return;
    }

    // When content grows while user is scrolled up, keep viewport position
    // stable by increasing scrollOffset to compensate for new content below.
    if (newLen > oldLen && this.scrollOffset > 0) {
      this.scrollOffset += newLen - oldLen;
    } else if (newLen < oldLen) {
      // Content shrunk: reduce scrollOffset proportionally
      this.scrollOffset = Math.max(0, this.scrollOffset - (oldLen - newLen));
    }

    // Calculate viewport top, adjusted for user scroll offset
    const newViewportTop = this.getViewportTop(newLen, height);

    // If the viewport shifted but changes are within visible area,
    // we can render incrementally.
    // If changes are above the viewport, we need a full redraw.
    const viewportBottom = newViewportTop + height - 1;
    const firstInViewport = Math.max(firstChange, newViewportTop);
    const lastInViewport = Math.min(lastChange, viewportBottom);

    // If all changes are above the viewport and content didn't grow,
    // no screen update needed.
    if (lastChange < newViewportTop && newLen <= oldLen) {
      this.viewportTop = newViewportTop;
      return;
    }

    // If the first changed line is above the new viewport, full redraw
    if (firstInViewport < newViewportTop || lastInViewport < firstInViewport) {
      this.fullRender(newLines, height);
      return;
    }

    // ── Differential update ──
    let buffer = "\x1b[?2026h"; // synchronized output start

    // Handle content growth: scroll the terminal if needed
    const scrollLines = newLen - oldLen;
    if (scrollLines > 0) {
      // If we were already showing bottom of content, the terminal
      // will scroll naturally. We just need to handle the new viewport.
      const scrolledLines = Math.min(scrollLines, height);
      buffer += "\r\n".repeat(scrolledLines);
      // Update hardware cursor row to account for the scroll.
      // \r\n moves the cursor down; if it hits the terminal bottom
      // it stays at height-1 (terminal scrolls).
      this.hardwareCursorRow = Math.min(this.hardwareCursorRow + scrolledLines, height - 1);
    }

    // Move cursor to first changed visible line (screen-relative)
    const renderStartScreenRow = firstInViewport - newViewportTop;
    const currentScreenRow = this.hardwareCursorRow;
    const moveTo = renderStartScreenRow - currentScreenRow;
    if (moveTo > 0) {
      buffer += `\x1b[${moveTo}B`;
    } else if (moveTo < 0) {
      buffer += `\x1b[${-moveTo}A`;
    }

    // Write changed lines within viewport
    for (let i = firstInViewport; i <= lastInViewport; i++) {
      if (i > firstInViewport) buffer += "\r\n";
      buffer += "\r\x1b[2K";
      buffer += newLines[i];
    }

    // Clear stale lines if content shrunk
    // Only needed within the viewport or up to maxLinesRendered
    if (oldLen > newLen) {
      const staleStart = Math.max(newViewportTop, newLen);
      const staleEnd = Math.min(oldLen - 1, viewportBottom);
      if (staleStart <= staleEnd) {
        // Move cursor to first stale line
        const staleScreenRow = staleStart - newViewportTop;
        const afterContentScreenRow = lastInViewport - newViewportTop;
        const moveToStale = staleScreenRow - afterContentScreenRow;
        if (moveToStale > 0) {
          buffer += `\x1b[${moveToStale}B`;
        } else if (moveToStale < 0) {
          buffer += `\x1b[${-moveToStale}A`;
        }

        for (let i = staleStart; i <= staleEnd; i++) {
          buffer += "\r\x1b[2K";
          if (i < staleEnd) buffer += "\r\n";
        }
      }
    }

    buffer += "\x1b[?2026l"; // synchronized output end
    this.terminal.write(buffer);

    // Update state
    this.hardwareCursorRow = lastInViewport - newViewportTop;
    this.viewportTop = newViewportTop;
  }

  /**
   * Full render: clear the terminal viewport and write all visible lines.
   * Used when content shrinks significantly or viewport shifts dramatically.
   */
  private fullRender(newLines: string[], height: number): void {
    const newLen = newLines.length;
    const newViewportTop = this.getViewportTop(newLen, height);
    const viewportLines = newLines.slice(newViewportTop, newViewportTop + height);

    // Move cursor to top of viewport
    if (this.hardwareCursorRow >= 0) {
      const moveToTop = this.hardwareCursorRow;
      if (moveToTop > 0) {
        this.terminal.write(`\x1b[${moveToTop}A`);
      } else if (moveToTop < 0) {
        this.terminal.write(`\x1b[${-moveToTop}B`);
      }
    }

    // Clear from cursor to end of screen
    this.terminal.clearFromCursor();

    // Write viewport lines
    const output = viewportLines.map((l) => `\r${l}`).join("\n");
    this.terminal.write(synchronized(output));

    // Update state
    this.hardwareCursorRow = Math.min(newLen - 1, height - 1);
    this.viewportTop = newViewportTop;
    this.maxLinesRendered = Math.max(this.maxLinesRendered, newLen);
    this.fullRedraws++;
  }

  private blendOverlay(base: string[], overlay: string[]): string[] {
    const startRow = Math.max(0, Math.floor((base.length - overlay.length) / 2));
    const result = [...base];

    for (let i = 0; i < overlay.length; i++) {
      const targetRow = startRow + i;
      if (targetRow < result.length) {
        result[targetRow] = overlay[i];
      } else {
        result.push(overlay[i]);
      }
    }

    return result;
  }

  /**
   * Position hardware cursor at the extracted marker position.
   * Uses viewportTop to translate buffer-row to screen-row.
   */
  private positionCursor(
    cursorPos: { row: number; col: number },
    totalLines: number,
    height: number,
  ): void {
    const targetRow = Math.min(cursorPos.row, totalLines - 1);

    // Check if cursor is within viewport
    if (targetRow < this.viewportTop || targetRow >= this.viewportTop + height) {
      this.terminal.hideCursor();
      return;
    }

    // Convert buffer row to screen row
    const targetScreenRow = targetRow - this.viewportTop;
    const moveDelta = targetScreenRow - this.hardwareCursorRow;

    let buf = "";
    if (moveDelta > 0) {
      buf += `\x1b[${moveDelta}B`;
    } else if (moveDelta < 0) {
      buf += `\x1b[${-moveDelta}A`;
    }

    buf += `\x1b[${cursorPos.col + 1}G`;

    if (buf) {
      this.terminal.write(buf);
    }

    this.terminal.showCursor();
    this.hardwareCursorRow = targetScreenRow;
  }
}
