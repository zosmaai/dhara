<p align="center">
  <img src="assets/dhara-logo.svg" width="120" height="120" alt="Dhara logo">
</p>

<h1 align="center">Dhara</h1>

<p align="center">
  [English](./README.md) | **中文** | [Español](./README.es.md) | [日本語](./README.ja.md) | [Deutsch](./README.de.md) | [Français](./README.fr.md) | [Português](./README.pt.md) | [Русский](./README.ru.md) | [한국어](./README.ko.md) | [हिंदी](./README.hi.md)
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

Dhara（धारा，梵语中意为"流动"）是驱动 AI 编码代理的引擎。它提供代理循环、工具管理、会话持久化和扩展协议 — 不依赖于任何 LLM 提供商、UI 框架或编程语言。
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

## 功能特性

- **🔄 Agent Loop** — LLM → 工具 → LLM 循环，支持流式传输、取消和错误恢复
- **🔌 Extension Protocol** — JSON-RPC 2.0 有线协议。用任何语言编写扩展
- **📦 20+ LLM Providers** — OpenAI、Anthropic、Google、Mistral、Groq、DeepSeek、Bedrock 等 20+ LLM 提供商，通过 pi-ai 集成
- **🛡️ Capability Sandbox** — 声明工具需要的能力。阻止其他一切。
- **💾 Session Persistence** — 仅追加的 JSONL 格式。在重启间恢复对话。
- **🖥️ TUI + REPL** — 全屏终端 UI（语法高亮）或基于行的 REPL
- **📝 Context Files** — AGENTS.md / CLAUDE.md 按项目自动加载
- **🔧 Extensions** — 任何语言、任何工具、任何钩子。扩展是子进程，而不是函数调用。

## 快速开始

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

## 配置提供商

Dhara 需要 LLM 提供商才能运行。有两种方式：

### 选项 1：交互式设置（推荐）

在 TUI 中运行 `/login` 以交互方式配置提供商：

1. 运行 `dhara` 进入 TUI
2. 输入 `/login`
3. 选择 **API Key** 作为认证类型
4. 从列表中选择你的提供商
5. 输入你的 API 密钥（使用圆点字符掩码显示）

你的 API 密钥安全地存储在 `~/.dhara/config.json` 中。

### 选项 2：CLI 标志 / 环境变量

设置相应的环境变量并使用 `--provider`：

```bash
export OPENAI_API_KEY="sk-..."
dhara --provider openai --model gpt-4o

export ANTHROPIC_API_KEY="sk-ant-..."
dhara --provider anthropic --model claude-sonnet-4-20250514
```

## 提供商

Dhara 支持 20+ 个 LLM 提供商。内置提供商（无需额外依赖）：
`openai`, `anthropic`, `opencode-go`.

通过 [pi-ai](https://github.com/earendil-works/pi-mono) 集成获取更多提供商。
设置相应的环境变量并使用 `--provider`：

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

## 标准工具

Dhara 内置 6 个基本工具。其他都是扩展。

| Tool | Description | Capability |
|---|---|---|
| `read` | Read file contents | `filesystem:read` |
| `write` | Create/overwrite files | `filesystem:write` |
| `edit` | Surgical text replacement | `filesystem:read`, `filesystem:write` |
| `ls` | Directory listing | `filesystem:read` |
| `grep` | Pattern search across files | `filesystem:read` |
| `bash` | Shell command execution | `process:spawn` |

网络工具（网页获取、网页搜索）、数据库工具、git 操作 — 全部属于**扩展**。

## 扩展

扩展通过 **stdin/stdout 上的 JSON-RPC 2.0** 进行通信。任何语言都可以。

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

安装：复制到 `~/.dhara/extensions/my-extension/` 并包含 `manifest.json`。

## 配置

Dhara 使用双层配置系统：

- **全局**：`~/.dhara/config.json` — 所有项目的设置
- **项目**：`.dhara/config.json` 在你的项目根目录 — 覆盖全局设置

项目配置优先于全局配置。CLI 标志覆盖两者。

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

> **注意**：旧版 `.dhara/settings.json` 文件仍会为向后兼容而加载，但 `.dhara/config.json` 是推荐的项目级配置文件。
> compatibility, but `.dhara/config.json` is the recommended project-level
> config file.

## 文档

Full documentation is at **[dhara.zosma.ai](https://dhara.zosma.ai)**.

- [Getting Started Guide](docs/getting-started/index.mdx)
- [Writing Your First Extension](docs/guides/write-first-extension.mdx)
- [Architecture Overview](spec/architecture.md)
- [Extension Protocol Spec](spec/extension-protocol.md)
- [Session Format](spec/session-format.md)
- [Roadmap](spec/roadmap.md)

## 架构

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

## 项目状态

Dhara 正在积极开发中。阶段 0–3（规范、核心、标准库、CLI）已完成。当前工作重点在文档、扩展生态和发布准备。
complete. Current work focuses on documentation, extension ecosystem, and launch prep.

See [spec/roadmap.md](spec/roadmap.md) for details.

## 贡献

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 许可证

MIT — see [LICENSE](LICENSE). Spec documents are CC-BY-4.0 — see [LICENSE-SPEC](LICENSE-SPEC.md).

Built with ❤️ by [Zosma AI](https://zosma.ai).
