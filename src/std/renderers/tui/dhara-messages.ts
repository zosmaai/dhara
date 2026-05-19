/**
 * Dhara Message Components — UserMessage, AssistantMessage, ToolExecution.
 * Renders chat messages using pi-tui's Markdown and Text components.
 * Mirrors pi's AssistantMessageComponent, UserMessageComponent, ToolExecutionComponent.
 */
import { Container, Markdown, type MarkdownTheme, Spacer, Text } from "@earendil-works/pi-tui";
import { color, getMarkdownTheme } from "./dhara-theme.js";

// ── Diff Renderer ───────────────────────────────────────────────────
// Mirrors pi-coding-agent's diff.js
// Renders unified diff output with colored lines

import chalk from "chalk";
import * as Diff from "diff";

/**
 * Parse diff line to extract prefix, line number, and content.
 * Format: "+123 content" or "-123 content" or " 123 content" or "     ..."
 */
function parseDiffLine(line: string) {
  const match = line.match(/^([+\-\s])(\s*\d*)\s(.*)$/);
  if (!match) {
    return null;
  }
  return {
    prefix: match[1],
    lineNum: match[2],
    content: match[3],
  };
}

/**
 * Replace tabs with spaces for consistent rendering.
 */
function replaceTabs(text: string): string {
  return text.replace(/\t/g, "   ");
}

/**
 * Compute word-level diff and render with inverse on changed parts.
 * Uses diffWords which groups whitespace with adjacent words for cleaner highlighting.
 */
function renderIntraLineDiff(
  oldContent: string,
  newContent: string,
): { removedLine: string; addedLine: string } {
  const wordDiff = Diff.diffWords(oldContent, newContent);
  let removedLine = "";
  let addedLine = "";
  let isFirstRemoved = true;
  let isFirstAdded = true;

  for (const part of wordDiff) {
    if (part.removed) {
      let value = part.value;
      // Strip leading whitespace from the first removed part
      if (isFirstRemoved) {
        const leadingWs = value.match(/^(\s+)/)?.[1] ?? "";
        value = value.slice(leadingWs.length);
        removedLine += leadingWs;
        isFirstRemoved = false;
      }
      if (value) {
        removedLine += chalk.inverse(value);
      }
    } else if (part.added) {
      let value = part.value;
      // Strip leading whitespace from the first added part
      if (isFirstAdded) {
        const leadingWs = value.match(/^(\s+)/)?.[1] ?? "";
        value = value.slice(leadingWs.length);
        addedLine += leadingWs;
        isFirstAdded = false;
      }
      if (value) {
        addedLine += chalk.inverse(value);
      }
    } else {
      removedLine += part.value;
      addedLine += part.value;
    }
  }
  return { removedLine, addedLine };
}

/**
 * Render a diff string with colored lines and intra-line change highlighting.
 * - Context lines: dim/gray
 * - Removed lines: red, with inverse on changed tokens
 * - Added lines: green, with inverse on changed tokens
 */
export function renderDiff(diffText: string): string[] {
  const lines = diffText.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const parsed = parseDiffLine(line);

    if (!parsed) {
      result.push(color.toolDiffContext(line));
      i++;
      continue;
    }

    if (parsed.prefix === "-") {
      // Collect consecutive removed lines
      const removedLines: Array<{ lineNum: string; content: string }> = [];
      while (i < lines.length) {
        const p = parseDiffLine(lines[i]);
        if (!p || p.prefix !== "-") {
          break;
        }
        removedLines.push({ lineNum: p.lineNum, content: p.content });
        i++;
      }

      // Collect consecutive added lines
      const addedLines: Array<{ lineNum: string; content: string }> = [];
      while (i < lines.length) {
        const p = parseDiffLine(lines[i]);
        if (!p || p.prefix !== "+") {
          break;
        }
        addedLines.push({ lineNum: p.lineNum, content: p.content });
        i++;
      }

      // Only do intra-line diffing when there's exactly one removed and one added line
      if (removedLines.length === 1 && addedLines.length === 1) {
        const removed = removedLines[0];
        const added = addedLines[0];
        const { removedLine, addedLine } = renderIntraLineDiff(
          replaceTabs(removed.content),
          replaceTabs(added.content),
        );
        result.push(color.toolDiffRemoved(`-${removed.lineNum} ${removedLine}`));
        result.push(color.toolDiffAdded(`+${added.lineNum} ${addedLine}`));
      } else {
        // Show all removed lines first, then all added lines
        for (const removed of removedLines) {
          result.push(color.toolDiffRemoved(`-${removed.lineNum} ${replaceTabs(removed.content)}`));
        }
        for (const added of addedLines) {
          result.push(color.toolDiffAdded(`+${added.lineNum} ${replaceTabs(added.content)}`));
        }
      }
    } else if (parsed.prefix === "+") {
      // Standalone added line
      result.push(color.toolDiffAdded(`+${parsed.lineNum} ${replaceTabs(parsed.content)}`));
      i++;
    } else {
      // Context line
      result.push(color.toolDiffContext(` ${parsed.lineNum} ${replaceTabs(parsed.content)}`));
      i++;
    }
  }

  return result;
}

