#!/usr/bin/env node

/**
 * hello-extension — Example Dhara extension
 *
 * Implements the JSON-RPC 2.0 stdin/stdout protocol directly
 * without any dependencies. Registers hello and echo tools.
 *
 * Run with:
 *   node examples/hello-extension/index.js
 *
 * Install in ~/.dhara/extensions/hello-extension/manifest.json
 * for automatic loading.
 */

const TOOLS = [
  {
    name: "hello",
    description: "Say hello to someone",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name to greet",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "echo",
    description: "Echo back what you say",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Message to echo",
        },
      },
      required: ["message"],
    },
  },
];

function handleTool(toolName, input) {
  switch (toolName) {
    case "hello":
      return {
        content: [{ type: "text", text: `Hello, ${input.name ?? "world"}! 👋` }],
      };
    case "echo":
      return {
        content: [{ type: "text", text: `You said: ${input.message}` }],
      };
    default:
      throw Object.assign(new Error(`Tool "${toolName}" not found`), { code: -32601 });
  }
}

function send(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", result, id })}\n`);
}

function sendError(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id })}\n`);
}

let buffer = "";

process.stdin.setEncoding("utf-8");

process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      sendError(null, -32700, "Invalid JSON");
      continue;
    }

    const { jsonrpc, method, params, id } = parsed;
    if (jsonrpc !== "2.0") {
      sendError(id ?? null, -32600, "Must use JSON-RPC 2.0");
      continue;
    }

    try {
      switch (method) {
        case "initialize":
          send(id, {
            protocolVersion: params?.protocolVersion || "0.1.0",
            name: "hello-extension",
            version: "1.0.0",
            tools: TOOLS,
          });
          break;

        case "tools/execute":
          send(id, handleTool(params?.toolName, params?.input ?? {}));
          break;

        case "shutdown":
          send(id, { status: "ok" });
          setImmediate(() => process.exit(0));
          break;

        default:
          sendError(id ?? null, -32601, `Unknown method: ${method}`);
      }
    } catch (err) {
      sendError(id ?? null, err.code ?? -32001, err.message ?? String(err));
    }
  }
});

process.stdin.on("end", () => process.exit(0));
process.stdin.on("error", () => process.exit(1));
