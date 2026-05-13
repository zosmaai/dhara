import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPiAiProvider, getAvailableProviders } from "./pi-ai-adapter.js";

// Build mock module using vi.hoisted - this is hoisted before vi.mock
const { mockCompleteSimple, mockGetModel, mockGetEnvApiKey, mockGetProviders } = vi.hoisted(() => ({
  mockCompleteSimple: vi.fn(),
  mockGetModel: vi.fn(),
  mockGetEnvApiKey: vi.fn(),
  mockGetProviders: vi.fn(),
}));

vi.mock("@earendil-works/pi-ai", () => ({
  completeSimple: mockCompleteSimple,
  getModel: mockGetModel,
  getProviders: mockGetProviders,
  getEnvApiKey: mockGetEnvApiKey,
}));

function makeResponse(overrides: Record<string, unknown> = {}) {
  return {
    role: "assistant",
    content: [{ type: "text" as const, text: "Hello from pi-ai!" }],
    api: "google-generative-ai",
    provider: "google",
    model: "gemini-2.5-flash",
    usage: {
      input: 10,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 15,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("pi-ai adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetModel.mockReturnValue({
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      api: "google-generative-ai",
      provider: "google",
      baseUrl: "",
      reasoning: false,
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 1_000_000,
      maxTokens: 8192,
    });
    mockCompleteSimple.mockResolvedValue(makeResponse());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("basic completion", () => {
    it("returns text response for a simple prompt", async () => {
      const provider = createPiAiProvider({
        provider: "google",
        model: "gemini-2.5-flash",
      });

      const result = await provider.complete({
        messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
        model: { id: "gemini-2.5-flash", provider: "google" },
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({
        type: "text",
        text: "Hello from pi-ai!",
      });
      expect(result.toolCalls).toBeUndefined();
    });

    it("passes system prompt to pi-ai context", async () => {
      const provider = createPiAiProvider({
        provider: "google",
        model: "gemini-2.5-flash",
      });

      await provider.complete({
        systemPrompt: "You are helpful.",
        messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
        model: { id: "gemini-2.5-flash", provider: "google" },
      });

      const [, context] = mockCompleteSimple.mock.calls[0];
      expect(context.systemPrompt).toBe("You are helpful.");
    });

    it("passes api key from config", async () => {
      const provider = createPiAiProvider({
        provider: "google",
        model: "gemini-2.5-flash",
        apiKey: "custom-key",
      });

      await provider.complete({
        messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
        model: { id: "gemini-2.5-flash", provider: "google" },
      });

      const [, , options] = mockCompleteSimple.mock.calls[0];
      expect(options?.apiKey).toBe("custom-key");
    });
  });

  describe("tool calls", () => {
    it("returns tool calls from pi-ai response", async () => {
      mockCompleteSimple.mockResolvedValueOnce(
        makeResponse({
          content: [
            {
              type: "toolCall" as const,
              id: "call_1",
              name: "read",
              arguments: { path: "test.txt" },
            },
          ],
          stopReason: "toolUse",
        }),
      );

      const provider = createPiAiProvider({
        provider: "google",
        model: "gemini-2.5-flash",
      });

      const result = await provider.complete({
        messages: [{ role: "user", content: [{ type: "text", text: "Read test.txt" }] }],
        model: { id: "gemini-2.5-flash", provider: "google" },
        tools: [
          {
            name: "read",
            description: "Read a file",
            parameters: {
              type: "object",
              properties: { path: { type: "string" } },
              required: ["path"],
            },
          },
        ],
      });

      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls?.[0]).toEqual({
        id: "call_1",
        name: "read",
        input: { path: "test.txt" },
      });
    });

    it("passes tool definitions to pi-ai", async () => {
      const provider = createPiAiProvider({
        provider: "google",
        model: "gemini-2.5-flash",
      });

      await provider.complete({
        messages: [{ role: "user", content: [{ type: "text", text: "Read test.txt" }] }],
        model: { id: "gemini-2.5-flash", provider: "google" },
        tools: [
          {
            name: "read",
            description: "Read a file",
            parameters: {
              type: "object",
              properties: { path: { type: "string" } },
              required: ["path"],
            },
          },
        ],
      });

      const [, context] = mockCompleteSimple.mock.calls[0];
      expect(context.tools).toBeDefined();
      expect(context.tools).toHaveLength(1);
      expect(context.tools?.[0].name).toBe("read");
    });
  });

  describe("message conversion", () => {
    it("converts tool result messages correctly", async () => {
      const provider = createPiAiProvider({
        provider: "google",
        model: "gemini-2.5-flash",
      });

      await provider.complete({
        messages: [
          {
            role: "tool",
            content: [{ type: "text", text: "File content: hello" }],
            toolCallId: "call_1",
            toolName: "read",
          },
        ],
        model: { id: "gemini-2.5-flash", provider: "google" },
      });

      const [, context] = mockCompleteSimple.mock.calls[0];
      const piMsg = context.messages[0] as {
        role: string;
        toolCallId: string;
        toolName: string;
      };
      expect(piMsg.role).toBe("toolResult");
      expect(piMsg.toolCallId).toBe("call_1");
    });

    it("converts thinking content from pi-ai response", async () => {
      mockCompleteSimple.mockResolvedValueOnce(
        makeResponse({
          content: [
            { type: "thinking" as const, thinking: "Let me think about this..." },
            { type: "text" as const, text: "The answer is 42." },
          ],
        }),
      );

      const provider = createPiAiProvider({
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
      });

      const result = await provider.complete({
        messages: [{ role: "user", content: [{ type: "text", text: "Think step by step" }] }],
        model: { id: "claude-sonnet-4-20250514", provider: "anthropic" },
      });

      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toEqual({
        type: "thinking",
        text: "Let me think about this...",
      });
      expect(result.content[1]).toEqual({ type: "text", text: "The answer is 42." });
    });
  });

  describe("error handling", () => {
    it("propagates pi-ai errors", async () => {
      mockCompleteSimple.mockRejectedValueOnce(new Error("API key not found"));

      const provider = createPiAiProvider({
        provider: "google",
        model: "gemini-2.5-flash",
      });

      await expect(
        provider.complete({
          messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
          model: { id: "gemini-2.5-flash", provider: "google" },
        }),
      ).rejects.toThrow("API key not found");
    });

    it("handles model resolution failure with fallback", async () => {
      mockGetModel.mockImplementationOnce(() => {
        throw new Error("unknown provider");
      });

      mockCompleteSimple.mockResolvedValueOnce(
        makeResponse({
          content: [{ type: "text" as const, text: "Fallback response" }],
          api: "openai-completions",
          provider: "custom",
          model: "some-model",
        }),
      );

      const provider = createPiAiProvider({
        provider: "custom",
        model: "some-model",
      });

      const result = await provider.complete({
        messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
        model: { id: "some-model", provider: "custom" },
      });

      expect(result.content[0]).toEqual({ type: "text", text: "Fallback response" });
    });
  });

  describe("getAvailableProviders", () => {
    it("returns list of providers from pi-ai", () => {
      mockGetProviders.mockReturnValue(["openai", "anthropic", "google", "mistral"]);

      const providers = getAvailableProviders();
      expect(providers).toEqual(["openai", "anthropic", "google", "mistral"]);
    });

    it("returns empty array on error", () => {
      mockGetProviders.mockImplementationOnce(() => {
        throw new Error("not initialized");
      });

      const providers = getAvailableProviders();
      expect(providers).toEqual([]);
    });
  });
});
