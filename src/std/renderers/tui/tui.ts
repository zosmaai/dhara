/**
 * TUI rendering engine with differential rendering.
 *
 * Uses the CURSOR_MARKER approach from pi-tui: focused components embed
 * a zero-width marker at the cursor position in their rendered output,
 * and the engine extracts it automatically for hardware cursor positioning.
 * This avoids fragile separate cursor-position calculations.
 */
import type { Component, FocusableComponent } from "./components/component.js";
import type { Terminal } from "./terminal.js";
import { visibleWidth } from "./components/component.js";
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

// ── TUI class ──────────────────────────────────────────────────────────

export class TUI {
  private terminal: Terminal;
  private root: Component | null = null;
  private focusedComponent: FocusableComponent | null = null;
  private overlays: OverlayEntry[] = [];

  // Rendering state
  private previousLines: string[] = [];
  private started = false;
  private renderScheduled = false;
  /** Track actual terminal cursor row (0-indexed from top). */
  private cursorRow = 0;

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

    setTimeout(() => {
      if (this.started) {
        this.previousLines = [];
        this.render();
      }
    }, 100);
  }

  stop(): void {
    if (!this.started) return;

    this.onShutdown?.();

    this.terminal.clearScreen();
    this.terminal.showCursor();
    this.terminal.stop();

    this.started = false;
    this.previousLines = [];
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

  // ── Rendering ───────────────────────────────────────────────────────

  private render(): void {
    if (!this.root) return;

    const rawWidth = this.terminal.columns;
    const height = this.terminal.rows;
    const width = Math.min(rawWidth, 120);

    // Render all lines
    let lines = this.root.render(width, height);

    // Composite overlays
    for (const overlay of this.overlays) {
      const overlayLines = overlay.component.render(width, height);
      lines = this.blendOverlay(lines, overlayLines);
    }

    // Extract cursor marker BEFORE padding/clipping
    const cursorPos = this.extractCursorPosition(lines);

    // Pad to terminal height to prevent layout jitter
    while (lines.length < height) {
      lines.push("");
    }
    if (lines.length > height) {
      lines = lines.slice(-height);
    }

    // Determine rendering strategy
    if (this.previousLines.length === 0) {
      this.firstRender(lines);
    } else if (this.previousLines.length !== lines.length) {
      this.fullRender(lines);
    } else {
      this.differentialRender(lines);
    }

    this.previousLines = lines;

    // Position hardware cursor using extracted marker position
    if (cursorPos && cursorPos.row < lines.length) {
      this.positionCursor(lines.length, cursorPos.row, cursorPos.col);
    }
  }

  private firstRender(lines: string[]): void {
    // Same as fullRender but without clearing first
    const output = lines.map((l) => `\r${l}`).join("\n");
    this.terminal.write(synchronized(output));
    // NO trailing newline — cursor stays on last content line
    this.cursorRow = lines.length - 1;
  }

  private fullRender(lines: string[]): void {
    // Move cursor to top of content
    if (this.cursorRow >= 0) {
      this.terminal.moveBy(this.cursorRow + 1);
    }

    // Clear from cursor to end
    this.terminal.clearFromCursor();

    // Write all lines
    const output = lines.map((l) => `\r${l}`).join("\n");
    this.terminal.write(synchronized(output));
    this.cursorRow = lines.length - 1;

    this.fullRedraws++;
  }

  private differentialRender(lines: string[]): void {
    // Find first changed line
    let firstChange = -1;
    const maxLen = Math.max(lines.length, this.previousLines.length);
    for (let i = 0; i < maxLen; i++) {
      const oldLine = i < this.previousLines.length ? this.previousLines[i] : "";
      const newLine = i < lines.length ? lines[i] : "";
      if (oldLine !== newLine) {
        firstChange = i;
        break;
      }
    }

    if (firstChange === -1) return;

    // Move cursor to first changed line
    const moveUp = this.cursorRow - firstChange;
    if (moveUp > 0) {
      this.terminal.moveBy(moveUp);
    } else if (moveUp < 0) {
      this.terminal.moveBy(moveUp); // moveBy handles negative (moves down)
    }

    // Write changed lines, clearing each line first
    let buffer = "\x1b[?2026h"; // synchronized output start
    for (let i = firstChange; i < lines.length; i++) {
      if (i > firstChange) buffer += "\r\n";
      // Clear line before writing (pi-tui style)
      buffer += "\r\x1b[2K";
      buffer += lines[i];
    }
    buffer += "\x1b[?2026l"; // synchronized output end
    this.terminal.write(buffer);

    this.cursorRow = lines.length - 1;
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

  /** Position hardware cursor at the extracted marker position. */
  private positionCursor(totalLines: number, row: number, col: number): void {
    const moveUp = totalLines - 1 - row;
    this.terminal.moveBy(moveUp);
    this.terminal.write(`\x1b[${col + 1}G`);
    this.terminal.showCursor();
    this.cursorRow = row;
  }
}
