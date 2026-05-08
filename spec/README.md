# Agent Harness Spec

> An open standard for coding agent harnesses — the HTTP of coding agents.

## Why This Exists

Current coding agents (Claude Code, Codex, Pi) are **products**, not **platforms**. They lock you into:
- One vendor's system prompt
- One vendor's tool definitions
- One vendor's extension ecosystem
- One language for extensions
- One security model (or none)

We're building the **standard**, not the product. Like LSP (Language Server Protocol) did for editors, like HTTP did for the web — we define the protocol, and anyone can implement it.

## What We Learned from Pi

Pi (`badlogic/pi-mono`, 46K ★ on GitHub) proved that minimalism works:
- 4 default tools (read/write/edit/bash) are enough for a coding agent
- A 200-token system prompt outperforms 10K-token ones
- Extensions are the right abstraction for customization
- Session branching is a killer feature
- Community packages create network effects

But Pi has fundamental weaknesses that we address in this spec:
- **TypeScript-only extensions** — locks out Python, Rust, Go ecosystems
- **No security model** — "extensions execute arbitrary code" is the entire security policy
- **No standard registry** — npm keyword search (`pi-package`) is not discoverable
- **Custom session format** — not an open standard, no interoperability
- **Lossy compaction** — no way to recover context after summarization
- **No evaluation framework** — no way to measure if extensions improve results
- **Bundled concerns** — LLM API, TUI, and agent core are separate packages but still tightly coupled

## The Three Principles

1. **Protocol over API** — Extensions communicate via a standard protocol, not a language-specific API. Write extensions in any language.
2. **Capability over Trust** — Extensions declare what they need (filesystem:read, network:outbound). Users approve. The sandbox enforces.
3. **Standard over Implementation** — The spec is the moat. The reference implementation proves it works. Anyone can build their own.

## Spec Documents

| Document | Description |
|---|---|
| [architecture.md](./architecture.md) | 3-layer architecture, what's core vs extension |
| [extension-protocol.md](./extension-protocol.md) | Language-agnostic extension communication spec |
| [session-format.md](./session-format.md) | Open session/conversation format specification |
| [tool-schema.md](./tool-schema.md) | Declarative tool definition schema |
| [capability-model.md](./capability-model.md) | Security capability declarations and sandboxing |
| [package-manifest.md](./package-manifest.md) | Package metadata, registry, and discovery |
| [pi-analysis.md](./pi-analysis.md) | Detailed analysis of Pi's strengths and weaknesses |
| [roadmap.md](./roadmap.md) | MVP roadmap with timeline and milestones |

## Directory Structure (Reference Implementation)

```
project/
├── core/                    # < 2K lines — the agent loop
│   ├── loop.ts              # agent loop: LLM → tool → LLM
│   ├── protocol.ts          # extension protocol (JSON-RPC/WASM)
│   ├── session.ts           # open session format
│   ├── events.ts            # event bus types
│   └── sandbox.ts           # capability enforcement
│
├── std/                     # Standard library (separate package)
│   ├── tools/               # file tools (read, write, edit, bash, grep, find)
│   ├── providers/           # LLM providers as extensions
│   └── renderers/           # TUI, JSON streaming
│
├── registry/                # Package registry (separate service)
│   ├── schema/              # Package manifest JSON Schema
│   ├── validator/           # Validate packages against schema
│   └── server/              # Registry API + web UI
│
├── cli/                     # CLI that wires core + std + registry
│   └── main.ts
│
└── spec/                    # THE STANDARD — this is the moat
    ├── extension-protocol.md
    ├── session-format.md
    ├── package-manifest.md
    ├── capability-model.md
    └── tool-schema.md
```

## Target Users

1. **Developers** who want to customize their coding agent without forking
2. **Teams** who want shared tool configurations and approval workflows
3. **Companies** who want data sovereignty (no data sent to US servers)
4. **Package authors** who want to write extensions in their preferred language
5. **Agent builders** who want to embed agent capabilities in their own products

## Origin

Built from India, for the world. The strategic advantages:
- **Cost arbitrage** — build and operate at Indian cost, sell globally
- **Talent** — India produces more CS grads than any country
- **Localization** — multi-language developer tools (Hindi, Tamil, etc.)
- **Data sovereignty** — Indian companies want agent tools that don't send data to US servers
- **Timing** — no dominant player in "agent harness" category yet

## License

Core spec: **CC-BY-4.0** (anyone can implement the standard)
Reference implementation: **MIT** (fully open source)
