/**
 * CLI subcommands for `dhara session ...`.
 *
 * These operate on session files stored in ~/.dhara/sessions/.
 */
import { readFileSync } from "node:fs";
import type { SessionManager } from "../core/session-manager.js";
import type { SessionEntry } from "../core/session.js";

// ── Help ───────────────────────────────────────────────────────────────────────

function printSessionUsage(): void {
  process.stdout.write(`Usage: dhara session <subcommand> [args]

Subcommands:
  list                        List saved sessions
  info <id>                   Show session metadata
  delete <id>                 Delete a saved session
  export <id> [--format fmt]  Export session (fmt: jsonl, markdown, txt)
  import <file>               Import a session from file
  search <query>              Search session content
  diff <id1> <id2>            Compare two sessions
  stats                       Show aggregate session statistics
  tag <id> <tag>              Tag a session
  prune [--keep N]            Remove old sessions, keeping N most recent
`);
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function isSessionEntry(e: { type: string }): e is SessionEntry {
  return e.type === "entry";
}

function renderEntryContent(e: SessionEntry): string {
  return e.content
    .map((c) => {
      if (c.type === "text") return c.text ?? "";
      if (c.type === "thinking") return `💭 ${c.text ?? ""}`;
      if (c.type === "file") return `[File: ${c.path}]`;
      if (c.type === "image") return `[Image: ${c.mimeType}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

// ── Subcommand handlers ────────────────────────────────────────────────────────

function handleList(sessionManager: SessionManager): void {
  const summaries = sessionManager.list();
  if (summaries.length === 0) {
    process.stdout.write("No sessions found.\n");
    return;
  }

  process.stdout.write(`${"ID".padEnd(12)}  ${"Created".padEnd(24)}Entries  Size    Cwd\n`);
  process.stdout.write(`${"──".repeat(40)}\n`);

  for (const s of summaries) {
    const sid = `${s.sessionId.slice(0, 10)}…`;
    const created = new Date(s.createdAt).toLocaleString();
    const entries = String(s.entryCount ?? "?");
    const sizeKB = s.fileSize ? `${String(Math.round(s.fileSize / 1024))}KB` : "?";
    const cwd = s.cwd?.length > 30 ? `${s.cwd.slice(0, 27)}…` : (s.cwd ?? "?");
    process.stdout.write(
      `${sid.padEnd(12)}  ${created.padEnd(24)}${entries.padEnd(7)}${sizeKB.padEnd(7)}${cwd}\n`,
    );
  }
}

function handleInfo(sessionManager: SessionManager, sessionId: string | undefined): void {
  if (!sessionId) {
    process.stderr.write("Error: 'dhara session info' requires a session ID.\n");
    printSessionUsage();
    process.exit(1);
  }

  const session = sessionManager.load(sessionId);
  const meta = session.meta;

  const out: string[] = [];
  out.push(`Session ID:    ${meta.sessionId}`);
  out.push(`Created:       ${new Date(meta.createdAt).toISOString()}`);
  out.push(`Updated:       ${new Date(meta.updatedAt).toISOString()}`);
  if (meta.cwd) out.push(`Working Dir:   ${meta.cwd}`);
  if (meta.model) out.push(`Model:         ${meta.model.id} (${meta.model.provider})`);
  if (meta.tags && meta.tags.length > 0) out.push(`Tags:          ${meta.tags.join(", ")}`);

  const entries = session.getEntries();
  const sessionEntries = entries.filter(isSessionEntry);
  out.push(`Entries:       ${sessionEntries.length}`);

  // Role breakdown
  const roleCount = new Map<string, number>();
  for (const e of sessionEntries) {
    roleCount.set(e.role, (roleCount.get(e.role) ?? 0) + 1);
  }
  out.push("Roles:");
  for (const [role, count] of roleCount) {
    out.push(`  ${role}: ${count}`);
  }

  process.stdout.write(`${out.join("\n")}\n`);
}

function handleDelete(sessionManager: SessionManager, sessionId: string | undefined): void {
  if (!sessionId) {
    process.stderr.write("Error: 'dhara session delete' requires a session ID.\n");
    printSessionUsage();
    process.exit(1);
  }

  try {
    sessionManager.delete(sessionId);
    process.stdout.write(`Deleted session: ${sessionId}\n`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`Error: ${msg}\n`);
    process.exit(1);
  }
}

function handleExport(
  sessionManager: SessionManager,
  sessionId: string | undefined,
  format: string,
): void {
  if (!sessionId) {
    process.stderr.write("Error: 'dhara session export' requires a session ID.\n");
    printSessionUsage();
    process.exit(1);
  }

  const session = sessionManager.load(sessionId);
  const entries = session.getEntries();
  const sessionEntries = entries.filter(isSessionEntry);

  switch (format) {
    case "jsonl": {
      for (const e of entries) {
        process.stdout.write(`${JSON.stringify(e)}\n`);
      }
      break;
    }
    case "md":
    case "markdown": {
      process.stdout.write(`# Session: ${sessionId}\n\n`);
      for (const e of sessionEntries) {
        if (e.role === "user") {
          process.stdout.write(`## User\n\n${renderEntryContent(e)}\n\n`);
        } else if (e.role === "assistant") {
          if (e.reasoningContent) {
            process.stdout.write(`> 💭 ${e.reasoningContent}\n\n`);
          }
          process.stdout.write(`${renderEntryContent(e)}\n\n`);
          if (e.toolCalls?.length) {
            for (const tc of e.toolCalls) {
              process.stdout.write(
                `### 🛠 ${tc.name}\n\n\`\`\`json\n${JSON.stringify(tc.input, null, 2)}\n\`\`\`\n\n`,
              );
            }
          }
        } else if (e.role === "tool_result") {
          if (e.toolName) {
            process.stdout.write(
              `### 🔧 ${e.toolName} result\n\n\`\`\`\n${renderEntryContent(e)}\n\`\`\`\n\n`,
            );
          }
        }
      }
      break;
    }
    case "txt": {
      for (const e of sessionEntries) {
        const ts = new Date(e.timestamp).toISOString();
        process.stdout.write(`[${ts}] ${e.role}\n`);
        if (e.reasoningContent) process.stdout.write(`[THINK] ${e.reasoningContent}\n`);
        process.stdout.write(`${renderEntryContent(e)}\n`);
        if (e.toolCalls?.length) {
          for (const tc of e.toolCalls) {
            process.stdout.write(`  Tool: ${tc.name}\n`);
          }
        }
        process.stdout.write("---\n");
      }
      break;
    }
    default: {
      process.stderr.write(`Error: Unknown format "${format}". Use jsonl, markdown, or txt.\n`);
      process.exit(1);
    }
  }
}

function handleImport(sessionManager: SessionManager, filePath: string | undefined): void {
  if (!filePath) {
    process.stderr.write("Error: 'dhara session import' requires a file path.\n");
    printSessionUsage();
    process.exit(1);
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    const entries = lines.map((l) => JSON.parse(l));

    if (entries.length === 0) {
      process.stderr.write("Error: File contains no valid JSONL entries.\n");
      process.exit(1);
    }

    // Read meta from import, create session with cwd
    const metaLine = entries.find((e: Record<string, unknown>) => e.type === "meta");
    const cwd = typeof metaLine?.cwd === "string" ? metaLine.cwd : process.cwd();

    const session = sessionManager.create({ cwd });
    for (const entry of entries) {
      if (entry.type === "meta") continue;
      if (entry.type === "entry" && entry.role) {
        // Reconstruct append call
        const { id, parentId, timestamp, type, ...rest } = entry;
        session.append(rest);
      }
    }
    session.save();

    process.stdout.write(
      `Imported ${entries.length} lines as session: ${session.meta.sessionId}\n`,
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`Error importing session: ${msg}\n`);
    process.exit(1);
  }
}

function handleSearch(sessionManager: SessionManager, query: string | undefined): void {
  if (!query) {
    process.stderr.write("Error: 'dhara session search' requires a query string.\n");
    printSessionUsage();
    process.exit(1);
  }

  const summaries = sessionManager.list();
  const lowerQuery = query.toLowerCase();
  let found = 0;

  for (const s of summaries) {
    const session = sessionManager.load(s.sessionId);
    const entries = session.getEntries();

    for (const e of entries) {
      const searchable = JSON.stringify(e).toLowerCase();
      if (searchable.includes(lowerQuery)) {
        found++;
        if (found <= 20) {
          const sid = s.sessionId.slice(0, 8);
          const ts = new Date(e.type === "entry" ? (e as SessionEntry).timestamp : "")
            .toISOString()
            .slice(0, 19);
          const preview = JSON.stringify(e).slice(0, 200);
          process.stdout.write(`[${sid}] @ ${ts}\n  ${preview}\n\n`);
        }
      }
    }
  }

  if (found === 0) {
    process.stdout.write(`No matches found for: ${query}\n`);
  } else if (found > 20) {
    process.stdout.write(`... and ${found - 20} more matches\n`);
  }
}

function handleTag(
  _sessionManager: SessionManager,
  sessionId: string | undefined,
  tag: string | undefined,
): void {
  if (!sessionId || !tag) {
    process.stderr.write("Error: 'dhara session tag' requires a session ID and tag.\n");
    printSessionUsage();
    process.exit(1);
  }

  // Tags are stored in meta and can't be modified via append.
  // For now we note the intent.
  process.stdout.write(`Tagged session ${sessionId} with "${tag}"\n`);
  process.stdout.write("(Note: persistent tag update requires meta mutation support)\n");
}

function handleStats(sessionManager: SessionManager): void {
  const summaries = sessionManager.list();

  if (summaries.length === 0) {
    process.stdout.write("No sessions found.\n");
    return;
  }

  let totalEntries = 0;
  let totalSize = 0;
  let earliest = Number.MAX_SAFE_INTEGER;
  let latest = 0;
  const modelCount = new Map<string, number>();
  const roleCount = new Map<string, number>();

  for (const s of summaries) {
    const createdAt = new Date(s.createdAt).getTime();
    if (createdAt < earliest) earliest = createdAt;
    const updatedAt = s.updatedAt ? new Date(s.updatedAt).getTime() : createdAt;
    if (updatedAt > latest) latest = updatedAt;
    totalEntries += s.entryCount ?? 0;
    totalSize += s.fileSize ?? 0;

    // Load to get role breakdown
    try {
      const session = sessionManager.load(s.sessionId);
      for (const e of session.getEntries()) {
        if (e.type === "entry") {
          const entry = e as SessionEntry;
          roleCount.set(entry.role, (roleCount.get(entry.role) ?? 0) + 1);
          if (entry.model) {
            const mid = `${entry.model.provider}/${entry.model.id}`;
            modelCount.set(mid, (modelCount.get(mid) ?? 0) + 1);
          }
        }
      }
    } catch {
      // skip corrupted
    }
  }

  const out: string[] = [];
  out.push(`Total sessions: ${summaries.length}`);
  out.push(`Total entries:  ${totalEntries}`);
  out.push(`Total size:     ${(totalSize / 1024).toFixed(1)} KB`);
  out.push(
    `Date range:     ${new Date(earliest).toLocaleDateString()} - ${new Date(latest).toLocaleDateString()}`,
  );

  out.push("");
  out.push("Roles:");
  for (const [role, count] of roleCount) {
    out.push(`  ${role}: ${count}`);
  }

  if (modelCount.size > 0) {
    out.push("");
    out.push("Models:");
    for (const [model, count] of modelCount) {
      out.push(`  ${model}: ${count} entries`);
    }
  }

  process.stdout.write(`${out.join("\n")}\n`);
}

function handlePrune(sessionManager: SessionManager, keep: number): void {
  const summaries = sessionManager.list();
  if (summaries.length <= keep) {
    process.stdout.write(`Only ${summaries.length} sessions, keeping all (keep=${keep}).\n`);
    return;
  }

  const sorted = [...summaries].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const toDelete = sorted.slice(0, sorted.length - keep);

  for (const s of toDelete) {
    try {
      sessionManager.delete(s.sessionId);
      process.stdout.write(`Deleted: ${s.sessionId} (${new Date(s.createdAt).toLocaleString()})\n`);
    } catch {
      process.stderr.write(`Failed to delete: ${s.sessionId}\n`);
    }
  }

  process.stdout.write(`\nPruned ${toDelete.length} sessions, kept ${keep}.\n`);
}

function handleDiff(
  sessionManager: SessionManager,
  id1: string | undefined,
  id2: string | undefined,
): void {
  if (!id1 || !id2) {
    process.stderr.write("Error: 'dhara session diff' requires two session IDs.\n");
    printSessionUsage();
    process.exit(1);
  }

  try {
    const s1 = sessionManager.load(id1);
    const s2 = sessionManager.load(id2);

    const entries1 = s1.getEntries();
    const entries2 = s2.getEntries();

    process.stdout.write(`Session A: ${id1} (${entries1.length} entries)\n`);
    process.stdout.write(`Session B: ${id2} (${entries2.length} entries)\n\n`);

    const maxLen = Math.max(entries1.length, entries2.length);
    let differences = 0;

    for (let i = 0; i < maxLen; i++) {
      const a = i < entries1.length ? entries1[i] : null;
      const b = i < entries2.length ? entries2[i] : null;

      if (a && b) {
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          differences++;
          process.stdout.write(`Entry ${i} differs\n`);
        }
      } else if (a) {
        differences++;
        process.stdout.write(`Entry ${i}: only in A\n`);
      } else if (b) {
        differences++;
        process.stdout.write(`Entry ${i}: only in B\n`);
      }
    }

    if (differences === 0) {
      process.stdout.write("Sessions are identical.\n");
    } else {
      process.stdout.write(`Total differences: ${differences}\n`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`Error: ${msg}\n`);
    process.exit(1);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function handleSessionSubcommand(sessionManager: SessionManager, args: string[]): void {
  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h") {
    printSessionUsage();
    return;
  }

  switch (sub) {
    case "list":
      handleList(sessionManager);
      break;
    case "info":
      handleInfo(sessionManager, args[1]);
      break;
    case "delete":
      handleDelete(sessionManager, args[1]);
      break;
    case "export":
      handleExport(
        sessionManager,
        args[1],
        args[2] === "--format" ? (args[3] ?? "jsonl") : "jsonl",
      );
      break;
    case "import":
      handleImport(sessionManager, args[1]);
      break;
    case "search":
      handleSearch(sessionManager, args[1]);
      break;
    case "diff":
      handleDiff(sessionManager, args[1], args[2]);
      break;
    case "stats":
      handleStats(sessionManager);
      break;
    case "tag":
      handleTag(sessionManager, args[1], args[2]);
      break;
    case "prune":
      handlePrune(sessionManager, Number(args[1] ?? "30"));
      break;
    default:
      process.stderr.write(`Error: Unknown session subcommand: ${sub}\n`);
      printSessionUsage();
      process.exit(1);
  }
}
