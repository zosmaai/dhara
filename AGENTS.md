# Dhara — The Agent Protocol Standard

This is the Dhara monorepo. It contains the protocol specification (`spec/`) and the reference TypeScript implementation (`src/`).

## Development

- **TypeScript** — strict mode, ESM modules (`"type": "module"`)
- **Build**: `npm run build` (runs `tsc`)
- **Check**: `npm run check` (runs `tsc --noEmit`)
- **Test**: `npm test` (runs `vitest`)
- **Test watch**: `npm run test:watch`
- **Coverage**: `npm run test:coverage`
- **Format**: `npm run fmt` (runs `biome format --write .`)
- **Lint**: `npm run lint` (runs `biome lint .`)

**Always run `npm run check` before committing.** Type errors cause CI to fail.

## Code Conventions

- Use strict TypeScript with explicit return types
- Follow existing patterns in the codebase
- Tests use `vitest` with `describe`/`it`/`expect` blocks
- Use `node:fs`, `node:path`, `node:os` etc. for Node APIs
- Keep the core (`src/core/`) under 2K lines and free of LLM provider code
- Standard library lives in `src/std/` (tools, providers)
- CLI lives in `src/cli/` (main entry, REPL)

## Project Structure

```
spec/                          — The Dhara Protocol Standard
  architecture.md                Three-layer design
  extension-protocol.md          JSON-RPC 2.0 wire protocol
  session-format.md              Open session format
  tool-schema.md                 Declarative tool definitions
  capability-model.md            Security capability model
  package-manifest.md            Package and registry spec
  schemas/                       JSON Schema files

src/
  core/                          — Agent loop, protocol, session, sandbox, events, config
  std/
    tools/                       — read, write, edit, ls, grep, bash
    providers/                   — OpenAI, Anthropic provider adapters
  cli/                           — main.ts, repl.ts

AGENTS.md                        — This file. Project context for coding agents.
.dhara/                          — Project-level Dhara config (optional)
  settings.json                    Project overrides for model, tools, etc.
  skills/                          Project-level skills
  sessions/                        Project-level sessions
```

## Architecture Principles

1. **Core has no LLM code** — provider implementations are adapters in `src/std/providers/`
2. **Core has no UI code** — the REPL is in `src/cli/`, the future TUI will be separate
3. **Extensions communicate via JSON-RPC 2.0** — not TypeScript function calls
4. **Capability-based security** — every extension declares what it needs
5. **Open session format** — JSONL, not protobuf or custom binary
6. **AGENTS.md / CLAUDE.md** — context files loaded from cwd walk-up

## Key Design Decisions

- Single npm package `@zosmaai/dhara` (not a monorepo split like pi's 4 packages)
- The spec is CC-BY-4.0, the reference implementation is MIT
- Context files use the industry-standard AGENTS.md / CLAUDE.md convention
- Skills support the Agent Skills open standard (`.agents/skills/SKILL.md`)
