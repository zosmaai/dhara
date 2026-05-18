/**
 * Tests for the Dhara TUI components built on @earendil-works/pi-tui.
 *
 * Tests the custom Dhara components: theme, header, footer, messages, and DharaApp.
 */

import { Container, Text } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import {
  AssistantMessageComponent,
  color,
  ErrorMessageComponent,
  FooterComponent,
  getEditorTheme,
  getMarkdownTheme,
  getSelectListTheme,
  getSettingsListTheme,
  HeaderComponent,
  SystemMessageComponent,
  ToolExecutionComponent,
  UserMessageComponent,
} from "./index.js";

// ── Theme Tests ─────────────────────────────────────────────────────

describe("dhara-theme", () => {
  it("getMarkdownTheme returns all required functions", () => {
    const theme = getMarkdownTheme();
    expect(theme.heading).toBeInstanceOf(Function);
    expect(theme.link).toBeInstanceOf(Function);
    expect(theme.linkUrl).toBeInstanceOf(Function);
    expect(theme.code).toBeInstanceOf(Function);
    expect(theme.codeBlock).toBeInstanceOf(Function);
    expect(theme.codeBlockBorder).toBeInstanceOf(Function);
    expect(theme.quote).toBeInstanceOf(Function);
    expect(theme.quoteBorder).toBeInstanceOf(Function);
    expect(theme.hr).toBeInstanceOf(Function);
    expect(theme.listBullet).toBeInstanceOf(Function);
    expect(theme.bold).toBeInstanceOf(Function);
    expect(theme.italic).toBeInstanceOf(Function);
    expect(theme.strikethrough).toBeInstanceOf(Function);
    expect(theme.underline).toBeInstanceOf(Function);
  });

  it("markdown theme functions return styled strings", () => {
    const theme = getMarkdownTheme();
    const output = theme.heading("Hello");
    expect(output).toBeTruthy();
    expect(output).toContain("Hello");
    // All theme functions return non-empty strings
    expect(theme.link("a")).toBeTruthy();
    expect(theme.code("a")).toBeTruthy();
    expect(theme.bold("a")).toBeTruthy();
    expect(theme.italic("a")).toBeTruthy();
  });

  it("getEditorTheme returns borderColor and selectList", () => {
    const theme = getEditorTheme();
    const borderResult = theme.borderColor("test");
    expect(borderResult).toBeTruthy();
    expect(borderResult).toContain("test");
    expect(theme.selectList.selectedPrefix).toBeInstanceOf(Function);
    expect(theme.selectList.selectedText).toBeInstanceOf(Function);
  });

  it("getSelectListTheme returns all style functions", () => {
    const theme = getSelectListTheme();
    expect(theme.selectedPrefix("a")).toContain("▸");
    expect(theme.selectedText("b")).toContain("b");
    expect(theme.description("c")).toContain("c");
  });

  it("getSettingsListTheme returns all style functions", () => {
    const theme = getSettingsListTheme();
    expect(theme.label("test", false)).toBeTruthy();
    expect(theme.label("test", true)).toBeTruthy();
    expect(typeof theme.cursor).toBe("string");
    expect(theme.hint("h")).toBeTruthy();
  });

  it("color helpers return expected text with styling", () => {
    // Test that each color helper returns a string containing the input
    expect(color.accent("text")).toContain("text");
    expect(color.dim("text")).toContain("text");
    expect(color.muted("text")).toContain("text");
    expect(color.success("text")).toContain("text");
    expect(color.error("text")).toContain("text");
    expect(color.bold("text")).toContain("text");
    expect(color.userMsgBg("text")).toContain("text");
    expect(color.toolPendingBg("text")).toContain("text");
    expect(color.toolSuccessBg("text")).toContain("text");
    expect(color.toolErrorBg("text")).toContain("text");
  });
});

// ── Header Component ────────────────────────────────────────────────

describe("HeaderComponent", () => {
  it("renders logo and instructions", () => {
    const header = new HeaderComponent("0.2.0");
    const lines = header.render(80);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    const joined = lines.join("");
    expect(joined).toContain("dhara");
    expect(joined).toContain("v0.2.0");
    expect(joined).toContain("Ctrl+C");
    expect(joined).toContain("Ctrl+D");
    expect(joined).toContain("Shift+Enter");
  });

  it("adapts to different widths", () => {
    const header = new HeaderComponent("1.0.0");
    const wide = header.render(120);
    const narrow = header.render(40);

    // Both should contain key information
    expect(wide.join("")).toContain("dhara");
    expect(narrow.join("")).toContain("dhara");
  });
});

// ── Footer Component ────────────────────────────────────────────────

