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
import type { ConfigManager } from "../core/config.js";
import { createEventBus } from "../core/events.js";
import type { Provider, ToolRegistration } from "../core/provider.js";
import { createSandbox, type Sandbox } from "../core/sandbox.js";
import type { SessionManager } from "../core/session-manager.js";
import { getSelectListTheme } from "../std/renderers/tui/dhara-theme.js";
import { DharaApp, ProcessTerminal, TUI } from "../std/renderers/tui/index.js";
import { createStandardToolMap, mergeExtensionTools } from "../std/tools/index.js";
import { handleLogin, handleLogout } from "./auth-commands.js";
import { handleModel } from "./model-commands.js";

export interface TuiConfig {
  sessionManager: SessionManager;
  configManager: ConfigManager;
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
    configManager,
    provider,
    cwd,
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

  // Mutable references that can be updated by slash commands
  let modelId = config.modelId;

  // ── Session ────────────────────────────────────────────────────────
  let session = resumeSessionId
    ? sessionManager.load(resumeSessionId)
    : sessionManager.create({ cwd, model: { id: modelId, provider: providerName } });

  let sessionId = session.meta.sessionId.slice(0, 8);

  /**
   * Helper: swap the current session + agent with a new one.
   * Saves the old session, loads the new one, re-creates the agent loop,
   * restores history in the chat, and updates the footer.
   */
  function switchToSession(
    newSession: import("../core/session.js").Session & { save(): void },
  ): void {
    // Save the current session first
    try {
      session.save();
    } catch {
      /* best effort */
    }

    session = newSession;
    sessionId = session.meta.sessionId.slice(0, 8);

    // Re-create the agent loop with the new session
    agent = createAgentLoop({
      provider,
      session,
      tools,
      systemPrompt: currentSystemPrompt,
      maxIterations: currentMaxIterations,
    });

    // Restore conversation history in the chat
    chat.restoreSessionHistory(session);

    // Update footer with new session info
    const displayName = session.meta.name ?? sessionId;
    chat.footer.update({
      sessionId: displayName,
      state: "idle",
    });
  }

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
            // Resume specific session by ID — actually swap into it
            try {
              const resumed = sessionManager.load(args);
              switchToSession(resumed);
              const displayName = resumed.meta.name ?? resumed.meta.sessionId.slice(0, 8);
              chat.addMessage({
                role: "system",
                content: `Resumed session: ${displayName} (${resumed.getPath().length} entries)`,
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

          // No args — show session picker overlay with names
          const sessions = sessionManager.list();
          if (sessions.length === 0) {
            chat.addMessage({ role: "system", content: "No saved sessions found." });
            tui.requestRender();
            return true;
          }

          const items: SelectItem[] = sessions.map((s) => ({
            value: s.sessionId,
            label: s.name ?? s.sessionId.slice(0, 8),
            description: `${s.entryCount} entries · ${new Date(s.createdAt).toLocaleDateString()}${s.name ? ` · id: ${s.sessionId.slice(0, 8)}` : ""}`,
          }));

          const sessionList = new SelectList(items, 10, getSelectListTheme());
          sessionList.onSelect = (item) => {
            tui.hideOverlay();
            try {
              const resumed = sessionManager.load(item.value);
              switchToSession(resumed);
              const displayName = resumed.meta.name ?? resumed.meta.sessionId.slice(0, 8);
              chat.addMessage({
                role: "system",
                content: `Resumed session: ${displayName} (${resumed.getPath().length} entries)`,
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
        case "/name": {
          if (!args) {
            const currentName = session.meta.name ?? sessionId;
            chat.addMessage({
              role: "system",
              content: `Current session name: ${currentName}\nUse /name <new-name> to change it.`,
            });
          } else {
            session.meta.name = args;
            try {
              session.save();
            } catch {
              /* best effort */
            }
            const displayName = session.meta.name ?? sessionId;
            chat.footer.update({ sessionId: displayName });
            chat.addMessage({
              role: "system",
              content: `Session renamed to: ${args}`,
            });
          }
          tui.requestRender();
          return true;
        }
        case "/new": {
          // Save current, create fresh session, switch to it
          try {
            session.save();
          } catch {
            /* best effort */
          }
          const fresh = sessionManager.create({
            cwd,
            model: { id: modelId, provider: providerName },
          });
          switchToSession(fresh);
          chat.addMessage({ role: "system", content: "Started a new session." });
          tui.requestRender();
          return true;
        }
        case "/session": {
          const nameLine = session.meta.name
            ? `Name: ${session.meta.name}`
            : `Session: ${sessionId}`;
          chat.addMessage({
            role: "system",
            content: [
              nameLine,
              `ID: ${session.meta.sessionId}`,
              `Provider: ${providerName}`,
              `Model: ${modelId}`,
              `CWD: ${cwd}`,
              `Entries: ${session.getPath().length}`,
              `Saved sessions: ${sessionManager.list().length}`,
            ].join("\n"),
          });
          tui.requestRender();
          return true;
        }
        case "/model":
          handleModel(tui, chat, providerName, modelId, (_newProvider, newModel) => {
            // Update session model metadata — provider.complete() reads this
            session.meta.model = { id: newModel, provider: providerName };
            try {
              session.save();
            } catch {
              /* best effort */
            }
            modelId = newModel;
            chat.footer.update({ model: newModel });
            chat.addMessage({
              role: "system",
              content: `Switched to model: ${newModel}`,
            });
            tui.requestRender();
          });
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
        case "/login":
          handleLogin(tui, chat, configManager);
          return true;

        case "/logout":
          handleLogout(tui, chat, configManager);
          return true;

        case "/help":
        case "/hotkeys":
          chat.addMessage({
            role: "system",
            content:
              "Available commands: /quit, /clear, /resume [id], /new, /name <name>, /model [name], /session, /compact, /export, /import, /settings, /fork, /clone, /tree, /reload, /copy, /share, /login, /logout, /hotkeys",
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
