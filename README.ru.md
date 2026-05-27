<p align="center">
  <img src="assets/dhara-logo.svg" width="120" height="120" alt="Dhara logo">
</p>

<h1 align="center">Dhara</h1>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh.md">中文</a> | <a href="./README.es.md">Español</a> | <a href="./README.ja.md">日本語</a> | <a href="./README.de.md">Deutsch</a> | <a href="./README.fr.md">Français</a> | <a href="./README.pt.md">Português</a> | **Русский** | <a href="./README.ko.md">한국어</a> | [हिंदी](./README.hi.md)
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

Dhara (धारा, «поток» на санскрите) — это движок, питающий AI-кодинг-агентов. Он предоставляет цикл агента, управление инструментами, сохранение сессий и протокол расширений — без привязки к какому-либо LLM-провайдеру, UI-фреймворку или языку программирования.
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

## Возможности

- **🔄 Agent Loop** — Цикл LLM → инструмент → LLM с потоковой передачей, отменой и восстановлением после ошибок
- **🔌 Extension Protocol** — Проводной протокол JSON-RPC 2.0. Пишите расширения на любом языке
- **📦 20+ LLM Providers** — 20+ LLM-провайдеров: OpenAI, Anthropic, Google, Mistral, Groq, DeepSeek, Bedrock и другие через pi-ai
- **🛡️ Capability Sandbox** — Объявите, что нужно инструментам. Блокируйте всё остальное.
- **💾 Session Persistence** — Формат JSONL только для добавления. Возобновляйте разговоры после перезапусков.
- **🖥️ TUI + REPL** — Полноэкранный TUI с подсветкой синтаксиса или построчный REPL
- **📝 Context Files** — AGENTS.md / CLAUDE.md автоматическая загрузка для каждого проекта
- **🔧 Extensions** — Любой язык, любой инструмент, любой хук. Расширения — это подпроцессы, а не вызовы функций.

## Быстрый старт

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

## Настройка провайдера

Dhara требует LLM-провайдера для работы. Есть два способа:

### Вариант 1: Интерактивная настройка (рекомендуется)

Запустите `/login` внутри TUI для интерактивной настройки провайдера:

1. Запустите `dhara`, чтобы войти в TUI
2. Введите `/login`
3. Выберите **API Key** как тип аутентификации
4. Выберите провайдера из списка
5. Введите ваш API-ключ (маскируется символами)

Ваш API-ключ безопасно хранится в `~/.dhara/config.json`.

### Вариант 2: Флаги CLI / переменные окружения

Установите соответствующую переменную окружения и используйте `--provider`:

```bash
export OPENAI_API_KEY="sk-..."
dhara --provider openai --model gpt-4o

export ANTHROPIC_API_KEY="sk-ant-..."
dhara --provider anthropic --model claude-sonnet-4-20250514
```

## Провайдеры

Dhara поддерживает 20+ LLM-провайдеров. Встроенные провайдеры (без доп. зависимостей):
`openai`, `anthropic`, `opencode-go`.

Дополнительные провайдеры через интеграцию [pi-ai](https://github.com/earendil-works/pi-mono).
Установите соответствующую переменную окружения и используйте `--provider`:

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

## Стандартные инструменты

Dhara поставляется с 6 основными инструментами. Всё остальное — расширение.

| Tool | Description | Capability |
|---|---|---|
| `read` | Read file contents | `filesystem:read` |
| `write` | Create/overwrite files | `filesystem:write` |
| `edit` | Surgical text replacement | `filesystem:read`, `filesystem:write` |
| `ls` | Directory listing | `filesystem:read` |
| `grep` | Pattern search across files | `filesystem:read` |
| `bash` | Shell command execution | `process:spawn` |

Сетевые инструменты (веб-запросы, веб-поиск), инструменты баз данных, git-операции — всё относится к **расширениям**.

## Расширения

Расширения общаются через **JSON-RPC 2.0 по stdin/stdout**. Работает на любом языке.

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

Установка: скопируйте в `~/.dhara/extensions/my-extension/` с `manifest.json`.

## Конфигурация

Dhara использует двухуровневую систему конфигурации:

- **Глобальная**: `~/.dhara/config.json` — настройки для всех проектов
- **Проектная**: `.dhara/config.json` в корне проекта — переопределяет глобальную

Проектная конфигурация имеет приоритет над глобальной. Флаги CLI переопределяют обе.

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

> **Примечание**: Устаревшие файлы `.dhara/settings.json` всё ещё загружаются для обратной совместимости, но `.dhara/config.json` — рекомендуемый файл конфигурации на уровне проекта.
> compatibility, but `.dhara/config.json` is the recommended project-level
> config file.

## Документация

Full documentation is at **[dhara.zosma.ai](https://dhara.zosma.ai)**.

- [Getting Started Guide](docs/getting-started/index.mdx)
- [Writing Your First Extension](docs/guides/write-first-extension.mdx)
- [Architecture Overview](spec/architecture.md)
- [Extension Protocol Spec](spec/extension-protocol.md)
- [Session Format](spec/session-format.md)
- [Roadmap](spec/roadmap.md)

## Архитектура

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

## Статус проекта

Dhara находится в активной разработке. Фазы 0–3 (Спецификация, Ядро, Стандартная библиотека, CLI) завершены. Текущая работа сосредоточена на документации, экосистеме расширений и подготовке к релизу.
complete. Current work focuses on documentation, extension ecosystem, and launch prep.

See [spec/roadmap.md](spec/roadmap.md) for details.

## Участие

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Лицензия

MIT — see [LICENSE](LICENSE). Spec documents are CC-BY-4.0 — see [LICENSE-SPEC](LICENSE-SPEC.md).

Built with ❤️ by [Zosma AI](https://zosma.ai).
