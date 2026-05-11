import type { Theme } from "../theme.js";
/**
 * Chat message component: renders a single chat message with role styling.
 *
 * Handles user, assistant, tool, and error messages with appropriate
 * theme styles. Supports reasoning/thinking display.
 */
import { type Component, truncateToWidth, visibleWidth } from "./component.js";

export type ChatRole = "user" | "assistant" | "tool" | "error" | "system";

export interface ChatMessageConfig {
  /** The message role (determines styling). */
  role: ChatRole;
  /** Message content. */
  content: string;
  /** Optional reasoning/thinking text shown before the main content. */
  reasoning?: string;
  /** Optional tool call info (for assistant messages). */
  toolCall?: string;
  /** Timestamp for display. */
  timestamp?: string;
  /** Whether content is a diff (shows with +/- coloring). */
  isDiff?: boolean;
}

export class ChatMessage implements Component {
  private config: ChatMessageConfig;
  private theme: Theme;
  private cache: { width: number; lines: string[] } | null = null;

  constructor(theme: Theme, config: ChatMessageConfig) {
    this.theme = theme;
    this.config = config;
  }

  /** Update the message content. */
  update(content: string): void {
    this.config = { ...this.config, content };
    this.cache = null;
  }

  /** Update reasoning text. */
  updateReasoning(reasoning: string): void {
    this.config = { ...this.config, reasoning };
    this.cache = null;
  }

  render(width: number, _height?: number): string[] {
    if (this.cache?.width === width) return this.cache.lines;

    const result: string[] = [];
    let styleName: string;

    switch (this.config.role) {
      case "user":
        styleName = "chat.user";
        break;
      case "assistant":
        styleName = "chat.assistant";
        break;
      case "tool":
        styleName = "chat.tool";
        break;
      case "error":
        styleName = "chat.error";
        break;
      default:
        styleName = "chat.assistant";
    }

    const { prefix, reset } = this.theme.resolve(styleName);
    const dimStyle = this.theme.resolve("chat.reasoning");
    const thinkStyle = this.theme.resolve("chat.thinking");

    // ── Role label ──
    const roleLabel = this.getRoleLabel();
    if (roleLabel !== "") {
      result.push(`${prefix}${roleLabel}${reset}`);
    }

    // ── Reasoning/thinking ──
    if (this.config.reasoning) {
      const thinkPrefix = thinkStyle.prefix || dimStyle.prefix;
      const thinkReset = thinkStyle.reset || dimStyle.reset;
      for (const line of this.wrapText(this.config.reasoning, width - 4)) {
        result.push(`  ${thinkPrefix}${line}${thinkReset}`);
      }
    }

    // ── Tool call ──
    if (this.config.toolCall) {
      const toolStyle = this.theme.resolve("tool.name");
      result.push(`  ${toolStyle.prefix}${this.config.toolCall}${toolStyle.reset}`);
    }

    // ── Content ──
    if (this.config.content) {
      if (this.config.isDiff) {
        // Render diff with +/- coloring
        for (const line of this.config.content.split("\n")) {
          const diffLine = this.renderDiffLine(line, width - 2);
          result.push(`  ${diffLine}`);
        }
      } else {
        for (const line of this.wrapText(this.config.content, width - 2)) {
          result.push(`  ${prefix}${line}${reset}`);
        }
      }
    }

    this.cache = { width, lines: result };
    return result;
  }

  invalidate(): void {
    this.cache = null;
  }

  private getRoleLabel(): string {
    switch (this.config.role) {
      case "user":
        return "You";
      case "assistant":
        return "Dhara";
      case "tool":
        return this.config.toolCall ? "" : "Tool";
      case "error":
        return "Error";
      default:
        return "";
    }
  }

  private renderDiffLine(line: string, maxWidth: number): string {
    const addStyle = this.theme.resolve("tool.diff.add");
    const remStyle = this.theme.resolve("tool.diff.remove");

    if (line.startsWith("+")) {
      return `${addStyle.prefix}${truncateToWidth(line, maxWidth)}${addStyle.reset}`;
    }
    if (line.startsWith("-")) {
      return `${remStyle.prefix}${truncateToWidth(line, maxWidth)}${remStyle.reset}`;
    }
    return truncateToWidth(line, maxWidth);
  }

  private wrapText(text: string, width: number): string[] {
    const result: string[] = [];
    const paragraphs = text.split("\n");

    for (const paragraph of paragraphs) {
      if (paragraph === "") {
        result.push("");
        continue;
      }

      const words = paragraph.split(" ");
      let current = "";

      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (visibleWidth(test) <= width) {
          current = test;
        } else {
          if (current) result.push(current);
          current = word;
        }
      }
      if (current) result.push(current);
    }

    return result;
  }
}
