import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { type AgentLoop, createAgentLoop } from "../core/agent-loop.js";
import type { ContextFile } from "../core/context-loader.js";
import type { Provider } from "../core/provider.js";
import { type Sandbox, createSandbox } from "../core/sandbox.js";
import type { SessionManager } from "../core/session-manager.js";
import type { Skill } from "../core/skills.js";
import { createStandardToolMap } from "../std/tools/index.js";

/**
 * Track the current operation's AbortController.
 * When the user presses Ctrl+C during a prompt, this controller is aborted
 * to cancel the in-progress LLM request or tool execution.
 */
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
}

/**
 * Run an interactive REPL session.
 *
 * Reads prompts from stdin, sends them through the agent loop,
 * prints responses to stdout, and persists the conversation to
 * `~/.dhara/sessions/`.
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
  const tools = createStandardToolMap({ cwd, sandbox });

  // ── Create initial system prompt ───────────────────────────────────
  const defaultPrompt = `You are Dhara, an AI coding agent operating in ${cwd}. You have access to file operations (read, write, edit, ls, grep) and shell commands (bash). Be concise and helpful.`;
  let currentSystemPrompt = systemPrompt ?? defaultPrompt;
  let currentMaxIterations = maxIterations;
  let currentContextFiles = config.contextFiles ?? [];
  let currentSkills = config.skills ?? [];
  let currentProjectConfigDir = config.projectConfigDir;

  // ── Create agent loop ──────────────────────────────────────────────
  let agent: AgentLoop = createAgentLoop({
    provider,
    session,
    tools,
    systemPrompt: currentSystemPrompt,
    maxIterations: currentMaxIterations,
  });

  // ── Print header ───────────────────────────────────────────────────
  const mode = resumeSessionId ? "Resuming" : "Started";
  output.write(`\n  dhara  •  ${providerName}/${modelId}  •  ${cwd}\n`);
  output.write(`  ${mode} session ${session.meta.sessionId}\n`);
  output.write(`  ${resumeSessionId ? `Resumed from ${session.getPath().length} entries` : ""}\n`);
  output.write("\n");

  // ── SIGINT (Ctrl+C) handler ────────────────────────────────────────
  // During a running prompt: cancels the current operation.
  // When idle: exits the REPL.
  const sigintHandler = () => {
    if (currentAbortController) {
      currentAbortController.abort();
      output.write("\n  Cancelling...\n");
    } else {
      output.write("\nBye!\n");
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
        output.write("Bye!\n");
        rl.close();
        return;

      case "save":
        try {
          session.save();
          output.write(`Session saved: ${session.meta.sessionId}\n`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          output.write(`Error saving session: ${msg}\n`);
        }
        break;

      case "list": {
        const all = sessionManager.list();
        if (all.length === 0) {
          output.write("No saved sessions.\n");
        } else {
          output.write(`Sessions (${all.length}):\n`);
          for (const s of all.slice(0, 10)) {
            const label = s.sessionId === session.meta.sessionId ? " ← current" : "";
            output.write(
              `  ${s.sessionId.slice(0, 8)}  ${s.cwd}  ${s.entryCount} entries${label}\n`,
            );
          }
        }
        break;
      }

      case "resume":
        try {
          const loaded = sessionManager.load(command.sessionId);
          output.write(
            `Switched to session ${command.sessionId} (${loaded.getPath().length} entries).\n`,
          );
          output.write("Use the --resume flag when starting dhara to open a previous session.\n");
        } catch {
          output.write(`Session not found: ${command.sessionId}\n`);
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
            output.write(`Reload error: ${msg}\n`);
          }
        } else {
          output.write("Reload not available in this mode.\n");
        }
        break;

      case "skills":
        output.write(`\nSkills (${currentSkills.length}):\n`);
        if (currentSkills.length === 0) {
          output.write("  (no skills loaded)\n");
        } else {
          for (const s of currentSkills) {
            output.write(`  ${s.name}  — ${s.description}`);
            if (s.source === "global") {
              output.write("  [global]");
            }
            output.write("\n");
          }
        }
        output.write("\n");
        break;

      case "status": {
        output.write("\nDhara Status:\n");
        output.write(`  Provider: ${providerName}/${modelId}\n`);
        output.write(`  Working directory: ${cwd}\n`);
        output.write(`  Max iterations: ${currentMaxIterations}\n`);

        if (currentProjectConfigDir) {
          output.write(`  Project config: ${currentProjectConfigDir}/settings.json\n`);
        } else {
          output.write("  Project config: none\n");
        }

        output.write(`  Context files (${currentContextFiles.length}):\n`);
        if (currentContextFiles.length === 0) {
          output.write("    (none)\n");
        } else {
          for (const file of currentContextFiles) {
            const label = file.source === "global" ? "global ~/.dhara" : "project";
            const lineCount = file.content.split("\n").length;
            output.write(`    ${file.path}  (${label}, ${lineCount} lines)\n`);
          }
        }

        output.write(`  Skills (${currentSkills.length}):\n`);
        if (currentSkills.length === 0) {
          output.write("    (none)\n");
        } else {
          for (const s of currentSkills) {
            output.write(`    ${s.name}  — ${s.description}`);
            if (s.source === "global") output.write("  [global]");
            output.write("\n");
          }
        }

        output.write(`  Session: ${session.meta.sessionId}\n`);
        output.write("\n");
        break;
      }

      case "help":
        output.write("\nCommands:\n");
        output.write("  /exit      Exit the REPL\n");
        output.write("  /quit      Alias for /exit\n");
        output.write("  /save      Save the current session\n");
        output.write("  /list      List saved sessions\n");
        output.write("  /resume    Resume a session by ID\n");
        output.write(
          "  /reload    Reload AGENTS.md, CLAUDE.md, .dhara/settings.json, and skills\n",
        );
        output.write("  /skills    List available skills\n");
        output.write("  /status    Show current configuration, context files, and skills\n");
        output.write("  /help      Show this help\n");
        output.write("\n");
        break;

      case "prompt": {
        if (command.text === "") break; // Skip empty input

        // Create AbortController for this prompt
        const abortController = new AbortController();
        currentAbortController = abortController;

        try {
          await agent.run(command.text, abortController.signal);

          // Print the latest assistant response
          const path = session.getPath();
          for (let i = path.length - 1; i >= 0; i--) {
            const entry = session.getEntry(path[i]);
            if (entry && entry.type === "entry" && entry.role === "assistant") {
              const textContent = entry.content
                .filter((c) => c.type === "text" && c.text)
                .map((c) => c.text)
                .join("\n");
              if (textContent) {
                output.write(`${textContent}\n`);
              }
              break;
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          output.write(`\nError: ${msg}\n`);
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
  | { type: "skills" };

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
