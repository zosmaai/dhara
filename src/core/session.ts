/**
 * Content block within an entry.
 */
export interface ContentBlock {
  type: "text" | "image" | "file" | "thinking";
  text?: string;
  data?: string;
  mimeType?: string;
  path?: string;
  language?: string;
}

/**
 * A tool call made by the assistant.
 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: ToolResult;
}

/**
 * Result returned by a tool execution.
 */
export interface ToolResult {
  content: ContentBlock[];
  display?: unknown[];
  metadata?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * Model reference for assistant entries.
 */
export interface ModelRef {
  id: string;
  provider: string;
  thinkingLevel?: "low" | "medium" | "high";
}

/**
 * A single entry in the conversation.
 */
export interface SessionEntry {
  type: "entry";
  id: string;
  parentId: string | null;
  role: "system" | "user" | "assistant" | "tool_result";
  content: ContentBlock[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  timestamp: string;
  model?: ModelRef;
  duration_ms?: number;
  metadata?: {
    tokenCount?: { input: number; output: number };
    cost?: { input: number; output: number; currency: string };
    capabilities?: string[];
  };
}

/**
 * A branch point in the conversation tree.
 */
export interface BranchEntry {
  type: "branch";
  id: string;
  parentId: string;
  label?: string;
  timestamp: string;
  reason?: "user_fork" | "compaction" | "model_switch" | "error_recovery";
}

/**
 * Session metadata.
 */
export interface SessionMeta {
  formatVersion: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  cwd: string;
  model?: ModelRef;
  tags?: string[];
}

type Entry = SessionEntry | BranchEntry;

/**
 * A session manages conversation history with branching support.
 */
export interface Session {
  meta: SessionMeta;
  append(partial: Omit<SessionEntry, "type" | "id" | "parentId" | "timestamp">, parentId?: string): SessionEntry;
  fork(parentId: string, label?: string): BranchEntry;
  getEntry(id: string): Entry | undefined;
  getPath(branchId?: string): string[];
  getHead(): Entry | undefined;
  export(): string;
  import(data: string): void;
}

let counter = 0;

function generateId(): string {
  const now = Date.now();
  const seq = (++counter).toString(36).padStart(4, "0");
  return `${now.toString(36)}-${seq}`;
}

function now(): string {
  return new Date().toISOString();
}

export function createSession(config: { cwd: string; model?: ModelRef; tags?: string[] }): Session {
  const entries = new Map<string, Entry>();
  const children = new Map<string, Set<string>>();
  let headId: string | null = null;
  const createdAt = now();

  const meta: SessionMeta = {
    formatVersion: "0.1.0",
    sessionId: crypto.randomUUID(),
    createdAt,
    updatedAt: createdAt,
    cwd: config.cwd,
    model: config.model,
    tags: config.tags,
  };

  function addChild(parentId: string | null, childId: string): void {
    if (!parentId) return;
    const set = children.get(parentId) ?? new Set();
    set.add(childId);
    children.set(parentId, set);
  }

  function append(
    partial: Omit<SessionEntry, "type" | "id" | "parentId" | "timestamp">,
    parentId?: string
  ): SessionEntry {
    const id = generateId();
    const resolvedParentId = parentId ?? headId;

    const entry: SessionEntry = {
      type: "entry",
      id,
      parentId: resolvedParentId,
      ...partial,
      timestamp: now(),
    };

    entries.set(id, entry);
    addChild(resolvedParentId, id);
    headId = id;
    meta.updatedAt = now();

    return entry;
  }

  function fork(parentId: string, label?: string): BranchEntry {
    if (!entries.has(parentId)) {
      throw new Error(`Entry not found: ${parentId}`);
    }

    const id = generateId();
    const branch: BranchEntry = {
      type: "branch",
      id,
      parentId,
      label,
      timestamp: now(),
      reason: "user_fork",
    };

    entries.set(id, branch);
    addChild(parentId, id);
    headId = id;
    meta.updatedAt = now();

    return branch;
  }

  function getEntry(id: string): Entry | undefined {
    return entries.get(id);
  }

  function getPath(branchId?: string): string[] {
    const targetHead = branchId ?? headId;
    if (!targetHead) return [];

    // Walk backward from targetHead to find root
    const ancestors: string[] = [];
    let currentId: string | null | undefined = targetHead;

    while (currentId) {
      ancestors.unshift(currentId);
      const entry = entries.get(currentId);
      if (!entry) break;
      currentId = entry.parentId;
    }

    // If no branch specified, just return root→head
    if (!branchId) return ancestors;

    // For a branch, continue forward from the branch to its head
    const branchIndex = ancestors.indexOf(branchId);
    if (branchIndex === -1) return ancestors;

    const result = ancestors.slice(0, branchIndex + 1);
    let current = branchId;

    // Follow children forward to find the branch head
    while (true) {
      const childSet = children.get(current);
      if (!childSet || childSet.size === 0) break;

      // Pick the last child as the continuation (most recent)
      const childArray = Array.from(childSet);
      const lastChild = childArray[childArray.length - 1];
      result.push(lastChild);
      current = lastChild;
    }

    return result;
  }

  function getHead(): Entry | undefined {
    return headId ? entries.get(headId) : undefined;
  }

  function exportSession(): string {
    const lines: string[] = [];

    // Meta line
    lines.push(JSON.stringify({ type: "meta", ...meta }));

    // All entries in insertion order (roughly chronological)
    for (const entry of entries.values()) {
      lines.push(JSON.stringify(entry));
    }

    return lines.join("\n");
  }

  function importSession(data: string): void {
    entries.clear();
    children.clear();
    headId = null;

    const lines = data.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      const parsed = JSON.parse(line) as Record<string, unknown>;

      if (parsed.type === "meta") {
        Object.assign(meta, {
          formatVersion: parsed.formatVersion as string,
          sessionId: parsed.sessionId as string,
          createdAt: parsed.createdAt as string,
          updatedAt: parsed.updatedAt as string,
          cwd: parsed.cwd as string,
          model: parsed.model as ModelRef | undefined,
          tags: parsed.tags as string[] | undefined,
        });
        continue;
      }

      const entry = parsed as unknown as Entry;
      entries.set(entry.id, entry);

      // Rebuild children map
      if (entry.parentId) {
        addChild(entry.parentId, entry.id);
      }

      // Track the latest entry as head (last one wins)
      headId = entry.id;
    }
  }

  return {
    meta,
    append,
    fork,
    getEntry,
    getPath,
    getHead,
    export: exportSession,
    import: importSession,
  };
}
