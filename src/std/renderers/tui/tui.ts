/**
 * TUI rendering engine with differential rendering.
 *
 * Architecture follows pi-tui's approach:
 * - Retained-mode components that render to string arrays
 * - Differential render compares previous vs new lines to emit minimal ANSI
 * - CURSOR_MARKER for IME-compatible hardware cursor positioning
 * - Overlay stack for modals and popups
 * - Synchronized output (DEC 2026) for flicker-free updates
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Component, FocusableComponent } from "./components/component.js";
import { visibleWidth } from "./components/component.js";
import type { Terminal } from "./terminal.js";

// ── Cursor marker ──────────────────────────────────────────────────────

/**
 * Zero-width APC (Application Program Command) sequence embedded by
 * focused components at the cursor position. The renderer finds this
 * marker, strips it from the output, and positions the hardware cursor.
 */
export const CURSOR_MARKER = "\x1b_pi:c\x07";

// ── SGR segment reset ──────────────────────────────────────────────────

/** Reset all SGR attributes and OSC 8 hyperlink at end of each line. */
const SEGMENT_RESET = "\x1b[0m\x1b]8;;\x07";

/**
 * Apply SGR reset to each line and normalize terminal output.
 * This prevents styles from bleeding across lines.
 */
function applyLineResets(lines: string[]): string[] {
  return lines.map((line) => line.replace(/\s+$/, "") + SEGMENT_RESET);
}

// ── Types ──────────────────────────────────────────────────────────────

export interface OverlayHandle {
  hide(): void;
  /** Toggle visibility without removing from stack. */
  setHidden(hidden: boolean): void;
  /** Is this overlay currently hidden? */
  isHidden(): boolean;
}

interface OverlayEntry {
  component: Component;
  handle: OverlayHandle;
}

// ── TUI class ──────────────────────────────────────────────────────────

export class TUI {
  private terminal: Terminal;
  private root: Component | null = null;
  private focusedComponent: FocusableComponent | null = null;
  private overlays: OverlayEntry[] = [];

  // ── Rendering state ─────────────────────────────────────────────────
  private previousLines: string[] = [];
  private started = false;
  private renderScheduled = false;

  /** End of rendered content (0-indexed from top of buffer). */
  private cursorRow = 0;
  /** Actual terminal cursor row (may differ due to IME positioning). */
  private hardwareCursorRow = 0;
  /** Highest line ever rendered (for clearing when content shrinks). */
  private maxLinesRendered = 0;
  /** Previous terminal width — used to detect width changes. */
  private previousWidth = 0;
  /** Previous terminal height — used to detect height changes. */
  private previousHeight = 0;
  /** Whether to clear empty rows when content shrinks (default: on). */
  private clearOnShrink = process.env.PI_CLEAR_ON_SHRINK !== "0";

  // ── Input handling ──────────────────────────────────────────────────
  private inputBuffer = "";
  private pasteActive = false;

  /** Number of full redraws performed (useful for testing). */
  fullRedraws = 0;

  /** Callback for debug key. */
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

