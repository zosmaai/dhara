import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { type JsonRpcMessage, createExtensionProtocol } from "./protocol.js";

interface MockStdin extends NodeJS.ReadableStream {
  receive(msg: JsonRpcMessage): void;
}

interface MockStdout extends NodeJS.WritableStream {
  chunks: string[];
}

// Mock stdin/stdout for testing
function createMockStreams(): { stdin: MockStdin; stdout: MockStdout } {
  const emitter = new EventEmitter();
  const chunks: string[] = [];

  const stdin: MockStdin = Object.create(emitter);
  stdin.receive = (msg: JsonRpcMessage) => {
    emitter.emit("data", Buffer.from(`${JSON.stringify(msg)}\n`));
  };

  const stdout: MockStdout = Object.create(new EventEmitter());
  stdout.chunks = chunks;
  stdout.write = (chunk: string) => {
    chunks.push(chunk);
    return true;
  };

  return { stdin, stdout };
}

describe("ExtensionProtocol", () => {
  it("should send a JSON-RPC request and receive a response", async () => {
    const { stdin, stdout } = createMockStreams();
    const protocol = createExtensionProtocol({ stdin, stdout });

    const responsePromise = protocol.sendRequest("initialize", { protocolVersion: "0.1.0" });

    // Simulate extension responding
    const requestLine = JSON.parse(stdout.chunks[0]);
    stdin.receive({
      jsonrpc: "2.0",
      result: { protocolVersion: "0.1.0", name: "test-ext" },
      id: requestLine.id,
    });

    const response = await responsePromise;
    expect(response).toEqual({ protocolVersion: "0.1.0", name: "test-ext" });
  });

  it("should send a notification (no response expected)", () => {
    const { stdin, stdout } = createMockStreams();
    const protocol = createExtensionProtocol({ stdin, stdout });

    protocol.sendNotification("shutdown", {});

    const lines = stdout.chunks.map((s: string) => JSON.parse(s));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      jsonrpc: "2.0",
      method: "shutdown",
      params: {},
    });
    expect(lines[0].id).toBeUndefined();
  });

  it("should handle incoming notifications from the extension", () => {
    const { stdin, stdout } = createMockStreams();
    const protocol = createExtensionProtocol({ stdin, stdout });

    const handler = vi.fn();
    protocol.onNotification("tools/progress", handler);

    stdin.receive({
      jsonrpc: "2.0",
      method: "tools/progress",
      params: { toolCallId: "tc1", update: { type: "text_delta", delta: "..." } },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      toolCallId: "tc1",
      update: { type: "text_delta", delta: "..." },
    });
  });

  it("should reject on JSON-RPC error response", async () => {
    const { stdin, stdout } = createMockStreams();
    const protocol = createExtensionProtocol({ stdin, stdout });

    const responsePromise = protocol.sendRequest("tools/execute", { toolName: "grep" });

    const requestLine = JSON.parse(stdout.chunks[0]);
    stdin.receive({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Tool not found" },
      id: requestLine.id,
    });

    await expect(responsePromise).rejects.toThrow("Tool not found");
  });

  it("should handle multiple concurrent requests", async () => {
    const { stdin, stdout } = createMockStreams();
    const protocol = createExtensionProtocol({ stdin, stdout });

    const p1 = protocol.sendRequest("tools/execute", { toolName: "read" });
    const p2 = protocol.sendRequest("tools/execute", { toolName: "write" });

    const requestLines = stdout.chunks.map((s: string) => JSON.parse(s));
    const id1 = requestLines[0].id;
    const id2 = requestLines[1].id;

    // Respond out of order
    stdin.receive({ jsonrpc: "2.0", result: "write-ok", id: id2 });
    stdin.receive({ jsonrpc: "2.0", result: "read-ok", id: id1 });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe("read-ok");
    expect(r2).toBe("write-ok");
  });

  it("should ignore responses with unknown ids", () => {
    const { stdin, stdout } = createMockStreams();
    const protocol = createExtensionProtocol({ stdin, stdout });

    // Send a notification, not a request
    protocol.sendNotification("event", {});

    // Extension sends a response with unknown id
    stdin.receive({ jsonrpc: "2.0", result: "orphan", id: 999 });

    // Should not throw or crash
    expect(stdout.chunks).toHaveLength(1);
  });
});
