# Architecture

## The Problem with Existing Approaches

| Agent | Approach | Problem |
|---|---|---|
| Claude Code | Monolithic product | Hidden context injection, vendor lock-in, 10K-token system prompt |
| Codex | Vertical integration | OpenAI-only, cloud-dependent, IDE-coupled |
| Pi | Minimal product | TypeScript-only extensions, no security model, npm-as-registry |

All three conflate three things that should be separate:
1. **The agent loop** (how LLM ↔ tools interact)
2. **The tool ecosystem** (what the agent can do)
3. **The presentation layer** (how humans interact with it)

## The Three Layers

```
┌─────────────────────────────────────────────────────┐
│                    ECOSYSTEM LAYER                   │
│                                                     │
│   Packages  ·  Themes  ·  Skills  ·  Prompts        │
│   (community-contributed, from curated registry)    │
│                                                     │
├─────────────────────────────────────────────────────┤
│                   EXTENSION LAYER                    │
│                                                     │
│   Tools  ·  Providers  ·  Renderers  ·  Hooks       │
│   (language-agnostic, sandboxed, capability-declared)│
│                                                     │
├─────────────────────────────────────────────────────┤
│                     CORE LAYER                       │
│                                                     │
│   Agent Loop  ·  Tool Interface  ·  Session Format  │
│   Event Bus  ·  Sandbox                             │
│   (< 2,000 lines, no LLM code, no UI code)         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## What's in the Core (< 2K lines)

The core contains **only** the machinery that can't be an extension:

### 1. Agent Loop (`loop.ts`)
The state machine that drives LLM ↔ tool interaction:

```
User prompt
  → Build context (system prompt + history + tools)
  → Call LLM
  → If tool call: execute tool, append result, loop
  → If text response: emit to user
  → If error: handle per policy
```

The loop knows nothing about:
- Which LLM provider to use (that's a provider extension)
- What tools are available (that's tool extensions)
- How to display output (that's a renderer extension)
- Where sessions are stored (that's a session manager extension)

### 2. Tool Interface (`protocol.ts`)
The contract for what a tool looks like:

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;        // Standard JSON Schema, not TypeBox
  returns: JSONSchema;
  capabilities: Capability[];    // What permissions this tool needs
}

interface ToolResult {
  content: ContentBlock[];       // What the LLM sees
  display?: DisplayBlock[];      // What the UI shows (optional richer output)
  metadata?: Record<string, unknown>;  // Machine-readable details
}
```

### 3. Session Format (`session.ts`)
An open, versioned, schema-validated format for conversation history. See [session-format.md](./session-format.md).

### 4. Event Bus (`events.ts`)
Standard events that extensions subscribe to:

```
Lifecycle:   core:init, core:shutdown
Session:     session:start, session:end, session:fork, session:resume
Agent:       agent:prompt, agent:response, agent:error
Tool:        tool:call_start, tool:call_end, tool:call_blocked
Model:       model:switch, model:token_count, model:cost
Extension:   extension:load, extension:error, extension:capability_request
```

### 5. Sandbox (`sandbox.ts`)
Capability enforcement. See [capability-model.md](./capability-model.md).

## What's NOT in the Core

| Concern | Why It's Not Core | Where It Lives |
|---|---|---|
| LLM API calls | Providers differ, new ones emerge | Provider extensions |
| LLM providers | Multi-provider support is an extension concern | `std/providers/` |
| Terminal UI | Presentation is separate from agent logic | Renderer extension |
| File operations | Tools are extensions, even "default" ones | `std/tools/` |
| Package management | Registry is a service, not agent logic | `registry/` |
| System prompt | User-controlled, project-specific | Configuration |
| Context files | Project instructions, loaded at startup | AGENTS.md / CLAUDE.md walk-up |
| Project config | Per-project settings (model, tools) | `.dhara/settings.json` |
| Compaction | Strategy varies by use case | Extension hook |

## The Extension Layer

