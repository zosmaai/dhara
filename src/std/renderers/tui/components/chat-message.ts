/**
 * Chat message component: renders a single chat message with rich formatting.
 *
 * Supports:
 * - Markdown rendering (bold, italic, inline code, headers, lists, quotes)
 * - Syntax-highlighted code blocks with line numbers
 * - Rich unified diff rendering with line numbers
 * - Styled tool call boxes
 * - Word wrapping
 */
import type { Theme } from "../theme.js";
import { type Component, truncateToWidth, visibleWidth } from "./component.js";
import { renderMarkdown, wrapRenderedMarkdown } from "./markdown.js";
import { highlightCode } from "./syntax-highlight.js";

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
    const roleStyle = this.theme.resolve(this.getRoleStyleName());
    const dimStyle = this.theme.resolve("dim");
    const thinkStyle = this.theme.resolve("chat.thinking");

    // ── Role label ──
    const roleLabel = this.getRoleLabel();
    if (roleLabel !== "") {
      result.push(`${roleStyle.prefix}${roleLabel}${roleStyle.reset}`);
      result.push("");
    }

    // ── Reasoning/thinking ──
    if (this.config.reasoning) {
      const thinkPrefix = thinkStyle.prefix || dimStyle.prefix;
      const thinkReset = thinkStyle.reset || dimStyle.reset;
      const thinkLines = this.wrapText(this.config.reasoning, width - 6);
      for (const line of thinkLines) {
        result.push(`  ${dimStyle.prefix}├${dimStyle.reset} ${thinkPrefix}${line}${thinkReset}`);
      }
      result.push("");
    }

    // ── Tool call ──
    if (this.config.toolCall) {
      result.push(...this.renderToolCall(this.config.toolCall, width));
      result.push("");
    }

    // ── Content ──
    if (this.config.content) {
      if (this.config.isDiff) {
        result.push(...this.renderDiff(this.config.content, width));
      } else if (this.isFencedCodeBlock(this.config.content)) {
        result.push(...this.renderCodeBlock(this.config.content, width));
      } else if (this.isToolOutput(this.config.content)) {
        result.push(...this.renderToolOutput(this.config.content, width));
      } else {
        // Full markdown rendering
        const mdLines = renderMarkdown(this.config.content, this.theme, width - 4);
        const wrapped = wrapRenderedMarkdown(mdLines, width - 2);
        for (const line of wrapped) {
          result.push(`  ${line}`);
        }
      }
    }

    this.cache = { width, lines: result };
    return result;
  }

  invalidate(): void {
    this.cache = null;
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private getRoleStyleName(): string {
    switch (this.config.role) {
      case "user":
        return "chat.user";
      case "assistant":
        return "chat.assistant";
      case "tool":
        return "chat.tool";
      case "error":
        return "chat.error";
      default:
        return "chat.assistant";
    }
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
      case "system":
        return "";
      default:
        return "";
    }
  }

  private isFencedCodeBlock(content: string): boolean {
    const trimmed = content.trim();
    // Only match when the ENTIRE content is a single fenced code block
    return /^```\w*\n[\s\S]*?```\s*$/.test(trimmed) && !trimmed.slice(3).includes("```\n");
  }

  private isToolOutput(content: string): boolean {
    // Heuristic: tool outputs often start with file paths or command names
    const firstLine = content.split("\n")[0] ?? "";
    return (
      /^\s*(write|edit|bash|grep|find|read|ls|cat|cd|mkdir|rm|mv|cp|npm|cargo|git|npx)\s+/.test(
        firstLine,
      ) ||
      /^Command (exited|failed)/.test(firstLine) ||
      /^\s*~\//.test(firstLine)
    );
  }

  // ── Renderers ────────────────────────────────────────────────────────

  private renderCodeBlock(content: string, width: number): string[] {
    const borderStyle = this.theme.resolve("panel.border");
    const headerStyle = this.theme.resolve("panel.title");

    const lines = content.trim().split("\n");
    const firstLine = lines[0]?.trim() ?? "";
    const lang = firstLine.startsWith("```") ? firstLine.slice(3).trim() : "";

    const innerWidth = Math.max(1, width - 6);
    const result: string[] = [];

    // Header bar
    const langLabel = lang ? ` ${lang} ` : "";
    const headerContent = langLabel ? `${headerStyle.prefix}${langLabel}${headerStyle.reset}` : "";
    const headerPlainWidth = visibleWidth(langLabel);
    const remaining = innerWidth - headerPlainWidth;
    const left = "─".repeat(Math.max(0, Math.floor(remaining / 2)));
    const right = "─".repeat(Math.max(0, remaining - Math.floor(remaining / 2)));
    result.push(`  ${borderStyle.prefix}┌${left}${headerContent}${right}┐${borderStyle.reset}`);

    // Body
    const codeContent = lines
      .slice(1, lines[lines.length - 1]?.trim() === "```" ? -1 : undefined)
      .join("\n");
    const highlighted = highlightCode(codeContent, this.theme, {
      language: lang,
      maxWidth: innerWidth - 2,
      lineNumbers: true,
    });

    for (const hl of highlighted) {
      const padded = padToVisibleWidth(hl, innerWidth);
      result.push(
        `  ${borderStyle.prefix}│${borderStyle.reset} ${padded} ${borderStyle.prefix}│${borderStyle.reset}`,
      );
    }

    // Footer
    result.push(`  ${borderStyle.prefix}└${"─".repeat(innerWidth)}┘${borderStyle.reset}`);

    return result;
  }

  private renderDiff(content: string, width: number): string[] {
    const addStyle = this.theme.resolve("tool.diff.add");
    const remStyle = this.theme.resolve("tool.diff.remove");
    const dimStyle = this.theme.resolve("dim");
    const infoStyle = this.theme.resolve("info");
    const borderStyle = this.theme.resolve("panel.border");

    const lines = content.split("\n");
    const result: string[] = [];
    const innerWidth = Math.max(1, width - 8);

    // Diff header box
    const diffFile =
      lines.find((l) => l.startsWith("diff --git"))?.replace("diff --git ", "") ?? "";
    if (diffFile) {
      const titleStyle = this.theme.resolve("tool.box.title");
      const iconStyle = this.theme.resolve("tool.box.icon");
      const pathStyle = this.theme.resolve("tool.box.path");
      const plainFile = diffFile.replace(/\t/g, " → ");
      const title = `${iconStyle.prefix}↔${iconStyle.reset} ${titleStyle.prefix}diff${titleStyle.reset} ${pathStyle.prefix}${truncateToWidth(plainFile, innerWidth - 10)}${pathStyle.reset}`;
      result.push(`  ${borderStyle.prefix}┌${"─".repeat(innerWidth)}┐${borderStyle.reset}`);
      result.push(
        `  ${borderStyle.prefix}│${borderStyle.reset} ${padToVisibleWidth(title, innerWidth - 2)} ${borderStyle.prefix}│${borderStyle.reset}`,
      );
      result.push(`  ${borderStyle.prefix}├${"─".repeat(innerWidth)}┤${borderStyle.reset}`);
    }

    let oldLine = 0;
    let newLine = 0;
    let inHunk = false;

    for (const rawLine of lines) {
      const line = rawLine.replace(/\t/g, "  ");

      if (line.startsWith("diff --git")) continue;
      if (line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ")) {
        const metaStyle = this.theme.resolve("tool.box.meta");
        const padded = padToVisibleWidth(
          `${metaStyle.prefix}${truncateToWidth(line, innerWidth - 2)}${metaStyle.reset}`,
          innerWidth - 2,
        );
        result.push(
          `  ${borderStyle.prefix}│${borderStyle.reset} ${padded} ${borderStyle.prefix}│${borderStyle.reset}`,
        );
        continue;
      }

      const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
      if (hunkMatch) {
        oldLine = Number.parseInt(hunkMatch[1], 10);
        newLine = Number.parseInt(hunkMatch[2], 10);
        inHunk = true;
        const hunkLabel = `@@ ${hunkMatch[1]},${hunkMatch[2]} @@${hunkMatch[3]}`;
        const padded = padToVisibleWidth(
          `${infoStyle.prefix}${truncateToWidth(hunkLabel, innerWidth - 2)}${infoStyle.reset}`,
          innerWidth - 2,
        );
        result.push(
          `  ${borderStyle.prefix}│${borderStyle.reset} ${padded} ${borderStyle.prefix}│${borderStyle.reset}`,
        );
        continue;
      }

      if (!inHunk) {
        const padded = padToVisibleWidth(truncateToWidth(line, innerWidth - 2), innerWidth - 2);
        result.push(
          `  ${borderStyle.prefix}│${borderStyle.reset} ${padded} ${borderStyle.prefix}│${borderStyle.reset}`,
        );
        continue;
      }

      const numWidth = 4;
      const contentWidth = Math.max(1, innerWidth - numWidth * 2 - 5);

      if (line.startsWith("+")) {
        const content = line.slice(1);
        const oldNum = " ".repeat(numWidth);
        const newNumStr = String(newLine).padStart(numWidth, " ");
        const styledContent = `${addStyle.prefix}${truncateToWidth(content, contentWidth)}${addStyle.reset}`;
        const lineText = ` ${oldNum} ${newNumStr} ${addStyle.prefix}+${addStyle.reset} ${styledContent}`;
        const padded = padToVisibleWidth(lineText, innerWidth - 2);
        result.push(
          `  ${borderStyle.prefix}│${borderStyle.reset} ${padded} ${borderStyle.prefix}│${borderStyle.reset}`,
        );
        newLine++;
      } else if (line.startsWith("-")) {
        const content = line.slice(1);
        const oldNumStr = String(oldLine).padStart(numWidth, " ");
        const newNum = " ".repeat(numWidth);
        const styledContent = `${remStyle.prefix}${truncateToWidth(content, contentWidth)}${remStyle.reset}`;
        const lineText = ` ${oldNumStr} ${newNum} ${remStyle.prefix}-${remStyle.reset} ${styledContent}`;
        const padded = padToVisibleWidth(lineText, innerWidth - 2);
        result.push(
          `  ${borderStyle.prefix}│${borderStyle.reset} ${padded} ${borderStyle.prefix}│${borderStyle.reset}`,
        );
        oldLine++;
      } else if (line.startsWith(" ")) {
        const content = line.slice(1);
        const oldNumStr = String(oldLine).padStart(numWidth, " ");
        const newNumStr = String(newLine).padStart(numWidth, " ");
        const styledContent = truncateToWidth(content, contentWidth);
        const lineText = ` ${oldNumStr} ${newNumStr} ${styledContent}`;
        const padded = padToVisibleWidth(lineText, innerWidth - 2);
        result.push(
          `  ${borderStyle.prefix}│${borderStyle.reset} ${padded} ${borderStyle.prefix}│${borderStyle.reset}`,
        );
        oldLine++;
        newLine++;
      } else if (line.startsWith("\\")) {
        const padded = padToVisibleWidth(
          `${dimStyle.prefix}${truncateToWidth(line, innerWidth - 2)}${dimStyle.reset}`,
          innerWidth - 2,
        );
        result.push(
          `  ${borderStyle.prefix}│${borderStyle.reset} ${padded} ${borderStyle.prefix}│${borderStyle.reset}`,
        );
      } else {
        const padded = padToVisibleWidth(truncateToWidth(line, innerWidth - 2), innerWidth - 2);
        result.push(
          `  ${borderStyle.prefix}│${borderStyle.reset} ${padded} ${borderStyle.prefix}│${borderStyle.reset}`,
        );
      }
    }

    if (diffFile) {
      result.push(`  ${borderStyle.prefix}└${"─".repeat(innerWidth)}┘${borderStyle.reset}`);
    }

    return result;
  }

  private renderToolCall(toolCall: string, width: number): string[] {
    const borderStyle = this.theme.resolve("panel.border");
    const titleStyle = this.theme.resolve("tool.box.title");
    const iconStyle = this.theme.resolve("tool.box.icon");
    const pathStyle = this.theme.resolve("tool.box.path");
    const result: string[] = [];
    const innerWidth = Math.max(1, width - 8);

    // Parse tool call
    const parts = toolCall.split(/\s+/);
    const toolName = parts[0] ?? "tool";
    const toolPath = parts.slice(1).join(" ");

    const icon = this.getToolIcon(toolName);
    const title = `${iconStyle.prefix}${icon}${iconStyle.reset} ${titleStyle.prefix}${toolName}${titleStyle.reset}`;
    const path = toolPath
      ? ` ${pathStyle.prefix}${truncateToWidth(toolPath, innerWidth - visibleWidth(title) - 4)}${pathStyle.reset}`
      : "";

    result.push(`  ${borderStyle.prefix}┌${"─".repeat(innerWidth)}┐${borderStyle.reset}`);
    result.push(
      `  ${borderStyle.prefix}│${borderStyle.reset} ${padToVisibleWidth(title + path, innerWidth - 2)} ${borderStyle.prefix}│${borderStyle.reset}`,
    );
    result.push(`  ${borderStyle.prefix}└${"─".repeat(innerWidth)}┘${borderStyle.reset}`);

    return result;
  }

  private renderToolOutput(content: string, width: number): string[] {
    const borderStyle = this.theme.resolve("panel.border");
    const metaStyle = this.theme.resolve("tool.box.meta");
    const innerWidth = Math.max(1, width - 8);

    const result: string[] = [];
    const lines = content.split("\n");

    result.push(`  ${borderStyle.prefix}┌${"─".repeat(innerWidth)}┐${borderStyle.reset}`);

    for (const line of lines) {
      const clean = line.replace(/\t/g, "  ");
      const padded = padToVisibleWidth(
        `${metaStyle.prefix}${truncateToWidth(clean, innerWidth - 2)}${metaStyle.reset}`,
        innerWidth - 2,
      );
      result.push(
        `  ${borderStyle.prefix}│${borderStyle.reset} ${padded} ${borderStyle.prefix}│${borderStyle.reset}`,
      );
    }

    result.push(`  ${borderStyle.prefix}└${"─".repeat(innerWidth)}┘${borderStyle.reset}`);
    return result;
  }

  private getToolIcon(name: string): string {
    switch (name.toLowerCase()) {
      case "write":
        return "✎";
      case "edit":
        return "✐";
      case "read":
        return "📄";
      case "bash":
        return "⌘";
      case "grep":
        return "🔍";
      case "find":
        return "🔎";
      case "ls":
        return "📁";
      case "cat":
        return "📄";
      case "cd":
        return "→";
      case "mkdir":
        return "📂";
      case "rm":
        return "🗑";
      case "mv":
        return "⇄";
      case "cp":
        return "⎘";
      case "npm":
        return "📦";
      case "cargo":
        return "📦";
      case "git":
        return "🌿";
      case "npx":
        return "⚡";
      default:
        return "⚙";
    }
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

// ── Utilities ────────────────────────────────────────────────────────────

function padToVisibleWidth(text: string, minWidth: number): string {
  const current = visibleWidth(text);
  if (current >= minWidth) return text;
  return text + " ".repeat(minWidth - current);
}
