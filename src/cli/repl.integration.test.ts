import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AssistantMessage, CompleteParams, Provider } from "../core/provider.js";
import { SessionManager } from "../core/session-manager.js";
import { runRepl } from "./repl.js";

/**
 * Create a mock provider that returns a static response for any prompt.
 */
function createMockProvider(responseText: string): Provider {
  return {
    complete(_params: CompleteParams): Promise<AssistantMessage> {
      return Promise.resolve({
        content: [{ type: "text", text: responseText }],
      });
    },
  };
}

describe("REPL integration", () => {
  let storageDir: string;
  let sessionManager: SessionManager;
  let input: PassThrough;
  let output: PassThrough;
  let outputText: string;

  beforeEach(() => {
    storageDir = mkdtempSync(join(tmpdir(), "dhara-repl-test-"));
    sessionManager = new SessionManager({ storageDir });
    input = new PassThrough();
    output = new PassThrough();
    outputText = "";

    // Capture all output
    output.on("data", (chunk: Buffer) => {
      outputText += chunk.toString("utf-8");
    });
  });

  afterEach(() => {
    rmSync(storageDir, { recursive: true, force: true });
  });

  it("creates a new persisted session and processes a prompt", async () => {
    const provider = createMockProvider("Hello from Dhara!");

    // Run the REPL with one prompt then /exit
    const runPromise = runRepl({
      input,
      output,
      sessionManager,
      provider,
      cwd: "/tmp",
      modelId: "mock-model",
      providerName: "mock",
      systemPrompt: "You are a test agent.",
      maxIterations: 5,
    });

    // Send a prompt then exit
    input.write("say hello\n");
    input.write("/exit\n");

    await runPromise;

    // Should have printed the mock response
    expect(outputText).toContain("Hello from Dhara!");

    // Should have created a session file in the storage dir
    const sessions = sessionManager.list();
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions[0].entryCount).toBeGreaterThanOrEqual(2); // user + assistant
  });

  it("saves a session and can list it", async () => {
    const provider = createMockProvider("response");

    const runPromise = runRepl({
      input,
      output,
      sessionManager,
      provider,
      cwd: "/tmp",
      modelId: "mock-model",
      providerName: "mock",
      systemPrompt: "",
    });

    input.write("first prompt\n");
    input.write("/list\n");
    input.write("/exit\n");

    await runPromise;

    // Should have listed sessions
    const sessions = sessionManager.list();
    expect(sessions.length).toBe(1);
    const shortId = sessions[0].sessionId.slice(0, 8);
    expect(outputText).toContain(shortId);
  });

  it("resumes a previous session", async () => {
    const provider1 = createMockProvider("first answer");
    const provider2 = createMockProvider("second answer");

    // First session
    const input1 = new PassThrough();
    const output1 = new PassThrough();
    const run1 = runRepl({
      input: input1,
      output: output1,
      sessionManager,
      provider: provider1,
      cwd: "/tmp",
      modelId: "mock-model",
      providerName: "mock",
    });

    input1.write("first prompt\n");
    input1.write("/exit\n");
    await run1;

    const sessions = sessionManager.list();
    const sessionId = sessions[0].sessionId;

    // Resume with a new REPL
    const output2 = new PassThrough();
    let output2Text = "";
    output2.on("data", (chunk: Buffer) => {
      output2Text += chunk.toString("utf-8");
    });

    const input2 = new PassThrough();

    const run2 = runRepl({
      input: input2,
      output: output2,
      sessionManager,
      provider: provider2,
      cwd: "/tmp",
      modelId: "mock-model",
      providerName: "mock",
      resumeSessionId: sessionId,
    });

    input2.write("second prompt\n");
    input2.write("/exit\n");
    await run2;

    // Should show the response
    expect(output2Text).toContain("second answer");

    // Session should have grown
    const resumed = sessionManager.load(sessionId);
    expect(resumed.getPath().length).toBeGreaterThan(2);
  });

  it("handles /help command", async () => {
    const provider = createMockProvider("ok");

    const runPromise = runRepl({
      input,
      output,
      sessionManager,
      provider,
      cwd: "/tmp",
      modelId: "mock-model",
      providerName: "mock",
    });

    input.write("/help\n");
    input.write("/exit\n");

    await runPromise;

    expect(outputText).toContain("/exit");
    expect(outputText).toContain("/save");
    expect(outputText).toContain("/list");
    expect(outputText).toContain("/resume");
    expect(outputText).toContain("/history");
  });

  it("handles /save explicitly", async () => {
    const provider = createMockProvider("data");

    const runPromise = runRepl({
      input,
      output,
      sessionManager,
      provider,
      cwd: "/tmp",
      modelId: "mock-model",
      providerName: "mock",
    });

    input.write("hello\n");
    input.write("/save\n");
    input.write("/exit\n");

    await runPromise;

    // Session should be saved and retrievable
    const sessions = sessionManager.list();
    expect(sessions.length).toBe(1);
    expect(sessions[0].entryCount).toBeGreaterThanOrEqual(1);
  });

  it("prints session header on start", async () => {
    const provider = createMockProvider("ok");

    const runPromise = runRepl({
      input,
      output,
      sessionManager,
      provider,
      cwd: "/tmp",
      modelId: "deepseek-v4-flash",
      providerName: "opencode-go",
    });

    input.write("/exit\n");
    await runPromise;

    expect(outputText).toContain("dhara");
    expect(outputText).toContain("opencode-go/deepseek-v4-flash");
    expect(outputText).toContain("Started");
    expect(outputText).toMatch(/Started [0-9a-f]{8}/);
  });

  it("shows session ID on resume", async () => {
    const provider = createMockProvider("ok");
    const sess = sessionManager.create({ cwd: "/tmp" });
    const sessionId = sess.meta.sessionId;

    const runPromise = runRepl({
      input,
      output,
      sessionManager,
      provider,
      cwd: "/tmp",
      modelId: "mock",
      providerName: "mock",
      resumeSessionId: sessionId,
    });

    input.write("/exit\n");
    await runPromise;

    const shortId = sessionId.slice(0, 8);
    expect(outputText).toContain(shortId);
  });
});
