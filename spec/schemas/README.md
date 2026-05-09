# Dhara JSON Schemas

This directory contains formal [JSON Schema](https://json-schema.org/) (draft 2020-12) files
for every data structure defined in the Dhara spec.

## Purpose

The spec documents (`spec/*.md`) describe the protocol in prose. These schemas make the spec
**machine-validatable** — any implementation anywhere can validate against them.

## Schema Files

| File | Validates | From Spec |
|---|---|---|
| [`entry.json`](./entry.json) | Session entries (entries.jsonl lines) | [session-format.md](../session-format.md) |
| [`branch.json`](./branch.json) | Branch markers in session log | [session-format.md](../session-format.md) |
| [`tree.json`](./tree.json) | Session tree structure (tree.json) | [session-format.md](../session-format.md) |
| [`meta.json`](./meta.json) | Session metadata (meta.json) | [session-format.md](../session-format.md) |
| [`compaction.json`](./compaction.json) | Compaction summaries | [session-format.md](../session-format.md) |
| [`tool.json`](./tool.json) | Tool definitions | [tool-schema.md](../tool-schema.md) |
| [`protocol.json`](./protocol.json) | JSON-RPC 2.0 protocol messages | [extension-protocol.md](../extension-protocol.md) |
| [`manifest.json`](./manifest.json) | Package manifests | [package-manifest.md](../package-manifest.md) |
| [`capability.json`](./capability.json) | Capability declarations, permissions, audit | [capability-model.md](../capability-model.md) |

## Schema Hierarchy

```
Session Format (entry.json, branch.json, tree.json, meta.json, compaction.json)
  └─ entry.json ── content blocks ────┐
                                      ├─ reused by protocol.json (ToolExecuteResult)
                                      └─ reused by tool.json (parameters/returns)

Tool Schema (tool.json)
  └─ parameters/returns ── JSON Schema ──── referenced by manifest.json (ExtensionDef)

Protocol (protocol.json)
  ├─ Request messages (initialize, tools/execute, etc.)
  ├─ Response messages
  ├─ Error responses
  └─ Notifications (tools/progress, event/*)
       └─ DisplayBlock system (table, diff, progress, chart, custom)

Manifest (manifest.json)
  ├─ ExtensionDef ── references tool.json
  ├─ SkillDef
  └─ PromptDef

Capability (capability.json)
  ├─ CapabilityDeclaration (array of resource:action strings)
  ├─ PermissionsFile (stored user approvals)
  └─ AuditEntry (usage log)
```

## Usage

### With any JSON Schema validator

```bash
# Validate a session entry
npx ajv validate -s spec/schemas/entry.json -d session/entries.jsonl

# Validate a package manifest
npx ajv validate -s spec/schemas/manifest.json -d my-package/manifest.yaml
```

### With TypeScript (via json-schema-to-ts)

```typescript
import type { FromSchema } from "json-schema-to-ts";
import entrySchema from "./schemas/entry.json";

type SessionEntry = FromSchema<typeof entrySchema>;
```

## Versioning

All schemas use `$id` with a stable URL:

```
https://zosma.ai/dhara/schemas/{file}.json
```

The format is versioned independently via the `formatVersion` field in session meta.json
and package manifest version fields. Schema files themselves are versioned by the
git tag of the Dhara release.
