import type { EventBus, HookResult } from "../../../core/events.js";
import { ChatMessage, type ChatMessageConfig } from "./components/chat-message.js";
/**
 * DharaChat — the main TUI component for the dhara coding agent.
 *
 * Layout (height-aware, pi-tui inspired):
 * ```
 * ┌──────────────────────────────────────────┐
 * │  ⚡ dhara v0.1.0                          │  ← branded header
 * │  The Agent Protocol Standard              │
 * │                                           │
 * │  opencode-go/deepseek-v4-flash            │
 * │  /home/arjun/code/project                 │
 * │  Session abc12345    Type /help           │
 * └──────────────────────────────────────────┘
 *
 *   You: List the files
 *
 *   Dhara: Here are the files:               ← chat messages
 *   src/index.ts                                (scrollable)
 *   src/main.ts
 *
 *   [bash] $ ls -la                            ← tool progress
 *   total 24                                   (styled + diffs)
 *   -rw-r--r-- 1 user user 1234 index.ts
 *
 * ───────────────────────────────────────────
 *   >  User types here...█                    ← editor (multiline
 *                                                with Shift+Enter)
 * ───────────────────────────────────────────
 *   ● opencode-go/deepseek-v4-flash ↑1k ↓450  ← status bar
 * ```
 */
import type { Component, FocusableComponent } from "./components/component.js";
import { visibleWidth } from "./components/component.js";
import { Editor, type EditorConfig } from "./components/editor.js";
import { StatusBar, type StatusBarConfig } from "./components/status-bar.js";
import type { Theme } from "./theme.js";

const allow = (): HookResult => ({ action: "allow" });

export interface DharaChatConfig {
  theme: Theme;
  onSubmit: (text: string) => void;
  onExit: () => void;
  editor?: Partial<EditorConfig>;
  status?: StatusBarConfig;
  version?: string;
}

export class DharaChat implements Component, FocusableComponent {
  private theme: Theme;
  private cfg: DharaChatConfig;

  // ── Messages ──
  private messages: ChatMessageConfig[] = [];
  private streamingContent = "";
  private streamingReasoning = "";

  // ── Tool state ──
  private toolBuffers = new Map<string, string>();
  private activeToolCalls = new Map<string, { name: string; input?: string; startedAt: number }>();

  // ── Sub-components ──
  private editor: Editor;
  private statusBar: StatusBar;

  // ── Event bus ──
  private unsubscribes: (() => void)[] = [];

  // ── Exit tracking ──
  private ctrlCPressed = false;
  private ctrlCTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Processing state ──
  private processing = false;

  focused = false;
  onRenderRequest?: () => void;

  constructor(config: DharaChatConfig) {
    this.theme = config.theme;
    this.cfg = config;

    this.editor = new Editor(this.theme, {
      prompt: "> ",
      placeholder: "Ask anything... (/help for commands)",
      ...config.editor,
    });

    this.statusBar = new StatusBar(this.theme, config.status ?? {});

    this.editor.onSubmit = (text: string) => {
      if (this.processing) return;
      if (text.trim().startsWith("/")) {
        this.handleSlashCommand(text.trim());
      } else {
        this.messages.push({ role: "user", content: text });
        this.processing = true;
        this.statusBar.update({ state: "thinking" });
        this.onRenderRequest?.();
        config.onSubmit(text);
      }
    };
  }

  // ── Event bus ─────────────────────────────────────────────────────

  setEventBus(bus: EventBus): void {
    this.disposeSubscriptions();
    this.subscribe(bus);
  }

  private disposeSubscriptions(): void {
    for (const u of this.unsubscribes) u();
    this.unsubscribes = [];
  }

  dispose(): void {
    this.disposeSubscriptions();
    if (this.ctrlCTimer) clearTimeout(this.ctrlCTimer);
  }

  // ── Render ────────────────────────────────────────────────────────

  render(width: number, _height?: number): string[] {
    const out: string[] = [];

    // 1. Header (fixed height)
    for (const l of this.renderHeader(width)) out.push(l);

    // 2. Messages (all of them — TUI clips to viewport)
    for (const l of this.renderMessages(width)) out.push(l);

    // 3. Spacer
    out.push(this.theme.apply("dim", "─".repeat(width)));

    // 4. Editor
    for (const l of this.editor.render(width)) out.push(l);

    // 5. Status bar
    for (const l of this.statusBar.render(width)) out.push(l);

    return out;
  }

  // ── Header ────────────────────────────────────────────────────────

