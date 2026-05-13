# Introducing Dhara: The Agent Protocol Standard

**Dhara is an open, secure, language-agnostic protocol and harness for AI coding agents — designed from the ground up to be minimal, composable, and safe.**

Today we're open-sourcing Dhara — a protocol-first approach to AI coding agents. Instead of another monolithic agent framework, Dhara defines a wire protocol that any tool, in any language, can speak.

## Why Another Agent Tool?

Every existing AI coding agent follows the same pattern: a monolithic runtime with a plugin API tied to a single language. Pi has TypeScript plugins. ChatGPT has its own plugin format. Each is a walled garden.

We believe the future is **protocol-based**, not **API-based**.

| | API-based (Pi, etc.) | Protocol-based (Dhara) |
|---|---|---|
| Languages | TypeScript only | Any language |
| Isolation | In-process | Subprocess or WASM |
| Crash impact | Kills the agent | Extension dies, agent continues |
| Security | "Review the source" | Capability-based sandbox |
| Distribution | npm packages | Any binary |

## What Dhara Is

Dhara is three things:

### 1. A Protocol Specification
Extensions communicate via **JSON-RPC 2.0** over stdin/stdout. Any language that can read stdin and write stdout can build Dhara extensions. We have reference implementations in TypeScript (official SDK), Python (SDK), and plain shell scripts.

### 2. A Reference Implementation
The `dhara` CLI provides a production-ready agent harness:
- **Agent loop** with streaming, cancellation, and tool execution
- **20+ LLM providers** via our pi-ai adapter (OpenAI, Anthropic, Google, Mistral, Groq, AWS Bedrock, and more)
- **TUI/REPL/one-shot** modes for every workflow
- **Session persistence** with append-only JSONL format
- **Extension system** with capability-based sandboxing

### 3. A Registry (Coming Soon)
A curated registry of extensions that you can discover, install, and publish — with automatic capability scanning and package validation.

## Quick Start

```bash
# Install globally
npm install -g @zosmaai/dhara

# One-shot mode
dhara "List all TypeScript files and count the lines"

# Interactive TUI
dhara

# Use any provider
dhara --provider google --model gemini-2.5-flash "Explain this codebase"
```

## Security First

Dhara's security model has three layers:

1. **Declare** — Extensions list required capabilities in their manifest
2. **Approve** — Users review and approve capabilities before first run
3. **Enforce** — The sandbox blocks any capability not explicitly approved

This is the model used by Android, Deno, and WASI. It's proven and well-understood.

## The Extension Ecosystem

Extensions are the ONLY way to add functionality to Dhara. The 6 built-in tools (read, write, edit, ls, grep, bash) are the absolute minimum for a coding agent. Everything else is an extension:

- **web-tools**: Fetch URLs and search the web
- **git-tools**: Git status, diff, log, commit
- **code-search**: ripgrep-based code search
- **test-runner**: Auto-detect and run tests
- **docker-extension**: Docker operations

All written in Python, proving the protocol's language-agnostic promise.

## What's Next

- **Registry launch** — A central hub for discovering and publishing extensions
- **Python SDK** (available now) — Build extensions with `pip install dhara-extension`
- **Rust SDK** — For performance-critical extensions
- **WASM support** — Run extensions in a sandboxed WebAssembly runtime

## Get Involved

- **GitHub**: https://github.com/zosmaai/dhara
- **Docs**: https://docs.dhara.zosma.ai
- **Registry**: https://registry.dhara.zosma.ai

Dhara is MIT-licensed and built in the open. Contributions welcome.

---

*"Dhara" (धारा) is Sanskrit for "flow" or "stream" — reflecting the continuous, streaming nature of agent-to-tool communication.*
