/**
 * Dhara TUI renderer — barrel exports.
 */
export { TUI } from "./tui.js";
export type { OverlayHandle } from "./tui.js";
export { ProcessTerminal, VirtualTerminal, synchronized } from "./terminal.js";
export type { Terminal } from "./terminal.js";
export { Theme, DEFAULT_THEME } from "./theme.js";
export type { ThemeDefinition, StyleDefinition, ResolvedStyle } from "./theme.js";
export { loadThemeFile, parseThemeYaml } from "./theme-loader.js";
export {
  DEFAULT_KEYBINDINGS,
  resolveBinding,
  isShiftEnter,
  isPrintable,
  mergeBindings,
} from "./keybindings.js";
export type { KeyAction, KeyBinding } from "./keybindings.js";

// Components
export { Text, ThemedText } from "./components/text.js";
export { Box } from "./components/box.js";
export type { BoxConfig } from "./components/box.js";
export { Editor } from "./components/editor.js";
export type { EditorConfig } from "./components/editor.js";
export { ChatMessage } from "./components/chat-message.js";
export type { ChatMessageConfig, ChatRole } from "./components/chat-message.js";
export { StatusBar } from "./components/status-bar.js";
export type { StatusBarConfig } from "./components/status-bar.js";
export { Loader } from "./components/loader.js";
export type { LoaderConfig } from "./components/loader.js";
export {
  ThemedComponent,
  type Component,
  type FocusableComponent,
  visibleWidth,
  truncateToWidth,
  padToWidth,
} from "./components/component.js";
export {
  highlightCode,
  looksLikeCodeBlock,
  extractLanguage,
} from "./components/syntax-highlight.js";
export type { HighlightOptions } from "./components/syntax-highlight.js";
export {
  renderMarkdown,
  renderInline,
  renderDiffBlock,
  wrapRenderedMarkdown,
} from "./components/markdown.js";
export type { RenderedLine } from "./components/markdown.js";
