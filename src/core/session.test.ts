import { describe, expect, it } from "vitest";
import { createSession, type SessionEntry, type BranchEntry } from "./session.js";

describe("Session Format", () => {
  describe("append + getEntry", () => {
    it("appends a user entry and retrieves it", () => {
      const session = createSession({ cwd: "/tmp/test" });
      const entry = session.append({
        role: "user",
        content: [{ type: "text", text: "Hello" }],
      });

      expect(entry.id).toBeDefined();
      expect(entry.role).toBe("user");

      const retrieved = session.getEntry(entry.id);
      expect(retrieved).toEqual(entry);
    });

    it("appends multiple entries with sequential IDs", () => {
      const session = createSession({ cwd: "/tmp/test" });
      const e1 = session.append({ role: "user", content: [{ type: "text", text: "1" }] });
      const e2 = session.append({ role: "assistant", content: [{ type: "text", text: "2" }] });
      const e3 = session.append({ role: "tool_result", content: [{ type: "text", text: "3" }] });

      expect(e1.id < e2.id).toBe(true);
      expect(e2.id < e3.id).toBe(true);
    });

    it("links entries via parentId", () => {
      const session = createSession({ cwd: "/tmp/test" });
      const parent = session.append({ role: "user", content: [] });
      const child = session.append({ role: "assistant", content: [] }, parent.id);

      expect(child.parentId).toBe(parent.id);
    });

    it("returns undefined for unknown entry IDs", () => {
      const session = createSession({ cwd: "/tmp/test" });
      expect(session.getEntry("nonexistent")).toBeUndefined();
    });
  });

  describe("fork", () => {
    it("creates a branch from an entry", () => {
      const session = createSession({ cwd: "/tmp/test" });
      const e1 = session.append({ role: "user", content: [] });
      const e2 = session.append({ role: "assistant", content: [] }, e1.id);

      const branch = session.fork(e2.id, "try-different-approach");

      expect(branch.type).toBe("branch");
      expect(branch.parentId).toBe(e2.id);
      expect(branch.label).toBe("try-different-approach");
    });

    it("appends after a branch on the branch path", () => {
      const session = createSession({ cwd: "/tmp/test" });
      const e1 = session.append({ role: "user", content: [] });
      const branch = session.fork(e1.id);
      const e2 = session.append({ role: "assistant", content: [] }, branch.id);

      expect(e2.parentId).toBe(branch.id);
    });

    it("throws when forking from a non-existent entry", () => {
      const session = createSession({ cwd: "/tmp/test" });
      expect(() => session.fork("nonexistent")).toThrow("Entry not found");
    });
  });

  describe("getPath", () => {
    it("returns path from root to head on main branch", () => {
      const session = createSession({ cwd: "/tmp/test" });
      const e1 = session.append({ role: "system", content: [] });
      const e2 = session.append({ role: "user", content: [] }, e1.id);
      const e3 = session.append({ role: "assistant", content: [] }, e2.id);

      const path = session.getPath();
      expect(path).toEqual([e1.id, e2.id, e3.id]);
    });

    it("returns path through a branch", () => {
      const session = createSession({ cwd: "/tmp/test" });
      const e1 = session.append({ role: "user", content: [] });
      const e2 = session.append({ role: "assistant", content: [] }, e1.id);
      const branch = session.fork(e1.id);
      const e3 = session.append({ role: "assistant", content: [] }, branch.id);

      const path = session.getPath(branch.id);
      expect(path).toEqual([e1.id, branch.id, e3.id]);
    });

    it("returns empty path for empty session", () => {
      const session = createSession({ cwd: "/tmp/test" });
      expect(session.getPath()).toEqual([]);
    });
  });

  describe("getHead", () => {
    it("returns the latest entry on main branch", () => {
      const session = createSession({ cwd: "/tmp/test" });
      const e1 = session.append({ role: "user", content: [] });
      const e2 = session.append({ role: "assistant", content: [] }, e1.id);

      expect(session.getHead()).toEqual(e2);
    });

    it("returns undefined for empty session", () => {
      const session = createSession({ cwd: "/tmp/test" });
      expect(session.getHead()).toBeUndefined();
    });
  });

  describe("export + import", () => {
    it("round-trips through JSONL", () => {
      const session = createSession({ cwd: "/tmp/test" });
      session.append({ role: "system", content: [{ type: "text", text: "sys" }] });
      session.append({ role: "user", content: [{ type: "text", text: "hi" }] });

      const exported = session.export();
      const imported = createSession({ cwd: "/tmp/test" });
      imported.import(exported);

      expect(imported.getHead()?.role).toBe("user");
      expect(imported.getPath()).toHaveLength(2);
    });

    it("round-trips branches through JSONL", () => {
      const session = createSession({ cwd: "/tmp/test" });
      const e1 = session.append({ role: "user", content: [] });
      session.append({ role: "assistant", content: [] }, e1.id);
      const branch = session.fork(e1.id, "alt");
      session.append({ role: "assistant", content: [] }, branch.id);

      const exported = session.export();
      const imported = createSession({ cwd: "/tmp/test" });
      imported.import(exported);

      expect(imported.getPath(branch.id)).toHaveLength(3);
    });
  });

  describe("metadata", () => {
    it("tracks session metadata", () => {
      const session = createSession({
        cwd: "/home/user/project",
        model: { id: "claude-sonnet-4", provider: "anthropic" },
      });

      expect(session.meta.cwd).toBe("/home/user/project");
      expect(session.meta.model).toEqual({ id: "claude-sonnet-4", provider: "anthropic" });
    });

    it("auto-generates sessionId", () => {
      const session = createSession({ cwd: "/tmp" });
      expect(session.meta.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe("entry types", () => {
    it("supports all roles", () => {
      const session = createSession({ cwd: "/tmp/test" });

      const system = session.append({ role: "system", content: [] });
      const user = session.append({ role: "user", content: [] }, system.id);
      const assistant = session.append({ role: "assistant", content: [] }, user.id);
      const toolResult = session.append({ role: "tool_result", content: [] }, assistant.id);

      expect(system.role).toBe("system");
      expect(user.role).toBe("user");
      expect(assistant.role).toBe("assistant");
      expect(toolResult.role).toBe("tool_result");
    });

    it("preserves tool call metadata", () => {
      const session = createSession({ cwd: "/tmp/test" });
      const entry = session.append({
        role: "assistant",
        content: [{ type: "text", text: "result" }],
        toolCalls: [
          {
            id: "tc1",
            name: "read",
            input: { path: "/tmp" },
            output: { content: [{ type: "text", text: "data" }] },
          },
        ],
      });

      expect(entry.toolCalls).toHaveLength(1);
      expect(entry.toolCalls?.[0].name).toBe("read");
    });
  });
});
