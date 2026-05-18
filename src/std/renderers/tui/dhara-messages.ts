/**
 * Dhara Message Components — UserMessage, AssistantMessage, ToolExecution.
 * Renders chat messages using pi-tui's Markdown and Text components.
 * Mirrors pi's AssistantMessageComponent, UserMessageComponent, ToolExecutionComponent.
 */
import { Container, Markdown, type MarkdownTheme, Spacer, Text } from "@earendil-works/pi-tui";
import { color, getMarkdownTheme } from "./dhara-theme.js";

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

export class AssistantMessageComponent extends Container {
  private md: Markdown;

  constructor(content: string, reasoning?: string, markdownTheme?: MarkdownTheme) {
    super();
    const theme = markdownTheme ?? getMarkdownTheme();

    // "Dhara" label
    this.addChild(new Text(` ${color.bold(color.accent("Dhara"))}`, 0, 0));

    // Reasoning (if any)
    if (reasoning) {
      this.addChild(new Text(` ${color.muted("▸ think")} ${color.dim(reasoning)}`, 0, 0));
    }

    // Content
    this.md = new Markdown(content, 1, 0, theme);
    this.addChild(this.md);
    this.addChild(new Spacer(1));
  }

  updateContent(content: string, reasoning?: string): void {
    this.clear();
    const theme = getMarkdownTheme();

    this.addChild(new Text(` ${color.bold(color.accent("Dhara"))}`, 0, 0));

    if (reasoning) {
      this.addChild(new Text(` ${color.muted("▸ think")} ${color.dim(reasoning)}`, 0, 0));
    }

    this.md = new Markdown(content, 1, 0, theme);
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

// ── Tool Execution ───────────────────────────────────────────────────

export class ToolExecutionComponent extends Container {
  constructor(toolName: string, content: string, isError = false) {
    super();

    // Tool title with background
    const bgFn = isError ? color.toolErrorBg : color.toolPendingBg;
    const statusIcon = isError ? color.error("✗") : color.muted("⚙");
    this.addChild(new Text(` ${statusIcon} ${color.bold(color.toolTitle(toolName))}`, 1, 0, bgFn));

    // Content
    this.addChild(new Text(`${color.muted(content)}`, 1, 0, bgFn));
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

// ── System / Status Message ──────────────────────────────────────────

export class SystemMessageComponent extends Container {
  constructor(content: string) {
    super();
    this.addChild(new Text(` ℹ ${color.dim(content)}`, 1, 0));
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
        ` ${color.error("●")} ${color.bold(color.error("Error"))}: ${color.error(content)}`,
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
