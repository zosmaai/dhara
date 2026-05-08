# MVP Roadmap

> From spec to working product in 10-12 weeks.

## Phase 0: Spec Finalization (Week 1-2)

**Goal**: Ship a complete, reviewable spec that others can implement.

### Tasks
- [ ] Finalize extension protocol (JSON-RPC message schemas)
- [ ] Finalize session format (JSON Schema for all entry types)
- [ ] Finalize tool schema (JSON Schema for tool definitions)
- [ ] Finalize capability model (complete capability catalog)
- [ ] Finalize package manifest (JSON Schema for manifest.yaml)
- [ ] Write JSON Schema files for all specs
- [ ] Create compliance test suite (any implementation can validate)
- [ ] Publish spec to GitHub under CC-BY-4.0
- [ ] Write "Why This Exists" blog post

### Deliverable
```
spec/
├── README.md
├── architecture.md
├── extension-protocol.md
├── session-format.md
├── tool-schema.md
├── capability-model.md
├── package-manifest.md
├── pi-analysis.md
└── schemas/
    ├── manifest.json
    ├── entry.json
    ├── tool.json
    ├── capability.json
    └── session-meta.json
```

### Success Criteria
- An independent developer can read the spec and build a compatible extension
- JSON Schemas validate test fixtures
- No ambiguities (every "how does X work?" has a clear answer)

## Phase 1: Core Implementation (Week 3-5)

**Goal**: Working agent core (< 2K lines) with extension protocol.

### Tasks
- [ ] Implement agent loop (`loop.ts`)
  - LLM → tool → LLM cycle
  - Tool call validation against declared schemas
  - Error handling and retry
  - Streaming support
- [ ] Implement extension protocol (`protocol.ts`)
  - Subprocess spawning
  - JSON-RPC 2.0 message framing
  - Handshake → tool registration → execution → shutdown
  - Crash detection and recovery
- [ ] Implement session format (`session.ts`)
  - entries.jsonl append-only writer
  - tree.json materialization
  - Branch/fork operations
  - Import from JSON format
- [ ] Implement event bus (`events.ts`)
  - Standard event types
  - Subscribe/filter/emit
  - Blocking hooks (tool:call_start interception)
- [ ] Implement sandbox (`sandbox.ts`)
  - Capability checking
  - Path validation (no traversal outside CWD)
  - Domain allowlisting for network
  - Command allowlisting for process:spawn
  - Audit logging

### Deliverable
```
core/
├── loop.ts          # Agent loop (~300 lines)
├── protocol.ts      # Extension protocol (~400 lines)
├── session.ts       # Session format (~300 lines)
├── events.ts        # Event bus (~150 lines)
├── sandbox.ts       # Capability enforcement (~200 lines)
├── types.ts         # Shared types (~200 lines)
└── index.ts         # Public API (~50 lines)
                     # Total: ~1,600 lines
```

### Success Criteria
- Core runs without any extensions (just fails gracefully)
- Can load a subprocess extension and call a tool
- Session format validates against JSON Schema
- Sandbox blocks undeclared capabilities
- All events fire correctly

## Phase 2: Standard Library (Week 5-6)

**Goal**: Working set of default tools and providers.

### Tasks
- [ ] File tools (`std/tools/`)
  - `fs_read` — read file contents with offset/limit
  - `fs_write` — create/overwrite files
  - `fs_edit` — surgical text replacement
  - `fs_list` — directory listing
  - `fs_search` — grep/find across files
- [ ] Shell tool (`std/tools/`)
  - `shell_exec` — run commands with timeout
- [ ] Provider extensions (`std/providers/`)
  - `openai` — OpenAI Completions API
  - `anthropic` — Anthropic Messages API
  - `google` — Google Generative AI API
  - `openai-compatible` — any OpenAI-compatible endpoint (Ollama, vLLM, etc.)
- [ ] Renderer extensions (`std/renderers/`)
  - `terminal` — basic TUI with ANSI formatting
  - `json-stream` — JSON event streaming

### Success Criteria
- Can read, write, and edit files through tools
- Can call OpenAI, Anthropic, Google APIs
- Can display output in terminal
- All standard tools declare capabilities correctly

## Phase 3: CLI (Week 7)

**Goal**: Working command-line interface.

### Tasks
- [ ] CLI entry point (`cli/main.ts`)
  - Parse arguments (model, provider, tools, mode)
  - Initialize core + load std + load user extensions
  - Route to interactive/print/JSON/RPC mode
- [ ] Interactive mode
  - Read user input
  - Display agent output
  - Handle keyboard shortcuts
- [ ] Print mode
  - `cli -p "query"` for scripts
- [ ] Configuration
  - `~/.project/settings.json` (or project name)
  - Model selection
  - Extension loading
  - Capability approvals
