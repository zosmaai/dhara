# Session Format

> An open, versioned, schema-validated format for coding agent conversations.

## Why an Open Session Format Matters

Pi uses a custom JSONL format. Claude Code uses protobuf. Codex uses its own JSON. None of these are interoperable. This means:

- You can't switch agents without losing history
- You can't build analytics tools that work across agents
- You can't share sessions for reproducibility
- You can't fork a conversation from a different agent

We define an open format that any agent implementation can read and write.

## Design Goals

1. **Human-readable** — JSONL (one JSON object per line) for streaming and append-only writes
2. **Schema-validated** — Every entry has a defined schema version
3. **Interoperable** — Any implementation can read any session
4. **Forkable** — Sessions are trees, not lists. You can branch from any point.
5. **Lossless** — Full conversation always preserved. Compaction creates summaries but doesn't delete originals.
6. **Queryable** — Standard fields enable search, analytics, and replay.

## Format: Session File

A session is a directory containing:
```
session/
├── meta.json              # Session metadata
├── entries.jsonl          # All entries (append-only log)
├── tree.json              # Branch/merge structure
└── compaction/            # Compaction summaries (optional)
    ├── summary-001.json   # Summaries reference original entries
    └── summary-002.json
```

### meta.json

```json
{
  "formatVersion": "0.1.0",
  "sessionId": "uuid-v4",
  "createdAt": "2026-05-08T10:30:00Z",
  "updatedAt": "2026-05-08T11:45:00Z",
  "cwd": "/home/user/project",
  "model": {
    "id": "claude-sonnet-4-20250514",
    "provider": "anthropic"
  },
  "extensions": [
    { "name": "code-search", "version": "1.0.0" },
    { "name": "file-tools", "version": "0.2.0" }
  ],
  "tags": ["refactoring", "auth-module"],
  "branchOf": null
}
```

### entries.jsonl

Each line is a JSON object representing one entry in the conversation:

```jsonl
{"type":"entry","id":"e001","parentId":null,"role":"system","content":"...","timestamp":"...","model":"..."}
{"type":"entry","id":"e002","parentId":"e001","role":"user","content":"...","timestamp":"..."}
{"type":"entry","id":"e003","parentId":"e002","role":"assistant","content":"...","timestamp":"...","toolCalls":[...]}
{"type":"entry","id":"e004","parentId":"e003","role":"tool_result","toolCallId":"tc001","content":"...","timestamp":"..."}
{"type":"entry","id":"e005","parentId":"e004","role":"assistant","content":"...","timestamp":"..."}
{"type":"branch","id":"b001","parentId":"e002","label":"try-different-approach","timestamp":"..."}
{"type":"entry","id":"e006","parentId":"b001","role":"user","content":"...","timestamp":"..."}
```

### Entry Schema

```typescript
interface SessionEntry {
  // Identity
  type: "entry";
  id: string;                    // Unique entry ID (sortable)
  parentId: string | null;       // Parent entry (null = root)
  
  // Content
  role: "system" | "user" | "assistant" | "tool_result";
  content: ContentBlock[];
  
  // Tool calls (assistant entries only)
  toolCalls?: ToolCall[];
  
  // Tool result metadata
  toolCallId?: string;           // tool_result entries: which tool call this answers
  toolName?: string;             // tool_result entries: which tool produced this
  isError?: boolean;             // tool_result entries: did the tool fail?
  
  // Context
  timestamp: string;             // ISO 8601
  model?: ModelRef;              // Which model produced this (assistant entries)
  duration_ms?: number;          // How long this entry took to produce
  
  // Metadata
  metadata?: {
    tokenCount?: { input: number; output: number };
    cost?: { input: number; output: number; currency: string };
    capabilities?: string[];     // Capabilities used during this entry
  };
}

interface ContentBlock {
  type: "text" | "image" | "file" | "thinking";
  text?: string;                  // For text/thinking
  data?: string;                  // Base64 for images
  mimeType?: string;              // MIME type for images
  path?: string;                  // File path for file references
  language?: string;              // Language hint for code blocks
}

interface ToolCall {
  id: string;                     // Tool call ID
  name: string;                   // Tool name
  input: Record<string, unknown>; // Tool parameters
  output?: ToolResult;            // Tool result (filled after execution)
}

interface ModelRef {
  id: string;                     // Model identifier
  provider: string;               // Provider identifier
  thinkingLevel?: "low" | "medium" | "high";
}
```

