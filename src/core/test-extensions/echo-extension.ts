#!/usr/bin/env node
/**
 * Dhara test extension — echo tool
 *
 * A minimal JSON-RPC extension that runs as a subprocess and proves the
 * extension protocol works. Communicates via JSON-RPC 2.0 over stdin/stdout.
 *
 * Handles: initialize → tools/execute → shutdown
 */
import { createInterface } from "node:readline";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  method?: string;
  id?: number | string;
  params?: { input?: { message?: string }; [key: string]: unknown };
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  result?: unknown;
  error?: { code: number; message: string };
  id?: number | string;
}

const EXTENSION = {
  name: "echo-tool",
  version: "1.0.0",
  tools: [
    {
      name: "echo",
      description: "Echo back the input verbatim",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "Message to echo back" },
        },
        required: ["message"],
      },
      returns: {
        type: "object",
        properties: {
          content: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { const: "text" },
                text: { type: "string" },
              },
            },
          },
        },
      },
      capabilities: [],
    },
  ],
};

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on("line", (line: string) => {
  let request: JsonRpcRequest;
  try {
    request = JSON.parse(line) as JsonRpcRequest;
  } catch {
    return; // Ignore malformed JSON
  }

  const method = request.method;
  const id = request.id ?? Math.floor(Math.random() * 10000);

  switch (method) {
    case "initialize":
      writeMessage({
        jsonrpc: "2.0",
        result: {
          protocolVersion: "0.1.0",
          name: EXTENSION.name,
          version: EXTENSION.version,
          tools: EXTENSION.tools,
        },
        id,
      });
      break;

    case "tools/execute": {
      const message = request.params?.input?.message ?? "no message";
      writeMessage({
        jsonrpc: "2.0",
        result: {
          content: [{ type: "text" as const, text: `echo: ${message}` }],
        },
        id,
      });
      break;
    }

    case "shutdown":
      writeMessage({
        jsonrpc: "2.0",
        result: { status: "ok" },
        id,
      });
      process.exit(0);
      break;

    default:
      // Unknown method — ignore
      break;
  }
});

function writeMessage(msg: JsonRpcResponse): void {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}
