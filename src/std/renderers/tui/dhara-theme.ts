/**
 * Dhara Theme — backward-compatible re-export of the dhara-default theme.
 *
 * All the actual theme implementations live in src/std/renderers/tui/themes/.
 * This file re-exports the default theme for existing imports.
 */

export type {
  EditorTheme,
  MarkdownTheme,
  SelectListTheme,
  SettingsListTheme,
} from "@earendil-works/pi-tui";
export {
  color,
  getEditorTheme,
  getMarkdownTheme,
  getSelectListTheme,
  getSettingsListTheme,
} from "./themes/dhara-default.js";

export const BUILTIN_THEMES = ["dhara-default", "dracula", "nord", "catppuccin"] as const;
export type BuiltinTheme = (typeof BUILTIN_THEMES)[number];
