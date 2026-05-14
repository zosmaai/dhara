# Extension Protocol

> The core innovation: extensions communicate via a standard wire protocol, not a language-specific API.

## Why Protocol Over API

Pi's extensions are TypeScript functions:
```typescript
export default function (pi: ExtensionAPI) {
  pi.registerTool({ ... });
}
```

This means:
- Only TypeScript/JavaScript can write extensions
- Extensions run in-process with full system access
- No sandboxing possible
- Extension crashes crash the agent

Our approach: extensions are **independent processes** (or WASM modules) that communicate via a standard protocol.

| | Pi (TypeScript API) | Ours (Wire Protocol) |
|---|---|---|
| Languages | TypeScript only | Any language |
| Runtime | In-process | Subprocess or WASM |
| Isolation | None | OS-level or WASM sandbox |
| Crash impact | Kills agent | Extension dies, agent continues |
| Hot reload | Possible (with state loss) | Clean restart of subprocess |
| Distribution | npm package | Any binary + manifest |

## Transport Options

Extensions declare their transport in the manifest:

### 1. Subprocess (JSON-RPC over stdio)

The default and most universal transport. Works with any language.

```
┌─────────┐    stdin/stdout     ┌──────────────┐
│  Core   │ ←── JSON-RPC ───→  │  Extension   │
│ (agent) │                     │ (subprocess) │
└─────────┘                     └──────────────┘
```

**When to use**: Most extensions. Tools, providers, hooks.

### 2. WASM (Shared memory)

For performance-critical extensions (syntax highlighting, parsing).

```
┌─────────┐    WASM ABI     ┌──────────────┐
│  Core   │ ←── calls ───→  │  WASM Module │
│ (agent) │                  │  (sandboxed) │
└─────────┘                  └──────────────┘
```

**When to use**: Text processing, syntax parsing, transformations.

### 3. TCP/Unix Socket (JSON-RPC)

For extensions that need to persist across agent restarts or serve multiple agents.

```
┌─────────┐   TCP/socket    ┌──────────────┐
│  Core   │ ←── JSON-RPC──→ │  Extension   │
│ (agent) │                  │  (daemon)    │
└─────────┘                  └──────────────┘
```

**When to use**: Database connections, language servers, long-running services.

## Protocol Specification

### Handshake

When the core spawns an extension subprocess:

```
Core → Extension:
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {
    "protocolVersion": "0.1.0",
    "capabilities": {
      "tools": true,
      "hooks": ["tool:call_start", "tool:call_end"],
      "commands": true
    },
    "config": { ... }              // User-provided configuration
  },
  "id": 1
}

Extension → Core:
{
  "jsonrpc": "2.0",
  "result": {
    "protocolVersion": "0.1.0",
    "name": "search-code",
    "version": "1.0.0",
    "tools": [
      {
        "name": "code_search",
        "description": "Search code semantically",
        "parameters": { ... },       // JSON Schema
        "returns": { ... },           // JSON Schema
        "capabilities": ["filesystem:read"]
      }
    ],
    "hooks": ["tool:call_start", "tool:call_end"],
    "commands": [
      {
        "name": "search",
        "description": "Interactive code search"
      }
    ]
  },
  "id": 1
}
```

### Tool Execution

When the LLM calls a tool registered by this extension:

```
Core → Extension:
{
  "jsonrpc": "2.0",
  "method": "tools/execute",
  "params": {
    "toolCallId": "call_abc123",
    "toolName": "code_search",
    "input": {
      "query": "authentication middleware",
      "language": "typescript"
    },
    "context": {
      "cwd": "/home/user/project",
      "sessionId": "sess_xyz",
      "turnNumber": 5
    }
  },
  "id": 2
}

Extension → Core:
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Found 3 matches:\n1. src/middleware/auth.ts:15\n2. src/routes/login.ts:42\n3. tests/auth.test.ts:8"
      }
    ],
    "display": [
      {
        "type": "table",
        "data": [
          { "file": "src/middleware/auth.ts", "line": 15, "snippet": "..." },
          { "file": "src/routes/login.ts", "line": 42, "snippet": "..." },
          { "file": "tests/auth.test.ts", "line": 8, "snippet": "..." }
        ]
      }
    ],
    "metadata": {
      "resultCount": 3,
      "searchTime_ms": 45
    }
  },
  "id": 2
}
```

### Streaming Tool Output

For long-running tools, the extension can stream partial results:

```
Extension → Core (notification):
{
  "jsonrpc": "2.0",
  "method": "tools/progress",
  "params": {
    "toolCallId": "call_abc123",
    "update": {
      "type": "text_delta",
      "delta": "Searching src/middleware/..."
    }
  }
}
```

