import type { EventBus, HookResult } from "../../../core/events.js";
import { ChatMessage, type ChatMessageConfig } from "./components/chat-message.js";
/**
 * DharaApp — the coding agent TUI application.
 *
 * Thin shell that composes sub-components and wires them to agent events.
 */
import type { Component, FocusableComponent } from "./components/component.js";
import { truncateToWidth, visibleWidth } from "./components/component.js";
import { Editor, type EditorConfig } from "./components/editor.js";
import { StatusBar, type StatusBarConfig } from "./components/status-bar.js";
import type { Theme } from "./theme.js";

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
  private _focused = false;
  get focused(): boolean {
    return this._focused;
  }
  set focused(value: boolean) {
    this._focused = value;
    // Propagate focus to the editor for CURSOR_MARKER positioning
    this.editor.focused = value;
  }

  // Exit: double-tap Ctrl+C
  private ctrlCTapped = false;
  private ctrlCTimer: ReturnType<typeof setTimeout> | null = null;

  // Event cleanup (set by wireEvents)
  private _unsubs: (() => void)[] = [];
  addUnsub(fn: () => void): void {
    this._unsubs.push(fn);
  }

  onRender?: () => void;

  constructor(config: DharaAppConfig) {
    this.theme = config.theme;
    this.cfg = config;

    this.editor = new Editor(config.theme, {
      prompt: "> ",
      placeholder: "Ask anything\u2026  /help for commands",
      ...config.editor,
    });
    this.editor.focused = true;

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
    const hasContent = this.messages.length > 0 || this.streamContent || this.streamReasoning;
    return [
      ...renderHeader(this.theme, this.cfg, width),
      ...(hasContent
        ? renderMessages(this.theme, this.messages, this.streamContent, this.streamReasoning, width)
        : renderWelcome(this.theme, width)),
      this.theme.apply("dim", "\u2500".repeat(width)),
      ...this.editor.render(width),
      ...this.statusBar.render(width),
    ];
  }

  handleInput(data: string): boolean {
    if (data === "\x03") return this.handleCtrlC();
    if (data === "\x04" && this.editor.getText() === "") {
      this.cfg.onExit();
      return true;
    }
    this.ctrlCTapped = false;
    if (this.ctrlCTimer) {
      clearTimeout(this.ctrlCTimer);
      this.ctrlCTimer = null;
    }
    return this.editor.handleInput(data);
  }

  invalidate(): void {
    this.editor.invalidate();
    this.statusBar.invalidate();
  }

  // ── Public API ──────────────────────────────────────────────────────

  finishStream(): void {
    if (this.streamContent) this.messages.push({ role: "assistant", content: this.streamContent });
    this.streamContent = "";
    this.streamReasoning = "";
    this.processing = false;
    this.statusBar.update({ state: "idle" });
  }

  addMessage(c: ChatMessageConfig): void {
    this.messages.push(c);
  }

  setEventBus(bus: EventBus): void {
    this.disposeSubs();
    wireEvents(bus, this);
  }

  private disposeSubs(): void {
    for (const u of this._unsubs) u();
    this._unsubs = [];
  }

  dispose(): void {
    this.disposeSubs();
    if (this.ctrlCTimer) clearTimeout(this.ctrlCTimer);
  }

  // ── Exit ────────────────────────────────────────────────────────────

  private handleCtrlC(): boolean {
    if (this.processing) {
      this.finishStream();
      this.addMessage({ role: "system", content: "Cancelled." });
      this.onRender?.();
      return true;
    }
    if (!this.ctrlCTapped) {
      this.ctrlCTapped = true;
      this.addMessage({ role: "system", content: "Press Ctrl+C again or Ctrl+D to exit." });
      this.onRender?.();
      this.ctrlCTimer = setTimeout(() => {
        this.ctrlCTapped = false;
        this.ctrlCTimer = null;
      }, 1500);
      return true;
    }
    this.cfg.onExit();
    return true;
  }

  // ── Slash commands ──────────────────────────────────────────────────

  private slash(input: string): void {
    const cmd = input.split(/\s+/)[0]?.toLowerCase();
    switch (cmd) {
      case "/help":
        this.messages.push({ role: "system", content: SLASH_HELP });
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
        this.messages.push({ role: "error", content: `Unknown: ${cmd}. Type /help.` });
    }
  }
}

// ── Extracted rendering ────────────────────────────────────────────────

