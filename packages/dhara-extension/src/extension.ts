import type { InitializeParams, InitializeResult } from "./types.js";
import { ErrorCodes, type ToolDescriptor, type ToolHandler } from "./types.js";

/**
 * Options for creating a Dhara extension.
 */
export interface ExtensionOptions {
  /** Extension name (must match manifest). */
  name: string;
  /** Extension version. */
  version: string;
  /** Available tools. */
  tools?: Array<{
    descriptor: ToolDescriptor;
    handler: ToolHandler;
  }>;
  /** Hooks this extension subscribes to. */
  hooks?: string[];
  /** Available slash commands. */
  commands?: Array<{
    name: string;
    description: string;
    handler: (args: string, context?: { sessionId?: string }) => string | Promise<string>;
  }>;
}

/**
 * Creates a new Dhara extension.
 *
 * Handles the JSON-RPC 2.0 stdin/stdout protocol automatically.
 * Call `extension.run()` to start the event loop.
 *
 * @example
 * ```typescript
 * import { createExtension } from "@zosmaai/dhara-extension";
 *
 * const ext = createExtension({
 *   name: "hello-world",
 *   version: "1.0.0",
 *   tools: [{
 *     descriptor: {
 *       name: "hello",
 *       description: "Say hello to someone",
 *       parameters: {
 *         type: "object",
 *         properties: {
 *           name: { type: "string", description: "Name to greet" }
 *         },
 *         required: ["name"]
 *       }
 *     },
 *     handler: (input) => ({
 *       content: [{ type: "text", text: `Hello, ${input.name}!` }]
 *     })
 *   }]
 * });
 *
 * ext.run();
 * ```
 */
export function createExtension(options: ExtensionOptions) {
  const { name, version, tools = [], hooks = [], commands = [] } = options;

  // Build tool map for dispatch
  const toolMap = new Map<string, ToolHandler>();
  const toolDescriptors: ToolDescriptor[] = [];

  for (const tool of tools) {
    toolMap.set(tool.descriptor.name, tool.handler);
    toolDescriptors.push(tool.descriptor);
  }

  // Build command map for dispatch
  const commandMap = new Map<string, (args: string) => string | Promise<string>>();
  const commandDescriptors: Array<{ name: string; description: string }> = [];

  for (const cmd of commands) {
    commandMap.set(cmd.name, cmd.handler);
    commandDescriptors.push({ name: cmd.name, description: cmd.description });
  }

  let inputBuffer = "";
  const _nextId = 0;

  /**
   * Send a JSON-RPC response on stdout.
   */
  function sendResponse(id: string | number | null, result: unknown) {
    const message = JSON.stringify({ jsonrpc: "2.0", result, id });
    process.stdout.write(`${message}\n`);
  }

  /**
   * Send a JSON-RPC error response on stdout.
   */
  function sendError(id: string | number | null, code: number, message: string, data?: unknown) {
    const error = { jsonrpc: "2.0" as const, error: { code, message, data }, id };
    process.stdout.write(`${JSON.stringify(error)}\n`);
  }

  /**
   * Handle a single JSON-RPC message.
   */
  async function handleMessage(message: string) {
    let parsed: ReturnType<typeof JSON.parse>;

    try {
      parsed = JSON.parse(message);
    } catch {
      sendError(null, ErrorCodes.PARSE_ERROR, "Invalid JSON");
      return;
    }

    const { jsonrpc, method, params, id } = parsed;

    if (jsonrpc !== "2.0") {
      sendError(id ?? null, ErrorCodes.INVALID_REQUEST, "Must use JSON-RPC 2.0");
      return;
    }

    try {
      switch (method) {
        case "initialize": {
          const initializeParams = (params ?? {}) as InitializeParams;
          const result: InitializeResult = {
            protocolVersion: initializeParams.protocolVersion || "0.1.0",
            name,
            version,
            tools: toolDescriptors,
            hooks,
            commands: commandDescriptors,
          };
          if (id !== undefined) {
            sendResponse(id, result);
          }
          break;
        }

        case "tools/execute": {
          const toolName = (params as Record<string, unknown>)?.toolName as string;
          const input =
            ((params as Record<string, unknown>)?.input as Record<string, unknown>) ?? {};
          const context = (params as Record<string, unknown>)?.context as
            | Record<string, unknown>
            | undefined;

          const handler = toolMap.get(toolName);
          if (!handler) {
            sendError(id ?? null, ErrorCodes.METHOD_NOT_FOUND, `Tool "${toolName}" not found`);
            break;
          }

          const result = await handler(input, context);
          if (id !== undefined) {
            sendResponse(id, result);
          }
          break;
        }

        case "commands/execute": {
          const cmdName = (params as Record<string, unknown>)?.commandName as string;
          const args = String((params as Record<string, unknown>)?.args ?? "");

          const cmdHandler = commandMap.get(cmdName);
          if (!cmdHandler) {
            sendError(id ?? null, ErrorCodes.METHOD_NOT_FOUND, `Command "${cmdName}" not found`);
            break;
          }

          const result = await cmdHandler(args);
          if (id !== undefined) {
            sendResponse(id, { content: [{ type: "text", text: result }] });
          }
          break;
        }

        case "shutdown": {
          if (id !== undefined) {
            sendResponse(id, { status: "ok" });
          }
          // Give the response time to be sent before exiting
          setImmediate(() => process.exit(0));
          break;
        }

        default:
          sendError(id ?? null, ErrorCodes.METHOD_NOT_FOUND, `Unknown method: ${method}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      sendError(id ?? null, ErrorCodes.TOOL_EXECUTION_ERROR, errMsg);
    }
  }

  /**
   * Start the JSON-RPC stdin/stdout event loop.
   *
   * Reads JSON-RPC messages from stdin, dispatches them to handlers,
   * and writes responses to stdout.
   */
  function run(): void {
    process.stdin.setEncoding("utf-8");

    process.stdin.on("data", (chunk: string) => {
      inputBuffer += chunk;

      const lines = inputBuffer.split("\n");
      // Keep the last partial line in the buffer
      inputBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Handle each message (fire and forget — order preserved by
        // single-threaded nature of Node.js)
        handleMessage(trimmed).catch((err) => {
          console.error(`Extension error: ${err.message}`);
        });
      }
    });

    process.stdin.on("end", () => {
      // Stdin closed — extension should exit
      process.exit(0);
    });

    process.stdin.on("error", (err) => {
      console.error(`Extension stdin error: ${err.message}`);
      process.exit(1);
    });
  }

  return { run };
}
