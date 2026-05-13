import type { ThemeDefinition } from "../theme.js";

/**
 * Dracula theme — https://draculatheme.com
 */
export const DRACULA_THEME: ThemeDefinition = {
  name: "dracula",
  styles: {
    // ── Base text ──
    text: { fg: "#f8f8f2" },
    dim: { fg: "#6272a4" },
    bold: { bold: true },
    muted: { fg: "#6272a4", dim: true },

    // ── Chat messages ──
    "chat.user": { fg: "#50fa7b", bold: true },
    "chat.assistant": { fg: "#f8f8f2" },
    "chat.tool": { fg: "#ffb86c", italic: true },
    "chat.error": { fg: "#ff5555", bold: true },
    "chat.reasoning": { fg: "#6272a4", dim: true },
    "chat.thinking": { fg: "#bd93f9", italic: true },

    // ── Editor ──
    "editor.prompt": { fg: "#bd93f9", bold: true },
    "editor.text": { fg: "#f8f8f2" },
    "editor.cursor": { fg: "#282a36", bg: "#ff79c6" },

    // ── Status bar ──
    "status.bar": { fg: "#f8f8f2", bg: "#44475a" },
    "status.model": { fg: "#50fa7b", bg: "#44475a", bold: true },
    "status.tokens": { fg: "#6272a4", bg: "#44475a" },

    // ── Tool progress ──
    "tool.name": { fg: "#8be9fd", bold: true },
    "tool.output": { fg: "#f8f8f2" },
    "tool.diff.add": { fg: "#50fa7b" },
    "tool.diff.remove": { fg: "#ff5555" },

    // ── UI elements ──
    "panel.border": { fg: "#44475a" },
    "panel.title": { fg: "#bd93f9", bold: true },
    "overlay.bg": { fg: "#f8f8f2", bg: "#282a36" },
    "selector.active": { fg: "#282a36", bg: "#bd93f9" },
    "selector.inactive": { fg: "#6272a4" },
    loader: { fg: "#f1fa8c" },

    // ── Syntax highlighting ──
    "syntax.keyword": { fg: "#ff79c6", bold: true },
    "syntax.string": { fg: "#f1fa8c" },
    "syntax.comment": { fg: "#6272a4", italic: true },
    "syntax.number": { fg: "#bd93f9" },
    "syntax.function": { fg: "#50fa7b" },
    "syntax.type": { fg: "#8be9fd" },
    "syntax.operator": { fg: "#ff79c6" },
    "syntax.punctuation": { fg: "#f8f8f2" },
    "syntax.property": { fg: "#8be9fd" },
    "syntax.tag": { fg: "#ff79c6" },
    "syntax.attribute": { fg: "#50fa7b" },
    "syntax.plain": { fg: "#f8f8f2" },

    // ── Markdown ──
    "markdown.h1": { fg: "#bd93f9", bold: true },
    "markdown.h2": { fg: "#bd93f9", bold: true },
    "markdown.h3": { fg: "#bd93f9", bold: true },
    "markdown.bold": { bold: true },
    "markdown.italic": { italic: true },
    "markdown.code": { fg: "#f1fa8c" },
    "markdown.link": { fg: "#8be9fd", underline: true },
    "markdown.bullet": { fg: "#50fa7b" },
    "markdown.number": { fg: "#50fa7b" },
    "markdown.quote": { fg: "#6272a4", italic: true },

    // ── Tool call boxes ──
    "tool.box.border": { fg: "#44475a" },
    "tool.box.title": { fg: "#8be9fd", bold: true },
    "tool.box.icon": { fg: "#50fa7b" },
    "tool.box.path": { fg: "#f1fa8c" },
    "tool.box.meta": { fg: "#6272a4" },

    // ── Accent colors ──
    accent: { fg: "#bd93f9" },
    success: { fg: "#50fa7b" },
    warning: { fg: "#ffb86c" },
    error: { fg: "#ff5555" },
    info: { fg: "#8be9fd" },
  },
};
