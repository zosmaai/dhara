import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import type { TUI } from "@earendil-works/pi-tui";
import type { ModelRef } from "../core/session.js";
import type { PersistedSession, SessionManager } from "../core/session-manager.js";
import type { DharaApp } from "../std/renderers/tui/dhara-app.js";

// ── Types ─────────────────────────────────────────────────────────────────

type SwitchToSessionFn = (session: PersistedSession) => void;

// ── /import — Import JSONL Session ───────────────────────────────────────

/**
 * Handle `/import <path>` — load a JSONL session file into a new session.
 *
 * Format matches what session.export() produces:
 * - First line: `{"type":"meta",...}`
 * - Subsequent lines: session entries as JSON
 */
export function handleImport(
  tui: TUI,
  chat: DharaApp,
  sessionManager: SessionManager,
  cwd: string,
  modelId: string,
  providerName: string,
  switchToSession: SwitchToSessionFn,
  args: string,
): void {
  const filePath = args.trim();

  if (!filePath) {
    chat.addMessage({
      role: "system",
      content:
        "Usage: /import <path>\nImports a JSONL session file. The file should be in the format produced by /export.",
    });
    tui.requestRender();
    return;
  }

  let fileData: string;
  try {
    fileData = readFileSync(filePath, "utf-8");
  } catch (err) {
    chat.addMessage({
      role: "error",
      content: `Cannot read file: ${err instanceof Error ? err.message : String(err)}`,
    });
    tui.requestRender();
    return;
  }

  if (!fileData.trim()) {
    chat.addMessage({
      role: "error",
      content: "File is empty.",
    });
    tui.requestRender();
    return;
  }

  // Validate: first line must contain meta
  const lines = fileData.split("\n").filter((l) => l.trim());
  try {
    const first = JSON.parse(lines[0]) as Record<string, unknown>;
    if (first.type !== "meta") {
      chat.addMessage({
        role: "error",
        content:
          'Invalid session file: first line must be a JSONL meta entry ({"type":"meta",...}).',
      });
      tui.requestRender();
      return;
    }
  } catch {
    chat.addMessage({
      role: "error",
      content: "Invalid JSONL format: first line is not valid JSON.",
    });
    tui.requestRender();
    return;
  }

  // Create a new session and import
  let newSession: PersistedSession;
  try {
    // Parse meta to extract cwd and model for session creation
    const meta = JSON.parse(lines[0]) as {
      type: string;
      cwd?: string;
      model?: ModelRef;
      name?: string;
    };

    newSession = sessionManager.create({
      cwd: meta.cwd ?? cwd,
      model: meta.model ?? { id: modelId, provider: providerName },
    });

    // Restore name if present
    if (meta.name) {
      newSession.meta.name = meta.name;
    }

    // Import entries (this replaces the blank session's content)
    newSession.import(fileData);

    // Save to persist
    newSession.save();

    // Switch to the imported session
    switchToSession(newSession);
    chat.addMessage({
      role: "system",
      content: `Imported session from ${filePath}\nSession ID: ${newSession.meta.sessionId}${newSession.meta.name ? `, Name: ${newSession.meta.name}` : ""}`,
    });
  } catch (err) {
    chat.addMessage({
      role: "error",
      content: `Import failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
  tui.requestRender();
}

// ── /share — Export as GitHub Gist ───────────────────────────────────────

/**
 * Handle `/share` — export session as a secret GitHub Gist and get a
 * shareable URL. Uses the `gh` CLI tool.
 */
export function handleShare(tui: TUI, chat: DharaApp, session: PersistedSession): void {
  const exportData = session.export();
  if (!exportData.trim()) {
    chat.addMessage({
      role: "system",
      content: "Session is empty. Nothing to share.",
    });
    tui.requestRender();
    return;
  }

  // Build session content for the gist
  const entries = session
    .getPath()
    .map((id) => session.getEntry(id))
    .filter((e): e is import("../core/session.js").SessionEntry => e?.type === "entry");

  // Create a human-readable markdown version for the gist
  const gistContent = [
    `# Session: ${session.meta.name ?? session.meta.sessionId}`,
    `- **Provider**: ${session.meta.model?.provider ?? "unknown"}`,
    `- **Model**: ${session.meta.model?.id ?? "unknown"}`,
    `- **Created**: ${session.meta.createdAt}`,
    `- **Entries**: ${entries.length}`,
    "",
    "## Conversation",
    "",
    ...entries.map((e) => {
      const textContent = e.content
        .filter((c): c is typeof c & { text: string } => c.type === "text" && !!c.text)
        .map((c) => c.text)
        .join("\n");

      if (e.role === "user") return `### 👤 User\n\n${textContent}\n`;
      if (e.role === "assistant") {
        const toolCalls = e.toolCalls?.length
          ? `\n\n*Tool calls: ${e.toolCalls.map((t) => `\`${t.name}\``).join(", ")}*`
          : "";
        return `### 🤖 Assistant\n\n${textContent}${toolCalls}\n`;
      }
      if (e.role === "tool_result") {
        return `### 🔧 Tool Result (${e.toolName ?? "unknown"})\n\n${textContent.slice(0, 200)}${textContent.length > 200 ? "..." : ""}\n`;
      }
      return `### 📋 System\n\n${textContent}\n`;
    }),
  ].join("\n");

  chat.addMessage({
    role: "system",
    content: "Uploading session to GitHub Gist...",
  });
  tui.requestRender();

  // Use gh CLI to create a secret gist
  const gh = spawn("gh", [
    "gist",
    "create",
    "--filename",
    `dhara-session-${session.meta.sessionId.slice(0, 8)}.md`,
    "--desc",
    `Dhara Session: ${session.meta.name ?? session.meta.sessionId}`,
  ]);

  let stdout = "";
  let stderr = "";

  gh.stdout.on("data", (data: Buffer) => {
    stdout += data.toString();
  });

  gh.stderr.on("data", (data: Buffer) => {
    stderr += data.toString();
  });

  gh.on("close", (code) => {
    if (code === 0 && stdout.trim()) {
      const gistUrl = stdout.trim();
      chat.addMessage({
        role: "system",
        content: `Session shared as secret Gist:\n${gistUrl}`,
      });
    } else {
      chat.addMessage({
        role: "error",
        content: `Share failed: ${stderr || "gh CLI not available or not authenticated. Install GitHub CLI (gh) and run 'gh auth login' first."}`,
      });
    }
    tui.requestRender();
  });

  // Write the content to stdin
  gh.stdin.write(gistContent);
  gh.stdin.end();
}
