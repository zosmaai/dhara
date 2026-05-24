import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findAllProjectConfigs,
  getProjectExtensionsDir,
  getProjectSessionsDir,
  getProjectSkillsDir,
  loadProjectConfig,
} from "./project-config.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "dhara-config-"));
}

describe("project-config", () => {
  let root: string;
  let subdir: string;

  beforeEach(() => {
    root = tempDir();
    subdir = join(root, "subdir", "deep");
    mkdirSync(subdir, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe("loadProjectConfig", () => {
    it("returns undefined when no .dhara/config.json exists", () => {
      const result = loadProjectConfig(subdir);
      expect(result).toBeUndefined();
    });

    it("loads settings from .dhara/config.json in current directory", () => {
      const configDir = join(subdir, ".dhara");
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, "config.json"),
        JSON.stringify({ model: "gpt-4o", session: { maxIterations: 20 } }),
        "utf-8",
      );

      const result = loadProjectConfig(subdir);
      expect(result).toBeDefined();
      expect(result?.configDir).toBe(configDir);
      expect(result?.settings.model).toBe("gpt-4o");
      expect(result?.settings.session?.maxIterations).toBe(20);
    });

    it("finds .dhara/config.json in a parent directory", () => {
      const configDir = join(root, ".dhara");
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, "config.json"),
        JSON.stringify({ model: "claude-sonnet-4" }),
        "utf-8",
      );

      const result = loadProjectConfig(subdir);
      expect(result).toBeDefined();
      expect(result?.configDir).toBe(configDir);
      expect(result?.settings.model).toBe("claude-sonnet-4");
    });

    it("prefers closest .dhara/config.json over parent", () => {
      const parentConfig = join(root, ".dhara");
      mkdirSync(parentConfig, { recursive: true });
      writeFileSync(
        join(parentConfig, "config.json"),
        JSON.stringify({ model: "parent-model" }),
        "utf-8",
      );

      const childConfig = join(subdir, ".dhara");
      mkdirSync(childConfig, { recursive: true });
      writeFileSync(
        join(childConfig, "config.json"),
        JSON.stringify({ model: "child-model", session: { maxIterations: 15 } }),
        "utf-8",
      );

      const result = loadProjectConfig(subdir);
      expect(result).toBeDefined();
      expect(result?.configDir).toBe(childConfig);
      expect(result?.settings.model).toBe("child-model");
      expect(result?.settings.session?.maxIterations).toBe(15);
    });

    it("applies default values for missing settings", () => {
      const configDir = join(subdir, ".dhara");
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, "config.json"), JSON.stringify({}), "utf-8");

      const result = loadProjectConfig(subdir);
      expect(result).toBeDefined();
      expect(result?.settings.session?.maxIterations).toBe(100);
      expect(result?.settings.session?.autoSave).toBe(true);
    });

    it("returns undefined when config.json is invalid JSON", () => {
      const configDir = join(subdir, ".dhara");
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, "config.json"), "not-json{{{", "utf-8");

      const result = loadProjectConfig(subdir);
      expect(result).toBeUndefined();
    });

    it("loads legacy .dhara/settings.json with flat format", () => {
      const configDir = join(subdir, ".dhara");
      mkdirSync(configDir, { recursive: true });
      // Legacy flat format — no config.json, only settings.json
      writeFileSync(
        join(configDir, "settings.json"),
        JSON.stringify({ model: "gpt-4o", maxIterations: 30 }),
        "utf-8",
      );

      const result = loadProjectConfig(subdir);
      expect(result).toBeDefined();
      expect(result?.settings.model).toBe("gpt-4o");
      // Legacy flat maxIterations normalized into session
      expect(result?.settings.session?.maxIterations).toBe(30);
    });

    it("prefers config.json over legacy settings.json", () => {
      const configDir = join(subdir, ".dhara");
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, "config.json"),
        JSON.stringify({ model: "new-format", session: { maxIterations: 50 } }),
        "utf-8",
      );
      writeFileSync(
        join(configDir, "settings.json"),
        JSON.stringify({ model: "old-format", maxIterations: 10 }),
        "utf-8",
      );

      const result = loadProjectConfig(subdir);
      expect(result).toBeDefined();
      // config.json takes precedence over settings.json
      expect(result?.settings.model).toBe("new-format");
      expect(result?.settings.session?.maxIterations).toBe(50);
    });

    it("supports all project settings fields in nested format", () => {
      const configDir = join(subdir, ".dhara");
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, "config.json"),
        JSON.stringify({
          provider: "anthropic",
          model: "claude-sonnet-4",
          session: { maxIterations: 25, autoSave: false },
          baseUrl: "https://custom.api.com",
          tools: { bash: false },
        }),
        "utf-8",
      );

      const result = loadProjectConfig(subdir);
      expect(result?.settings.provider).toBe("anthropic");
      expect(result?.settings.model).toBe("claude-sonnet-4");
      expect(result?.settings.session?.maxIterations).toBe(25);
      expect(result?.settings.session?.autoSave).toBe(false);
      expect(result?.settings.baseUrl).toBe("https://custom.api.com");
      expect(result?.settings.tools).toEqual({ bash: false });
    });
  });

  describe("findAllProjectConfigs", () => {
    it("returns all configs from ancestors", () => {
      const gpConfig = join(root, ".dhara");
      mkdirSync(gpConfig, { recursive: true });
      writeFileSync(join(gpConfig, "config.json"), JSON.stringify({ model: "gp-model" }), "utf-8");

      const deepConfig = join(subdir, ".dhara");
      mkdirSync(deepConfig, { recursive: true });
      writeFileSync(
        join(deepConfig, "config.json"),
        JSON.stringify({ model: "deep-model" }),
        "utf-8",
      );

      const results = findAllProjectConfigs(subdir);
      expect(results).toHaveLength(2);
      expect(results[0].configDir).toBe(deepConfig);
      expect(results[1].configDir).toBe(gpConfig);
    });
  });

  describe("directory helpers", () => {
    it("getProjectSkillsDir returns correct path", () => {
      expect(getProjectSkillsDir("/project/.dhara")).toBe("/project/.dhara/skills");
    });

    it("getProjectSessionsDir returns correct path", () => {
      expect(getProjectSessionsDir("/project/.dhara")).toBe("/project/.dhara/sessions");
    });

    it("getProjectExtensionsDir returns correct path", () => {
      expect(getProjectExtensionsDir("/project/.dhara")).toBe("/project/.dhara/extensions");
    });
  });
});
