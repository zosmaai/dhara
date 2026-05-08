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

## Embedding

The core can be embedded in:
- **CLI** — terminal coding agent (like pi)
- **Desktop app** — Tauri/Electron GUI (like pi-cowork)
- **Web app** — browser-based coding agent
- **CI/CD pipeline** — automated code review
- **IDE plugin** — VS Code / Neovim integration
- **SDK** — programmatic agent in any language

All of these use the same core, the same extension protocol, the same session format. The only difference is the renderer extension.
