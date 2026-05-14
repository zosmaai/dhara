import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenAIProvider } from "./openai-provider.js";

describe("OpenAI Provider", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: "Hello!",
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("sends request to OpenAI chat completions endpoint", async () => {
    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    await provider.complete({
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      model: { id: "gpt-4", provider: "openai" },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("includes Authorization header with API key", async () => {
    const provider = createOpenAIProvider({ apiKey: "sk-secret" });
    await provider.complete({
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      model: { id: "gpt-4", provider: "openai" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer sk-secret",
    });
  });

  it("includes model in request body", async () => {
    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    await provider.complete({
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      model: { id: "gpt-4o", provider: "openai" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe("gpt-4o");
  });

  it("converts system prompt to system message", async () => {
    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    await provider.complete({
      systemPrompt: "You are helpful.",
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      model: { id: "gpt-4", provider: "openai" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.messages[0]).toEqual({
      role: "system",
      content: "You are helpful.",
    });
  });

  it("converts user messages", async () => {
    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    await provider.complete({
      messages: [{ role: "user", content: [{ type: "text", text: "Hello there" }] }],
      model: { id: "gpt-4", provider: "openai" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.messages[0]).toEqual({
      role: "user",
      content: "Hello there",
    });
  });

  it("converts assistant messages", async () => {
    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    await provider.complete({
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "Sure!" }],
        },
      ],
      model: { id: "gpt-4", provider: "openai" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.messages[0]).toEqual({
      role: "assistant",
      content: "Sure!",
    });
  });

  it("converts assistant messages with tool calls", async () => {
    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    await provider.complete({
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "Let me check" }],
          toolCalls: [
            {
              id: "call_1",
              name: "get_weather",
              input: { city: "London" },
            },
          ],
        },
      ],
      model: { id: "gpt-4", provider: "openai" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.messages[0]).toEqual({
      role: "assistant",
      content: "Let me check",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: {
            name: "get_weather",
            arguments: JSON.stringify({ city: "London" }),
          },
        },
      ],
    });
  });

  it("converts tool result messages", async () => {
    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    await provider.complete({
      messages: [
        {
          role: "tool",
          content: [{ type: "text", text: "Sunny, 22°C" }],
          toolCallId: "call_1",
          toolName: "get_weather",
        },
      ],
      model: { id: "gpt-4", provider: "openai" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.messages[0]).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: "Sunny, 22°C",
    });
  });

  it("includes tools in request body", async () => {
    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    await provider.complete({
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      tools: [
        {
          name: "get_weather",
          description: "Get weather",
          parameters: { type: "object" },
        },
      ],
      model: { id: "gpt-4", provider: "openai" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0]).toEqual({
      type: "function",
      function: {
        name: "get_weather",
        description: "Get weather",
        parameters: { type: "object" },
      },
    });
  });

  it("parses text response", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: "The answer is 42.",
              },
            },
          ],
          usage: { prompt_tokens: 8, completion_tokens: 6 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    const result = await provider.complete({
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      model: { id: "gpt-4", provider: "openai" },
    });

    expect(result.content).toEqual([{ type: "text", text: "The answer is 42." }]);
    expect(result.usage).toEqual({ input: 8, output: 6 });
  });

  it("parses tool call response", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_abc",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "/tmp/test" }),
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 15 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    const result = await provider.complete({
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      model: { id: "gpt-4", provider: "openai" },
    });

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls?.[0]).toEqual({
      id: "call_abc",
      name: "read_file",
      input: { path: "/tmp/test" },
    });
  });

  it("throws on API error", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Invalid API key" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );

    const provider = createOpenAIProvider({ apiKey: "sk-bad" });
    await expect(
      provider.complete({
        messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
        model: { id: "gpt-4", provider: "openai" },
      }),
    ).rejects.toThrow("Invalid API key");
  });

  it("uses custom baseUrl when provided", async () => {
    const provider = createOpenAIProvider({
      apiKey: "sk-test",
      baseUrl: "https://custom.example.com/v1",
    });
    await provider.complete({
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      model: { id: "gpt-4", provider: "openai" },
    });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://custom.example.com/v1/chat/completions");
  });
});