function renderHeader(theme: Theme, cfg: DharaAppConfig, width: number): string[] {
  const A = theme.resolve("accent");
  const D = theme.resolve("dim");
  const Bd = theme.resolve("bold");
  const M = theme.resolve("muted");

  const v = cfg.version ?? "v0.1.0";
  const p = cfg.status?.provider ?? "?";
  const m = cfg.status?.model ?? "?";
  const c = cfg.status?.cwd ?? "?";
  const s = cfg.status?.sessionId ?? "?";

  const result: string[] = [];
  const w = width - 2;

  const brandText = `${A.prefix}\u26a1${A.reset} ${Bd.prefix}dhara${Bd.reset} ${D.prefix}${v}${D.reset}`;
  const brandPlain = visibleWidth(`\u26a1 dhara ${v}`);
  result.push(brandText + " ".repeat(Math.max(0, w - brandPlain)));

  const modelText = `${Bd.prefix}${p}${Bd.reset}/${Bd.prefix}${m}${Bd.reset}`;
  const modelPlain = visibleWidth(`${p}/${m}`);
  result.push(modelText + " ".repeat(Math.max(0, w - modelPlain)));

  const metaText = `${D.prefix}${c}${D.reset}  ${M.prefix}#${s}${M.reset}`;
  const metaPlain = visibleWidth(`${c}  #${s}`);
  result.push(metaText + " ".repeat(Math.max(0, w - metaPlain)));

  return result;
}

/** Welcome message shown on first load. */
export function renderWelcome(theme: Theme, width: number): string[] {
  const A = theme.resolve("accent");
  const D = theme.resolve("dim");
  const Bd = theme.resolve("bold");
  const M = theme.resolve("muted");
  const S = theme.resolve("success");

  const w = width - 4;
  const t = (text: string) => truncateToWidth(text, w);

  const result: string[] = [];

  result.push("");
  result.push(`  ${A.prefix}${t("Welcome to Dhara")}${A.reset}`);
  result.push(`  ${D.prefix}${t("A coding agent built on the Dhara protocol")}${D.reset}`);
  result.push(`  ${D.prefix}${t("\u2500".repeat(Math.min(w, 50)))}${D.reset}`);
  result.push("");
  result.push(`  ${Bd.prefix}${t("Quick start:")}${Bd.reset}`);
  result.push(
    `  ${S.prefix}${t("\u25cf")}${S.reset} ${D.prefix}${t("Type a question or task and press Enter")}${D.reset}`,
  );
  result.push(
    `  ${S.prefix}${t("\u25cf")}${S.reset} ${D.prefix}${t("Use Shift+Enter for multi-line input")}${D.reset}`,
  );
  result.push(
    `  ${S.prefix}${t("\u25cf")}${S.reset} ${D.prefix}${t("/help  for commands")}${D.reset}`,
  );
  result.push(
    `  ${S.prefix}${t("\u25cf")}${S.reset} ${D.prefix}${t("/clear to clear the chat")}${D.reset}`,
  );
  result.push(
    `  ${S.prefix}${t("\u25cf")}${S.reset} ${D.prefix}${t("Ctrl+C to cancel, Ctrl+D to exit")}${D.reset}`,
  );
  result.push("");
  result.push(
    `  ${M.prefix}${t("Shortcuts: \u2191/\u2193 history  Ctrl+A/E start/end  Ctrl+K clear to end  Ctrl+U clear line")}${M.reset}`,
  );
  result.push("");

  return result;
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
    for (const l of new ChatMessage(theme, {
      role: "assistant",
      content: streaming,
      reasoning: reasoning || undefined,
    }).render(width))
      lines.push(l);
  }
  return lines;
}

// ── Event wiring ───────────────────────────────────────────────────────

function wireEvents(bus: EventBus, app: DharaApp): void {
  const R = () => app.onRender?.();

  const EVENTS: [string, (e: unknown) => void][] = [
    [
      "agent:start",
      () => {
        app.statusBar.update({ state: "thinking" });
        R();
      },
    ],
    [
      "message:delta",
      (e) => {
        const delta = (e as { delta?: string }).delta;
        if (typeof delta === "string") app.streamContent += delta;
        app.statusBar.update({ state: "streaming" });
        R();
      },
    ],
    [
      "message:reasoning",
      (e) => {
        app.streamReasoning += (e as { text: string }).text;
        R();
      },
    ],
    [
      "agent:end",
      (e) => {
        app.finishStream();
        const ek = e as { result?: { tokens?: { input: number; output: number } } };
        if (ek?.result?.tokens) app.statusBar.update({ tokens: ek.result.tokens });
        R();
      },
    ],
    [
      "agent:error",
      (e) => {
        app.finishStream();
        app.statusBar.update({ state: "error" });
        app.addMessage({ role: "error", content: (e as { error: Error }).error.message });
        R();
      },
    ],
    [
      "agent:cancelled",
      () => {
        app.finishStream();
        app.addMessage({ role: "system", content: "Cancelled." });
        R();
      },
    ],
  ];

  for (const [event, handler] of EVENTS) {
    app.addUnsub(bus.subscribe(event, handler as () => HookResult));
  }
}

const SLASH_HELP = [
  "Commands:  /help  /clear  /exit",
  "",
  "Shortcuts:",
  "  \u2191/\u2193 history   Shift+Enter newline   Enter submit",
  "  Ctrl+A/E start/end   Ctrl+K delete to end   Ctrl+U delete line",
  "  Ctrl+W delete word   Alt+B/F word   Ctrl+C cancel/exit",
].join("\n");
