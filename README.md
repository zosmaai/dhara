<p align="center">
  <img src="https://raw.githubusercontent.com/zosmaai/dhara/refs/heads/main/assets/dhara-logo.svg" width="180" alt="Dhara logo">
</p>

<h1 align="center">Dhara — धारा</h1>

<p align="center">
  <strong>The Agent Protocol Standard</strong>
</p>

<p align="center">
  <em>Minimal. Secure. Language-agnostic. Open standard.</em>
</p>

<p align="center">
  <code>npm install -g @zosmaai/dhara</code>
</p>

<p align="center">
  <a href="#why">Why</a> ·
  <a href="#what-is-dhara">What</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#ecosystem">Ecosystem</a> ·
  <a href="#roadmap">Roadmap</a>
</p>

<hr>

<br>

# धारा — Dhara

**Dhara** (धारा, dhārā) is a Sanskrit word meaning **flow** or **stream** — the continuous, seamless stream between LLM and tools that defines every agent interaction.

> An agent is an LLM, a loop, and enough tokens. Dhara defines the standard for that loop.

---

## Why

Coding agents today are **products**, not **platforms**. They ship as bloated, all-in-one packages that force you into their way of working:

### 🔒 Claude Code / Codex
- **Heavy customization** — you need their bloated plugin/extension systems just to make basic workflow changes
- **Vendor-defined defaults** — hidden context injection, opaque system prompts that change between releases
- **Opinionated UX** — you adapt to their workflow, not the other way around
- **Platform lock** — customization always happens within their walls

### 🔒 Opencode
- **Open source but bloated** — client/server architecture, MCP servers, custom agents, themes, keybindings, config files — it's a full platform before you even start
- **Heavy feature surface** — built-in tools, LSP support, custom commands, agent system, plugin ecosystem — all shipped upfront whether you need them or not
- **Opinionated defaults** — you spend time configuring instead of coding
- **The AI adapts to its platform** — not to your workflow

### 🔒 Pi
- **TypeScript-only** extensions — locks out Python, Rust, Go ecosystems
- **No security model** — "extensions execute arbitrary code" is the entire security policy
- **npm as registry** — keyword search instead of curated discovery
- **In-process extensions** — one crash kills your whole session
- **Lossy compaction** — context is thrown away, never to be recovered

Proprietary harnesses like Claude Code and Codex inject hidden context, mutate behavior between releases, and give you limited visibility into what the model actually saw.

**Dhara exists because the agent harness should be a standard, not a product.**

Like **HTTP** standardized how web servers talk to browsers, like **LSP** standardized how editors talk to language servers — **Dhara standardizes how agents talk to tools.**

The spec is the moat. Anyone can implement it.

> The AI adapts to your workflow. Not the other way around.

---

## What Makes Dhara Different

### 1. Protocol over API 🧵

Not a TypeScript API — a wire protocol. Extensions communicate via a standard **JSON-RPC 2.0** protocol over stdin/stdout, WASM, or TCP sockets.

```python
# Your tool in Python — the harness doesn't know or care
def handle_request(method, params):
    if method == "tools/execute":
        result = subprocess.run(["grep", "-rn", params["pattern"]])
        return {"content": [{"type": "text", "text": result.stdout}]}
```

Write extensions in **any language**: Python, Rust, Go, TypeScript, Zig, whatever. The harness doesn't care.

### 2. Security by Design 🔒

Capability-based security, not "review the source code."

```
Every extension declares what it needs:
  ✓ filesystem:read    → can read files
  ✗ filesystem:write  → NOT granted
  ✗ network:outbound  → NOT granted
  ✗ process:spawn     → NOT granted

Users approve these at install time.
The sandbox enforces them at runtime.
```

Like Android app permissions. Like Deno. Unlike every other coding agent.

### 3. Open Standard 📜

The spec is **CC-BY-4.0**. The reference implementation is **MIT**.

- Anyone can implement the standard
- Session format is an open JSON Schema
- Packages are signed with sigstore
- No vendor lock-in, no hidden injections

### 4. Lossless Memory 🧠

Compaction produces structured summaries but **never deletes the original conversation**.

```
Full transcript     → preserves everything
Compaction summary  → what the LLM sees (with backlinks to originals)
On-demand recall    → request any range of full entries
```

Tiered memory. Like virtual memory for agents.

### 5. Minimal Core, Rich Ecosystem 🎯

The core is **under 2,000 lines** — just the agent loop, protocol, session format, event bus, and sandbox.

Everything else is an extension:
- LLM providers are extensions
- File tools are extensions
- The terminal UI is an extension
- Compaction strategies are extensions

