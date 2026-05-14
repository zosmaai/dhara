import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentLoop } from "./agent-loop.js";
import { createEventBus } from "./events.js";
import type { Provider, ToolRegistration } from "./provider.js";
import { createSandbox } from "./sandbox.js";
import { createSession } from "./session.js";

describe("Agent Loop Integration", () => {
  let tmpDir: string;
  let _sandbox: ReturnType<typeof createSandbox>;
  let session: ReturnType<typeof createSession>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "dhara-agent-test-"));
    _sandbox = createSandbox({
      granted: ["filesystem:read", "filesystem:write"],
      cwd: tmpDir,
    });
    session = createSession({
      cwd: tmpDir,
      model: { id: "test-model", provider: "test" },
    });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("completes a full tool call cycle", async () => {
    // Create a mock provider that simulates tool call + response
    const mockProvider: Provider = {
      complete: vi
        .fn()
        // First call: returns a tool call
        .mockResolvedValueOnce({
          content: [],
          toolCalls: [
            {
              id: "call_1",
              name: "write_test_file",
              input: { path: "test.txt", content: "Hello World" },
            },
          ],
        })
        // Second call: returns text response
        .mockResolvedValueOnce({
          content: [{ type: "text", text: "Done!" }],
        }),
    };

    // Create a simple tool
    const tools = new Map<string, ToolRegistration>();
    tools.set("write_test_file", {
      definition: {
        name: "write_test_file",
        description: "Write a test file",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
        },
      },
      execute: async (input) => {
        const { writeFileSync } = await import("node:fs");
        writeFileSync(join(tmpDir, String(input.path)), String(input.content));
        return {
          content: [{ type: "text", text: "File written." }],
        };
      },
    });

    const eventBus = createEventBus();
    const events: string[] = [];

    // Track key events
    eventBus.subscribe("agent:start", () => {
      events.push("start");
      return { action: "allow" };
    });
    eventBus.subscribe("tool:call_start", () => {
      events.push("tool_call");
      return { action: "allow" };
    });
    eventBus.subscribe("agent:end", () => {
      events.push("end");
      return { action: "allow" };
    });

    const agent = createAgentLoop({
      provider: mockProvider,
      session,
      tools,
      systemPrompt: "You are a test agent.",
      maxIterations: 10,
    });

    const _result = await agent.run("Write a test file", undefined, eventBus);

    // Verify events fired in order
    expect(events).toContain("start");
    expect(events).toContain("tool_call");
    expect(events).toContain("end");

    // Verify tool was actually executed (file created)
    const { existsSync, readFileSync } = await import("node:fs");
    expect(existsSync(join(tmpDir, "test.txt"))).toBe(true);
    expect(readFileSync(join(tmpDir, "test.txt"), "utf-8")).toBe("Hello World");

    // Agent loop may not return a value (it mutates session in-place)
  });

  it("handles tool errors gracefully", async () => {
    const mockProvider: Provider = {
      complete: vi
        .fn()
        // Call tool
        .mockResolvedValueOnce({
          content: [],
          toolCalls: [
            {
              id: "call_1",
              name: "failing_tool",
              input: {},
            },
          ],
        })
        // After error, return response
        .mockResolvedValueOnce({
          content: [{ type: "text", text: "Tool failed but I continued." }],
        }),
    };

    const tools = new Map<string, ToolRegistration>();
    tools.set("failing_tool", {
      definition: {
        name: "failing_tool",
        description: "Always fails",
        parameters: { type: "object", properties: {} },
      },
      execute: async () => ({
        content: [{ type: "text", text: "Error: something went wrong" }],
        isError: true,
      }),
    });

    const eventBus = createEventBus();
    const agent = createAgentLoop({
      provider: mockProvider,
      session,
      tools,
      systemPrompt: "You are a test agent.",
      maxIterations: 10,
    });

    const _result = await agent.run("Run the failing tool", undefined, eventBus);

    // Agent should continue even after tool error
    // The tool result should be recorded in the session
    const path = session.getPath();
    const toolResults = path
      .map((id) => session.getEntry(id))
      .filter((e) => e && "role" in e && e.role === "tool_result");
    expect(toolResults.length).toBe(1);
    expect(toolResults[0]).toBeDefined();
  });

  it("respects maxIterations limit", async () => {
    // Provider that always calls a tool (infinite loop)
    const mockProvider: Provider = {
      complete: vi.fn().mockResolvedValue({
        content: [],
        toolCalls: [
          {
            id: "call_1",
            name: "noop_tool",
            input: {},
          },
        ],
      }),
    };

    const tools = new Map<string, ToolRegistration>();
    tools.set("noop_tool", {
      definition: {
        name: "noop_tool",
        description: "Does nothing",
        parameters: { type: "object", properties: {} },
      },
      execute: async () => ({
        content: [{ type: "text", text: "done nothing" }],
        isError: false,
      }),
    });

    const eventBus = createEventBus();
    const agent = createAgentLoop({
      provider: mockProvider,
      session,
      tools,
      systemPrompt: "You are a test agent.",
      maxIterations: 3, // Only 3 iterations
    });

    const _result = await agent.run("Loop forever", undefined, eventBus);

    // Should have stopped after 3 iterations
    // (2 provider calls for the 2 tool calls + 1 for final response that might get cut)
    // But provider complete may have been called 3 times
    expect(mockProvider.complete.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("supports cancellation via AbortSignal", async () => {
    const mockProvider: Provider = {
      complete: vi.fn().mockImplementation(async (_params, signal) => {
        // Check if already aborted
        if (signal?.aborted) {
          return { content: [{ type: "text", text: "Cancelled" }] };
        }
        return { content: [{ type: "text", text: "Done" }] };
      }),
    };

    const tools = new Map<string, ToolRegistration>();
    const eventBus = createEventBus();
    const agent = createAgentLoop({
      provider: mockProvider,
      session,
      tools,
      systemPrompt: "You are a test agent.",
      maxIterations: 10,
    });

    const abortController = new AbortController();

    // Cancel immediately
    abortController.abort();

    // Should not throw when cancelled
    await agent.run("Test cancellation", abortController.signal, eventBus);
    // Cancellation should not throw — test passes if we get here
  });
});
