# Zosma Code for VS Code

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/zosmaai.zosma-code?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=zosmaai.zosma-code)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/zosmaai.zosma-code)](https://marketplace.visualstudio.com/items?itemName=zosmaai.zosma-code)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Minimal is the best. Highly customizable with extensions and skills — and no lock-in.**

Zosma Code is a lightweight VS Code wrapper around [Dhara](https://github.com/zosmaai/dhara), the open-source agent protocol. Use any LLM, write extensions in any language, and keep full control of your workflow. Select code, press `Alt+D`, type a prompt, and get results in a new editor tab — no context switching, no proprietary models, no subscription fees.

---

## Features

- **Prompt Anything** — Ask questions about your codebase, request refactors, generate documentation
- **Select & Run** — Highlight code in the editor and invoke Zosma Code with `Alt+D` — the selected code is automatically included
- **Any LLM** — OpenAI, Anthropic, Google Gemini, Groq, DeepSeek, Mistral, Bedrock, and 20+ more — you choose the provider
- **Zero Config** — Works out of the box with OpenCode Go (free). Switch providers with a setting
- **No Lock-in** — This is a thin UI over the Dhara protocol. No proprietary models, no platform dependency
- **Fast** — Standalone binary, no Electron bloat, no subprocess overhead

---

## Quick Start

1. **Install the extension** from the VS Code Marketplace
2. **Open a project** in VS Code
3. **Press `Alt+D`** (or Cmd+Shift+P → "Zosma Code: Run Prompt")
4. **Type your prompt** — e.g., "Explain this file" or "What does this function do?"

That's it. Zosma Code will run your prompt against the configured LLM and open the result in a new editor tab.

### Running on Selected Code

1. **Select code** in the editor
2. **Press `Alt+D`**
3. **Confirm or edit the default prompt** ("Review this code")
4. **Get results** — the response opens in a new tab

---

## Configuration

| Setting | Default | Description |
|---|---|---|
| `dhara.binaryPath` | `dhara` | Path to the `dhara` binary |
| `dhara.provider` | `opencode-go` | LLM provider to use |
| `dhara.model` | — | Model override (e.g., `gpt-4o`, `claude-sonnet-4-20250514`) |

Set the corresponding environment variable for your chosen provider:

| Provider | `dhara.provider` | Env Variable |
|---|---|---|
| OpenCode Go (free, default) | `opencode-go` | — |
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` |
| Google Gemini | `google` | `GOOGLE_API_KEY` |
| Groq | `groq` | `GROQ_API_KEY` |
| DeepSeek | `deepseek` | `DEEPSEEK_API_KEY` |
| Mistral | `mistral` | `MISTRAL_API_KEY` |
| Amazon Bedrock | `amazon-bedrock` | AWS credentials |
| 12+ more | ... | See [Dhara providers](https://github.com/zosmaai/dhara?tab=readme-ov-file#providers) |

---

## Requirements

- **Node.js 20+** — The `dhara` binary requires Node.js 20 or later
- **dhara binary** — Included automatically (`npx @zosmaai/dhara`), or install globally: `npm install -g @zosmaai/dhara`

---

## Commands

| Command | Keybinding | Description |
|---|---|---|
| `Zosma Code: Run Prompt` | — | Open an input box and run a prompt |
| `Zosma Code: Run on Selected Code` | `Alt+D` (editor has selection) | Run a prompt on selected code |

---

## Why Zosma Code?

### vs. Claude Code / Cowork

| | **Zosma Code** | Claude Code |
|---|---|---|
| **Pricing** | $0 — you pick your provider | $200/user/month |
| **Provider choice** | 20+ providers | Anthropic only |
| **Lock-in** | None — pure protocol | Full Anthropic ecosystem |
| **Open-source** | ✅ MIT | ❌ Proprietary |

### vs. Cursor / Copilot

| | **Zosma Code** | Cursor |
|---|---|---|
| **Agent framework** | Full agent loop (plan → tool → execute) | Completions + inline chat |
| **Extensions** | Any language, JSON-RPC wire protocol | Forked VS Code only |
| **Cost** | Free + your provider | $20/month |
| **Philosophy** | Minimal, composable protocol | Monolithic IDE fork |

### vs. OpenAI Codex CLI / OpenCode

| | **Zosma Code** | OpenCode |
|---|---|---|
| **Provider flexibility** | Any LLM, any API | OpenAI-compatible only |
| **Protocol layer** | Dhara Agent Protocol (language-agnostic SDKs in TS, Python, Rust) | CLI-only |
| **Extensions** | JSON-RPC subprocess model | Plugin-based |
| **Session persistence** | Append-only JSONL, diff, search, export | Basic conversation history |

### The Bottom Line

Zosma Code gives you a **coding agent that respects your choices** — your editor, your LLM provider, your tools, your workflow. It's a thin UI over a protocol, not a platform to lock you into.

---

## Development

```bash
git clone https://github.com/zosmaai/dhara
cd dhara/vscode-extension
npm install
code .          # Open in VS Code
# Press F5 to launch Extension Development Host
```

---

## Publishing

```bash
npm install -g @vscode/vsce
vsce package   # Creates .vsix
vsce publish   # Publishes to marketplace
```

---

## License

MIT © [Zosma AI](https://zosma.ai)
