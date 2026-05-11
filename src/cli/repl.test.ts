import { describe, expect, it } from "vitest";
import { parseInput } from "./repl.js";

describe("parseInput", () => {
  it("parses a plain prompt", () => {
    expect(parseInput("hello")).toEqual({ type: "prompt", text: "hello" });
  });

  it("parses a prompt with multiple words", () => {
    expect(parseInput("create a new next.js project")).toEqual({
      type: "prompt",
      text: "create a new next.js project",
    });
  });

  it("trims leading and trailing whitespace from prompts", () => {
    expect(parseInput("  hello world  ")).toEqual({
      type: "prompt",
      text: "hello world",
    });
  });

  it("parses /exit command", () => {
    expect(parseInput("/exit")).toEqual({ type: "exit" });
  });

  it("parses /quit alias", () => {
    expect(parseInput("/quit")).toEqual({ type: "exit" });
  });

  it("parses /save command", () => {
    expect(parseInput("/save")).toEqual({ type: "save" });
  });

  it("parses /list command", () => {
    expect(parseInput("/list")).toEqual({ type: "list" });
  });

  it("parses /help command", () => {
    expect(parseInput("/help")).toEqual({ type: "help" });
  });

  it("parses /resume with a session ID", () => {
    expect(parseInput("/resume abc123")).toEqual({
      type: "resume",
      sessionId: "abc123",
    });
  });

  it("parses /resume with extra whitespace", () => {
    expect(parseInput("  /resume   abc123  ")).toEqual({
      type: "resume",
      sessionId: "abc123",
    });
  });

  it("treats unknown slash commands as prompts", () => {
    expect(parseInput("/foo")).toEqual({ type: "prompt", text: "/foo" });
  });

  it("treats /resume without ID as a prompt", () => {
    expect(parseInput("/resume")).toEqual({ type: "prompt", text: "/resume" });
  });

  it("handles empty input", () => {
    expect(parseInput("")).toEqual({ type: "prompt", text: "" });
  });

  it("handlines whitespace-only input", () => {
    expect(parseInput("   ")).toEqual({ type: "prompt", text: "" });
  });
});

it("parses /history without count", () => {
  expect(parseInput("/history")).toEqual({ type: "history", count: 10 });
});

it("parses /history with a count", () => {
  expect(parseInput("/history 5")).toEqual({ type: "history", count: 5 });
});

it("parses /history with invalid count defaults to 10", () => {
  expect(parseInput("/history abc")).toEqual({ type: "history", count: 10 });
});

it("parses /history with negative count defaults to 1", () => {
  expect(parseInput("/history -3")).toEqual({ type: "history", count: 1 });
});