  private renderHeader(width: number): string[] {
    const border = this.theme.resolve("panel.border");
    const accent = this.theme.resolve("accent");
    const dim = this.theme.resolve("dim");
    const bold = this.theme.resolve("bold");
    const muted = this.theme.resolve("muted");

    const version = this.cfg.version ?? "v0.1.0";
    const provider = this.cfg.status?.provider ?? "?";
    const model = this.cfg.status?.model ?? "?";
    const cwd = this.cfg.status?.cwd ?? "?";
    const sid = this.cfg.status?.sessionId ?? "?";

    const w = width - 4; // indented 2 from left
    const h = "─";
    const B = border.prefix;
    const R = border.reset;

    const row = (content: string, plainW: number) =>
      `${B}  ${content}${" ".repeat(Math.max(0, w - plainW))}  ${R}`;

    return [
      `  ${B}┌${h.repeat(w)}┐${R}`,
      row(
        `${accent.prefix}⚡${accent.reset} ${bold.prefix}dhara${bold.reset} ${dim.prefix}${version}${dim.reset}`,
        visibleWidth(`⚡ dhara ${version}`),
      ),
      row(
        `${dim.prefix}The Agent Protocol Standard${dim.reset}`,
        visibleWidth("The Agent Protocol Standard"),
      ),
      row("", 0),
      row(
        `${bold.prefix}${provider}${bold.reset}/${bold.prefix}${model}${bold.reset}`,
        visibleWidth(`${provider}/${model}`),
      ),
      row(`${dim.prefix}${cwd}${dim.reset}`, visibleWidth(cwd)),
      row(
        `${muted.prefix}Session ${sid}${muted.reset}  ${dim.prefix}Type /help for commands${dim.reset}`,
        visibleWidth(`Session ${sid}  Type /help for commands`),
      ),
      `  ${B}└${h.repeat(w)}┘${R}`,
    ];
  }

  // ── Messages ──────────────────────────────────────────────────────

  private renderMessages(width: number): string[] {
    const lines: string[] = [];

    // Past messages
    for (const msg of this.messages) {
      for (const l of new ChatMessage(this.theme, msg).render(width)) lines.push(l);
      lines.push("");
    }

    // Streaming
    if (this.streamingContent) {
      const msgs = new ChatMessage(this.theme, {
        role: "assistant",
        content: this.streamingContent,
        reasoning: this.streamingReasoning || undefined,
      });
      for (const l of msgs.render(width)) lines.push(l);
    }

    // Active tool calls with output
    for (const [, tc] of this.activeToolCalls) {
      const style = this.theme.resolve("tool.name");
      const dim = this.theme.resolve("dim");

      // Tool header
      const input = tc.input ? ` ${dim.prefix}${tc.input.slice(0, 80)}${dim.reset}` : "";
      lines.push(`  ${style.prefix}[${tc.name}]${style.reset}${input}`);

      // Tool output (last few lines, with diff coloring)
      const buf = this.toolBuffers.get(tc.name) ?? "";
      const bufLines = buf.split("\n").slice(-6);
      for (const l of bufLines) {
        const rendered = this.renderToolLine(l, width);
        lines.push(`    ${rendered}`);
      }
    }

    return lines;
  }

  /** Render a single line of tool output with diff coloring. */
  private renderToolLine(line: string, maxW: number): string {
    const add = this.theme.resolve("tool.diff.add");
    const rem = this.theme.resolve("tool.diff.remove");
    const out = this.theme.resolve("tool.output");

    if (line.startsWith("+")) return `${add.prefix}${line.slice(0, maxW)}${add.reset}`;
    if (line.startsWith("-")) return `${rem.prefix}${line.slice(0, maxW)}${rem.reset}`;
    return `${out.prefix}${line.slice(0, maxW)}${out.reset}`;
  }

  // ── Input handling ────────────────────────────────────────────────

  handleInput(data: string): boolean {
    if (data === "\x03") return this.handleCtrlC();
    if (data === "\x04") {
      if (this.editor.getText() === "") {
        this.cfg.onExit();
        return true;
      }
    }
    this.ctrlCPressed = false;
    if (this.ctrlCTimer) {
      clearTimeout(this.ctrlCTimer);
      this.ctrlCTimer = null;
    }
    return this.editor.handleInput(data);
  }

  private handleCtrlC(): boolean {
    if (this.processing) {
      this.processing = false;
      this.finishStream();
      this.statusBar.update({ state: "idle" });
      this.addSystemMessage("Cancelled.");
      this.onRenderRequest?.();
      return true;
    }
    if (!this.ctrlCPressed) {
      this.ctrlCPressed = true;
      this.addSystemMessage("Press Ctrl+C again or Ctrl+D to exit.");
      this.onRenderRequest?.();
      this.ctrlCTimer = setTimeout(() => {
        this.ctrlCPressed = false;
        this.ctrlCTimer = null;
        const last = this.messages[this.messages.length - 1];
        if (last?.content?.includes("Press Ctrl+C again")) this.messages.pop();
        this.onRenderRequest?.();
      }, 1500);
      return true;
    }
    this.cfg.onExit();
    return true;
  }

  invalidate(): void {
    this.editor.invalidate();
    this.statusBar.invalidate();
  }

  getCursorPosition(): { line: number; column: number } | null {
    const pos = this.editor.getCursorPosition();
    if (!pos) return null;
    // Cursor is at: header height + all message lines + spacer + editor cursor line
    const headerH = this.renderHeader(80).length;
    const msgH = this.renderMessages(80).length;
    return { line: headerH + msgH + 1 + pos.line, column: pos.column };
  }

