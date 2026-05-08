# Contributing to Dhara

Thank you for your interest in Dhara — the Agent Protocol Standard.

## Our Philosophy

Dhara is built on three principles:

1. **Protocol over API** — Extensions communicate via a standard wire protocol, not a language-specific function call. This means anyone can write extensions in any language.
2. **Security by design** — Capability-based sandboxing, not "review the source code." Extensions declare what they need; users approve; the sandbox enforces.
3. **Open standard, open source** — The spec is CC-BY-4.0 (anyone can implement it). The reference implementation is MIT.

## How to Contribute

### Spec (spec/)
The spec documents define the standard. Improvements here benefit every implementation.

- **Language clarity** — Is something ambiguous? File an issue or PR.
- **Gaps** — Did we miss an edge case in the protocol?
- **JSON Schemas** — Do the schemas validate correctly?

### Reference Implementation (core/, std/, cli/)

- **Bug fixes** — Found a bug in the reference implementation?
- **Standard tools** — Ideas for the standard library?
- **Provider extensions** — Add a new LLM provider.

### Registry (registry/)

- **Package ideas** — What tools would make dhara useful?
- **Registry features** — What's missing from the package registry?

### Showcase Extensions

Build an extension in your language of choice and publish it:
- Python semantic search
- Rust git integration
- Go test runner
- TypeScript linter

## Getting Started

```bash
git clone git@github.com:zosmaai/dhara.git
cd dhara
# ... follow the build guide (coming soon)
```

## Code of Conduct

Be excellent to each other. We're building a standard for everyone.