- [ ] Context files
  - `AGENTS.md` loading (global + project)
  - System prompt assembly

### Success Criteria
- `cli "What files are in this directory?"` works
- Model selection works
- Extensions load and register tools
- Sessions persist and can be resumed

## Phase 4: Registry MVP (Week 8-9)

**Goal**: Working package registry for publishing and installing.

### Tasks
- [ ] Registry API server
  - Package CRUD
  - Search
  - Download
  - Versioning
- [ ] Registry web UI
  - Browse packages
  - View package details
  - Search with filters
- [ ] CLI integration
  - `project install @author/package`
  - `project publish`
  - `project search "query"`
  - `project list`
- [ ] Package validation
  - Schema validation
  - Capability scan
  - Basic build test
- [ ] Sigstore signing (stretch goal for MVP)

### Success Criteria
- Can publish a package
- Can search and install a package
- Installed package registers tools correctly
- Capability approval flow works on install

## Phase 5: Showcase & Documentation (Week 10-11)

**Goal**: 5 showcase packages, complete docs, first external users.

### Tasks
- [ ] Showcase packages
  1. **Semantic code search** (Python extension) — proves multi-language works
  2. **Git integration** (TypeScript extension) — `/diff`, `/commit`, `/review`
  3. **Linter** (Rust extension, WASM) — proves WASM works, fast parsing
  4. **Test runner** (Go extension) — proves subprocess isolation works
  5. **Security scanner** (TypeScript) — proves capability model works
- [ ] Documentation
  - Getting started guide
  - Writing your first extension (Python, TypeScript, Rust)
  - Extension protocol reference
  - Package publishing guide
  - Architecture deep dive
- [ ] Website
  - Landing page
  - Package gallery
  - Documentation
  - "Why this exists" narrative

### Success Criteria
- Each showcase package installs and works
- Documentation is complete enough for external developers
- Website is live and functional

## Phase 6: Launch (Week 12)

**Goal**: Open source launch with community onboarding.

### Tasks
- [ ] Final testing across Linux, macOS, Windows
- [ ] Security audit of core (basic)
- [ ] GitHub repository public
- [ ] Write launch blog post
- [ ] Post to Hacker News, Reddit, Twitter/X
- [ ] Set up Discord/community
- [ ] Create contribution guidelines
- [ ] Set up CI/CD (tests, schema validation, package publishing)

### Success Criteria
- Repository is public and well-documented
- External developers can install, use, and write extensions
- At least 3 community packages published in first week
- No critical bugs

## Timeline Summary

```
Week 1-2:   Spec finalization + JSON Schemas
Week 3-5:   Core implementation (agent loop + protocol + session + sandbox)
Week 5-6:   Standard library (tools + providers + renderers)
Week 7:     CLI (interactive + print + config)
Week 8-9:   Registry MVP (API + web UI + CLI integration)
Week 10-11: Showcase packages + documentation + website
Week 12:    Launch
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Core too complex (> 2K lines) | Medium | High | Strict scope, defer features |
| Extension protocol too slow | Low | High | Benchmarks in Phase 1, add WASM fast path |
| Security sandbox bypass | Medium | Critical | External audit before launch |
| Nobody uses it | Medium | High | Focus on developer experience, easy onboarding |
| Pi adds similar features | Medium | Medium | Our spec is the differentiator, not features |
| Name/trademark issues | Low | Medium | Legal check before launch |

## Post-Launch (Week 13+)

After launch, the priorities shift:

1. **Community building** — Discord, issues, PRs, package reviews
2. **SDK development** — Python SDK, Rust SDK (optional convenience wrappers)
3. **TUI improvements** — Full terminal UI with markdown rendering (like pi-tui)
4. **Provider expansion** — More LLM providers, local model support
5. **Evaluation framework** — Built-in benchmarking for packages
6. **Enterprise features** — SSO, audit logging, compliance reporting
7. **Desktop app** — Tauri-based GUI (like pi-cowork)
8. **India-specific features** — Multi-language support, data sovereignty hosting

## Resource Requirements

### People (MVP)
- **1 architect/engineer** (core + spec) — full-time, 12 weeks
- **1 engineer** (standard library + CLI) — full-time, weeks 5-7
- **1 engineer** (registry + web UI) — full-time, weeks 8-9
- **1 designer** (website + brand) — part-time, weeks 10-12

### Infrastructure
- Registry hosting (Vercel/Railway/Fly) — ~$20/month
- Domain — ~$15/year
- npm organization — free
- GitHub — free (public repo)

### Total Cost (MVP)
- **With paid engineers (India)**: ₹8-15 lakhs ($10K-18K)
- **With paid engineers (US)**: $60K-100K
- **Bootstrapped/founder-led**: $500 (infrastructure only)
