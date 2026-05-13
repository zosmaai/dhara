import type { ThemeDefinition } from "../theme.js";

/**
 * Nord theme — https://nordtheme.com
 */
export const NORD_THEME: ThemeDefinition = {
  name: "nord",
  styles: {
    // ── Base text ──
    text: { fg: "#eceff4" },
    dim: { fg: "#616e88" },
    bold: { bold: true },
    muted: { fg: "#616e88", dim: true },

    // ── Chat messages ──
    "chat.user": { fg: "#a3be8c", bold: true },
    "chat.assistant": { fg: "#eceff4" },
    "chat.tool": { fg: "#d08770", italic: true },
    "chat.error": { fg: "#bf616a", bold: true },
    "chat.reasoning": { fg: "#616e88", dim: true },
    "chat.thinking": { fg: "#b48ead", italic: true },

    // ── Editor ──
    "editor.prompt": { fg: "#b48ead", bold: true },
    "editor.text": { fg: "#eceff4" },
    "editor.cursor": { fg: "#2e3440", bg: "#88c0d0" },

    // ── Status bar ──
    "status.bar": { fg: "#d8dee9", bg: "#434c5e" },
    "status.model": { fg: "#a3be8c", bg: "#434c5e", bold: true },
    "status.tokens": { fg: "#616e88", bg: "#434c5e" },

    // ── Tool progress ──
    "tool.name": { fg: "#81a1c1", bold: true },
    "tool.output": { fg: "#eceff4" },
    "tool.diff.add": { fg: "#a3be8c" },
    "tool.diff.remove": { fg: "#bf616a" },

    // ── UI elements ──
    "panel.border": { fg: "#434c5e" },
    "panel.title": { fg: "#b48ead", bold: true },
    "overlay.bg": { fg: "#eceff4", bg: "#2e3440" },
    "selector.active": { fg: "#2e3440", bg: "#b48ead" },
    "selector.inactive": { fg: "#616e88" },
    loader: { fg: "#ebcb8b" },

    // ── Syntax highlighting ──
    "syntax.keyword": { fg: "#81a1c1", bold: true },
    "syntax.string": { fg: "#a3be8c" },
    "syntax.comment": { fg: "#616e88", italic: true },
    "syntax.number": { fg: "#b48ead" },
    "syntax.function": { fg: "#88c0d0" },
    "syntax.type": { fg: "#8fbcbb" },
    "syntax.operator": { fg: "#81a1c1" },
    "syntax.punctuation": { fg: "#eceff4" },
    "syntax.property": { fg: "#8fbcbb" },
    "syntax.tag": { fg: "#81a1c1" },
    "syntax.attribute": { fg: "#a3be8c" },
    "syntax.plain": { fg: "#eceff4" },

    // ── Markdown ──
    "markdown.h1": { fg: "#b48ead", bold: true },
    "markdown.h2": { fg: "#b48ead", bold: true },
    "markdown.h3": { fg: "#b48ead", bold: true },
    "markdown.bold": { bold: true },
    "markdown.italic": { italic: true },
    "markdown.code": { fg: "#a3be8c" },
    "markdown.link": { fg: "#81a1c1", underline: true },
    "markdown.bullet": { fg: "#a3be8c" },
    "markdown.number": { fg: "#a3be8c" },
    "markdown.quote": { fg: "#616e88", italic: true },

    // ── Tool call boxes ──
    "tool.box.border": { fg: "#434c5e" },
    "tool.box.title": { fg: "#81a1c1", bold: true },
    "tool.box.icon": { fg: "#a3be8c" },
    "tool.box.path": { fg: "#ebcb8b" },
    "tool.box.meta": { fg: "#616e88" },

    // ── Accent colors ──
    accent: { fg: "#b48ead" },
    success: { fg: "#a3be8c" },
    warning: { fg: "#d08770" },
    error: { fg: "#bf616a" },
    info: { fg: "#81a1c1" },
  },
};
