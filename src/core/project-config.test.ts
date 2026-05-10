import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
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
    it("returns undefined when no .dhara/settings.json exists", () => {
      const result = loadProjectConfig(subdir);
      expect(result).toBeUndefined();
    });

    it("loads settings from .dhara/settings.json in current directory", () => {
      const configDir = join(subdir, ".dhara");
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, "settings.json"),
        JSON.stringify({ model: "gpt-4o", maxIterations: 20 }),
        "utf-8",
      );

      const result = loadProjectConfig(subdir);
      expect(result).toBeDefined();
      expect(result?.configDir).toBe(configDir);
      expect(result?.settings.model).toBe("gpt-4o");
      expect(result?.settings.maxIterations).toBe(20);
    });

    it("finds .dhara/settings.json in a parent directory", () => {
      const configDir = join(root, ".dhara");
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, "settings.json"),
        JSON.stringify({ model: "claude-sonnet-4" }),
        "utf-8",
      );

      const result = loadProjectConfig(subdir);
      expect(result).toBeDefined();
      expect(result?.configDir).toBe(configDir);
      expect(result?.settings.model).toBe("claude-sonnet-4");
    });

    it("prefers closest .dhara/settings.json over parent", () => {
      // Parent has a config
      const parentConfig = join(root, ".dhara");
      mkdirSync(parentConfig, { recursive: true });
      writeFileSync(
        join(parentConfig, "settings.json"),
        JSON.stringify({ model: "parent-model" }),
        "utf-8",
      );

      // Child has its own config
      const childConfig = join(subdir, ".dhara");
      mkdirSync(childConfig, { recursive: true });
      writeFileSync(
        join(childConfig, "settings.json"),
        JSON.stringify({ model: "child-model", maxIterations: 15 }),
        "utf-8",
      );

      const result = loadProjectConfig(subdir);
      expect(result).toBeDefined();
      expect(result?.configDir).toBe(childConfig);
      expect(result?.settings.model).toBe("child-model");
      expect(result?.settings.maxIterations).toBe(15);
    });

    it("applies default values for missing settings", () => {
      const configDir = join(subdir, ".dhara");
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, "settings.json"), JSON.stringify({}), "utf-8");

      const result = loadProjectConfig(subdir);
      expect(result).toBeDefined();
      expect(result?.settings.maxIterations).toBe(10);
    });

    it("returns undefined when settings.json is invalid JSON", () => {
      const configDir = join(subdir, ".dhara");
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, "settings.json"), "not-json{{{", "utf-8");

      const result = loadProjectConfig(subdir);
      expect(result).toBeUndefined();
    });

    it("supports all project settings fields", () => {
      const configDir = join(subdir, ".dhara");
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, "settings.json"),
        JSON.stringify({
          provider: "anthropic",
          model: "claude-sonnet-4",
          maxIterations: 25,
          baseUrl: "https://custom.api.com",
          autoSave: false,
          tools: { bash: false },
        }),
        "utf-8",
      );

      const result = loadProjectConfig(subdir);
      expect(result?.settings.provider).toBe("anthropic");
      expect(result?.settings.model).toBe("claude-sonnet-4");
      expect(result?.settings.maxIterations).toBe(25);
      expect(result?.settings.baseUrl).toBe("https://custom.api.com");
      expect(result?.settings.autoSave).toBe(false);
      expect(result?.settings.tools).toEqual({ bash: false });
    });
  });

  describe("findAllProjectConfigs", () => {
    it("returns all configs from ancestors", () => {
      // Grandparent config
      const gpConfig = join(root, ".dhara");
      mkdirSync(gpConfig, { recursive: true });
      writeFileSync(
        join(gpConfig, "settings.json"),
        JSON.stringify({ model: "gp-model" }),
        "utf-8",
      );

      // Deep config
      const deepConfig = join(subdir, ".dhara");
      mkdirSync(deepConfig, { recursive: true });
      writeFileSync(
        join(deepConfig, "settings.json"),
        JSON.stringify({ model: "deep-model" }),
        "utf-8",
      );

      const results = findAllProjectConfigs(subdir);
      expect(results).toHaveLength(2);
      // Closest first
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
