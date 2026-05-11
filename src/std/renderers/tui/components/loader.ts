/**
 * Loader component: animated spinner for indicating progress.
 *
 * Supports custom frames and styling via theme.
 */
import { type Component, visibleWidth } from "./component.js";
import type { Theme } from "../theme.js";

const DEFAULT_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface LoaderConfig {
  /** Text shown next to the spinner. */
  text?: string;
  /** Style name from theme. */
  styleName?: string;
  /** Custom animation frames. */
  frames?: string[];
  /** Interval between frames in ms. */
  interval?: number;
}

export class Loader implements Component {
  private config: LoaderConfig;
  private theme: Theme;
  private frames: string[];
  private interval: number;
  private currentFrame = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(theme: Theme, config: LoaderConfig = {}) {
    this.theme = theme;
    this.config = config;
    this.frames = config.frames ?? DEFAULT_FRAMES;
    this.interval = config.interval ?? 80;
  }

  /** Start the spinner animation. Returns a stop function. */
  start(onFrame: () => void): () => void {
    if (this.timer) this.stop();
    this.timer = setInterval(() => {
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
      onFrame();
    }, this.interval);
    return () => this.stop();
  }

  /** Stop the spinner animation. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Update the loader text. */
  setText(text: string): void {
    this.config = { ...this.config, text };
  }

  render(width: number, _height?: number): string[] {
    const styleName = this.config.styleName ?? "loader";
    const { prefix, reset } = this.theme.resolve(styleName);

    const frame = this.frames[this.currentFrame] ?? " ";
    const text = this.config.text ?? "";
    const line = `${prefix}${frame} ${text}${reset}`;

    // Truncate if too wide
    if (visibleWidth(line) > width) {
      const visible = `${frame} ${text}`;
      let truncated = "";
      let count = 0;
      for (const ch of visible) {
        if (count >= width) break;
        truncated += ch;
        count++;
      }
      return [`${prefix}${truncated}${reset}`];
    }

    return [line];
  }

  invalidate(): void {
    // No cache needed
  }
}
