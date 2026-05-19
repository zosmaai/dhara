/**
 * Theme registry — maps theme names to their modules.
 * Each theme exports: getMarkdownTheme, getEditorTheme, getSelectListTheme, getSettingsListTheme, color
 */
import type {
  EditorTheme,
  MarkdownTheme,
  SelectListTheme,
  SettingsListTheme,
} from "@earendil-works/pi-tui";

export interface ThemeExports {
  getMarkdownTheme: () => MarkdownTheme;
  getEditorTheme: () => EditorTheme;
  getSelectListTheme: () => SelectListTheme;
  getSettingsListTheme: () => SettingsListTheme;
  color: Record<string, (s: string) => string>;
}

import * as catppuccinTheme from "./catppuccin.js";
// Default theme (built-in)
import * as defaultTheme from "./dhara-default.js";
import * as draculaTheme from "./dracula.js";
import * as nordTheme from "./nord.js";

const themeRegistry: Record<string, ThemeExports> = {
  "dhara-default": defaultTheme as unknown as ThemeExports,
  dracula: draculaTheme as unknown as ThemeExports,
  nord: nordTheme as unknown as ThemeExports,
  catppuccin: catppuccinTheme as unknown as ThemeExports,
};

/**
 * Get a theme by name. Falls back to dhara-default if name is unknown.
 */
export function getTheme(name: string): ThemeExports {
  return themeRegistry[name] ?? themeRegistry["dhara-default"];
}

/**
 * List all available built-in theme names.
 */
export function listThemes(): string[] {
  return Object.keys(themeRegistry);
}
