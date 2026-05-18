/**
 * Dhara TUI renderer — barrel exports.
 *
 * Re-exports from @earendil-works/pi-tui and our custom components.
 */

// ── pi-tui re-exports ────────────────────────────────────────────────

export type {
  AutocompleteItem,
  AutocompleteProvider,
  AutocompleteSuggestions,
  CombinedAutocompleteProvider,
  Component,
  DefaultTextStyle,
  EditorComponent,
  EditorOptions,
  EditorTheme,
  Focusable,
  FuzzyMatch,
  ImageOptions,
  ImageTheme,
  Keybinding,
  KeybindingConflict,
  KeybindingDefinition,
  KeybindingDefinitions,
  Keybindings,
  KeybindingsConfig,
  KeyEventType,
  KeyId,
  LoaderIndicatorOptions,
  MarkdownTheme,
  OverlayAnchor,
  OverlayHandle,
  OverlayMargin,
  OverlayOptions,
  SelectItem,
  SelectListLayoutOptions,
  SelectListTheme,
  SelectListTruncatePrimaryContext,
  SettingItem,
  SettingsListTheme,
  SizeValue,
  SlashCommand,
  StdinBufferEventMap,
  StdinBufferOptions,
  Terminal,
} from "@earendil-works/pi-tui";
export {
  Box,
  CancellableLoader,
  Container,
  CURSOR_MARKER,
  decodeKittyPrintable,
  Editor,
  fuzzyFilter,
  fuzzyMatch,
  getKeybindings,
  Image,
  Input,
  isFocusable,
  isKeyRelease,
  isKeyRepeat,
  isKittyProtocolActive,
  Key,
  KeybindingsManager,
  Loader,
  Markdown,
  matchesKey,
  ProcessTerminal,
  parseKey,
  SelectList,
  SettingsList,
  Spacer,
  Text,
  TruncatedText,
  TUI,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

// ── Dhara custom components ──────────────────────────────────────────

export type { DharaAppConfig } from "./dhara-app.js";
export { DharaApp } from "./dhara-app.js";
export { DharaEditor } from "./dhara-editor.js";
export type { FooterData } from "./dhara-footer.js";
export { FooterComponent } from "./dhara-footer.js";
export { HeaderComponent } from "./dhara-header.js";
export type { MessageConfig } from "./dhara-messages.js";
export {
  AssistantMessageComponent,
  ErrorMessageComponent,
  SystemMessageComponent,
  ToolExecutionComponent,
  UserMessageComponent,
} from "./dhara-messages.js";

// ── Theme ────────────────────────────────────────────────────────────

export {
  color,
  getEditorTheme,
  getMarkdownTheme,
  getSelectListTheme,
  getSettingsListTheme,
} from "./dhara-theme.js";
