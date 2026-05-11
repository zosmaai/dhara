import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { type AgentLoop, createAgentLoop } from "../core/agent-loop.js";
import type { ContextFile } from "../core/context-loader.js";
import { createEventBus } from "../core/events.js";
import type { Provider, ToolRegistration } from "../core/provider.js";
import { type Sandbox, createSandbox } from "../core/sandbox.js";
import type { SessionManager } from "../core/session-manager.js";
import type { Skill } from "../core/skills.js";
import { createStandardToolMap, mergeExtensionTools } from "../std/tools/index.js";
import { ANSI, subscribePromptEvents, tag, useColor } from "./output-utils.js";

// ── AbortController tracking ──────────────────────────────────────────

let currentAbortController: AbortController | null = null;

/**
 * Callback invoked when the user runs `/reload`.
 * Returns the new system prompt and context file list.
 */
export type ReloadHandler = () => {
  systemPrompt: string;
  contextFiles: ContextFile[];
  skills: Skill[];
  projectConfigDir?: string;
  maxIterations: number;
};

/**
 * Configuration for starting a REPL session.
 */
export interface ReplConfig {
  /** Input stream (default: process.stdin) */
  input: Readable;
  /** Output stream (default: process.stdout) */
  output: Writable;
  /** Error stream for tool progress and status messages (default: process.stderr) */
  errorOutput?: Writable;
  /** SessionManager for persisting sessions */
  sessionManager: SessionManager;
  /** LLM provider */
  provider: Provider;
  /** Working directory */
  cwd: string;
  /** Model identifier */
  modelId: string;
  /** Provider name for display */
  providerName: string;
  /** Optional sandbox (default: full capabilities) */
  sandbox?: Sandbox;
  /** System prompt */
  systemPrompt?: string;
  /** Max iterations per prompt */
  maxIterations?: number;
  /** Resume an existing session by ID */
  resumeSessionId?: string;
  /**
   * Handler for `/reload` command.
   * If set, `/reload` calls this and re-creates the agent loop.
   */
  onReload?: ReloadHandler;
  /** Current context files for `/status` display. */
  contextFiles?: ContextFile[];
  /** Current skills for `/skills` and `/status` display. */
  skills?: Skill[];
  /** Current project config dir for `/status` display. */
  projectConfigDir?: string;
  /**
   * Optional additional tool registrations to merge into the tool map.
   * These take precedence over standard tools on name collision.
   */
  toolOverrides?: ToolRegistration[];
}

/**
 * Run an interactive REPL session.
 *
 * Reads prompts from stdin, sends them through the agent loop,
 * streams responses with tool progress, and persists the conversation.
 */
