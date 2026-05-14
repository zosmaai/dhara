# Spec: Standard Library Tools

> Status: draft · Depends on: Sandbox, ToolRegistration interface

## Goal

A built-in set of tools that make the agent useful for coding tasks. These register into the Agent Loop's `tools` map and become available to any LLM provider.

## Philosophy

The standard library is NOT a comprehensive tool collection. It's the
**absolute floor** — the minimal set of tools a coding agent needs to
function on a codebase.

Dhara is a **minimal coding harness**. Everything beyond these 6 tools
belongs in extensions:

| Tool | Why It's Non-Negotiable |
|---|---|
| `read` / `write` / `edit` | Agent must manipulate files |
| `ls` | Agent must navigate the filesystem |
| `grep` | Agent must search the codebase |
| `bash` | Agent must run commands |

Network tools (`web_fetch`, `web_search`), database tools, git
operations, and domain-specific capabilities belong in **extensions**.
This is exactly what the extension protocol is for.

See the [architecture](./architecture.md#the-extension-layer) for the extension model.

> **Note**: While extensions are the primary way to add functionality, Dhara ships
> with practical built-ins (6 tools, 3 provider adapters, TUI) so users have a
> working agent out of the box. Everything beyond these defaults should be an extension.

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

### 7. Network tools (NOT in standard library)

`web_fetch` and `web_search` are NOT standard tools. They belong in
**extensions** because:

- They touch the **network**, not the filesystem — a different domain entirely
- They require API keys and rate limiting — provider/extension concerns
- They're the **perfect extension demo** — "Write a web tools extension"
  demonstrates exactly what the extension protocol enables
- The sandbox already supports `network:outbound` capability checking
  for extensions to use

To build them as extensions, see:
- [extension-protocol.md](./extension-protocol.md)
- [package-manifest.md](./package-manifest.md)

Example extension layout:

```
web-tools/
├── manifest.yaml
├── index.ts          # JSON-RPC 2.0 server (handshake → register → execute)
└── README.md
```

```yaml
# web-tools/manifest.yaml
name: web-tools
description: Fetch URLs and search the web
version: 1.0.0
tools:
  - name: web_fetch
    description: Fetch content from a URL
    capability: network:outbound
  - name: web_search
    description: Search the web
    capability: network:outbound
```

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
├── read.ts             # read tool (~100 lines)
├── read.test.ts        # Tests
├── write.ts            # write tool (~60 lines)
├── write.test.ts       # Tests
├── edit.ts             # edit tool (~120 lines)
├── edit.test.ts        # Tests
├── ls.ts               # ls tool (~60 lines)
├── ls.test.ts          # Tests
├── grep.ts             # grep tool (~80 lines)
├── grep.test.ts        # Tests
├── bash.ts             # bash tool (~80 lines)
├── bash.test.ts        # Tests
└── index.ts            # Export all tools as a Map (~30 lines)
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
import { createBashTool } from "./bash.js";
import { createEditTool } from "./edit.js";
import { createGrepTool } from "./grep.js";
import { createLsTool } from "./ls.js";
import { createReadTool } from "./read.js";
import { createWriteTool } from "./write.js";
import type { ToolRegistration } from "../../core/provider.js";
import type { Sandbox } from "../../core/sandbox.js";

export function createStandardToolMap(config: {
  cwd: string;
  sandbox: Sandbox;
}): Map<string, ToolRegistration> {
  const tools: Record<string, ToolRegistration> = {
    read: createReadTool(config),
    write: createWriteTool(config),
    edit: createEditTool(config),
    ls: createLsTool(config),
    grep: createGrepTool(config),
    bash: createBashTool(config),
  };
  const map = new Map<string, ToolRegistration>();
  for (const [name, tool] of Object.entries(tools)) {
    map.set(name, tool);
  }
  return map;
}
```

## Dependency Order

1. `sandbox-context.ts` — shared sandbox instance
2. Individual tool files — each independently testable
3. `index.ts` — bundles them into a `Map<string, ToolRegistration>`
4. CLI print mode → uses `index.ts` to register tools

## Success Criteria
- All 6 tools work against real filesystem (with temp dirs in tests)
- Sandbox blocks disallowed operations
- Path traversal correctly prevented
- All tools follow the same `ToolRegistration` interface
- 0 type errors, 0 lint errors, ≥ 90% coverage
