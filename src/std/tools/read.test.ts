import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ToolRegistration } from "../../core/provider.js";
import { createSandbox } from "../../core/sandbox.js";
import type { Sandbox } from "../../core/sandbox.js";
import { createReadTool } from "./read.js";

describe("read tool", () => {
  let tmpDir: string;

  function setup(): { tool: ToolRegistration; sandbox: Sandbox } {
    tmpDir = mkdtempSync(join(tmpdir(), "dhara-test-"));
    const sandbox = createSandbox({
      granted: ["filesystem:read"],
      cwd: tmpDir,
    });
    const tool = createReadTool({ cwd: tmpDir, sandbox });
    return { tool, sandbox };
  }

  function teardown(): void {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  function writeFixture(path: string, content: string): void {
    const fullPath = join(tmpDir, path);
    mkdirSync(join(tmpDir, "..", ".."), { recursive: true }); // ensure parent(s) exist
    const dir = path.includes("/") ? join(tmpDir, path.slice(0, path.lastIndexOf("/"))) : tmpDir;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
  }

  it("reads a file and returns its content", async () => {
    const { tool } = setup();
    writeFixture("hello.txt", "Hello, world!");

    const result = await tool.execute({ path: "hello.txt" });

    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("Hello, world!");
    teardown();
  });

  it("reads a file with absolute path within cwd", async () => {
    const { tool } = setup();
    writeFixture("data.json", '{"key": "value"}');

    const result = await tool.execute({ path: join(tmpDir, "data.json") });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe('{"key": "value"}');
    teardown();
  });

  it("supports offset (1-indexed line number)", async () => {
    const { tool } = setup();
    writeFixture("lines.txt", "line1\nline2\nline3\nline4\nline5");

    const result = await tool.execute({ path: "lines.txt", offset: 3 });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe("line3\nline4\nline5");
    teardown();
  });

  it("supports limit on number of lines", async () => {
    const { tool } = setup();
    writeFixture("lines.txt", "line1\nline2\nline3\nline4\nline5");

    const result = await tool.execute({ path: "lines.txt", limit: 2 });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe(
      "line1\nline2\n\n[Showing lines 1-2 of 5. Use offset=3 to continue.]",
    );
    teardown();
  });

  it("supports combined offset and limit", async () => {
    const { tool } = setup();
    writeFixture("lines.txt", "line1\nline2\nline3\nline4\nline5");

    const result = await tool.execute({ path: "lines.txt", offset: 2, limit: 3 });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe(
      "line2\nline3\nline4\n\n[Showing lines 2-4 of 5. Use offset=5 to continue.]",
    );
    teardown();
  });

  it("returns isError for non-existent file", async () => {
    const { tool } = setup();

    const result = await tool.execute({ path: "nonexistent.txt" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
    teardown();
  });

  it("blocks reads outside cwd", async () => {
    const { tool } = setup();

    const result = await tool.execute({ path: "/etc/passwd" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("outside cwd");
    teardown();
  });

  it("blocks reads with path traversal (../)", async () => {
    const { tool } = setup();

    const result = await tool.execute({ path: "../../../etc/passwd" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("outside cwd");
    teardown();
  });

  it("returns isError when filesystem:read capability is missing", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "dhara-test-"));
    writeFixture("secret.txt", "secret data");
    const restrictedSandbox = createSandbox({
      granted: [],
      cwd: tmpDir,
    });
    const tool = createReadTool({ cwd: tmpDir, sandbox: restrictedSandbox });

    const result = await tool.execute({ path: "secret.txt" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not granted");
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads an empty file", async () => {
    const { tool } = setup();
    writeFixture("empty.txt", "");

    const result = await tool.execute({ path: "empty.txt" });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe("");
    teardown();
  });

  it("returns meaningful metadata (line count)", async () => {
    const { tool } = setup();
    writeFixture("stats.txt", "a\nb\nc\n");

    const result = await tool.execute({ path: "stats.txt" });

    expect(result.isError).toBeFalsy();
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.lineCount).toBe(3);
    teardown();
  });
});