### Tool Cancellation

When a user cancels an in-progress operation (e.g. Ctrl+C), the core
sends a cancellation request to the extension. The extension SHOULD
stop execution as soon as possible.

**Cancellation flow:**

```
1. User triggers cancellation (Ctrl+C, UI button, etc.)
2. Core sends tools/cancel notification to the extension
3. Extension stops execution and MAY send a final progress update
4. After a grace period (default 5s), core sends SIGTERM to subprocess
5. Core does NOT wait for a result — the cancelled call is dropped
```

**Cancel notification:**

```
Core → Extension (notification, no response expected):
{
  "jsonrpc": "2.0",
  "method": "tools/cancel",
  "params": {
    "toolCallId": "call_abc123"
  }
}
```

If `toolCallId` is omitted, all in-flight tool calls for this extension
are cancelled:

```
Core → Extension:
{
  "jsonrpc": "2.0",
  "method": "tools/cancel",
  "params": {}   // Cancel all
}
```

**Grace period and force-kill:**
```
Core sends tools/cancel notification
  └→ Wait up to 5 seconds (configurable)
      └→ If extension still running → SIGTERM (subprocess)
          └→ If still running after 2s → SIGKILL (subprocess)
```

**Extension implementation pattern:**

```python
import signal
import sys

cancelled_calls = set()

# Listen for cancellation notifications
def handle_message(request):
    if request["method"] == "tools/cancel":
        tool_id = request["params"].get("toolCallId")
        if tool_id:
            cancelled_calls.add(tool_id)
        else:
            # Cancel all — mark everything as cancelled
            cancelled_calls.clear()
        return None  # Notifications don't get responses

# Check cancellation in long-running operations
def long_running_search(tool_call_id, query):
    for chunk in search(query):
        if tool_call_id in cancelled_calls:
            return {"status": "cancelled", "partial": accumulated}
        accumulated += chunk
    return {"status": "completed", "result": accumulated}
```

**Error code for cancelled operations:**

| Code | Meaning |
|---|---|
| -32004 | Operation cancelled by user |

### Event Hooks

Extensions subscribe to events during initialization. The core sends events as notifications:

```
Core → Extension (notification):
{
  "jsonrpc": "2.0",
  "method": "event/tool:call_start",
  "params": {
    "toolName": "bash",
    "input": {
      "command": "rm -rf node_modules"
    },
    "context": {
      "cwd": "/home/user/project",
      "sessionId": "sess_xyz"
    }
  }
}

Extension → Core (blocking response — only for hooks that declare "blocking: true"):
{
  "jsonrpc": "2.0",
  "result": {
    "action": "block",
    "reason": "Destructive command blocked by safety policy"
  }
}
```

### Commands

Slash commands are user-triggered actions:

```
Core → Extension:
{
  "jsonrpc": "2.0",
  "method": "commands/execute",
  "params": {
    "commandName": "search",
    "args": "authentication"
  },
  "id": 3
}
```

### Error Handling

```
Extension → Core:
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32001,
    "message": "Search index not built",
    "data": {
      "suggestion": "Run /search --build first"
    }
  },
  "id": 2
}
```

Standard error codes:

| Code | Meaning |
|---|---|
| -32700 | Parse error (invalid JSON) |
| -32600 | Invalid request |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32001 | Tool execution error (non-fatal) |
| -32002 | Capability denied |
| -32003 | Extension crashed |
| -32004 | Operation cancelled by user |
| -32010 | Provider error (rate limit, auth, etc.) |

### Shutdown

```
Core → Extension:
{
  "jsonrpc": "2.0",
  "method": "shutdown",
  "params": {}
}

Extension → Core:
{
  "jsonrpc": "2.0",
  "result": { "status": "ok" },
  "id": 99
}

(Extension process exits with code 0)
```

## Manifest Format

Every extension declares a `manifest.yaml` (or `manifest.json`):

```yaml
# manifest.yaml
name: code-search
version: 1.0.0
description: "Semantic code search powered by embeddings"
author: "Your Name <you@example.com>"
license: MIT

# How to run this extension
runtime:
  type: subprocess          # subprocess | wasm | socket
  command: python3 main.py  # For subprocess
  # wasm_file: ./search.wasm  # For WASM
  # socket: /tmp/search.sock   # For socket
  protocol: json-rpc        # Always JSON-RPC 2.0

# What this extension provides
provides:
  tools:
    - name: code_search
      description: "Search code semantically"
      capabilities: [filesystem:read]
    - name: index_build
      description: "Build search index"
      capabilities: [filesystem:read, filesystem:write]
  hooks:
    - event: tool:call_start
      blocking: true        # Can intercept and block
    - event: session:start
      blocking: false       # Observer only
  commands:
    - name: search
      description: "Interactive code search"

# What this extension needs
capabilities:
  - filesystem:read
  - network:outbound        # For embedding API calls

# User-configurable settings (JSON Schema)
config:
  type: object
  properties:
    embedding_provider:
      type: string
      enum: [local, openai]
      default: local
    index_path:
      type: string
      default: .search-index
```

