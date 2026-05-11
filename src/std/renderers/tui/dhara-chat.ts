/**
 * DharaApp — the coding agent TUI application.
 *
 * Thin shell that composes sub-components and wires them to agent events.
 * Rendering logic is extracted to standalone functions for testability.
 */
import type { Component, FocusableComponent } from "./components/component.js";
import { ChatMessage, type ChatMessageConfig } from "./components/chat-message.js";
import { Editor, type EditorConfig } from "./components/editor.js";
import { StatusBar, type StatusBarConfig } from "./components/status-bar.js";
import { visibleWidth } from "./components/component.js";
import type { Theme } from "./theme.js";
import type { EventBus, HookResult } from "../../../core/events.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface DharaAppConfig {
  theme: Theme;
  version?: string;
  status?: StatusBarConfig;
  editor?: Partial<EditorConfig>;
  onSubmit: (text: string) => void;
  onExit: () => void;
}

// ── Application ────────────────────────────────────────────────────────

export class DharaApp implements Component, FocusableComponent {
  private theme: Theme;
  private cfg: DharaAppConfig;

  messages: ChatMessageConfig[] = [];
  streamContent = "";
  streamReasoning = "";

  editor: Editor;
  statusBar: StatusBar;

  processing = false;
  focused = false;

  // Exit: double-tap Ctrl+C
  private ctrlCTapped = false;
  private ctrlCTimer: ReturnType<typeof setTimeout> | null = null;

  // Event cleanup (set by wireEvents)
  private _unsubs: (() => void)[] = [];
  addUnsub(fn: () => void): void { this._unsubs.push(fn); }

  onRender?: () => void;

  constructor(config: DharaAppConfig) {
    this.theme = config.theme;
    this.cfg = config;

    this.editor = new Editor(config.theme, {
      prompt: "> ",
      placeholder: "Ask anything... (/help for commands)",
      ...config.editor,
    });

    this.statusBar = new StatusBar(config.theme, config.status ?? {});

    this.editor.onSubmit = (text) => {
      if (this.processing) return;
      if (text.startsWith("/")) return this.slash(text);
      this.messages.push({ role: "user", content: text });
      this.processing = true;
      this.statusBar.update({ state: "thinking" });
      this.onRender?.();
      config.onSubmit(text);
    };
  }

  // ── Component interface ────────────────────────────────────────────

  render(width: number): string[] {
    return [
      ...renderHeader(this.theme, this.cfg, width),
      ...renderMessages(this.theme, this.messages, this.streamContent, this.streamReasoning, width),
      this.theme.apply("dim", "─".repeat(width)),
      ...this.editor.render(width),
      ...this.statusBar.render(width),
    ];
  }

  handleInput(data: string): boolean {
    if (data === "\x03") return this.handleCtrlC();
    if (data === "\x04" && this.editor.getText() === "") { this.cfg.onExit(); return true; }
    this.ctrlCTapped = false;
    if (this.ctrlCTimer) { clearTimeout(this.ctrlCTimer); this.ctrlCTimer = null; }
    return this.editor.handleInput(data);
  }

  invalidate(): void { this.editor.invalidate(); this.statusBar.invalidate(); }

  getCursorPosition() {
    const p = this.editor.getCursorPosition();
    if (!p) return null;
    const hdr = renderHeader(this.theme, this.cfg, 80).length;
    const msgs = renderMessages(this.theme, this.messages, this.streamContent, this.streamReasoning, 80).length;
    return { line: hdr + msgs + 1 + p.line, column: p.column };
  }

  // ── Public API ──────────────────────────────────────────────────────

  finishStream(): void {
    if (this.streamContent) this.messages.push({ role: "assistant", content: this.streamContent });
    this.streamContent = "";
    this.streamReasoning = "";
    this.processing = false;
    this.statusBar.update({ state: "idle" });
  }

  addMessage(c: ChatMessageConfig): void { this.messages.push(c); }

  // ── Event wiring ────────────────────────────────────────────────────

  setEventBus(bus: EventBus): void {
    this.disposeSubs();
    wireEvents(bus, this);
  }

  private disposeSubs(): void { for (const u of this._unsubs) u(); this._unsubs = []; }

  dispose(): void {
    this.disposeSubs();
    if (this.ctrlCTimer) clearTimeout(this.ctrlCTimer);
  }

  // ── Exit ────────────────────────────────────────────────────────────

  private handleCtrlC(): boolean {
    if (this.processing) { this.finishStream(); this.addMessage({ role: "system", content: "Cancelled." }); this.onRender?.(); return true; }
    if (!this.ctrlCTapped) {
      this.ctrlCTapped = true;
      this.addMessage({ role: "system", content: "Press Ctrl+C again or Ctrl+D to exit." });
      this.onRender?.();
      this.ctrlCTimer = setTimeout(() => { this.ctrlCTapped = false; this.ctrlCTimer = null; }, 1500);
      return true;
    }
    this.cfg.onExit(); return true;
  }

