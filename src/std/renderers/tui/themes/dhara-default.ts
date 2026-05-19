/**
 * Dhara Theme — maps pi's dark.json color scheme to pi-tui's theme interfaces.
 *
 * Uses chalk for ANSI coloring (same as pi-tui). All theme functions follow
 * the pi-tui component theme interfaces (MarkdownTheme, EditorTheme, SelectListTheme).
 */

import type {
  EditorTheme,
  MarkdownTheme,
  SelectListTheme,
  SettingsListTheme,
} from "@earendil-works/pi-tui";
import chalk from "chalk";

// ── Color Palette (from pi's dark.json) ──────────────────────────────

const C = {
  accent: "#8abeb7",
  blue: "#5f87ff",
  cyan: "#00d7ff",
  green: "#b5bd68",
  red: "#cc6666",
  yellow: "#ffff00",
  gray: "#808080",
  dimGray: "#666666",
  darkGray: "#505050",
  // Message backgrounds
  selectedBg: "#3a3a4a",
  userMsgBg: "#343541",
  customMsgBg: "#2d2838",
  toolPendingBg: "#282832",
  toolSuccessBg: "#283228",
  toolErrorBg: "#3c2828",
  // Markdown
  mdHeading: "#f0c674",
  mdLink: "#81a2be",
  mdCode: "#8abeb7", // same as accent
} as const;

// ── Style helpers ─────────────────────────────────────────────────────

const hex = (color: string) => chalk.hex(color);
const bold = (s: string) => chalk.bold(s);
const dim = (s: string) => chalk.dim(s);
const italic = (s: string) => chalk.italic(s);

// ── Markdown Theme ────────────────────────────────────────────────────

export function getMarkdownTheme(): MarkdownTheme {
  return {
    heading: (s: string) => bold(hex(C.mdHeading)(s)),
    link: (s: string) => hex(C.mdLink)(s),
    linkUrl: (s: string) => dim(hex(C.dimGray)(s)),
    code: (s: string) => hex(C.accent)(s),
    codeBlock: (s: string) => hex(C.green)(s),
    codeBlockBorder: (s: string) => dim(hex(C.gray)(s)),
    codeBlockIndent: "  ",
    quote: (s: string) => dim(hex(C.gray)(s)),
    quoteBorder: (s: string) => dim(hex(C.gray)(s)),
    hr: (s: string) => dim(hex(C.gray)(s)),
    listBullet: (s: string) => hex(C.accent)(s),
    bold: (s: string) => bold(s),
    italic: (s: string) => italic(s),
    strikethrough: (s: string) => chalk.strikethrough(s),
    underline: (s: string) => chalk.underline(s),
  };
}

// ── Editor Theme ─────────────────────────────────────────────────────

export function getEditorTheme(): EditorTheme {
  return {
    borderColor: (s: string) => hex(C.blue)(s),
    selectList: getSelectListTheme(),
  };
}

// ── SelectList Theme ─────────────────────────────────────────────────

export function getSelectListTheme(): SelectListTheme {
  return {
    selectedPrefix: (s: string) => hex(C.accent)(`▸ ${s}`),
    selectedText: (s: string) => bold(hex(C.accent)(s)),
    description: (s: string) => dim(hex(C.gray)(s)),
    scrollInfo: (s: string) => dim(hex(C.dimGray)(s)),
    noMatch: (s: string) => dim(hex(C.gray)(s)),
  };
}

// ── SettingsList Theme ───────────────────────────────────────────────

export function getSettingsListTheme(): SettingsListTheme {
  return {
    label: (s: string, selected: boolean) => (selected ? bold(s) : s),
    value: (s: string, selected: boolean) => (selected ? hex(C.accent)(s) : dim(hex(C.gray)(s))),
    description: (s: string) => dim(hex(C.gray)(s)),
    cursor: chalk.inverse(" "),
    hint: (s: string) => dim(hex(C.dimGray)(s)),
  };
}

// ── Convenience color helpers (for custom components) ─────────────────

export const color = {
  accent: (s: string) => hex(C.accent)(s),
  dim: (s: string) => dim(hex(C.dimGray)(s)),
  muted: (s: string) => dim(hex(C.gray)(s)),
  success: (s: string) => hex(C.green)(s),
  error: (s: string) => hex(C.red)(s),
  warning: (s: string) => hex(C.yellow)(s),
  bold: (s: string) => bold(s),
  blue: (s: string) => hex(C.blue)(s),
  green: (s: string) => hex(C.green)(s),
  customLabel: (s: string) => hex("#9575cd")(s),
  toolTitle: (s: string) => s,
  // Background fills
  userMsgBg: (s: string) => chalk.bgHex(C.userMsgBg)(s),
  toolPendingBg: (s: string) => chalk.bgHex(C.toolPendingBg)(s),
  toolSuccessBg: (s: string) => chalk.bgHex(C.toolSuccessBg)(s),
  toolErrorBg: (s: string) => chalk.bgHex(C.toolErrorBg)(s),
  customMsgBg: (s: string) => chalk.bgHex(C.customMsgBg)(s),
  // Thinking tokens - italicized, thinking text color
  thinkingText: (s: string) => italic(hex(C.dimGray)(s)),
  // Tool diff colors
  toolDiffAdded: (s: string) => hex(C.green)(s),
  toolDiffRemoved: (s: string) => hex(C.red)(s),
  toolDiffContext: (s: string) => dim(hex(C.gray)(s)),
  // Diff line formatting
  diffAddedPrefix: (s: string) => hex(C.green)(s),
  diffRemovedPrefix: (s: string) => hex(C.red)(s),
  diffContextPrefix: (s: string) => dim(hex(C.dimGray)(s)),
};
