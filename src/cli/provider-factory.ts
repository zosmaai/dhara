/**
 * Provider factory — creates provider instances from config.
 *
 * Shared between main.ts (CLI startup) and tui-runner.ts (post-login re-creation).
 */

import type { Provider } from "../core/provider.js";
import { createAnthropicProvider } from "../std/providers/anthropic-provider.js";
import { createOpenAIProvider } from "../std/providers/openai-provider.js";

// ── Known providers ─────────────────────────────────────────────────

/** Known providers with their default model, base URL, and env var. */
const KNOWN_PROVIDERS: Record<
  string,
  { defaultModel: string; defaultBaseUrl?: string; envVar: string }
> = {
  "opencode-go": {
    defaultModel: "deepseek-v4-flash",
    envVar: "OPENCODE_API_KEY",
  },
  openai: {
    defaultModel: "gpt-4o",
    envVar: "OPENAI_API_KEY",
    defaultBaseUrl: "https://api.openai.com/v1",
  },
  anthropic: {
    defaultModel: "claude-sonnet-4-20250514",
    envVar: "ANTHROPIC_API_KEY",
    defaultBaseUrl: "https://api.anthropic.com",
  },
};

// ── Create provider ─────────────────────────────────────────────────

/**
 * Create a provider instance by name with the given API key.
 * Returns null if the provider type is unknown or the key is missing.
 */
export function createProviderByName(
  providerName: string,
  apiKey?: string,
  options?: { modelId?: string; baseUrl?: string; maxTokens?: number },
): Provider | null {
  const providerInfo = KNOWN_PROVIDERS[providerName];
  const resolvedKey =
    apiKey ||
    (providerInfo ? process.env[providerInfo.envVar] : undefined) ||
    process.env.DHARA_API_KEY;
  const modelId = options?.modelId ?? providerInfo?.defaultModel;
  const baseUrl = options?.baseUrl ?? providerInfo?.defaultBaseUrl;

  if (!resolvedKey) {
    return null;
  }

  try {
    if (providerName === "anthropic") {
      return createAnthropicProvider({ apiKey: resolvedKey, maxTokens: options?.maxTokens });
    }
    if (providerName === "openai" || providerName === "opencode-go") {
      return createOpenAIProvider({ apiKey: resolvedKey, baseUrl: baseUrl || undefined });
    }
    // pi-ai adapter for all other providers
    const { createPiAiProvider } = require("../std/providers/pi-ai-adapter.js");
    return createPiAiProvider({
      provider: providerName,
      model: modelId ?? "default",
      apiKey: resolvedKey,
      baseUrl: baseUrl || undefined,
    });
  } catch {
    return null;
  }
}

/**
 * Create a provider from the config manager's stored credentials.
 * Searches for a configured provider and creates the appropriate instance.
 */
export function createProviderFromConfig(
  configManager: import("../core/config.js").ConfigManager,
  options?: { modelId?: string; maxTokens?: number },
): Provider | null {
  const providers = configManager.listProviders();
  const activeId = configManager.config.activeProvider;

  // Try active provider first, then first configured one
  const configured = activeId ? providers.find((p) => p.id === activeId) : providers[0];

  if (!configured) {
    return null;
  }

  const apiKey = configured.auth.type === "api_key" ? configured.auth.apiKey : undefined;
  if (!apiKey) {
    return null;
  }

  return createProviderByName(configured.id, apiKey, {
    modelId: options?.modelId ?? configured.defaultModel,
    maxTokens: options?.maxTokens,
  });
}
