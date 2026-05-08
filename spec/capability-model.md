# Capability Model

> Extension security through declared capabilities, user approval, and sandbox enforcement.

## The Problem

Pi's entire security model:
> "Extensions execute arbitrary code. Review source code before installing third-party packages."

This is not a security model. It's a disclaimer.

In practice:
- 2,143 packages on Pi's registry
- Zero automated security auditing
- No capability declarations
- No sandboxing
- A malicious package can exfiltrate SSH keys, modify source code, install backdoors

## Our Approach: Capability-Based Security

Three layers of defense:

```
1. DECLARE  — Extensions list capabilities in their manifest
2. APPROVE  — Users review and approve capabilities before first run
3. ENFORCE  — The sandbox blocks any capability not explicitly approved
```

This is the model used by Android, Deno, and WASI. It's proven and well-understood.

## Capability Catalog

### Filesystem

| Capability | Description | Example |
|---|---|---|
| `filesystem:read` | Read files | `fs_read`, `code_search` |
| `filesystem:write` | Create, modify, or delete files | `fs_write`, `fs_edit` |
| `filesystem:watch` | Watch files for changes | File watcher extension |

### Network

| Capability | Description | Example |
|---|---|---|
| `network:outbound` | Make outbound HTTP/WebSocket requests | `web_fetch`, `code_search` (API) |
| `network:inbound` | Listen on a port | Web UI extension |
| `network:dns` | Custom DNS resolution | Corporate proxy extension |

### Process

| Capability | Description | Example |
|---|---|---|
| `process:spawn` | Spawn child processes | `shell_exec` |
| `process:signal` | Send signals to processes | Process manager extension |
| `process:system-info` | Read system information (env vars, hostname, etc.) | Diagnostics extension |

### Secrets

| Capability | Description | Example |
|---|---|---|
| `secrets:read` | Read stored secrets / API keys | Provider extensions |
| `secrets:write` | Store secrets | Auth extension |
| `secrets:env` | Read environment variables | Shell integration |

### Session

| Capability | Description | Example |
|---|---|---|
| `session:read` | Read conversation history | Search extension |
| `session:write` | Modify conversation history | Compaction extension |
| `session:fork` | Create conversation branches | Branching extension |

### Clipboard & UI

| Capability | Description | Example |
|---|---|---|
| `clipboard:read` | Read system clipboard | Paste integration |
| `clipboard:write` | Write to system clipboard | Copy extension |
| `ui:render` | Render custom UI components | Rich display extensions |
| `ui:notify` | Show system notifications | Alert extension |

### Agent

| Capability | Description | Example |
|---|---|---|
| `agent:prompt` | Send prompts to the agent | Sub-agent extension |
| `agent:tool-register` | Register new tools dynamically | Meta-extension |
| `agent:model-switch` | Switch the active model | Router extension |

## Manifest Declaration

```yaml
# manifest.yaml
name: my-extension
version: 1.0.0

capabilities:
  - filesystem:read        # Read files
  - network:outbound       # Call external APIs
  # NOT declared: filesystem:write, process:spawn, secrets:read
  # → Sandbox will BLOCK these operations
```

Capabilities are **opt-in, not opt-out**. If you don't declare it, you can't do it.

## User Approval Flow

### First Install

```
╭─────────────────────────────────────────────────╮
│  Package: @dev/code-search v1.2.0               │
│  Author: developer@example.com                  │
│  License: MIT                                   │
│  Downloads: 12,450                              │
│  Signed: ✓ (sigstore verified)                  │
│                                                 │
│  Capabilities requested:                        │
│                                                 │
│  ✓ filesystem:read                              │
│    Read files in your project                   │
│                                                 │
│  ✓ network:outbound                             │
│    Make API calls to embedding service          │
│    Domains: api.openai.com                      │
│                                                 │
│  (No write, process, or secret access needed)   │
│                                                 │
│  [Allow all] [Review each] [Deny]               │
╰─────────────────────────────────────────────────╯
```

### Granular Approval

For security-sensitive users:

