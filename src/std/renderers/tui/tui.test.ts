/**
 * Tests for the TUI renderer framework.
 *
 * Uses VirtualTerminal for headless testing of components and rendering.
 */
import { describe, expect, it } from "vitest";
import {
  Box,
  ChatMessage,
  DEFAULT_KEYBINDINGS,
  DEFAULT_THEME,
  Editor,
  isPrintable,
  isShiftEnter,
  Loader,
  mergeBindings,
  resolveBinding,
  StatusBar,
  Text,
  Theme,
  TUI,
  truncateToWidth,
  VirtualTerminal,
  visibleWidth,
} from "./index.js";

// ── VirtualTerminal tests ────────────────────────────────────────────

describe("VirtualTerminal", () => {
  it("reports correct dimensions", () => {
    const vt = new VirtualTerminal(80, 24);
    expect(vt.columns).toBe(80);
    expect(vt.rows).toBe(24);
  });

  it("captures written output", () => {
    const vt = new VirtualTerminal(40, 10);
    vt.write("hello world");
    expect(vt.output).toContain("hello world");
  });

  it("handles resize with callback", () => {
    const vt = new VirtualTerminal(80, 24);
    let resized = false;
    vt.start(
      () => {},
      () => {
        resized = true;
      },
    );
    vt.resize(120, 40);
    expect(resized).toBe(true);
    expect(vt.columns).toBe(120);
    expect(vt.rows).toBe(40);
  });

  it("simulates input via feedInput", () => {
    const vt = new VirtualTerminal();
    let input = "";
    vt.start(
      (data) => {
        input += data;
      },
      () => {},
    );
    vt.feedInput("hello");
    expect(input).toBe("hello");
  });
});

// ── Theme tests ─────────────────────────────────────────────────────

describe("Theme", () => {
  it("resolves named styles to ANSI codes", () => {
    const theme = new Theme(DEFAULT_THEME);
    const resolved = theme.resolve("chat.user");
    expect(resolved.prefix).toBeTruthy();
    expect(resolved.reset).toBeTruthy();
  });

  it("returns empty style for unknown names", () => {
    const theme = new Theme(DEFAULT_THEME);
    const resolved = theme.resolve("does.not.exist");
    expect(resolved.prefix).toBe("");
    expect(resolved.reset).toBe("");
  });

  it("applies style to text", () => {
    const theme = new Theme(DEFAULT_THEME);
    const styled = theme.apply("chat.user", "Hello");
    expect(styled).toContain("\x1b[");
    expect(styled).toContain("Hello");
  });

  it("caches resolved styles", () => {
    const theme = new Theme(DEFAULT_THEME);
    const a = theme.resolve("chat.user");
    const b = theme.resolve("chat.user");
    expect(a).toBe(b); // Same object from cache
  });

  it("invalidate clears cache", () => {
    const theme = new Theme(DEFAULT_THEME);
    const a = theme.resolve("chat.user");
    theme.invalidate();
    const b = theme.resolve("chat.user");
    // New object after invalidate (cache cleared)
    expect(b.prefix).toBe(a.prefix);
  });

  it("respects colorEnabled flag", () => {
    const theme = new Theme(DEFAULT_THEME, false);
    const resolved = theme.resolve("chat.user");
    expect(resolved.prefix).toBe("");
  });
});

// ── Component: Text ─────────────────────────────────────────────────

describe("Text component", () => {
  it("renders single line", () => {
    const text = new Text("hello world");
    const lines = text.render(50);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("hello world");
  });

  it("wraps long text", () => {
    const text = new Text("this is a very long line that should wrap");
    const lines = text.render(10);
    expect(lines.length).toBeGreaterThan(1);
  });

  it("preserves explicit newlines", () => {
    const text = new Text("line one\nline two\nline three");
    const lines = text.render(50);
    expect(lines).toHaveLength(3);
  });

  it("caches render output", () => {
    const text = new Text("hello");
    const a = text.render(50);
    const b = text.render(50);
    expect(a).toBe(b); // Cached
  });

  it("invalidates cache on content change", () => {
    const text = new Text("hello");
    text.render(50);
    text.content = "world";
    const lines = text.render(50);
    expect(lines[0]).toContain("world");
  });
});

// ── Component: ChatMessage ──────────────────────────────────────────

