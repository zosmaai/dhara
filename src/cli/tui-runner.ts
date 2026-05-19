import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
/**
 * TUI runner — bridges the TUI renderer with dhara's agent loop.
 *
 * Uses @earendil-works/pi-tui for the terminal UI framework,
 * matching pi's InteractiveMode architecture.
 */
import { type AgentLoop, createAgentLoop } from "../core/agent-loop.js";
import { createEventBus } from "../core/events.js";
import type { Provider, ToolRegistration } from "../core/provider.js";
import { createSandbox, type Sandbox } from "../core/sandbox.js";
import type { SessionManager } from "../core/session-manager.js";
import { DharaApp, ProcessTerminal, TUI } from "../std/renderers/tui/index.js";
import { createStandardToolMap, mergeExtensionTools } from "../std/tools/index.js";

export interface TuiConfig {
  sessionManager: SessionManager;
  provider: Provider;
  cwd: string;
  modelId: string;
  providerName: string;
  theme?: string;
  sandbox?: Sandbox;
  systemPrompt?: string;
  maxIterations?: number;
  resumeSessionId?: string;
  toolOverrides?: ToolRegistration[];
  onReload?: () => { systemPrompt: string; maxIterations: number };
}

export async function runTui(config: TuiConfig): Promise<void> {
  const {
    sessionManager,
    provider,
    cwd,
    modelId,
    providerName,
    theme,
    sandbox: sandboxOverride,
    systemPrompt,
    maxIterations = 10,
    resumeSessionId,
    toolOverrides,
    onReload,
  } = config;

  // ── Version ────────────────────────────────────────────────────────
  const pkgVersion = getPkgVersion();

  // ── Session ────────────────────────────────────────────────────────
  const session = resumeSessionId
    ? sessionManager.load(resumeSessionId)
    : sessionManager.create({ cwd, model: { id: modelId, provider: providerName } });

  const sessionId = session.meta.sessionId.slice(0, 8);

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

  // ── Terminal + TUI (pi-tui) ────────────────────────────────────────
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  // ── DharaApp ──────────────────────────────────────────────────────
  const chat = new DharaApp(tui, {
    version: pkgVersion,
    theme: theme ?? "dhara-default",
    footerData: {
      provider: providerName,
      model: modelId,
      cwd,
      sessionId,
      state: "idle",
    },
    onSubmit: async (text: string) => {
      const eventBus = createEventBus();
      const abortController = new AbortController();

      // Wire chat to this prompt's event bus
      chat.wireEvents(eventBus);
      chat.setFooterState("thinking");
      tui.requestRender();

      try {
        await agent.run(text, abortController.signal, eventBus);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        chat.addMessage({ role: "error", content: msg });
      } finally {
        chat.finishStream();
        try {
          session.save();
        } catch {
          /* best effort */
        }
        chat.setFooterState("idle");
        tui.requestRender();
      }
    },
    onExit: () => {
      tui.stop();
    },
  });

  // ── Reload (Shift+Ctrl+D) ──────────────────────────────────────────
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
        chat.addMessage({ role: "system", content: "Reloaded configuration." });
      } catch (err) {
        chat.addMessage({
          role: "error",
          content: `Reload error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
    tui.requestRender();
  };

  // ── Add components to TUI ──────────────────────────────────────────
  tui.addChild(chat.headerContainer);
  tui.addChild(chat.chatContainer);
  tui.addChild(chat.statusContainer);
  tui.addChild(chat.editorContainer);
  tui.addChild(chat.footer);
  tui.setFocus(chat.editor);

  // ── Start ──────────────────────────────────────────────────────────
  tui.start();

  // Wait until TUI.stop() is called (from onExit via Ctrl+C/Ctrl+D)
  await new Promise<void>((resolve) => {
    process.once("SIGTERM", () => {
      tui.stop();
      resolve();
    });

    // Override stop detection
    const origStop = tui.stop.bind(tui);
    tui.stop = () => {
      // Save session before stopping
      try {
        session.save();
      } catch {
        /* best effort */
      }
      terminal.write(`\nSession saved: ${sessionId}\n`);
      chat.dispose();
      origStop();
      resolve();
    };
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getPkgVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(__dirname, "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version as string;
  } catch {
    return "0.1.0";
  }
}
