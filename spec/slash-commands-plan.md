# Dhara Slash Commands — Implementation Plan

> Inspired by pi-coding-agent's built-in command system. Each command follows
> pi's UX patterns: interactive menus with SelectList overlays, autocomplete
> via CombinedAutocompleteProvider, and extension registration via
> `registerCommand()`.

---

## Current State (2026-05-20)

### TUI (`src/cli/tui-runner.ts`) — `onSlashCommand` handler

| Command | Status | Notes |
|---------|--------|-------|
| `/resume` | 🔶 Partial | Has session picker overlay; does NOT auto-restore session in agent loop. Just prints message. No session name display. |
| `/new` | 🔶 Partial | Just prints message; doesn't create new session file or update agent session. |
| `/session` | ✅ Basic | Shows ID, provider, model, CWD, count. |
| `/model` | 🔶 Stub | Just prints current model; no selector UI. |
| `/compact` | 🔶 Stub | Just prints message; no actual compaction logic. |
| `/export` | ✅ Works | Writes session to file. |
| `/help` / `/hotkeys` | ✅ Partial | Shows command list via system message. |
| `/quit` | ✅ Works | Exits TUI. |
| `/clear` | ✅ Works | Clears messages. |

### REPL (`src/cli/repl.ts`) — `parseInput` / `SLASH_COMMANDS` map

| Command | Status | Notes |
|---------|--------|-------|
| `/exit` `/quit` | ✅ Works | Exits REPL. |
| `/save` | ✅ Works | Saves session to disk. |
| `/list` | ✅ Works | Lists saved sessions. |
| `/resume` | 🔶 Partial | Loads session from disk; does NOT swap into agent loop. |
| `/reload` | ✅ Works | Reloads config, context files, skills. |
| `/skills` | ✅ Works | Lists loaded skills. |
| `/status` | ✅ Works | Shows config and stats. |
| `/help` | ✅ Works | Shows command list. |
| `/history` | ✅ Works | Shows recent N entries from session. |

### Fully Missing in Both TUI and REPL

| Command | Priority | Notes |
|---------|----------|-------|
| `/login` | 🔴 P0 | Interactive flow: subscription vs API key → provider selection → credential input. |
| `/logout` | 🔴 P0 | Remove stored credentials. |
| `/settings` | 🔴 P0 | Settings menu overlay (theme, thinking level, message delivery, transport). |
| `/model` | 🔴 P0 | Interactive model selector with provider list and model picker. |
| `/name` | 🟡 P1 | Set human-readable session name. |
| `/tree` | 🟡 P1 | Session tree navigation (switch branches within same file). |
| `/fork` | 🟡 P1 | Create new session from a previous user message. |
| `/clone` | 🟡 P1 | Duplicate current branch into a new session file. |
| `/copy` | 🟡 P1 | Copy last assistant message to clipboard (requires `clipboardy` or xclip). |
| `/import` | 🟡 P1 | Import and resume a session from a JSONL file. |
| `/share` | 🟢 P2 | Upload as private GitHub gist with shareable link. |
| `/scoped-models` | 🟢 P2 | Enable/disable models for cycling. |
| `/changelog` | 🟢 P2 | Display version history from CHANGELOG.md. |
| `/hotkeys` | 🟢 P2 | Proper keybinding display with categories. |
| `/compact` | 🟢 P2 | Full compaction logic (summarize older context). |
| `/reload` (TUI) | 🟢 P2 | TUI needs the reload handler wired (done in REPL only). |

---

## Implementation Order

We'll implement in dependency order, one PR at a time.

```
PR #1:  Fix /resume — auto-restore session + show session name
PR #2:  /login — interactive auth flow (subscription vs API key)
PR #3:  /logout — remove credentials
PR #4:  /name — set session display name
PR #5:  /model — interactive model selector
PR #6:  /settings — settings menu overlay
PR #7:  /session — richer session info panel
PR #8:  /fork — fork from user message
PR #9:  /clone — clone current branch
PR #10: /tree — session tree navigation
PR #11: /copy — copy last assistant message
PR #12: /import — import JSONL session
PR #13: /share — GitHub gist upload
PR #14: /scoped-models — model scope management
PR #15: /changelog — version history display
PR #16: /hotkeys — proper keybinding reference
PR #17: /compact — actual compaction logic
PR #18: /reload (TUI) — wire reload handler in TUI mode
```

