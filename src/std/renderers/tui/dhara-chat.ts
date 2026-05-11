/**
 * DharaChat — the main TUI component for the dhara coding agent.
 *
 * Composes: chat messages, editor input, status bar, and loader.
 * Subscribes to the agent event bus for streaming tool progress.
 *
 * This is the application-specific UI glue. The TUI framework
 * (tui.ts, terminal.ts, components/) is generic and reusable.
 */
import type { Component, FocusableComponent } from "./components/component.js";
import { ChatMessage, type ChatMessageConfig } from "./components/chat-message.js";
import { Editor, type EditorConfig } from "./components/editor.js";
import { StatusBar, type StatusBarConfig } from "./components/status-bar.js";
import { Loader } from "./components/loader.js";
import type { Theme } from "./theme.js";
import type { EventBus, HookResult } from "../../../core/events.js";

/** Helper: create a non-blocking hook result. */
const allow = (): HookResult => ({ action: "allow" });

export interface DharaChatConfig {
  theme: Theme;
  /** Event bus for streaming tool progress / agent events. */
  eventBus?: EventBus;
  /** Called when user submits a prompt. */
  onSubmit: (text: string) => void;
  /** Editor configuration overrides. */
  editor?: Partial<EditorConfig>;
  /** Status bar configuration. */
  status?: StatusBarConfig;
}

/**
 * Root TUI component for the dhara coding agent.
 *
 * Layout:
 * ```
 * ┌─────────────────────────────────────┐
 * │  Chat messages (scrollable)         │
 * │  ...                                │
 * ├─────────────────────────────────────┤
 * │  > User input (editor)              │
 * ├─────────────────────────────────────┤
 * │  model/session/tokens (status bar)  │
 * └─────────────────────────────────────┘
 * ```
 */
export class DharaChat implements Component, FocusableComponent {
  private theme: Theme;

  // ── Sub-components ──
  private messages: ChatMessageConfig[] = [];
  private editor: Editor;
  private statusBar: StatusBar;
  private loader: Loader;
  /** Pending streaming messages (in-progress assistant response). */
  private streamingMessage: ChatMessage | null = null;
  private streamingContent = "";
  /** Tool output buffers (tool name → accumulated output). */
  private toolBuffers: Map<string, string> = new Map();
  /** Active tool calls (tool call ID → tool name). */
  private activeToolCalls: Map<string, { name: string; startedAt: number }> = new Map();

  /** Cleanup functions for event subscriptions. */
  private unsubscribes: (() => void)[] = [];

  focused = false;

  /** Called by the TUI engine to request re-render. */
  onRenderRequest?: () => void;

  constructor(config: DharaChatConfig) {
    this.theme = config.theme;

    this.editor = new Editor(this.theme, {
      prompt: "> ",
      placeholder: "Ask anything... (/help for commands)",
      ...config.editor,
    });

    this.statusBar = new StatusBar(this.theme, config.status ?? {});
    this.loader = new Loader(this.theme, { text: "Thinking..." });

    // Wire editor submit
    this.editor.onSubmit = (text: string) => {
      if (text.trim().startsWith("/")) {
        this.handleSlashCommand(text.trim());
      } else {
        // Immediately add user message and submit
        this.messages.push({ role: "user", content: text });
        config.onSubmit(text);
      }
    };

    // Wire event bus
    if (config.eventBus) {
      this.subscribeEvents(config.eventBus);
    }
  }

