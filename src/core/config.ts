import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Authentication method for a provider. */
export type AuthType = "api_key" | "oauth";

/** Provider authentication via API key. */
export interface ApiKeyAuth {
  type: "api_key";
  /** The API key value. */
  apiKey: string;
}

/** Provider authentication via OAuth (subscription). */
export interface OAuthAuth {
  type: "oauth";
  /** Current access token. */
  accessToken: string;
  /** Optional refresh token for token renewal. */
  refreshToken?: string;
  /** ISO timestamp of token expiration. */
  expiresAt?: string;
}

/** Discriminated union for provider authentication payload. */
export type ProviderAuth = ApiKeyAuth | OAuthAuth;

/**
 * Configuration for a single LLM provider.
 *
 * Examples: OpenAI (API key), Anthropic (API key),
 * OpenAI Codex (OAuth), GitHub Copilot (OAuth).
 */
export interface ProviderConfig {
  /** Unique provider identifier (e.g. "openai", "anthropic"). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Authentication method for this provider. */
  authType: AuthType;
  /** Authentication payload matching {@link authType}. */
  auth: ProviderAuth;
  /** Custom API base URL (for proxies or self-hosted endpoints). */
  baseUrl?: string;
  /** Default model ID for this provider. */
  defaultModel?: string;
  /** Whether this provider is enabled for use. */
  enabled: boolean;
}

/** Session behaviour preferences. */
export interface SessionConfig {
  /** Automatically save session state to disk on every mutation. */
  autoSave: boolean;
  /** Maximum agent loop iterations before forced stop. */
  maxIterations: number;
}

/** Root shape of the `~/.dhara/config.json` file. */
export interface DharaConfigData {
  /** Config file format version. */
  version: string;
  /** Provider ID of the currently active provider. */
  activeProvider?: string;
  /** Configured provider entries. */
  providers: ProviderConfig[];
  /** Session behaviour preferences. */
  session: SessionConfig;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

/** Sensible default config used when no file exists yet. */
export const DEFAULT_CONFIG: DharaConfigData = {
  version: "1.0.0",
  activeProvider: undefined,
  providers: [],
  session: {
    autoSave: true,
    maxIterations: 10,
  },
};

// ─── Configuration for ConfigManager ─────────────────────────────────────────

/**
 * Options for creating a {@link ConfigManager}.
 */
export interface ConfigManagerConfig {
  /**
   * Directory where the config file is stored.
   * Defaults to `~/.dhara`.
   */
  storageDir?: string;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

/**
 * Generic configuration error.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Thrown when the on-disk config file contains invalid JSON.
 */
export class ConfigCorruptError extends ConfigError {
  constructor(path: string) {
    super(`Config file corrupted: ${path}`);
    this.name = "ConfigCorruptError";
  }
}

// ─── ConfigManager ───────────────────────────────────────────────────────────

const CONFIG_FILE = "config.json";

/**
 * Manages the `config.json` file inside the Dhara storage directory.
 *
 * Provides a typed API for reading and writing provider configurations,
 * authentication credentials, and session preferences.
 *
 * Writes are atomic (temp file + rename) to prevent corruption.
 */
export class ConfigManager {
  /** Absolute path to the storage directory (e.g. `~/.dhara`). */
  readonly storageDir: string;

  /** Absolute path to the config file on disk. */
  readonly configPath: string;

  private data: DharaConfigData;

  /**
   * @param userConfig - Optional override for the storage directory.
   */
  constructor(userConfig: ConfigManagerConfig = {}) {
    this.storageDir = userConfig.storageDir ?? join(homedir(), ".dhara");
    this.configPath = join(this.storageDir, CONFIG_FILE);

    this.ensureStorageDir();

    if (this.fileExists(this.configPath)) {
      this.data = this.readConfig();
    } else {
      this.data = this.deepClone(DEFAULT_CONFIG);
    }
  }

  // ── Read access ──────────────────────────────────────────────────────────

  /**
   * A read-only snapshot of the current in-memory configuration.
   */
  get config(): Readonly<DharaConfigData> {
    return this.deepClone(this.data);
  }

  /**
   * Retrieve a provider configuration by its ID.
   *
   * @returns The provider config, or `undefined` if no provider with
   *          that ID is configured.
   */
  getProvider(id: string): ProviderConfig | undefined {
    const found = this.data.providers.find((p) => p.id === id);
    if (!found) return undefined;
    return this.deepClone(found);
  }

  /**
   * List all configured providers, sorted alphabetically by name.
   */
  listProviders(): ProviderConfig[] {
    return this.deepClone([...this.data.providers].sort((a, b) => a.name.localeCompare(b.name)));
  }

