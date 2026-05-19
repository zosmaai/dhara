import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
/**
 * TUI runner — bridges the TUI renderer with dhara's agent loop.
 *
 * Uses @earendil-works/pi-tui for the terminal UI framework,
 * matching pi's InteractiveMode architecture.
 */
import { type SelectItem, SelectList } from "@earendil-works/pi-tui";
import { type AgentLoop, createAgentLoop } from "../core/agent-loop.js";
import { createEventBus } from "../core/events.js";
import type { Provider, ToolRegistration } from "../core/provider.js";
import { createSandbox, type Sandbox } from "../core/sandbox.js";
import type { SessionManager } from "../core/session-manager.js";
import { getSelectListTheme } from "../std/renderers/tui/dhara-theme.js";
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
    onSlashCommand: (command: string, args: string) => {
      switch (command) {
        case "/resume": {
          if (args) {
            // Resume specific session by ID
            try {
              const resumed = sessionManager.load(args);
              chat.addMessage({
                role: "system",
                content: `Resumed session ${resumed.meta.sessionId.slice(0, 8)}`,
              });
            } catch {
              chat.addMessage({
                role: "error",
                content: `Session "${args}" not found.`,
              });
            }
            tui.requestRender();
            return true;
          }

          // Show session picker overlay
          const sessions = sessionManager.list();
          if (sessions.length === 0) {
            chat.addMessage({ role: "system", content: "No saved sessions found." });
            tui.requestRender();
            return true;
          }

          const items: SelectItem[] = sessions.map((s) => ({
            value: s.sessionId,
            label: s.sessionId.slice(0, 8),
            description: `${s.entryCount} entries · ${new Date(s.createdAt).toLocaleDateString()}`,
          }));

          const sessionList = new SelectList(items, 10, getSelectListTheme());
          sessionList.onSelect = (item) => {
            tui.hideOverlay();
            try {
              const resumed = sessionManager.load(item.value);
              chat.addMessage({
                role: "system",
                content: `Resumed session ${resumed.meta.sessionId.slice(0, 8)}`,
              });
            } catch {
              chat.addMessage({
                role: "error",
                content: `Failed to resume session "${item.value}".`,
              });
            }
            tui.requestRender();
          };
          sessionList.onCancel = () => {
            tui.hideOverlay();
          };

          tui.showOverlay(sessionList, {
            anchor: "center",
            width: "60%",
          });
          return true;
        }
        case "/new": {
          session.save();
          chat.addMessage({ role: "system", content: "Starting a new session..." });
          tui.requestRender();
          return true;
        }
        case "/session":
          chat.addMessage({
            role: "system",
            content: [
              `Session: ${sessionId}`,
              `Provider: ${providerName}`,
              `Model: ${modelId}`,
              `CWD: ${cwd}`,
              `Saved sessions: ${sessionManager.list().length}`,
            ].join("\n"),
          });
          tui.requestRender();
          return true;
        case "/model":
          chat.addMessage({
            role: "system",
            content: args
              ? `Switching to model: ${args}...`
              : `Current model: ${modelId} from ${providerName}`,
          });
          tui.requestRender();
          return true;
        case "/compact":
          chat.addMessage({ role: "system", content: "Compacting session..." });
          tui.requestRender();
          return true;
        case "/export": {
          const exportData = session.export();
          const exportPath = args || join(cwd, `.dhara/sessions/${sessionId}.jsonl`);
          try {
            writeFileSync(exportPath, exportData, "utf-8");
            chat.addMessage({
              role: "system",
              content: `Session exported to ${exportPath}`,
            });
          } catch (err) {
            chat.addMessage({
              role: "error",
              content: `Export failed: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
          tui.requestRender();
          return true;
        }
        case "/help":
        case "/hotkeys":
          chat.addMessage({
            role: "system",
            content:
              "Available commands: /quit, /clear, /resume [id], /new, /model [name], /session, /compact, /export, /import, /settings, /fork, /clone, /tree, /reload, /copy, /share, /name, /login, /logout, /hotkeys",
          });
          tui.requestRender();
          return true;
        default:
          return false;
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