---

## Context Files

Dhara loads project-level instructions from `AGENTS.md` and `CLAUDE.md`
files, following the industry-standard convention used by Claude Code,
Copilot, pi, and Codex.

### Discovery order

1. `~/.dhara/AGENTS.md` — global instructions (applied to every project)
2. `~/.dhara/CLAUDE.md` — global instructions, alias
3. Walk up from current directory — finds the **closest** ancestor with
   either `AGENTS.md` or `CLAUDE.md`

Context files are injected into the agent's system prompt. Use `/reload`
to re-read them after editing. Use `--no-context-files` to disable.

See [Context Conventions](spec/architecture.md#context-conventions) in the
spec for the full specification.

## Project Configuration (`.dhara/`)

Projects can override global defaults with a `.dhara/` directory in the
project root:

```
project/
└── .dhara/
    ├── settings.json       Model, provider, maxIterations, tools
    ├── skills/             Project-level skills (SKILL.md files)
    ├── sessions/           Project-local sessions
    └── extensions/         Project-level extensions
```

### `settings.json` example

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "maxIterations": 20,
  "tools": { "bash": false }
}
```

Precedence (highest to lowest): CLI flags → `.dhara/settings.json` →
global `~/.dhara/config.json` → defaults. Use `/status` to see the
resolved configuration. Use `--no-project-config` to disable.

See [Project Configuration](spec/architecture.md#project-configuration-dhara)
in the spec for the full schema.

## Architecture

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
│   (any language, sandboxed, capability-declared)     │
│          ↕  JSON-RPC 2.0 protocol ↕                 │
├─────────────────────────────────────────────────────┤
│                     CORE LAYER                       │
│                                                     │
│   Agent Loop  ·  Protocol  ·  Session Format        │
│   Event Bus  ·  Sandbox                             │
│   (< 2,000 lines — pure agent machinery)           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### What's in the Core (< 2K lines)

| Module | Lines | What it does |
|---|---|---|
| `agent-loop.ts` | ~180 | LLM → tool → LLM state machine |
| `protocol.ts` | ~125 | JSON-RPC 2.0 extension communication |
| `session.ts` | ~305 | Open session format (JSONL + JSON Schema) |
| `session-manager.ts` | ~260 | Atomic file persistence for sessions |
| `events.ts` | ~140 | Standard event bus for extensions |
| `sandbox.ts` | ~245 | Capability enforcement & audit |
| `provider.ts` | ~95 | Provider interface (no implementations) |
| `config.ts` | ~355 | Configuration management |

### What's NOT in the Core (it's an extension)

| Concern | Why it's not core |
|---|---|
| LLM API calls | Providers differ, new ones emerge |
| Terminal UI | Presentation ≠ agent logic |
| File operations | Tools are extensions, even defaults |
| Package management | Registry is a service, not engine |
| System prompt | You control it entirely |
| Compaction | Strategy varies by use case |

---

## Quick Start

```bash
# Install
npm install -g @zosmaai/dhara

# REPL mode — interactive session (default)
dhara

# One-shot mode — single prompt and exit
dhara "Refactor this module"
dhara --model anthropic/claude-sonnet-4 "Write tests for auth.ts"

# Resume a previous session
dhara --resume <session-id>
```

### REPL mode

When run with no arguments, `dhara` starts an interactive session:

```
$ dhara
  dhara  •  opencode-go/deepseek-v4-flash  •  /home/arjun

  Started session a1b2c3d4-e5f6-...

