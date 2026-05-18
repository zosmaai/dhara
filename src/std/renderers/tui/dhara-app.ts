/**
 * DharaApp — Main TUI application component.
 *
 * Composes header, messages, editor, and footer into a single layout,
 * matching pi's InteractiveMode structure. Uses pi-tui's built-in components.
 *
 * Layout:
 *   headerContainer → chatContainer → pendingMessagesContainer →
 *   editorContainer → footer
 */
import {
  type Component,
  Container,
  type EditorTheme,
  type Focusable,
  Loader,
  Spacer,
  type TUI,
} from "@earendil-works/pi-tui";
import type { EventBus, HookResult } from "../../../core/events.js";
import { DharaEditor } from "./dhara-editor.js";
import { FooterComponent, type FooterData } from "./dhara-footer.js";
import { HeaderComponent } from "./dhara-header.js";
import {
  AssistantMessageComponent,
  ErrorMessageComponent,
  type MessageConfig,
  SystemMessageComponent,
  ToolExecutionComponent,
  UserMessageComponent,
} from "./dhara-messages.js";
import { color, getEditorTheme } from "./dhara-theme.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface DharaAppConfig {
  version?: string;
  footerData: FooterData;
  onSubmit: (text: string) => void;
  onExit: () => void;
}

// ── DharaApp ─────────────────────────────────────────────────────────

export class DharaApp implements Component, Focusable {
  // Focusable interface
  focused = false;

  // Sub-containers (matching pi's layout)
  /** @internal Accessed by tui-runner for TUI assembly */
  headerContainer: Container;
  /** @internal */
  chatContainer: Container;
  /** @internal */
  pendingContainer: Container;
  /** @internal */
  statusContainer: Container;
  /** @internal */
  editorContainer: Container;

  // Components
  /** @internal */
  header: HeaderComponent;
  /** @internal Accessed by tui-runner for focus */
  editor: DharaEditor;
  /** @internal */
  footer: FooterComponent;

  // TUI ref
  private tui: TUI;

  // Config
  private cfg: DharaAppConfig;

  // Streaming state
  private streamingMessage: AssistantMessageComponent | null = null;
  private streamingContent = "";
  private currentTool: ToolExecutionComponent | null = null;

  // Exit: double-tap Ctrl+C
  private ctrlCTapped = false;
  private ctrlCTimer: ReturnType<typeof setTimeout> | null = null;

  // Loader state
  /** @internal */
  loader: Loader;

  // Event cleanup
  private unsubs: (() => void)[] = [];

  constructor(tui: TUI, config: DharaAppConfig) {
    this.tui = tui;
    this.cfg = config;

    // ── Theme ──────────────────────────────────────────────────────
    const editorTheme: EditorTheme = getEditorTheme();

    // ── Header ─────────────────────────────────────────────────────
    this.headerContainer = new Container();
    this.header = new HeaderComponent(config.version ?? "0.1.0");
    this.headerContainer.addChild(new Spacer(1));
    this.headerContainer.addChild(this.header);

    // ── Chat ───────────────────────────────────────────────────────
    this.chatContainer = new Container();

    // ── Pending messages ───────────────────────────────────────────
    this.pendingContainer = new Container();

    // ── Status (loader) — mirrors pi's statusContainer ──────────────
    this.statusContainer = new Container();
    this.loader = new Loader(
      tui,
      (spinner) => color.accent(spinner),
      (text) => color.dim(text),
      "Working...",
    );

    // ── Editor (DharaEditor — mirrors pi's CustomEditor) ────────────
    this.editorContainer = new Container();
    this.editor = new DharaEditor(tui, editorTheme, {
      paddingX: 1,
    });
    this.editor.focused = true;
    this.editorContainer.addChild(this.editor);

    // Editor submit handler
    this.editor.onSubmit = (text: string) => {
      if (!text.trim()) return;
      this.addUserMessage(text);
      config.onSubmit(text);
    };

    // Ctrl+C — double-tap exit logic (mirrors pi's app.clear action)
    this.editor.onCtrlC = () => this.handleCtrlC();

    // Ctrl+D on empty editor → exit (mirrors pi's app.exit action)
    this.editor.onCtrlD = () => this.cfg.onExit();

    // ── Footer ─────────────────────────────────────────────────────
    this.footer = new FooterComponent(config.footerData);

    // ── Focus ──────────────────────────────────────────────────────
    this.focused = true;
  }