```
╭─────────────────────────────────────────────────┐
│  Capability: process:spawn                      │
│                                                 │
│  @dev/shell-tools wants to spawn processes.     │
│                                                 │
│  Allowed commands (configure):                  │
│  ✓ git, npm, node, python3, cargo               │
│  ✗ rm, sudo, curl, wget, chmod                  │
│                                                 │
│  [Allow restricted] [Allow all] [Deny]          │
╰─────────────────────────────────────────────────╯
```

### Permission Persistence

Approved capabilities are stored in:

```
~/.project/
├── permissions/
│   ├── global.json          # Approved for all projects
│   └── projects/
│       └── my-project.json  # Project-specific approvals
```

```json
{
  "@dev/code-search": {
    "version": "1.2.0",
    "approved": "2026-05-08T10:30:00Z",
    "capabilities": {
      "filesystem:read": true,
      "network:outbound": {
        "allowed": true,
        "domains": ["api.openai.com"]
      }
    }
  }
}
```

## Sandbox Enforcement

### Subprocess Sandboxing

Extensions running as subprocesses are sandboxed using OS-level mechanisms:

**Linux**: seccomp-bpf + namespaces
- Filesystem: only paths under CWD and approved directories
- Network: only approved outbound connections
- Process: only approved commands

**macOS**: sandbox-exec (deprecated but functional) + entitlements

**Windows**: Job Objects + restricted tokens

**Cross-platform fallback**: The core intercepts all tool calls and validates them against approved capabilities before execution. This is less secure than OS-level sandboxing but works everywhere.

### WASM Sandboxing

WASM extensions are sandboxed by default:
- No filesystem access unless explicitly granted
- No network access unless explicitly granted
- Memory limits enforced by the WASM runtime
- CPU time limits enforced by the core

### What Gets Intercepted

| Action | Check | Block Behavior |
|---|---|---|
| File read | Path against approved directories | Return permission error |
| File write | Path against approved directories | Return permission error |
| HTTP request | Domain against approved list | Return connection refused |
| Process spawn | Command against approved list | Return permission error |
| Env var read | Against approved var list | Return undefined |
| Secret access | Against approved secrets | Return permission error |

## Capability Downgrade

Users can revoke capabilities at any time:

```bash
project permissions --revoke @dev/code-search network:outbound
```

If a running extension loses a capability:
1. The sandbox starts blocking those operations
2. The extension receives permission errors
3. The extension can degrade gracefully or report an error

## Audit Trail

All capability usage is logged:

```
~/.project/logs/audit.jsonl
```

```jsonl
{"ts":"2026-05-08T10:30:01Z","extension":"@dev/code-search","capability":"filesystem:read","action":"read","path":"src/auth.ts","allowed":true}
{"ts":"2026-05-08T10:30:01Z","extension":"@dev/code-search","capability":"network:outbound","action":"POST","url":"https://api.openai.com/v1/embeddings","allowed":true}
{"ts":"2026-05-08T10:30:02Z","extension":"@dev/code-search","capability":"filesystem:read","action":"read","path":"../../etc/passwd","allowed":false,"reason":"path traversal outside CWD"}
```

## Comparison with Pi's Security

| | Pi | Ours |
|---|---|---|
| **Model** | None ("review source code") | Capability-based (declare → approve → enforce) |
| **Sandboxing** | None | OS-level + WASM + core interception |
| **Permission UI** | None | Install-time approval + granular configuration |
| **Audit trail** | None | All capability usage logged |
| **Path traversal** | Not prevented | Blocked by sandbox |
| **Network restrictions** | None | Domain allowlisting |
| **Command restrictions** | None | Command allowlisting for process:spawn |
| **Revocation** | N/A | Revoke any capability at any time |
| **Crash isolation** | None (in-process) | Full isolation (subprocess/WASM) |

## Security Levels

Users choose their security posture:

```bash
# Paranoid — approve every capability individually
project config security.level paranoid

# Standard — approve at package level, audit trail on
project config security.level standard

# Trusted — auto-approve packages from trusted authors
project config security.level trusted

# YOLO — no sandboxing (like Pi) — NOT RECOMMENDED
project config security.level yolo
```

Default: `standard`.
