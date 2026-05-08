import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager, SessionNotFoundError } from "./session-manager.js";

describe("SessionManager", () => {
  let storageDir: string;
  let manager: SessionManager;

  beforeEach(() => {
    storageDir = mkdtempSync(join(tmpdir(), "dhara-sessions-"));
    manager = new SessionManager({ storageDir });
  });

  afterEach(() => {
    rmSync(storageDir, { recursive: true, force: true });
  });

  describe("create", () => {
    it("creates a session and persists it to disk", () => {
      const session = manager.create({ cwd: "/home/user/project" });

      expect(session.meta.cwd).toBe("/home/user/project");
      expect(session.meta.sessionId).toBeDefined();

      const filePath = join(storageDir, `${session.meta.sessionId}.jsonl`);
      expect(existsSync(filePath)).toBe(true);
    });

    it("creates a session with model and tags", () => {
      const session = manager.create({
        cwd: "/tmp",
        model: { id: "gpt-4", provider: "openai" },
        tags: ["feature-x"],
      });

      expect(session.meta.model).toEqual({ id: "gpt-4", provider: "openai" });
      expect(session.meta.tags).toEqual(["feature-x"]);
    });

    it("creates the storage directory if it does not exist", () => {
      const nestedDir = join(storageDir, "nested", "deep");
      const nestedManager = new SessionManager({ storageDir: nestedDir });
      const session = nestedManager.create({ cwd: "/tmp" });

      expect(existsSync(join(nestedDir, `${session.meta.sessionId}.jsonl`))).toBe(true);
    });
  });

  describe("auto-save", () => {
    it("persists on append", () => {
      const session = manager.create({ cwd: "/tmp" });
      session.append({ role: "user", content: [{ type: "text", text: "hello" }] });

      const filePath = join(storageDir, `${session.meta.sessionId}.jsonl`);
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("hello");
    });

    it("persists on fork", () => {
      const session = manager.create({ cwd: "/tmp" });
      const entry = session.append({ role: "user", content: [{ type: "text", text: "hi" }] });
      const branch = session.fork(entry.id, "alt");

      const filePath = join(storageDir, `${session.meta.sessionId}.jsonl`);
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain(branch.id);
    });

    it("updates updatedAt on each save", async () => {
      const session = manager.create({ cwd: "/tmp" });
      const before = session.meta.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));
      session.append({ role: "user", content: [{ type: "text", text: "x" }] });

      expect(session.meta.updatedAt > before).toBe(true);
    });
  });

  describe("load", () => {
    it("restores a persisted session", () => {
      const original = manager.create({ cwd: "/home/user/project" });
      original.append({ role: "user", content: [{ type: "text", text: "hello" }] });
      original.append({ role: "assistant", content: [{ type: "text", text: "world" }] });

      const restored = manager.load(original.meta.sessionId);

      expect(restored.meta.sessionId).toBe(original.meta.sessionId);
      expect(restored.meta.cwd).toBe("/home/user/project");
      expect(restored.getPath()).toHaveLength(2);
      expect(restored.getHead()?.role).toBe("assistant");
    });

    it("restores branches", () => {
      const original = manager.create({ cwd: "/tmp" });
      const e1 = original.append({ role: "user", content: [] });
      const branch = original.fork(e1.id, "alt");
      original.append({ role: "assistant", content: [] }, branch.id);

      const restored = manager.load(original.meta.sessionId);
      expect(restored.getPath(branch.id)).toHaveLength(3);
    });

    it("restored session auto-saves on append", () => {
      const original = manager.create({ cwd: "/tmp" });
      original.append({ role: "user", content: [{ type: "text", text: "first" }] });

      const restored = manager.load(original.meta.sessionId);
      restored.append({ role: "assistant", content: [{ type: "text", text: "second" }] });

      const filePath = join(storageDir, `${original.meta.sessionId}.jsonl`);
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("second");
    });

    it("throws SessionNotFoundError for missing session", () => {
      expect(() => manager.load("nonexistent-id")).toThrow(SessionNotFoundError);
    });
  });

  describe("list", () => {
    it("returns empty array when no sessions exist", () => {
      expect(manager.list()).toEqual([]);
    });

    it("returns empty array when storage directory does not exist", () => {
      const missingDir = join(storageDir, "missing", "nested");
      const missingManager = new SessionManager({ storageDir: missingDir });
      expect(missingManager.list()).toEqual([]);
    });

    it("skips corrupted session files", () => {
      const session = manager.create({ cwd: "/tmp" });
      session.append({ role: "user", content: [{ type: "text", text: "valid" }] });

      // Corrupt the file by overwriting with invalid JSON
      const filePath = join(storageDir, `${session.meta.sessionId}.jsonl`);
      writeFileSync(filePath, "not-json", "utf-8");

      expect(manager.list()).toEqual([]);
    });

    it("returns metadata for all sessions", () => {
      const s1 = manager.create({ cwd: "/project/a" });
      s1.append({ role: "user", content: [{ type: "text", text: "a" }] });

      const s2 = manager.create({ cwd: "/project/b" });
      s2.append({ role: "user", content: [{ type: "text", text: "b" }] });
      s2.append({ role: "assistant", content: [{ type: "text", text: "c" }] });

      const list = manager.list();
      expect(list).toHaveLength(2);

      const found1 = list.find((s) => s.sessionId === s1.meta.sessionId);
      const found2 = list.find((s) => s.sessionId === s2.meta.sessionId);

      expect(found1?.cwd).toBe("/project/a");
      expect(found1?.entryCount).toBe(1);

      expect(found2?.cwd).toBe("/project/b");
      expect(found2?.entryCount).toBe(2);
    });

    it("returns correct fileSize", () => {
      const session = manager.create({ cwd: "/tmp" });
      session.append({ role: "user", content: [{ type: "text", text: "hello world" }] });

      const list = manager.list();
      expect(list[0].fileSize).toBeGreaterThan(0);
    });
  });

  describe("delete", () => {
    it("removes a session file", () => {
      const session = manager.create({ cwd: "/tmp" });
      const id = session.meta.sessionId;

      manager.delete(id);

      expect(existsSync(join(storageDir, `${id}.jsonl`))).toBe(false);
    });

    it("throws SessionNotFoundError for missing session", () => {
      expect(() => manager.delete("nonexistent-id")).toThrow(SessionNotFoundError);
    });
  });

  describe("save", () => {
    it("explicitly saves a session", () => {
      const session = manager.create({ cwd: "/tmp" });
      session.append({ role: "user", content: [{ type: "text", text: "first" }] });

      // Force a re-save by calling save directly
      session.save();

      const filePath = join(storageDir, `${session.meta.sessionId}.jsonl`);
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("first");
    });

    it("saves on import", () => {
      const session = manager.create({ cwd: "/tmp" });
      const exported = session.export();

      const session2 = manager.create({ cwd: "/other" });
      session2.import(exported);

      const filePath = join(storageDir, `${session2.meta.sessionId}.jsonl`);
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain(session.meta.sessionId);
    });
  });

  describe("edge cases", () => {
    it("skips empty session files in list", () => {
      const session = manager.create({ cwd: "/tmp" });
      const filePath = join(storageDir, `${session.meta.sessionId}.jsonl`);
      writeFileSync(filePath, "", "utf-8");

      expect(manager.list()).toEqual([]);
    });
  });
});
