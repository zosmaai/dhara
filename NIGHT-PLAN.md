# Dhara Overnight Sprint Plan 📋

> **Mission:** Complete all remaining roadmap phases by 10:30 AM
> **Started:** ~04:35 | **Deadline:** ~10:30 (6 hours)
> **Strategy:** 200+ tasks across 12 domains, parallel execution, CI-gated every PR

---

## DOMAIN A: Theme System (~15 tasks)
- [ ] A1: Add Dracula theme file (src/std/renderers/tui/themes/dracula.ts)
- [ ] A2: Add Nord theme file
- [ ] A3: Add Catppuccin theme file
- [ ] A4: Theme discovery from ~/.dhara/themes/ directory
- [ ] A5: Theme listing command (dhara theme list)
- [ ] A6: Theme preview command (dhara theme preview <name>)
- [ ] A7: Theme overrides via .dhara/settings.json
- [ ] A8: Theme validation schema
- [ ] A9: Theme test suite
- [ ] A10: Custom theme example in docs
- [ ] A11: Add theme hot-reload via SIGHUP or event
- [ ] A12: Theme inheritance (base + overrides)
- [ ] A13: Syntax-highlight color customization per theme
- [ ] A14: Status-bar theme customization
- [ ] A15: Markdown renderer theme hooks

## DOMAIN B: CLI Commands (~25 tasks)
- [ ] B1: `dhara config list` — show full config
- [ ] B2: `dhara config get <key>` — get config value
- [ ] B3: `dhara config set <key> <value>` — set config value
- [ ] B4: `dhara config delete <key>` — remove config key
- [ ] B5: `dhara config set-provider <name> <api-key>` — quick provider add
- [ ] B6: `dhara config switch <provider>` — switch active provider
- [ ] B7: `dhara session export <id> --format jsonl|markdown|txt`
- [ ] B8: `dhara session import <file>`
- [ ] B9: `dhara session search <query>` — grep session content
- [ ] B10: `dhara session diff <id1> <id2>` — compare sessions
- [ ] B11: `dhara session stats` — aggregate session statistics
- [ ] B12: `dhara session prune` — remove old sessions
- [ ] B13: `dhara session tag <id> <tag>` — tag a session
- [ ] B14: `dhara doctor` — full diagnostic command
- [ ] B15: `dhara completion bash` — bash completion output
- [ ] B16: `dhara completion zsh` — zsh completion output
- [ ] B17: `dhara completion fish` — fish completion output
- [ ] B18: `dhara init` — project initialization wizard
- [ ] B19: `dhara update` — self-update check
- [ ] B20: `dhara version` — detailed version info
- [ ] B21: `dhara info` — system info for debugging
- [ ] B22: `dhara provider list` — list available providers
- [ ] B23: `dhara provider test <name>` — test provider connectivity
- [ ] B24: `dhara extension list` — list loaded extensions
- [ ] B25: `dhara extension status <id>` — extension health check

## DOMAIN C: Security & Sandbox (~20 tasks)
- [ ] C1: User approval flow as Hook extension (capability:denied hook)
- [ ] C2: Persistent permission store (approved capabilities cache)
- [ ] C3: Permission warning on first extension load
- [ ] C4: Extension isolation via subprocess resource limits
- [ ] C5: Capability revocation mechanism
- [ ] C6: Audit log persistence (beyond in-memory)
- [ ] C7: OS-level sandbox docs (Firejail, Bubblewrap)
- [ ] C8: Path quarantine for filesystem:write
- [ ] C9: Network domain allowlist enforcement
- [ ] C10: Process command allowlist enforcement
- [ ] C11: Secrets masking in session logs
- [ ] C12: Capability review command (dhara review)
- [ ] C13: Sandbox test suite expansion
- [ ] C14: Rate limiting per capability
- [ ] C15: Timeout per tool execution
- [ ] C16: Extension manifest signature verification
- [ ] C17: Startup permission audit report
- [ ] C18: Integration test for sandbox bypass resistance
- [ ] C19: Security documentation page
- [ ] C20: Threat model document

