/**
 * Built-in theme registry.
 *
 * Themes are discoverable by name. Custom themes loaded from
 * ~/.dhara/themes/ are registered at runtime by the theme-loader.
 */
import { DEFAULT_THEME, Theme, type ThemeDefinition } from "../theme.js";
import { CATPPUCCIN_THEME } from "./catppuccin.js";
import { DRACULA_THEME } from "./dracula.js";
import { NORD_THEME } from "./nord.js";

/**
 * Registry of built‑in theme definitions, keyed by name.
 */
export const BUILTIN_THEMES: Record<string, ThemeDefinition> = {
  [DEFAULT_THEME.name]: DEFAULT_THEME,
  [DRACULA_THEME.name]: DRACULA_THEME,
  [NORD_THEME.name]: NORD_THEME,
  [CATPPUCCIN_THEME.name]: CATPPUCCIN_THEME,
};

/**
 * Names of every built‑in theme, in display order.
 */
export const BUILTIN_THEME_NAMES = Object.keys(BUILTIN_THEMES);

/**
 * Return the built‑in theme definition for a name, or undefined.
 */
export function getBuiltinTheme(name: string): ThemeDefinition | undefined {
  return BUILTIN_THEMES[name];
}

/**
 * Create a Theme instance for a built‑in theme by name.
 * Falls back to the default theme if the name is unknown.
 */
export function createBuiltinTheme(name: string, colorEnabled = true): Theme {
  const def = getBuiltinTheme(name);
  return new Theme(def ?? DEFAULT_THEME, colorEnabled);
}
