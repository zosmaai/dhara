import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSandbox } from "../../core/sandbox.js";
import { createWriteTool } from "./write.js";

describe("write tool", () => {
  let tmpDir: string;

  function setup(): ReturnType<typeof createWriteTool> {
    tmpDir = mkdtempSync(join(tmpdir(), "dhara-test-"));
    const sandbox = createSandbox({
      granted: ["filesystem:write"],
      cwd: tmpDir,
    });
    return createWriteTool({ cwd: tmpDir, sandbox });
  }

  function teardown(): void {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  it("creates a new file with given content", async () => {
    const tool = setup();

    const result = await tool.execute({ path: "hello.txt", content: "Hello, world!" });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("hello.txt");
    expect(readFileSync(join(tmpDir, "hello.txt"), "utf-8")).toBe("Hello, world!");
    teardown();
  });

  it("overwrites an existing file", async () => {
    const tool = setup();
    writeFileSync(join(tmpDir, "existing.txt"), "old content");

    const result = await tool.execute({ path: "existing.txt", content: "new content" });

    expect(result.isError).toBeFalsy();
    expect(readFileSync(join(tmpDir, "existing.txt"), "utf-8")).toBe("new content");
    teardown();
  });

  it("creates parent directories if needed", async () => {
    const tool = setup();

    const result = await tool.execute({ path: "nested/deep/file.txt", content: "deep" });

    expect(result.isError).toBeFalsy();
    expect(readFileSync(join(tmpDir, "nested/deep/file.txt"), "utf-8")).toBe("deep");
    teardown();
  });

  it("blocks writes outside cwd", async () => {
    const tool = setup();

    const result = await tool.execute({ path: "/tmp/evil.txt", content: "evil" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("outside cwd");
    teardown();
  });

  it("blocks writes with path traversal (../)", async () => {
    const tool = setup();

    const result = await tool.execute({ path: "../../../tmp/evil.txt", content: "evil" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("outside cwd");
    teardown();
  });

  it("returns isError when filesystem:write capability is missing", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "dhara-test-"));
    const restrictedSandbox = createSandbox({
      granted: [],
      cwd: tmpDir,
    });
    const tool = createWriteTool({ cwd: tmpDir, sandbox: restrictedSandbox });

    const result = await tool.execute({ path: "secret.txt", content: "data" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not granted");
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("handles empty content", async () => {
    const tool = setup();

    const result = await tool.execute({ path: "empty.txt", content: "" });

    expect(result.isError).toBeFalsy();
    expect(readFileSync(join(tmpDir, "empty.txt"), "utf-8")).toBe("");
    teardown();
  });
});