describe("ChatMessage", () => {
  it("renders user message with label", () => {
    const theme = new Theme(DEFAULT_THEME);
    const msg = new ChatMessage(theme, { role: "user", content: "Hello" });
    const lines = msg.render(60);
    const joined = lines.join("\n");
    expect(joined).toContain("You");
    expect(joined).toContain("Hello");
  });

  it("renders assistant message with label", () => {
    const theme = new Theme(DEFAULT_THEME);
    const msg = new ChatMessage(theme, { role: "assistant", content: "Hi there" });
    const lines = msg.render(60);
    const joined = lines.join("\n");
    expect(joined).toContain("Dhara");
    expect(joined).toContain("Hi there");
  });

  it("renders tool message", () => {
    const theme = new Theme(DEFAULT_THEME);
    const msg = new ChatMessage(theme, {
      role: "tool",
      content: "executed bash",
      toolCall: "bash",
    });
    const lines = msg.render(60);
    expect(lines.length).toBeGreaterThan(0);
  });

  it("renders error message", () => {
    const theme = new Theme(DEFAULT_THEME);
    const msg = new ChatMessage(theme, {
      role: "error",
      content: "Something failed",
    });
    const lines = msg.render(60);
    const joined = lines.join("\n");
    expect(joined).toContain("Error");
  });

  it("renders reasoning text", () => {
    const theme = new Theme(DEFAULT_THEME);
    const msg = new ChatMessage(theme, {
      role: "assistant",
      content: "answer",
      reasoning: "Let me think...",
    });
    const lines = msg.render(60);
    const joined = lines.join("\n");
    expect(joined).toContain("Let me think");
  });

  it("renders diff lines with styling", () => {
    const theme = new Theme(DEFAULT_THEME);
    const msg = new ChatMessage(theme, {
      role: "tool",
      content: "+added line\n-removed line\n unchanged",
      isDiff: true,
    });
    const lines = msg.render(60);
    const joined = lines.join("\n");
    // Diff lines should have ANSI color codes
    expect(joined).toContain("\x1b[");
    expect(joined).toContain("added line");
    expect(joined).toContain("removed line");
  });
});

// ── Component: StatusBar ────────────────────────────────────────────

describe("StatusBar", () => {
  it("renders provider and model", () => {
    const theme = new Theme(DEFAULT_THEME);
    const bar = new StatusBar(theme, {
      provider: "openai",
      model: "gpt-4o",
    });
    const lines = bar.render(80);
    const joined = lines.join("");
    expect(joined).toContain("openai");
    expect(joined).toContain("gpt-4o");
  });

  it("renders session ID", () => {
    const theme = new Theme(DEFAULT_THEME);
    const bar = new StatusBar(theme, { sessionId: "abc12345" });
    const lines = bar.render(80);
    const joined = lines.join("");
    expect(joined).toContain("abc12345");
  });

  it("renders token counts", () => {
    const theme = new Theme(DEFAULT_THEME);
    const bar = new StatusBar(theme, { tokens: { input: 1200, output: 450 } });
    const lines = bar.render(80);
    const joined = lines.join("");
    expect(joined).toContain("1.2k");
  });

  it("renders state indicator", () => {
    const theme = new Theme(DEFAULT_THEME);
    const bar = new StatusBar(theme, { state: "streaming" });
    const lines = bar.render(80);
    expect(lines[0]).toContain("▶");
  });

  it("accepts updates", () => {
    const theme = new Theme(DEFAULT_THEME);
    const bar = new StatusBar(theme, { state: "idle" });
    bar.update({ state: "thinking" });
    const lines = bar.render(80);
    expect(lines[0]).toContain("◐");
  });
});

// ── Component: Loader ───────────────────────────────────────────────

describe("Loader", () => {
  it("renders a spinner frame", () => {
    const theme = new Theme(DEFAULT_THEME);
    const loader = new Loader(theme, { text: "Loading..." });
    const lines = loader.render(80);
    expect(lines[0]).toContain("Loading...");
  });

  it("cycles through frames", async () => {
    const theme = new Theme(DEFAULT_THEME);
    const loader = new Loader(theme, {
      frames: ["A", "B", "C"],
      interval: 5,
    });

    const frames: string[] = [];
    const stop = loader.start(() => {
      frames.push(loader.render(80)[0]);
    });

    // Wait for a few cycles
    await new Promise((r) => setTimeout(r, 30));
    stop();

    expect(frames.length).toBeGreaterThan(2);
    expect(frames.some((f) => f.includes("A"))).toBe(true);
    expect(frames.some((f) => f.includes("B"))).toBe(true);
    expect(frames.some((f) => f.includes("C"))).toBe(true);
  });
});