  // ── Public API ────────────────────────────────────────────────────

  addMessage(c: ChatMessageConfig) {
    this.messages.push(c);
  }
  appendDelta(d: string) {
    this.streamingContent += d;
  }
  appendReasoning(t: string) {
    this.streamingReasoning += t;
  }

  finishStream(): void {
    if (this.streamingContent) {
      this.messages.push({ role: "assistant", content: this.streamingContent });
    }
    this.streamingContent = "";
    this.streamingReasoning = "";
    this.processing = false;
    this.statusBar.update({ state: "idle" });
  }

  startToolCall(id: string, name: string, input?: string): void {
    this.activeToolCalls.set(id, { name, input, startedAt: Date.now() });
  }

  appendToolOutput(id: string, output: string): void {
    // Tool output is tracked by tool name for simplicity
    const tc = this.activeToolCalls.get(id);
    if (!tc) return;
    const existing = this.toolBuffers.get(tc.name) ?? "";
    this.toolBuffers.set(tc.name, existing + output);
  }

  finishToolCall(id: string): void {
    const tc = this.activeToolCalls.get(id);
    if (!tc) return;
    const output = this.toolBuffers.get(tc.name);
    if (output !== undefined) {
      this.messages.push({ role: "tool", content: output, toolCall: tc.name });
    }
    this.activeToolCalls.delete(id);
  }

  updateStatus(s: Partial<StatusBarConfig>) {
    this.statusBar.update(s);
  }

  addSystemMessage(text: string, isErr = false): void {
    this.messages.push({ role: isErr ? "error" : "system", content: text });
  }

  // ── Slash commands ────────────────────────────────────────────────

  private handleSlashCommand(input: string): void {
    const cmd = input.split(/\s+/)[0]?.toLowerCase();
    switch (cmd) {
      case "/help":
        this.showHelp();
        break;
      case "/clear":
        this.messages = [];
        this.finishStream();
        break;
      case "/exit":
      case "/quit":
        this.cfg.onExit();
        break;
      default:
        this.addSystemMessage(`Unknown: ${cmd}. Type /help.`, true);
    }
  }

  private showHelp(): void {
    this.messages.push({
      role: "system",
      content: [
        "Commands:  /help  /clear  /exit",
        "",
        "Shortcuts:",
        "  ↑/↓ history   Shift+Enter newline   Enter submit",
        "  Ctrl+A/E line start/end   Ctrl+K delete to end",
        "  Ctrl+U delete line   Ctrl+W delete word",
        "  Alt+B/F word back/forward   Ctrl+C cancel/exit",
        "  Ctrl+D exit (when empty)",
      ].join("\n"),
    });
  }

  // ── Event subscriptions ──────────────────────────────────────────

  private subscribe(bus: EventBus): void {
    const req = () => this.onRenderRequest?.();

    this.unsubscribes.push(
      bus.subscribe("agent:start", () => {
        this.statusBar.update({ state: "thinking" });
        req();
        return allow();
      }),
    );

    this.unsubscribes.push(
      bus.subscribe("message:delta", (e) => {
        this.appendDelta((e as { delta: string }).delta);
        this.statusBar.update({ state: "streaming" });
        req();
        return allow();
      }),
    );

    this.unsubscribes.push(
      bus.subscribe("message:reasoning", (e) => {
        this.appendReasoning((e as { text: string }).text);
        req();
        return allow();
      }),
    );

    this.unsubscribes.push(
      bus.subscribe("tool:start", (e) => {
        const { id, name, input } = e as { id: string; name: string; input?: string };
        this.startToolCall(id, name, input);
        req();
        return allow();
      }),
    );

    this.unsubscribes.push(
      bus.subscribe("tool:progress", (e) => {
        const { id, output } = e as { id: string; output: string };
        this.appendToolOutput(id, output);
        req();
        return allow();
      }),
    );

    this.unsubscribes.push(
      bus.subscribe("tool:end", (e) => {
        this.finishToolCall((e as { id: string }).id);
        req();
        return allow();
      }),
    );

    this.unsubscribes.push(
      bus.subscribe("agent:end", (e) => {
        this.finishStream();
        const ev = e as { result?: { tokens?: { input: number; output: number } } };
        if (ev?.result?.tokens) this.statusBar.update({ tokens: ev.result.tokens });
        req();
        return allow();
      }),
    );

    this.unsubscribes.push(
      bus.subscribe("agent:error", (e) => {
        this.finishStream();
        this.statusBar.update({ state: "error" });
        this.addSystemMessage(`Error: ${(e as { error: Error }).error.message}`, true);
        req();
        return allow();
      }),
    );

    this.unsubscribes.push(
      bus.subscribe("agent:cancelled", () => {
        this.finishStream();
        this.addSystemMessage("Cancelled.");
        req();
        return allow();
      }),
    );
  }
}
