# Spec: Extension Loading

> Status: draft · Depends on: Extension Protocol (protocol.ts), ToolRegistration interface, Sandbox

## Goal

Spawn subprocess extensions, discover their tools via JSON-RPC handshake, and register them into the Agent Loop dynamically. This proves the language-agnostic extension protocol works end-to-end.

## What It Does

```
dhara extension install ./my-grep-tool
→ reads manifest.yaml
→ validates capabilities against user approval
→ spawns subprocess: python3 main.py
→ sends initialize request
→ extension responds with tool definitions
→ tools are registered in Agent Loop
→ on shutdown: graceful close via shutdown request
→ on crash: extension process restarted (max 3 retries)
```

## Architecture

```
src/core/
└── extension-manager.ts     # Manages extension lifecycle

src/core/
└── extension-manager.test.ts

example/
└── extension-dummy/
    ├── manifest.yaml         # Extension manifest
    └── main.py               # Simple Python extension
```

## Extension Manifest Format

Every extension ships with a `manifest.yaml`:

```yaml
# example/extension-dummy/manifest.yaml
name: dummy-tool
version: 1.0.0
description: "Simple echo tool for testing extension loading"
license: MIT

runtime:
  type: subprocess
  command: python3 main.py
  protocol: json-rpc

provides:
  tools:
    - name: echo
      description: "Echo a message back"
      capabilities: [filesystem:read]

capabilities:
  - filesystem:read
```

## JSON-RPC Handshake

When the ExtensionManager spawns a subprocess:

```
Core → Extension:
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "0.1.0",
    "config": {}           // From manifest config section
  }
}

Extension → Core:
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "0.1.0",
    "name": "dummy-tool",
    "version": "1.0.0",
    "tools": [
      {
        "name": "echo",
        "description": "Echo a message back",
        "parameters": {
          "type": "object",
          "properties": {
            "message": { "type": "string" }
          },
          "required": ["message"]
        },
        "capabilities": ["filesystem:read"]
      }
    ]
  }
}
```

## Tool Execution via Protocol

When the LLM calls a tool registered by this extension:

```
Core → Extension:
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/execute",
  "params": {
    "toolCallId": "call_abc123",
    "toolName": "echo",
    "input": { "message": "hello" }
  }
}

Extension → Core:
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [{ "type": "text", "text": "hello" }],
    "metadata": {}
  }
}
```

## ExtensionManager API

```typescript
export interface ExtensionManager {
  /** Load an extension from its manifest path. */
  load(manifestPath: string): Promise<LoadedExtension>;
  /** Unload an extension (shutdown + cleanup). */
  unload(extensionId: string): void;
  /** Get all tools registered by all loaded extensions. */
  getTools(): Map<string, ToolRegistration>;
  /** Get a specific loaded extension by ID. */
  getExtension(extensionId: string): LoadedExtension | undefined;
  /** List all loaded extensions. */
  listExtensions(): LoadedExtension[];
}

export interface LoadedExtension {
  id: string;
  name: string;
  version: string;
  status: "initializing" | "running" | "crashed" | "stopped";
  tools: Map<string, ToolRegistration>;
  protocol: ExtensionProtocol; // The JSON-RPC connection
  process: ChildProcess;       // The spawned subprocess
}
```

## Extension Lifecycle

```
1. User calls extensionManager.load("./my-tool/manifest.yaml")
2. Read and validate manifest.yaml
3. Check capabilities against sandbox/user approvals
4. Spawn subprocess: `python3 main.py`
5. Wait for stdout readiness (process is alive)
6. Send "initialize" request over JSON-RPC stdin/stdout
7. Receive response with tool definitions
8. Register each tool: status → "running"
9. On tool call: send "tools/execute" request, await response
10. On crash: status → "crashed", auto-restart (max 3 times, 1s backoff)
11. On unload: send "shutdown" notification, kill process after 5s timeout
```

## Error Handling

| Scenario | Behaviour |
|---|---|
| Subprocess fails to start | Error event, extension fails to load |
| Subprocess crashes mid-operation | Tools return error, extension auto-restarts |
| Handshake timeout (10s) | Kill process, mark as crashed |
| Tool execution timeout (30s) | Return timeout error, extension stays alive |
| Tool returns malformed JSON | Return parse error |
| Extension sends unknown method | Ignore notification |
| 3 consecutive crashes | Stop auto-restart, mark as permanently crashed |

