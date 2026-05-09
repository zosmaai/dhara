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
  <code>npm install -g dhara</code>
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

### 🔒 Claude Code / Codex / Opencode
- **Heavy customization** — you need their bloated plugin/extension systems just to make basic workflow changes
- **Vendor-defined defaults** — hidden context injection, opaque system prompts that change between releases
- **Opinionated UX** — you adapt to their workflow, not the other way around
- **Platform lock** — customization always happens within their walls

### 🔒 Pi
- **TypeScript-only** extensions — locks out Python, Rust, Go ecosystems
- **No security model** — "extensions execute arbitrary code" is the entire security policy
- **npm as registry** — keyword search instead of curated discovery
- **In-process extensions** — one crash kills your whole session
- **Lossy compaction** — context is thrown away, never to be recovered

Proprietary harnesses like Claude Code, Codex, and Opencode inject hidden context, mutate behavior between releases, and give you limited visibility into what the model actually saw.

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
| `loop.ts` | ~300 | LLM → tool → LLM state machine |
| `protocol.ts` | ~400 | JSON-RPC 2.0 extension communication |
| `session.ts` | ~300 | Open session format (JSONL + JSON Schema) |
| `events.ts` | ~150 | Standard event bus for extensions |
| `sandbox.ts` | ~200 | Capability enforcement & audit |

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
npm install -g dhara

# Use
dhara "Refactor this module"
dhara --model anthropic/claude-sonnet-4 "Write tests for auth.ts"
dhara --mode rpc                           # Embed in your app
cat README.md | dhara -p "Summarize this"  # Pipe mode
```

### Write your first extension

```bash
dhara extension init my-tool
# Creates: my-tool/manifest.yaml + my-tool/main.py
```

Edit `main.py`:

```python
from dhara_sdk import Extension, Tool

ext = Extension("my-tool")

@ext.tool(
    name="list_deps",
    description="List dependencies of a Python project",
    capabilities=["filesystem:read"]
)
def list_deps(path: str = "."):
    import subprocess
    result = subprocess.run(["pip", "freeze"], capture_output=True, text=True)
    return result.stdout

ext.run()
```

Install and use:

```bash
dhara extension install ./my-tool
dhara "What are the dependencies of this project?"
```

---

## Ecosystem

### Packages

```
dhara install @zosmaai/code-search        # Semantic search (Python)
dhara install @author/git-tools           # Git integration (Rust)
dhara install @author/linter              # Fast linting (WASM)
dhara install @author/terminal-theme      # Custom TUI theme
```

### Registry

```
dhara.sh/packages/                        # Curated package registry
├── @zosmaai/                             # Official packages
├── @verified/                            # Community-reviewed
└── @{author}/                            # Author namespaces
```

Each package declares capabilities, is signed with sigstore, and passes automated quality gates.

### SDKs (Optional Convenience)

The protocol is the standard. SDKS are optional helpers:

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
| [Extension Protocol](spec/extension-protocol.md) | JSON-RPC 2.0 message schemas |
| [Session Format](spec/session-format.md) | Open JSON Schema for conversations |
| [Tool Schema](spec/tool-schema.md) | Declarative tool definitions |
| [Capability Model](spec/capability-model.md) | Security capability declarations |
| [Package Manifest](spec/package-manifest.md) | Package metadata & registry |
| [Architecture](spec/architecture.md) | Three-layer design |

Anyone can implement these specs. The reference implementation is MIT-licensed.

---

## 🇮🇳 Built from India

Dhara is built by **Zosma AI**, from India.

The name comes from Sanskrit **धारा** (dhārā) — the continuous stream that flows between thought and action.

> *Like a river, the agent loop flows — carrying the LLM's reasoning through tools and back, continuously, until the work is done.*

---

## Roadmap

| Phase | Timeline | What |
|---|---|---|
| **0. Spec** | Now | Spec documents, JSON Schemas |
| **1. Core** | Weeks 3-5 | Agent loop, protocol, session, sandbox |
| **2. Std Library** | Weeks 5-6 | File tools, shell, LLM providers |
| **3. CLI** | Week 7 | Interactive + pipe + RPC modes |
| **4. Registry** | Weeks 8-9 | Package registry, publish, install |
| **5. Showcase** | Weeks 10-11 | 5 showcase extensions, docs, website |
| **6. Launch** | Week 12 | Open source, community onboarding |

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
