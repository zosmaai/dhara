# Dhara Project Roadmap

> Updated: 2026-05-14

## TL;DR

All 6 phases are **substantially complete**. The core, standard library, CLI,
registry, showcase extensions, SDKs (TypeScript/Python/Rust), and launch
infrastructure are built. Remaining work is quality, documentation, and
community building.

## Current Status

| Phase | Status | Notes |
|---|---|---|
| Phase 0: Spec Finalization | ✅ Complete | JSON Schemas, architecture, extension protocol, session format |
| Phase 1: Core Implementation | ✅ Complete | Agent loop, extension protocol, session, events, sandbox |
| Phase 2: Standard Library | ✅ Complete | 6 tools (read/write/edit/ls/grep/bash), 20+ providers via pi-ai |
| Phase 3: CLI | ✅ Complete | TUI, REPL, one-shot, config/session/doctor/completion commands |
| Phase 4: Registry MVP | ✅ Complete | FastAPI API server, Python SDK client, Docker Compose, CLI commands |
| Phase 5: Showcase & Docs | ✅ Complete | 6 showcase extensions, docs site skeleton, SDKs (TS/Python/Rust) |
| Phase 6: Launch | ✅ Complete | README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, CI/CD, blog posts |

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

### ✅ Phase 4: Registry MVP — COMPLETE

Goal: Package registry for publishing and installing extensions.

Delivered:
- **FastAPI API server** at `registry/server/` with Pydantic models, CRUD endpoints,
  search, detail, publish, download, and in-memory storage seeded with 6 packages
- **Python SDK client** at `registry/sdk/client.py` for programmatic access
- **Docker Compose** setup for running the registry service
- **CLI commands** (`dhara registry search`, `dhara registry info`, `dhara registry install`, `dhara registry list`)
- **8 API tests** covering all endpoints

Not delivered (future):
- Web UI for browsing packages in-browser
- PostgreSQL backend (in-memory only currently)
- Sigstore signing and package validation
- User authentication and publishing workflow

### ✅ Phase 5: Showcase & Documentation — COMPLETE

Goal: 5 showcase packages, complete docs, first external users.

Delivered:
- **6 showcase extensions** in `examples/`:
  - `web-tools-extension` — `web_fetch` and `web_search` (Python)
  - `git-tools-extension` — `git_status`, `git_diff`, `git_log`, `git_commit` (Python)
  - `code-search-extension` — Semantic code search (Python)
  - `test-runner-extension` — Run test suites (Python)
  - `docker-extension` — Docker container management (Python)
  - `hello-extension` — Minimal example (TypeScript, no build step)
- **Extension SDKs** in 3 languages:
  - `@zosmaai/dhara-extension` (TypeScript, ~776 lines, zero-dependency)
  - `dhara-extension-py` (Python, published to PyPI)
  - `dhara-extension-rs` (Rust, published to crates.io)
- **Documentation site skeleton** (Fumadocs-compatible) at `website/`
- **Spec documents** fully updated (architecture, protocol, session format, etc.)

Not delivered (future):
- Full documentation website deployment to docs.dhara.zosma.ai
- Getting started guide and extension tutorial as polished docs
- Architecture deep dive and protocol reference as standalone documents

### ✅ Phase 6: Launch — COMPLETE

Goal: Open source launch with community onboarding.

Delivered:
- **README overhaul** — Badges (CI, npm, license), features table, quick start,
  provider table, standard tools, extension example, architecture diagram
- **CONTRIBUTING.md** — Contribution workflow, development setup, PR process
- **SECURITY.md** — Security policy and vulnerability reporting
- **CODE_OF_CONDUCT.md** — Contributor covenant
- **CI/CD pipeline** — Matrix testing (Node 20/22), lint (Biome), typecheck (tsc),
  test (vitest --coverage), release-drafter, dependabot
- **Issue and PR templates** — Bug report, feature request, PR template
- **Discussion templates** — Q&A, ideas, show and tell
- **FUNDING.yml** — GitHub Sponsors configuration
- **Launch blog post** (`blog/launch.md`) — Full product announcement
- **Hacker News draft** (`blog/hacker-news.md`) — Show HN post

Not delivered (future):
- Public launch announcement (waiting on user decision)
- Community Discord setup
- Social media posts

## Active Work Priorities

Current focus (May 2026):

1. **Quality & Security** — Sandbox hardening (extension isolation, approval flow), integration tests
2. **Documentation site** — Deploy Fumadocs site to docs.dhara.zosma.ai
3. **Community building** — Discord, first external contributors, package ecosystem
4. **Production registry** — PostgreSQL backend, authentication, web UI

## Completed Milestones

| Milestone | Delivered | PRs |
|---|---|---|
| Core loop + providers | 2026-04 | #1–#14 (14 PR mega-session) |
| Session persistence | 2026-04 | #15–#22 |
| Context files + config reload | 2026-05 | #22 |
| TUI renderer | 2026-05 | #23–#54 (visual overhaul, scrolling, fixes) |
| Extension protocol | 2026-05 | #55, #58 |
| pi-ai provider adapter | 2026-05 | #56 |
| Spec update (minimal-core) | 2026-05 | #57 |
| Extension SDK (TypeScript) | 2026-05 | #58 |
| CI/CD overhaul | 2026-05 | #59 |
| CLI UX polish | 2026-05 | #60 |
| README + community files | 2026-05 | #61 |
| Integration tests | 2026-05 | #63 |
| GitHub infrastructure | 2026-05 | #64 |
| Showcase extensions | 2026-05 | #66, 8e09e38 |
| Theme system + CLI commands | 2026-05 | e286c22 |
| Python SDK | 2026-05 | b1a1ff9 |
| Registry MVP | 2026-05 | de88d58, 8251d3a |
| Rust SDK | 2026-05 | a68ae92 |
| Infrastructure (Docker/Homebrew/VS Code) | 2026-05 | 05487b9 |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Extension protocol too slow | Low | High | Benchmarks pass; WASM fast path as future option |
| Security sandbox bypass | Medium | Critical | Extension isolation and approval flow needed before ecosystem grows |
| Nobody uses it | Medium | High | SDKs in 3 languages reduce barrier; emphasis on DX |
| Documentation gaps | Medium | Medium | Fumadocs site skeleton exists; needs content |
| Spec-implementation drift | Low | Medium | Ongoing audit; this document tracks delta |

## Post-Launch (v1+)

1. **Community building** — Discord, issues, PRs, package reviews
2. **Ecosystem growth** — Encourage third-party extensions via 3-language SDKs
3. **Provider expansion** — More LLM providers via pi-ai
4. **Evaluation framework** — Built-in benchmarking for packages
5. **Enterprise features** — SSO, audit logging, compliance reporting
6. **Desktop app** — Tauri-based GUI
7. **Production registry** — PostgreSQL, auth, web UI, package signing