  // ── Loader control ─────────────────────────────────────────────────

  startWorking(message = "Working..."): void {
    this.loader.setMessage(message);
    this.statusContainer.addChild(this.loader);
    this.loader.start();
    this.tui.requestRender();
  }

  stopWorking(): void {
    this.loader.stop();
    this.statusContainer.clear();
    this.tui.requestRender();
  }

  // ── Component interface ────────────────────────────────────────────

  invalidate(): void {
    this.header.invalidate();
    this.editor.invalidate();
    this.footer.invalidate();
  }

  render(_width: number): string[] {
    return [];
  }

  // ── Public API ─────────────────────────────────────────────────────

  addUserMessage(text: string): void {
    this.chatContainer.addChild(new UserMessageComponent(text));
    this.editor.setText("");
    this.tui.requestRender();
  }

  startStream(): void {
    this.streamingMessage = new AssistantMessageComponent("");
    this.chatContainer.addChild(this.streamingMessage);
    this.startWorking();
    this.footer.update({ state: "thinking" });
    this.tui.requestRender();
  }

  updateStream(delta: string): void {
    if (!this.streamingMessage) {
      this.startStream();
    }
    this.streamingContent += delta;
    if (this.streamingMessage) {
      this.streamingMessage.updateContent(this.streamingContent);
    }
    this.footer.update({ state: "streaming" });
    this.tui.requestRender();
  }

  finishStream(result?: string): void {
    if (result) {
      this.streamingContent = result;
      if (this.streamingMessage) {
        this.streamingMessage.updateContent(result);
      }
    }
    this.streamingMessage = null;
    this.streamingContent = "";
    this.stopWorking();
    this.footer.update({ state: "idle" });
    this.tui.requestRender();
  }

  addMessage(msg: MessageConfig): void {
    switch (msg.role) {
      case "user":
        this.chatContainer.addChild(new UserMessageComponent(msg.content));
        break;
      case "assistant":
        this.chatContainer.addChild(new AssistantMessageComponent(msg.content, msg.reasoning));
        break;
      case "tool":
        this.chatContainer.addChild(
          new ToolExecutionComponent(msg.toolCall ?? "tool", msg.content, false),
        );
        break;
      case "error":
        this.chatContainer.addChild(new ErrorMessageComponent(msg.content));
        this.footer.update({ state: "error" });
        break;
      case "system":
        this.chatContainer.addChild(new SystemMessageComponent(msg.content));
        break;
    }
    this.tui.requestRender();
  }

  setToolCall(toolName: string, args: string): void {
    this.currentTool = new ToolExecutionComponent(toolName, args);
    this.chatContainer.addChild(this.currentTool);
    this.tui.requestRender();
  }

  setToolResult(toolName: string, result: string, isError = false): void {
    if (this.currentTool) {
      // Remove previous tool component, add completed one
      this.chatContainer.removeChild(this.currentTool);
    }
    const tc = new ToolExecutionComponent(toolName, result, isError);
    this.chatContainer.addChild(tc);
    this.currentTool = null;
    this.tui.requestRender();
  }

  clearMessages(): void {
    this.chatContainer.clear();
    this.streamingMessage = null;
    this.streamingContent = "";
    this.currentTool = null;
    this.tui.requestRender();
  }

  setFooterTokens(tokens: { input: number; output: number }): void {
    this.footer.update({ tokens });
    this.tui.requestRender();
  }

  setFooterState(state: FooterData["state"]): void {
    this.footer.update({ state });
    this.tui.requestRender();
  }

  // ── Event wiring ───────────────────────────────────────────────────

