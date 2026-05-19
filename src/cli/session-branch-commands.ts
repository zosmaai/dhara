import { SelectList, type TUI } from "@earendil-works/pi-tui";
import type { BranchEntry, SessionEntry } from "../core/session.js";
import type { PersistedSession, SessionManager } from "../core/session-manager.js";
import type { DharaApp } from "../std/renderers/tui/dhara-app.js";
import { getSelectListTheme } from "../std/renderers/tui/dhara-theme.js";

// ── Types ─────────────────────────────────────────────────────────────────

type SwitchToSessionFn = (session: PersistedSession) => void;

type BranchTreeEntry = SessionEntry | BranchEntry;

interface TreeItem {
  id: string;
  entry: BranchTreeEntry | undefined;
  depth: number;
  label: string;
  isBranch: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────

const MAX_VISIBLE = 12;

// ── /tree — Session Tree Navigation ──────────────────────────────────────

/**
 * Build a tree from session entries by reconstructing the child map.
 */
function buildTree(session: PersistedSession): TreeItem[] {
  const entries = session.getEntries();
  const childMap = new Map<string | null, string[]>();

  // Build parent → children map
  for (const entry of entries) {
    const parentId = entry.parentId ?? null;
    const siblings = childMap.get(parentId) ?? [];
    siblings.push(entry.id);
    childMap.set(parentId, siblings);
  }

  // Walk the tree (children are already in insertion order from getEntries)
  const items: TreeItem[] = [];

  function walk(parentId: string | null, depth: number): void {
    const siblings = childMap.get(parentId) ?? [];
    for (const id of siblings) {
      const entry = entries.find((e) => e.id === id);
      if (!entry) continue;

      const isBranch = entry.type === "branch";
      const isEntry = entry.type === "entry";
      let label = "";

      if (isBranch) {
        const branch = entry as BranchEntry;
        label = `[branch] ${branch.label ?? "untitled"}`;
        if (branch.reason) label += ` (${branch.reason})`;
      } else if (isEntry) {
        const se = entry as SessionEntry;
        const contentPreview = se.content
          .filter((c): c is typeof c & { text: string } => c.type === "text" && !!c.text)
          .map((c) => c.text)
          .join(" ")
          .slice(0, 60)
          .slice(0, 80);
        label =
          se.role === "user"
            ? `👤 ${contentPreview || "(empty)"}`
            : se.role === "assistant"
              ? `🤖 ${contentPreview || "(empty)"}`
              : se.role === "tool_result"
                ? `🔧 ${contentPreview.slice(0, 40)}`
                : `📋 ${contentPreview.slice(0, 40)}`;
      }

      const indent = "  ".repeat(depth);
      items.push({
        id,
        entry,
        depth,
        label: isBranch ? `🌿 ${indent}${label}` : `${indent}${label}`,
        isBranch,
      });
      walk(id, depth + 1);
    }
  }

  walk(null, 0);
  return items;
}

/**
 * Handle `/tree` — show session tree and allow branch navigation.
 */
export function handleTree(
  tui: TUI,
  chat: DharaApp,
  session: PersistedSession,
  _switchToSession: SwitchToSessionFn,
): void {
  const items = buildTree(session);

  if (items.length === 0) {
    chat.addMessage({ role: "system", content: "Session is empty." });
    tui.requestRender();
    return;
  }

  const treeList = new SelectList(
    items.map((item) => ({
      value: item.id,
      label: item.label,
      description: item.isBranch
        ? "Switch to this branch"
        : item.entry?.type === "entry"
          ? `Role: ${(item.entry as SessionEntry).role}`
          : "",
    })),
    MAX_VISIBLE,
    getSelectListTheme(),
  );

  treeList.onSelect = (selectedItem) => {
    const item = items.find((i) => i.id === selectedItem.value);
    if (!item) return;

    tui.hideOverlay();

    if (item.isBranch) {
      chat.addMessage({
        role: "system",
        content: `Switched to branch: ${(item.entry as BranchEntry).label ?? "untitled"}`,
      });
    } else {
      chat.addMessage({
        role: "system",
        content: `Jumped to ${(item.entry as SessionEntry).role} message.`,
      });
    }
    tui.requestRender();
  };

  treeList.onCancel = () => {
    tui.hideOverlay();
  };

  tui.showOverlay(treeList, {
    anchor: "center",
    width: "70%",
  });
}

// ── /fork — Fork from a User Message ─────────────────────────────────────

/**
 * Handle `/fork [user-message-index]` — fork session at a specific user
 * message, creating a BranchEntry.
 */
export function handleFork(
  tui: TUI,
  chat: DharaApp,
  session: PersistedSession,
  _sessionManager: SessionManager,
  _cwd: string,
  _modelId: string,
  _providerName: string,
  _switchToSession: SwitchToSessionFn,
  args: string,
): void {
  const path = session.getPath();
  const userMessages: Array<{ id: string; text: string; index: number }> = [];
  let idx = 0;

  for (const id of path) {
    const entry = session.getEntry(id);
    if (entry?.type === "entry" && entry.role === "user") {
      const textContent = entry.content
        .filter((c): c is typeof c & { text: string } => c.type === "text" && !!c.text)
        .map((c) => c.text)
        .join(" ")
        .slice(0, 100);
      userMessages.push({ id, text: textContent || "(empty)", index: idx });
    }
    idx++;
  }

  // If args is provided as a number, use that index directly
  const argIndex = args ? Number.parseInt(args, 10) : undefined;

  if (argIndex !== undefined && !Number.isNaN(argIndex)) {
    const target = userMessages[argIndex];
    if (!target) {
      chat.addMessage({
        role: "system",
        content: `User message at index ${argIndex} not found. Use /fork without args to see available messages.`,
      });
      tui.requestRender();
      return;
    }
    doFork(session, target.id, target.text, chat, tui);
    return;
  }

  if (userMessages.length === 0) {
    chat.addMessage({ role: "system", content: "No user messages to fork from." });
    tui.requestRender();
    return;
  }

  if (userMessages.length === 1) {
    doFork(session, userMessages[0].id, userMessages[0].text, chat, tui);
    return;
  }

  // Show user message picker
  const forkList = new SelectList(
    userMessages.map((msg, i) => ({
      value: msg.id,
      label: `[${i}] ${msg.text}`,
      description: `Fork session at message ${i}`,
    })),
    MAX_VISIBLE,
    getSelectListTheme(),
  );

  forkList.onSelect = (selectedItem) => {
    const msg = userMessages.find((m) => m.id === selectedItem.value);
    if (!msg) return;
    doFork(session, msg.id, msg.text, chat, tui);
    tui.hideOverlay();
  };

  forkList.onCancel = () => {
    tui.hideOverlay();
  };

  tui.showOverlay(forkList, {
    anchor: "center",
    width: "70%",
  });
}

function doFork(
  session: PersistedSession,
  parentId: string,
  label: string,
  chat: DharaApp,
  tui: TUI,
): void {
  try {
    const branch = session.fork(parentId, label.slice(0, 40));
    chat.addMessage({
      role: "system",
      content: `Session forked at user message. Created branch: ${branch.label ?? "untitled"}`,
    });
  } catch (err) {
    chat.addMessage({
      role: "error",
      content: `Fork failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
  tui.requestRender();
}

// ── /clone — Clone Current Branch ────────────────────────────────────────

/**
 * Handle `/clone` — clone the current session branch into a new session file.
 */
export function handleClone(
  tui: TUI,
  chat: DharaApp,
  session: PersistedSession,
  sessionManager: SessionManager,
  cwd: string,
  modelId: string,
  providerName: string,
  switchToSession: SwitchToSessionFn,
): void {
  // Create a new session
  const newSession = sessionManager.create({
    cwd,
    model: { id: modelId, provider: providerName },
  });

  // Copy label if the source has one
  if (session.meta.name) {
    newSession.meta.name = `${session.meta.name} (clone)`;
  }

  // Copy all entries from current branch path
  const path = session.getPath();
  let lastParentId: string | null = null;

  for (const entryId of path) {
    const entry = session.getEntry(entryId);
    if (!entry) continue;

    if (entry.type === "entry") {
      const se = entry as SessionEntry;
      newSession.append(
        {
          role: se.role,
          content: se.content,
          toolCalls: se.toolCalls,
          toolCallId: se.toolCallId,
          toolName: se.toolName,
          isError: se.isError,
          model: se.model,
          duration_ms: se.duration_ms,
          metadata: se.metadata,
          reasoningContent: se.reasoningContent,
        },
        lastParentId ?? undefined,
      );
      lastParentId = se.id;
    }
    // Skip branch entries — linearize the conversation
  }

  // Switch to the cloned session
  switchToSession(newSession);
  chat.addMessage({
    role: "system",
    content: `Session cloned. New session: ${newSession.meta.sessionId}`,
  });
  tui.requestRender();
}
