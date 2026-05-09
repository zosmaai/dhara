# Spec: Standard Library Tools

> Status: draft · Depends on: Sandbox, ToolRegistration interface

## Goal

A built-in set of tools that make the agent useful for coding tasks. These register into the Agent Loop's `tools` map and become available to any LLM provider.

## Philosophy

The architecture spec says: "What Pi Got Wrong → Dogmatic tool count → standard library of ~8 tools, swappable."

Not 4 tools (Pi's philosophy), not 40. A curated set of ~8 tools that cover 99% of coding use cases. Each tool is independently replaceable — swap our `bash` for your own.

## Tool Catalog

### 1. `fs_read` — Read File Contents

```
name:        fs_read
description: Read the contents of a file at the given path with optional
             offset and limit for large files.
parameters: {
  path: string (required)   — file path, relative to CWD
  offset?: number            — line number to start from (1-indexed)
  limit?: number             — max lines to read
}
capabilities: [filesystem:read]
returns:    ContentBlock[]
```

**Security**: Checks path via sandbox before reading. Blocked outside CWD.

**Edge cases**:
- File not found → error result with `isError: true`
- Binary file → warning, return as base64 text
- Path traversal attempt → sandbox blocks

### 2. `fs_write` — Create or Overwrite Files

```
name:        fs_write
description: Create a new file or overwrite an existing one with the given
             content.
parameters: {
  path: string (required)    — file path, relative to CWD
  content: string (required) — file content
}
capabilities: [filesystem:write]
returns:    ContentBlock[] — confirmation message
```

**Security**: Sandbox check before write. Outside CWD blocked.

### 3. `fs_edit` — Surgical Text Replacement

```
name:        fs_edit
description: Replace exact text matches in a file. The oldText must uniquely
             match. This is a safe alternative to rewriting entire files.
parameters: {
  path: string (required)    — file path
  oldText: string (required) — exact text to find and replace
  newText: string (required) — replacement text
}
capabilities: [filesystem:read, filesystem:write]
returns:    ContentBlock[] — diff or confirmation
```

**Why this tool exists**: The LLM should edit surgically, not rewrite entire files. This is how pi's edit tool works, and it's proven to be the safest editing pattern.

**Edge cases**:
- oldText not unique in file → error: "found N matches, must be unique"
- oldText not found → error: "text not found in file"

### 4. `fs_list` — Directory Listing

```
name:        fs_list
description: List files and directories at the given path.
parameters: {
  path: string (required) — directory path, relative to CWD
}
capabilities: [filesystem:read]
returns:    ContentBlock[] — file/directory names, one per line
```

**Edge cases**:
- Path is a file → list parent directory or show file info
- Path doesn't exist → error

### 5. `fs_search` — Grep / Code Search

```
name:        fs_search
description: Search for a pattern in files. Supports regex.
parameters: {
  pattern: string (required) — regex pattern to search for
  path?: string               — directory to search (defaults to CWD)
  glob?: string               — file filter glob (e.g. "*.ts")
  maxResults?: number         — max results (default 50)
}
capabilities: [filesystem:read]
returns:    ContentBlock[] — matches with file:line:content
```

**Edge cases**:
- No results → "No matches found"
- Invalid regex → error with details

### 6. `bash` — Shell Command Execution

```
name:        bash
description: Execute a shell command in the current working directory.
parameters: {
  command: string (required) — shell command to run
  timeout?: number            — max seconds (default 30)
}
capabilities: [process:spawn]
returns:    ContentBlock[] — stdout + stderr with exit code
```

**Security**: Must pass sandbox `checkProcessSpawn()`. Commands outside the allowed list are blocked.

**Edge cases**:
- Command times out → kill, return output so far + timeout error
- Command not in allowed list → sandbox blocks
- Non-zero exit → return stdout + stderr, not an error (tool succeeds, LLM interprets exit code)

### 7. `web_fetch` — Fetch URL Content

```
name:        web_fetch
description: Fetch content from a URL. Returns plain text.
parameters: {
  url: string (required) — URL to fetch
}
capabilities: [network:outbound]
returns:    ContentBlock[] — page text
```

**Edge cases**:
- Domain not in allowed list → sandbox blocks
- HTTP error → return status code + body as error
- Timeout → return timeout error

### 8. `web_search` — Web Search

```
name:        web_search
description: Search the web for information. Returns structured results.
parameters: {
  query: string (required) — search query
  maxResults?: number        — max results (default 5)
}
capabilities: [network:outbound]
returns:    ContentBlock[] — title, URL, snippet per result
```

**Note**: This tool requires a search backend (Exa, Perplexity, etc.). Initial implementation can be a stub that returns "not configured" unless a search API key is present in config.

## Tool Registration Pattern

Every tool follows the same `ToolRegistration` interface:

```typescript
// src/std/tools/fs-read.ts
import type { ToolRegistration } from "../../core/provider.js";
import { sandbox } from "./sandbox-context.js"; // shared per-tool sandbox

export const fsRead: ToolRegistration = {
  definition: {
    name: "fs_read",
    description: "Read the contents of a file at the given path...",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path, relative to CWD" },
        offset: { type: "number", description: "Line number to start from" },
        limit: { type: "number", description: "Max lines to read" },
      },
      required: ["path"],
    },
  },
  execute: async (input) => {
    // sandbox check
    // actual implementation
  },
};
```

## Sandbox Integration

Every tool that touches the filesystem, network, or processes must go through the sandbox:

```typescript
// Shared sandbox instance for all tools
// Created by CLI/AgentLoop and passed to tool executors

const result = sandbox.checkFileRead(input.path);
if (!result.allowed) {
  return { content: [{ type: "text", text: result.reason }], isError: true };
}
```

## Files Created

```
src/std/tools/
├── fs-read.ts          # fs_read tool (~60 lines)
├── fs-read.test.ts     # Tests
├── fs-write.ts         # fs_write tool (~40 lines)
├── fs-write.test.ts    # Tests
├── fs-edit.ts          # fs_edit tool (~80 lines)
├── fs-edit.test.ts     # Tests
├── fs-list.ts          # fs_list tool (~40 lines)
├── fs-list.test.ts     # Tests
├── fs-search.ts        # fs_search tool (~50 lines)
├── fs-search.test.ts   # Tests
├── bash.ts             # bash tool (~60 lines)
├── bash.test.ts        # Tests
├── web-fetch.ts        # web_fetch tool (~50 lines)
├── web-fetch.test.ts   # Tests
├── web-search.ts       # web_search stub (~30 lines)
├── web-search.test.ts  # Tests
├── sandbox-context.ts  # Shared sandbox accessor (~15 lines)
└── index.ts            # Export all tools as a Map (~20 lines)
```

## Tests per Tool

| Test category | Tests |
|---|---|
| Happy path | Tool returns expected output |
| Sandbox blocks | Tool returns error when capability denied |
| Path validation | Traversal blocked, outside CWD blocked |
| Error cases | File not found, invalid input, timeouts |
| Edge cases | Binary files, empty files, large outputs |

## `index.ts` — Tool Registry

```typescript
// src/std/tools/index.ts
import { fsRead } from "./fs-read.js";
import { fsWrite } from "./fs-write.js";
import { fsEdit } from "./fs-edit.js";
import { fsList } from "./fs-list.js";
import { fsSearch } from "./fs-search.js";
import { bash } from "./bash.js";
import { webFetch } from "./web-fetch.js";
import { webSearch } from "./web-search.js";
import { createSandbox, type SandboxConfig } from "../../core/sandbox.js";
import type { ToolRegistration } from "../../core/provider.js";

export function createDefaultTools(sandboxConfig: SandboxConfig): Map<string, ToolRegistration> {
  const sandbox = createSandbox(sandboxConfig);
  // TODO: pass sandbox to each tool executor

  return new Map([
    ["fs_read", fsRead],
    ["fs_write", fsWrite],
    ["fs_edit", fsEdit],
    ["fs_list", fsList],
    ["fs_search", fsSearch],
    ["bash", bash],
    ["web_fetch", webFetch],
    ["web_search", webSearch],
  ]);
}
```

## Dependency Order

1. `sandbox-context.ts` — shared sandbox instance
2. Individual tool files — each independently testable
3. `index.ts` — bundles them into a `Map<string, ToolRegistration>`
4. CLI print mode → uses `index.ts` to register tools

## Success Criteria
- All 8 tools work against real filesystem (with temp dirs in tests)
- Sandbox blocks disallowed operations
- Path traversal correctly prevented
- All tools follow the same `ToolRegistration` interface
- 0 type errors, 0 lint errors, ≥ 90% coverage
