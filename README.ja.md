<p align="center">
  <img src="assets/dhara-logo.svg" width="120" height="120" alt="Dhara logo">
</p>

<h1 align="center">Dhara</h1>

<p align="center">
  [English](./README.md) | [中文](./README.zh.md) | [Español](./README.es.md) | **日本語** | [Deutsch](./README.de.md) | [Français](./README.fr.md) | [Português](./README.pt.md) | [Русский](./README.ru.md) | [한국어](./README.ko.md) | [हिंदी](./README.hi.md)
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
    <img src="assets/thank-you-for-the-star.png" alt="Thank you for the star!" width="400">
  </a>
</p>

<p align="center">
  If you find Dhara useful,
  <a href="https://github.com/zosmaai/dhara/stargazers">star the repo</a>
  — it tells us we're building something you care about!
</p>

<br>

Dhara（धारा、サンスクリット語で「流れ」）は AI コーディングエージェントを動かすエンジンです。エージェントループ、ツール管理、セッション永続化、拡張プロトコルを提供し、LLM プロバイダー、UI フレームワーク、プログラミング言語に縛られません。
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

## 機能

- **🔄 Agent Loop** — LLM → ツール → LLM サイクル。ストリーミング、キャンセル、エラー復元をサポート
- **🔌 Extension Protocol** — JSON-RPC 2.0 ワイヤープロトコル。任意の言語で拡張機能を記述可能
- **📦 20+ LLM Providers** — OpenAI、Anthropic、Google、Mistral、Groq、DeepSeek、Bedrock など 20+ の LLM プロバイダー（pi-ai 経由）
- **🛡️ Capability Sandbox** — ツールが必要なものを宣言。それ以外はすべてブロック。
- **💾 Session Persistence** — 追記専用 JSONL 形式。再起動後も会話を再開可能。
- **🖥️ TUI + REPL** — 構文ハイライト付きのフルスクリーン TUI、または行ベースの REPL
- **📝 Context Files** — AGENTS.md / CLAUDE.md をプロジェクトごとに自動読み込み
- **🔧 Extensions** — 任意の言語、任意のツール、任意のフック。拡張機能は関数呼び出しではなくサブプロセス。

## クイックスタート

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

## プロバイダーの設定

Dhara が機能するには LLM プロバイダーが必要です。2 つの方法があります：

### オプション 1: 対話型セットアップ（推奨）

TUI 内で `/login` を実行して、対話的にプロバイダーを設定：

1. `dhara` を起動して TUI に入る
2. `/login` と入力
3. 認証タイプとして **API Key** を選択
4. リストからプロバイダーを選択
5. API キーを入力（マスク表示されます）

API キーは `~/.dhara/config.json` に安全に保存されます。

### オプション 2: CLI フラグ / 環境変数

対応する環境変数を設定し、`--provider` を使用：

```bash
export OPENAI_API_KEY="sk-..."
dhara --provider openai --model gpt-4o

export ANTHROPIC_API_KEY="sk-ant-..."
dhara --provider anthropic --model claude-sonnet-4-20250514
```

## プロバイダー

Dhara は 20+ の LLM プロバイダーをサポート。組み込みプロバイダー（追加依存なし）：
`openai`, `anthropic`, `opencode-go`.

追加プロバイダーは [pi-ai](https://github.com/earendil-works/pi-mono) 統合を通じて利用可能。
対応する環境変数を設定し、`--provider` を使用：

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

## 標準ツール

Dhara には 6 つの基本ツールが付属。その他はすべて拡張機能です。

| Tool | Description | Capability |
|---|---|---|
| `read` | Read file contents | `filesystem:read` |
| `write` | Create/overwrite files | `filesystem:write` |
| `edit` | Surgical text replacement | `filesystem:read`, `filesystem:write` |
| `ls` | Directory listing | `filesystem:read` |
| `grep` | Pattern search across files | `filesystem:read` |
| `bash` | Shell command execution | `process:spawn` |

ネットワークツール（ウェブ取得、ウェブ検索）、データベースツール、git 操作 — すべて**拡張機能**に属します。

## 拡張機能

拡張機能は **stdin/stdout 上の JSON-RPC 2.0** で通信します。任意の言語で動作します。

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

インストール：`manifest.json` とともに `~/.dhara/extensions/my-extension/` にコピー。

## 設定

Dhara は 2 層構成システムを使用します：

- **グローバル**：`~/.dhara/config.json` — 全プロジェクトの設定
- **プロジェクト**：`.dhara/config.json` をプロジェクトルートに配置 — グローバルを上書き

プロジェクト設定はグローバルより優先。CLI フラグは両方を上書き。

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

> **注**：レガシー `.dhara/settings.json` ファイルは下位互換性のために引き続き読み込まれますが、`.dhara/config.json` が推奨されるプロジェクトレベルの設定ファイルです。
> compatibility, but `.dhara/config.json` is the recommended project-level
> config file.

## ドキュメント

Full documentation is at **[dhara.zosma.ai](https://dhara.zosma.ai)**.

- [Getting Started Guide](docs/getting-started/index.mdx)
- [Writing Your First Extension](docs/guides/write-first-extension.mdx)
- [Architecture Overview](spec/architecture.md)
- [Extension Protocol Spec](spec/extension-protocol.md)
- [Session Format](spec/session-format.md)
- [Roadmap](spec/roadmap.md)

## アーキテクチャ

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

## プロジェクトステータス

Dhara は活発に開発中です。フェーズ 0～3（仕様、コア、標準ライブラリ、CLI）は完了。現在はドキュメント、拡張エコシステム、リリース準備に注力しています。
complete. Current work focuses on documentation, extension ecosystem, and launch prep.

See [spec/roadmap.md](spec/roadmap.md) for details.

## コントリビューション

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## ライセンス

MIT — see [LICENSE](LICENSE). Spec documents are CC-BY-4.0 — see [LICENSE-SPEC](LICENSE-SPEC.md).

Built with ❤️ by [Zosma AI](https://zosma.ai).