---

## Detailed Command Specifications

### PR #1: `/resume` — Fix to Auto-Restore + Show Name

**Problem**: `/resume <id>` loads a session but does not swap the agent loop's
session reference. Session picker overlay doesn't show session names.

**Solution**:
1. Add `session.name` (optional string) to `SessionMeta` in `session.ts`
2. In TUI `onSlashCommand` for `/resume`:
   - When session is selected from picker or by ID, re-create the agent loop
     with the loaded session
   - Show session name (or first 8 chars of ID) in the picker
   - Show "(named: X)" when session has a name
3. In the session picker `SelectItem`, display:
   - Label: session name if set, else first 8 chars of ID
   - Description: `N entries · date · /path`
4. When `/resume` succeeds, update footer with new session info

**Affected files**:
- `src/core/session.ts` — add `name?: string` to `SessionMeta`
- `src/core/session-manager.ts` — expose `name` in `SessionSummary`
- `src/cli/tui-runner.ts` — fix `/resume` handler to re-create agent loop

---

### PR #2: `/login` — Interactive Auth Flow

**Problem**: No way to configure provider credentials interactively.

**Pi's Flow** (what we're matching):
```
/login
  ↓
"Configure Authentication"
  ↓
[Subscription]  [API Key]
  ↓ choose one
Provider list (select via SelectList)
  ↓ if Subscription:
Open browser URL for OAuth
  ↓ if API Key:
Prompt for API key input
  ↓
Store in ~/.dhara/config.json
```

**Implementation**:

1. Create `src/cli/auth-commands.ts`:
   - `handleLogin()` — the full interactive flow
   - `handleLogout()` — remove credentials

2. Auth flow:
   - Step 1: Show "Subscription" vs "API Key" choice via SelectList overlay
   - Step 2: Show provider list filtered by auth type
     - Subscription providers: `anthropic (Claude Pro/Max)`, `openai (ChatGPT Plus/Pro)`, `github-copilot`
     - API Key providers: all others from `KNOWN_PROVIDERS` + dynamic from pi-ai
   - Step 3a (API Key): Show input prompt for API key → validate → store
   - Step 3b (Subscription): Launch browser → wait for OAuth callback → store token
   - Store in `ConfigManager` / `~/.dhara/config.json`

3. Create `src/core/auth-storage.ts`:
   - Secure credential storage (or re-use ConfigManager)

4. Wire into TUI `onSlashCommand` and REPL `SLASH_COMMANDS`

**Affected files**:
- `src/cli/auth-commands.ts` — NEW
- `src/core/config.ts` — add OAuth credential support
- `src/cli/tui-runner.ts` — wire `/login`, `/logout`
- `src/cli/repl.ts` — wire `/login`, `/logout`

---

### PR #3: `/logout` — Remove Credentials

**Flow**:
```
/logout
  ↓
Show list of configured providers with credentials
  ↓
Select one to remove
  ↓
Confirm: "Remove credentials for {provider}?"
  ↓
Delete from config
```

---

### PR #4: `/name <name>` — Set Session Display Name

**Problem**: Sessions are identified by UUID, hard to find in picker.

