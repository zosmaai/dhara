/**
 * StdinBuffer — splits raw stdin data into individual input sequences.
 *
 * Raw terminal input from process.stdin can arrive in arbitrary chunks.
 * This buffer parses the stream into discrete sequences (single key events,
 * escape sequences, bracketed paste content) and emits them via callbacks.
 *
 * Key features:
 * - Splits batched input into individual key sequences
 * - Detects bracketed paste boundaries and emits paste events
 * - Configurable timeout for multi-escape-sequence consolidation
 *
 * Inspired by pi-tui's StdinBuffer approach.
 */

// ── Event emitter style ────────────────────────────────────────────────

type DataCallback = (data: string) => void;
type PasteCallback = (content: string) => void;

// ── Constants ──────────────────────────────────────────────────────────

const ESC = "\x1b";
const BRACKETED_PASTE_START = "\x1b[200~";
const BRACKETED_PASTE_END = "\x1b[201~";

// ── StdinBuffer ────────────────────────────────────────────────────────

export class StdinBuffer {
  private buffer = "";
  private pasteContent = "";
  private inPaste = false;

  // ── Callbacks ──────────────────────────────────────────────────────
  private dataCallbacks: DataCallback[] = [];
  private pasteCallbacks: PasteCallback[] = [];

  on(event: "data", cb: DataCallback): void;
  on(event: "paste", cb: PasteCallback): void;
  on(event: string, cb: DataCallback | PasteCallback): void {
    if (event === "data") {
      this.dataCallbacks.push(cb as DataCallback);
    } else if (event === "paste") {
      this.pasteCallbacks.push(cb as PasteCallback);
    }
  }

  private emitData(data: string): void {
    for (const cb of this.dataCallbacks) cb(data);
  }

  private emitPaste(content: string): void {
    for (const cb of this.pasteCallbacks) cb(content);
  }

  // ── Processing ─────────────────────────────────────────────────────

  /**
   * Process a chunk of raw stdin data.
   * Splits it into individual sequences and emits them.
   */
  process(chunk: string): void {
    this.buffer += chunk;

    while (this.buffer.length > 0) {
      // Check for bracketed paste start
      if (!this.inPaste && this.buffer.startsWith(BRACKETED_PASTE_START)) {
        this.inPaste = true;
        this.buffer = this.buffer.slice(BRACKETED_PASTE_START.length);
        this.pasteContent = "";
        continue;
      }

      // Check for bracketed paste end while in paste mode
      if (this.inPaste) {
        const endIdx = this.buffer.indexOf(BRACKETED_PASTE_END);
        if (endIdx !== -1) {
          this.pasteContent += this.buffer.slice(0, endIdx);
          this.buffer = this.buffer.slice(endIdx + BRACKETED_PASTE_END.length);
          this.inPaste = false;
          this.emitPaste(this.pasteContent);
          this.pasteContent = "";
          continue;
        }
        // Still accumulating paste content
        this.pasteContent += this.buffer;
        this.buffer = "";
        continue;
      }

      // Extract a single sequence from the buffer
      const seq = this.extractNextSequence();
      if (seq === null) break; // Need more data

      this.buffer = this.buffer.slice(seq.length);

      // Emit the sequence
      this.emitData(seq);
    }
  }

  /**
   * Extract the next complete input sequence from the buffer.
   * Returns null if we need more data.
   */
  private extractNextSequence(): string | null {
    if (this.buffer.length === 0) return null;

    const first = this.buffer[0];
    if (first === undefined) return null;

    // Single printable character or control code (not part of escape)
    if (first !== ESC) {
      // Single byte: printable, control (including \r, \n, \t), or DEL
      return first;
    }

    // Escape sequence — need to find the end
    if (this.buffer.length < 2) return null;

    const second = this.buffer[1];
    if (second === undefined) return null;

    // CSI sequences: ESC [ ...
    if (second === "[") {
      return this.extractCSISequence();
    }

    // OSC sequences: ESC ] ... ST (ESC \) or BEL
    if (second === "]") {
      return this.extractOSCSequence();
    }

    // SS3 sequences: ESC O ...
    if (second === "O") {
      // SS3 sequences are typically 3 bytes: ESC O <char>
      if (this.buffer.length < 3) return null;
      return this.buffer.slice(0, 3);
    }

    // APC sequences: ESC _ ... ST (ESC \) or BEL
    if (second === "_") {
      return this.extractAPCSequence();
    }

    // Two-byte escape sequences: ESC <char>
    return this.buffer.slice(0, 2);
  }

  /**
   * Extract a CSI sequence: ESC [ <params> <final_byte>
   */
  private extractCSISequence(): string | null {
    // CSI sequences end with a byte in range 0x40-0x7E
    // Also handle CSI u (Kitty protocol) and CSI ~ sequences
    let i = 2; // Skip ESC [
    while (i < this.buffer.length) {
      const c = this.buffer[i];
      if (c === undefined) break;
      const code = c.charCodeAt(0);
      if (code >= 0x40 && code <= 0x7e) {
        // Found the final byte
        return this.buffer.slice(0, i + 1);
      }
      i++;
    }
    return null; // Incomplete sequence
  }

  /**
   * Extract an OSC sequence: ESC ] ... ST (ESC \) or BEL (0x07)
   */
  private extractOSCSequence(): string | null {
    let i = 2; // Skip ESC ]
    while (i < this.buffer.length) {
      const c = this.buffer[i];
      if (c === undefined) break;
      if (c === "\x07") {
        return this.buffer.slice(0, i + 1); // BEL-terminated
      }
      if (c === ESC && i + 1 < this.buffer.length && this.buffer[i + 1] === "\\") {
        return this.buffer.slice(0, i + 2); // ST-terminated
      }
      i++;
    }
    return null; // Incomplete
  }

  /**
   * Extract an APC sequence: ESC _ ... ST (ESC \) or BEL (0x07)
   */
  private extractAPCSequence(): string | null {
    let i = 2; // Skip ESC _
    while (i < this.buffer.length) {
      const c = this.buffer[i];
      if (c === undefined) break;
      if (c === "\x07") {
        return this.buffer.slice(0, i + 1);
      }
      if (c === ESC && i + 1 < this.buffer.length && this.buffer[i + 1] === "\\") {
        return this.buffer.slice(0, i + 2);
      }
      i++;
    }
    return null; // Incomplete
  }

  /** Clean up resources. */
  destroy(): void {
    this.dataCallbacks = [];
    this.pasteCallbacks = [];
    this.buffer = "";
    this.pasteContent = "";
    this.inPaste = false;
  }
}