  // ── Slash commands ──────────────────────────────────────────────────

  private slash(input: string): void {
    const cmd = input.split(/\s+/)[0]?.toLowerCase();
    switch (cmd) {
      case "/help": this.messages.push({ role: "system", content: SLASH_HELP }); break;
      case "/clear": this.messages = []; this.finishStream(); break;
      case "/exit": case "/quit": this.cfg.onExit(); break;
      default: this.messages.push({ role: "error", content: `Unknown: ${cmd}. Type /help.` });
    }
  }
}

// ── Extracted rendering ────────────────────────────────────────────────

function renderHeader(theme: Theme, cfg: DharaAppConfig, width: number): string[] {
  const B = theme.resolve("panel.border");
  const A = theme.resolve("accent");
  const D = theme.resolve("dim");
  const Bd = theme.resolve("bold");
  const M = theme.resolve("muted");

  const v = cfg.version ?? "v0.1.0";
  const p = cfg.status?.provider ?? "?";
  const m = cfg.status?.model ?? "?";
  const c = cfg.status?.cwd ?? "?";
  const s = cfg.status?.sessionId ?? "?";

  const w = width - 4;
  const h = "─";
  const row = (content: string, plainW: number) =>
    `${B.prefix}  ${content}${" ".repeat(Math.max(0, w - plainW))}  ${B.reset}`;

  return [
    `  ${B.prefix}┌${h.repeat(w)}┐${B.reset}`,
    row(`${A.prefix}⚡${A.reset} ${Bd.prefix}dhara${Bd.reset} ${D.prefix}${v}${D.reset}`, visibleWidth(`⚡ dhara ${v}`)),
    row(`${D.prefix}The Agent Protocol Standard${D.reset}`, visibleWidth("The Agent Protocol Standard")),
    row("", 0),
    row(`${Bd.prefix}${p}${Bd.reset}/${Bd.prefix}${m}${Bd.reset}`, visibleWidth(`${p}/${m}`)),
    row(`${D.prefix}${c}${D.reset}`, visibleWidth(c)),
    row(`${M.prefix}Session ${s}${M.reset}  ${D.prefix}Type /help${D.reset}`, visibleWidth(`Session ${s}  Type /help`)),
    `  ${B.prefix}└${h.repeat(w)}┘${B.reset}`,
  ];
}

function renderMessages(
  theme: Theme,
  messages: ChatMessageConfig[],
  streaming: string,
  reasoning: string,
  width: number,
): string[] {
  const lines: string[] = [];
  for (const m of messages) {
    for (const l of new ChatMessage(theme, m).render(width)) lines.push(l);
    lines.push("");
  }
  if (streaming) {
    for (const l of new ChatMessage(theme, { role: "assistant", content: streaming, reasoning: reasoning || undefined }).render(width))
      lines.push(l);
  }
  return lines;
}

// ── Event wiring ───────────────────────────────────────────────────────

function wireEvents(bus: EventBus, app: DharaApp): void {
  const R = () => app.onRender?.();

  const EVENTS: [string, (e: unknown) => void][] = [
    ["agent:start", () => { app.statusBar.update({ state: "thinking" }); R(); }],
    ["message:delta", (e) => {
      app.streamContent += (e as { delta: string }).delta;
      app.statusBar.update({ state: "streaming" }); R();
    }],
    ["message:reasoning", (e) => { app.streamReasoning += (e as { text: string }).text; R(); }],
    ["agent:end", (e) => {
      app.finishStream();
      const ek = e as { result?: { tokens?: { input: number; output: number } } };
      if (ek?.result?.tokens) app.statusBar.update({ tokens: ek.result.tokens });
      R();
    }],
    ["agent:error", (e) => {
      app.finishStream();
      app.statusBar.update({ state: "error" });
      app.addMessage({ role: "error", content: (e as { error: Error }).error.message });
      R();
    }],
    ["agent:cancelled", () => { app.finishStream(); app.addMessage({ role: "system", content: "Cancelled." }); R(); }],
  ];

  for (const [event, handler] of EVENTS) {
    app.addUnsub(bus.subscribe(event, handler as () => HookResult));
  }
}

const SLASH_HELP = [
  "Commands:  /help  /clear  /exit",
  "",
  "Shortcuts:",
  "  ↑/↓ history   Shift+Enter newline   Enter submit",
  "  Ctrl+A/E start/end   Ctrl+K delete to end   Ctrl+U delete line",
  "  Ctrl+W delete word   Alt+B/F word   Ctrl+C cancel/exit",
].join("\n");