  /**
   * Get the currently active provider configuration.
   *
   * @returns The active provider, or `undefined` if no provider is active.
   */
  getActiveProvider(): ProviderConfig | undefined {
    if (!this.data.activeProvider) return undefined;
    return this.getProvider(this.data.activeProvider);
  }

  /**
   * Get the API key for a provider that uses API-key authentication.
   *
   * @returns The API key, or `undefined` if the provider is unknown or
   *          uses OAuth authentication.
   */
  getApiKey(providerId: string): string | undefined {
    const provider = this.data.providers.find((p) => p.id === providerId);
    if (!provider) return undefined;
    if (provider.auth.type !== "api_key") return undefined;
    return provider.auth.apiKey;
  }

  // ── Write access (auto-saves) ───────────────────────────────────────────

  /**
   * Add or update a provider configuration.
   *
   * If a provider with the same ID already exists it is replaced.
   * The config is automatically persisted to disk.
   */
  setProvider(provider: ProviderConfig): void {
    const idx = this.data.providers.findIndex((p) => p.id === provider.id);
    if (idx !== -1) {
      this.data.providers[idx] = this.deepClone(provider);
    } else {
      this.data.providers.push(this.deepClone(provider));
    }
    this.writeConfig();
  }

  /**
   * Remove a provider configuration by its ID.
   *
   * If the removed provider was the active provider, the active provider
   * is cleared. Does nothing if the provider ID does not exist.
   */
  removeProvider(id: string): void {
    const idx = this.data.providers.findIndex((p) => p.id === id);
    if (idx === -1) return;

    this.data.providers.splice(idx, 1);

    if (this.data.activeProvider === id) {
      this.data.activeProvider = undefined;
    }

    this.writeConfig();
  }

  /**
   * Set the active provider by ID.
   *
   * @throws {ConfigError} If no provider with that ID is configured.
   */
  setActiveProvider(id: string): void {
    if (!this.data.providers.some((p) => p.id === id)) {
      throw new ConfigError(`Provider not configured: ${id}`);
    }

    this.data.activeProvider = id;
    this.writeConfig();
  }

  /**
   * Set (or update) the API key for a provider that uses API-key
   * authentication.
   *
   * @throws {ConfigError} If the provider ID is unknown or uses OAuth.
   */
  setApiKey(providerId: string, apiKey: string): void {
    const provider = this.data.providers.find((p) => p.id === providerId);
    if (!provider) {
      throw new ConfigError(`Provider not configured: ${providerId}`);
    }
    if (provider.auth.type !== "api_key") {
      throw new ConfigError(`Provider "${providerId}" uses OAuth auth, not API key`);
    }

    provider.auth.apiKey = apiKey;
    this.writeConfig();
  }

  // ── Persistence ─────────────────────────────────────────────────────────

  /**
   * Re-read the configuration from disk, discarding any in-memory changes.
   */
  reload(): void {
    if (this.fileExists(this.configPath)) {
      this.data = this.readConfig();
    } else {
      this.data = this.deepClone(DEFAULT_CONFIG);
    }
  }

  /**
   * Explicitly persist the current in-memory configuration to disk.
   * Mutations already auto-save, so this is only needed for manual control.
   */
  save(): void {
    this.writeConfig();
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Read, parse, and validate the config file from disk.
   *
   * @throws {ConfigCorruptError} When the file contains invalid JSON.
   */
  private readConfig(): DharaConfigData {
    try {
      const raw = readFileSync(this.configPath, "utf-8");
      const parsed = JSON.parse(raw) as DharaConfigData;

      // Validate the structure minimally — it must have at least a version.
      if (typeof parsed.version !== "string") {
        throw new ConfigCorruptError(this.configPath);
      }

      return parsed;
    } catch (err) {
      if (err instanceof ConfigCorruptError) throw err;
      throw new ConfigCorruptError(this.configPath);
    }
  }

  /**
   * Atomically write the current config to disk.
   * Writes to a temporary file, then renames to the final path.
   */
  private writeConfig(): void {
    const data = JSON.stringify(this.data, null, 2);
    const tempPath = join(this.storageDir, `.tmp-${CONFIG_FILE}`);
    const finalPath = this.configPath;

    writeFileSync(tempPath, data, "utf-8");
    renameSync(tempPath, finalPath);
  }

  private ensureStorageDir(): void {
    mkdirSync(this.storageDir, { recursive: true });
  }

  private fileExists(filePath: string): boolean {
    try {
      statSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private deepClone<T>(value: T): T {
    if (value === undefined) return undefined as T;
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
