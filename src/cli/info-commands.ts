import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SelectList, type TUI } from "@earendil-works/pi-tui";
import type { DharaApp } from "../std/renderers/tui/dhara-app.js";
import { getSelectListTheme } from "../std/renderers/tui/dhara-theme.js";

// ── Constants ─────────────────────────────────────────────────────────────

const MAX_VISIBLE = 12;

// ── /scoped-models — Model Scope Configuration ───────────────────────────

/**
 * Available models organized by provider for scoping.
 * Users can toggle which models appear in model cycling.
 */
const AVAILABLE_MODELS: Array<{
  id: string;
  provider: string;
  label: string;
}> = [
  // OpenAI
  { id: "gpt-4o", provider: "openai", label: "GPT-4o" },
  { id: "gpt-4o-mini", provider: "openai", label: "GPT-4o Mini" },
  { id: "o3", provider: "openai", label: "o3" },
  { id: "o4-mini", provider: "openai", label: "o4-mini" },
  // Anthropic
  { id: "claude-sonnet-4-20250514", provider: "anthropic", label: "Claude Sonnet 4" },
  { id: "claude-haiku-3-5-20241022", provider: "anthropic", label: "Claude Haiku 3.5" },
  // Google
  { id: "gemini-2.5-flash", provider: "google", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-pro", provider: "google", label: "Gemini 2.5 Pro" },
  // DeepSeek
  { id: "deepseek-chat", provider: "deepseek", label: "DeepSeek Chat" },
  { id: "deepseek-reasoner", provider: "deepseek", label: "DeepSeek Reasoner" },
  // Mistral
  { id: "mistral-large-latest", provider: "mistral", label: "Mistral Large" },
  { id: "mistral-small-latest", provider: "mistral", label: "Mistral Small" },
  // Groq
  { id: "llama-3.3-70b-versatile", provider: "groq", label: "Llama 3.3 70B" },
  { id: "mixtral-8x7b-32768", provider: "groq", label: "Mixtral 8x7B" },
  // OpenRouter
  { id: "auto", provider: "openrouter", label: "OpenRouter Auto" },
  // GitHub
  { id: "gpt-4o", provider: "github", label: "GitHub GPT-4o" },
  // opencode-go
  { id: "gpt-4o", provider: "opencode-go", label: "OpenCode GPT-4o" },
];

/**
 * Handle `/scoped-models` — toggle which models appear in model cycling.
 *
 * Currently stores the enabled set in memory. In future, this should
 * persist to config.
 */
export function handleScopedModels(
  tui: TUI,
  chat: DharaApp,
  enabledModels: Set<string>,
  onModelsChanged: (models: Set<string>) => void,
): void {
  const items = AVAILABLE_MODELS.map((model) => {
    const isEnabled = enabledModels.size === 0 || enabledModels.has(model.id);
    return {
      value: model.id,
      label: `${isEnabled ? "✓" : " "} ${model.label}`,
      description: `${model.provider}${isEnabled ? " · enabled" : " · disabled"}`,
    };
  });

  const modelList = new SelectList(items, MAX_VISIBLE, getSelectListTheme());

  modelList.onSelect = (selected) => {
    const model = AVAILABLE_MODELS.find((m) => m.id === selected.value);
    if (!model) return;

    const isEnabled = enabledModels.has(model.id);
    if (isEnabled) {
      enabledModels.delete(model.id);
    } else {
      enabledModels.add(model.id);
    }

    onModelsChanged(enabledModels);
    tui.hideOverlay();

    chat.addMessage({
      role: "system",
      content: `${isEnabled ? "Disabled" : "Enabled"} ${model.label} for model cycling.`,
    });
    tui.requestRender();
  };

  modelList.onCancel = () => {
    tui.hideOverlay();
  };

  chat.addMessage({
    role: "system",
    content:
      "Select models to toggle on/off for cycling.\nEnabled models are marked with ✓.\nPress Escape when done.",
  });
  tui.showOverlay(modelList, {
    anchor: "center",
    width: "70%",
  });
}

// ── /changelog — Version History ─────────────────────────────────────────

/**
 * Handle `/changelog` — display version history from CHANGELOG.md.
 */
export function handleChangelog(tui: TUI, chat: DharaApp): void {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const changelogPath = join(__dirname, "..", "..", "CHANGELOG.md");

    // Verify file exists
    statSync(changelogPath);

    const content = readFileSync(changelogPath, "utf-8");

    // Parse: extract the 3 most recent version sections
    const versionSections = content.split(/(?=^## )/m).slice(0, 3);
    const summary = versionSections.join("\n").trim();

    chat.addMessage({
      role: "system",
      content: summary
        ? `## Changelog\n\n${summary}\n\n---\nSee CHANGELOG.md for full history.`
        : "CHANGELOG.md is empty or has no version sections.",
    });
  } catch {
    chat.addMessage({
      role: "system",
      content: "No CHANGELOG.md found.",
    });
  }
  tui.requestRender();
}

// ── /hotkeys — Keybinding Reference ──────────────────────────────────────

/**
 * Keybinding definitions grouped by category.
 */
const KEYBINDINGS: Array<{ category: string; bindings: Array<{ keys: string; action: string }> }> =
  [
    {
      category: "General",
      bindings: [
        { keys: "Enter", action: "Send message / execute command" },
        { keys: "Shift+Enter", action: "New line in editor" },
        { keys: "Tab", action: "Autocomplete / cycle focus" },
        { keys: "Escape", action: "Cancel / close overlay / unfocus" },
      ],
    },
    {
      category: "Navigation",
      bindings: [
        { keys: "↑/↓", action: "Navigate message history / select items" },
        { keys: "PgUp/PgDn", action: "Scroll chat by page" },
        { keys: "Home/End", action: "Scroll to top/bottom" },
      ],
    },
    {
      category: "Slash Commands",
      bindings: [
        { keys: "/", action: "Start command (at beginning of line)" },
        { keys: "Ctrl+P", action: "Cycle models (scoped by /scoped-models)" },
        { keys: "Ctrl+D (empty)", action: "Exit TUI" },
        { keys: "Ctrl+C (x2)", action: "Force exit" },
        { keys: "Shift+Ctrl+D", action: "Reload configuration" },
        { keys: "Ctrl+L", action: "Clear chat (system messages preserved)" },
      ],
    },
    {
      category: "Editing",
      bindings: [
        { keys: "Ctrl+Z / Ctrl+Y", action: "Undo / Redo" },
        { keys: "Ctrl+A", action: "Select all" },
        { keys: "Ctrl+K", action: "Cut to end of line" },
        { keys: "Ctrl+U", action: "Cut to start of line" },
        { keys: "Ctrl+W", action: "Delete word backward" },
        { keys: "Alt+Backspace", action: "Delete word backward" },
        { keys: "Alt+D", action: "Delete word forward" },
      ],
    },
    {
      category: "Tool Display",
      bindings: [{ keys: "Ctrl+O", action: "Toggle tool call argument expansion" }],
    },
  ];

/**
 * Handle `/hotkeys` — display full keybinding reference.
 */
export function handleHotkeys(tui: TUI, chat: DharaApp): void {
  const content = KEYBINDINGS.map(
    (group) =>
      `### ${group.category}\n${group.bindings.map((b) => `- \`${b.keys}\` — ${b.action}`).join("\n")}`,
  ).join("\n\n");

  chat.addMessage({
    role: "system",
    content: `## Keybindings\n\n${content}\n\n---\nPress \`/hotkeys\` or \`/help\` anytime to see this reference.`,
  });
  tui.requestRender();
}
