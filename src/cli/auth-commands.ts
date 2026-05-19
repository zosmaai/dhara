/**
 * Auth commands — interactive /login and /logout flows.
 *
 * Mirrors pi-coding-agent's subscription-or-API-key flow:
 *
 *   /login
 *     ↓
 *   [Subscription]  [API Key]
 *     ↓ choose one
 *   Provider list (SelectList)
 *     ↓
 *   Prompt for API key (or OAuth URL)
 *     ↓
 *   Store in ~/.dhara/config.json
 */

import type { SelectItem } from "@earendil-works/pi-tui";
import { SelectList } from "@earendil-works/pi-tui";
import type { ConfigManager } from "../core/config.js";
import type { DharaApp } from "../std/renderers/tui/dhara-app.js";
import { getSelectListTheme } from "../std/renderers/tui/dhara-theme.js";
import type { TUI } from "../std/renderers/tui/index.js";

// ── Provider definitions ────────────────────────────────────────────

/** Providers that support Subscription/OAuth auth. */
const SUBSCRIPTION_PROVIDERS: Array<{ id: string; name: string; description: string }> = [
  { id: "anthropic", name: "Anthropic Claude", description: "Claude Pro/Max subscription" },
  { id: "openai", name: "OpenAI", description: "ChatGPT Plus/Pro (Codex) subscription" },
  { id: "github-copilot", name: "GitHub Copilot", description: "GitHub Copilot subscription" },
];

/** Providers that use API key auth. */
const API_KEY_PROVIDERS: Array<{
  id: string;
  name: string;
  envVar: string;
  description: string;
}> = [
  { id: "openai", name: "OpenAI", envVar: "OPENAI_API_KEY", description: "GPT-4o, GPT-4, etc." },
  {
    id: "anthropic",
    name: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    description: "Claude Sonnet, Claude Haiku, etc.",
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    envVar: "OPENCODE_API_KEY",
    description: "DeepSeek V4, etc.",
  },
  { id: "google", name: "Google Gemini", envVar: "GOOGLE_API_KEY", description: "Gemini models" },
  { id: "deepseek", name: "DeepSeek", envVar: "DEEPSEEK_API_KEY", description: "DeepSeek models" },
  { id: "mistral", name: "Mistral", envVar: "MISTRAL_API_KEY", description: "Mistral models" },
  { id: "groq", name: "Groq", envVar: "GROQ_API_KEY", description: "Fast inference" },
  { id: "cerebras", name: "Cerebras", envVar: "CEREBRAS_API_KEY", description: "Cerebras models" },
  { id: "xai", name: "xAI", envVar: "XAI_API_KEY", description: "Grok models" },
  {
    id: "openrouter",
    name: "OpenRouter",
    envVar: "OPENROUTER_API_KEY",
    description: "Multi-model gateway",
  },
  {
    id: "together",
    name: "Together AI",
    envVar: "TOGETHER_API_KEY",
    description: "Open-source models",
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    envVar: "FIREWORKS_API_KEY",
    description: "Fast inference",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    envVar: "HUGGINGFACE_API_KEY",
    description: "Open models",
  },
  {
    id: "azure-openai",
    name: "Azure OpenAI",
    envVar: "AZURE_OPENAI_API_KEY",
    description: "Azure OpenAI endpoint",
  },
  {
    id: "vertex",
    name: "Google Vertex",
    envVar: "GOOGLE_VERTEX_API_KEY",
    description: "Vertex AI",
  },
  { id: "bedrock", name: "Amazon Bedrock", envVar: "AWS_BEDROCK_API_KEY", description: "Bedrock" },
];

// ── Login flow ──────────────────────────────────────────────────────

/**
 * Run the interactive /login flow in a TUI environment.
 *
 * Shows a series of SelectList overlays:
 * 1. Auth type (Subscription vs API Key)
 * 2. Provider list (filtered by auth type)
 * 3. API key input prompt (if API key mode)
 * 4. Confirmation and storage
 */