// ── Types ─────────────────────────────────────────────────────────────

export interface MessageConfig {
  role: "user" | "assistant" | "tool" | "error" | "system";
  content: string;
  toolCall?: string;
  reasoning?: string;
  isDiff?: boolean;
}

// ── User Message ─────────────────────────────────────────────────────

export class UserMessageComponent extends Container {
  private md: Markdown;

  constructor(content: string, markdownTheme?: MarkdownTheme) {
    super();
    const theme = markdownTheme ?? getMarkdownTheme();

    // "You" label
    this.addChild(new Text(` ${color.bold("You")}`, 0, 0));

    // Content with user message background
    this.md = new Markdown(content, 1, 0, theme, {
      bgColor: (s: string) => color.userMsgBg(s),
    });
    this.addChild(this.md);
    this.addChild(new Spacer(1));
  }

  render(width: number): string[] {
    const lines: string[] = [];
    for (const child of this.children) {
      for (const l of child.render(width)) lines.push(l);
    }
    return lines;
  }
}

// ── Assistant Message ────────────────────────────────────────────────
// Mirrors pi-coding-agent's AssistantMessageComponent
// Supports thinking tokens with "▸ think" label and inline content
export class AssistantMessageComponent extends Container {
  private md!: Markdown;
  private reasoningText: string = "";
  private mdTheme: MarkdownTheme;

  constructor(content: string, reasoning?: string, markdownTheme?: MarkdownTheme) {
    super();
    this.mdTheme = markdownTheme ?? getMarkdownTheme();

    // "Dhara" label
    this.addChild(new Text(` ${color.bold(color.accent("Dhara"))}`, 0, 0));
    this.addChild(new Spacer(1));

    // Reasoning/thinking tokens — shown before content when present
    if (reasoning) {
      const thinkingLabel = color.thinkingText(`\u25B8 think`);
      this.addChild(new Text(`  ${thinkingLabel}`, 1, 0));
      this.addChild(new Text(`  ${color.thinkingText(reasoning)}`, 1, 0));
      this.addChild(new Spacer(1));
    }

    // Content (rendered as Markdown with proper padding)
    if (content) {
      this.md = new Markdown(content, 1, 0, this.mdTheme);
      this.addChild(this.md);
      this.addChild(new Spacer(1));
    }
  }

  updateContent(content: string, reasoning?: string): void {
    this.clear();
    this.reasoningText = reasoning ?? "";

    const theme = getMarkdownTheme();

    this.addChild(new Text(` ${color.bold(color.accent("Dhara"))}`, 0, 0));
    this.addChild(new Spacer(1));

    // Reasoning/thinking tokens
    if (this.reasoningText) {
      const thinkingLabel = color.thinkingText(`\u25B8 think`);
      this.addChild(new Text(`  ${thinkingLabel}`, 1, 0));
      this.addChild(new Text(`  ${color.thinkingText(this.reasoningText)}`, 1, 0));
      this.addChild(new Spacer(1));
    }

    // Content
    if (content) {
      this.md = new Markdown(content, 1, 0, theme);
      this.addChild(this.md);
      this.addChild(new Spacer(1));
    }
  }

  render(width: number): string[] {
    const lines: string[] = [];
    for (const child of this.children) {
      for (const l of child.render(width)) lines.push(l);
    }
    return lines;
  }
}

// ── Preview line limit ───────────────────────────────────────────────
// Matches pi-coding-agent behavior: show last N lines when collapsed
const PREVIEW_LINES = 20;

// ── Tool Execution ───────────────────────────────────────────────────
// Mirrors pi-coding-agent's ToolExecutionComponent
// Shows loader animation before result, with proper diff rendering support
export class ToolExecutionComponent extends Container {
  private toolTitle: Text;
  private contentText: Text;
  private isError: boolean;
  private fullContent: string = "";
  private hasDiff: boolean = false;
  private _expanded = false;

