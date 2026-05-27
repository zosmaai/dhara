<p align="center">
  <img src="assets/dhara-logo.svg" width="120" height="120" alt="Dhara logo">
</p>

<h1 align="center">Dhara</h1>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh.md">中文</a> | <a href="./README.es.md">Español</a> | <a href="./README.ja.md">日本語</a> | **Deutsch** | <a href="./README.fr.md">Français</a> | <a href="./README.pt.md">Português</a> | <a href="./README.ru.md">Русский</a> | <a href="./README.ko.md">한국어</a> | [हिंदी](./README.hi.md)
</p>

<p align="center">
  <strong>A minimal, secure, language-agnostic coding agent harness.</strong>
</p>

<p align="center">
  <a href="https://github.com/zosmaai/dhara/actions/workflows/ci.yml">
    <img src="https://github.com/zosmaai/dhara/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="https://www.npmjs.com/package/@zosmaai/dhara">
    <img src="https://img.shields.io/npm/v/@zosmaai/dhara" alt="npm version">
  </a>
  <a href="https://www.npmjs.com/package/@zosmaai/dhara">
    <img src="https://img.shields.io/npm/dm/@zosmaai/dhara" alt="npm downloads">
  </a>
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT">
  </a>
  <a href="https://nodejs.org">
    <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node">
  </a>
  <a href="https://github.com/zosmaai/dhara/stargazers">
    <img src="https://img.shields.io/github/stars/zosmaai/dhara?style=social" alt="GitHub Stars">
  </a>
</p>

<p align="center">
  <a href="https://dhara.zosma.ai">📖 Docs</a>
  ·
  <a href="docs/getting-started/index.mdx">🚀 Getting Started</a>
  ·
  <a href="spec/roadmap.md">🗺️ Roadmap</a>
</p>

<br>

<p align="center">
  <a href="https://github.com/zosmaai/dhara/stargazers">
    <img src="assets/thank-you-for-the-star.png" alt="Thank you for the star!" width="600">
  </a>
</p>

<p align="center">
  If you find Dhara useful,
  <a href="https://github.com/zosmaai/dhara/stargazers">star the repo</a>
  — it tells us we're building something you care about!
</p>

<br>