  /**
   * Show an overlay component. Multiple overlays stack.
   * Returns a handle for controlling the overlay.
   */
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
        setHidden: (h: boolean) => {
          hidden = h;
          this.requestRender();
        },
        isHidden: () => hidden,
      },
    };
    this.overlays.push(entry);
    this.requestRender();
    return entry.handle;
  }

  requestRender(): void {
    if (!this.started) return;
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    setImmediate(() => {
      this.renderScheduled = false;
      if (this.started) this.render();
    });
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

    this.onShutdown?.();

    // Move cursor past content before clearing
    if (this.previousLines.length > 0) {
      const targetRow = this.previousLines.length;
      const lineDiff = targetRow - this.hardwareCursorRow;
      if (lineDiff > 0) {
        this.terminal.write(`\x1b[${lineDiff}B`);
      } else if (lineDiff < 0) {
        this.terminal.write(`\x1b[${-lineDiff}A`);
      }
      this.terminal.write("\r\n");
    }

    this.terminal.clearScreen();
    this.terminal.showCursor();
    this.terminal.stop();

    this.started = false;
    this.previousLines = [];
    this.previousWidth = 0;
    this.previousHeight = 0;
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
    // Pass all input to the focused component first
    if (this.focusedComponent?.handleInput) {
      this.focusedComponent.handleInput(data);
      this.requestRender();
      return;
    }

    // Fall back to root if nothing is focused
    if (this.root?.handleInput) {
      this.root.handleInput(data);
      this.requestRender();
    }
  }

  private handleResize(): void {
    // Force a full redraw on resize to prevent layout jitter
    this.previousLines = [];
    this.previousWidth = -1;
    this.previousHeight = -1;
    this.cursorRow = 0;
    this.hardwareCursorRow = 0;
    this.maxLinesRendered = 0;
    this.render();
  }

  // ── Cursor marker extraction ────────────────────────────────────────

  /**
   * Find CURSOR_MARKER in rendered lines, strip it, and return
   * the position where the hardware cursor should be placed.
   * Searches from bottom for efficiency.
   */
  private extractCursorPosition(lines: string[]): { row: number; col: number } | null {
    for (let row = lines.length - 1; row >= 0; row--) {
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

  // ── Rendering ───────────────────────────────────────────────────────

  private render(): void {
    if (!this.root) return;

    const width = this.terminal.columns;
    const height = this.terminal.rows;

    // Render all lines from root component
    let lines = this.root.render(width);

    // Composite overlays on top
    if (this.overlays.length > 0) {
      lines = this.compositeOverlays(lines, width);
    }

    // Extract cursor marker BEFORE line resets (marker must be found first)
    const cursorPos = this.extractCursorPosition(lines);

    // Apply SGR line resets — prevents style bleed across lines
    lines = applyLineResets(lines);

    // Check all lines fit within terminal width (crash if not)
    this.checkLineWidths(lines, width);

    // Height change → full redraw (viewport shifted)
    const heightChanged = this.previousHeight !== 0 && this.previousHeight !== height;
    const widthChanged = this.previousWidth !== 0 && this.previousWidth !== width;

    // ── Determine rendering strategy ────────────────────────────────
    if (this.previousLines.length === 0) {
      this.firstRender(lines, width, height, cursorPos);
    } else if (widthChanged || heightChanged) {
      // Width or height change → full redraw
      this.fullRender(lines, width, height, cursorPos);
    } else if (
      this.clearOnShrink &&
      lines.length < this.maxLinesRendered &&
      this.overlays.length === 0
    ) {
      // Content shrunk below max → full redraw to clear stale lines
      this.fullRender(lines, width, height, cursorPos);
    } else {
      this.differentialRender(lines, width, height, cursorPos);
    }

    this.previousLines = lines;
    this.previousWidth = width;
    this.previousHeight = height;
  }

  // ── First render ────────────────────────────────────────────────────

  private firstRender(
    lines: string[],
    _width: number,
    _height: number,
    cursorPos: { row: number; col: number } | null,
  ): void {
    const buffer = lines.map((line, i) => (i === 0 ? `\r${line}` : `\r\n\r${line}`)).join("");

    this.terminal.write(this.syncOutput(buffer));

    this.cursorRow = Math.max(0, lines.length - 1);
    this.hardwareCursorRow = this.cursorRow;
    this.maxLinesRendered = lines.length;

    this.positionHardwareCursor(cursorPos, lines.length);
  }

  // ── Full render ─────────────────────────────────────────────────────

  private fullRender(
    lines: string[],
    _width: number,
    _height: number,
    cursorPos: { row: number; col: number } | null,
  ): void {
    this.fullRedraws++;

    // Clear screen and scrollback, then write all lines
    let buffer = "\x1b[2J\x1b[H\x1b[3J"; // Clear screen, home, clear scrollback

    for (let i = 0; i < lines.length; i++) {
      if (i > 0) buffer += "\r\n";
      buffer += lines[i];
    }

    this.terminal.write(this.syncOutput(buffer));

    this.cursorRow = Math.max(0, lines.length - 1);
    this.hardwareCursorRow = this.cursorRow;
    this.maxLinesRendered = Math.max(this.maxLinesRendered, lines.length);

    this.positionHardwareCursor(cursorPos, lines.length);
  }

  // ── Crash log helper ────────────────────────────────────────────────

  private logLineCrash(
    lineIdx: number,
    actualWidth: number,
    width: number,
    newLines: string[],
  ): void {
    try {
      const crashDir = join(homedir(), ".dhara");
      mkdirSync(crashDir, { recursive: true });
      const crashPath = join(crashDir, "tui-crash.log");
      const crashData = [
        `Crash at ${new Date().toISOString()}`,
        `Terminal width: ${width}`,
        `Line ${lineIdx} visible width: ${actualWidth}`,
        "",
        "=== All rendered lines ===",
        ...newLines.map((l, idx) => `[${idx}] (w=${visibleWidth(l)}) ${l}`),
        "",
      ].join("\n");
      writeFileSync(crashPath, crashData);
    } catch {
      // Best-effort crash logging
    }
  }

  /**
   * Silently log a warning when a rendered line exceeds terminal width.
   * Does NOT crash — just logs debug info to ~/.dhara/tui-crash.log.
   */
  private checkLineWidths(lines: string[], width: number): void {
    for (let i = 0; i < lines.length; i++) {
      const actualWidth = visibleWidth(lines[i]);
      if (actualWidth > width) {
        this.logLineCrash(i, actualWidth, width, lines);
        return; // Only log the first overflow
      }
    }
  }

  // ── Differential render ─────────────────────────────────────────────

  private differentialRender(
    lines: string[],
    _width: number,
    height: number,
    cursorPos: { row: number; col: number } | null,
  ): void {
    const prevLines = this.previousLines;
    const maxLen = Math.max(lines.length, prevLines.length);

    // Find first and last changed lines
    let firstChanged = -1;
    let lastChanged = -1;

    for (let i = 0; i < maxLen; i++) {
      const oldLine = i < prevLines.length ? prevLines[i] : "";
      const newLine = i < lines.length ? lines[i] : "";
      if (oldLine !== newLine) {
        if (firstChanged === -1) firstChanged = i;
        lastChanged = i;
      }
    }

    // Appended lines (content grew), no other changes detected
    if (lines.length > prevLines.length && firstChanged === -1) {
      firstChanged = prevLines.length;
      lastChanged = lines.length - 1;
    }

    // No changes
    if (firstChanged === -1) {
      this.positionHardwareCursor(cursorPos, lines.length);
      return;
    }

    // If first changed line is above the previous viewport, full redraw
    // (we can't scroll back to update lines above the visible area)
    if (firstChanged < 0) {
      this.fullRender(lines, _width, height, cursorPos);
      return;
    }

    // ── Build differential buffer ─────────────────────────────────
    let buffer = "";
    const hardwareCursorRow = this.hardwareCursorRow;
    const appendedLines = lines.length > prevLines.length;
    const moveTargetRow = appendedLines && firstChanged > 0 ? firstChanged - 1 : firstChanged;

    // Move cursor to the first changed line
    const lineDiff = moveTargetRow - hardwareCursorRow;
    if (lineDiff > 0) {
      buffer += `\x1b[${lineDiff}B`; // Move down
    } else if (lineDiff < 0) {
      buffer += `\x1b[${-lineDiff}A`; // Move up
    }

    buffer += appendedLines && firstChanged > 0 ? "\r\n" : "\r";

    // Render changed lines from firstChanged to lastChanged
    const renderEnd = Math.min(lastChanged, lines.length - 1);
    for (let i = firstChanged; i <= renderEnd; i++) {
      if (i > firstChanged) buffer += "\r\n";
      buffer += "\r\x1b[2K"; // Clear entire line first
      buffer += lines[i];
    }

    let finalCursorRow = renderEnd;

    // ── Handle content shrinking ──
    if (prevLines.length > lines.length) {
      // If we didn't render to the end of new content, move down first
      if (renderEnd < lines.length - 1) {
        const moveDown = lines.length - 1 - renderEnd;
        buffer += `\x1b[${moveDown}B`;
        finalCursorRow = lines.length - 1;
      }

      // Clear extra lines that are no longer needed
      const extraLines = prevLines.length - lines.length;
      for (let i = lines.length; i < prevLines.length; i++) {
        buffer += "\r\n\x1b[2K";
      }
      // Move cursor back to end of new content
      buffer += `\x1b[${extraLines}A`;
    }

    this.terminal.write(this.syncOutput(buffer));

    // Update tracking state
    this.cursorRow = Math.max(0, lines.length - 1);
    this.hardwareCursorRow = finalCursorRow;
    this.maxLinesRendered = Math.max(this.maxLinesRendered, lines.length);

    // Position hardware cursor for IME
    this.positionHardwareCursor(cursorPos, lines.length);
  }

  /**
   * Position the hardware cursor for IME candidate window.
   * Uses the CURSOR_MARKER position extracted from rendered output.
   */
  private positionHardwareCursor(
    cursorPos: { row: number; col: number } | null,
    totalLines: number,
  ): void {
    if (!cursorPos || totalLines <= 0) {
      this.terminal.hideCursor();
      return;
    }

    // Clamp to valid range
    const targetRow = Math.max(0, Math.min(cursorPos.row, totalLines - 1));
    const targetCol = Math.max(0, cursorPos.col);

    // Move from current hardware cursor to target
    const rowDelta = targetRow - this.hardwareCursorRow;
    let buffer = "";
    if (rowDelta > 0) {
      buffer += `\x1b[${rowDelta}B`;
    } else if (rowDelta < 0) {
      buffer += `\x1b[${-rowDelta}A`;
    }
    // Move to absolute column (1-indexed)
    buffer += `\x1b[${targetCol + 1}G`;

    if (buffer) this.terminal.write(buffer);

    this.hardwareCursorRow = targetRow;
    this.terminal.showCursor();
  }

  // ── Overlay compositing ─────────────────────────────────────────────

  /**
   * Composite all visible overlays on top of base content.
   * Non-hidden overlays are layered in insertion order (last = topmost).
   */
  private compositeOverlays(base: string[], width: number): string[] {
    const visible = this.overlays.filter((o) => !o.handle.isHidden());
    if (visible.length === 0) return base;

    const result = [...base];

    for (const entry of visible) {
      const overlayLines = entry.component.render(width);
      if (overlayLines.length === 0) continue;

      // Center vertically
      const startRow = Math.max(0, Math.floor((result.length - overlayLines.length) / 2));

      for (let i = 0; i < overlayLines.length; i++) {
        const targetRow = startRow + i;
        if (targetRow < result.length) {
          // Blend: use the overlay line directly (with SEGMENT_RESET wrapping)
          // This is simpler and avoids the complexity of character-level compositing
          result[targetRow] = SEGMENT_RESET + overlayLines[i] + SEGMENT_RESET;
        } else {
          result.push(overlayLines[i]);
        }
      }
    }

    return result;
  }

  // ── Utility ─────────────────────────────────────────────────────────

  /** Wrap output in synchronized update markers for flicker-free rendering. */
  private syncOutput(output: string): string {
    return `\x1b[?2026h${output}\x1b[?2026l`;
  }
}
