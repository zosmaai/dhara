# Spec: CLI — Print Mode

> Status: draft · Depends on: ConfigManager, AgentLoop, Provider adapters

## Goal

`dhara -p "query"` runs a single-turn agent query and prints the result to stdout. This is the first time all existing pieces connect end-to-end.

## What It Does

```
$ dhara -p "What files are in this directory?"
→ reads ~/.dhara/config.json
→ resolves active provider (openai, anthropic, etc.)
→ creates Provider instance with API key from config
→ creates session at ~/.dhara/sessions/{id}.jsonl
→ runs agent loop: user prompt → LLM → tool calls → response
→ prints final assistant text to stdout
→ exits with code 0 (or 1 on error)
```

## Architecture

```
src/cli/
├── run.ts          # Entry point: parse args, wire everything, run, print
└── run.test.ts     # Integration test with mocked provider
```

The CLI is NOT in `src/core/`. Core is pure infrastructure. CLI is a consumer of core.

## Entry Point Configuration

Added to `package.json`:
```json
{
  "bin": {
    "dhara": "./dist/cli/run.js"
  }
}
```

## Arguments

| Flag | Description | Default |
|---|---|---|
| `-p <prompt>` | Print mode: run query and exit | (required) |
| `-m <model>` | Override model ID (e.g. `claude-sonnet-4`) | Config default |
| `-c <path>` | Custom config path | `~/.dhara/config.json` |
| `-s <path>` | Custom session storage path | `~/.dhara/sessions` |

## Flow

```
run(args)
  1. Parse CLI arguments
  2. Load ConfigManager with provided config path
  3. Validate: activeProvider must exist, API key must be set
  4. Resolve Provider:
       - "openai" → createOpenAIProvider(apiKey, baseUrl)
       - "anthropic" → createAnthropicProvider(apiKey, baseUrl)
       - (extensible via a provider registry map)
  5. Create SessionManager + Session
  6. Build model override from -m flag (or config defaultModel)
  7. Create AgentLoop({ provider, session, tools: builtinTools })
  8. Run the loop with user prompt
  9. Print assistant response to stdout
  10. Print errors to stderr, exit with code 1 on failure
```

## Provider Resolution

A simple registry maps provider IDs to factory functions:

```typescript
// src/cli/provider-factory.ts
import { createOpenAIProvider } from "../std/providers/openai-provider.js";
import { createAnthropicProvider } from "../std/providers/anthropic-provider.js";
import type { Provider, ProviderConfig } from "../core/provider.js";

export function createProvider(providerConfig: ProviderConfig): Provider {
  switch (providerConfig.id) {
    case "openai":
      return createOpenAIProvider({
        apiKey: (providerConfig.auth as { apiKey: string }).apiKey,
        baseUrl: providerConfig.baseUrl,
      });
    case "anthropic":
      return createAnthropicProvider({
        apiKey: (providerConfig.auth as { apiKey: string }).apiKey,
        baseUrl: providerConfig.baseUrl,
      });
    default:
      throw new Error(`Unknown provider: ${providerConfig.id}`);
  }
}
```

Later this becomes extensible via extension loading. For now it's a simple switch.

## Built-in Tools for Print Mode

The agent loop needs tools to be useful. For print mode, we register a minimal set:

```typescript
// src/std/tools/fs-read.ts
// src/std/tools/fs-list.ts
// src/std/tools/bash.ts
```

These are implemented in Task 2 (Std Library Tools), but a stub set is needed for print mode to work end-to-end.

### Minimal tools for print mode to work:

- `bash` — execute shell commands
- `fs_read` — read file contents
- `fs_list` — list directory contents

## Error Handling

| Error | Behaviour |
|---|---|
| No config file | Print instructions to stderr, exit 1 |
| No active provider set | Print "No active provider. Run `dhara config set-provider`", exit 1 |
| No API key for provider | Print "No API key set for {provider}", exit 1 |
| Provider API error | Print error to stderr, exit 1 |
| Tool execution error | Agent loop handles gracefully (continues), errors shown as tool results |
| Max iterations exceeded | Print last response + warning to stderr, exit 0 |

## Output Format

Plain text to stdout:

```
The directory contains:
- src/
  - core/
  - cli/
  - std/
- spec/
- README.md
- package.json
```

Errors to stderr:

```
dhara: no active provider set. Run `dhara config set-provider <id>`.
```

## Tests

### Unit tests (mocked provider)
- `run.print_mode_parses_args` — validates arg parsing
- `run.print_mode_resolves_provider` — maps provider ID to factory
- `run.print_mode_config_missing_api_key` — exits with error
- `run.print_mode_no_active_provider` — exits with error
- `run.print_mode_runs_agent_loop` — full flow with mock provider
- `run.print_mode_prints_response_to_stdout` — captures stdout
- `run.print_mode_prints_errors_to_stderr` — captures stderr
- `run.print_mode_model_override` — -m flag takes priority
- `run.print_mode_exit_code_zero_on_success` — process exits 0
- `run.print_mode_exit_code_one_on_error` — process exits 1

### Integration test (real provider isn't needed — mock is enough)
- Full pipeline with mock provider, mock config, real agent loop

## Files Created

```
src/cli/
├── run.ts               # Entry point (~150 lines)
├── provider-factory.ts  # Provider resolution (~50 lines)
└── run.test.ts          # Tests (~200 lines)
```

## Files Modified

```
package.json             # Add "bin" field
tsconfig.json            # Ensure src/cli/ is included
```

## Success Criteria
- `dhara -p "What is 2+2?"` prints a response from the LLM
- `dhara -p "List files in /tmp"` uses tools, lists files
- Exits 0 on success, 1 on error
- Config-driven: provider, model, API key all from config
- 0 type errors, 0 lint errors