## Extension Lifecycle

```
1. Core reads manifest.yaml
2. Core checks capabilities against user-approved list
3. Core spawns extension process (or loads WASM)
4. Core sends "initialize" request
5. Extension responds with tools, hooks, commands
6. Core registers everything
7. Extension processes requests until "shutdown"
8. If extension crashes: core logs error, notifies user, continues without it
```

## Security Guarantees

1. **Capability enforcement**: The sandbox intercepts all system calls and blocks anything not declared in the manifest
2. **Crash isolation**: Extension crashes don't affect the core or other extensions
3. **Resource limits**: CPU, memory, and time limits per extension
4. **No shared state**: Extensions can't see each other's memory or communicate directly
5. **Audit trail**: All capability usage is logged

See [capability-model.md](./capability-model.md) for the full security specification.

## Comparison: Writing a "grep" Tool

### Pi (TypeScript API)
```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "grep",
    description: "Search for patterns in files",
    parameters: Type.Object({
      pattern: Type.String(),
      path: Type.String(),
    }),
    async execute(id, params, signal, onUpdate, ctx) {
      const result = await exec("grep", ["-rn", params.pattern, params.path]);
      return {
        content: [{ type: "text", text: result.stdout }],
        details: {},
      };
    },
  });
}
```

### Ours (Python, via protocol)
```python
# main.py
import sys
import json
import subprocess

def handle_request(request):
    method = request["method"]
    
    if method == "initialize":
        return {
            "protocolVersion": "0.1.0",
            "name": "grep",
            "tools": [{
                "name": "grep",
                "description": "Search for patterns in files",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": {"type": "string"},
                        "path": {"type": "string"}
                    },
                    "required": ["pattern"]
                },
                "capabilities": ["filesystem:read"]
            }]
        }
    
    elif method == "tools/execute":
        params = request["params"]["input"]
        result = subprocess.run(
            ["grep", "-rn", params["pattern"], params.get("path", ".")],
            capture_output=True, text=True
        )
        return {
            "content": [{"type": "text", "text": result.stdout}],
            "metadata": {"exitCode": result.returncode}
        }

# Simple JSON-RPC stdin/stdout loop
for line in sys.stdin:
    request = json.loads(line)
    response = handle_request(request)
    response["id"] = request.get("id")
    print(json.dumps(response), flush=True)
```

Same tool, different language, same protocol. The core doesn't know or care that it's Python.

### Ours (Rust, via protocol)
```rust
// With Rust SDK (published as `dhara-extension` on crates.io)
use dhara_extension::Extension;
use serde_json::json;

fn main() -> std::io::Result<()> {
    Extension::new("grep", "1.0.0")
        .description("Search for patterns in files")
        .tool(
            "grep",
            "Search files with regex",
            json!({"type": "object"}),
            |input| {
                let result = std::process::Command::new("grep")
                    .args(["-rn", &input["pattern"].as_str().unwrap_or("")])
                    .output()
                    .unwrap();
                dhara_extension::ToolResult {
                    content: vec![dhara_extension::ContentBlock {
                        block_type: "text".to_string(),
                        text: Some(String::from_utf8_lossy(&result.stdout).to_string()),
                    }],
                    is_error: None,
                }
            },
        )
        .run()
}
```

## Extension SDK (Optional Convenience)

While the protocol is the standard, we provide **optional SDKs** for popular languages that handle the JSON-RPC boilerplate:

- `@zosmaai/dhara-extension` — TypeScript zero-dependency SDK
- `dhara-extension` (PyPI) — Python SDK
- `dhara-extension` (crates.io) — Rust SDK

These SDKs are NOT required. You can implement the protocol directly. The SDKs just make it easier.

```python
# With Python SDK (published as `dhara-extension` on PyPI)
from dhara_extension import create_extension

ext = create_extension("grep")

@ext.tool(
    name="grep",
    description="Search for patterns in files",
    capabilities=["filesystem:read"]
)
def grep(input: dict) -> dict:
    import subprocess
    pattern = input.get("pattern", "")
    path = input.get("path", ".")
    result = subprocess.run(["grep", "-rn", pattern, path], capture_output=True, text=True)
    return {"content": [{"type": "text", "text": result.stdout}]}

ext.run()  # Handles JSON-RPC stdin/stdout loop automatically
```
