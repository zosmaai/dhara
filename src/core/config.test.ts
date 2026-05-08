import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigManager,
  ConfigCorruptError,
  ConfigError,
  DEFAULT_CONFIG,
} from "./config.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "dhara-config-"));
}

describe("ConfigManager", () => {
  let storageDir: string;
  let manager: ConfigManager;

  beforeEach(() => {
    storageDir = tempDir();
    manager = new ConfigManager({ storageDir });
  });

  afterEach(() => {
    rmSync(storageDir, { recursive: true, force: true });
  });

  describe("constructor", () => {
    it("creates the storage directory when it does not exist", () => {
      const nestedDir = join(storageDir, "nested", "sub");
      const m = new ConfigManager({ storageDir: nestedDir });
      expect(existsSync(nestedDir)).toBe(true);
    });

    it("loads default config when no config file exists", () => {
      expect(manager.config.version).toBe("1.0.0");
      expect(manager.config.providers).toEqual([]);
      expect(manager.config.session).toEqual({
        autoSave: true,
        maxIterations: 10,
      });
    });
  });

  describe("getProvider", () => {
    it("returns undefined for unknown provider", () => {
      expect(manager.getProvider("nonexistent")).toBeUndefined();
    });

    it("returns the provider config after it is set", () => {
      manager.setProvider({
        id: "openai",
        name: "OpenAI",
        authType: "api_key",
        auth: { type: "api_key", apiKey: "sk-test" },
        enabled: true,
      });

      const provider = manager.getProvider("openai");
      expect(provider).toBeDefined();
      expect(provider?.id).toBe("openai");
      expect(provider?.name).toBe("OpenAI");
      expect(provider?.authType).toBe("api_key");
      expect(provider?.enabled).toBe(true);
    });
  });

  describe("setProvider", () => {
    it("adds a new provider", () => {
      manager.setProvider({
        id: "anthropic",
        name: "Anthropic",
        authType: "api_key",
        auth: { type: "api_key", apiKey: "sk-ant-test" },
        enabled: true,
      });

      expect(manager.listProviders()).toHaveLength(1);
    });

    it("updates an existing provider with the same id", () => {
      manager.setProvider({
        id: "openai",
        name: "OpenAI",
        authType: "api_key",
        auth: { type: "api_key", apiKey: "sk-old" },
        enabled: true,
      });

      manager.setProvider({
        id: "openai",
        name: "OpenAI",
        authType: "api_key",
        auth: { type: "api_key", apiKey: "sk-new" },
        enabled: true,
      });

      expect(manager.listProviders()).toHaveLength(1);
      expect(manager.getApiKey("openai")).toBe("sk-new");
    });

    it("persists to disk", () => {
      manager.setProvider({
        id: "openai",
        name: "OpenAI",
        authType: "api_key",
        auth: { type: "api_key", apiKey: "sk-test" },
        enabled: true,
      });

      const filePath = join(storageDir, "config.json");
      const content = readFileSync(filePath, "utf-8");
      const data = JSON.parse(content);
      expect(data.providers).toHaveLength(1);
      expect(data.providers[0].id).toBe("openai");
    });

    it("writes atomically (temp file then rename)", () => {
      manager.setProvider({
        id: "openai",
        name: "OpenAI",
        authType: "api_key",
        auth: { type: "api_key", apiKey: "sk-test" },
        enabled: true,
      });

      const dirContents = readFileSync(join(storageDir, "config.json"), "utf-8");
      expect(JSON.parse(dirContents).providers).toHaveLength(1);
    });
  });

  describe("removeProvider", () => {
    it("removes an existing provider", () => {
      manager.setProvider({
        id: "openai",
        name: "OpenAI",
        authType: "api_key",
        auth: { type: "api_key", apiKey: "sk-test" },
        enabled: true,
      });

      manager.removeProvider("openai");
      expect(manager.listProviders()).toHaveLength(0);
      expect(manager.getProvider("openai")).toBeUndefined();
    });

    it("does nothing when removing a non-existent provider", () => {
      manager.setProvider({
        id: "openai",
        name: "OpenAI",
        authType: "api_key",
        auth: { type: "api_key", apiKey: "sk-test" },
        enabled: true,
      });

      manager.removeProvider("nonexistent");
      expect(manager.listProviders()).toHaveLength(1);
    });

    it("clears activeProvider when it is the removed provider", () => {
      manager.setProvider({
        id: "openai",
        name: "OpenAI",
        authType: "api_key",
        auth: { type: "api_key", apiKey: "sk-test" },
        enabled: true,
      });
      manager.setActiveProvider("openai");

      manager.removeProvider("openai");
      expect(manager.config.activeProvider).toBeUndefined();
    });
  });

  describe("setActiveProvider", () => {
    it("sets the active provider", () => {
      manager.setProvider({
        id: "openai",
        name: "OpenAI",
        authType: "api_key",
        auth: { type: "api_key", apiKey: "sk-test" },
        enabled: true,
      });

      manager.setActiveProvider("openai");
      expect(manager.config.activeProvider).toBe("openai");
    });

    it("throws when setting unknown provider as active", () => {
      expect(() => manager.setActiveProvider("nonexistent")).toThrow(ConfigError);
    });
  });

  describe("getActiveProvider", () => {
    it("returns undefined when no active provider is set", () => {
      expect(manager.getActiveProvider()).toBeUndefined();
    });

    it("returns the active provider config", () => {
      manager.setProvider({
        id: "anthropic",
        name: "Anthropic",
        authType: "api_key",
        auth: { type: "api_key", apiKey: "sk-ant-test" },
        enabled: true,
      });
      manager.setActiveProvider("anthropic");

      const active = manager.getActiveProvider();
      expect(active?.id).toBe("anthropic");
      expect(active?.name).toBe("Anthropic");
    });
  });

  describe("getApiKey", () => {
    it("returns the API key for an API-key-authenticated provider", () => {
      manager.setProvider({
        id: "openai",
        name: "OpenAI",
        authType: "api_key",
        auth: { type: "api_key", apiKey: "sk-secret" },
        enabled: true,
      });

      expect(manager.getApiKey("openai")).toBe("sk-secret");
    });

    it("returns undefined for unknown provider", () => {
      expect(manager.getApiKey("unknown")).toBeUndefined();
    });

    it("returns undefined for OAuth-authenticated provider", () => {
      manager.setProvider({
        id: "codex",
        name: "OpenAI Codex",
        authType: "oauth",
        auth: { type: "oauth", accessToken: "tok_123" },
        enabled: true,
      });

      expect(manager.getApiKey("codex")).toBeUndefined();
    });
  });

  describe("setApiKey", () => {
    it("updates the API key for an existing provider", () => {
      manager.setProvider({
        id: "openai",
        name: "OpenAI",
        authType: "api_key",
        auth: { type: "api_key", apiKey: "sk-old" },
        enabled: true,
      });

      manager.setApiKey("openai", "sk-new");
      expect(manager.getApiKey("openai")).toBe("sk-new");
    });

    it("throws when setting API key for unknown provider", () => {
      expect(() => manager.setApiKey("nonexistent", "sk-key")).toThrow(ConfigError);
    });

    it("throws when setting API key for OAuth-authenticated provider", () => {
      manager.setProvider({
        id: "codex",
        name: "OpenAI Codex",
        authType: "oauth",
        auth: { type: "oauth", accessToken: "tok_123" },
        enabled: true,
      });

      expect(() => manager.setApiKey("codex", "sk-key")).toThrow(ConfigError);
    });
  });

  describe("listProviders", () => {
    it("returns empty list when no providers are configured", () => {
      expect(manager.listProviders()).toEqual([]);
    });

    it("returns all providers sorted by name", () => {
      manager.setProvider({
        id: "z-provider",
        name: "Z Provider",
        authType: "api_key",
        auth: { type: "api_key", apiKey: "sk-z" },
        enabled: true,
      });
      manager.setProvider({
        id: "a-provider",
        name: "A Provider",
        authType: "api_key",
        auth: { type: "api_key", apiKey: "sk-a" },
        enabled: true,
      });

      const list = manager.listProviders();
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe("a-provider");
      expect(list[1].id).toBe("z-provider");
    });

    it("returns a defensive copy", () => {
      manager.setProvider({
        id: "openai",
        name: "OpenAI",
        authType: "api_key",
        auth: { type: "api_key", apiKey: "sk-test" },
        enabled: true,
      });

      const list = manager.listProviders();
      list[0].name = "Hacked";
      expect(manager.getProvider("openai")?.name).toBe("OpenAI");
    });
  });

  describe("reload", () => {
    it("re-reads config from disk, discarding in-memory changes", () => {
      manager.setProvider({
        id: "openai",
        name: "OpenAI",
        authType: "api_key",
        auth: { type: "api_key", apiKey: "sk-test" },
        enabled: true,
      });

      // Manually edit the file on disk
      const filePath = join(storageDir, "config.json");
      const data = JSON.parse(readFileSync(filePath, "utf-8"));
      data.providers[0].name = "OpenAI (Modified)";
      writeFileSync(filePath, JSON.stringify(data), "utf-8");

      manager.reload();
      expect(manager.getProvider("openai")?.name).toBe("OpenAI (Modified)");
    });

    it("resets to defaults when config file is deleted before reload", () => {
      manager.setProvider({
        id: "openai",
        name: "OpenAI",
        authType: "api_key",
        auth: { type: "api_key", apiKey: "sk-test" },
        enabled: true,
      });

      const filePath = join(storageDir, "config.json");
      rmSync(filePath, { force: true });

      manager.reload();
      expect(manager.listProviders()).toEqual([]);
    });
  });

  describe("save", () => {
    it("explicitly persists current config via save()", () => {
      // Start with a fresh manager that auto-loaded defaults
      const filePath = join(storageDir, "config.json");

      // The file does not exist yet (only written on setProvider)
      manager.setProvider({
        id: "openai",
        name: "OpenAI",
        authType: "api_key",
        auth: { type: "api_key", apiKey: "sk-test" },
        enabled: true,
      });

      // Call save() explicitly — it should not throw
      manager.save();

      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.version).toBe("1.0.0");
    });
  });

  describe("error handling", () => {
    it("throws ConfigCorruptError when config file has invalid JSON", () => {
      const filePath = join(storageDir, "config.json");
      writeFileSync(filePath, "not-json{{{", "utf-8");

      expect(() => new ConfigManager({ storageDir })).toThrow(ConfigCorruptError);
    });

    it("throws ConfigCorruptError when config file has missing version field", () => {
      const filePath = join(storageDir, "config.json");
      writeFileSync(filePath, JSON.stringify({ providers: [] }), "utf-8");

      expect(() => new ConfigManager({ storageDir })).toThrow(ConfigCorruptError);
    });
  });
});
