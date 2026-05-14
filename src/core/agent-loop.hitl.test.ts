import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentLoop } from "./agent-loop.js";
import { createEventBus } from "./events.js";
import type { AssistantMessage, ToolRegistration } from "./provider.js";
import { createSandbox } from "./sandbox.js";
import { createSession } from "./session.js";

describe("Agent Loop HITL", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "dhara-hitl-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Create a mock provider that responds with the given tool calls,
   * then a text response on the next turn.
   */
  function _mockProviderWithTools(
    toolCalls: Array<{ name: string; input: Record<string, unknown> }>,
    textResponse = "Done",
  ): ToolRegistration {
    // Register a tool that the agent can call
    const tool: ToolRegistration = {
      definition: {
        name: "test_tool",
        description: "A test tool",
        parameters: { type: "object", properties: {} },
      },
      execute: async () => ({
        content: [{ type: "text", text: "Tool executed" }],
      }),
    };

    const _provider = {
      complete: vi
        .fn()
        .mockResolvedValueOnce({
          content: [],
          toolCalls: toolCalls.map((tc) => ({
            id: `call_${tc.name}`,
            name: tc.name,
            input: tc.input,
          })),
        } as AssistantMessage)
        .mockResolvedValueOnce({
          content: [{ type: "text", text: textResponse }],
        } as AssistantMessage),
    };

    return tool;
  }

  it("executes tool normally when needsApproval is not set", async () => {
    const bus = createEventBus();
    const tool: ToolRegistration = {
      definition: {
        name: "test_tool",
        description: "A test tool",
        parameters: {},
      },
      execute: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Tool executed" }],
      }),
    };

    const provider = {
      complete: vi
        .fn()
        .mockResolvedValueOnce({
          content: [],
          toolCalls: [{ id: "call_1", name: "test_tool", input: {} }],
        } as AssistantMessage)
        .mockResolvedValueOnce({
          content: [{ type: "text", text: "Done" }],
        } as AssistantMessage),
    };

    const _sandbox = createSandbox({ granted: ["filesystem:read"], cwd: tmpDir });
    const session = createSession({ cwd: tmpDir });
    const tools = new Map<string, ToolRegistration>([["test_tool", tool]]);

    const approvalHandler = vi.fn();
    bus.subscribe(
      "tool:approval_required",
      () => {
        approvalHandler();
        return { action: "allow" };
      },
      { blocking: true },
    );

    const agent = createAgentLoop({
      provider: provider as never,
      session,
      tools,
      eventBus: bus,
    });

    await agent.run("Run the tool");

    // Tool was executed normally
    expect(tool.execute).toHaveBeenCalledTimes(1);
    // No approval event emitted
    expect(approvalHandler).not.toHaveBeenCalled();
  });

  it("emits approval_required when tool has needsApproval=true", async () => {
    const bus = createEventBus();
    const tool: ToolRegistration = {
      definition: {
        name: "test_tool",
        description: "A test tool",
        parameters: {},
        needsApproval: true,
      },
      execute: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Tool executed" }],
      }),
    };

    const provider = {
      complete: vi
        .fn()
        .mockResolvedValueOnce({
          content: [],
          toolCalls: [{ id: "call_1", name: "test_tool", input: {} }],
        } as AssistantMessage)
        .mockResolvedValueOnce({
          content: [{ type: "text", text: "Done" }],
        } as AssistantMessage),
    };

    const _sandbox = createSandbox({ granted: ["filesystem:read"], cwd: tmpDir });
    const session = createSession({ cwd: tmpDir });
    const tools = new Map<string, ToolRegistration>([["test_tool", tool]]);

    const onApproval = vi.fn();
    bus.subscribe(
      "tool:approval_required",
      (req) => {
        onApproval(req);
        return { action: "allow" };
      },
      { blocking: true },
    );

    const agent = createAgentLoop({
      provider: provider as never,
      session,
      tools,
      eventBus: bus,
    });

    await agent.run("Run the tool");

    // Approval event was emitted
    expect(onApproval).toHaveBeenCalledTimes(1);
    expect(onApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "test_tool",
        input: {},
      }),
    );
    // Tool was executed after approval
    expect(tool.execute).toHaveBeenCalledTimes(1);
  });

  it("blocks tool execution when approval is denied", async () => {
    const bus = createEventBus();
    const tool: ToolRegistration = {
      definition: {
        name: "test_tool",
        description: "A test tool",
        parameters: {},
        needsApproval: true,
      },
      execute: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Tool executed" }],
      }),
    };

    const provider = {
      complete: vi
        .fn()
        .mockResolvedValueOnce({
          content: [],
          toolCalls: [{ id: "call_1", name: "test_tool", input: {} }],
        } as AssistantMessage)
        .mockResolvedValueOnce({
          content: [{ type: "text", text: "Done" }],
        } as AssistantMessage),
    };

    const _sandbox = createSandbox({ granted: ["filesystem:read"], cwd: tmpDir });
    const session = createSession({ cwd: tmpDir });
    const tools = new Map<string, ToolRegistration>([["test_tool", tool]]);

    bus.subscribe(
      "tool:approval_required",
      () => {
        return { action: "block", reason: "Not authorized" };
      },
      { blocking: true },
    );

    const agent = createAgentLoop({
      provider: provider as never,
      session,
      tools,
      eventBus: bus,
    });

    await agent.run("Run the tool");

    // Tool was NOT executed
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it("uses needsApproval function to decide dynamically", async () => {
    const bus = createEventBus();
    const needsApprovalFn = vi.fn((input) => input.requireApproval === true);

    const tool: ToolRegistration = {
      definition: {
        name: "test_tool",
        description: "A test tool",
        parameters: {},
        needsApproval: needsApprovalFn,
      },
      execute: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Tool executed" }],
      }),
    };

    const provider = {
      complete: vi
        .fn()
        .mockResolvedValueOnce({
          content: [],
          toolCalls: [{ id: "call_1", name: "test_tool", input: { requireApproval: false } }],
        } as AssistantMessage)
        .mockResolvedValueOnce({
          content: [{ type: "text", text: "Done" }],
        } as AssistantMessage),
    };

    const _sandbox = createSandbox({ granted: ["filesystem:read"], cwd: tmpDir });
    const session = createSession({ cwd: tmpDir });
    const tools = new Map<string, ToolRegistration>([["test_tool", tool]]);

    const onApproval = vi.fn();
    bus.subscribe(
      "tool:approval_required",
      (req) => {
        onApproval(req);
        return { action: "allow" };
      },
      { blocking: true },
    );

    const agent = createAgentLoop({
      provider: provider as never,
      session,
      tools,
      eventBus: bus,
    });

    await agent.run("Run the tool");

    // Function was called
    expect(needsApprovalFn).toHaveBeenCalledWith({ requireApproval: false });
    // Since input.requireApproval is false, no approval needed
    expect(onApproval).not.toHaveBeenCalled();
    // Tool executed
    expect(tool.execute).toHaveBeenCalledTimes(1);
  });

  it("delivers approval context to the handler", async () => {
    const bus = createEventBus();
    const tool: ToolRegistration = {
      definition: {
        name: "write_file",
        description: "Write content to a file",
        parameters: {},
        needsApproval: true,
      },
      execute: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Written" }],
      }),
    };

    const provider = {
      complete: vi
        .fn()
        .mockResolvedValueOnce({
          content: [],
          toolCalls: [{ id: "call_1", name: "write_file", input: { path: "/etc/passwd" } }],
        } as AssistantMessage)
        .mockResolvedValueOnce({
          content: [{ type: "text", text: "Done" }],
        } as AssistantMessage),
    };

    const _sandbox = createSandbox({ granted: ["filesystem:read"], cwd: tmpDir });
    const session = createSession({ cwd: tmpDir });
    const tools = new Map<string, ToolRegistration>([["write_file", tool]]);

    let captured: unknown = null;
    bus.subscribe(
      "tool:approval_required",
      (req) => {
        captured = req;
        return { action: "allow" };
      },
      { blocking: true },
    );

    const agent = createAgentLoop({
      provider: provider as never,
      session,
      tools,
      eventBus: bus,
    });

    await agent.run("Write to sensitive file");

    const req = captured as Record<string, unknown>;
    expect(req).toBeTruthy();
    expect(req.toolName).toBe("write_file");
    expect((req.input as Record<string, unknown>).path).toBe("/etc/passwd");
    expect(req.description).toBe("Write content to a file");
    expect(typeof req.id).toBe("string");
    expect(req.context).toContain("sensitive");
  });
});
