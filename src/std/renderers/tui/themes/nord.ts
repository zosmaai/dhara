/**
 * Nord theme for Dhara TUI.
 * Based on the Nord color scheme: https://www.nordtheme.com/
 */

import type {
  EditorTheme,
  MarkdownTheme,
  SelectListTheme,
  SettingsListTheme,
} from "@earendil-works/pi-tui";
import chalk from "chalk";

const C = {
  polarNight0: "#2e3440",
  polarNight1: "#3b4252",
  polarNight2: "#434c5e",
  polarNight3: "#4c566a",
  snowStorm0: "#d8dee9",
  snowStorm1: "#e5e9f0",
  snowStorm2: "#eceff4",
  frost0: "#8fbcbb",
  frost1: "#88c0d0",
  frost2: "#81a1c1",
  frost3: "#5e81ac",
  auroraRed: "#bf616a",
  auroraOrange: "#d08770",
  auroraYellow: "#ebcb8b",
  auroraGreen: "#a3be8c",
  auroraPurple: "#b48ead",
  // Derived
  accent: "#88c0d0",
  blue: "#81a1c1",
  green: "#a3be8c",
  red: "#bf616a",
  yellow: "#ebcb8b",
  gray: "#4c566a",
  dimGray: "#434c5e",
  darkGray: "#2e3440",
  selectedBg: "#3b4252",
  userMsgBg: "#2e3440",
  toolPendingBg: "#353b4a",
  toolSuccessBg: "#2e3b3e",
  toolErrorBg: "#3b2e2e",
};

const hex = (c: string) => chalk.hex(c);
const bold = (s: string) => chalk.bold(s);
const dim = (s: string) => chalk.dim(s);
const italic = (s: string) => chalk.italic(s);

export function getMarkdownTheme(): MarkdownTheme {
  return {
    heading: (s: string) => bold(hex(C.frost1)(s)),
    link: (s: string) => hex(C.frost2)(s),
    linkUrl: (s: string) => dim(hex(C.frost3)(s)),
    code: (s: string) => hex(C.auroraGreen)(s),
    codeBlock: (s: string) => hex(C.auroraGreen)(s),
    codeBlockBorder: (s: string) => dim(hex(C.polarNight3)(s)),
    codeBlockIndent: "  ",
    quote: (s: string) => dim(hex(C.polarNight3)(s)),
    quoteBorder: (s: string) => dim(hex(C.polarNight3)(s)),
    hr: (s: string) => dim(hex(C.polarNight3)(s)),
    listBullet: (s: string) => hex(C.frost0)(s),
    bold: (s: string) => bold(s),
    italic: (s: string) => italic(s),
    strikethrough: (s: string) => chalk.strikethrough(s),
    underline: (s: string) => chalk.underline(s),
  };
}

export function getEditorTheme(): EditorTheme {
  return {
    borderColor: (s: string) => hex(C.frost2)(s),
    selectList: getSelectListTheme(),
  };
}

export function getSelectListTheme(): SelectListTheme {
  return {
    selectedPrefix: (s: string) => hex(C.frost0)(`▸ ${s}`),
    selectedText: (s: string) => bold(hex(C.frost0)(s)),
    description: (s: string) => dim(hex(C.polarNight3)(s)),
    scrollInfo: (s: string) => dim(hex(C.dimGray)(s)),
    noMatch: (s: string) => dim(hex(C.gray)(s)),
  };
}

export function getSettingsListTheme(): SettingsListTheme {
  return {
    label: (s: string, selected: boolean) => (selected ? bold(s) : s),
    value: (s: string, selected: boolean) =>
      selected ? hex(C.auroraGreen)(s) : dim(hex(C.polarNight3)(s)),
    description: (s: string) => dim(hex(C.polarNight3)(s)),
    cursor: chalk.inverse(" "),
    hint: (s: string) => dim(hex(C.dimGray)(s)),
  };
}

export const color = {
  accent: (s: string) => hex(C.frost0)(s),
  dim: (s: string) => dim(hex(C.dimGray)(s)),
  muted: (s: string) => dim(hex(C.gray)(s)),
  success: (s: string) => hex(C.auroraGreen)(s),
  error: (s: string) => hex(C.auroraRed)(s),
  warning: (s: string) => hex(C.auroraYellow)(s),
  bold: (s: string) => bold(s),
  blue: (s: string) => hex(C.frost2)(s),
  green: (s: string) => hex(C.auroraGreen)(s),
  toolTitle: (s: string) => s,
  userMsgBg: (s: string) => chalk.bgHex(C.userMsgBg)(s),
  toolPendingBg: (s: string) => chalk.bgHex(C.toolPendingBg)(s),
  toolSuccessBg: (s: string) => chalk.bgHex(C.toolSuccessBg)(s),
  toolErrorBg: (s: string) => chalk.bgHex(C.toolErrorBg)(s),
  thinkingText: (s: string) => italic(hex(C.dimGray)(s)),
  toolDiffAdded: (s: string) => hex(C.auroraGreen)(s),
  toolDiffRemoved: (s: string) => hex(C.auroraRed)(s),
  toolDiffContext: (s: string) => dim(hex(C.polarNight3)(s)),
  diffAddedPrefix: (s: string) => hex(C.auroraGreen)(s),
  diffRemovedPrefix: (s: string) => hex(C.auroraRed)(s),
  diffContextPrefix: (s: string) => dim(hex(C.dimGray)(s)),
};