### Branch Schema

```typescript
interface BranchEntry {
  type: "branch";
  id: string;                     // Branch ID
  parentId: string;               // Entry to branch from
  label?: string;                 // Human-readable branch name
  timestamp: string;
  reason?: "user_fork" | "compaction" | "model_switch" | "error_recovery";
}
```

### tree.json

The tree structure is derived from `parentId` fields, but materialized for fast navigation:

```json
{
  "root": "e001",
  "heads": {
    "main": "e005",
    "try-different-approach": "e006"
  },
  "branches": {
    "main": {
      "path": ["e001", "e002", "e003", "e004", "e005"]
    },
    "try-different-approach": {
      "path": ["e001", "e002"],
      "branchPoint": "b001",
      "pathAfter": ["e006", "e007"]
    }
  }
}
```

## Compaction

Compaction produces summaries but **never deletes original entries**.

### How It Works

1. When context exceeds a threshold, the core creates a compaction summary
2. The summary references the original entry IDs
3. The LLM receives the summary instead of the original entries
4. But the full entries.jsonl is preserved

```json
// compaction/summary-001.json
{
  "id": "s001",
  "formatVersion": "0.1.0",
  "createdAt": "2026-05-08T11:00:00Z",
  "sourceEntries": ["e001", "e002", "e003", "e004", "e005"],
  "model": { "id": "claude-sonnet-4", "provider": "anthropic" },
  "summary": "User asked to implement authentication middleware. Assistant created src/middleware/auth.ts with JWT validation, src/routes/login.ts with token generation, and tests. User then requested rate limiting.",
  "keyDecisions": [
    "Used JWT over session cookies for statelessness",
    "Stored tokens in httpOnly cookies, not localStorage"
  ],
  "filesCreated": ["src/middleware/auth.ts", "src/routes/login.ts", "tests/auth.test.ts"],
  "filesModified": ["src/app.ts"],
  "commandsRun": ["npm install jsonwebtoken", "npm test"]
}
```

### Tiered Memory

| Tier | What It Contains | When Used |
|---|---|---|
| **Full** | Complete entry.jsonl | Always available, used for replay |
| **Summary** | Compaction summaries | Default context for LLM |
| **Index** | File list, decisions, commands | Quick scan for relevance |

The LLM always receives summaries by default but can request full entries for specific ranges. This is like virtual memory — the full data is on disk, summaries are in RAM.

## Interoperability

### Import from Other Agents

```
project import --from pi session.jsonl
project import --from claude-code session.json
project import --from codex session.json
```

Import converts the foreign format to our open format. The original file is preserved alongside.

### Export

```
project export --format json     # Our native format
project export --format markdown # Human-readable
project export --format html     # Shareable (like pi's /export)
```

### Replay

Any session can be replayed:
```
project replay session-id        # Re-execute all tool calls
project replay --dry-run          # Show what would run without executing
project replay --from e003        # Replay from a specific entry
```

## Schema Validation

The session format is defined in JSON Schema:

```
spec/
├── schemas/
│   ├── meta.json          # meta.json schema
│   ├── entry.json         # Entry schema
│   ├── branch.json        # Branch schema
│   ├── compaction.json    # Compaction summary schema
│   └── tree.json          # Tree schema
```

Any implementation validates against these schemas. If it validates, it's a valid session.

## Comparison with Pi's Session Format

| | Pi | Ours |
|---|---|---|
| Format | Custom JSONL | Open JSONL with JSON Schema |
| Schema validation | None | Required |
| Branching | Yes (fork from any entry) | Yes (same) |
| Compaction | Lossy (original context lost) | Lossless (summaries + full entries) |
| Import/export | Custom only | Open + imports from other agents |
| Replay | No | Yes |
| Queryability | Limited | Standard fields enable search |
| Cross-agent | Pi only | Any implementation of the spec |

## Usage Examples

### Query sessions
```bash
# Find all sessions that touched auth files
project query --files "src/middleware/auth.ts"

# Find sessions that used > 100K tokens
project query --min-tokens 100000

# Find sessions tagged "refactoring"
project query --tags refactoring
```

### Merge branches
```bash
# Merge a branch back into main (cherry-pick entries)
project merge try-different-approach --into main --from e006
```

### Share sessions
```bash
# Publish session for reproducibility (like pi-share-hf)
project share session-id --to huggingface
project share session-id --to gist
```