  /** Whether this tool result is showing expanded (full) or collapsed (preview) content. */
  get expanded(): boolean {
    return this._expanded;
  }

  constructor(toolName: string, content: string, isError = false) {
    super();
    this.isError = isError;
    this.fullContent = content;

    // Tool title with background
    const bgFn = isError ? color.toolErrorBg : color.toolPendingBg;
    const statusIcon = isError ? color.error("\u2717") : color.muted("\u2699");

    this.toolTitle = new Text(
      ` ${statusIcon} ${color.bold(color.toolTitle(toolName))}`,
      1,
      0,
      bgFn,
    );

    // Content text with proper styling
    this.contentText = new Text(content, 1, 0, isError ? color.toolErrorBg : color.toolSuccessBg);

    this.addChild(new Spacer(1));
    this.addChild(this.toolTitle);
    this.addChild(this.contentText);
    this.addChild(new Spacer(1));
  }

  /**
   * Set whether the tool result is expanded (shows full output) or collapsed (preview only).
   */
  setExpanded(expanded: boolean): void {
    if (this._expanded === expanded) return;
    this._expanded = expanded;
    this.updateDisplay();
  }

  /** Rebuild children based on current expanded state */
  private updateDisplay(): void {
    this.clear();
    this.addChild(new Spacer(1));
    this.addChild(this.toolTitle);

    const bgFn = this.isError ? color.toolErrorBg : color.toolSuccessBg;

    if (this.hasDiff) {
      // Diff mode: show all diff lines
      // Diff content is already pre-rendered; stored in fullContent
      const diffLines = this.fullContent.split("\n");
      for (const line of diffLines) {
        this.addChild(new Text(line, 1, 0, bgFn));
      }
    } else {
      // Plain text: apply preview truncation based on expanded state
      const lines = this.fullContent.split("\n");
      const showLines = this._expanded ? lines : lines.slice(-PREVIEW_LINES);
      const hiddenCount = lines.length - showLines.length;

      this.contentText = new Text(showLines.join("\n"), 1, 0, bgFn);
      this.addChild(this.contentText);

      // Status line showing hidden count
      if (hiddenCount > 0) {
        const hint = color.dim(`  (${hiddenCount} more lines hidden. Ctrl+O to expand)`);
        this.addChild(new Text(hint, 1, 0, bgFn));
      } else if (this._expanded && lines.length > PREVIEW_LINES) {
        const hint = color.dim(`  (Ctrl+O to collapse)`);
        this.addChild(new Text(hint, 1, 0, bgFn));
      }
    }

    this.addChild(new Spacer(1));
  }

  updateContent(content: string, isError?: boolean): void {
    this.fullContent = content;
    this.hasDiff = false;
    this.isError = isError ?? this.isError;
    this.updateDisplay();
  }

  // Update to show diff rendering instead of plain text
  updateContentWithDiff(diffText: string, isError?: boolean): void {
    this.fullContent = diffText;
    this.hasDiff = true;
    this.isError = isError ?? this.isError;
    this.updateDisplay();
  }

  render(width: number): string[] {
    const lines: string[] = [];
    for (const child of this.children) {
      for (const l of child.render(width)) lines.push(l);
    }
    return lines;
  }
}

// ── System / Status Message ──────────────────────────────────────────

export class SystemMessageComponent extends Container {
  constructor(content: string) {
    super();
    this.addChild(new Text(` \u2139 ${color.dim(content)}`, 1, 0));
    this.addChild(new Spacer(1));
  }

  render(width: number): string[] {
    const lines: string[] = [];
    for (const child of this.children) {
      for (const l of child.render(width)) lines.push(l);
    }
    return lines;
  }
}

// ── Error Message ────────────────────────────────────────────────────

export class ErrorMessageComponent extends Container {
  constructor(content: string) {
    super();
    this.addChild(
      new Text(
        ` ${color.error("\u25CF")} ${color.bold(color.error("Error"))}: ${color.error(content)}`,
        1,
        0,
        color.toolErrorBg,
      ),
    );
    this.addChild(new Spacer(1));
  }

  render(width: number): string[] {
    const lines: string[] = [];
    for (const child of this.children) {
      for (const l of child.render(width)) lines.push(l);
    }
    return lines;
  }
}