  wireEvents(bus: EventBus): void {
    this.disposeSubs();

    const wire: [string, (e: unknown) => void][] = [
      [
        "agent:start",
        () => {
          this.startStream();
        },
      ],
      [
        "message:delta",
        (e) => {
          const payload = e as {
            delta?: string;
            content?: Array<{ type: string; text?: string }>;
          };
          if (typeof payload.delta === "string") {
            this.updateStream(payload.delta);
          } else if (Array.isArray(payload.content)) {
            for (const block of payload.content) {
              if (block.type === "text" && block.text) {
                this.updateStream(block.text);
              }
            }
          }
        },
      ],
      [
        "message:reasoning",
        () => {
          // Reasoning deltas can be appended to the streaming message
          // For now, we just trigger a re-render
          this.tui.requestRender();
        },
      ],
      [
        "agent:end",
        (e) => {
          const ek = e as {
            result?: { tokens?: { input: number; output: number }; content?: string };
          };
          if (ek?.result?.content) {
            this.finishStream(ek.result.content);
          } else {
            this.finishStream();
          }
          if (ek?.result?.tokens) {
            this.setFooterTokens(ek.result.tokens);
          }
          this.tui.requestRender();
        },
      ],
      [
        "agent:error",
        (e) => {
          this.finishStream();
          const payload = e as { error: Error };
          this.addMessage({
            role: "error",
            content: payload.error?.message ?? "Unknown error",
          });
          this.footer.update({ state: "idle" });
          this.tui.requestRender();
        },
      ],
      [
        "agent:cancelled",
        () => {
          this.finishStream();
          this.addMessage({ role: "system", content: "Cancelled." });
          this.footer.update({ state: "idle" });
          this.tui.requestRender();
        },
      ],
      [
        "tool:call_start",
        (e) => {
          const payload = e as {
            toolName: string;
            toolCallId: string;
            input: Record<string, unknown>;
          };
          this.setToolCall(payload.toolName, JSON.stringify(payload.input));
          this.tui.requestRender();
        },
      ],
      [
        "tool:execution_end",
        (e) => {
          const payload = e as {
            toolCallId: string;
            toolName: string;
            result: { content: Array<{ type: string; text?: string }> };
            isError?: boolean;
          };
          // Extract text from ToolResult.content (ContentBlock[])
          const resultText = (payload.result?.content ?? [])
            .filter((b) => b.type === "text")
            .map((b) => b.text ?? "")
            .join("\n");
          this.setToolResult(
            payload.toolName,
            resultText || JSON.stringify(payload.result),
            payload.isError,
          );
          this.tui.requestRender();
        },
      ],
      [
        "tool:approval_required",
        () => {
          this.addMessage({ role: "system", content: "Waiting for approval..." });
          this.tui.requestRender();
        },
      ],
      [
        "tool:approval_granted",
        () => {
          this.addMessage({ role: "system", content: "Approval granted, executing..." });
          this.tui.requestRender();
        },
      ],
      [
        "tool:approval_denied",
        (e) => {
          const payload = e as {
            toolCallId: string;
            toolName: string;
            reason: string;
          };
          this.addMessage({
            role: "error",
            content: `Tool ${payload.toolName} denied: ${payload.reason}`,
          });
          this.tui.requestRender();
        },
      ],
    ];

    for (const [event, handler] of wire) {
      this.unsubs.push(bus.subscribe(event, handler as () => HookResult));
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────

  private disposeSubs(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
  }

  dispose(): void {
    this.disposeSubs();
    if (this.ctrlCTimer) clearTimeout(this.ctrlCTimer);
  }

  // ── Ctrl+C handling ────────────────────────────────────────────────

  private handleCtrlC(): void {
    if (!this.ctrlCTapped) {
      this.ctrlCTapped = true;
      this.addMessage({ role: "system", content: "Press Ctrl+C again or Ctrl+D to exit." });
      this.ctrlCTimer = setTimeout(() => {
        this.ctrlCTapped = false;
        this.ctrlCTimer = null;
      }, 1500);
      return;
    }
    this.cfg.onExit();
  }
}
