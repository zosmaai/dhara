import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompleteParams } from "../../core/provider.js";
import { createAnthropicProvider } from "./anthropic-provider.js";

describe("Anthropic Provider", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "Hello!" }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("sends request to Anthropic messages endpoint", async () => {
    const provider = createAnthropicProvider({ apiKey: "sk-ant-test" });
    await provider.complete({
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      model: { id: "claude-sonnet-4", provider: "anthropic" },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
  });

  it("includes x-api-key header", async () => {
    const provider = createAnthropicProvider({ apiKey: "sk-ant-secret" });
    await provider.complete({
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      model: { id: "claude-sonnet-4", provider: "anthropic" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.headers).toMatchObject({
      "x-api-key": "sk-ant-secret",
      "anthropic-version": "2023-06-01",
    });
  });

  it("includes model in request body", async () => {
    const provider = createAnthropicProvider({ apiKey: "sk-ant-test" });
    await provider.complete({
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      model: { id: "claude-sonnet-4", provider: "anthropic" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe("claude-sonnet-4");
  });

  it("converts system prompt to top-level system field", async () => {
    const provider = createAnthropicProvider({ apiKey: "sk-ant-test" });
    await provider.complete({
      systemPrompt: "You are helpful.",
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      model: { id: "claude-sonnet-4", provider: "anthropic" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.system).toBe("You are helpful.");
    expect(body.messages[0].role).toBe("user");
  });

  it("converts user messages", async () => {
    const provider = createAnthropicProvider({ apiKey: "sk-ant-test" });
    await provider.complete({
      messages: [{ role: "user", content: [{ type: "text", text: "Hello there" }] }],
      model: { id: "claude-sonnet-4", provider: "anthropic" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.messages[0]).toEqual({
      role: "user",
      content: [{ type: "text", text: "Hello there" }],
    });
  });

  it("converts assistant text messages", async () => {
    const provider = createAnthropicProvider({ apiKey: "sk-ant-test" });
    await provider.complete({
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "Sure!" }],
        },
      ],
      model: { id: "claude-sonnet-4", provider: "anthropic" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.messages[0]).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "Sure!" }],
    });
  });

  it("converts assistant messages with tool calls", async () => {
    const provider = createAnthropicProvider({ apiKey: "sk-ant-test" });
    await provider.complete({
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "Let me check" }],
          toolCalls: [
            {
              id: "toolu_1",
              name: "get_weather",
              input: { city: "London" },
            },
          ],
        },
      ],
      model: { id: "claude-sonnet-4", provider: "anthropic" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.messages[0]).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "Let me check" },
        {
          type: "tool_use",
          id: "toolu_1",
          name: "get_weather",
          input: { city: "London" },
        },
      ],
    });
  });

  it("converts tool result messages", async () => {
    const provider = createAnthropicProvider({ apiKey: "sk-ant-test" });
    await provider.complete({
      messages: [
        {
          role: "tool",
          content: [{ type: "text", text: "Sunny, 22°C" }],
          toolCallId: "toolu_1",
          toolName: "get_weather",
        },
      ],
      model: { id: "claude-sonnet-4", provider: "anthropic" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.messages[0]).toEqual({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu_1",
          content: "Sunny, 22°C",
        },
      ],
    });
  });

  it("includes tools in request body", async () => {
    const provider = createAnthropicProvider({ apiKey: "sk-ant-test" });
    await provider.complete({
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      tools: [
        {
          name: "get_weather",
          description: "Get weather",
          parameters: { type: "object" },
        },
      ],
      model: { id: "claude-sonnet-4", provider: "anthropic" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0]).toEqual({
      name: "get_weather",
      description: "Get weather",
      input_schema: { type: "object" },
    });
  });

  it("parses text response", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "The answer is 42." }],
          usage: { input_tokens: 8, output_tokens: 6 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const provider = createAnthropicProvider({ apiKey: "sk-ant-test" });
    const result = await provider.complete({
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      model: { id: "claude-sonnet-4", provider: "anthropic" },
    });

    expect(result.content).toEqual([{ type: "text", text: "The answer is 42." }]);
    expect(result.usage).toEqual({ input: 8, output: 6 });
  });

  it("parses tool use response", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          content: [
            { type: "text", text: "I'll read that" },
            {
              type: "tool_use",
              id: "toolu_abc",
              name: "read_file",
              input: { path: "/tmp/test" },
            },
          ],
          usage: { input_tokens: 10, output_tokens: 15 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const provider = createAnthropicProvider({ apiKey: "sk-ant-test" });
    const result = await provider.complete({
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      model: { id: "claude-sonnet-4", provider: "anthropic" },
    });

    expect(result.content).toEqual([{ type: "text", text: "I'll read that" }]);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls?.[0]).toEqual({
      id: "toolu_abc",
      name: "read_file",
      input: { path: "/tmp/test" },
    });
  });

  it("throws on API error", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { type: "authentication_error", message: "Invalid API key" },
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
    );

    const provider = createAnthropicProvider({ apiKey: "sk-ant-bad" });
    await expect(
      provider.complete({
        messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
        model: { id: "claude-sonnet-4", provider: "anthropic" },
      }),
    ).rejects.toThrow("Invalid API key");
  });

  it("uses custom baseUrl when provided", async () => {
    const provider = createAnthropicProvider({
      apiKey: "sk-ant-test",
      baseUrl: "https://custom.anthropic.com/v1",
    });
    await provider.complete({
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      model: { id: "claude-sonnet-4", provider: "anthropic" },
    });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://custom.anthropic.com/v1/messages");
  });
});
