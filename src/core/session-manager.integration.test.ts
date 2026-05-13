import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionManager, SessionNotFoundError } from "./session-manager.js";

describe("SessionManager integration", () => {
  let tmpDir: string;
  let manager: SessionManager;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "dhara-session-test-"));
    manager = new SessionManager({ storageDir: tmpDir });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates and persists a session to disk", () => {
    const session = manager.create({
      cwd: "/test/project",
      model: { id: "gpt-4", provider: "openai" },
    });

    // Verify file exists on disk
    const filePath = join(tmpDir, `${session.meta.sessionId}.jsonl`);
    expect(existsSync(filePath)).toBe(true);

    // Verify file content is valid JSONL
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const meta = JSON.parse(lines[0]);
    expect(meta.sessionId).toBe(session.meta.sessionId);
    expect(meta.cwd).toBe("/test/project");
  });

  it("lists created sessions", () => {
    const s1 = manager.create({ cwd: "/project-a" });
    const s2 = manager.create({ cwd: "/project-b" });

    const list = manager.list();
    expect(list.length).toBeGreaterThanOrEqual(2);

    const ids = list.map((s) => s.sessionId);
    expect(ids).toContain(s1.meta.sessionId);
    expect(ids).toContain(s2.meta.sessionId);
  });

  it("loads a persisted session", () => {
    const original = manager.create({ cwd: "/test/project" });
    original.append({ role: "user", content: [{ type: "text", text: "Hello" }] });

    const loaded = manager.load(original.meta.sessionId);
    const path = loaded.getPath();
    expect(path.length).toBeGreaterThanOrEqual(1);
    // The session should have entries after loading
    const pathEntries = path.map((id) => loaded.getEntry(id)).filter(Boolean);
    expect(pathEntries.length).toBeGreaterThanOrEqual(1);
  });

  it("deletes a session from disk", () => {
    const session = manager.create({ cwd: "/test/project" });
    const filePath = join(tmpDir, `${session.meta.sessionId}.jsonl`);
    expect(existsSync(filePath)).toBe(true);

    manager.delete(session.meta.sessionId);
    expect(existsSync(filePath)).toBe(false);
  });

  it("auto-saves on append", () => {
    const session = manager.create({ cwd: "/test/project" });
    const filePath = join(tmpDir, `${session.meta.sessionId}.jsonl`);

    // Append a message
    session.append({ role: "user", content: [{ type: "text", text: "Hi" }] });

    // Re-read file and verify the entry is there
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    expect(lines.length).toBe(2); // meta + 1 entry
  });

  it("returns empty list when no sessions exist", () => {
    const list = manager.list();
    expect(list).toEqual([]);
  });

  it("returns session summaries with correct metadata", () => {
    const session = manager.create({
      cwd: "/test/project",
      model: { id: "gpt-4", provider: "openai" },
      tags: ["test"],
    });
    session.append({ role: "user", content: [{ type: "text", text: "Hello" }] });

    const list = manager.list();
    const summary = list.find((s) => s.sessionId === session.meta.sessionId);
    expect(summary).toBeDefined();
    expect(summary?.cwd).toBe("/test/project");
    expect(summary?.entryCount).toBe(1);
    expect(summary?.fileSize).toBeGreaterThan(0);
  });

  it("throws SessionNotFoundError for non-existent session", () => {
    expect(() => manager.load("nonexistent")).toThrow(SessionNotFoundError);
    expect(() => manager.delete("nonexistent")).toThrow(SessionNotFoundError);
  });
});