## Security

- Extensions run as subprocesses — OS-level isolation
- Each tool declares capabilities in manifest → sandbox validates
- Subprocess has no access to Dhara core memory (stdin/stdout only)
- Audit log records every extension load, tool call, and capability check

## Example Python Extension for Testing

```python
#!/usr/bin/env python3
# example/extension-dummy/main.py
import sys
import json

def handle_request(req):
    method = req.get("method", "")
    req_id = req.get("id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "0.1.0",
                "name": "dummy-tool",
                "version": "1.0.0",
                "tools": [{
                    "name": "echo",
                    "description": "Echo a message back",
                    "parameters": {
                        "type": "object",
                        "properties": {"message": {"type": "string"}},
                        "required": ["message"]
                    },
                    "capabilities": ["filesystem:read"]
                }]
            }
        }

    if method == "tools/execute":
        tool_input = req["params"]["input"]
        message = tool_input.get("message", "")
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "content": [{"type": "text", "text": message}],
                "metadata": {}
            }
        }

    if method == "shutdown":
        sys.exit(0)

    return {
        "jsonrpc": "2.0",
        "id": req_id,
        "error": {"code": -32601, "message": "Method not found"}
    }

# Read JSON-RPC messages line by line from stdin
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        request = json.loads(line)
        response = handle_request(request)
        print(json.dumps(response), flush=True)
    except Exception as e:
        error_resp = {
            "jsonrpc": "2.0",
            "id": request.get("id") if 'request' in dir() else None,
            "error": {"code": -32700, "message": str(e)}
        }
        print(json.dumps(error_resp), flush=True)
```

## Integration with Agent Loop

The Agent Loop's `tools` map becomes dynamic:

```typescript
// Instead of:
const loop = createAgentLoop({ provider, session, tools: staticMap });

// With ExtensionManager:
const extManager = createExtensionManager({ sandbox });
await extManager.load("./my-tool/manifest.yaml");

const loop = createAgentLoop({
  provider,
  session,
  tools: extManager.getTools(), // Dynamic — updates as extensions load/unload
});
```

## Files Created

```
src/core/
├── extension-manager.ts         # Extension lifecycle management (~250 lines)
├── extension-manager.test.ts    # Tests (~300 lines)

example/
└── extension-dummy/
    ├── manifest.yaml            # Simple manifest
    └── main.py                  # Python echo extension (~40 lines)
```

## Files Modified

```
src/core/protocol.ts             # Already exists — used as-is
src/core/sandbox.ts              # Already exists — used as-is
```

## Tests

### Unit tests (mocked subprocess)
- `ext_manager.loads_extension_from_manifest` — parses manifest, spawns
- `ext_manager.handshake_registers_tools` — initialize → tool discovery
- `ext_manager.executes_tool_via_protocol` — tools/execute round trip
- `ext_manager.tool_returns_error_on_process_crash` — crash handling
- `ext_manager.auto_restarts_crashed_extension` — max 3 retries
- `ext_manager.shutdown_on_unload` — graceful close
- `ext_manager.handshake_timeout` — kills process after 10s
- `ext_manager.tool_execution_timeout` — returns error after 30s
- `ext_manager.rejects_invalid_manifest` — missing fields
- `ext_manager.blocks_undeclared_capabilities` — sandbox enforcement
- `ext_manager.unloads_extension` — removes tools from registry

### Integration test
- Spawn actual Python extension, call tool, verify result

## Dependency Order

1. ExtensionManager → uses protocol.ts, sandbox.ts
2. ExtensionManager → registers tools for Agent Loop
3. CLI print mode → uses ExtensionManager for tool discovery
4. CLI interactive mode → uses ExtensionManager for dynamic tool loading

## Success Criteria
- Spawn a Python subprocess, discover its tools, execute one, get result
- Extension crash → auto-restart (up to 3 times)
- Shutdown → graceful close
- Unknown tool → error result, not crash
- Handshake timeout → clean error
- All tools registered dynamically in Agent Loop
- 0 type errors, 0 lint errors
