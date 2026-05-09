import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSandbox } from "../../core/sandbox.js";
import { createBashTool } from "./bash.js";

describe("bash tool", () => {
  let tmpDir: string;

  function setup() {
    tmpDir = mkdtempSync(join(tmpdir(), "dhara-test-"));
    const sandbox = createSandbox({
      granted: ["process:spawn", "filesystem:read", "filesystem:write"],
      cwd: tmpDir,
    });
    return createBashTool({ cwd: tmpDir, sandbox });
  }

  function teardown(): void {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  it("executes a command and returns output", async () => {
    const tool = setup();

    const result = await tool.execute({ command: "echo hello" });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("hello");
    teardown();
  });

  it("captures both stdout and stderr", async () => {
    const tool = setup();

    // Use a command that outputs to both streams
    const result = await tool.execute({
      command: "echo stdout && echo stderr >&2",
    });

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain("stdout");
    expect(text).toContain("stderr");
    teardown();
  });

  it("supports timeout", async () => {
    const tool = setup();

    const result = await tool.execute({
      command: "sleep 10 && echo done",
      timeout: 1,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("timed out");
    expect(result.content[0].text).toContain("1 seconds");
    teardown();
  });

  it("returns stderr on non-zero exit", async () => {
    const tool = setup();

    const result = await tool.execute({ command: "exit 42" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("exited with code 42");
    teardown();
  });

  it("reports command output even on error", async () => {
    const tool = setup();

    const result = await tool.execute({
      command: "echo 'partial output' && exit 1",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("partial output");
    expect(result.content[0].text).toContain("exited with code 1");
    teardown();
  });

  it("blocks when process:spawn capability is missing", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "dhara-test-"));
    const restrictedSandbox = createSandbox({
      granted: ["filesystem:read"],
      cwd: tmpDir,
    });
    const tool = createBashTool({ cwd: tmpDir, sandbox: restrictedSandbox });

    const result = await tool.execute({ command: "echo hi" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not granted");
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("executes commands relative to cwd", async () => {
    const tool = setup();
    writeFileSync(join(tmpDir, "test.txt"), "cwd test");

    const result = await tool.execute({ command: "cat test.txt" });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("cwd test");
    teardown();
  });
});
