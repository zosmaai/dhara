import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { createAgentLoop } from "../core/agent-loop.js";
import type { ContextFile } from "../core/context-loader.js";
import { createEventBus } from "../core/events.js";
import type { Provider } from "../core/provider.js";
import { type Sandbox, createSandbox } from "../core/sandbox.js";
import type { SessionManager } from "../core/session-manager.js";
import type { Skill } from "../core/skills.js";
import { createStandardToolMap } from "../std/tools/index.js";

// ── ANSI color helpers ────────────────────────────────────────────────

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  grey: "\x1b[90m",
} as const;

function useColor(stream: Writable): boolean {
  return "isTTY" in stream && (stream as { isTTY: boolean }).isTTY === true;
}

/** Wrap text in an ANSI escape sequence if colors are enabled. */
function tag(color: string, text: string, enabled: boolean): string {
  if (!enabled) return text;
  return `${color}${text}${ANSI.reset}`;
}

// ── Event payload types (inferred from agent-loop.ts) ─────────────────

interface MessageDeltaPayload {
  entry: { id: string };
  content: { type: string; text?: string }[];
  type: string;
}

interface ToolStartPayload {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

interface ToolEndPayload {
  toolCallId: string;
  toolName: string;
  result: {
    content: { type: string; text?: string }[];
    metadata?: Record<string, unknown>;
    isError?: boolean;
  };
  isError: boolean;
}

interface AgentCancelledPayload {
  reason?: unknown;
}

interface AgentErrorPayload {
  error: string;
  iteration: number;
}

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
}

/**
 * Format a tool's arguments for display in a compact way.
 */
function formatToolArgs(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "read":
    case "write":
    case "edit": {
      const path = String(args.path ?? "");
      return path;
    }
    case "grep":
    case "search": {
      const pattern = String(args.pattern ?? args.query ?? "");
      return pattern.length > 60 ? `${pattern.slice(0, 60)}…` : pattern;
    }
    case "ls": {
      return String(args.path ?? ".");
    }
    case "bash": {
      const cmd = String(args.command ?? "");
      return cmd.length > 80 ? `${cmd.slice(0, 80)}…` : cmd;
    }
    default:
      return JSON.stringify(args).slice(0, 80);
  }
}

/**
 * Create a simplified coloured diff for terminal display.
 * Expects the standard unified diff format from edit.ts's generateDiff.
 */
function formatDiff(diff: string, enabled: boolean): string {
  if (!diff) return "";

  const lines = diff.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    if (line.startsWith("+++") || line.startsWith("---")) {
      // File header — dim
      result.push(tag(ANSI.dim, line, enabled));
    } else if (line.startsWith("@@")) {
      // Hunk header — cyan
      result.push(tag(ANSI.cyan, line, enabled));
    } else if (line.startsWith("+")) {
      // Added line — green
      result.push(tag(ANSI.green, line, enabled));
    } else if (line.startsWith("-")) {
      // Removed line — red
      result.push(tag(ANSI.red, line, enabled));
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
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
  const tools = createStandardToolMap({ cwd, sandbox });

  // ── Create initial system prompt ───────────────────────────────────
  const defaultPrompt = `You are Dhara, an AI coding agent operating in ${cwd}. You have access to file operations (read, write, edit, ls, grep) and shell commands (bash). Be concise and helpful.`;
  let currentSystemPrompt = systemPrompt ?? defaultPrompt;
  let currentMaxIterations = maxIterations;
  let currentContextFiles = config.contextFiles ?? [];
  let currentSkills = config.skills ?? [];
  let currentProjectConfigDir = config.projectConfigDir;

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
        output.write("\n");
        break;

      case "prompt": {
        if (command.text === "") break; // Skip empty input

        // Create AbortController for this prompt
        const abortController = new AbortController();
        currentAbortController = abortController;

        // Create event bus for streaming
        const eventBus = createEventBus();
        let toolDepth = 0;

        // Subscribe to message:delta for streaming text output
        eventBus.subscribe<MessageDeltaPayload>("message:delta", (payload) => {
          for (const block of payload.content) {
            if (block.type === "text" && block.text) {
              output.write(block.text);
            }
          }
          return { action: "allow" };
        });

        // Subscribe to message:start — new response beginning
        eventBus.subscribe<MessageDeltaPayload>("message:start", () => {
          // No-op: first text will come through deltas
          return { action: "allow" };
        });

        // Subscribe to message:end — response complete
        eventBus.subscribe("message:end", () => {
          output.write("\n");
          return { action: "allow" };
        });

        // Subscribe to tool:execution_start for tool progress
        eventBus.subscribe<ToolStartPayload>("tool:execution_start", (payload) => {
          toolDepth++;
          const prefix = "  ".repeat(toolDepth);
          const args = formatToolArgs(payload.toolName, payload.args);
          const toolLabel = tag(ANSI.cyan, `[${payload.toolName}]`, colorEnabled);
          errorOutput.write(`${prefix}${toolLabel} ${dim(args)}\n`);
          return { action: "allow" };
        });

        // Subscribe to tool:execution_end for tool results
        eventBus.subscribe<ToolEndPayload>("tool:execution_end", (payload) => {
          const prefix = "  ".repeat(toolDepth);
          toolDepth = Math.max(0, toolDepth - 1);

          // Check for diff metadata from edit tool
          const diff = payload.result?.metadata?.diff as string | undefined;
          if (diff) {
            const formatted = formatDiff(diff, colorEnabled);
            if (formatted) {
              errorOutput.write(`${formatted}\n`);
            }
          }

          // Show tool result summary
          const isError = payload.isError ?? payload.result?.isError ?? false;
          const statusColor = isError ? ANSI.red : ANSI.green;
          const status = isError ? "✗" : "✓";
          errorOutput.write(
            `${prefix}${tag(statusColor, status, colorEnabled)} ${dim(payload.toolName)}\n`,
          );
          return { action: "allow" };
        });

        // Subscribe to tool:call_cancelled
        eventBus.subscribe("tool:call_cancelled", () => {
          toolDepth = Math.max(0, toolDepth - 1);
          errorOutput.write(`${tag(ANSI.yellow, "  Cancelled", colorEnabled)}\n`);
          return { action: "allow" };
        });

        // Subscribe to agent:cancelled
        eventBus.subscribe<AgentCancelledPayload>("agent:cancelled", () => {
          errorOutput.write(`\n${tag(ANSI.yellow, "  Cancelled by user", colorEnabled)}\n`);
          return { action: "allow" };
        });

        // Subscribe to agent:error
        eventBus.subscribe<AgentErrorPayload>("agent:error", (payload) => {
          errorOutput.write(
            `\n${tag(ANSI.red, `  Error (iteration ${payload.iteration})`, colorEnabled)}: ${payload.error}\n`,
          );
          return { action: "allow" };
        });

        // Re-create agent loop with event bus for this prompt
        const streamingAgent = createAgentLoop({
          provider,
          session,
          tools,
          systemPrompt: currentSystemPrompt,
          maxIterations: currentMaxIterations,
          eventBus,
        });

        try {
          await streamingAgent.run(command.text, abortController.signal);
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
