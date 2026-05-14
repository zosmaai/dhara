import type { ThemeDefinition } from "../theme.js";

/**
 * Catppuccin Mocha theme — https://catppuccin.com
 */
export const CATPPUCCIN_THEME: ThemeDefinition = {
  name: "catppuccin",
  styles: {
    // ── Base text ──
    text: { fg: "#cdd6f4" },
    dim: { fg: "#585b70" },
    bold: { bold: true },
    muted: { fg: "#585b70", dim: true },

    // ── Chat messages ──
    "chat.user": { fg: "#a6e3a1", bold: true },
    "chat.assistant": { fg: "#cdd6f4" },
    "chat.tool": { fg: "#fab387", italic: true },
    "chat.error": { fg: "#f38ba8", bold: true },
    "chat.reasoning": { fg: "#585b70", dim: true },
    "chat.thinking": { fg: "#cba6f7", italic: true },

    // ── Editor ──
    "editor.prompt": { fg: "#cba6f7", bold: true },
    "editor.text": { fg: "#cdd6f4" },
    "editor.cursor": { fg: "#1e1e2e", bg: "#f5c2e7" },

    // ── Status bar ──
    "status.bar": { fg: "#cdd6f4", bg: "#313244" },
    "status.model": { fg: "#a6e3a1", bg: "#313244", bold: true },
    "status.tokens": { fg: "#585b70", bg: "#313244" },

    // ── Tool progress ──
    "tool.name": { fg: "#89b4fa", bold: true },
    "tool.output": { fg: "#cdd6f4" },
    "tool.diff.add": { fg: "#a6e3a1" },
    "tool.diff.remove": { fg: "#f38ba8" },

    // ── UI elements ──
    "panel.border": { fg: "#313244" },
    "panel.title": { fg: "#cba6f7", bold: true },
    "overlay.bg": { fg: "#cdd6f4", bg: "#1e1e2e" },
    "selector.active": { fg: "#1e1e2e", bg: "#cba6f7" },
    "selector.inactive": { fg: "#585b70" },
    loader: { fg: "#f9e2af" },

    // ── Syntax highlighting ──
    "syntax.keyword": { fg: "#cba6f7", bold: true },
    "syntax.string": { fg: "#a6e3a1" },
    "syntax.comment": { fg: "#585b70", italic: true },
    "syntax.number": { fg: "#fab387" },
    "syntax.function": { fg: "#89b4fa" },
    "syntax.type": { fg: "#94e2d5" },
    "syntax.operator": { fg: "#cba6f7" },
    "syntax.punctuation": { fg: "#cdd6f4" },
    "syntax.property": { fg: "#94e2d5" },
    "syntax.tag": { fg: "#cba6f7" },
    "syntax.attribute": { fg: "#a6e3a1" },
    "syntax.plain": { fg: "#cdd6f4" },

    // ── Markdown ──
    "markdown.h1": { fg: "#cba6f7", bold: true },
    "markdown.h2": { fg: "#cba6f7", bold: true },
    "markdown.h3": { fg: "#cba6f7", bold: true },
    "markdown.bold": { bold: true },
    "markdown.italic": { italic: true },
    "markdown.code": { fg: "#a6e3a1" },
    "markdown.link": { fg: "#89b4fa", underline: true },
    "markdown.bullet": { fg: "#a6e3a1" },
    "markdown.number": { fg: "#a6e3a1" },
    "markdown.quote": { fg: "#585b70", italic: true },

    // ── Tool call boxes ──
    "tool.box.border": { fg: "#313244" },
    "tool.box.title": { fg: "#89b4fa", bold: true },
    "tool.box.icon": { fg: "#a6e3a1" },
    "tool.box.path": { fg: "#f9e2af" },
    "tool.box.meta": { fg: "#585b70" },

    // ── Accent colors ──
    accent: { fg: "#cba6f7" },
    success: { fg: "#a6e3a1" },
    warning: { fg: "#fab387" },
    error: { fg: "#f38ba8" },
    info: { fg: "#89b4fa" },
  },
};
