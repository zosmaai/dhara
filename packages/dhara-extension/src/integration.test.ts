import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

describe("Extension protocol integration", () => {
  const EXT_PATH = resolve(
    fileURLToPath(new URL("../../../examples/hello-extension/index.js", import.meta.url)),
  );

  /**
   * Run the extension subprocess, send messages, collect responses.
   * Returns a promise that resolves when we have enough responses or timeout.
   */
  function runTest(
    messages: string[],
    expectedResponses: number,
    timeoutMs = 4000,
  ): Promise<string[]> {
    return new Promise((resolvePromise, reject) => {
      const proc = spawn("node", [EXT_PATH], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      const responses: string[] = [];
      let errorOutput = "";
      let stdoutBuffer = "";

      const timer = setTimeout(() => {
        cleanup();
        if (responses.length >= expectedResponses) {
          resolvePromise(responses.slice(0, expectedResponses));
        } else {
          reject(
            new Error(
              `Timeout: got ${responses.length}/${expectedResponses} responses. stderr: ${errorOutput.slice(0, 200)}`,
            ),
          );
        }
      }, timeoutMs);

      function cleanup() {
        clearTimeout(timer);
        proc.kill();
      }

      proc.stdout?.setEncoding("utf-8");
      proc.stdout?.on("data", (chunk: string) => {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            responses.push(trimmed);
            if (responses.length >= expectedResponses) {
              // Got all expected responses — send shutdown and resolve
              if (proc.stdin && !proc.killed) {
                proc.stdin.write(
                  JSON.stringify({
                    jsonrpc: "2.0",
                    method: "shutdown",
                    params: {},
                    id: 99,
                  }) + "\n",
                );
              }
              cleanup();
              resolvePromise(responses.slice(0, expectedResponses));
              return;
            }
          }
        }
      });

      proc.stderr?.setEncoding("utf-8");
      proc.stderr?.on("data", (chunk: string) => {
        errorOutput += chunk;
      });

      proc.on("error", (err) => {
        cleanup();
        reject(err);
      });

      // Suppress EPIPE errors when writing to a dead process
      proc.stdin?.on("error", () => {});

      // Send messages after a short delay to let the process start
      setImmediate(() => {
        for (const msg of messages) {
          proc.stdin?.write(msg + "\n");
        }
      });
    });
  }

  it("handles initialize handshake", async () => {
    const responses = await runTest(
      [
        JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            protocolVersion: "0.1.0",
            capabilities: { tools: true },
          },
          id: 1,
        }),
      ],
      1, // expect 1 response
    );

    expect(responses).toHaveLength(1);
    const parsed = JSON.parse(responses[0]);
    expect(parsed.jsonrpc).toBe("2.0");
    expect(parsed.result).toBeDefined();
    expect(parsed.result.name).toBe("hello-extension");
    expect(parsed.result.tools).toBeDefined();
    expect(parsed.result.tools).toHaveLength(2);
    expect(parsed.result.tools[0].name).toBe("hello");
    expect(parsed.result.tools[1].name).toBe("echo");
    expect(parsed.id).toBe(1);
  });

  it("executes hello tool call", async () => {
    const responses = await runTest(
      [
        JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            protocolVersion: "0.1.0",
            capabilities: { tools: true },
          },
          id: 1,
        }),
        JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/execute",
          params: {
            toolName: "hello",
            input: { name: "Dhara" },
          },
          id: 2,
        }),
      ],
      2, // expect 2 responses
    );

    expect(responses).toHaveLength(2);
    const toolResponse = JSON.parse(responses[1]);
    expect(toolResponse.jsonrpc).toBe("2.0");
    expect(toolResponse.result).toBeDefined();
    expect(toolResponse.result.content).toBeDefined();
    expect(toolResponse.result.content[0].text).toBe("Hello, Dhara! 👋");
    expect(toolResponse.id).toBe(2);
  });

  it("executes echo tool", async () => {
    const responses = await runTest(
      [
        JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            protocolVersion: "0.1.0",
            capabilities: { tools: true },
          },
          id: 1,
        }),
        JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/execute",
          params: {
            toolName: "echo",
            input: { message: "Hello World!" },
          },
          id: 2,
        }),
      ],
      2,
    );

    expect(responses).toHaveLength(2);
    const toolResponse = JSON.parse(responses[1]);
    expect(toolResponse.result.content[0].text).toBe("You said: Hello World!");
  });

  it("handles unknown tool with error", async () => {
    const responses = await runTest(
      [
        JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            protocolVersion: "0.1.0",
            capabilities: { tools: true },
          },
          id: 1,
        }),
        JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/execute",
          params: {
            toolName: "nonexistent",
            input: {},
          },
          id: 2,
        }),
      ],
      2,
    );

    expect(responses).toHaveLength(2);
    const errorResponse = JSON.parse(responses[1]);
    expect(errorResponse.jsonrpc).toBe("2.0");
    expect(errorResponse.error).toBeDefined();
    expect(errorResponse.error.code).toBe(-32601);
    expect(errorResponse.error.message).toContain('Tool "nonexistent" not found');
  });
});
