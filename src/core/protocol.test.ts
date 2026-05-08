import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { type JsonRpcMessage, createExtensionProtocol } from "./protocol.js";

interface MockStdin extends NodeJS.ReadableStream {
  receive(msg: JsonRpcMessage): void;
}

interface MockStdout extends NodeJS.WritableStream {
  chunks: string[];
}

function createMockStreams(): { stdin: MockStdin; stdout: MockStdout } {
  const emitter = new EventEmitter();
  const chunks: string[] = [];

  const stdin = Object.assign(emitter, {
    receive(msg: JsonRpcMessage) {
      emitter.emit("data", Buffer.from(`${JSON.stringify(msg)}\n`));
    },
  }) as MockStdin;

  const stdout = Object.assign(new EventEmitter(), {
    chunks,
    write(chunk: string): boolean {
      chunks.push(chunk);
      return true;
    },
  }) as MockStdout;

  return { stdin, stdout };
}

describe("ExtensionProtocol", () => {
  it("sends a JSON-RPC request and receives a response", async () => {
    const { stdin, stdout } = createMockStreams();
    const protocol = createExtensionProtocol({ stdin, stdout });

    const responsePromise = protocol.sendRequest("initialize", {
      protocolVersion: "0.1.0",
    });

    const requestLine = JSON.parse(stdout.chunks[0]);
    stdin.receive({
      jsonrpc: "2.0",
      result: { protocolVersion: "0.1.0", name: "test-ext" },
      id: requestLine.id,
    });

    const response = await responsePromise;
    expect(response).toEqual({ protocolVersion: "0.1.0", name: "test-ext" });
  });

  it("sends a notification (no response expected)", () => {
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

  it("handles incoming notifications from the extension", () => {
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

  it("rejects on JSON-RPC error response", async () => {
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

  it("handles multiple concurrent requests", async () => {
    const { stdin, stdout } = createMockStreams();
    const protocol = createExtensionProtocol({ stdin, stdout });

    const p1 = protocol.sendRequest("tools/execute", { toolName: "read" });
    const p2 = protocol.sendRequest("tools/execute", { toolName: "write" });

    const requestLines = stdout.chunks.map((s: string) => JSON.parse(s));
    const id1 = requestLines[0].id;
    const id2 = requestLines[1].id;

    stdin.receive({ jsonrpc: "2.0", result: "write-ok", id: id2 });
    stdin.receive({ jsonrpc: "2.0", result: "read-ok", id: id1 });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe("read-ok");
    expect(r2).toBe("write-ok");
  });

  it("ignores responses with unknown ids", () => {
    const { stdin, stdout } = createMockStreams();
    const protocol = createExtensionProtocol({ stdin, stdout });

    protocol.sendNotification("event", {});
    stdin.receive({ jsonrpc: "2.0", result: "orphan", id: 999 });

    expect(stdout.chunks).toHaveLength(1);
  });
});