export function handleLogin(
  tui: TUI,
  chat: DharaApp,
  configManager: ConfigManager,
  onComplete?: () => void,
): void {
  // Step 1: Choose auth type
  const authTypeItems: SelectItem[] = [
    {
      value: "api_key",
      label: "API Key",
      description: "Use an API key for direct provider access",
    },
    {
      value: "subscription",
      label: "Subscription",
      description: "Use OAuth / subscription (Anthropic, OpenAI, GitHub Copilot)",
    },
  ];

  const authTypeList = new SelectList(authTypeItems, 10, getSelectListTheme());
  authTypeList.onSelect = (authItem) => {
    tui.hideOverlay();

    if (authItem.value === "subscription") {
      showSubscriptionProviders(tui, chat, configManager, onComplete);
    } else {
      showApiKeyProviders(tui, chat, configManager, onComplete);
    }
  };
  authTypeList.onCancel = () => tui.hideOverlay();

  tui.showOverlay(authTypeList, { anchor: "center", width: "60%" });
}

/**
 * Show the subscription provider selector.
 * For now, subscription/OAuth providers show a message directing users
 * to use API key auth or configure manually. Full OAuth support will
 * be added in a future PR.
 */
function showSubscriptionProviders(
  tui: TUI,
  chat: DharaApp,
  _configManager: ConfigManager,
  onComplete?: () => void,
): void {
  const items: SelectItem[] = SUBSCRIPTION_PROVIDERS.map((p) => ({
    value: p.id,
    label: p.name,
    description: p.description,
  }));

  const providerList = new SelectList(items, 10, getSelectListTheme());
  providerList.onSelect = (item) => {
    tui.hideOverlay();
    chat.addMessage({
      role: "system",
      content: [
        `OAuth / subscription login for "${item.label}" is not yet supported in the TUI.`,
        "",
        `To configure "${item.label}" via subscription:`,
        `  1. Visit the provider's website and get an API key`,
        `  2. Use /login and choose API Key instead`,
        `  3. Or run: dhara config set-provider ${item.value} <your-api-key>`,
        "",
        `We'll add browser-based OAuth login in a future release.`,
      ].join("\n"),
    });
    tui.requestRender();
    onComplete?.();
  };
  providerList.onCancel = () => tui.hideOverlay();

  tui.showOverlay(providerList, { anchor: "center", width: "60%" });
}

/**
 * Show the API key provider selector, then prompt for the key.
 */
function showApiKeyProviders(
  tui: TUI,
  chat: DharaApp,
  configManager: ConfigManager,
  onComplete?: () => void,
): void {
  // Filter out already-configured providers, but allow re-configuration
  const existingProviders = configManager.listProviders();
  const existingIds = new Set(existingProviders.map((p) => p.id));

  const items: SelectItem[] = API_KEY_PROVIDERS.map((p) => {
    const hasKey = existingIds.has(p.id);
    return {
      value: p.id,
      label: hasKey ? `${p.name} ${"✓".padStart(1)}` : p.name,
      description: hasKey
        ? `${p.description} (env: ${p.envVar}) [configured]`
        : `${p.description} (env: ${p.envVar})`,
    };
  });

  const providerList = new SelectList(items, 10, getSelectListTheme());
  providerList.onSelect = (item) => {
    tui.hideOverlay();
    promptForApiKey(
      tui,
      chat,
      configManager,
      item.value,
      // Find the display name
      API_KEY_PROVIDERS.find((p) => p.id === item.value)?.name ?? item.value,
      onComplete,
    );
  };
  providerList.onCancel = () => tui.hideOverlay();

  tui.showOverlay(providerList, { anchor: "center", width: "60%" });
}

/**
 * Show an API key input prompt using pi-tui's Input component,
 * then store the key via ConfigManager.
 */
