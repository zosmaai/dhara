import { describe, expect, it, vi } from "vitest";
import { createAgentLoop } from "./agent-loop.js";
import { createEventBus } from "./events.js";
import type {
  AssistantMessage,
  CompleteParams,
  ContentBlock,
  Provider,
  ToolResult,
} from "./provider.js";
import { createSession } from "./session.js";

function mockProvider(responses: AssistantMessage[]): Provider & { calls: CompleteParams[] } {
  const calls: CompleteParams[] = [];
  let index = 0;

  return {
    calls,
    async complete(params) {
      calls.push(params);
      const response = responses[index++];
      if (!response) {
        throw new Error("No more mock responses");
      }
      return response;
    },
  };
}

describe("Agent Loop", () => {
  describe("basic response", () => {
    it("appends user prompt and assistant response to session", async () => {
      const provider = mockProvider([{ content: [{ type: "text", text: "Hello!" }] }]);
      const session = createSession({ cwd: "/tmp" });
      const loop = createAgentLoop({ provider, session });

      await loop.run("Say hello");

      const path = session.getPath();
      expect(path).toHaveLength(2);

      const userEntry = session.getEntry(path[0]);
      expect(userEntry?.type).toBe("entry");
      if (userEntry?.type === "entry") {
        expect(userEntry.role).toBe("user");
        expect(userEntry.content[0].text).toBe("Say hello");
      }

      const assistantEntry = session.getEntry(path[1]);
      expect(assistantEntry?.type).toBe("entry");
      if (assistantEntry?.type === "entry") {
        expect(assistantEntry.role).toBe("assistant");
        expect(assistantEntry.content[0].text).toBe("Hello!");
      }
    });

    it("includes system prompt in completion params", async () => {
      const provider = mockProvider([{ content: [{ type: "text", text: "OK" }] }]);
      const session = createSession({ cwd: "/tmp" });
      const loop = createAgentLoop({
        provider,
        session,
        systemPrompt: "You are a helpful assistant.",
      });

      await loop.run("Hi");

      expect(provider.calls[0].systemPrompt).toBe("You are a helpful assistant.");
    });

    it("passes model from session meta", async () => {
      const provider = mockProvider([{ content: [{ type: "text", text: "OK" }] }]);
      const session = createSession({
        cwd: "/tmp",
        model: { id: "gpt-4", provider: "openai" },
      });
      const loop = createAgentLoop({ provider, session });

      await loop.run("Hi");

      expect(provider.calls[0].model).toEqual({
        id: "gpt-4",
        provider: "openai",
      });
    });

    it("includes available tools in completion params", async () => {
      const provider = mockProvider([{ content: [{ type: "text", text: "OK" }] }]);
      const session = createSession({ cwd: "/tmp" });
      const tools = new Map([
        [
          "read",
          {
            definition: {
              name: "read",
              description: "Read a file",
              parameters: { type: "object" },
            },
            execute: async () => ({ content: [] }),
          },
        ],
      ]);
      const loop = createAgentLoop({ provider, session, tools });

      await loop.run("Hi");

      expect(provider.calls[0].tools).toHaveLength(1);
      expect(provider.calls[0].tools?.[0].name).toBe("read");
    });
  });

  describe("tool calls", () => {
    it("executes a single tool call and loops", async () => {
      const provider = mockProvider([
        {
          content: [],
          toolCalls: [{ id: "tc1", name: "echo", input: { msg: "hello" } }],
        },
        { content: [{ type: "text", text: "Done" }] },
      ]);

      const session = createSession({ cwd: "/tmp" });
      const tools = new Map([
        [
          "echo",
          {
            definition: {
              name: "echo",
              description: "Echo a message",
              parameters: { type: "object" },
            },
            execute: async (input: Record<string, unknown>) => ({
              content: [{ type: "text", text: (input.msg as string) ?? "" }] as ContentBlock[],
            }),
          },
        ],
      ]);

      const loop = createAgentLoop({ provider, session, tools });
      await loop.run("Call echo");

      // Path: user, assistant(toolCall), tool_result, assistant(text)
      const path = session.getPath();
      expect(path).toHaveLength(4);

      const assistantWithTool = session.getEntry(path[1]);
      expect(assistantWithTool?.type).toBe("entry");
      if (assistantWithTool?.type === "entry") {
        expect(assistantWithTool.role).toBe("assistant");
        expect(assistantWithTool.toolCalls).toHaveLength(1);
        expect(assistantWithTool.toolCalls?.[0].name).toBe("echo");
      }

      const toolResult = session.getEntry(path[2]);
      expect(toolResult?.type).toBe("entry");
      if (toolResult?.type === "entry") {
        expect(toolResult.role).toBe("tool_result");
        expect(toolResult.toolCallId).toBe("tc1");
        expect(toolResult.toolName).toBe("echo");
        expect(toolResult.content[0].text).toBe("hello");
      }

      const finalAssistant = session.getEntry(path[3]);
      expect(finalAssistant?.type).toBe("entry");
      if (finalAssistant?.type === "entry") {
        expect(finalAssistant.role).toBe("assistant");
        expect(finalAssistant.content[0].text).toBe("Done");
      }
    });

    it("executes multiple tool calls in parallel", async () => {
      const provider = mockProvider([
        {
          content: [],
          toolCalls: [
            { id: "tc1", name: "getA", input: {} },
            { id: "tc2", name: "getB", input: {} },
          ],
        },
        { content: [{ type: "text", text: "Done" }] },
      ]);

      const session = createSession({ cwd: "/tmp" });
      const tools = new Map([
        [
          "getA",
          {
            definition: {
              name: "getA",
              description: "Get A",
              parameters: { type: "object" },
            },
            execute: async () => ({ content: [{ type: "text", text: "A" }] }) as ToolResult,
          },
        ],
        [
          "getB",
          {
            definition: {
              name: "getB",
              description: "Get B",
              parameters: { type: "object" },
            },
            execute: async () => ({ content: [{ type: "text", text: "B" }] }) as ToolResult,
          },
        ],
      ]);

      const loop = createAgentLoop({ provider, session, tools });
      await loop.run("Get both");

      // user + assistant(toolCalls) + 2 tool_results + assistant(text)
      const path = session.getPath();
      expect(path).toHaveLength(5);

      const toolResults = path
        .map((id) => session.getEntry(id))
        .filter((e) => e?.type === "entry" && e.role === "tool_result");
      expect(toolResults).toHaveLength(2);
    });

    it("handles unknown tool names gracefully", async () => {
      const provider = mockProvider([
        {
          content: [],
          toolCalls: [{ id: "tc1", name: "unknown_tool", input: {} }],
        },
        { content: [{ type: "text", text: "Sorry" }] },
      ]);

      const session = createSession({ cwd: "/tmp" });
      const loop = createAgentLoop({ provider, session });
      await loop.run("Call unknown");

      const path = session.getPath();
      const toolResult = session.getEntry(path[2]);
      expect(toolResult?.type).toBe("entry");
      if (toolResult?.type === "entry") {
        expect(toolResult.role).toBe("tool_result");
        expect(toolResult.isError).toBe(true);
        expect(toolResult.content[0].text).toContain("not found");
      }
    });

    it("handles tool execution errors", async () => {
      const provider = mockProvider([
        {
          content: [],
          toolCalls: [{ id: "tc1", name: "fail", input: {} }],
        },
        { content: [{ type: "text", text: "Sorry" }] },
      ]);

      const session = createSession({ cwd: "/tmp" });
      const tools = new Map([
        [
          "fail",
          {
            definition: {
              name: "fail",
              description: "Always fails",
              parameters: { type: "object" },
            },
            execute: async () => {
              throw new Error("Tool crashed");
            },
          },
        ],
      ]);

      const loop = createAgentLoop({ provider, session, tools });
      await loop.run("Call fail");

      const path = session.getPath();
      const toolResult = session.getEntry(path[2]);
      expect(toolResult?.type).toBe("entry");
      if (toolResult?.type === "entry") {
        expect(toolResult.role).toBe("tool_result");
        expect(toolResult.isError).toBe(true);
        expect(toolResult.content[0].text).toContain("Tool crashed");
      }
    });
  });

  describe("iteration limits", () => {
    it("stops after maxIterations to prevent infinite loops", async () => {
      const provider = mockProvider([
        {
          content: [],
          toolCalls: [{ id: "tc1", name: "noop", input: {} }],
        },
        {
          content: [],
          toolCalls: [{ id: "tc2", name: "noop", input: {} }],
        },
        {
          content: [],
          toolCalls: [{ id: "tc3", name: "noop", input: {} }],
        },
      ]);

      const session = createSession({ cwd: "/tmp" });
      const tools = new Map([
        [
          "noop",
          {
            definition: {
              name: "noop",
              description: "No-op",
              parameters: { type: "object" },
            },
            execute: async () => ({ content: [] }),
          },
        ],
      ]);

      const loop = createAgentLoop({ provider, session, tools, maxIterations: 2 });
      await loop.run("Loop");

      // user + assistant(tc1) + tool_result + assistant(tc2) + tool_result
      // maxIterations=2 means 2 LLM calls
      expect(provider.calls).toHaveLength(2);
    });
  });

  describe("errors", () => {
    it("handles provider errors gracefully", async () => {
      const provider: Provider = {
        async complete() {
          throw new Error("Rate limited");
        },
      };

      const session = createSession({ cwd: "/tmp" });
      const loop = createAgentLoop({ provider, session });

      // The loop should not throw; it emits agent:error and resolves
      await expect(loop.run("Hi")).resolves.toBeUndefined();
    });
  });

  describe("events", () => {
    it("emits agent:prompt when run starts", async () => {
      const provider = mockProvider([{ content: [{ type: "text", text: "OK" }] }]);
      const bus = createEventBus();
      const handler = vi.fn(() => ({ action: "allow" as const }));
      bus.subscribe("agent:prompt", handler);

      const session = createSession({ cwd: "/tmp" });
      const loop = createAgentLoop({ provider, session, eventBus: bus });
      await loop.run("Hi");

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ prompt: "Hi" }));
    });

    it("emits agent:response when assistant responds", async () => {
      const provider = mockProvider([{ content: [{ type: "text", text: "Hello!" }] }]);
      const bus = createEventBus();
      const handler = vi.fn(() => ({ action: "allow" as const }));
      bus.subscribe("agent:response", handler);

      const session = createSession({ cwd: "/tmp" });
      const loop = createAgentLoop({ provider, session, eventBus: bus });
      await loop.run("Hi");

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          content: [{ type: "text", text: "Hello!" }],
        }),
      );
    });

    it("emits tool:call_start and tool:call_end", async () => {
      const provider = mockProvider([
        {
          content: [],
          toolCalls: [{ id: "tc1", name: "echo", input: { msg: "x" } }],
        },
        { content: [{ type: "text", text: "Done" }] },
      ]);

      const bus = createEventBus();
      const startHandler = vi.fn(() => ({ action: "allow" as const }));
      const endHandler = vi.fn(() => ({ action: "allow" as const }));
      bus.subscribe("tool:call_start", startHandler);
      bus.subscribe("tool:call_end", endHandler);

      const session = createSession({ cwd: "/tmp" });
      const tools = new Map([
        [
          "echo",
          {
            definition: {
              name: "echo",
              description: "Echo",
              parameters: { type: "object" },
            },
            execute: async () => ({ content: [{ type: "text", text: "x" }] }),
          },
        ],
      ]);

      const loop = createAgentLoop({ provider, session, tools, eventBus: bus });
      await loop.run("Call echo");

      expect(startHandler).toHaveBeenCalledTimes(1);
      expect(startHandler).toHaveBeenCalledWith(
        expect.objectContaining({ toolCallId: "tc1", toolName: "echo" }),
      );
      expect(endHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("message building", () => {
    it("builds conversation history from session entries", async () => {
      const provider = mockProvider([{ content: [{ type: "text", text: "First" }] }]);
      const session = createSession({ cwd: "/tmp" });
      session.append({ role: "user", content: [{ type: "text", text: "Previous" }] });
      session.append({
        role: "assistant",
        content: [{ type: "text", text: "Prev response" }],
      });

      const loop = createAgentLoop({ provider, session });
      await loop.run("New");

      // Should include previous messages + new user message
      const messages = provider.calls[0].messages;
      expect(messages).toHaveLength(3);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content[0].text).toBe("Previous");
      expect(messages[1].role).toBe("assistant");
      expect(messages[1].content[0].text).toBe("Prev response");
      expect(messages[2].role).toBe("user");
      expect(messages[2].content[0].text).toBe("New");
    });

    it("includes tool results in conversation history", async () => {
      const provider = mockProvider([
        {
          content: [],
          toolCalls: [{ id: "tc1", name: "calc", input: { a: 1, b: 2 } }],
        },
        { content: [{ type: "text", text: "3" }] },
      ]);

      const session = createSession({ cwd: "/tmp" });
      const tools = new Map([
        [
          "calc",
          {
            definition: {
              name: "calc",
              description: "Add numbers",
              parameters: { type: "object" },
            },
            execute: async (input: Record<string, unknown>) => ({
              content: [
                {
                  type: "text",
                  text: String((input.a as number) + (input.b as number)),
                },
              ],
            }),
          },
        ],
      ]);

      const loop = createAgentLoop({ provider, session, tools });
      await loop.run("Add 1 and 2");

      // Second call should include tool result
      const secondCallMessages = provider.calls[1].messages;
      const toolMessage = secondCallMessages.find((m) => m.role === "tool");
      expect(toolMessage).toBeDefined();
      expect(toolMessage?.toolCallId).toBe("tc1");
      expect(toolMessage?.content[0].text).toBe("3");
    });
  });

  describe("streaming", () => {
    it("passes eventBus to provider and emits message:delta events", async () => {
      const deltas: string[] = [];

      // Provider that uses CompleteParams.eventBus to emit deltas
      const provider: Provider = {
        async complete(params, _signal) {
          // Verify eventBus was passed through
          expect(params.eventBus).toBeDefined();

          // Emit deltas via the event bus from params
          const eb = params.eventBus as NonNullable<typeof params.eventBus>;
          for (const chunk of ["Hello", " ", "World"]) {
            eb.emit("message:delta", {
              entry: { id: "mock" },
              content: [{ type: "text", text: chunk }],
              type: "text",
            });
          }

          return { content: [{ type: "text", text: "Hello World" }] };
        },
      };

      // Listen on a separate test bus
      const testBus = createEventBus();
      testBus.subscribe<{ content: { type: string; text?: string }[] }>(
        "message:delta",
        (payload) => {
          for (const block of payload.content) {
            if (block.type === "text" && block.text) {
              deltas.push(block.text);
            }
          }
          return { action: "allow" };
        },
      );

      const session = createSession({ cwd: "/tmp" });
      const loop = createAgentLoop({ provider, session });

      // Run with per-invocation eventBus
      await loop.run("Say hi", undefined, testBus);

      // Deltas arrive from two sources:
      // 1. The provider's streaming emit (via CompleteParams.eventBus)
      // 2. The agent loop's post-response fallback emit (full content)
      expect(deltas).toEqual(["Hello", " ", "World", "Hello World"]);
    });

    it("emits deltas through default eventBus when no per-invocation bus given", async () => {
      const deltas: string[] = [];

      const provider: Provider = {
        async complete(params) {
          const eb = params.eventBus;
          if (eb) {
            eb.emit("message:delta", {
              entry: { id: "mock" },
              content: [{ type: "text", text: "streamed" }],
              type: "text",
            });
          }
          return { content: [{ type: "text", text: "full" }] };
        },
      };

      // Create event bus and pass as default to agent loop
      const bus = createEventBus();
      bus.subscribe<{ content: { type: string; text?: string }[] }>("message:delta", (payload) => {
        for (const block of payload.content) {
          if (block.type === "text" && block.text) {
            deltas.push(block.text);
          }
        }
        return { action: "allow" };
      });

      const session = createSession({ cwd: "/tmp" });
      const loop = createAgentLoop({ provider, session, eventBus: bus });

      await loop.run("Hi");

      // Provider emits "streamed" via eventBus, agent loop also emits "full" as fallback
      expect(deltas).toEqual(["streamed", "full"]);
    });
  });
});
