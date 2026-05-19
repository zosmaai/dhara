/**
 * Model commands — interactive /model selector.
 *
 * Shows available models for the current provider and lets the user
 * switch the active model at runtime.
 *
 * Pi's /model flow (simplified for same-provider model switching):
 *   /model
 *     ↓
 *   Model list for current provider
 *     ↓
 *   Switch model → re-create agent loop
 */

import type { SelectItem } from "@earendil-works/pi-tui";
import { SelectList } from "@earendil-works/pi-tui";
import type { DharaApp } from "../std/renderers/tui/dhara-app.js";
import { getSelectListTheme } from "../std/renderers/tui/dhara-theme.js";
import type { TUI } from "../std/renderers/tui/index.js";

/**
 * Common models per provider.
 */
const PROVIDER_MODELS: Record<string, Array<{ id: string; name: string }>> = {
  openai: [
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "o3", name: "o3" },
    { id: "o4-mini", name: "o4 Mini" },
    { id: "gpt-4.1", name: "GPT-4.1" },
    { id: "gpt-4.1-mini", name: "GPT-4.1 Mini" },
    { id: "gpt-4.1-nano", name: "GPT-4.1 Nano" },
  ],
  anthropic: [
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
    { id: "claude-haiku-3-5-20241022", name: "Claude Haiku 3.5" },
    { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
  ],
  "opencode-go": [
    { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
    { id: "deepseek-v4", name: "DeepSeek V4" },
    { id: "deepseek-r1", name: "DeepSeek R1" },
  ],
  google: [
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
  ],
  deepseek: [
    { id: "deepseek-chat", name: "DeepSeek Chat" },
    { id: "deepseek-reasoner", name: "DeepSeek Reasoner" },
  ],
  mistral: [
    { id: "mistral-large-latest", name: "Mistral Large" },
    { id: "mistral-small-latest", name: "Mistral Small" },
    { id: "codestral-latest", name: "Codestral" },
  ],
  groq: [
    { id: "llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout" },
    { id: "llama-4-maverick-17b-128e-instruct", name: "Llama 4 Maverick" },
    { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 (Llama 70B)" },
  ],
  openrouter: [
    { id: "openrouter/auto", name: "Auto (best model)" },
    { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" },
    { id: "openai/gpt-4o", name: "GPT-4o" },
  ],
};

/**
 * Run the interactive /model flow.
 *
 * Shows available models for the current provider.
 * Calls onSwitch with the new model ID.
 */
export function handleModel(
  tui: TUI,
  chat: DharaApp,
  currentProviderName: string,
  _currentModelId: string,
  onSwitch: (newProviderName: string, newModelId: string) => void,
): void {
  const models = PROVIDER_MODELS[currentProviderName];

  if (!models || models.length === 0) {
    chat.addMessage({
      role: "system",
      content: [
        `No predefined models for "${currentProviderName}".`,
        `Current model: ${_currentModelId}`,
        `To use a different model, specify it with: --model <model-id>`,
      ].join("\n"),
    });
    tui.requestRender();
    return;
  }

  const modelItems: SelectItem[] = models.map((m) => ({
    value: m.id,
    label: m.name,
    description: `Model ID: ${m.id}`,
  }));

  const modelList = new SelectList(modelItems, 10, getSelectListTheme());
  modelList.onSelect = (item) => {
    tui.hideOverlay();
    chat.addMessage({
      role: "system",
      content: `Switching to model: ${item.label} (${item.value})...`,
    });
    tui.requestRender();
    onSwitch(currentProviderName, item.value);
  };
  modelList.onCancel = () => tui.hideOverlay();

  tui.showOverlay(modelList, { anchor: "center", width: "60%" });
}
