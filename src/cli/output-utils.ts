import type { Writable } from "node:stream";
import type { EventBus } from "../core/events.js";

// ── ANSI color constants ─────────────────────────────────────────────

export const ANSI = {
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

// ── TTY detection ─────────────────────────────────────────────────────

/**
 * Whether ANSI colors should be used for the given stream.
 * Returns true only when the stream is a TTY.
 */
export function useColor(stream: Writable): boolean {
  return "isTTY" in stream && (stream as { isTTY: boolean }).isTTY === true;
}

/**
 * Wrap text in an ANSI escape sequence if colors are enabled.
 * Returns plain text when `enabled` is false.
 */
export function tag(color: string, text: string, enabled: boolean): string {
  if (!enabled) return text;
  return `${color}${text}${ANSI.reset}`;
}

/** Shorthand for dim text. */
export function dim(text: string, enabled: boolean): string {
  return tag(ANSI.dim, text, enabled);
}

/** Shorthand for bold text. */
export function bold(text: string, enabled: boolean): string {
  return tag(ANSI.bold, text, enabled);
}

// ── Tool argument formatting ─────────────────────────────────────────

/**
 * Format a tool's arguments for display in a compact way.
 */
export function formatToolArgs(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "read":
    case "write":
    case "edit": {
      return String(args.path ?? "");
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

// ── Diff formatting ───────────────────────────────────────────────────

/**
 * Create a simplified coloured diff for terminal display.
 * Expects the standard unified diff format from edit.ts's generateDiff.
 */
export function formatDiff(diff: string, enabled: boolean): string {
  if (!diff) return "";

  const lines = diff.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    if (line.startsWith("+++") || line.startsWith("---")) {
      result.push(tag(ANSI.dim, line, enabled));
    } else if (line.startsWith("@@")) {
      result.push(tag(ANSI.cyan, line, enabled));
    } else if (line.startsWith("+")) {
      result.push(tag(ANSI.green, line, enabled));
    } else if (line.startsWith("-")) {
      result.push(tag(ANSI.red, line, enabled));
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}

// ── Event payload types (inferred from agent-loop.ts) ─────────────────

export interface MessageDeltaPayload {
  entry: { id: string };
  content: { type: string; text?: string }[];
  type: string;
}

export interface ToolStartPayload {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolEndPayload {
  toolCallId: string;
  toolName: string;
  result: {
    content: { type: string; text?: string }[];
    metadata?: Record<string, unknown>;
    isError?: boolean;
  };
  isError: boolean;
}

export interface AgentCancelledPayload {
  reason?: unknown;
}

export interface AgentErrorPayload {
  error: string;
  iteration: number;
}

// ── Event subscriber helpers ──────────────────────────────────────────

/**
 * Configuration for {@link subscribePromptEvents}.
 */
export interface PromptEventConfig {
  /** Output stream for assistant text. */
  output: Writable;
  /** Error stream for tool progress. */
  errorOutput: Writable;
  /** Whether ANSI colors are enabled. */
  colorEnabled: boolean;
}

/**
 * Subscribe event handlers for a per-prompt EventBus.
 *
 * Sets up streaming text output, tool progress, cancellation, and error
 * display. Tool depth tracking is handled internally.
 *
 * @returns An unsubscribe function that removes all subscriptions.
 */
export function subscribePromptEvents(eventBus: EventBus, config: PromptEventConfig): () => void {
  const { output, errorOutput, colorEnabled } = config;
  let toolDepth = 0;

  const unsubs: (() => void)[] = [];

  // Streaming text output
  unsubs.push(
    eventBus.subscribe<MessageDeltaPayload>("message:delta", (payload) => {
      for (const block of payload.content) {
        if (block.type === "text" && block.text) {
          output.write(block.text);
        }
      }
      return { action: "allow" };
    }),
  );

  // Response complete — add trailing newline
  unsubs.push(
    eventBus.subscribe("message:end", () => {
      output.write("\n");
      return { action: "allow" };
    }),
  );

  // Tool execution start
  unsubs.push(
    eventBus.subscribe<ToolStartPayload>("tool:execution_start", (payload) => {
      toolDepth++;
      const prefix = "  ".repeat(toolDepth);
      const args = formatToolArgs(payload.toolName, payload.args);
      const toolLabel = tag(ANSI.cyan, `[${payload.toolName}]`, colorEnabled);
      errorOutput.write(`${prefix}${toolLabel} ${dim(args, colorEnabled)}\n`);
      return { action: "allow" };
    }),
  );

  // Tool execution end
  unsubs.push(
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
        `${prefix}${tag(statusColor, status, colorEnabled)} ${dim(payload.toolName, colorEnabled)}\n`,
      );
      return { action: "allow" };
    }),
  );

  // Tool cancelled
  unsubs.push(
    eventBus.subscribe("tool:call_cancelled", () => {
      toolDepth = Math.max(0, toolDepth - 1);
      errorOutput.write(`${tag(ANSI.yellow, "  Cancelled", colorEnabled)}\n`);
      return { action: "allow" };
    }),
  );

  // Agent cancelled
  unsubs.push(
    eventBus.subscribe<AgentCancelledPayload>("agent:cancelled", () => {
      errorOutput.write(`\n${tag(ANSI.yellow, "  Cancelled by user", colorEnabled)}\n`);
      return { action: "allow" };
    }),
  );

  // Agent error
  unsubs.push(
    eventBus.subscribe<AgentErrorPayload>("agent:error", (payload) => {
      errorOutput.write(
        `\n${tag(ANSI.red, `  Error (iteration ${payload.iteration})`, colorEnabled)}: ${payload.error}\n`,
      );
      return { action: "allow" };
    }),
  );

  // Reasoning/thinking content display
  unsubs.push(
    eventBus.subscribe<{ text: string }>("message:reasoning", (payload) => {
      if (payload.text) {
        errorOutput.write(tag(ANSI.dim, payload.text, colorEnabled));
      }
      return { action: "allow" };
    }),
  );

  // Token usage after each response (agent:response has usage data)
  unsubs.push(
    eventBus.subscribe<{ usage?: { input: number; output: number } }>(
      "agent:response",
      (payload) => {
        if (payload.usage) {
          errorOutput.write(
            `${dim("  Tokens:", colorEnabled)} ${tag(ANSI.grey, `${payload.usage.input.toLocaleString()} in / ${payload.usage.output.toLocaleString()} out`, colorEnabled)}\n`,
          );
        }
        return { action: "allow" };
      },
    ),
  );

  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
}