## DOMAIN D: Registry Phase 4 (~25 tasks)
- [ ] D1: Registry API server skeleton (Hono/Fastify)
- [ ] D2: Extension CRUD endpoints
- [ ] D3: Search endpoint with full-text search
- [ ] D4: Version management (publish new versions)
- [ ] D5: Download endpoint (tarball)
- [ ] D6: Package manifest validation
- [ ] D7: Capability scanning on publish
- [ ] D8: User auth (GitHub OAuth)
- [ ] D9: API key management for CLI
- [ ] D10: `dhara publish` CLI command
- [ ] D11: `dhara install <package>` CLI command
- [ ] D12: `dhara search <query>` CLI command
- [ ] D13: `dhara uninstall <package>` CLI command
- [ ] D14: `dhara update` for extension packages
- [ ] D15: Registry web UI (basic)
- [ ] D16: Package README rendering
- [ ] D17: Package version diff
- [ ] D18: Sigstore signing integration
- [ ] D19: Registry API tests
- [ ] D20: Registry Docker compose setup
- [ ] D21: CLI registry auth flow
- [ ] D22: Package dependency resolution
- [ ] D23: Extension namespace system
- [ ] D24: Registry rate limiting
- [ ] D25: Registry monitoring and analytics

## DOMAIN E: Python SDK (~10 tasks)
- [ ] E1: Python SDK package structure (@zosmaai/dhara-extension-py)
- [ ] E2: JSON-RPC client class
- [ ] E3: Tool handler decorator
- [ ] E4: Initialize/reset protocol helpers
- [ ] E5: Manifest validation
- [ ] E6: Example: Python extension using SDK
- [ ] E7: Python SDK README + docs
- [ ] E8: Python SDK tests
- [ ] E9: PyPI publish workflow
- [ ] E10: Python SDK CI pipeline

## DOMAIN F: Rust SDK (~8 tasks)
- [ ] F1: Rust SDK crate structure
- [ ] F2: JSON-RPC client via serde_json
- [ ] F3: Tool trait + derive macro
- [ ] F4: Protocol message types
- [ ] F5: Example: Rust extension using SDK
- [ ] F6: README + docs
- [ ] F7: Cargo test suite
- [ ] F8: Crates.io publish workflow

## DOMAIN G: More Showcase Extensions (~15 tasks)
- [ ] G1: code-search extension (grep + ripgrep + vector)
- [ ] G2: test-runner extension (vitest, pytest runner)
- [ ] G3: lint-extension (biome, eslint wrapper)
- [ ] G4: security-scanner extension
- [ ] G5: docker-extension (docker ps, logs, exec)
- [ ] G6: db-query extension (SQLite client)
- [ ] G7: http-rest extension (REST API client)
- [ ] G8: todo-manager extension
- [ ] G9: file-manager extension (tree, find, du)
- [ ] G10: process-manager extension (ps, kill, top)
- [ ] G11: G1-G10: Each needs README + manifest.json
- [ ] G12: Extension testing framework
- [ ] G13: Extension template generator
- [ ] G14: Extension template: TypeScript
- [ ] G15: Extension template: Python

## DOMAIN H: Documentation Expansion (~20 tasks)
- [ ] H1: Fumadocs Next.js app setup (actual deployment)
- [ ] H2: Architecture deep-dive page
- [ ] H3: Protocol reference page
- [ ] H4: Capability model explainer
- [ ] H5: Security model page
- [ ] H6: CLI reference page
- [ ] H7: Session format reference
- [ ] H8: Extension development guide
- [ ] H9: Extension publishing guide
- [ ] H10: Provider configuration guide
- [ ] H11: FAQ page
- [ ] H12: Troubleshooting guide
- [ ] H13: API reference (typedoc)
- [ ] H14: Blog: Why Dhara exists
- [ ] H15: Blog: Protocol vs API
- [ ] H16: Blog: Capability-based security
- [ ] H17: Video: 5-minute overview script
- [ ] H18: README translations (i18n)
- [ ] H19: Doc search (Algolia DocSearch)
- [ ] H20: Analytics integration

