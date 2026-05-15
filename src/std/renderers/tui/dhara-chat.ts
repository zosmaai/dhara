import type { EventBus, HookResult } from "../../../core/events.js";
import { ChatMessage, type ChatMessageConfig } from "./components/chat-message.js";
/**
 * DharaApp — the coding agent TUI application.
 *
 * Thin shell that composes sub-components and wires them to agent events.
 * Rendering logic is extracted to standalone functions for testability.
 */
import type { Component, FocusableComponent } from "./components/component.js";
import { visibleWidth } from "./components/component.js";
import { Editor, type EditorConfig } from "./components/editor.js";
import { StatusBar, type StatusBarConfig } from "./components/status-bar.js";
import type { Theme } from "./theme.js";

// ── Types ──────────────────────────────────────────────────────

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
  addUnsub(fn: () => void): void {
    this._unsubs.push(fn);
  }

  onRender?: () => void;

  constructor(config: DharaAppConfig) {
    this.theme = config.theme;
    this.cfg = config;

    this.editor = new Editor(config.theme, {
      prompt: "▸ ",
      placeholder: "Ask anything…  /help for commands",
      ...config.editor,
    });
    // The editor is the actual focus target for input; DharaApp
    // proxies handleInput to it.  Mirror our own focus state.
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

  // Cursor positioning handled via CURSOR_MARKER embedded by editor

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

  // ── Event wiring ────────────────────────────────────────────────────

  setEventBus(bus: EventBus): void {
    this.disposeSubs();
    wireEvents(bus, this);
    wireToolEvents(bus, this);
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

  // Brand line
  const brandText = `${A.prefix}⚡${A.reset} ${Bd.prefix}dhara${Bd.reset} ${D.prefix}${v}${D.reset}`;
  const brandPlain = visibleWidth(`⚡ dhara ${v}`);
  result.push(brandText + " ".repeat(Math.max(0, w - brandPlain)));

  // Model line
  const modelText = `${Bd.prefix}${p}${Bd.reset}/${Bd.prefix}${m}${Bd.reset}`;
  const modelPlain = visibleWidth(`${p}/${m}`);
  result.push(modelText + " ".repeat(Math.max(0, w - modelPlain)));

  // CWD + session
  const metaText = `${D.prefix}${c}${D.reset}  ${M.prefix}#${s}${M.reset}`;
  const metaPlain = visibleWidth(`${c}  #${s}`);
  result.push(metaText + " ".repeat(Math.max(0, w - metaPlain)));

  return result;
}

/** Welcome message shown on first load so the screen is never empty. */
export function renderWelcome(theme: Theme, width: number): string[] {
  const A = theme.resolve("accent");
  const D = theme.resolve("dim");
  const Bd = theme.resolve("bold");
  const M = theme.resolve("muted");
  const S = theme.resolve("success");

  const w = width - 4;
  const result: string[] = [];

  result.push("");
  result.push(`  ${A.prefix}Welcome to Dhara${A.reset}`);
  result.push(`  ${D.prefix}${"─".repeat(Math.min(w, 50))}${D.reset}`);
  result.push("");
  result.push(`  ${Bd.prefix}Quick start:${Bd.reset}`);
  result.push(
    `  ${S.prefix}●${S.reset} ${D.prefix}Type a question or task and press Enter${D.reset}`,
  );
  result.push(`  ${S.prefix}●${S.reset} ${D.prefix}Use Shift+Enter for multi-line input${D.reset}`);
  result.push(`  ${S.prefix}●${S.reset} ${D.prefix}/help  for commands${D.reset}`);
  result.push(`  ${S.prefix}●${S.reset} ${D.prefix}/clear to clear the chat${D.reset}`);
  result.push(`  ${S.prefix}●${S.reset} ${D.prefix}Ctrl+C to cancel, Ctrl+D to exit${D.reset}`);
  result.push("");
  result.push(
    `  ${M.prefix}Shortcuts: ↑/↓ history  Ctrl+A/E start/end  Ctrl+K clear to end  Ctrl+U clear line${M.reset}`,
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
        const payload = e as { delta?: string; content?: Array<{ type: string; text?: string }> };
        if (typeof payload.delta === "string") {
          app.streamContent += payload.delta;
        } else if (Array.isArray(payload.content)) {
          // Fallback: extract text from content blocks
          for (const block of payload.content) {
            if (block.type === "text" && block.text) {
              app.streamContent += block.text;
            }
          }
        }
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
        // If streaming captured content, add it as a message
        // If not (e.g., no delta events), try to get content from agent:response
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

// ── Tool event wiring ───────────────────────────────────────────────────

function wireToolEvents(bus: EventBus, app: DharaApp): void {
  const R = () => app.onRender?.();

  // Listen for tool calls and display them (non-blocking)
  bus.subscribe("tool:call_start", (e) => {
    const payload = e as { toolName: string; toolCallId: string; input: Record<string, unknown> };
    const toolCall = `${payload.toolName} ${JSON.stringify(payload.input)}`;
    app.addMessage({
      role: "assistant",
      content: "",
      toolCall,
    });
    R();
    return { action: "allow" };
  });

  // Listen for tool results (non-blocking)
  bus.subscribe("tool:execution_end", (e) => {
    const payload = e as {
      toolCallId: string;
      toolName: string;
      output: string;
      isError?: boolean;
    };
    const isError = payload.isError ? "error" : "tool";
    app.addMessage({
      role: isError,
      content: payload.output,
    });
    R();
    return { action: "allow" };
  });

  // Listen for approval events (non-blocking)
  bus.subscribe("tool:approval_required", () => {
    app.addMessage({
      role: "system",
      content: "Waiting for approval...",
    });
    R();
    return { action: "allow" };
  });

  bus.subscribe("tool:approval_granted", () => {
    app.addMessage({
      role: "system",
      content: "Approval granted, executing...",
    });
    R();
    return { action: "allow" };
  });

  bus.subscribe("tool:approval_denied", (e) => {
    const payload = e as { toolCallId: string; toolName: string; reason: string };
    app.addMessage({
      role: "error",
      content: `Tool ${payload.toolName} denied: ${payload.reason}`,
    });
    R();
    return { action: "allow" };
  });

  bus.subscribe("tool:call_cancelled", (e) => {
    const payload = e as { toolCallId: string; toolName: string };
    app.addMessage({
      role: "system",
      content: `Tool ${payload.toolName} cancelled.`,
    });
    R();
    return { action: "allow" };
  });
}

const SLASH_HELP = [
  "Commands:  /help  /clear  /exit",
  "",
  "Shortcuts:",
  "  ↑/↓ history   Shift+Enter newline   Enter submit",
  "  Ctrl+A/E start/end   Ctrl+K clear to end   Ctrl+U clear line",
  "  Ctrl+W delete word   Alt+B/F word   Ctrl+C cancel/exit",
].join("\n");
