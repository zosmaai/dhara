import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { createAgentLoop } from "../core/agent-loop.js";
import type { Provider } from "../core/provider.js";
import { type Sandbox, createSandbox } from "../core/sandbox.js";
import type { SessionManager } from "../core/session-manager.js";
import { createStandardToolMap } from "../std/tools/index.js";

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

  // ── Create agent loop ──────────────────────────────────────────────
  const agent = createAgentLoop({
    provider,
    session,
    tools,
    systemPrompt:
      systemPrompt ??
      `You are Dhara, an AI coding agent operating in ${cwd}. You have access to file operations (read, write, edit, ls, grep) and shell commands (bash). Be concise and helpful.`,
    maxIterations,
  });

  // ── Print header ───────────────────────────────────────────────────
  const mode = resumeSessionId ? "Resuming" : "Started";
  output.write(`\n  dhara  •  ${providerName}/${modelId}  •  ${cwd}\n`);
  output.write(`  ${mode} session ${session.meta.sessionId}\n`);
  output.write(`  ${resumeSessionId ? `Resumed from ${session.getPath().length} entries` : ""}\n`);
  output.write("\n");

  // ── Readline loop ──────────────────────────────────────────────────
  const rl = createInterface({ input, terminal: false });

  for await (const line of rl) {
    const command = parseInput(line);

    switch (command.type) {
      case "exit":
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

      case "help":
        output.write("\nCommands:\n");
        output.write("  /exit      Exit the REPL\n");
        output.write("  /quit      Alias for /exit\n");
        output.write("  /save      Save the current session\n");
        output.write("  /list      List saved sessions\n");
        output.write("  /resume    Resume a session by ID\n");
        output.write("  /help      Show this help\n");
        output.write("\n");
        break;

      case "prompt":
        if (command.text === "") break; // Skip empty input

        try {
          await agent.run(command.text);

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
        }
        break;
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
  | { type: "resume"; sessionId: string };

const SLASH_COMMANDS: Record<string, (arg: string) => ReplCommand | null> = {
  exit: () => ({ type: "exit" }),
  quit: () => ({ type: "exit" }),
  save: () => ({ type: "save" }),
  list: () => ({ type: "list" }),
  help: () => ({ type: "help" }),
  resume: (arg) => (arg ? { type: "resume", sessionId: arg } : null),
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
