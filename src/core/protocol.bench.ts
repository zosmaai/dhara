/**
 * Performance benchmarks for the extension protocol.
 *
 * Measures latency of JSON-RPC serialization/deserialization,
 * concurrent request handling, and large payload performance.
 */
import { bench, describe } from "vitest";
import {
  createExtensionProtocol,
  createResponse,
  parseMessage,
  serializeMessage,
} from "../core/protocol.js";
import { EventEmitter } from "node:events";

describe("protocol serialization benchmarks", () => {
  const toolsPayload = Array.from({ length: 100 }, (_, i) => ({
    name: `tool-${i}`,
    description: "A".repeat(200),
    parameters: {
      type: "object",
      properties: {
        input: { type: "string" },
        count: { type: "integer" },
        items: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  }));

  const largeResult = {
    content: [
      { type: "text", text: "X".repeat(10000) },
    ],
  };

  bench("serialize small request", () => {
    serializeMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "0.1.0" },
    });
  });

  bench("serialize large response", () => {
    serializeMessage(createResponse(1, largeResult));
  });

  bench("serialize initialize result (100 tools)", () => {
    serializeMessage(createResponse(1, {
      protocolVersion: "0.1.0",
      name: "test",
      version: "1.0.0",
      tools: toolsPayload,
    }));
  });

  bench("parse small request", () => {
    parseMessage('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}');
  });

  bench("parse large response", () => {
    const raw = serializeMessage(createResponse(1, largeResult));
    parseMessage(raw);
  });
});

describe("protocol streaming benchmarks", () => {
  bench("1000 concurrent sends + receives", async () => {
    const emitter = new EventEmitter();
    const chunks: string[] = [];
    const stdin = Object.assign(emitter, {
      receive(msg: unknown) {
        emitter.emit("data", Buffer.from(JSON.stringify(msg) + "\n"));
      },
    }) as unknown as NodeJS.ReadableStream;
    const stdout = Object.assign(new EventEmitter(), {
      write(chunk: string) { chunks.push(chunk); return true; },
    }) as unknown as NodeJS.WritableStream;

    const protocol = createExtensionProtocol({ stdin, stdout });

    const promises: Promise<unknown>[] = [];
    for (let i = 0; i < 1000; i++) {
      promises.push(protocol.sendRequest("ping", { seq: i }));
    }

    // Parse outgoing requests and respond to each
    for (const chunk of chunks) {
      const parsed = JSON.parse(chunk);
      stdin.receive({ jsonrpc: "2.0", result: { seq: parsed.params?.seq }, id: parsed.id });
    }

    await Promise.all(promises);
    protocol.close();
  });
});
