/**
 * Status bar component: displays session info at the bottom of the TUI.
 *
 * Shows: model name, session ID, token usage, working directory.
 */
import type { Theme } from "../theme.js";
import { type Component, padToWidth, visibleWidth } from "./component.js";

export interface StatusBarConfig {
  /** Model identifier. */
  model?: string;
  /** Provider name. */
  provider?: string;
  /** Session ID (short). */
  sessionId?: string;
  /** Working directory. */
  cwd?: string;
  /** Tokens used in current session. */
  tokens?: { input: number; output: number };
  /** Current state (e.g. "thinking", "idle"). */
  state?: string;
}

export class StatusBar implements Component {
  private config: StatusBarConfig;
  private theme: Theme;

  constructor(theme: Theme, config: StatusBarConfig = {}) {
    this.theme = theme;
    this.config = config;
  }

  /** Update the status bar configuration. */
  update(config: Partial<StatusBarConfig>): void {
    this.config = { ...this.config, ...config };
  }

  render(width: number, _height?: number): string[] {
    const barStyle = this.theme.resolve("status.bar");
    const modelStyle = this.theme.resolve("status.model");
    const tokenStyle = this.theme.resolve("status.tokens");
    const dimStyle = this.theme.resolve("dim");

    const parts: string[] = [];

    // Left side: state indicator + model
    if (this.config.state) {
      parts.push(this.stateIcon(this.config.state));
    }

    if (this.config.provider && this.config.model) {
      parts.push(
        `${modelStyle.prefix}${this.config.provider}/${this.config.model}${modelStyle.reset}`,
      );
    } else if (this.config.model) {
      parts.push(`${modelStyle.prefix}${this.config.model}${modelStyle.reset}`);
    }

    // Session ID
    if (this.config.sessionId) {
      parts.push(`${dimStyle.prefix}#${this.config.sessionId}${dimStyle.reset}`);
    }

    // Right side: token usage + cwd
    const rightParts: string[] = [];
    if (this.config.tokens) {
      const { input, output } = this.config.tokens;
      rightParts.push(
        `${tokenStyle.prefix}↑${this.fmt(input)} ↓${this.fmt(output)}${tokenStyle.reset}`,
      );
    }

    if (this.config.cwd) {
      const shortCwd = this.shortenPath(this.config.cwd, width / 3);
      rightParts.push(`${dimStyle.prefix}${shortCwd}${dimStyle.reset}`);
    }

    // Build the bar
    const leftSide = parts.join("  ");
    const rightSide = rightParts.join("  ");

    // Calculate spacing
    const leftWidth = visibleWidth(leftSide);
    const rightWidth = visibleWidth(rightSide);
    const spacer = Math.max(1, width - leftWidth - rightWidth);

    const line = barStyle.prefix + leftSide + " ".repeat(spacer) + rightSide + barStyle.reset;

    return [padToWidth(line, width)];
  }

  invalidate(): void {
    // No cache to clear
  }

  private stateIcon(state: string): string {
    const spinStyle = this.theme.resolve("accent");
    const streamStyle = this.theme.resolve("info");
    const idleStyle = this.theme.resolve("dim");
    const errStyle = this.theme.resolve("error");

    switch (state) {
      case "thinking":
        return `${spinStyle.prefix}◐${spinStyle.reset}`;
      case "streaming":
        return `${streamStyle.prefix}▶${streamStyle.reset}`;
      case "idle":
        return `${idleStyle.prefix}○${idleStyle.reset}`;
      case "error":
        return `${errStyle.prefix}✖${errStyle.reset}`;
      default:
        return " ";
    }
  }

  private fmt(n: number): string {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  private shortenPath(path: string, maxLen: number): string {
    if (path.length <= maxLen) return path;
    // Keep the last component
    const parts = path.split("/");
    if (parts.length <= 1) return path.slice(-maxLen);
    const last = parts[parts.length - 1];
    const prefix = "…/";
    const available = maxLen - prefix.length - last.length;
    if (available <= 0) return `${prefix}${last.slice(-available)}`;
    const parent = parts[parts.length - 2] ?? "";
    if (parent.length <= available) return `${prefix}${parent}/${last}`;
    return `${prefix}${parent.slice(0, available)}/${last}`;
  }
}