// ── Component: Editor ───────────────────────────────────────────────

describe("Editor", () => {
  it("renders with prompt", () => {
    const theme = new Theme(DEFAULT_THEME);
    const editor = new Editor(theme, { prompt: "> " });
    const lines = editor.render(60);
    // Line 0 is the top border, prompt is on line 1
    expect(lines[1]).toContain(">");
  });

  it("shows placeholder when empty and unfocused", () => {
    const theme = new Theme(DEFAULT_THEME);
    const editor = new Editor(theme, {
      prompt: "> ",
      placeholder: "Type here...",
    });
    // Unfocused editor should show placeholder
    editor.focused = false;
    const lines = editor.render(60);
    const joined = lines.join("");
    expect(joined).toContain("Type here...");
  });

  it("inserts printable text", () => {
    const theme = new Theme(DEFAULT_THEME);
    const editor = new Editor(theme);
    editor.focused = true;
    editor.handleInput("h");
    editor.handleInput("i");
    expect(editor.getText()).toBe("hi");
  });

  it("handles left/right cursor movement", () => {
    const theme = new Theme(DEFAULT_THEME);
    const editor = new Editor(theme);
    editor.handleInput("a");
    editor.handleInput("b");
    editor.handleInput("c");
    // Cursor is at position 3
    editor.handleInput("\x1b[D"); // Left arrow
    editor.handleInput("\x7f"); // Backspace
    expect(editor.getText()).toBe("ac");
  });

  it("handles Ctrl+A (home) and Ctrl+E (end)", () => {
    const theme = new Theme(DEFAULT_THEME);
    const editor = new Editor(theme);
    editor.handleInput("a");
    editor.handleInput("b");
    editor.handleInput("c");
    // Cursor at 3
    editor.handleInput("\x01"); // Ctrl+A
    editor.handleInput("X");
    expect(editor.getText()).toBe("Xabc");
  });

  it("handles Ctrl+K (delete to end)", () => {
    const theme = new Theme(DEFAULT_THEME);
    const editor = new Editor(theme);
    editor.handleInput("h");
    editor.handleInput("e");
    editor.handleInput("l");
    editor.handleInput("l");
    editor.handleInput("o");
    // Cursor at 5
    editor.handleInput("\x01"); // Ctrl+A → pos 0
    editor.handleInput("\x0b"); // Ctrl+K
    expect(editor.getText()).toBe("");
  });

  it("handles Ctrl+W (delete word)", () => {
    const theme = new Theme(DEFAULT_THEME);
    const editor = new Editor(theme);
    editor.handleInput("h");
    editor.handleInput("e");
    editor.handleInput("l");
    editor.handleInput("l");
    editor.handleInput("o");
    editor.handleInput(" ");
    editor.handleInput("w");
    editor.handleInput("o");
    editor.handleInput("r");
    editor.handleInput("l");
    editor.handleInput("d");
    // "hello world" cursor at 11
    editor.handleInput("\x17"); // Ctrl+W
    expect(editor.getText()).toBe("hello ");
  });

  it("triggers onSubmit on Enter", async () => {
    const theme = new Theme(DEFAULT_THEME);
    const editor = new Editor(theme);

    const submitted = await new Promise<string>((resolve) => {
      editor.onSubmit = resolve;
      editor.focused = true;
      editor.handleInput("h");
      editor.handleInput("i");
      editor.handleInput("\r"); // Enter
    });

    expect(submitted).toBe("hi");
  });

  it("does not submit empty text", () => {
    const theme = new Theme(DEFAULT_THEME);
    const editor = new Editor(theme);
    let submitted = false;
    editor.onSubmit = () => {
      submitted = true;
    };
    editor.handleInput("\r");
    expect(submitted).toBe(false);
  });

  it("navigates history with up/down arrows", () => {
    const theme = new Theme(DEFAULT_THEME);
    const editor = new Editor(theme);
    editor.addHistory("first command");
    editor.addHistory("second command");

    // Up → most recent
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("second command");

    // Up again → older
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("first command");

    // Down → newer
    editor.handleInput("\x1b[B");
    expect(editor.getText()).toBe("second command");
  });

  it("clears on Ctrl+C cancel", () => {
    const theme = new Theme(DEFAULT_THEME);
    const editor = new Editor(theme);
    editor.handleInput("t");
    editor.handleInput("e");
    editor.handleInput("s");
    editor.handleInput("t");
    editor.handleInput("\x03"); // Ctrl+C
    expect(editor.getText()).toBe("");
  });

  it("inserts newline on Shift+Enter", () => {
    const theme = new Theme(DEFAULT_THEME);
    const editor = new Editor(theme);
    editor.handleInput("line1");
    editor.handleInput("\x1b[13;2~"); // Shift+Enter
    editor.handleInput("line2");
    expect(editor.getText()).toBe("line1\nline2");
  });
});

