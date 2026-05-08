import { describe, expect, it } from "vitest";
import { createSandbox, type Capability } from "./sandbox.js";

describe("Sandbox", () => {
  describe("capability checks", () => {
    it("allows operations within granted capabilities", () => {
      const sandbox = createSandbox({
        granted: ["filesystem:read", "network:outbound"],
      });

      expect(sandbox.check("filesystem:read").allowed).toBe(true);
      expect(sandbox.check("network:outbound").allowed).toBe(true);
    });

    it("blocks operations outside granted capabilities", () => {
      const sandbox = createSandbox({
        granted: ["filesystem:read"],
      });

      const result = sandbox.check("filesystem:write");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not granted");
    });

    it("blocks all operations when no capabilities granted", () => {
      const sandbox = createSandbox({ granted: [] });

      expect(sandbox.check("filesystem:read").allowed).toBe(false);
      expect(sandbox.check("process:spawn").allowed).toBe(false);
    });
  });

  describe("path traversal protection", () => {
    it("allows reads within cwd", () => {
      const sandbox = createSandbox({
        granted: ["filesystem:read"],
        cwd: "/home/user/project",
      });

      expect(sandbox.checkFileRead("src/index.ts").allowed).toBe(true);
      expect(sandbox.checkFileRead("/home/user/project/src/index.ts").allowed).toBe(true);
    });

    it("blocks reads outside cwd", () => {
      const sandbox = createSandbox({
        granted: ["filesystem:read"],
        cwd: "/home/user/project",
      });

      const result = sandbox.checkFileRead("/etc/passwd");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("outside cwd");
    });

    it("blocks path traversal attacks", () => {
      const sandbox = createSandbox({
        granted: ["filesystem:read"],
        cwd: "/home/user/project",
      });

      expect(sandbox.checkFileRead("../../../etc/passwd").allowed).toBe(false);
      expect(sandbox.checkFileRead("src/../../../etc/passwd").allowed).toBe(false);
    });

    it("allows writes when filesystem:write is granted", () => {
      const sandbox = createSandbox({
        granted: ["filesystem:read", "filesystem:write"],
        cwd: "/tmp",
      });

      expect(sandbox.checkFileWrite("output.txt").allowed).toBe(true);
    });

    it("blocks writes when only filesystem:read is granted", () => {
      const sandbox = createSandbox({
        granted: ["filesystem:read"],
        cwd: "/tmp",
      });

      const result = sandbox.checkFileWrite("output.txt");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not granted");
    });
  });

  describe("network domain restrictions", () => {
    it("allows outbound to approved domains", () => {
      const sandbox = createSandbox({
        granted: ["network:outbound"],
        allowedDomains: ["api.openai.com", "api.anthropic.com"],
      });

      expect(sandbox.checkNetworkOutbound("https://api.openai.com/v1").allowed).toBe(true);
      expect(sandbox.checkNetworkOutbound("https://api.anthropic.com/v1").allowed).toBe(true);
    });

    it("blocks outbound to unapproved domains", () => {
      const sandbox = createSandbox({
        granted: ["network:outbound"],
        allowedDomains: ["api.openai.com"],
      });

      const result = sandbox.checkNetworkOutbound("https://evil.com");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not in allowed list");
    });

    it("allows all domains when no restriction list provided", () => {
      const sandbox = createSandbox({
        granted: ["network:outbound"],
      });

      expect(sandbox.checkNetworkOutbound("https://any-domain.com").allowed).toBe(true);
    });

    it("blocks all network when network:outbound not granted", () => {
      const sandbox = createSandbox({ granted: [] });

      expect(sandbox.checkNetworkOutbound("https://api.openai.com").allowed).toBe(false);
    });
  });

  describe("process spawn restrictions", () => {
    it("allows approved commands", () => {
      const sandbox = createSandbox({
        granted: ["process:spawn"],
        allowedCommands: ["git", "npm", "node"],
      });

      expect(sandbox.checkProcessSpawn("git status").allowed).toBe(true);
      expect(sandbox.checkProcessSpawn("npm install").allowed).toBe(true);
    });

    it("blocks unapproved commands", () => {
      const sandbox = createSandbox({
        granted: ["process:spawn"],
        allowedCommands: ["git", "npm"],
      });

      const result = sandbox.checkProcessSpawn("rm -rf /");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not in allowed list");
    });

    it("allows all commands when no restriction list provided", () => {
      const sandbox = createSandbox({
        granted: ["process:spawn"],
      });

      expect(sandbox.checkProcessSpawn("any-command").allowed).toBe(true);
    });
  });

  describe("audit logging", () => {
    it("logs allowed operations", () => {
      const logs: Array<{ allowed: boolean; capability: string }> = [];
      const sandbox = createSandbox({
        granted: ["filesystem:read"],
        onAudit: (entry) => logs.push(entry),
      });

      sandbox.check("filesystem:read");
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ allowed: true, capability: "filesystem:read" });
    });

    it("logs blocked operations", () => {
      const logs: Array<{ allowed: boolean; capability: string }> = [];
      const sandbox = createSandbox({
        granted: ["filesystem:read"],
        onAudit: (entry) => logs.push(entry),
      });

      sandbox.check("filesystem:write");
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ allowed: false, capability: "filesystem:write" });
    });
  });

  describe("granular capability matching", () => {
    it("matches exact capabilities only", () => {
      const sandbox = createSandbox({
        granted: ["filesystem:read"],
      });

      expect(sandbox.check("filesystem").allowed).toBe(false);
      expect(sandbox.check("filesystem:read:deep").allowed).toBe(false);
    });

    it("supports wildcard patterns in capability definitions", () => {
      const sandbox = createSandbox({
        granted: ["filesystem:*"],
      });

      expect(sandbox.check("filesystem:read").allowed).toBe(true);
      expect(sandbox.check("filesystem:write").allowed).toBe(true);
      expect(sandbox.check("filesystem").allowed).toBe(false);
    });
  });
});