describe("FooterComponent", () => {
  it("renders provider and model", () => {
    const footer = new FooterComponent({
      provider: "openai",
      model: "gpt-4o",
      cwd: "/home/test",
    });
    const lines = footer.render(80);
    const joined = lines.join("");
    expect(joined).toContain("openai");
    expect(joined).toContain("gpt-4o");
    expect(joined).toContain("/home/test");
  });

  it("renders session ID", () => {
    const footer = new FooterComponent({
      provider: "test",
      model: "m1",
      cwd: "~",
      sessionId: "abc12345",
    });
    const lines = footer.render(80);
    expect(lines.join("")).toContain("abc12345");
  });

  it("renders token counts", () => {
    const footer = new FooterComponent({
      provider: "test",
      model: "m1",
      cwd: "~",
      tokens: { input: 1200, output: 450 },
    });
    const lines = footer.render(80);
    const joined = lines.join("");
    expect(joined).toContain("1.2k");
  });

  it("updates state on update()", () => {
    const footer = new FooterComponent({
      provider: "test",
      model: "m1",
      cwd: "~",
      state: "idle",
    });
    footer.update({ state: "thinking" });
    const lines = footer.render(80);
    expect(lines.join("")).toContain("◐");
  });

  it("handles narrow widths", () => {
    const footer = new FooterComponent({
      provider: "anthropic",
      model: "claude-opus-4-20250514",
      cwd: "/very/long/path/to/some/project",
    });
    // Should not crash on narrow terminal
    const lines = footer.render(20);
    expect(lines.length).toBeGreaterThan(0);
  });
});

// ── User Message Component ─────────────────────────────────────────

describe("UserMessageComponent", () => {
  it("renders user label and content", () => {
    const msg = new UserMessageComponent("Hello world");
    const lines = msg.render(80);
    const joined = lines.join("\n");
    expect(joined).toContain("You");
    expect(joined).toContain("Hello world");
  });
});

// ── Assistant Message Component ─────────────────────────────────────

describe("AssistantMessageComponent", () => {
  it("renders assistant label and content", () => {
    const msg = new AssistantMessageComponent("Hi there!");
    const lines = msg.render(80);
    const joined = lines.join("\n");
    expect(joined).toContain("Dhara");
    expect(joined).toContain("Hi there");
  });

  it("renders reasoning text when provided", () => {
    const msg = new AssistantMessageComponent("Answer", "Let me think...");
    const lines = msg.render(80);
    const joined = lines.join("\n");
    expect(joined).toContain("think");
    expect(joined).toContain("Let me think");
  });

  it("updates content via updateContent", () => {
    const msg = new AssistantMessageComponent("Initial");
    msg.updateContent("Updated content");
    const lines = msg.render(80);
    const joined = lines.join("\n");
    expect(joined).toContain("Updated content");
    expect(joined).not.toContain("Initial");
  });
});

// ── Tool Execution Component ────────────────────────────────────────

describe("ToolExecutionComponent", () => {
  it("renders tool name and content", () => {
    const msg = new ToolExecutionComponent("bash", "ls -la");
    const lines = msg.render(80);
    const joined = lines.join("\n");
    expect(joined).toContain("bash");
    expect(joined).toContain("ls -la");
  });

  it("shows error icon for error state", () => {
    const msg = new ToolExecutionComponent("bash", "error msg", true);
    const lines = msg.render(80);
    const joined = lines.join("\n");
    expect(joined).toContain("✗");
  });
});

// ── Error Message Component ─────────────────────────────────────────

describe("ErrorMessageComponent", () => {
  it("renders error label and message", () => {
    const msg = new ErrorMessageComponent("Something failed");
    const lines = msg.render(80);
    const joined = lines.join("\n");
    expect(joined).toContain("Error");
    expect(joined).toContain("Something failed");
  });
});

// ── System Message Component ────────────────────────────────────────

describe("SystemMessageComponent", () => {
  it("renders system message", () => {
    const msg = new SystemMessageComponent("Configuration reloaded");
    const lines = msg.render(80);
    const joined = lines.join("\n");
    expect(joined).toContain("Configuration reloaded");
  });
});

// ── Container Composition ───────────────────────────────────────────

describe("Container composition", () => {
  it("renders multiple messages sequentially", () => {
    const container = new Container();
    container.addChild(new UserMessageComponent("Hello"));
    container.addChild(new AssistantMessageComponent("World"));

    const lines: string[] = [];
    for (const child of container.children) {
      for (const l of child.render(80)) lines.push(l);
    }

    const joined = lines.join("\n");
    expect(joined).toContain("You");
    expect(joined).toContain("Hello");
    expect(joined).toContain("Dhara");
    expect(joined).toContain("World");
  });
});