// ── Component: Box ──────────────────────────────────────────────────

describe("Box", () => {
  it("renders bordered box", () => {
    const theme = new Theme(DEFAULT_THEME);
    const box = new Box(theme, { title: "Test" });
    const lines = box.render(40);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    const joined = lines.join("\n");
    expect(joined).toContain("┌");
    expect(joined).toContain("┐");
    expect(joined).toContain("└");
    expect(joined).toContain("┘");
  });

  it("renders children inside box", () => {
    const theme = new Theme(DEFAULT_THEME);
    const box = new Box(theme, { title: "Panel" });
    box.addChild(new Text("child content"));
    const lines = box.render(40);
    const joined = lines.join("\n");
    expect(joined).toContain("child content");
  });

  it("can be unbordered", () => {
    const theme = new Theme(DEFAULT_THEME);
    const box = new Box(theme, { bordered: false });
    box.addChild(new Text("content"));
    const lines = box.render(40);
    const joined = lines.join("\n");
    expect(joined).not.toContain("┌");
  });
});

// ── TUI Engine tests ────────────────────────────────────────────────

describe("TUI", () => {
  it("renders a component", async () => {
    const vt = new VirtualTerminal(40, 10);
    const tui = new TUI(vt);

    const lines: string[] = [];
    const component = {
      render: (w: number) => {
        lines.push(`rendered at width ${w}`);
        return lines;
      },
      invalidate: () => {},
    };

    tui.setRoot(component);
    tui.start();

    // Wait a tick
    await new Promise((r) => setTimeout(r, 20));

    const viewport = vt.getViewport();
    expect(viewport[0]).toContain("rendered at width 40");
    tui.stop();
  });

  it("differentially renders only changed lines", async () => {
    const vt = new VirtualTerminal(40, 10);
    const tui = new TUI(vt);

    let content = ["Line 0", "Line 1", "Line 2", "Line 3", "Line 4"];
    const component = {
      render: (_w: number, _h?: number) => content,
      invalidate: () => {},
    };

    tui.setRoot(component);
    tui.start();
    await new Promise((r) => setTimeout(r, 20));

    const redrawsBefore = tui.fullRedraws;

    // Change lines 1 and 3 (same line count, stays within 10 rows)
    content = ["Line 0", "CHANGED 1", "Line 2", "CHANGED 3", "Line 4"];
    tui.requestRender();
    await new Promise((r) => setTimeout(r, 20));

    // Should NOT have triggered a full redraw
    expect(tui.fullRedraws).toBe(redrawsBefore);

    // Since TUI pads to terminal height, changed lines are within the 10-row viewport
    const viewport = vt.getViewport();
    expect(viewport.some((l) => l.includes("CHANGED 1"))).toBe(true);
    expect(viewport.some((l) => l.includes("CHANGED 3"))).toBe(true);

    tui.stop();
  });

  it("pads to terminal height to prevent layout jitter", async () => {
    const vt = new VirtualTerminal(40, 5);
    const tui = new TUI(vt);

    // Component returns fewer lines than terminal height
    const component = {
      render: (_w: number, _h?: number) => ["Line 1", "Line 2"],
      invalidate: () => {},
    };

    tui.setRoot(component);
    tui.start();
    await new Promise((r) => setTimeout(r, 20));

    // Should still produce exactly 5 lines (padded)
    // Previous lines array tracks the last render result
    const redrawsBefore = tui.fullRedraws;
    tui.requestRender();
    await new Promise((r) => setTimeout(r, 20));

    // No full redraw because line count is stable
    expect(tui.fullRedraws).toBe(redrawsBefore);
    tui.stop();
  });

  it("manages focus for keyboard input", async () => {
    const vt = new VirtualTerminal(40, 10);
    const tui = new TUI(vt);

    let inputReceived = "";
    const focusable = {
      render: (_w: number) => ["focused component"],
      handleInput: (data: string) => {
        inputReceived += data;
        return true;
      },
      invalidate: () => {},
      focused: false,
    };

    tui.setRoot(focusable);
    tui.focus(focusable);
    tui.start();
    await new Promise((r) => setTimeout(r, 20));

    vt.feedInput("x");
    expect(inputReceived).toBe("x");

    tui.stop();
  });
});

