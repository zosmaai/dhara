/**
 * DharaApp — Main TUI application component.
 *
 * Mirrors pi-coding-agent's InteractiveMode structure with enhanced components:
 * - Thinking tokens display inline with styled formatting
 * - Tool execution with loader animation before result
 * - Proper message ordering: tools then answer at agent:end
 * - File diff rendering support
 *
 * Layout:
 *   headerContainer → chatContainer → statusContainer → editorContainer → footer
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
import { color, getMarkdownTheme } from "./dhara-theme.js";
import { getTheme } from "./themes/index.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface DharaAppConfig {
  version?: string;
  theme?: string;
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

  // Accumulated streaming state
  private accumulatedContent = "";
  private accumulatedReasoning = "";
  private isAssistantRunning = false;

  // Current tool being executed (null when idle)
  private currentTool: ToolExecutionComponent | null = null;

  // All completed tool components (for toggling expansion)
  private toolComponents: ToolExecutionComponent[] = [];

  // Exit: double-tap Ctrl+C
  private ctrlCTapped = false;
  private ctrlCTimer: ReturnType<typeof setTimeout> | null = null;

  // Loader state
  /** @internal */
  loader: Loader;
  private loaderRunning = false;

  // Event cleanup
  private unsubs: (() => void)[] = [];

  constructor(tui: TUI, config: DharaAppConfig) {
    this.tui = tui;
    this.cfg = config;

    // ── Theme ──────────────────────────────────────────────────────
    const themeName = config.theme ?? "dhara-default";
    const activeTheme = getTheme(themeName);
    const editorTheme: EditorTheme = activeTheme.getEditorTheme();

    // ── Header ─────────────────────────────────────────────────────
    this.headerContainer = new Container();
    this.header = new HeaderComponent(config.version ?? "0.1.0");
    this.headerContainer.addChild(new Spacer(1));
    this.headerContainer.addChild(this.header);

    // ── Chat ───────────────────────────────────────────────────────
    this.chatContainer = new Container();

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

    // Ctrl+O — toggle tool result expansion (mirrors pi's app.tools.expand action)
    this.editor.onToggleToolExpansion = () => this.toggleToolExpansion();

    // ── Footer ─────────────────────────────────────────────────────
    this.footer = new FooterComponent(config.footerData);

    // ── Focus ──────────────────────────────────────────────────────
    this.focused = true;
  }

  // ── Loader control ─────────────────────────────────────────────────

  startWorking(message = "Working..."): void {
    if (this.loaderRunning) {
      // Already running, just update the message
      this.loader.setMessage(message);
      this.tui.requestRender();
      return;
    }
    this.loader.setMessage(message);
    this.statusContainer.addChild(this.loader);
    this.loader.start();
    this.loaderRunning = true;
    this.tui.requestRender();
  }

  stopWorking(): void {
    if (!this.loaderRunning) return;
    this.loader.stop();
    this.statusContainer.clear();
    this.loaderRunning = false;
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

  // ── Streaming / Accumulation ───────────────────────────────────────
  // Rather than creating an AssistantMessageComponent mid-stream, we
  // accumulate content and reasoning during agent execution and only
  // render the final component at agent:end (below any tool calls).

  startStream(): void {
    this.accumulatedContent = "";
    this.accumulatedReasoning = "";
    this.isAssistantRunning = true;
    this.startWorking();
    this.footer.update({ state: "thinking" });
    this.tui.requestRender();
  }

  updateStream(delta: string): void {
    if (!this.isAssistantRunning) return;
    this.accumulatedContent += delta;
    this.footer.update({ state: "streaming" });
    this.tui.requestRender();
  }

  updateReasoning(text: string): void {
    if (!this.isAssistantRunning) return;
    this.accumulatedReasoning += text;
    this.tui.requestRender();
  }

  finishStream(result?: string): void {
    if (result) {
      this.accumulatedContent = result;
    }

    // Create the final AssistantMessageComponent with accumulated content + reasoning
    if (this.accumulatedContent || this.accumulatedReasoning) {
      const assistantMsg = new AssistantMessageComponent(
        this.accumulatedContent,
        this.accumulatedReasoning || undefined,
        getMarkdownTheme(),
      );
      this.chatContainer.addChild(assistantMsg);
    }

    this.accumulatedContent = "";
    this.accumulatedReasoning = "";
    this.isAssistantRunning = false;
    this.stopWorking();
    this.footer.update({ state: "idle" });
    this.tui.requestRender();
  }

  // ── Message Components ─────────────────────────────────────────────

  addMessage(msg: MessageConfig): void {
    switch (msg.role) {
      case "user":
        this.chatContainer.addChild(new UserMessageComponent(msg.content));
        break;
      case "assistant": {
        // Assistant message with thinking tokens
        const assistantMsg = new AssistantMessageComponent(msg.content, msg.reasoning ?? "");
        this.chatContainer.addChild(assistantMsg);
        break;
      }
      case "tool": {
        // Tool execution with loader animation
        const toolMsg = new ToolExecutionComponent(msg.toolCall ?? "tool", msg.content, false);
        this.chatContainer.addChild(toolMsg);
        break;
      }
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

  // ── Tool Execution with Loader ─────────────────────────────────────

  setToolCall(toolName: string, args: string): void {
    this.currentTool = new ToolExecutionComponent(toolName, args, false);
    this.chatContainer.addChild(this.currentTool);

    // Start/update loader animation
    this.startWorking(`Executing ${toolName}...`);

    this.tui.requestRender();
  }

  // Update tool call with diff rendering
  updateToolCallDiff(_toolName: string, diffText: string): void {
    if (!this.currentTool) return;

    // Update the tool component with diff
    this.currentTool.updateContentWithDiff(diffText, false);
    this.tui.requestRender();
  }

  setToolResult(toolName: string, result: string, isError = false): void {
    if (this.currentTool) {
      // Remove previous tool component
      this.chatContainer.removeChild(this.currentTool);
    }

    const tc = new ToolExecutionComponent(toolName, result, isError);
    this.chatContainer.addChild(tc);
    this.toolComponents.push(tc);

    this.currentTool = null;

    // If assistant is still running, keep the loader going
    if (!this.isAssistantRunning) {
      this.stopWorking();
    } else {
      // Update loader message back to generic "Working..."
      this.startWorking();
    }
    this.tui.requestRender();
  }

  // ── Clear state ────────────────────────────────────────────────────
  clearMessages(): void {
    this.chatContainer.clear();
    this.accumulatedContent = "";
    this.accumulatedReasoning = "";
    this.isAssistantRunning = false;
    this.currentTool = null;
    this.toolComponents = [];
    this.stopWorking();
    this.tui.requestRender();
  }

  // ── Tool state management ───────────────────────────────────────────
  getCurrentTool(): ToolExecutionComponent | null {
    return this.currentTool;
  }

  // ── Toggle tool result expansion ─────────────────────────────────
  // Mirrors pi-coding-agent's toggleToolOutputExpansion()
  toggleToolExpansion(): void {
    const currentExpanded =
      this.toolComponents.length > 0 ? this.toolComponents[0].expanded : false;
    const newExpanded = !currentExpanded;
    for (const tool of this.toolComponents) {
      tool.setExpanded(newExpanded);
    }
    this.tui.requestRender();
  }

  setCurrentTool(tool: ToolExecutionComponent | null): void {
    this.currentTool = tool;
  }

  // ── Footer ─────────────────────────────────────────────────────────
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
        (e) => {
          const payload = e as { text?: string };
          if (payload.text) {
            this.updateReasoning(payload.text);
          }
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
            .filter((b) => b.type === "text" && b.text)
            .map((b) => b.text ?? "")
            .join("\n");
          this.setToolResult(
            payload.toolName,
            resultText || JSON.stringify(payload.result),
            payload.isError ?? false,
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
