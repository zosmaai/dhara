/**
 * Dhara TUI renderer — barrel exports.
 */

export type { BoxConfig } from "./components/box.js";
export { Box } from "./components/box.js";
export type { ChatMessageConfig, ChatRole } from "./components/chat-message.js";
export { ChatMessage } from "./components/chat-message.js";
export {
  type Component,
  type FocusableComponent,
  padToWidth,
  ThemedComponent,
  truncateToWidth,
  visibleWidth,
} from "./components/component.js";
export type { EditorConfig } from "./components/editor.js";
export { Editor } from "./components/editor.js";
export type { LoaderConfig } from "./components/loader.js";
export { Loader } from "./components/loader.js";
export type { RenderedLine } from "./components/markdown.js";
export {
  renderDiffBlock,
  renderInline,
  renderMarkdown,
  wrapRenderedMarkdown,
} from "./components/markdown.js";
export type { StatusBarConfig } from "./components/status-bar.js";
export { StatusBar } from "./components/status-bar.js";
export type { HighlightOptions } from "./components/syntax-highlight.js";
export {
  extractLanguage,
  highlightCode,
  looksLikeCodeBlock,
} from "./components/syntax-highlight.js";
// Components
export { Text, ThemedText } from "./components/text.js";
export type { KeyAction, KeyBinding } from "./keybindings.js";
export {
  DEFAULT_KEYBINDINGS,
  isPrintable,
  isShiftEnter,
  mergeBindings,
  resolveBinding,
} from "./keybindings.js";
export type { Terminal } from "./terminal.js";
export { ProcessTerminal, synchronized, VirtualTerminal } from "./terminal.js";
export type { ResolvedStyle, StyleDefinition, ThemeDefinition } from "./theme.js";
export { DEFAULT_THEME, Theme } from "./theme.js";
export { loadThemeFile, parseThemeYaml } from "./theme-loader.js";
export type { OverlayHandle } from "./tui.js";
export { CURSOR_MARKER, TUI } from "./tui.js";
