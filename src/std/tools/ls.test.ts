import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSandbox } from "../../core/sandbox.js";
import { createLsTool } from "./ls.js";

describe("ls tool", () => {
  let tmpDir: string;

  function setup() {
    tmpDir = mkdtempSync(join(tmpdir(), "dhara-test-"));
    const sandbox = createSandbox({
      granted: ["filesystem:read"],
      cwd: tmpDir,
    });
    return createLsTool({ cwd: tmpDir, sandbox });
  }

  function teardown(): void {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  it("lists files and directories in cwd by default", async () => {
    const tool = setup();
    writeFileSync(join(tmpDir, "file1.txt"), "");
    writeFileSync(join(tmpDir, "file2.txt"), "");
    mkdirSync(join(tmpDir, "subdir"));

    const result = await tool.execute({});

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain("file1.txt");
    expect(text).toContain("file2.txt");
    expect(text).toContain("subdir/");
    teardown();
  });

  it("lists contents of a specific path", async () => {
    const tool = setup();
    mkdirSync(join(tmpDir, "mydir"));
    writeFileSync(join(tmpDir, "mydir", "inner.txt"), "");

    const result = await tool.execute({ path: "mydir" });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("inner.txt");
    teardown();
  });

  it("blocks listing outside cwd", async () => {
    const tool = setup();

    const result = await tool.execute({ path: "/etc" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("outside cwd");
    teardown();
  });

  it("blocks listing with path traversal (../)", async () => {
    const tool = setup();

    const result = await tool.execute({ path: "../../../tmp" });

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
    const tool = createLsTool({ cwd: tmpDir, sandbox: restrictedSandbox });

    const result = await tool.execute({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not granted");
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("includes entry count in metadata", async () => {
    const tool = setup();
    writeFileSync(join(tmpDir, "a.txt"), "");
    writeFileSync(join(tmpDir, "b.txt"), "");

    const result = await tool.execute({});

    expect(result.isError).toBeFalsy();
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.entryCount).toBe(2);
    teardown();
  });
});
