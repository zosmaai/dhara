import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSandbox } from "../../core/sandbox.js";
import { createGrepTool } from "./grep.js";

describe("grep tool", () => {
  let tmpDir: string;

  function setup() {
    tmpDir = mkdtempSync(join(tmpdir(), "dhara-test-"));
    const sandbox = createSandbox({
      granted: ["filesystem:read"],
      cwd: tmpDir,
    });
    return createGrepTool({ cwd: tmpDir, sandbox });
  }

  function teardown(): void {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  it("finds pattern in files within cwd", async () => {
    const tool = setup();
    writeFileSync(join(tmpDir, "a.txt"), "hello world\nfoo bar");
    writeFileSync(join(tmpDir, "b.txt"), "goodbye world\nbaz qux");

    const result = await tool.execute({ pattern: "world" });

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain("a.txt");
    expect(text).toContain("b.txt");
    teardown();
  });

  it("supports case-insensitive search", async () => {
    const tool = setup();
    writeFileSync(join(tmpDir, "data.txt"), "Hello\nhello\nHELLO");

    const result = await tool.execute({ pattern: "hello", caseInsensitive: true });

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    // All three lines match "hello" case-insensitively
    expect(text).toContain("Hello");
    expect(text).toContain("hello");
    expect(text).toContain("HELLO");
    expect(result.metadata?.matchCount).toBe(3);
    teardown();
  });

  it("returns empty when pattern not found", async () => {
    const tool = setup();
    writeFileSync(join(tmpDir, "data.txt"), "nothing to see here");

    const result = await tool.execute({ pattern: "nonexistent" });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("No matches");
    teardown();
  });

  it("blocks search outside cwd", async () => {
    const tool = setup();

    const result = await tool.execute({ pattern: "test", path: "/etc" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("outside cwd");
    teardown();
  });

  it("blocks search with path traversal", async () => {
    const tool = setup();

    const result = await tool.execute({ pattern: "test", path: "../../../etc" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("outside cwd");
    teardown();
  });

  it("returns error when filesystem:read capability is missing", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "dhara-test-"));
    const restrictedSandbox = createSandbox({
      granted: [],
      cwd: tmpDir,
    });
    const tool = createGrepTool({ cwd: tmpDir, sandbox: restrictedSandbox });

    const result = await tool.execute({ pattern: "test" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not granted");
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("includes match count in metadata", async () => {
    const tool = setup();
    writeFileSync(join(tmpDir, "data.txt"), "MATCH\nother\nmatch\nmatch");

    const result = await tool.execute({ pattern: "match" });

    expect(result.isError).toBeFalsy();
    expect(result.metadata).toBeDefined();
    // "MATCH" won't match (case-sensitive), "other" won't, "match" appears on lines 3 and 4
    expect(result.metadata?.matchCount).toBe(2);
    teardown();
  });

  it("searches recursively into subdirectories", async () => {
    const tool = setup();
    mkdirSync(join(tmpDir, "sub"));
    writeFileSync(join(tmpDir, "sub", "nested.txt"), "deep pattern here");

    const result = await tool.execute({ pattern: "pattern" });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("sub/nested.txt");
    teardown();
  });
});
