# Contributing to Dhara

Thanks for your interest! Dhara is the protocol and engine for AI coding agents.
We welcome contributions of all kinds.

## Code of Conduct

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md). By participating,
you agree to uphold it.

## How to Contribute

### Reporting Bugs

Open a [bug report](https://github.com/zosmaai/dhara/issues/new?template=bug-report.md).
Include your environment (OS, Node version, provider), reproduction steps, and
expected vs actual behavior.

### Suggesting Features

Open a [feature request](https://github.com/zosmaai/dhara/issues/new?template=feature-request.md).
Explain the problem, your proposed solution, and alternatives considered.

### Writing Code

1. Fork the repo and create a branch: `git checkout -b feat/my-feature`
2. Make your changes
3. Ensure CI passes locally:
   ```bash
   npm ci
   npx biome lint .
   npx tsc --noEmit
   npx vitest run
   ```
4. Push and open a Pull Request

### Commit Convention

We use [conventional commits](https://www.conventionalcommits.org/):

| Prefix | When to Use |
|---|---|
| `feat:` | New feature or enhancement |
| `fix:` | Bug fix |
| `spec:` | Spec/documentation changes |
| `ci:` | CI/CD pipeline changes |
| `chore:` | Maintenance, deps, tooling |
| `style:` | Formatting, lint fixes |
| `refactor:` | Code restructuring (no behavior change) |

## Development Setup

```bash
git clone https://github.com/zosmaai/dhara
cd dhara
npm install
npm run build      # Compile TypeScript
npm test           # Run tests
npm run lint       # Biome lint
```

## Running Tests

```bash
npm test                    # All tests
npx vitest run --reporter verbose  # Verbose output
npx vitest run path/to/test.ts     # Single file
```

## Architecture

The core is intentionally minimal (< 2K lines). See [spec/architecture.md](spec/architecture.md)
for the full architecture. Key principles:

- **Core has NO LLM code, NO UI code** — interfaces only
- **Extensions are the ONLY way to add functionality** — wire protocol, not function calls
- **Minimal standard library** — 6 tools (read/write/edit/ls/grep/bash). Network tools are extensions.

## Pull Request Checklist

- [ ] `tsc --noEmit` passes
- [ ] `biome lint .` passes (zero warnings)
- [ ] `vitest run` passes
- [ ] New tests cover your changes
- [ ] Spec/docs updated if architecture changed
- [ ] PR description explains the *why*

## Questions?

Open a [Discussion](https://github.com/zosmaai/dhara/discussions) or ping us on [Discord](https://discord.gg/zosmaai) (coming soon).
