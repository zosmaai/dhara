# Dhara Sprint Plan — May 15, 2026

## Strategy

Three PRs, sequential. Each PR is standalone, CI-gated, merged before starting next.

| # | PR | Scope | Risk |
|---|---|---|---|
| PR #1 | Fix: Biome v2 + import ordering | Config upgrade, format pass, lint fixes | Low — mechanical |
| PR #2 | Feat: Security sandbox hardening | Approval flow hook, extension isolation, audit persistence | Medium |
| PR #3 | Feat: Production registry | PostgreSQL, GitHub OAuth auth, web UI | High |

---

## PR #1: Biome v2 + Format Cleanup

**Files changed:** ~50 (mechanical)
**CI expectations:** `npx biome check` passes, `tsc --noEmit` passes, `vitest run` passes

### Tasks

1. **Install @biomejs/biome@latest** — `npm install --save-dev @biomejs/biome@latest`
2. **Fix biome.json** — Replace `"includes"` (v1 key) with `"include"` (v2 key)
3. **Run `npx biome check --write --no-errors-on-unmatched`** — Auto-fix import ordering, formatting
4. **Manually fix remaining lint issues** — Unused variables (`_` prefix), regex escaping, optional chaining
5. **Fix `.lintstagedrc.js`** — Ensure lint-staged uses `biome check --write`
6. **Verify** — `npx biome check .`, `tsc --noEmit`, `npm test`

### Rationale for doing this first
- Without it, CI is broken (biome config errors)
- Import ordering inconsistencies confuse biome v2 formatter
- Clean slate before adding new code in PR #2 and #3

---

## PR #2: Security Sandbox Hardening

**Core changes:**
- `src/core/sandbox.ts` — Add `capability:denied` hook integration
- `src/core/events.ts` — Ensure `capability:denied` hook fires on sandbox deny
- `src/core/extension-manager.ts` — Extension isolation (resource limits, timeout)
- `src/core/session-manager.ts` — Audit log persistence for sandbox events
- Tests for all new functionality

### Tasks

1. **Capability:denied hook** — Wire sandbox check into event bus hook system
   - When sandbox denies a capability, fire `capability:denied` hook
   - Hook can `{ action: "allow" }` to override (user approval flow)
   - Create permission store for cached approvals
2. **Extension isolation** — Add subprocess resource limits (CPU, memory)
   - Grace period before SIGTERM on cancellation
   - Hard timeout per tool execution
3. **Audit log persistence** — Store denied capability events in session
   - Add `capability:audit` event type
   - Persist to session file
4. **Tests**
   - Sandbox + hook integration test
   - Extension isolation test (timeout behavior)
   - Audit log persistence test
5. **Verify** — `npx biome check .`, `tsc --noEmit`, `npm test`

---

## PR #3: Production Registry

**Largest PR.** Three sub-components:

### 3a. PostgreSQL Backend
- Add `psycopg2` / `asyncpg` dependency
- Replace in-memory `RegistryStore` with PostgreSQL via SQLAlchemy
- Migration/init script
- Docker Compose update (add PostgreSQL service)

### 3b. GitHub OAuth Auth
- Add auth middleware to FastAPI
- GitHub OAuth flow (device code for CLI, web flow for browser)
- API key generation for CLI usage
- Rate limiting per user

### 3c. Web UI (Minimal)
- Single-page HTML/JS (no build step) for browsing packages
- Search, view, install instructions
- Deployed alongside FastAPI via static file mount

### Tasks
1. PostgreSQL integration in registry
2. Auth endpoints + GitHub OAuth
3. Web UI
4. Tests + Docker Compose update
5. Verify

---

## Execution Order

```
PR #1 → CI passes → MERGE → PR #2 → CI passes → MERGE → PR #3 → CI passes → MERGE
```