export async function runRepl(config: ReplConfig): Promise<void> {
  const {
    input,
    output,
    sessionManager,
    provider,
    cwd,
    modelId,
    providerName,
    sandbox: sandboxOverride,
    systemPrompt,
    maxIterations = 10,
    resumeSessionId,
  } = config;

  const errorOutput = config.errorOutput ?? process.stderr;
  const colorEnabled = useColor(output);
  const dim = (s: string) => tag(ANSI.dim, s, colorEnabled);
  const bold = (s: string) => tag(ANSI.bold, s, colorEnabled);

  // ── Create or resume session ──────────────────────────────────────
  const session = resumeSessionId
    ? sessionManager.load(resumeSessionId)
    : sessionManager.create({ cwd, model: { id: modelId, provider: providerName } });

  // ── Create sandbox ─────────────────────────────────────────────────
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

  // ── Create tools ───────────────────────────────────────────────────
  let tools = createStandardToolMap({ cwd, sandbox });
  if (config.toolOverrides && config.toolOverrides.length > 0) {
    tools = mergeExtensionTools(tools, config.toolOverrides);
  }

  // ── Create initial system prompt ───────────────────────────────────
  const defaultPrompt = `You are Dhara, an AI coding agent operating in ${cwd}. You have access to file operations (read, write, edit, ls, grep) and shell commands (bash). Be concise and helpful.`;
  let currentSystemPrompt = systemPrompt ?? defaultPrompt;
  let currentMaxIterations = maxIterations;
  let currentContextFiles = config.contextFiles ?? [];
  let currentSkills = config.skills ?? [];
  let currentProjectConfigDir = config.projectConfigDir;

  // ── Create agent loop (re-created on /reload) ──────────────────────
  let agent: AgentLoop = createAgentLoop({
    provider,
    session,
    tools,
    systemPrompt: currentSystemPrompt,
    maxIterations: currentMaxIterations,
  });

  // ── Print header ───────────────────────────────────────────────────
  const mode = resumeSessionId ? "Resuming" : "Started";
  output.write(
    `\n  ${tag(ANSI.bold, "dhara", colorEnabled)}  •  ${bold(providerName)}/${bold(modelId)}  •  ${dim(cwd)}\n`,
  );
  output.write(
    `  ${dim(mode)} ${tag(ANSI.grey, session.meta.sessionId.slice(0, 8), colorEnabled)}`,
  );
  if (resumeSessionId) {
    const entryCount = session.getPath().length;
    output.write(` ${dim(`(${entryCount} entries)`)}`);
  }
  output.write("\n\n");

  // ── SIGINT (Ctrl+C) handler ────────────────────────────────────────
  const sigintHandler = () => {
    if (currentAbortController) {
      currentAbortController.abort();
      output.write(`\n${dim("  Cancelling...")}\n`);
    } else {
      output.write(`\n${dim("Bye!")}\n`);
      rl.close();
    }
  };

  process.on("SIGINT", sigintHandler);

  // ── Readline loop ──────────────────────────────────────────────────
  const rl = createInterface({ input, terminal: false });

  for await (const line of rl) {
    const command = parseInput(line);

    switch (command.type) {
      case "exit":
        process.removeListener("SIGINT", sigintHandler);
        output.write(`${dim("Bye!")}\n`);
        rl.close();
        return;

      case "save":
        try {
          session.save();
          output.write(
            `Session saved: ${tag(ANSI.cyan, session.meta.sessionId.slice(0, 8), colorEnabled)}\n`,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          output.write(`${tag(ANSI.red, "Error", colorEnabled)} saving session: ${msg}\n`);
        }
        break;

      case "list": {
        const all = sessionManager.list();
        if (all.length === 0) {
          output.write("No saved sessions.\n");
        } else {
          output.write(`${bold(`Sessions (${all.length})`)}:\n`);
          for (const s of all.slice(0, 10)) {
            const label = s.sessionId === session.meta.sessionId ? " ← current" : "";
            output.write(
              `  ${tag(ANSI.cyan, s.sessionId.slice(0, 8), colorEnabled)}  ${dim(s.cwd)}  ${s.entryCount} entries${label}\n`,
            );
          }
        }
        break;
      }

      case "resume":
        try {
          const loaded = sessionManager.load(command.sessionId);
          output.write(
            `Switched to session ${tag(ANSI.cyan, command.sessionId, colorEnabled)} (${loaded.getPath().length} entries).\n`,
          );
          output.write(`${dim("Use --resume when starting dhara to open a previous session.")}\n`);
        } catch {
          output.write(
            `${tag(ANSI.red, "Session not found", colorEnabled)}: ${command.sessionId}\n`,
          );
        }
        break;

      case "reload":
        if (config.onReload) {
          try {
            const result = config.onReload();
            currentSystemPrompt = result.systemPrompt;
            currentMaxIterations = result.maxIterations;
            currentContextFiles = result.contextFiles;
            currentSkills = result.skills;
            currentProjectConfigDir = result.projectConfigDir;

            // Re-create agent loop with new system prompt
            agent = createAgentLoop({
              provider,
              session,
              tools,
              systemPrompt: currentSystemPrompt,
              maxIterations: currentMaxIterations,
            });

            output.write(
              `Reloaded. ${result.contextFiles.length} context file(s), ${result.skills.length} skill(s).\n`,
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            output.write(`${tag(ANSI.red, "Reload error", colorEnabled)}: ${msg}\n`);
          }
        } else {
          output.write("Reload not available in this mode.\n");
        }
        break;

      case "skills":
        output.write(`\n${bold(`Skills (${currentSkills.length})`)}:\n`);
        if (currentSkills.length === 0) {
          output.write(`  ${dim("(no skills loaded)")}\n`);
        } else {
          for (const s of currentSkills) {
            output.write(`  ${tag(ANSI.magenta, s.name, colorEnabled)}  — ${s.description}`);
            if (s.source === "global") {
              output.write(`  ${dim("[global]")}`);
            }
            output.write("\n");
          }
        }
        output.write("\n");
        break;

      case "status": {
        output.write(`\n${bold("Dhara Status")}:\n`);
        output.write(`  Provider: ${providerName}/${modelId}\n`);
        output.write(`  Working directory: ${cwd}\n`);
        output.write(`  Max iterations: ${currentMaxIterations}\n`);

        if (currentProjectConfigDir) {
          output.write(`  Project config: ${currentProjectConfigDir}/settings.json\n`);
        } else {
          output.write(`  Project config: ${dim("none")}\n`);
        }

        output.write(`  Context files (${currentContextFiles.length}):\n`);
        if (currentContextFiles.length === 0) {
          output.write(`    ${dim("(none)")}\n`);
        } else {
          for (const file of currentContextFiles) {
            const label = file.source === "global" ? "global ~/.dhara" : "project";
            const lineCount = file.content.split("\n").length;
            output.write(`    ${file.path}  (${label}, ${lineCount} lines)\n`);
          }
        }

        output.write(`  Skills (${currentSkills.length}):\n`);
        if (currentSkills.length === 0) {
          output.write(`    ${dim("(none)")}\n`);
        } else {
          for (const s of currentSkills) {
            output.write(`    ${s.name}  — ${s.description}`);
            if (s.source === "global") output.write(`  ${dim("[global]")}`);
            output.write("\n");
          }
        }

        // Calculate total token usage from session entries
        const path = session.getPath();
        let totalInput = 0;
        let totalOutput = 0;
        for (const id of path) {
          const entry = session.getEntry(id);
          if (entry?.type === "entry") {
            const e = entry as import("../core/session.js").SessionEntry;
            if (e.metadata?.tokenCount) {
              totalInput += e.metadata.tokenCount.input ?? 0;
              totalOutput += e.metadata.tokenCount.output ?? 0;
            }
          }
        }
        if (totalInput > 0 || totalOutput > 0) {
          output.write(
            `  Token usage: ${dim(`${totalInput.toLocaleString()} in / ${totalOutput.toLocaleString()} out`)}\n`,
          );
        }

        output.write(`  Session: ${session.meta.sessionId}\n`);
        output.write("\n");
        break;
      }

      case "help":
        output.write(`\n${bold("Commands")}:\n`);
        output.write(`  ${tag(ANSI.yellow, "/exit", colorEnabled)}      Exit the REPL\n`);
        output.write(`  ${tag(ANSI.yellow, "/quit", colorEnabled)}      Alias for /exit\n`);
        output.write(
          `  ${tag(ANSI.yellow, "/save", colorEnabled)}      Save the current session\n`,
        );
        output.write(`  ${tag(ANSI.yellow, "/list", colorEnabled)}      List saved sessions\n`);
        output.write(`  ${tag(ANSI.yellow, "/resume", colorEnabled)}    Resume a session by ID\n`);
        output.write(
          `  ${tag(ANSI.yellow, "/reload", colorEnabled)}    Reload AGENTS.md, CLAUDE.md, .dhara/settings.json, and skills\n`,
        );
        output.write(`  ${tag(ANSI.yellow, "/skills", colorEnabled)}    List available skills\n`);
        output.write(
          `  ${tag(ANSI.yellow, "/status", colorEnabled)}    Show current configuration, context files, and skills\n`,
        );
        output.write(`  ${tag(ANSI.yellow, "/help", colorEnabled)}      Show this help\n`);
        output.write(
          `  ${tag(ANSI.yellow, "/history", colorEnabled)}   Show recent conversation history (optional: /history N)\n`,
        );
        output.write("\n");
        break;

      case "history": {
        const count = command.count;
        const path = session.getPath();
        const entries: { role: string; text: string }[] = [];

        // Walk backward through the path to collect entries
        for (let i = path.length - 1; i >= 0; i--) {
          const entry = session.getEntry(path[i]);
          if (entry?.type !== "entry") continue;
          const text = entry.content
            .filter((c) => c.type === "text" && c.text)
            .map((c) => c.text)
            .join("")
            .slice(0, 200);
          if (text || entry.toolCalls?.length) {
            entries.unshift({ role: entry.role, text });
          }
          if (entries.length >= count) break;
        }

        if (entries.length === 0) {
          output.write("  No conversation history.\n");
        } else {
          output.write(`\n${bold(`Recent history (last ${entries.length})`)}:\n`);
          for (const e of entries) {
            const roleColor =
              e.role === "user" ? ANSI.green : e.role === "assistant" ? ANSI.blue : ANSI.yellow;
            const label = e.role === "tool_result" ? "tool  " : `${e.role.padEnd(8)}`;
            const line = e.text || (e.role === "assistant" ? "(tool call)" : "");
            output.write(`  ${tag(roleColor, label, colorEnabled)} ${dim(line)}\n`);
          }
          output.write("\n");
        }
        break;
      }

      case "prompt": {
        if (command.text === "") break; // Skip empty input

        // Create AbortController for this prompt
        const abortController = new AbortController();
        currentAbortController = abortController;

        // Create event bus for streaming
        const eventBus = createEventBus();

        // Subscribe streaming output and tool progress handlers
        subscribePromptEvents(eventBus, {
          output,
          errorOutput,
          colorEnabled,
        });

        try {
          await agent.run(command.text, abortController.signal, eventBus);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // Only print if not already handled by agent:error event
          if (!abortController.signal.aborted) {
            output.write(`\n${tag(ANSI.red, "Error", colorEnabled)}: ${msg}\n`);
          }
        } finally {
          // Clear the abort controller after the run completes
          if (currentAbortController === abortController) {
            currentAbortController = null;
          }
        }
        break;
      }
    }
  }
}

/**
 * Parsed REPL command from a line of user input.
 */
export type ReplCommand =
  | { type: "prompt"; text: string }
  | { type: "exit" }
  | { type: "save" }
  | { type: "list" }
  | { type: "help" }
  | { type: "resume"; sessionId: string }
  | { type: "reload" }
  | { type: "status" }
  | { type: "skills" }
  | { type: "history"; count: number }; // Default 10

const SLASH_COMMANDS: Record<string, (arg: string) => ReplCommand | null> = {
  exit: () => ({ type: "exit" }),
  quit: () => ({ type: "exit" }),
  save: () => ({ type: "save" }),
  list: () => ({ type: "list" }),
  help: () => ({ type: "help" }),
  resume: (arg) => (arg ? { type: "resume", sessionId: arg } : null),
  reload: () => ({ type: "reload" }),
  status: () => ({ type: "status" }),
  skills: () => ({ type: "skills" }),
  history: (arg) => {
    const count = arg ? Number.parseInt(arg, 10) : 10;
    return { type: "history", count: Number.isNaN(count) ? 10 : Math.max(count, 1) };
  },
};

/**
 * Parse a single line of user input into a {@link ReplCommand}.
 *
 * Lines starting with `/` are treated as slash commands. Everything else
 * is a prompt to the agent.
 */
export function parseInput(line: string): ReplCommand {
  const trimmed = line.trim();
  if (!trimmed) {
    return { type: "prompt", text: "" };
  }

  if (!trimmed.startsWith("/")) {
    return { type: "prompt", text: trimmed };
  }

  // It's a potential slash command
  const spaceIdx = trimmed.indexOf(" ");
  const cmdName = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx);
  const arg = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

  const handler = SLASH_COMMANDS[cmdName];
  if (handler) {
    const result = handler(arg);
    if (result) return result;
  }

  // Unknown or malformed command — treat as a prompt
  return { type: "prompt", text: trimmed };
}
