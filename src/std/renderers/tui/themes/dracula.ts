/**
 * Dracula theme for Dhara TUI.
 * Based on the Dracula color scheme: https://draculatheme.com/
 */

import type {
  EditorTheme,
  MarkdownTheme,
  SelectListTheme,
  SettingsListTheme,
} from "@earendil-works/pi-tui";
import chalk from "chalk";

const C = {
  bg: "#282a36",
  currentLine: "#44475a",
  foreground: "#f8f8f2",
  comment: "#6272a4",
  cyan: "#8be9fd",
  green: "#50fa7b",
  orange: "#ffb86c",
  pink: "#ff79c6",
  purple: "#bd93f9",
  red: "#ff5555",
  yellow: "#f1fa8c",
  // Derived
  accent: "#bd93f9",
  blue: "#8be9fd",
  gray: "#6272a4",
  dimGray: "#44475a",
  darkGray: "#1e1f29",
  selectedBg: "#44475a",
  userMsgBg: "#1e1f29",
  toolPendingBg: "#21222c",
  toolSuccessBg: "#1e2e24",
  toolErrorBg: "#2c1e1e",
};

const hex = (c: string) => chalk.hex(c);
const bold = (s: string) => chalk.bold(s);
const dim = (s: string) => chalk.dim(s);
const italic = (s: string) => chalk.italic(s);

export function getMarkdownTheme(): MarkdownTheme {
  return {
    heading: (s: string) => bold(hex(C.purple)(s)),
    link: (s: string) => hex(C.cyan)(s),
    linkUrl: (s: string) => dim(hex(C.comment)(s)),
    code: (s: string) => hex(C.pink)(s),
    codeBlock: (s: string) => hex(C.green)(s),
    codeBlockBorder: (s: string) => dim(hex(C.comment)(s)),
    codeBlockIndent: "  ",
    quote: (s: string) => dim(hex(C.comment)(s)),
    quoteBorder: (s: string) => dim(hex(C.comment)(s)),
    hr: (s: string) => dim(hex(C.comment)(s)),
    listBullet: (s: string) => hex(C.pink)(s),
    bold: (s: string) => bold(s),
    italic: (s: string) => italic(s),
    strikethrough: (s: string) => chalk.strikethrough(s),
    underline: (s: string) => chalk.underline(s),
  };
}

export function getEditorTheme(): EditorTheme {
  return {
    borderColor: (s: string) => hex(C.purple)(s),
    selectList: getSelectListTheme(),
  };
}

export function getSelectListTheme(): SelectListTheme {
  return {
    selectedPrefix: (s: string) => hex(C.pink)(`▸ ${s}`),
    selectedText: (s: string) => bold(hex(C.pink)(s)),
    description: (s: string) => dim(hex(C.comment)(s)),
    scrollInfo: (s: string) => dim(hex(C.dimGray)(s)),
    noMatch: (s: string) => dim(hex(C.gray)(s)),
  };
}

export function getSettingsListTheme(): SettingsListTheme {
  return {
    label: (s: string, selected: boolean) => (selected ? bold(s) : s),
    value: (s: string, selected: boolean) => (selected ? hex(C.green)(s) : dim(hex(C.comment)(s))),
    description: (s: string) => dim(hex(C.comment)(s)),
    cursor: chalk.inverse(" "),
    hint: (s: string) => dim(hex(C.dimGray)(s)),
  };
}

export const color = {
  accent: (s: string) => hex(C.purple)(s),
  dim: (s: string) => dim(hex(C.dimGray)(s)),
  muted: (s: string) => dim(hex(C.comment)(s)),
  success: (s: string) => hex(C.green)(s),
  error: (s: string) => hex(C.red)(s),
  warning: (s: string) => hex(C.yellow)(s),
  bold: (s: string) => bold(s),
  blue: (s: string) => hex(C.cyan)(s),
  green: (s: string) => hex(C.green)(s),
  toolTitle: (s: string) => s,
  userMsgBg: (s: string) => chalk.bgHex(C.userMsgBg)(s),
  toolPendingBg: (s: string) => chalk.bgHex(C.toolPendingBg)(s),
  toolSuccessBg: (s: string) => chalk.bgHex(C.toolSuccessBg)(s),
  toolErrorBg: (s: string) => chalk.bgHex(C.toolErrorBg)(s),
  thinkingText: (s: string) => italic(hex(C.comment)(s)),
  toolDiffAdded: (s: string) => hex(C.green)(s),
  toolDiffRemoved: (s: string) => hex(C.red)(s),
  toolDiffContext: (s: string) => dim(hex(C.comment)(s)),
  diffAddedPrefix: (s: string) => hex(C.green)(s),
  diffRemovedPrefix: (s: string) => hex(C.red)(s),
  diffContextPrefix: (s: string) => dim(hex(C.dimGray)(s)),
};
