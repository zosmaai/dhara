/**
 * Markdown renderer for TUI chat messages.
 *
 * Supports: bold, italic, inline code, headers, bullet lists,
 * numbered lists, blockquotes, horizontal rules, and code blocks.
 *
 * Code blocks are delegated to the syntax highlighter.
 */

import type { Theme } from "../theme.js";
import { truncateToWidth, visibleWidth } from "./component.js";
import { highlightCode } from "./syntax-highlight.js";

// ── Inline formatting ────────────────────────────────────────────────────

export interface RenderedLine {
  text: string;
  /** Indent level for lists (0 = no list). */
  indent: number;
  /** Whether this is a code block line (should not be re-wrapped). */
  isCode: boolean;
  /** Whether this is a diff line. */
  isDiff: boolean;
}

/**
 * Parse markdown text and render it as styled lines.
 *
 * Returns an array of {text, indent, isCode} objects that the
 * caller can further process (e.g. word-wrap non-code lines).
 */
export function renderMarkdown(text: string, theme: Theme, maxWidth: number): RenderedLine[] {
  const lines = text.split("\n");
  const result: RenderedLine[] = [];

  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block fence
    const fenceMatch = line.match(/^(\s*)```(\w*)\s*$/);
    if (fenceMatch) {
      if (inCodeBlock) {
        // End code block
        const codeContent = codeBuffer.join("\n");
        const highlighted = highlightCode(`\`\`\`${codeLang}\n${codeContent}\n\`\`\``, theme, {
          maxWidth: maxWidth - 4,
        });
        for (const hl of highlighted) {
          result.push({ text: `  ${hl}`, indent: 0, isCode: true, isDiff: false });
        }
        inCodeBlock = false;
        codeBuffer = [];
        codeLang = "";
      } else {
        // Start code block
        inCodeBlock = true;
        codeLang = fenceMatch[2] ?? "";
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Diff block (unified diff) — only start on clear diff headers
    if (line.match(/^diff --git /) || line.match(/^@@ -\d+/) || line.match(/^index [a-f0-9]/)) {
      // Collect the diff
      const diffLines: string[] = [line];
      let j = i + 1;
      while (j < lines.length && !lines[j].match(/^```\s*$/)) {
        diffLines.push(lines[j]);
        j++;
      }
      const rendered = renderDiffBlock(diffLines, theme, maxWidth);
      for (const dl of rendered) {
        result.push({ text: dl, indent: 0, isCode: true, isDiff: true });
      }
      i = j - 1;
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      const dim = theme.resolve("dim");
      result.push({
        text: `${dim.prefix}${"─".repeat(maxWidth)}${dim.reset}`,
        indent: 0,
        isCode: false,
        isDiff: false,
      });
      continue;
    }

    // Header
    const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const content = headerMatch[2];
      const styleName = level === 1 ? "markdown.h1" : level === 2 ? "markdown.h2" : "markdown.h3";
      const style = theme.resolve(styleName);
      const prefix = level === 1 ? "# " : level === 2 ? "## " : "### ";
      result.push({
        text: `${style.prefix}${prefix}${renderInline(content, theme)}${style.reset}`,
        indent: 0,
        isCode: false,
        isDiff: false,
      });
      continue;
    }

    // Blockquote
    const quoteMatch = line.match(/^(\s*)>\s?(.*)$/);
    if (quoteMatch) {
      const content = quoteMatch[2];
      const style = theme.resolve("markdown.quote");
      const bar = theme.resolve("dim");
      result.push({
        text: `${bar.prefix}│${bar.reset} ${style.prefix}${renderInline(content, theme)}${style.reset}`,
        indent: 0,
        isCode: false,
        isDiff: false,
      });
      continue;
    }

    // Bullet list
    const bulletMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (bulletMatch) {
      const indent = Math.floor(bulletMatch[1].length / 2);
      const content = bulletMatch[2];
      const bulletStyle = theme.resolve("markdown.bullet");
      const prefix = `${bulletStyle.prefix}•${bulletStyle.reset}`;
      result.push({
        text: `${"  ".repeat(indent)}${prefix} ${renderInline(content, theme)}`,
        indent,
        isCode: false,
        isDiff: false,
      });
      continue;
    }

    // Numbered list
    const numMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (numMatch) {
      const indent = Math.floor(numMatch[1].length / 2);
      const num = numMatch[2];
      const content = numMatch[3];
      const numStyle = theme.resolve("markdown.number");
      const prefix = `${numStyle.prefix}${num}.${numStyle.reset}`;
      result.push({
        text: `${"  ".repeat(indent)}${prefix} ${renderInline(content, theme)}`,
        indent,
        isCode: false,
        isDiff: false,
      });
      continue;
    }

    // Plain line with inline formatting
    result.push({
      text: renderInline(line, theme),
      indent: 0,
      isCode: false,
      isDiff: false,
    });
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBuffer.length > 0) {
    const codeContent = codeBuffer.join("\n");
    const highlighted = highlightCode(`\`\`\`${codeLang}\n${codeContent}\n\`\`\``, theme, {
      maxWidth: maxWidth - 4,
    });
    for (const hl of highlighted) {
      result.push({ text: `  ${hl}`, indent: 0, isCode: true, isDiff: false });
    }
  }

  return result;
}

/**
 * Render inline markdown: bold, italic, inline code, links.
 */
export function renderInline(text: string, theme: Theme): string {
  let result = text;

  // Inline code
  const codeStyle = theme.resolve("markdown.code");
  result = result.replace(/`([^`]+)`/g, `${codeStyle.prefix}$1${codeStyle.reset}`);

  // Bold (**text** or __text__)
  const boldStyle = theme.resolve("bold");
  result = result.replace(
    /\*\*([^*]+)\*\*|__([^_]+)__/g,
    (_m, s1, s2) => `${boldStyle.prefix}${s1 ?? s2}${boldStyle.reset}`,
  );

  // Italic (*text* or _text_)
  const italicStyle = theme.resolve("markdown.italic");
  result = result.replace(
    /(?<!\*)\*([^*]+)\*(?!\*)|(?<!_)_([^_]+)_(?!_)/g,
    (_m, s1, s2) => `${italicStyle.prefix}${s1 ?? s2}${italicStyle.reset}`,
  );

  // Links [text](url)
  const linkStyle = theme.resolve("markdown.link");
  const dimStyle = theme.resolve("dim");
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, label) =>
      `${linkStyle.prefix}${label}${linkStyle.reset}${dimStyle.prefix}↗${dimStyle.reset}`,
  );

  return result;
}

/**
 * Render a unified diff block with line numbers and background tints.
 */
export function renderDiffBlock(lines: string[], theme: Theme, maxWidth: number): string[] {
  const result: string[] = [];
  const addStyle = theme.resolve("tool.diff.add");
  const remStyle = theme.resolve("tool.diff.remove");
  const dimStyle = theme.resolve("dim");
  const infoStyle = theme.resolve("info");

  // Header
  const headerStyle = theme.resolve("tool.name");

  let oldLine = 0;
  let newLine = 0;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "  ");

    // Diff header
    if (line.startsWith("diff --git")) {
      result.push(`${headerStyle.prefix}${truncateToWidth(line, maxWidth)}${headerStyle.reset}`);
      continue;
    }
    if (line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ")) {
      result.push(`${dimStyle.prefix}${truncateToWidth(line, maxWidth)}${dimStyle.reset}`);
      continue;
    }

    // Hunk header
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLine = Number.parseInt(hunkMatch[1], 10);
      newLine = Number.parseInt(hunkMatch[2], 10);
      result.push(`${infoStyle.prefix}${truncateToWidth(line, maxWidth)}${infoStyle.reset}`);
      continue;
    }

    // Line numbers and content
    const numWidth = 4;
    const contentWidth = Math.max(1, maxWidth - numWidth * 2 - 4);

    if (line.startsWith("+")) {
      const content = line.slice(1);
      const oldNum = " ".repeat(numWidth);
      const newNumStr = String(newLine).padStart(numWidth, " ");
      const styled = `${addStyle.prefix}${truncateToWidth(content, contentWidth)}${addStyle.reset}`;
      result.push(` ${oldNum} ${newNumStr} │${addStyle.prefix}+${addStyle.reset} ${styled}`);
      newLine++;
    } else if (line.startsWith("-")) {
      const content = line.slice(1);
      const oldNumStr = String(oldLine).padStart(numWidth, " ");
      const newNum = " ".repeat(numWidth);
      const styled = `${remStyle.prefix}${truncateToWidth(content, contentWidth)}${remStyle.reset}`;
      result.push(` ${oldNumStr} ${newNum} │${remStyle.prefix}-${remStyle.reset} ${styled}`);
      oldLine++;
    } else if (line.startsWith(" ")) {
      const content = line.slice(1);
      const oldNumStr = String(oldLine).padStart(numWidth, " ");
      const newNumStr = String(newLine).padStart(numWidth, " ");
      const styled = truncateToWidth(content, contentWidth);
      result.push(` ${oldNumStr} ${newNumStr} │ ${styled}`);
      oldLine++;
      newLine++;
    } else {
      result.push(truncateToWidth(line, maxWidth));
    }
  }

  return result;
}

/**
 * Word-wrap rendered markdown lines to fit a width.
 * Code/diff lines are not wrapped.
 */
export function wrapRenderedMarkdown(lines: RenderedLine[], maxWidth: number): string[] {
  const result: string[] = [];

  for (const line of lines) {
    if (line.isCode || line.isDiff) {
      result.push(line.text);
      continue;
    }

    const indentStr = "  ".repeat(line.indent);
    const availableWidth = maxWidth - visibleWidth(indentStr);
    const text = line.text;

    if (visibleWidth(text) <= availableWidth) {
      result.push(`${indentStr}${text}`);
      continue;
    }

    // Word wrap
    const words = text.split(" ");
    let current = "";

    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (visibleWidth(test) <= availableWidth) {
        current = test;
      } else {
        if (current) result.push(`${indentStr}${current}`);
        current = word;
      }
    }
    if (current) result.push(`${indentStr}${current}`);
  }

  return result;
}