function promptForApiKey(
  tui: TUI,
  chat: DharaApp,
  configManager: ConfigManager,
  providerId: string,
  providerName: string,
  onComplete?: () => void,
): void {
  // We use a helper overlay pattern: show a system message with instructions
  // then listen for the next non-command text input as the API key.
  chat.addMessage({
    role: "system",
    content: [
      `Enter your API key for ${providerName}.`,
      ``,
      `The key will be stored in ~/.dhara/config.json.`,
      `Type your API key and press Enter, or type "cancel" to abort.`,
    ].join("\n"),
  });
  tui.requestRender();

  // Store a one-shot handler on the chat's editor for the next submit
  // We intercept via a custom onSubmit wrapper
  const originalOnSubmit = chat.editor.onSubmit;
  chat.editor.onSubmit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.toLowerCase() === "cancel") {
      chat.addMessage({ role: "system", content: "API key entry cancelled." });
      chat.editor.onSubmit = originalOnSubmit;
      tui.requestRender();
      onComplete?.();
      return;
    }

    // Store the API key
    try {
      const existing = configManager.getProvider(providerId);
      if (existing) {
        configManager.setApiKey(providerId, trimmed);
      } else {
        configManager.setProvider({
          id: providerId,
          name: providerName,
          authType: "api_key",
          auth: { type: "api_key", apiKey: trimmed },
          defaultModel: undefined,
          enabled: true,
        });
      }
      // Set as active provider if none is active
      if (!configManager.config.activeProvider) {
        configManager.setActiveProvider(providerId);
      }
      chat.addMessage({
        role: "system",
        content: `✓ API key configured for ${providerName}.`,
      });
    } catch (err) {
      chat.addMessage({
        role: "error",
        content: `Failed to store API key: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Restore original onSubmit
    chat.editor.onSubmit = originalOnSubmit;
    chat.editor.setText("");
    tui.requestRender();
    onComplete?.();
  };

  // Also handle Ctrl+C / Ctrl+D to cancel
  const originalCtrlC = chat.editor.onCtrlC;
  const originalCtrlD = chat.editor.onCtrlD;
  chat.editor.onCtrlC = () => {
    chat.addMessage({ role: "system", content: "API key entry cancelled." });
    chat.editor.onSubmit = originalOnSubmit;
    chat.editor.onCtrlC = originalCtrlC;
    chat.editor.onCtrlD = originalCtrlD;
    chat.editor.setText("");
    tui.requestRender();
    onComplete?.();
  };
  chat.editor.onCtrlD = () => {
    // Same as Ctrl+C for cancellation during API key entry
    chat.addMessage({ role: "system", content: "API key entry cancelled." });
    chat.editor.onSubmit = originalOnSubmit;
    chat.editor.onCtrlC = originalCtrlC;
    chat.editor.onCtrlD = originalCtrlD;
    chat.editor.setText("");
    tui.requestRender();
    onComplete?.();
  };

  chat.editor.setText("");
  tui.setFocus(chat.editor);
  tui.requestRender();
}

// ── Logout flow ─────────────────────────────────────────────────────

/**
 * Run the interactive /logout flow.
 *
 * Shows a list of configured providers and lets the user select one to
 * remove credentials for.
 */
export function handleLogout(
  tui: TUI,
  chat: DharaApp,
  configManager: ConfigManager,
  onComplete?: () => void,
): void {
  const providers = configManager.listProviders().filter((p) => {
    // Only show providers that have credentials stored
    if (p.auth.type === "api_key") return !!p.auth.apiKey;
    if (p.auth.type === "oauth") return !!p.auth.accessToken;
    return false;
  });

  if (providers.length === 0) {
    chat.addMessage({ role: "system", content: "No configured providers to log out from." });
    tui.requestRender();
    onComplete?.();
    return;
  }

  const items: SelectItem[] = providers.map((p) => ({
    value: p.id,
    label: p.name,
    description: `Remove ${p.auth.type === "api_key" ? "API key" : "OAuth token"} for ${p.id}`,
  }));

  const providerList = new SelectList(items, 10, getSelectListTheme());
  providerList.onSelect = (item) => {
    tui.hideOverlay();

    // Confirm before removing
    chat.addMessage({
      role: "system",
      content: [
        `Remove credentials for "${item.label}"?`,
        `  Type "yes" to confirm, or anything else to cancel.`,
      ].join("\n"),
    });
    tui.requestRender();

    const originalOnSubmit = chat.editor.onSubmit;
    chat.editor.onSubmit = (text: string) => {
      chat.editor.onSubmit = originalOnSubmit;
      const trimmed = text.trim().toLowerCase();
      if (trimmed === "yes" || trimmed === "y") {
        configManager.removeProvider(item.value);
        chat.addMessage({
          role: "system",
          content: `✓ Credentials removed for ${item.label}.`,
        });
      } else {
        chat.addMessage({ role: "system", content: "Logout cancelled." });
      }
      chat.editor.setText("");
      tui.requestRender();
      onComplete?.();
    };

    chat.editor.setText("");
    tui.setFocus(chat.editor);
    tui.requestRender();
  };
  providerList.onCancel = () => tui.hideOverlay();

  tui.showOverlay(providerList, { anchor: "center", width: "60%" });
}
