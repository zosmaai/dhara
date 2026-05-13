# Dhara Project Roadmap

> Updated: 2026-05-14

## TL;DR

Phases 0–3 (Spec, Core, Standard Library, CLI) are **substantially complete**.
Active work focuses on Phases 4–6 (Registry, Docs, Launch) plus quality/security.

## Current Status

| Phase | Status | Notes |
|---|---|---|
| Phase 0: Spec Finalization | ✅ Complete | JSON Schemas, architecture, extension protocol, session format |
| Phase 1: Core Implementation | ✅ Complete | Agent loop, extension protocol, session, events, sandbox |
| Phase 2: Standard Library | ✅ Complete | 6 tools (read/write/edit/ls/grep/bash), 20+ providers via pi-ai |
| Phase 3: CLI | ✅ Complete | TUI, REPL, one-shot, config, context files, skills |
| Phase 4: Registry MVP | 🔄 Not started | API server, web UI, CLI integration |
| Phase 5: Showcase & Docs | 🔄 In progress | Docs site being set up (Fumadocs), showcase extensions planned |
| Phase 6: Launch | 🔄 Not started | Public repo, launch blog post, community |

## What "Complete" Means

### ✅ Phase 0: Spec Finalization — COMPLETE

Delivered:
- `spec/architecture.md` — Three-layer architecture (core, extensions, ecosystem)
- `spec/extension-protocol.md` — JSON-RPC 2.0 wire protocol
- `spec/session-format.md` — Append-only JSONL session format
- `spec/tool-schema.md` — Tool definition and result schema
- `spec/capability-model.md` — Capability catalog and permission model
- `spec/package-manifest.md` — Package manifest format
- `spec/std-tools.md` — Standard tool catalog (6 tools + extension guidance)
- `spec/pi-analysis.md` — Competitive analysis of Pi's architecture
- `spec/schemas/` — 10 formal JSON Schema files

### ✅ Phase 1: Core Implementation — COMPLETE

Delivered (`src/core/`):
- `agent-loop.ts` — LLM → tool → LLM cycle with streaming and cancellation
- `extension-manager.ts` — Subprocess extension loading and management
- `session-manager.ts` — Append-only JSONL session persistence
- `events.ts` — Event bus with typed events and hooks
- `sandbox.ts` — Capability checking, path validation, audit logging
- `config.ts` — Global ~/.dhara/config.json management
- `context-loader.ts` — AGENTS.md / CLAUDE.md walk-up loading
- `skills.ts` — Agent Skills discovery and loading
- `provider.ts` — Provider interface (complete, single method)
- `session.ts` — Session entry types and tree representation
- `protocol.ts` — JSON-RPC 2.0 message types
- `project-config.ts` — .dhara/settings.json loading

Total: ~2,200 lines across 12 files (slightly over the 2K target, includes validation logic)

### ✅ Phase 2: Standard Library — COMPLETE

Delivered:
- **6 Standard Tools** (`src/std/tools/`): `read`, `write`, `edit`, `ls`, `grep`, `bash`
  - All with full test suites and coverage
  - All wired through sandbox capability checking
- **Provider Adapters** (`src/std/providers/`):
  - `openai-provider.ts` — OpenAI + OpenAI-compatible endpoints (Groq, Ollama, vLLM, etc.)
  - `anthropic-provider.ts` — Anthropic Messages API
  - `pi-ai-adapter.ts` — Wraps @earendil-works/pi-ai for 20+ providers:
    Google/Gemini, Google Vertex, Mistral, Amazon Bedrock, Azure OpenAI,
    DeepSeek, Groq, Cerebras, Fireworks, OpenRouter, and more
- **TUI Renderer** (`src/std/renderers/tui/`): Full terminal UI with differential
  rendering, syntax highlighting, markdown, scroll, mouse support

**Important**: Network tools (`web_fetch`, `web_search`) are NOT standard tools.
They belong in extensions — see [extension-protocol.md](./extension-protocol.md)
for how to build them.

### ✅ Phase 3: CLI — COMPLETE

Delivered (`src/cli/`):
- `main.ts` — Entry point with argument parsing, provider resolution, routing
- `repl.ts` — Line-based interactive session with /commands
- `tui-runner.ts` — Full-screen TUI launcher
- `output-utils.ts` — ANSI formatting, event subscription for streaming
- `--provider`, `--model`, `--base-url`, `--cwd`, `--resume`, `--theme`, `--repl` flags
- Context files (AGENTS.md / CLAUDE.md), project config (.dhara/settings.json)
- Extension loading from ~/.dhara/extensions/ and .dhara/extensions/

### 🔄 Phase 4: Registry MVP — NOT STARTED

Goal: Package registry for publishing and installing extensions.

Tasks:
- [ ] Registry API server (CRUD, search, download, versioning)
- [ ] Registry web UI (browse, search, view package details)
- [ ] CLI integration (`dhara install`, `dhara publish`, `dhara search`)
- [ ] Package validation (schema, capability scan, build test)
- [ ] Sigstore signing (stretch goal)

### 🔄 Phase 5: Showcase & Documentation — IN PROGRESS

Goal: 5 showcase packages, complete docs, first external users.

Tasks:
- [x] Spec documents (see Phase 0)
- [ ] **Getting started guide** — Install, configure, use Dhara
- [ ] **Extension tutorial** — Write your first extension (TypeScript + Python)
- [ ] **Documentation website** — Fumadocs at docs.dhara.zosma.ai
- [ ] Showcase packages (git integration, code search, linting, testing, security)
- [ ] Architecture deep dive
- [ ] Protocol reference

### 🔄 Phase 6: Launch — NOT STARTED

Goal: Open source launch with community onboarding.

Tasks:
- [ ] GitHub repository public
- [ ] README overhaul with badges, features, quick-start
- [ ] Contributing guide, security policy, Code of Conduct
- [ ] CI/CD improvements (publish workflow, changelog, auto-label)
- [ ] Issue and PR templates
- [ ] Launch blog post
- [ ] Hacker News / Reddit / Twitter(X) posts
- [ ] Community setup (Discord, discussion templates)

## Active Work Priorities

Current sprint (May 2026):

1. **Documentation site** — Fumadocs with getting started + extension tutorial
2. **Extension ecosystem** — TypeScript SDK, example extension (web-tools), protocol hardening
3. **Quality & Security** — Integration tests, user approval flow (Hook extension), sandbox audit
4. **Launch prep** — README, CI/CD, templates, contributing guide

## Completed Milestones

| Milestone | Delivered | PRs |
|---|---|---|
| Core loop + providers | 2026-04 | #1–#14 (14 PR mega-session) |
| Session persistence | 2026-04 | #15–#22 |
| Context files + config reload | 2026-05 | #22 |
| TUI renderer | 2026-05 | #23–#54 (visual overhaul, scrolling, fixes) |
| Extension protocol | 2026-05 | #55 |
| pi-ai provider adapter | 2026-05 | #56 |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Extension protocol too slow | Low | High | Benchmarks, WASM fast path |
| Security sandbox bypass | Medium | Critical | External audit before launch |
| Nobody uses it | Medium | High | Developer experience, easy onboarding |
| Name/trademark issues | Low | Medium | Legal check before launch |

## Post-Launch (v1+)

1. **Community building** — Discord, issues, PRs, package reviews
2. **SDK development** — Python SDK, Rust SDK
3. **Provider expansion** — More LLM providers via pi-ai
4. **Evaluation framework** — Built-in benchmarking for packages
5. **Enterprise features** — SSO, audit logging, compliance reporting
6. **Desktop app** — Tauri-based GUI