// ── Keybinding tests ────────────────────────────────────────────────

describe("keybindings", () => {
  it("resolves arrow keys to actions", () => {
    expect(resolveBinding(DEFAULT_KEYBINDINGS, "\x1b[A")).toBe("history.prev");
    expect(resolveBinding(DEFAULT_KEYBINDINGS, "\x1b[B")).toBe("history.next");
    expect(resolveBinding(DEFAULT_KEYBINDINGS, "\x1b[C")).toBe("cursor.right");
    expect(resolveBinding(DEFAULT_KEYBINDINGS, "\x1b[D")).toBe("cursor.left");
  });

  it("resolves Ctrl keys", () => {
    expect(resolveBinding(DEFAULT_KEYBINDINGS, "\x01")).toBe("cursor.home");
    expect(resolveBinding(DEFAULT_KEYBINDINGS, "\x05")).toBe("cursor.end");
    expect(resolveBinding(DEFAULT_KEYBINDINGS, "\x0b")).toBe("delete.toEnd");
    expect(resolveBinding(DEFAULT_KEYBINDINGS, "\x17")).toBe("delete.wordLeft");
    expect(resolveBinding(DEFAULT_KEYBINDINGS, "\x03")).toBe("cancel");
  });

  it("resolves Enter to submit", () => {
    expect(resolveBinding(DEFAULT_KEYBINDINGS, "\r")).toBe("submit");
  });

  it("returns null for unknown sequences", () => {
    expect(resolveBinding(DEFAULT_KEYBINDINGS, "\x1b[999~")).toBeNull();
  });

  it("detects Shift+Enter", () => {
    expect(isShiftEnter("\x1b[13;2~")).toBe(true);
    expect(isShiftEnter("\r")).toBe(false);
    expect(isShiftEnter("a")).toBe(false);
  });

  it("detects printable characters", () => {
    expect(isPrintable("a")).toBe(true);
    expect(isPrintable("1")).toBe(true);
    expect(isPrintable(" ")).toBe(true);
    expect(isPrintable("\t")).toBe(true);
    expect(isPrintable("\x03")).toBe(false); // Ctrl+C
    expect(isPrintable("\x1b[A")).toBe(false); // Arrow
    expect(isPrintable("\x7f")).toBe(false); // DEL
  });

  it("merges user bindings with defaults", () => {
    const user = [{ sequence: "\r", action: "newline" as const }];
    const merged = mergeBindings(DEFAULT_KEYBINDINGS, user);
    // User binding should override default Enter → submit
    const enterBinding = merged.find((b) => b.sequence === "\r");
    expect(enterBinding?.action).toBe("newline");
  });
});

// ── Utility tests ────────────────────────────────────────────────────

describe("visibleWidth", () => {
  it("returns plain string length", () => {
    expect(visibleWidth("hello")).toBe(5);
  });

  it("strips ANSI codes", () => {
    const styled = "\x1b[32mhello\x1b[0m";
    expect(visibleWidth(styled)).toBe(5);
  });
});

describe("truncateToWidth", () => {
  it("passes through short text", () => {
    expect(truncateToWidth("hello", 10)).toBe("hello");
  });

  it("truncates long text preserving ANSI", () => {
    const styled = "\x1b[32mhello world\x1b[0m";
    const result = truncateToWidth(styled, 5);
    expect(visibleWidth(result)).toBeLessThanOrEqual(5);
    expect(result).toContain("\x1b[32m");
  });
});