Dhara (धारा, „Fluss" auf Sanskrit) ist die Engine, die KI-Coding-Agenten antreibt. Sie bietet die Agentenschleife, Tool-Verwaltung, Sitzungspersistenz und ein Erweiterungsprotokoll — ohne an einen LLM-Anbieter, ein UI-Framework oder eine Programmiersprache gebunden zu sein.
It provides the agent loop, tool management, session persistence, and extension
protocol — without being tied to any LLM provider, UI framework, or programming
language.

```bash
# Install globally (recommended)
npm install -g @zosmaai/dhara

# Then use directly
dhara "List the files in this project"

# Or with pnpm
pnpm install -g @zosmaai/dhara
dhara "List the files in this project"
```

## Funktionen

- **🔄 Agent Loop** — LLM → Tool → LLM-Zyklus mit Streaming, Abbruch und Fehlerbehebung
- **🔌 Extension Protocol** — JSON-RPC 2.0-Drahtprotokoll. Schreibe Erweiterungen in jeder Sprache
- **📦 20+ LLM Providers** — 20+ LLM-Anbieter: OpenAI, Anthropic, Google, Mistral, Groq, DeepSeek, Bedrock und mehr via pi-ai
- **🛡️ Capability Sandbox** — Deklariere, was Tools brauchen. Blockiere alles andere.
- **💾 Session Persistence** — Nur-Anhängen-JSONL-Format. Setze Gespräche über Neustarts hinweg fort.
- **🖥️ TUI + REPL** — Vollbild-Terminal-UI mit Syntax-Highlighting oder zeilenbasiertes REPL
- **📝 Context Files** — AGENTS.md / CLAUDE.md automatisch pro Projekt geladen
- **🔧 Extensions** — Jede Sprache, jedes Tool, jeder Hook. Erweiterungen sind Subprozesse, keine Funktionsaufrufe.

## Schnellstart

```bash
# Install globally (recommended)
npm install -g @zosmaai/dhara

# One-shot: pass a prompt as an argument
dhara "List the files in this project"

# Interactive mode (TUI) — just run dhara
dhara

# Choose a provider and model
export GOOGLE_API_KEY="..."
dhara --provider google --model gemini-2.5-flash

# Or run directly with npx
npx @zosmaai/dhara "List the files in this project"
```

## Anbieter Konfigurieren

Dhara benötigt einen LLM-Anbieter, um zu funktionieren. Es gibt zwei Möglichkeiten:

### Option 1: Interaktive Einrichtung (empfohlen)

Führe `/login` im TUI aus, um einen Anbieter interaktiv zu konfigurieren:

1. Starte `dhara`, um das TUI zu betreten
2. Gib `/login` ein
3. Wähle **API-Key** als Authentifizierungstyp
4. Wähle deinen Anbieter aus der Liste
5. Gib deinen API-Key ein (maskiert mit Aufzählungszeichen)

Dein API-Key wird sicher in `~/.dhara/config.json` gespeichert.

### Option 2: CLI-Flags / Umgebungsvariablen

Setze die entsprechende Umgebungsvariable und verwende `--provider`:

```bash
export OPENAI_API_KEY="sk-..."
dhara --provider openai --model gpt-4o

export ANTHROPIC_API_KEY="sk-ant-..."
dhara --provider anthropic --model claude-sonnet-4-20250514
```

## Anbieter

Dhara unterstützt 20+ LLM-Anbieter. Integrierte Anbieter (keine zusätzlichen Abhängigkeiten):
`openai`, `anthropic`, `opencode-go`.

Zusätzliche Anbieter über die [pi-ai](https://github.com/earendil-works/pi-mono)-Integration.
Setze die entsprechende Umgebungsvariable und verwende `--provider`:

| Provider | Env Var | `--provider` |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | `openai` |
| Anthropic | `ANTHROPIC_API_KEY` | `anthropic` |
| Google Gemini | `GOOGLE_API_KEY` | `google` |
| Mistral | `MISTRAL_API_KEY` | `mistral` |
| Groq | `GROQ_API_KEY` | `groq` |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek` |
| Amazon Bedrock | AWS credentials | `amazon-bedrock` |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` | `azure-openai-responses` |
| Fireworks | `FIREWORKS_API_KEY` | `fireworks` |
| OpenRouter | `OPENROUTER_API_KEY` | `openrouter` |
| xAI | `XAI_API_KEY` | `xai` |
| Hugging Face | `HUGGINGFACE_API_KEY` | `huggingface` |
| Cloudflare | `CLOUDFLARE_API_KEY` | `cloudflare-workers-ai` |
| Cerebras | `CEREBRAS_API_KEY` | `cerebras` |
| Together AI | `TOGETHER_API_KEY` | `together` |
| Google Vertex | GCP credentials | `vertex` |

## Standard-Tools

Dhara wird mit 6 grundlegenden Tools geliefert. Alles andere ist eine Erweiterung.

| Tool | Description | Capability |
|---|---|---|
| `read` | Read file contents | `filesystem:read` |
| `write` | Create/overwrite files | `filesystem:write` |
| `edit` | Surgical text replacement | `filesystem:read`, `filesystem:write` |
| `ls` | Directory listing | `filesystem:read` |
| `grep` | Pattern search across files | `filesystem:read` |
| `bash` | Shell command execution | `process:spawn` |

Netzwerktools (Webabruf, Websuche), Datenbanktools, Git-Operationen — alles gehört in **Erweiterungen**.

## Erweiterungen

Erweiterungen kommunizieren über **JSON-RPC 2.0 über stdin/stdout**. Jede Sprache funktioniert.

```python
# my-extension/main.py
import sys, json

for line in sys.stdin:
    req = json.loads(line)
    if req["method"] == "initialize":
        print(json.dumps({"jsonrpc":"2.0","result":{
            "protocolVersion":"0.1.0","name":"my-ext","version":"1.0.0",
            "tools":[{"name":"hello","description":"Say hello",
                      "parameters":{"type":"object","properties":{}}}]
        },"id":req["id"]}))
    elif req["method"] == "tools/execute":
        print(json.dumps({"jsonrpc":"2.0","result":{
            "content":[{"type":"text","text":"Hello from Python!"}]
        },"id":req["id"]}))
    sys.stdout.flush()
```

Installation: Kopiere nach `~/.dhara/extensions/my-extension/` mit einer `manifest.json`.

## Konfiguration

Dhara verwendet ein zweistufiges Konfigurationssystem:

- **Global**: `~/.dhara/config.json` — Einstellungen für alle Projekte
- **Projekt**: `.dhara/config.json` im Projektverzeichnis — überschreibt globale Einstellungen

Projektkonfiguration hat Vorrang vor globalen. CLI-Flags überschreiben beide.

```json
// ~/.dhara/config.json (global defaults)
{
  "activeProvider": "openai",
  "providers": [
    {
      "id": "openai",
      "name": "OpenAI",
      "authType": "api_key",
      "auth": { "type": "api_key", "apiKey": "sk-..." },
      "defaultModel": "gpt-4o",
      "enabled": true
    }
  ],
  "session": {
    "autoSave": true,
    "maxIterations": 100
  }
}
```

> **Hinweis**: Legacy `.dhara/settings.json`-Dateien werden aus Kompatibilitätsgründen weiterhin geladen, aber `.dhara/config.json` ist die empfohlene projektbezogene Konfigurationsdatei.
> compatibility, but `.dhara/config.json` is the recommended project-level
> config file.

## Dokumentation

Full documentation is at **[dhara.zosma.ai](https://dhara.zosma.ai)**.

- [Getting Started Guide](docs/getting-started/index.mdx)
- [Writing Your First Extension](docs/guides/write-first-extension.mdx)
- [Architecture Overview](spec/architecture.md)
- [Extension Protocol Spec](spec/extension-protocol.md)
- [Session Format](spec/session-format.md)
- [Roadmap](spec/roadmap.md)

## Architektur

```
┌─────────────────────────────────────────┐
│              ECOSYSTEM LAYER            │
│  Packages · Themes · Skills · Prompts   │
├─────────────────────────────────────────┤
│              EXTENSION LAYER            │
│  Tools · Providers · Renderers · Hooks  │
│  (any language, wire protocol)          │
├─────────────────────────────────────────┤
│               CORE LAYER               │
│  Agent Loop · Tool Interface · Sandbox  │
│  Session Format · Event Bus             │
│  (< 2,000 lines, no LLM, no UI)         │
└─────────────────────────────────────────┘
```

## Projektstatus

Dhara befindet sich in aktiver Entwicklung. Die Phasen 0–3 (Spezifikation, Kern, Standardbibliothek, CLI) sind abgeschlossen. Die aktuelle Arbeit konzentriert sich auf Dokumentation, Erweiterungsökosystem und Startvorbereitung.
complete. Current work focuses on documentation, extension ecosystem, and launch prep.

See [spec/roadmap.md](spec/roadmap.md) for details.

## Mitwirken

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Lizenz

MIT — see [LICENSE](LICENSE). Spec documents are CC-BY-4.0 — see [LICENSE-SPEC](LICENSE-SPEC.md).

Built with ❤️ by [Zosma AI](https://zosma.ai).
