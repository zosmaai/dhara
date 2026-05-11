/**
 * TUI runner — bridges the TUI renderer with dhara's agent loop.
 */
import { type AgentLoop, createAgentLoop } from "../core/agent-loop.js";
import { createEventBus } from "../core/events.js";
import type { Provider, ToolRegistration } from "../core/provider.js";
import { type Sandbox, createSandbox } from "../core/sandbox.js";
import type { SessionManager } from "../core/session-manager.js";
import { DharaChat } from "../std/renderers/tui/dhara-chat.js";
import {
  DEFAULT_THEME,
  ProcessTerminal,
  TUI,
  Theme,
  loadThemeFile,
} from "../std/renderers/tui/index.js";
import { createStandardToolMap, mergeExtensionTools } from "../std/tools/index.js";

export interface TuiConfig {
  sessionManager: SessionManager;
  provider: Provider;
  cwd: string;
  modelId: string;
  providerName: string;
  sandbox?: Sandbox;
  systemPrompt?: string;
  maxIterations?: number;
  resumeSessionId?: string;
  toolOverrides?: ToolRegistration[];
  onReload?: () => { systemPrompt: string; maxIterations: number };
  theme?: string;
}

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

  // ── Theme ──────────────────────────────────────────────────────────
  let theme: Theme;
  if (themeArg) {
    try {
      theme = loadThemeFile(themeArg);
    } catch {
      theme = new Theme(DEFAULT_THEME);
    }
  } else {
    theme = new Theme(DEFAULT_THEME);
  }

  // ── Session ────────────────────────────────────────────────────────
  const session = resumeSessionId
    ? sessionManager.load(resumeSessionId)
    : sessionManager.create({ cwd, model: { id: modelId, provider: providerName } });

  // ── Sandbox ────────────────────────────────────────────────────────
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

  // ── Tools ──────────────────────────────────────────────────────────
  let tools = createStandardToolMap({ cwd, sandbox });
  if (toolOverrides?.length) tools = mergeExtensionTools(tools, toolOverrides);

  // ── System prompt ──────────────────────────────────────────────────
  const defaultPrompt = `You are Dhara, an AI coding agent operating in ${cwd}. You have access to file operations (read, write, edit, ls, grep) and shell commands (bash). Be concise and helpful.`;
  let currentSystemPrompt = systemPrompt ?? defaultPrompt;
  let currentMaxIterations = maxIterations;

  // ── Agent ──────────────────────────────────────────────────────────
  let agent: AgentLoop = createAgentLoop({
    provider,
    session,
    tools,
    systemPrompt: currentSystemPrompt,
    maxIterations: currentMaxIterations,
  });

  // ── Terminal + TUI ─────────────────────────────────────────────────
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  // ── Chat ───────────────────────────────────────────────────────────
  const chat = new DharaChat({
    theme,
    version: "0.1.0",
    status: {
      provider: providerName,
      model: modelId,
      sessionId: session.meta.sessionId.slice(0, 8),
      cwd,
      state: "idle",
    },
    onSubmit: async (text: string) => {
      const eventBus = createEventBus();
      const abortController = new AbortController();

      // Wire chat to this prompt's event bus
      chat.setEventBus(eventBus);
      chat.updateStatus({ state: "thinking" });
      tui.requestRender();

      try {
        await agent.run(text, abortController.signal, eventBus);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        chat.addSystemMessage(`Error: ${msg}`, true);
      } finally {
        chat.finishStream();
        try {
          session.save();
        } catch {
          /* best effort */
        }
        chat.updateStatus({ state: "idle" });
        tui.requestRender();
      }
    },
    onExit: () => {
      tui.stop();
    },
  });

  chat.onRenderRequest = () => tui.requestRender();

  // ── Reload ─────────────────────────────────────────────────────────
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
        chat.addSystemMessage(
          `Reload error: ${err instanceof Error ? err.message : String(err)}`,
          true,
        );
      }
    }
    tui.requestRender();
  };

  // ── Start ──────────────────────────────────────────────────────────
  tui.setRoot(chat);
  tui.focus(chat);
  tui.start();

  // Wait until TUI.stop() is called (from onExit via Ctrl+C/Ctrl+D)
  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      // no-op: just keep process alive until tui stops
    }, 500);
    process.once("SIGTERM", () => {
      clearInterval(check);
      tui.stop();
      resolve();
    });
    // Override shutdown to resolve the promise
    const origShutdown = tui.onShutdown;
    tui.onShutdown = () => {
      clearInterval(check);
      chat.dispose();
      try {
        session.save();
      } catch {
        /* best effort */
      }
      terminal.write(`\nSession saved: ${session.meta.sessionId.slice(0, 8)}\n`);
      origShutdown?.();
      resolve();
    };
  });
}
