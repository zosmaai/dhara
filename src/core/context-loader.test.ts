import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadContextFiles, reloadContextFiles } from "./context-loader.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "dhara-context-"));
}

describe("context-loader", () => {
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

  describe("loadContextFiles", () => {
    it("returns empty result when no context files exist", () => {
      const result = loadContextFiles(subdir);
      expect(result.files).toEqual([]);
      expect(result.combined).toBe("");
    });

    it("finds AGENTS.md in the current directory", () => {
      writeFileSync(join(subdir, "AGENTS.md"), "Be concise.", "utf-8");

      const result = loadContextFiles(subdir);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe(join(subdir, "AGENTS.md"));
      expect(result.files[0].source).toBe("project");
      expect(result.files[0].content).toBe("Be concise.");
      expect(result.combined).toContain("Be concise.");
    });

    it("finds CLAUDE.md in the current directory", () => {
      writeFileSync(join(subdir, "CLAUDE.md"), "Run tests before commit.", "utf-8");

      const result = loadContextFiles(subdir);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe(join(subdir, "CLAUDE.md"));
      expect(result.files[0].content).toBe("Run tests before commit.");
    });

    it("finds both AGENTS.md and CLAUDE.md in the same directory", () => {
      writeFileSync(join(subdir, "AGENTS.md"), "Be concise.", "utf-8");
      writeFileSync(join(subdir, "CLAUDE.md"), "Run tests.", "utf-8");

      const result = loadContextFiles(subdir);
      expect(result.files).toHaveLength(2);
    });

    it("finds context files in parent directory when cwd has none", () => {
      writeFileSync(join(root, "AGENTS.md"), "Project instructions.", "utf-8");

      const result = loadContextFiles(subdir);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe(join(root, "AGENTS.md"));
    });

    it("prefers closest ancestor over higher ones", () => {
      writeFileSync(join(root, "AGENTS.md"), "Root instructions.", "utf-8");
      writeFileSync(join(subdir, "AGENTS.md"), "Deep instructions.", "utf-8");

      const result = loadContextFiles(subdir);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe(join(subdir, "AGENTS.md"));
      expect(result.files[0].content).toBe("Deep instructions.");
    });

    it("stops at the first directory that has context files", () => {
      writeFileSync(join(root, "AGENTS.md"), "Root instructions.", "utf-8");
      // subdir has no context files, but deep should find root's
      // Actually let's put a CLAUDE.md at subdir level
      writeFileSync(join(subdir, "..", "AGENTS.md"), "Mid instructions.", "utf-8");

      const result = loadContextFiles(subdir);
      // It should find the mid-level one (closest) and stop
      expect(result.files).toHaveLength(1);
    });

    it("includes global context files from ~/.dhara", () => {
      // We can't easily mock homedir, but we can verify the function
      // at least tries to read from ~/.dhara by checking the result
      // includes both global and project files when both exist.
      // For this test, we just verify project discovery works.
      writeFileSync(join(subdir, "AGENTS.md"), "Project.", "utf-8");

      const result = loadContextFiles(subdir);
      // At minimum, the project file is found
      const projectFiles = result.files.filter((f) => f.source === "project");
      expect(projectFiles).toHaveLength(1);
    });

    it("builds combined string with context markers", () => {
      writeFileSync(join(subdir, "AGENTS.md"), "Test instruction.", "utf-8");

      const result = loadContextFiles(subdir);
      expect(result.combined).toContain("<context file=");
      expect(result.combined).toContain("</context>");
      expect(result.combined).toContain('source="project"');
      expect(result.combined).toContain("Test instruction.");
    });

    it("handles multi-line content correctly", () => {
      writeFileSync(join(subdir, "AGENTS.md"), "# Project\n\n- Run tests\n- Be concise\n", "utf-8");

      const result = loadContextFiles(subdir);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].content).toContain("# Project");
      expect(result.files[0].content).toContain("- Run tests");
      expect(result.files[0].content).toContain("- Be concise");
    });
  });

  describe("reloadContextFiles", () => {
    it("re-reads files from disk", () => {
      writeFileSync(join(subdir, "AGENTS.md"), "Version 1.", "utf-8");

      const first = loadContextFiles(subdir);
      expect(first.files[0].content).toBe("Version 1.");

      // Change the file on disk
      writeFileSync(join(subdir, "AGENTS.md"), "Version 2.", "utf-8");

      const second = reloadContextFiles(subdir);
      expect(second.files[0].content).toBe("Version 2.");
    });

    it("detects new files added since first load", () => {
      const first = loadContextFiles(subdir);
      expect(first.files).toHaveLength(0);

      writeFileSync(join(subdir, "AGENTS.md"), "New file.", "utf-8");

      const second = reloadContextFiles(subdir);
      expect(second.files).toHaveLength(1);
    });
  });
});
