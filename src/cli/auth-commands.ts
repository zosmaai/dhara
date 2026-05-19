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

import { CURSOR_MARKER, Input, type SelectItem, SelectList } from "@earendil-works/pi-tui";
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

// ── PasswordInput Component ───────────────────────────────────────────

/**
 * PasswordInput — wraps pi-tui's Input component to mask displayed characters.
 *
 * Delegates all input handling to the underlying Input, but overrides
 * the render method to replace visible characters with bullet (•) symbols.
 * Implements the Component interface so it can be used as a TUI overlay.
 */
class PasswordInput {
  private input: Input;
  private label: string;

  onSubmit?: (value: string) => void;
  onCancel?: () => void;

  constructor(label: string) {
    this.label = label;
    this.input = new Input();

    this.input.onSubmit = (value: string) => {
      this.onSubmit?.(value);
    };

    this.input.onEscape = () => {
      this.onCancel?.();
    };
  }

  getValue(): string {
    return this.input.getValue();
  }

  setValue(value: string): void {
    this.input.setValue(value);
  }

  set focused(val: boolean) {
    this.input.focused = val;
  }

  get focused(): boolean {
    return this.input.focused;
  }

  handleInput(data: string): void {
    this.input.handleInput(data);
  }

  invalidate(): void {
    this.input.invalidate();
  }

  render(_width: number): string[] {
    const length = this.input.getValue().length;
    const masked = "\u2022".repeat(length); // bullet character
    const cursor = this.focused ? CURSOR_MARKER : "";

    return [
      ` ${this.label}`,
      ` ${masked}${cursor}`,
      ` ${length} character(s) entered. Press Enter to confirm, Esc to cancel.`,
    ];
  }

  /**
   * Focus the underlying input by calling handleInput with empty string
   * to ensure it's ready for keyboard input.
   */
  focus(): void {
    this.focused = true;
  }

  blur(): void {
    this.focused = false;
  }
}

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
 * Prompt for an API key using a masked password input overlay,
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
  const passwordInput = new PasswordInput(`Enter API key for ${providerName}`);

  passwordInput.onSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === "cancel") {
      tui.hideOverlay();
      chat.addMessage({ role: "system", content: "API key entry cancelled." });
      tui.requestRender();
      onComplete?.();
      return;
    }

    tui.hideOverlay();

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
        content: `✓ API key configured for ${providerName}. The key is stored in ~/.dhara/config.json.`,
      });
    } catch (err) {
      chat.addMessage({
        role: "error",
        content: `Failed to store API key: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    tui.requestRender();
    onComplete?.();
  };

  passwordInput.onCancel = () => {
    tui.hideOverlay();
    chat.addMessage({ role: "system", content: "API key entry cancelled." });
    tui.requestRender();
    onComplete?.();
  };

  tui.showOverlay(passwordInput, {
    anchor: "center",
    width: "60%",
  });

  passwordInput.focus();
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