**Solution**:
1. Add `name?: string` to `SessionMeta` (already done in PR #1)
2. `/name <name>` sets `session.meta.name = name` and persists
3. Session picker shows name instead of raw ID prefix
4. Footer shows name if set

---

### PR #5: `/model` — Interactive Model Selector

**Problem**: No way to switch models interactively.

**Pi's Flow**:
```
/model
  ↓
Show provider list (if multiple configured)
  ↓
Show model list for selected provider
  ↓
Select model → switch provider/model in agent loop
```

**Implementation**:
1. `ConfigManager` needs to track:
   - Configured providers with their API keys/OAuth tokens
   - Available models per provider
2. `/model` opens a SelectList with providers → models
3. On selection, re-create agent loop with new provider/model
4. Update footer

---

### PR #6: `/settings` — Settings Menu

**Pi's Settings**:
- Thinking level (off / minimal / low / high)
- Theme (dhara-default, dracula, nord, catppuccin)
- Message delivery (stream / token / batch)
- Transport (stdio / http)

**Implementation**: Use `SettingsList` from pi-tui.

---

### PR #7: `/session` — Richer Info Panel

**Current**: Shows ID, provider, model, CWD, session count.

**Enhanced**: Also show:
- Session name (if set)
- Token usage and cost
- Entry count breakdown by role
- Session file path
- Duration (created → now)

---

### PR #8: `/fork` — Fork from User Message

**Pi's Flow**:
```
/fork
  ↓
Show user message picker (SelectList of user messages)
  ↓
Select one → create new session file
  ↓
Copy selected message into new session's editor
```

**Implementation**: `session.fork(parentId)` creates a BranchEntry in the current
file. For `/fork`, we create a NEW session file (clone) and copy the selected
user message into the new session editor.

---

### PR #9: `/clone` — Clone Current Branch

**Flow**:
```
/clone
  ↓
Create new session file
  ↓
Copy all entries from current branch into new session
  ↓
Switch agent to new session
```

---

### PR #10: `/tree` — Session Tree Navigation

**Pi's Flow**:
```
/tree
  ↓
Show tree with indentation and branch markers
  ↓
Navigate with ↑/↓, select with Enter
  ↓
On branch switch → option to summarize abandoned branch
```

**Implementation**:
1. Build tree renderer from session `getPath()` and `getEntries()` / `children` map
2. Show as SelectList with tree indentation
3. On selection:
   - If user message: copy text to editor, set as new leaf
   - If assistant/tool: set as new leaf, editor empty
4. On branch switch: prompt for branch summary

---

### PR #11: `/copy` — Copy Last Assistant Message

**Implementation**:
1. Walk session path backwards to find last assistant entry
2. Copy content to clipboard
3. Requires `clipboardy` package or `xclip`/`pbcopy` fallback

---

### PR #12: `/import` — Import JSONL Session

**Flow**:
```
/import <path>
  ↓
Parse JSONL file
  ↓
Create new session with imported entries
  ↓
Switch to imported session
```

---

### PR #13: `/share` — GitHub Gist Upload

**Flow**:
```
/share
  ↓
Export session to HTML
  ↓
Upload as secret GitHub Gist via gh CLI or API
  ↓
Print shareable URL
```

---

### PR #14: `/scoped-models`

Toggle which models appear in the Ctrl+P cycle.

---

### PR #15: `/changelog`

Read and display `CHANGELOG.md` (or equivalent).

---

### PR #16: `/hotkeys`

Display full keybinding reference with categories.

---

### PR #17: `/compact` — Actual Compaction

Implement pi's compaction algorithm:
1. Calculate context tokens
2. Find cut point based on `keepRecentTokens`
3. Generate summary via LLM
4. Append `CompactionEntry` to session
5. Reload session context

---

### PR #18: `/reload` (TUI)

Wire the TUI's `onReload` handler completely (context files, skills, themes).

---

## Architecture Decisions

### Command Registration Pattern

Following pi's extension API pattern, we define a central command registry:

```typescript
// src/cli/commands/registry.ts
interface SlashCommand {
  name: string;
  description: string;
  handler: (args: string, ctx: CommandContext) => Promise<boolean>;
}
```

Both TUI and REPL consume from the same registry.

### Shared Command Context

```typescript
interface CommandContext {
  session: PersistedSession;
  agent: AgentLoop;
  provider: Provider;
  providerName: string;
  modelId: string;
  sessionManager: SessionManager;
  configManager: ConfigManager;
  tui: TUI;
  chat: DharaApp;
  // ...
}
```

### File Organization

```
src/cli/commands/
  registry.ts       — Central command registration + help generation
  session-commands.ts — /resume, /new, /session, /name, /tree, /fork, /clone
  auth-commands.ts  — /login, /logout
  model-commands.ts — /model, /scoped-models
  settings.ts       — /settings
  util-commands.ts  — /copy, /export, /import, /share, /changelog, /hotkeys
  compact.ts        — /compact
  reload.ts         — /reload
```

---

## Testing Strategy

Each PR includes:
- Unit tests for new logic (functions, validation)
- Integration tests via session-manager for persistence
- Manual testing checklist for TUI interactions

---