  /** Release event subscriptions. Call before destroying. */
  dispose(): void {
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];
    this.loader.stop();
  }

  // ── Component interface ──

  render(width: number): string[] {
    const result: string[] = [];
    const availableHeight = Math.max(3, width > 80 ? Math.floor(width / 2) : 10);

    // ── Messages area ──
    const messageLines: string[] = [];
    for (const msg of this.messages) {
      const cm = new ChatMessage(this.theme, msg);
      const rendered = cm.render(width - 2);
      for (const line of rendered) {
        messageLines.push(line);
      }
      messageLines.push(""); // Spacing
    }

    // Streaming assistant message
    if (this.streamingMessage) {
      const rendered = this.streamingMessage.render(width - 2);
      for (const line of rendered) {
        messageLines.push(line);
      }
    }

    // Active tool calls with output
    for (const [id, tc] of this.activeToolCalls) {
      const buf = this.toolBuffers.get(id);
      if (buf) {
        const toolStyle = this.theme.resolve("tool.name");
        const outputStyle = this.theme.resolve("tool.output");
        const toolLabel = `${toolStyle.prefix}[${tc.name}]${toolStyle.reset}`;
        const outputLines = buf.slice(-200).split("\n").slice(-3);
        for (const line of outputLines) {
          messageLines.push(`${toolLabel} ${outputStyle.prefix}${line}${outputStyle.reset}`);
        }
      }
    }

    // Only show recent messages
    const visibleMessages = messageLines.slice(-availableHeight);

    for (const line of visibleMessages) {
      result.push(line);
    }

    // Fill remaining space
    const fillNeeded = availableHeight - visibleMessages.length;
    for (let i = 0; i < fillNeeded; i++) {
      result.push("");
    }

    // ── Spacer + Editor ──
    if (this.messages.length > 0) {
      result.push(this.theme.apply("dim", "─".repeat(width)));
    }
    for (const line of this.editor.render(width)) {
      result.push(line);
    }

    // ── Status bar ──
    for (const line of this.statusBar.render(width)) {
      result.push(line);
    }

    return result;
  }

  handleInput(data: string): boolean {
    return this.editor.handleInput(data);
  }

  invalidate(): void {
    this.editor.invalidate();
    this.statusBar.invalidate();
    this.streamingMessage?.invalidate();
  }

  getCursorPosition(): { line: number; column: number } | null {
    // Calculate: messages area height + spacer + editor cursor
    // For simplicity, return null and let editor handle cursor
    return this.editor.getCursorPosition();
  }

  // ── Public API ──

  /** Add a message to the chat history. */
  addMessage(config: ChatMessageConfig): void {
    this.messages.push(config);
  }

  /** Start/resume streaming assistant response. */
  appendDelta(delta: string): void {
    this.streamingContent += delta;
    if (!this.streamingMessage) {
      this.streamingMessage = new ChatMessage(this.theme, {
        role: "assistant",
        content: this.streamingContent,
      });
    } else {
      this.streamingMessage.update(this.streamingContent);
    }
  }

  /** Update streaming reasoning text. */
  appendReasoning(text: string): void {
    if (this.streamingMessage) {
      this.streamingMessage.updateReasoning(text);
    }
  }

  /** Finish the streaming assistant message (moves to persistent). */
  finishStream(): void {
    if (this.streamingContent) {
      this.messages.push({ role: "assistant", content: this.streamingContent });
    }
    this.streamingMessage = null;
    this.streamingContent = "";
  }

  /** Start a tool call indicator. */
  startToolCall(id: string, name: string): void {
    this.activeToolCalls.set(id, { name, startedAt: Date.now() });
  }

  /** Append tool output. */
  appendToolOutput(id: string, output: string): void {
    const existing = this.toolBuffers.get(id) ?? "";
    this.toolBuffers.set(id, existing + output);
  }

  /** Finish a tool call. */
  finishToolCall(id: string): void {
    const tc = this.activeToolCalls.get(id);
    const output = this.toolBuffers.get(id);
    if (tc && output !== undefined) {
      this.messages.push({
        role: "tool",
        content: output.slice(-500),
        toolCall: tc.name,
      });
    }
    this.activeToolCalls.delete(id);
    this.toolBuffers.delete(id);
  }

  /** Update status bar. */
  updateStatus(config: Partial<StatusBarConfig>): void {
    this.statusBar.update(config);
    this.onRenderRequest?.();
  }

  /** Focus the editor for input. */
  focusEditor(): void {
    this.focused = true;
    this.editor.focused = true;
  }

  /** Add a system message (errors, notifications). */
  addSystemMessage(text: string, isError = false): void {
    this.messages.push({
      role: isError ? "error" : "system",
      content: text,
    });
  }

  // ── Slash commands ──

  private handleSlashCommand(input: string): void {
    const parts = input.split(/\s+/);
    const cmd = parts[0]?.toLowerCase();

    switch (cmd) {
      case "/help":
        this.showHelp();
        break;
      case "/clear":
        this.messages = [];
        break;
      case "/exit":
      case "/quit":
        this.addSystemMessage("Use Ctrl+C to exit.");
        break;
      default:
        this.addSystemMessage(
          `Unknown command: ${cmd}. Type /help for available commands.`,
          true,
        );
    }
  }

  private showHelp(): void {
    const helpLines = [
      "Available commands:",
      "  /help       Show this help",
      "  /clear      Clear conversation",
      "  /exit       Exit dhara",
      "",
      "Keyboard shortcuts:",
      "  ↑/↓         Browse command history",
      "  Shift+Enter  New line",
      "  Enter        Submit",
      "  Ctrl+A/E     Line start/end",
      "  Ctrl+K       Delete to end of line",
      "  Ctrl+U       Delete line",
      "  Ctrl+W       Delete word",
      "  Alt+B/F      Word back/forward",
      "  Ctrl+C       Cancel current operation",
    ];
    this.messages.push({ role: "system", content: helpLines.join("\n") });
  }

  // ── Event bus subscriptions ──

  private subscribeEvents(bus: EventBus): void {
    // Agent started processing
    this.unsubscribes.push(
      bus.subscribe("agent:start", () => {
        this.statusBar.update({ state: "thinking" });
        this.onRenderRequest?.();
        return allow();
      }),
    );

    // Text delta (streaming)
    this.unsubscribes.push(
      bus.subscribe("message:delta", (event: unknown) => {
        const e = event as { delta: string };
        this.appendDelta(e.delta);
        this.onRenderRequest?.();
        return allow();
      }),
    );

    // Reasoning/thinking
    this.unsubscribes.push(
      bus.subscribe("message:reasoning", (event: unknown) => {
        const e = event as { text: string };
        this.appendReasoning(e.text);
        this.onRenderRequest?.();
        return allow();
      }),
    );

    // Tool call started
    this.unsubscribes.push(
      bus.subscribe("tool:start", (event: unknown) => {
        const e = event as { id: string; name: string };
        this.startToolCall(e.id, e.name);
        this.onRenderRequest?.();
        return allow();
      }),
    );

    // Tool progress (streaming output)
    this.unsubscribes.push(
      bus.subscribe("tool:progress", (event: unknown) => {
        const e = event as { id: string; output: string };
        this.appendToolOutput(e.id, e.output);
        this.onRenderRequest?.();
        return allow();
      }),
    );

    // Tool call finished
    this.unsubscribes.push(
      bus.subscribe("tool:end", (event: unknown) => {
        const e = event as { id: string };
        this.finishToolCall(e.id);
        this.statusBar.update({ state: "streaming" });
        this.onRenderRequest?.();
        return allow();
      }),
    );

    // Agent finished
    this.unsubscribes.push(
      bus.subscribe("agent:end", (event: unknown) => {
        this.finishStream();
        this.loader.stop();
        this.statusBar.update({ state: "idle" });
        const e = event as {
          result?: { content?: string; tokens?: { input: number; output: number } };
        };
        if (e?.result?.tokens) {
          this.statusBar.update({ tokens: e.result.tokens });
        }
        this.onRenderRequest?.();
        return allow();
      }),
    );

    // Agent error
    this.unsubscribes.push(
      bus.subscribe("agent:error", (event: unknown) => {
        this.loader.stop();
        this.statusBar.update({ state: "error" });
        const e = event as { error: Error };
        this.addSystemMessage(`Error: ${e.error.message}`, true);
        this.onRenderRequest?.();
        return allow();
      }),
    );

    // Agent cancelled
    this.unsubscribes.push(
      bus.subscribe("agent:cancelled", () => {
        this.loader.stop();
        this.statusBar.update({ state: "idle" });
        this.addSystemMessage("Cancelled.");
        this.onRenderRequest?.();
        return allow();
      }),
    );
  }
}