## DOMAIN I: Quality & Testing (~25 tasks)
- [ ] I1: Property-based testing for protocol.ts
- [ ] I2: Fuzz testing for JSON-RPC parsing
- [ ] I3: Test coverage to 90% (currently ~70%)
- [ ] I4: Agent-loop performance benchmark
- [ ] I5: Extension protocol latency benchmark
- [ ] I6: Session manager throughput benchmark
- [ ] I7: Memory leak detection tests
- [ ] I8: Load test: 100 concurrent extensions
- [ ] I9: Load test: 10K session entries
- [ ] I10: TUI renderer visual regression tests
- [ ] I11: End-to-end test: full agent cycle
- [ ] I12: End-to-end test: piped commands
- [ ] I13: End-to-end test: session resume
- [ ] I14: End-to-end test: multi-turn conversation
- [ ] I15: Mutation testing for core modules
- [ ] I16: Integration test: extension crash recovery
- [ ] I17: Integration test: multiple extensions
- [ ] I18: Performance regression CI gate
- [ ] I19: Benchmark CI workflow
- [ ] I20: Snapshot testing for JSON output
- [ ] I21: Type-level tests (expect-type)
- [ ] I22: Workspace/workspace test for monorepo
- [ ] I23: Cross-platform test (Windows CI)
- [ ] I24: Extension isolation test (SIGKILL resilience)
- [ ] I25: Session corruption recovery test

## DOMAIN J: Infrastructure (~15 tasks)
- [ ] J1: Docker image (ghcr.io/zosmaai/dhara)
- [ ] J2: Docker multi-stage build
- [ ] J3: Docker Compose for development
- [ ] J4: Homebrew tap (brew install dhara)
- [ ] J5: Nix package (nixpkgs)
- [ ] J6: VS Code extension (dhara.vsix)
- [ ] J7: GitHub Action: setup-dhara
- [ ] J8: GitHub Action: cache-dhara
- [ ] J9: npm package provenance verification docs
- [ ] J10: Release automation (generate + draft)
- [ ] J11: Changelog generation per release
- [ ] J12: Binary releases (pkg, nexe)
- [ ] J13: Shell installer script (curl | sh)
- [ ] J14: Winget/Scoop for Windows
- [ ] J15: Web demo (WASI build)

## DOMAIN K: Core Improvements (~15 tasks)
- [ ] K1: Event bus typed subscription helpers
- [ ] K2: Extension hot-reload on manifest change
- [ ] K3: Multi-session support in TUI (tabs)
- [ ] K4: Session auto-archive (configurable TTL)
- [ ] K5: Token usage telemetry
- [ ] K6: Cost estimation per session
- [ ] K7: Rate limiting for provider API calls
- [ ] K8: Retry logic for provider failures
- [ ] K9: Circuit breaker for provider endpoints
- [ ] K10: Provider health check and fallback
- [ ] K11: Streaming cancellation improvements
- [ ] K12: Agent loop pause/resume
- [ ] K13: Concurrent tool execution
- [ ] K14: Tool execution dependency graph
- [ ] K15: Session branching UI

## DOMAIN L: Launch Prep (~17 tasks)
- [ ] L1: Repository visibility toggle checklist
- [ ] L2: Launch blog post draft
- [ ] L3: Hacker News launch post prep
- [ ] L4: Reddit post (r/devtools, r/programming)
- [ ] L5: Twitter/X thread
- [ ] L6: Logo and branding assets
- [ ] L7: Social media images (OG tags)
- [ ] L8: Community Discord server setup
- [ ] L9: GitHub Discussions setup
- [ ] L10: First contributor guide
- [ ] L11: Package review process
- [ ] L12: Code of conduct enforcement
- [ ] L13: Security vulnerability process
- [ ] L14: Release announcement email
- [ ] L15: ProductHunt launch
- [ ] L16: Demo video recording
- [ ] L17: Press kit

---

## Execution Strategy

**Phase 1 (04:35 - 05:30): THEME + CLI + SECURITY**
- Theme system: A1-A15
- CLI commands: B1-B25
- Security hooks: C1-C3

**Phase 2 (05:30 - 06:30): PYTHON SDK + DOCS + SHOWCASE**
- Python SDK: E1-E10
- Docs: H1-H10
- Showcase: G1-G5

**Phase 3 (06:30 - 07:30): TESTING + INFRASTRUCTURE**
- Quality: I1-I10
- Infrastructure: J1-J10

**Phase 4 (07:30 - 08:30): REGISTRY MVP**
- Registry server: D1-D15
- CLI integration: D10-D15

**Phase 5 (08:30 - 09:30): LAUNCH PREP + RUST SDK**
- Launch: L1-L10
- Rust SDK: F1-F5

**Phase 6 (09:30 - 10:30): POLISH + FINAL CI**
- Remaining items
- Final full test suite
- README update
