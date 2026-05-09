import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSandbox } from "../../core/sandbox.js";
import { createEditTool } from "./edit.js";

describe("edit tool", () => {
  let tmpDir: string;

  function setup() {
    tmpDir = mkdtempSync(join(tmpdir(), "dhara-test-"));
    const sandbox = createSandbox({
      granted: ["filesystem:read", "filesystem:write"],
      cwd: tmpDir,
    });
    return createEditTool({ cwd: tmpDir, sandbox });
  }

  function teardown(): void {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  function writeFixture(path: string, content: string): void {
    writeFileSync(join(tmpDir, path), content, "utf-8");
  }

  it("replaces a single block of text", async () => {
    const tool = setup();
    writeFixture("hello.txt", "Hello, world!");

    const result = await tool.execute({
      path: "hello.txt",
      edits: [{ oldText: "world", newText: "Dhara" }],
    });

    expect(result.isError).toBeFalsy();
    expect(readFileSync(join(tmpDir, "hello.txt"), "utf-8")).toBe("Hello, Dhara!");
    expect(result.metadata?.diff).toBeDefined();
    teardown();
  });

  it("supports multiple disjoint edits in one call", async () => {
    const tool = setup();
    writeFixture("multi.txt", "foo\nbar\nbaz");

    const result = await tool.execute({
      path: "multi.txt",
      edits: [
        { oldText: "foo", newText: "FOO" },
        { oldText: "baz", newText: "BAZ" },
      ],
    });

    expect(result.isError).toBeFalsy();
    expect(readFileSync(join(tmpDir, "multi.txt"), "utf-8")).toBe("FOO\nbar\nBAZ");
    teardown();
  });

  it("returns error when oldText is not found", async () => {
    const tool = setup();
    writeFixture("data.txt", "existing content");

    const result = await tool.execute({
      path: "data.txt",
      edits: [{ oldText: "nonexistent", newText: "replacement" }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
    teardown();
  });

  it("returns error when oldText matches multiple times", async () => {
    const tool = setup();
    writeFixture("repeated.txt", "repeat repeat repeat");

    const result = await tool.execute({
      path: "repeated.txt",
      edits: [{ oldText: "repeat", newText: "unique" }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("matches 3 times");
    teardown();
  });

  it("blocks edits outside cwd", async () => {
    const tool = setup();

    const result = await tool.execute({
      path: "/etc/config",
      edits: [{ oldText: "old", newText: "new" }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("outside cwd");
    teardown();
  });

  it("blocks edits with path traversal (../)", async () => {
    const tool = setup();

    const result = await tool.execute({
      path: "../../../etc/config",
      edits: [{ oldText: "old", newText: "new" }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("outside cwd");
    teardown();
  });

  it("returns error when write capability is missing", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "dhara-test-"));
    writeFileSync(join(tmpDir, "test.txt"), "content");
    const restrictedSandbox = createSandbox({
      granted: ["filesystem:read"],
      cwd: tmpDir,
    });
    const tool = createEditTool({ cwd: tmpDir, sandbox: restrictedSandbox });

    const result = await tool.execute({
      path: "test.txt",
      edits: [{ oldText: "content", newText: "modified" }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not granted");
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("includes unified diff in metadata", async () => {
    const tool = setup();
    writeFixture("diff.txt", "line1\nline2\nline3");

    const result = await tool.execute({
      path: "diff.txt",
      edits: [{ oldText: "line2", newText: "CHANGED" }],
    });

    expect(result.isError).toBeFalsy();
    expect(result.metadata?.diff).toContain("-line2");
    expect(result.metadata?.diff).toContain("+CHANGED");
    teardown();
  });
});
