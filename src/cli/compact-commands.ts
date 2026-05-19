import type { TUI } from "@earendil-works/pi-tui";
import type { BranchEntry, SessionEntry } from "../core/session.js";
import type { PersistedSession } from "../core/session-manager.js";
import type { DharaApp } from "../std/renderers/tui/dhara-app.js";

// ── Token Estimation ──────────────────────────────────────────────────────

/**
 * Rough token estimation (chars / 4).
 * Used for compaction cutoff — doesn't need to be precise.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Count tokens in a session entry.
 */
function entryTokens(entry: SessionEntry): number {
  if (entry.metadata?.tokenCount) {
    const { input = 0, output = 0 } = entry.metadata.tokenCount;
    return input + output;
  }

  // Fallback: estimate from text content
  return entry.content.reduce((sum, block) => {
    if (block.type === "text" && block.text) return sum + estimateTokens(block.text);
    if (block.type === "thinking" && block.text) return sum + estimateTokens(block.text);
    return sum + 20; // rough overhead per block
  }, 0);
}

// ── Compaction ───────────────────────────────────────────────────────────

interface CompactionPlan {
  /** ID of the entry where compaction should happen */
  cutEntryId: string;
  /** Entries before the cut (will be compacted) */
  oldEntries: SessionEntry[];
  /** Entries after the cut (kept as-is) */
  keptEntries: SessionEntry[];
  /** Total tokens compacted */
  compactedTokens: number;
  /** Total tokens kept */
  keptTokens: number;
}

/**
 * Build a compaction plan:
 * 1. Walk the session path from the end backwards
 * 2. Accumulate tokens until we hit `keepRecentTokens`
 * 3. Everything before the cut point gets compacted
 */
function buildCompactionPlan(
  session: PersistedSession,
  keepRecentTokens = 8192,
): CompactionPlan | null {
  const path = session.getPath();

  // Find session entries in order (skip branch entries)
  const entries: SessionEntry[] = [];
  for (const id of path) {
    const entry = session.getEntry(id);
    if (entry?.type === "entry") {
      entries.push(entry as SessionEntry);
    }
  }

  if (entries.length <= 3) {
    return null; // too few entries to compact
  }

  // Walk backwards, accumulating tokens
  let accumulated = 0;
  let cutIndex = entries.length; // default: compact nothing

  for (let i = entries.length - 1; i >= 0; i--) {
    accumulated += entryTokens(entries[i]);
    if (accumulated > keepRecentTokens) {
      // Found the cut point — everything before i+1 gets compacted
      cutIndex = i + 1;
      break;
    }
  }

  if (cutIndex <= 1) {
    return null; // nothing to compact (everything is recent)
  }

  const oldEntries = entries.slice(0, cutIndex);
  const keptEntries = entries.slice(cutIndex);
  const compactedTokens = oldEntries.reduce((sum, e) => sum + entryTokens(e), 0);
  const keptTokens = keptEntries.reduce((sum, e) => sum + entryTokens(e), 0);

  const cutEntryId = keptEntries[0]?.id ?? path[path.length - 1];

  return {
    cutEntryId,
    oldEntries,
    keptEntries,
    compactedTokens,
    keptTokens,
  };
}

/**
 * Build a text summary of the compacted entries.
 * Future: use LLM to generate a real summary.
 */
function buildSummary(entries: SessionEntry[]): string {
  const userMessages = entries.filter((e) => e.role === "user");
  const assistantMessages = entries.filter((e) => e.role === "assistant");
  const toolResults = entries.filter((e) => e.role === "tool_result");

  // Extract key topics from user messages
  const userTopics = userMessages
    .map((e) =>
      e.content
        .filter((c): c is typeof c & { text: string } => c.type === "text" && !!c.text)
        .map((c) => c.text)
        .join(" ")
        .slice(0, 120),
    )
    .filter(Boolean);

  const summaryLines: string[] = [
    `**Compacted ${entries.length} entries**: ${userMessages.length} user messages, ${assistantMessages.length} assistant responses, ${toolResults.length} tool results.`,
  ];

  if (userTopics.length > 0) {
    summaryLines.push("**Topics covered**:");
    // Show up to 5 user message previews as "topics"
    const topics = userTopics.slice(0, 5);
    for (const topic of topics) {
      summaryLines.push(`- ${topic}`);
    }
    if (userTopics.length > 5) {
      summaryLines.push(`- ... and ${userTopics.length - 5} more messages`);
    }
  }

  return summaryLines.join("\n");
}

// ── /compact — Session Compaction ────────────────────────────────────────

/**
 * Handle `/compact` — compact older session context.
 *
 * Algorithm:
 * 1. Walk session path backwards, accumulating tokens
 * 2. Keep the last ~8192 tokens of conversation
 * 3. Create a branch entry (reason: "compaction") at the cut point
 * 4. Add a system message summarizing what was compacted
 * 5. Save the session
 */
export function handleCompact(tui: TUI, chat: DharaApp, session: PersistedSession): void {
  const plan = buildCompactionPlan(session);

  if (!plan) {
    chat.addMessage({
      role: "system",
      content:
        "Session is too short to compact (need more than 3 entries with >8192 tokens of history).",
    });
    tui.requestRender();
    return;
  }

  try {
    // Generate summary
    const summary = buildSummary(plan.oldEntries);
    const totalTokens = plan.compactedTokens + plan.keptTokens;

    // Create a branch entry marking the compaction point
    const branch = session.fork(plan.cutEntryId, `Compacted: ${plan.oldEntries.length} entries`);

    // Modify the branch entry to use compaction reason
    // (session.fork uses "user_fork" by default; we need to update it)
    const branchEntry = session.getEntry(branch.id);
    if (branchEntry && branchEntry.type === "branch") {
      (branchEntry as BranchEntry).reason = "compaction";
    }

    // Add a system message with the compaction summary
    session.append({
      role: "system",
      content: [
        {
          type: "text" as const,
          text: [
            `📦 **Session Compacted**`,
            ``,
            summary,
            ``,
            `**Stats**: ${plan.oldEntries.length} entries compacted (${plan.compactedTokens.toLocaleString()} tokens) → ${plan.keptEntries.length} entries kept (${plan.keptTokens.toLocaleString()} tokens). Total: ${totalTokens.toLocaleString()} tokens.`,
            `**Tip**: Use /tree to see the compacted history.`,
          ].join("\n"),
        },
      ],
    });

    session.save();

    chat.addMessage({
      role: "system",
      content: [
        `Session compacted.`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `📦 **${plan.oldEntries.length} entries compacted** (${plan.oldEntries[0]?.role ?? "unknown"} → ${plan.oldEntries[plan.oldEntries.length - 1]?.role ?? "unknown"})`,
        `📝 **${plan.keptEntries.length} entries kept** (${plan.compactedTokens.toLocaleString()} tok → ${plan.keptTokens.toLocaleString()} tok)`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `Use /tree to browse compacted history.`,
        `Use /fork to branch from any point.`,
      ].join("\n"),
    });
  } catch (err) {
    chat.addMessage({
      role: "error",
      content: `Compaction failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  tui.requestRender();
}
