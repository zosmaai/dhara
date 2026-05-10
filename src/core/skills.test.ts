import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverSkills } from "./skills.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "dhara-skills-"));
}

/**
 * Create a skill directory with a valid SKILL.md.
 */
function createSkill(
  skillsDir: string,
  name: string,
  overrides: Partial<{
    description: string;
    license: string;
    compatibility: string;
    body: string;
  }> = {},
): string {
  const dir = join(skillsDir, name);
  mkdirSync(dir, { recursive: true });

  const lines: string[] = ["---"];
  lines.push(`name: ${name}`);
  lines.push(`description: ${overrides.description ?? `The ${name} skill`}`);
  if (overrides.license) lines.push(`license: ${overrides.license}`);
  if (overrides.compatibility) lines.push(`compatibility: ${overrides.compatibility}`);
  lines.push("---");
  lines.push("");
  lines.push(overrides.body ?? `# ${name}\n\nDo something useful.`);

  writeFileSync(join(dir, "SKILL.md"), lines.join("\n"), "utf-8");
  return dir;
}

describe("skills", () => {
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

  describe("discoverSkills", () => {
    it("returns empty list when no skills exist", () => {
      const result = discoverSkills(subdir);
      expect(result.skills).toEqual([]);
    });

    it("discovers skills from .agents/skills/ in current directory", () => {
      const skillsDir = join(subdir, ".agents", "skills");
      createSkill(skillsDir, "code-review", {
        description: "Review code changes",
        body: "Check for bugs, style issues, and security problems.",
      });

      const result = discoverSkills(subdir);
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe("code-review");
      expect(result.skills[0].description).toBe("Review code changes");
      expect(result.skills[0].source).toBe("project");
      expect(result.skills[0].body).toContain("Check for bugs");
    });

    it("discovers skills from .dhara/skills/ in current directory", () => {
      const skillsDir = join(subdir, ".dhara", "skills");
      createSkill(skillsDir, "deploy", {
        description: "Deploy to production",
      });

      const result = discoverSkills(subdir);
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe("deploy");
      expect(result.skills[0].source).toBe("project");
    });

    it("discovers skills from both .agents/skills/ and .dhara/skills/", () => {
      createSkill(join(subdir, ".agents", "skills"), "review", {
        description: "Review code",
      });
      createSkill(join(subdir, ".dhara", "skills"), "deploy", {
        description: "Deploy code",
      });

      const result = discoverSkills(subdir);
      expect(result.skills).toHaveLength(2);
    });

    it("finds skills in parent directory when cwd has none", () => {
      const skillsDir = join(root, ".agents", "skills");
      createSkill(skillsDir, "test", {
        description: "Run tests",
      });

      const result = discoverSkills(subdir);
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe("test");
    });

    it("prefers closest ancestor skills over higher ones", () => {
      // Parent has a skill
      createSkill(join(root, ".agents", "skills"), "lint", {
        description: "Parent lint skill",
      });
      // Child has the same skill
      createSkill(join(subdir, ".agents", "skills"), "lint", {
        description: "Child lint skill",
      });

      const result = discoverSkills(subdir);
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].description).toBe("Child lint skill");
    });

    it("prefers .dhara/skills/ over .agents/skills/ for same name", () => {
      createSkill(join(subdir, ".agents", "skills"), "build", {
        description: "Agent build skill",
      });
      createSkill(join(subdir, ".dhara", "skills"), "build", {
        description: "Dhara build skill",
      });

      const result = discoverSkills(subdir);
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].description).toBe("Dhara build skill");
    });

    it("parses SKILL.md frontmatter correctly", () => {
      const skillsDir = join(subdir, ".agents", "skills");
      const name = "my-skill";
      const dir = join(skillsDir, name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "SKILL.md"),
        [
          "---",
          "name: my-skill",
          "description: A skill with all fields",
          "license: MIT",
          "compatibility: Requires bash",
          "---",
          "",
          "Step 1: Do this",
          "Step 2: Do that",
        ].join("\n"),
        "utf-8",
      );

      const result = discoverSkills(subdir);
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe("my-skill");
      expect(result.skills[0].description).toBe("A skill with all fields");
      expect(result.skills[0].license).toBe("MIT");
      expect(result.skills[0].compatibility).toBe("Requires bash");
      expect(result.skills[0].body).toContain("Step 1: Do this");
      expect(result.skills[0].body).toContain("Step 2: Do that");
    });

    it("skips directories without SKILL.md", () => {
      const skillsDir = join(subdir, ".agents", "skills");
      mkdirSync(join(skillsDir, "empty-dir"), { recursive: true });
      mkdirSync(join(skillsDir, "also-empty"), { recursive: true });

      const result = discoverSkills(subdir);
      expect(result.skills).toEqual([]);
    });

    it("skips SKILL.md without valid frontmatter", () => {
      const skillsDir = join(subdir, ".agents", "skills");
      const dir = join(skillsDir, "bad-skill");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "SKILL.md"), "Just plain text, no frontmatter", "utf-8");

      const result = discoverSkills(subdir);
      expect(result.skills).toEqual([]);
    });

    it("skips SKILL.md missing name or description", () => {
      const skillsDir = join(subdir, ".agents", "skills");
      const dir = join(skillsDir, "incomplete");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "SKILL.md"),
        "---\nlicense: MIT\n---\n\nNo name or description.",
        "utf-8",
      );

      const result = discoverSkills(subdir);
      expect(result.skills).toEqual([]);
    });

    it("enforces name matches directory name per Agent Skills spec", () => {
      const skillsDir = join(subdir, ".agents", "skills");
      const dir = join(skillsDir, "actual-dir-name");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "SKILL.md"),
        "---\nname: different-name\ndescription: Mismatched\n---\n\nBody.",
        "utf-8",
      );

      const result = discoverSkills(subdir);
      expect(result.skills).toEqual([]);
    });
  });
});
