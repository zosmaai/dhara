/**
 * TUI rendering engine with differential rendering.
 *
 * Manages a tree of {@link Component}, renders each frame, diffs
 * against the previous frame, and writes only changed lines to the
 * terminal using synchronized output for flicker-free updates.
 *
 * Architecture:
 * - **Root component**: A single component tree rendered each frame.
 * - **Differential rendering**: Three strategies — first render,
 *   full re-render (resize/overflow change), and differential
 *   (only changed lines).
 * - **Focus management**: One component receives keyboard input.
 * - **Overlay system**: Components rendered on top of existing content.
 */
import type { FocusableComponent, Component } from "./components/component.js";
import type { Terminal } from "./terminal.js";
import { synchronized } from "./terminal.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface OverlayHandle {
  /** Remove this overlay. */
  hide(): void;
}

interface OverlayEntry {
  component: Component;
  handle: OverlayHandle;
}

// ── TUI class ──────────────────────────────────────────────────────────

/**
 * The main TUI rendering engine.
 *
 * Usage:
 * ```ts
 * const terminal = new ProcessTerminal();
 * const tui = new TUI(terminal);
 *
 * tui.setRoot(myRootComponent);
 * tui.focus(myEditor);
 * tui.start();
 * ```
 */
export class TUI {
  private terminal: Terminal;
  private root: Component | null = null;
  private focusedComponent: FocusableComponent | null = null;
  private overlays: OverlayEntry[] = [];

  // Rendering state
  private previousLines: string[] = [];
  private started = false;

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

  /** Set the root component to render. */
  setRoot(component: Component): void {
    this.root = component;
  }

  /** Focus a component for keyboard input. */
  focus(component: FocusableComponent | null): void {
    if (this.focusedComponent) {
      this.focusedComponent.focused = false;
    }
    this.focusedComponent = component;
    if (component) {
      component.focused = true;
    }
  }

  /** Show an overlay on top of the current content. */
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

  /** Request a re-render on the next animation frame. */
  requestRender(): void {
    if (!this.started) return;
    this.render();
  }

  /** Start the TUI: take over the terminal and begin rendering. */
  start(): void {
    if (this.started) return;
    this.started = true;

    this.terminal.start(
      (data) => this.handleInput(data),
      () => this.handleResize(),
    );

    this.render();
  }

  /** Stop the TUI: restore terminal and release resources. */
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
    // Bracketed paste: wrap large pastes
    if (data === "\x1b[200~") {
      this.pasteActive = true;
      this.inputBuffer = "";
      return;
    }
    if (data === "\x1b[201~") {
      this.pasteActive = false;
      const text = this.inputBuffer;
      this.inputBuffer = "";
      if (text.length > 10) {
        this.writeDebug(`[pasted ${text.length} chars]`);
      }
      // Feed pasted content to focused component as individual inputs
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
    // Debug key: Shift+Ctrl+D
    if (data === "\x04" && this.onDebug) {
      this.onDebug();
      return;
    }

    // Route to focused component
    if (this.focusedComponent?.handleInput) {
      this.focusedComponent.handleInput(data);
      this.render();
      return;
    }

    // Route to root if it handles input
    if (this.root?.handleInput) {
      this.root.handleInput(data);
      this.render();
    }
  }

  private handleResize(): void {
    // Force full redraw on resize
    this.previousLines = [];
    this.render();
  }

  // ── Debug output ────────────────────────────────────────────────────

  private writeDebug(msg: string): void {
    // Write to the last line temporarily
    this.terminal.moveBy(this.terminal.rows);
    this.terminal.write(`[DEBUG] ${msg}\n`);
  }

  // ── Rendering ───────────────────────────────────────────────────────

  private render(): void {
    if (!this.root) return;

    const width = this.terminal.columns;

    // Collect all lines: root + overlays
    let lines = this.root.render(width);

    // Render overlays on top
    for (const overlay of this.overlays) {
      const overlayLines = overlay.component.render(width);
      lines = this.blendOverlay(lines, overlayLines);
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

    // Update cursor position if focused component specifies one
    if (this.focusedComponent?.getCursorPosition) {
      const cursorPos = this.focusedComponent.getCursorPosition();
      if (cursorPos) {
        this.positionCursor(lines.length, cursorPos.line, cursorPos.column);
      }
    }
  }

  private firstRender(lines: string[]): void {
    const output = lines.map((l) => `\r${l}`).join("\n");
    this.terminal.write(synchronized(output));
    this.terminal.write("\n");
  }

  private fullRender(lines: string[]): void {
    // Move cursor to top of the TUI area
    const prevHeight = this.previousLines.length;
    if (prevHeight > 0) {
      this.terminal.moveBy(prevHeight - 1);
    }

    // Clear from cursor to end, then render all lines
    this.terminal.clearFromCursor();
    const output = lines.map((l) => `\r${l}`).join("\n");
    this.terminal.write(synchronized(output));
    this.terminal.write("\n");

    this.fullRedraws++;
  }

  private differentialRender(lines: string[]): void {
    // Find the first changed line
    let firstChange = -1;
    let lastChange = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] !== this.previousLines[i]) {
        if (firstChange === -1) firstChange = i;
        lastChange = i;
      }
    }

    if (firstChange === -1) return; // Nothing changed

    // Move cursor to first changed line
    const moveUp = this.previousLines.length - firstChange;
    this.terminal.moveBy(moveUp);

    // Clear from first change to bottom
    this.terminal.clearFromCursor();

    // Render changed lines
    const changedLines = lines.slice(firstChange, lastChange + 1);
    const output = changedLines.map((l) => `\r${l}`).join("\n");

    this.terminal.write(synchronized(output));

    // If we cut the output short, pad with newlines to clear stale content
    const renderedCount = lastChange + 1;
    const newlinePad = lines.length - renderedCount;
    if (newlinePad > 0) {
      this.terminal.write("\n".repeat(newlinePad));
    } else {
      this.terminal.write("\n");
    }
  }

  /** Blend overlay lines on top of base content. */
  private blendOverlay(base: string[], overlay: string[]): string[] {
    // Center the overlay vertically
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

  /** Position the terminal cursor for a focused input component. */
  private positionCursor(totalLines: number, line: number, column: number): void {
    const moveUp = totalLines - line;
    this.terminal.moveBy(moveUp);
    this.terminal.write(`\r\x1b[${column}C`);
    this.terminal.showCursor();
  }
}
