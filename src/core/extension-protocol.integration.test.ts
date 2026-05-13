import { type ChildProcess, spawn } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ExtensionProtocol, createExtensionProtocol } from "./protocol.js";

describe("Extension Protocol Integration", () => {
  let echoExt: ChildProcess;
  let protocol: ExtensionProtocol;

  beforeAll(async () => {
    // Spawn the echo extension as a subprocess
    echoExt = spawn("bash", ["src/core/test-extensions/echo-extension.sh"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Create the protocol wrapper
    if (!echoExt.stdout || !echoExt.stdin) {
      throw new Error("Failed to create stdio for extension process");
    }
    protocol = createExtensionProtocol({
      stdin: echoExt.stdout,
      stdout: echoExt.stdin,
    });

    // Wait a tick for the extension to start
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterAll(() => {
    protocol.close();
    if (echoExt && !echoExt.killed) {
      echoExt.kill();
    }
  });

  it("handles the initialize handshake", async () => {
    const result = await protocol.sendRequest<{
      protocolVersion: string;
      name: string;
      version: string;
      tools: unknown[];
    }>("initialize", {
      protocolVersion: "0.1.0",
      capabilities: { tools: true },
    });

    expect(result.protocolVersion).toBe("0.1.0");
    expect(result.name).toBe("echo-tool");
    expect(result.version).toBe("1.0.0");
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]).toMatchObject({
      name: "echo",
      description: expect.any(String),
    });
  });

  it("executes a tool via the protocol", async () => {
    const result = await protocol.sendRequest<{
      content: Array<{ type: string; text: string }>;
    }>("tools/execute", {
      toolCallId: "call_001",
      toolName: "echo",
      input: {
        message: "Hello from Dhara!",
      },
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("echo: Hello from Dhara!");
  });

  it("sends a notification from core to extension (no response expected)", () => {
    // Notifications don't get responses — just verify no crash
    expect(() => {
      protocol.sendNotification("event/tool:call_start", {
        toolName: "echo",
        input: { message: "test" },
      });
    }).not.toThrow();
  });

  it("handles shutdown gracefully", async () => {
    const result = await protocol.sendRequest<{ status: string }>("shutdown", {});

    expect(result).toEqual({ status: "ok" });

    // Wait for the process to exit
    await new Promise<void>((resolve) => {
      echoExt.on("exit", () => resolve());
      setTimeout(() => resolve(), 2000);
    });

    expect(echoExt.killed || echoExt.exitCode === 0).toBe(true);
  });
});