> hello
Hello! How can I help you today?
> /exit
Bye!
```

Every conversation is automatically saved to `~/.dhara/sessions/`. Use
`/list` to see all sessions and `dhara --resume <id>` to pick up where
you left off.

| Command | Description |
|---|---|
| `/exit`, `/quit` | Exit the REPL |
| `/save` | Explicitly save the current session |
| `/list` | List all saved sessions |
| `/resume <id>` | Load a previous session into context |
| `/reload` | Re-read context files (AGENTS.md, CLAUDE.md) and `.dhara/settings.json` |
| `/status` | Show provider, model, loaded context files, project config, session info |
| `/help` | Show available commands |

**Cancellation**: Press `Ctrl+C` during a running prompt to cancel the
in-progress LLM call or tool execution. Press `Ctrl+C` when idle to exit.

### CLI Reference

```bash
dhara [options]              REPL mode (interactive, default)
dhara <prompt> [options]     One-shot mode
dhara --help                 Show usage
```

| Option | Description |
|---|---|
| `--provider <name>` | LLM provider: `openai`, `anthropic`, `opencode-go` (default) |
| `--model <id>` | Model ID (e.g. `claude-sonnet-4-20250514`, `gpt-4o`) |
| `--base-url <url>` | Custom API base URL for any OpenAI-compatible endpoint |
| `--cwd <path>` | Working directory (default: current directory) |
| `--resume <id>` | Resume a previous session by ID |
| `--no-context-files` | Disable AGENTS.md / CLAUDE.md context loading |
| `--no-project-config` | Disable `.dhara/settings.json` loading |
| `--help` | Show usage |

| Provider | Default model | Env var |
|---|---|---|
| `opencode-go` | `deepseek-v4-flash` | `OPENCODE_API_KEY` |
| `openai` | `gpt-4o` | `OPENAI_API_KEY` |
| `anthropic` | `claude-sonnet-4-20250514` | `ANTHROPIC_API_KEY` |

Pass `--base-url <url>` for any OpenAI-compatible endpoint. Fallback env
var: `DHARA_API_KEY`.

---

## Ecosystem

### Packages *(planned — registry coming in Phase 4)*

```
dhara install @zosmaai/code-search        # Semantic search (Python)
dhara install @author/git-tools           # Git integration (Rust)
dhara install @author/linter              # Fast linting (WASM)
dhara install @author/terminal-theme      # Custom TUI theme
```

### SDKs *(planned)*

The protocol is the standard. SDKs are optional helpers:

```
@zosmaai/dhara-sdk-typescript           # TypeScript
dhara-sdk-python                        # Python
dhara-sdk-rust                          # Rust
```

---

## The Standard

The spec lives in `spec/` and defines:

| Document | Description |
|---|---|
| Document | Description | Schemas |
|---|---|---|
| [Extension Protocol](spec/extension-protocol.md) | JSON-RPC 2.0 message schemas | [`schemas/protocol.json`](spec/schemas/protocol.json) |
| [Session Format](spec/session-format.md) | Open JSON Schema for conversations | [`schemas/entry.json`](spec/schemas/entry.json), [`schemas/meta.json`](spec/schemas/meta.json), [`schemas/branch.json`](spec/schemas/branch.json), [`schemas/tree.json`](spec/schemas/tree.json), [`schemas/compaction.json`](spec/schemas/compaction.json) |
| [Tool Schema](spec/tool-schema.md) | Declarative tool definitions | [`schemas/tool.json`](spec/schemas/tool.json) |
| [Capability Model](spec/capability-model.md) | Security capability declarations | [`schemas/capability.json`](spec/schemas/capability.json) |
| [Package Manifest](spec/package-manifest.md) | Package metadata & registry | [`schemas/manifest.json`](spec/schemas/manifest.json) |
| [Architecture](spec/architecture.md) | Three-layer design | — |

Anyone can implement these specs. The reference implementation is MIT-licensed.

---

## 🇮🇳 Built from India

Dhara is built by **Zosma AI**, from India.

The name comes from Sanskrit **धारा** (dhārā) — the continuous stream that flows between thought and action.

> *Like a river, the agent loop flows — carrying the LLM's reasoning through tools and back, continuously, until the work is done.*

---

## Roadmap

| Phase | Status | What |
|---|---|---|
| **0. Spec** | ✅ Done | Spec documents, JSON Schemas in `spec/schemas/` |
| **1. Core** | ✅ Done | Agent loop, protocol, session, sandbox, event bus, cancellation |
| **2. Std Library** | ✅ Done | File tools, shell, OpenAI/Anthropic/OpenCode providers |
| **3. CLI** | ✅ Done | One-shot mode, REPL mode, session persistence, context files, `.dhara/` config |
| **4. Cancellation** | ✅ Done | `tools/cancel` protocol, AbortSignal, Ctrl+C, richer events |
| **5. Skills** | 🔜 Next | Agent Skills standard support (`.agents/skills/SKILL.md`) |
| **6. Registry** | 📋 Planned | Package registry, publish, install |
| **7. TUI** | 📋 Planned | Rich terminal UI (`@zosmaai/dhara-tui`) |
| **8. Launch** | 📋 Planned | Open source, community onboarding |

---

## License

| Component | License |
|---|---|
| **Spec** (all documents in `spec/`) | **CC-BY-4.0** — anyone can implement the standard |
| **Reference Implementation** (code in `core/`, `cli/`, `std/`) | **MIT** |
| **Registry** (`registry/`) | **MIT** |

---

<p align="center">
  <strong>Dhara</strong> — The Agent Protocol Standard<br>
  Built by <a href="https://zosma.ai">Zosma AI</a><br>
  Built from India 🇮🇳 for the World 🌏
</p>
