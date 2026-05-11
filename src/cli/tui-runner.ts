/**
 * TUI runner — bridges the TUI renderer with dhara's agent loop.
 *
 * Creates the ProcessTerminal, TUI instance, DharaChat component,
 * and wires agent.run() to the chat UI and event bus.
 */
import { type AgentLoop, createAgentLoop } from "../core/agent-loop.js";
import { createEventBus } from "../core/events.js";
import type { Provider, ToolRegistration } from "../core/provider.js";
import { type Sandbox, createSandbox } from "../core/sandbox.js";
import type { SessionManager } from "../core/session-manager.js";
import {
  TUI,
  ProcessTerminal,
  Theme,
  DEFAULT_THEME,
  loadThemeFile,
} from "../std/renderers/tui/index.js";
import { DharaChat } from "../std/renderers/tui/dhara-chat.js";
import { createStandardToolMap, mergeExtensionTools } from "../std/tools/index.js";

// ── Types ────────────────────────────────────────────────────────────

export interface TuiConfig {
  /** SessionManager for persisting sessions. */
  sessionManager: SessionManager;
  /** LLM provider. */
  provider: Provider;
  /** Working directory. */
  cwd: string;
  /** Model identifier. */
  modelId: string;
  /** Provider name for display. */
  providerName: string;
  /** Optional sandbox (default: full capabilities). */
  sandbox?: Sandbox;
  /** System prompt. */
  systemPrompt?: string;
  /** Max iterations per prompt. */
  maxIterations?: number;
  /** Resume an existing session by ID. */
  resumeSessionId?: string;
  /** Optional additional tool registrations. */
  toolOverrides?: ToolRegistration[];
  /** Handler for `/reload` command. */
  onReload?: () => { systemPrompt: string; maxIterations: number };
  /** Theme name or path. */
  theme?: string;
}

// ── Implementation ───────────────────────────────────────────────────

export async function runTui(config: TuiConfig): Promise<void> {
  const {
    sessionManager,
    provider,
    cwd,
    modelId,
    providerName,
    sandbox: sandboxOverride,
    systemPrompt,
    maxIterations = 10,
    resumeSessionId,
    toolOverrides,
    onReload,
    theme: themeArg,
  } = config;

  // ── Load theme ───────────────────────────────────────────────────
  let theme: Theme;
  if (themeArg) {
    try {
      theme = loadThemeFile(themeArg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Warning: ${msg}. Using default theme.\n`);
      theme = new Theme(DEFAULT_THEME);
    }
  } else {
    theme = new Theme(DEFAULT_THEME);
  }

  // ── Create or resume session ─────────────────────────────────────
  const session = resumeSessionId
    ? sessionManager.load(resumeSessionId)
    : sessionManager.create({ cwd, model: { id: modelId, provider: providerName } });

  // ── Create sandbox ────────────────────────────────────────────────
  const sandbox =
    sandboxOverride ??
    createSandbox({
      granted: [
        "filesystem:read",
        "filesystem:write",
        "filesystem:*",
        "process:spawn",
        "network:outbound",
      ],
      cwd,
    });

  // ── Create tools ──────────────────────────────────────────────────
  let tools = createStandardToolMap({ cwd, sandbox });
  if (toolOverrides && toolOverrides.length > 0) {
    tools = mergeExtensionTools(tools, toolOverrides);
  }

  // ── Create initial system prompt ──────────────────────────────────
  const defaultPrompt = `You are Dhara, an AI coding agent operating in ${cwd}. You have access to file operations (read, write, edit, ls, grep) and shell commands (bash). Be concise and helpful.`;
  let currentSystemPrompt = systemPrompt ?? defaultPrompt;
  let currentMaxIterations = maxIterations;

  // ── Create agent loop ─────────────────────────────────────────────
  let agent: AgentLoop = createAgentLoop({
    provider,
    session,
    tools,
    systemPrompt: currentSystemPrompt,
    maxIterations: currentMaxIterations,
  });

  // ── Create terminal + TUI ─────────────────────────────────────────
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  // ── Create chat component ─────────────────────────────────────────
  const chat = new DharaChat({
    theme,
    status: {
      provider: providerName,
      model: modelId,
      sessionId: session.meta.sessionId.slice(0, 8),
      cwd,
      state: "idle",
    },
    onSubmit: async (text: string) => {
      // Create event bus for this prompt
      const eventBus = createEventBus();
      // Re-create chat with event bus for streaming
      chat.dispose();
      chat.addMessage({ role: "assistant", content: "..." }); // TODO: wire properly
      tui.requestRender();

      try {
        await agent.run(text, undefined, eventBus);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        chat.addSystemMessage(`Error: ${msg}`, true);
      } finally {
        chat.finishStream();
        // Save session
        try {
          session.save();
        } catch {
          // Best effort
        }
        chat.updateStatus({ state: "idle" });
        tui.requestRender();
      }
    },
  });

  chat.onRenderRequest = () => tui.requestRender();

  // ── Handle reload ─────────────────────────────────────────────────
  tui.onDebug = () => {
    if (onReload) {
      try {
        const result = onReload();
        currentSystemPrompt = result.systemPrompt;
        currentMaxIterations = result.maxIterations;

        agent = createAgentLoop({
          provider,
          session,
          tools,
          systemPrompt: currentSystemPrompt,
          maxIterations: currentMaxIterations,
        });

        chat.addSystemMessage("Reloaded configuration.");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        chat.addSystemMessage(`Reload error: ${msg}`, true);
      }
    }
    tui.requestRender();
  };

  // ── Handle shutdown ───────────────────────────────────────────────
  tui.onShutdown = () => {
    chat.dispose();
    try {
      session.save();
    } catch {
      // Best effort
    }
    terminal.write(`\nDhara session saved: ${session.meta.sessionId.slice(0, 8)}\n`);
  };

  // ── Start the TUI ─────────────────────────────────────────────────
  tui.setRoot(chat);
  tui.focus(chat);
  tui.start();

  // ── Welcome message ───────────────────────────────────────────────
  chat.addSystemMessage(
    `Welcome to Dhara! Using ${theme.name} theme.
Provider: ${providerName}/${modelId}
Session: ${session.meta.sessionId.slice(0, 8)}
Type /help for commands, Ctrl+C to exit.`,
  );
  tui.requestRender();

  // ── Wait for shutdown ─────────────────────────────────────────────
  // TUI runs synchronously via terminal input, so this promise resolves
  // only when SIGINT/Ctrl+C stops the terminal.
  await new Promise<void>((resolve) => {
    const sigintHandler = () => {
      process.removeListener("SIGINT", sigintHandler);
      tui.stop();
      resolve();
    };
    process.once("SIGINT", sigintHandler);
  });
}
