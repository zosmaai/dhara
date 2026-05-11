/**
 * Text component: renders multi-line text with word wrapping.
 *
 * Supports ANSI-styled text and handles wrapping at word boundaries.
 */
import { type Component, ThemedComponent, visibleWidth } from "./component.js";

/**
 * A simple component that renders text content with optional styling.
 */
export class Text implements Component {
  private _content: string;
  private prefix: string;
  private reset: string;

  /** Cached render output. */
  private cache: { width: number; lines: string[] } | null = null;

  constructor(content: string, options?: { styleName?: string; prefix?: string; reset?: string }) {
    this._content = content;
    this.prefix = options?.prefix ?? "";
    this.reset = options?.reset ?? "";
  }

  get content(): string {
    return this._content;
  }

  set content(value: string) {
    this._content = value;
    this.cache = null;
  }

  render(width: number, _height?: number): string[] {
    if (this.cache?.width === width) return this.cache.lines;

    const lines: string[] = [];
    const paragraphs = this._content.split("\n");

    for (const paragraph of paragraphs) {
      if (paragraph === "") {
        lines.push("");
        continue;
      }

      const words = paragraph.split(" ");
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testVisible = visibleWidth(testLine);

        if (testVisible <= width) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            lines.push(this.wrapLine(currentLine));
          }
          // If a single word is longer than width, break it
          if (visibleWidth(word) > width) {
            const parts = this.breakLongWord(word, width);
            for (let i = 0; i < parts.length - 1; i++) {
              lines.push(this.wrapLine(parts[i]));
            }
            currentLine = parts[parts.length - 1];
          } else {
            currentLine = word;
          }
        }
      }
      if (currentLine) {
        lines.push(this.wrapLine(currentLine));
      }
    }

    this.cache = { width, lines };
    return lines;
  }

  invalidate(): void {
    this.cache = null;
  }

  private wrapLine(text: string): string {
    if (!this.prefix) return text;
    // Truncate to width, but the prefix/reset add no visible width
    return `${this.prefix}${text}${this.reset}`;
  }

  private breakLongWord(word: string, width: number): string[] {
    const parts: string[] = [];
    let remaining = word;
    while (visibleWidth(remaining) > width) {
      // Find the right cut point
      let cutIdx = width;
      while (cutIdx > 0 && remaining[cutIdx - 1]?.match(/\S/)) {
        // We need to think about visible vs raw positions
        // For simplicity, cut at raw character boundary
        cutIdx--;
      }
      if (cutIdx === 0) cutIdx = width; // Force break
      parts.push(remaining.slice(0, cutIdx));
      remaining = remaining.slice(cutIdx);
    }
    parts.push(remaining);
    return parts;
  }
}

/**
 * Multi-line text component with wrapping, styled via theme.
 */
export class ThemedText extends ThemedComponent {
  private _content: string;
  private styleName: string;
  private cache: { width: number; lines: string[] } | null = null;

  constructor(content: string, styleName: string, theme: import("../theme.js").Theme) {
    super(theme);
    this._content = content;
    this.styleName = styleName;
  }

  get content(): string {
    return this._content;
  }
  set content(value: string) {
    this._content = value;
    this.cache = null;
  }

  render(width: number, _height?: number): string[] {
    if (this.cache?.width === width) return this.cache.lines;

    const { prefix, reset } = this.styleCodes(this.styleName);
    // Reuse Text component for wrapping logic
    const inner = new Text(this._content, { prefix, reset });
    const result = inner.render(width);

    this.cache = { width, lines: result };
    return result;
  }

  override invalidate(): void {
    this.cache = null;
  }
}
