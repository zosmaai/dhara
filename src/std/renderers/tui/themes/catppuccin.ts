/**
 * Catppuccin Mocha theme for Dhara TUI.
 * Based on the Catppuccin color scheme: https://catppuccin.com/
 */

import type {
  EditorTheme,
  MarkdownTheme,
  SelectListTheme,
  SettingsListTheme,
} from "@earendil-works/pi-tui";
import chalk from "chalk";

const C = {
  base: "#1e1e2e",
  mantle: "#181825",
  crust: "#11111b",
  surface0: "#313244",
  surface1: "#45475a",
  surface2: "#585b70",
  overlay0: "#6c7086",
  overlay1: "#7f849c",
  text: "#cdd6f4",
  subtext0: "#a6adc8",
  subtext1: "#bac2de",
  lavender: "#b4befe",
  blue: "#89b4fa",
  sapphire: "#74c7ec",
  sky: "#89dceb",
  teal: "#94e2d5",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  peach: "#fab387",
  maroon: "#eba0ac",
  red: "#f38ba8",
  mauve: "#cba6f7",
  pink: "#f5c2e7",
  flamingo: "#f2cdcd",
  rosewater: "#f5e0dc",
  // Derived
  accent: "#cba6f7",
  gray: "#585b70",
  dimGray: "#45475a",
  darkGray: "#181825",
  selectedBg: "#313244",
  userMsgBg: "#181825",
  toolPendingBg: "#1e1e2e",
  toolSuccessBg: "#1e2e2e",
  toolErrorBg: "#2e1e1e",
};

const hex = (c: string) => chalk.hex(c);
const bold = (s: string) => chalk.bold(s);
const dim = (s: string) => chalk.dim(s);
const italic = (s: string) => chalk.italic(s);

export function getMarkdownTheme(): MarkdownTheme {
  return {
    heading: (s: string) => bold(hex(C.mauve)(s)),
    link: (s: string) => hex(C.blue)(s),
    linkUrl: (s: string) => dim(hex(C.overlay0)(s)),
    code: (s: string) => hex(C.teal)(s),
    codeBlock: (s: string) => hex(C.green)(s),
    codeBlockBorder: (s: string) => dim(hex(C.surface1)(s)),
    codeBlockIndent: "  ",
    quote: (s: string) => dim(hex(C.overlay0)(s)),
    quoteBorder: (s: string) => dim(hex(C.overlay0)(s)),
    hr: (s: string) => dim(hex(C.surface1)(s)),
    listBullet: (s: string) => hex(C.pink)(s),
    bold: (s: string) => bold(s),
    italic: (s: string) => italic(s),
    strikethrough: (s: string) => chalk.strikethrough(s),
    underline: (s: string) => chalk.underline(s),
  };
}

export function getEditorTheme(): EditorTheme {
  return {
    borderColor: (s: string) => hex(C.lavender)(s),
    selectList: getSelectListTheme(),
  };
}

export function getSelectListTheme(): SelectListTheme {
  return {
    selectedPrefix: (s: string) => hex(C.pink)(`▸ ${s}`),
    selectedText: (s: string) => bold(hex(C.pink)(s)),
    description: (s: string) => dim(hex(C.overlay0)(s)),
    scrollInfo: (s: string) => dim(hex(C.dimGray)(s)),
    noMatch: (s: string) => dim(hex(C.gray)(s)),
  };
}

export function getSettingsListTheme(): SettingsListTheme {
  return {
    label: (s: string, selected: boolean) => (selected ? bold(s) : s),
    value: (s: string, selected: boolean) => (selected ? hex(C.green)(s) : dim(hex(C.overlay0)(s))),
    description: (s: string) => dim(hex(C.overlay0)(s)),
    cursor: chalk.inverse(" "),
    hint: (s: string) => dim(hex(C.dimGray)(s)),
  };
}

export const color = {
  accent: (s: string) => hex(C.mauve)(s),
  dim: (s: string) => dim(hex(C.dimGray)(s)),
  muted: (s: string) => dim(hex(C.gray)(s)),
  success: (s: string) => hex(C.green)(s),
  error: (s: string) => hex(C.red)(s),
  warning: (s: string) => hex(C.yellow)(s),
  bold: (s: string) => bold(s),
  blue: (s: string) => hex(C.blue)(s),
  green: (s: string) => hex(C.green)(s),
  toolTitle: (s: string) => s,
  userMsgBg: (s: string) => chalk.bgHex(C.userMsgBg)(s),
  toolPendingBg: (s: string) => chalk.bgHex(C.toolPendingBg)(s),
  toolSuccessBg: (s: string) => chalk.bgHex(C.toolSuccessBg)(s),
  toolErrorBg: (s: string) => chalk.bgHex(C.toolErrorBg)(s),
  thinkingText: (s: string) => italic(hex(C.overlay0)(s)),
  toolDiffAdded: (s: string) => hex(C.green)(s),
  toolDiffRemoved: (s: string) => hex(C.red)(s),
  toolDiffContext: (s: string) => dim(hex(C.overlay0)(s)),
  diffAddedPrefix: (s: string) => hex(C.green)(s),
  diffRemovedPrefix: (s: string) => hex(C.red)(s),
  diffContextPrefix: (s: string) => dim(hex(C.dimGray)(s)),
};