Extensions are the ONLY way to add functionality. The core does nothing useful without them.

### Extension Types

| Type | What It Does | Example |
|---|---|---|
| **Tool** | Registers callable tools for the LLM | `read`, `bash`, `search` |
| **Provider** | Registers LLM providers | `openai`, `anthropic`, `ollama` |
| **Renderer** | Controls output display | Terminal TUI, JSON stream, Web UI |
| **Hook** | Intercepts events | Permission gate, logging, audit trail |
| **Command** | Registers slash commands | `/diff`, `/review`, `/deploy` |
| **Compactor** | Custom context compaction | Tiered memory, selective pruning |

### Extension Protocol

Extensions communicate with the core via a **language-agnostic protocol**. See [extension-protocol.md](./extension-protocol.md).

The key design decision: **extensions are NOT function calls in the host language**. They communicate via a standard wire protocol. This means:

- Write extensions in Python, Rust, Go, TypeScript, or anything
- Extensions can be subprocess-based or WASM-based
- The core doesn't care about the extension's language or runtime
- Extensions can be sandboxed independently

## The Ecosystem Layer

Packages bundle extensions, skills, prompts, and themes for sharing. See [package-manifest.md](./package-manifest.md).

### Why a Separate Registry (Not npm)

| npm (Pi's approach) | Our Registry |
|---|---|
| Keyword search (`pi-package`) | Dedicated namespace |
| No capability declarations | Required capability metadata |
| No security audits | Optional sigstore provenance |
| No quality gates | Reviews, downloads, compatibility scores |
| Generic package manager | Purpose-built for agent extensions |
| JavaScript ecosystem only | Any language |

### Package Types

```
@namespace/tool-name        # Single tool
@namespace/tool-collection  # Multiple tools bundled
@namespace/provider-name    # LLM provider
@namespace/theme-name       # Visual theme
@namespace/skill-pack       # Prompt + tools + context
```

## Context Conventions

Dhara implementations MUST load project-level instructions from context files,
enabling users to configure agent behavior per-project without touching
system prompts.

### Discovery

Implementations walk up from the working directory (`cwd`) towards the
filesystem root, looking for context files. The walk stops at the **first**
directory that contains either file — closest ancestor wins.

| File | Scope | Priority |
|---|---|---|
| `~/.dhara/AGENTS.md` | Global (user home) | Loaded first |
| `~/.dhara/CLAUDE.md` | Global (user home) | Loaded second |
| `AGENTS.md` | Project (walk-up) | Closest ancestor wins |
| `CLAUDE.md` | Project (walk-up) | Closest ancestor wins |

**Global files** (`~/.dhara/`) are always loaded if they exist. Project files
replace all parent-level config — the walk discovers the **closest** ancestor
with context files, not all ancestors.

### Format

Context files are plain Markdown with YAML frontmatter (optional):

```markdown
# Project Instructions

- Run `npm run check` before committing
- Keep responses concise
- Never modify production data
```

There is no required schema beyond Markdown. The content is injected verbatim
into the system prompt.

### Injection

When context files are present, they are prepended to the system prompt with
delineation markers so the agent can distinguish project instructions from its
base system prompt:

```
<context file="/home/user/project/AGENTS.md" source="project">
Project instructions here...
</context>

---

[base system prompt follows]
```

### Reload

Implementations SHOULD provide a reload mechanism that re-reads all context
files from disk without restarting the session. In CLI implementations, this
is exposed as a `/reload` command (see Standard REPL Commands).

### Disabling

Implementations SHOULD support a mechanism to disable context file loading
(e.g. `--no-context-files` flag) for environments where automated context
injection is undesirable.


## Project Configuration (`.dhara/`)

Implementations SHOULD support a `.dhara/` directory in the project root for
per-project configuration. This is the Dhara equivalent of `.pi/` or `.vscode/`.

### Discovery

The `.dhara/` directory is discovered by walking up from `cwd` towards the
filesystem root. The **closest** `.dhara/` directory to `cwd` wins. Unlike
context files, multiple `.dhara/` directories MAY be inspected by
implementations that support cascading config.

### Directory Structure

```
project/
└── .dhara/
    ├── settings.json       Required: Project configuration (see schema below)
    ├── skills/             Optional: Project-level skills (SKILL.md files)
    ├── sessions/           Optional: Project-local session storage
    └── extensions/         Optional: Project-level extensions (manifest.yaml)
```

### `settings.json` Schema

```json
{
  "$schema": "dhara://schemas/settings.json",
  "type": "object",
  "properties": {
    "provider": {
      "type": "string",
      "description": "Default LLM provider ID (e.g. \"anthropic\", \"openai\")"
    },
    "model": {
      "type": "string",
      "description": "Default model ID (e.g. \"claude-sonnet-4-20250514\")"
    },
    "baseUrl": {
      "type": "string",
      "description": "Custom API base URL for the provider"
    },
    "maxIterations": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100,
      "default": 10,
      "description": "Maximum agent loop iterations per prompt"
    },
    "autoSave": {
      "type": "boolean",
      "default": true,
      "description": "Automatically save session state on every mutation"
    },
    "skillDirectories": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Extra directories to search for skills"
    },
    "tools": {
      "type": "object",
      "additionalProperties": { "type": "boolean" },
      "description": "Enable or disable specific tools by name"
    }
  }
}
```

### Precedence (highest to lowest)

1. CLI flags (`--model`, `--provider`, `--base-url`, etc.)
2. `.dhara/settings.json`
3. Global `~/.dhara/config.json`
4. Built-in defaults


## Global Directory (`~/.dhara/`)

Dhara implementations MUST use `~/.dhara/` as the global configuration
directory. This stores user-level settings that apply across all projects.

### Structure

```
~/.dhara/
├── config.json              Provider configurations, auth, defaults
├── AGENTS.md                Global context file (optional)
├── CLAUDE.md                Global context file, alias (optional)
├── skills/                  Global skills (optional)
├── sessions/                Default session storage location
└── extensions/              Global extensions (optional)
```

### Global Context Files

`~/.dhara/AGENTS.md` and `~/.dhara/CLAUDE.md` are loaded before project-level
context files. They provide user-wide instructions that apply to every project.

### Provider Configuration

The global `config.json` uses the schema defined in the implementation's
`ConfigManager`. A reference format is:

```json
{
  "version": "1.0.0",
  "activeProvider": "anthropic",
  "providers": [
    {
      "id": "anthropic",
      "name": "Anthropic",
      "authType": "api_key",
      "auth": { "type": "api_key", "apiKey": "..." },
      "defaultModel": "claude-sonnet-4-20250514",
      "enabled": true
    }
  ],
  "session": {
    "autoSave": true,
    "maxIterations": 10
  }
}
```

### Session Storage

By default, sessions are stored in `~/.dhara/sessions/` as JSONL files.
Implementations MAY support alternative storage locations via
`.dhara/sessions/` (project-level) or custom paths.


## Standard REPL Commands

Every CLI implementation SHOULD support the following built-in slash commands.
Extensions may register additional commands via the extension protocol.

| Command | Arguments | Description |
|---|---|---|
| `/exit` | — | Exit the REPL |
| `/quit` | — | Alias for `/exit` |
| `/save` | — | Explicitly persist the current session |
| `/list` | — | List all saved sessions |
| `/resume` | `<session-id>` | Load a previous session into context |
| `/reload` | — | Re-read context files and project config from disk. Re-creates the agent loop with updated settings without restarting the session. |
| `/status` | — | Display current configuration: active provider/model, working directory, loaded context files (with source type, path, and line count), project config path, and current session ID. |
| `/help` | — | Show available commands |

### Implementation Notes

- **`/reload`**: The agent loop MUST be re-created with the new system prompt
  (containing updated context files). The existing session and its history
  MUST be preserved.
- **`/status`**: SHOULD show file paths for context files, their source
  (`global` vs `project`), and their line counts to help users debug what
  the agent sees.
- Commands starting with `/` are consumed by the REPL and NOT sent to the
  agent. Extensions can register additional commands.


## Comparison with Pi's Architecture

```
Pi (4 packages, tightly coupled):
  pi-ai → pi-agent-core → pi-coding-agent
  pi-tui ↗

Our approach (3 layers, protocol-coupled):
  core (loop + protocol + session + events + sandbox)
    ↕ extension protocol
  extensions (tools, providers, renderers, hooks)
    ↕ package registry
  ecosystem (packages, themes, skills, prompts)
```

Pi bundles the LLM API (`pi-ai`) into a core package. We make it an extension. Pi bundles the TUI (`pi-tui`) into a core package. We make it an extension. Pi's extension API is a TypeScript function signature. Ours is a wire protocol.

The result: a core that's genuinely minimal (under 2K lines) and genuinely language-agnostic.

## Permission Model Gaps (Post-MVP)

The current sandbox implementation (`src/core/sandbox.ts`) covers capability checking and path traversal, but has known gaps that must be addressed before production use.

### Implemented ✅
| Feature | Status | Details |
|---|---|---|
| Capability matching | Done | Exact + wildcard (`filesystem:*`) |
| Path traversal protection | Done | `../` detection, cwd prefix enforcement |
| Domain allowlisting | Done | Per-command allowed domains |
| Command allowlisting | Done | Per-command allowed executables |
| Audit callback | Done | In-memory callback per check |

### Gaps (Post-MVP) ❌

| Gap | Impact | Priority |
|---|---|---|
| **Extension isolation** — Each extension should get its own sandbox with separate granted capabilities. Currently one sandbox for everything. | One malicious extension can use another extension's capabilities | **High** |
| **User approval flow** — No mechanism to display a capability prompt during extension install and let users approve/deny | Extensions can't request capabilities; user has no visibility | **High** |
| **Persistent permission store** — Approved capabilities aren't saved to disk. Every session starts fresh. | Users re-approve every time. No memory of trusted extensions. | **Medium** |
| **File quarantine** — Can't block specific sensitive paths (`.env`, `credentials.json`, SSH keys) even within cwd. The current model only blocks *outside* cwd. | Sensitive files within the project are fully accessible | **Medium** |
| **Resource limits** — No CPU, memory, or file descriptor limits per tool call or per extension. `bash` has optional timeout but core doesn't enforce it. | A runaway extension can DoS the agent or system | **Medium** |
| **Capability revocation** — No way to revoke a capability from a running extension without restarting | Once approved, a capability can't be rescinded mid-session | **Low** |
| **Audit persistence** — Audit callback exists but nothing writes it to disk. Logs are lost on restart. | No forensic trail for security incidents | **Low** |
| **OS-level sandboxing** — seccomp-bpf (Linux), sandbox-exec (macOS), Job Objects (Windows) not implemented | Subprocess sandboxing relies on core interception, not OS enforcement | **Low** |

### Design Notes

These gaps are intentional for the MVP phase. The priority order above reflects:
1. **Extension isolation** must come before any real extension ecosystem
2. **Approval flow** is needed for any UX beyond developer-only
3. **File quarantine** and **resource limits** are needed for production safety
4. The rest can wait for v1

The capability model in [capability-model.md](./capability-model.md) already specifies the ideal state. These gaps represent the delta between spec and implementation.

## Embedding

The core can be embedded in:
- **CLI** — terminal coding agent (like pi)
- **Desktop app** — Tauri/Electron GUI (like pi-cowork)
- **Web app** — browser-based coding agent
- **CI/CD pipeline** — automated code review
- **IDE plugin** — VS Code / Neovim integration
- **SDK** — programmatic agent in any language

All of these use the same core, the same extension protocol, the same session format. The only difference is the renderer extension.
