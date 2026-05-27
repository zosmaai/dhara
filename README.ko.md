<p align="center">
  <img src="assets/dhara-logo.svg" width="120" height="120" alt="Dhara logo">
</p>

<h1 align="center">Dhara</h1>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh.md">中文</a> | <a href="./README.es.md">Español</a> | <a href="./README.ja.md">日本語</a> | <a href="./README.de.md">Deutsch</a> | <a href="./README.fr.md">Français</a> | <a href="./README.pt.md">Português</a> | <a href="./README.ru.md">Русский</a> | **한국어** | [हिंदी](./README.hi.md)
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

Dhara(धारा, 산스크리트어로 "흐름")는 AI 코딩 에이전트를 구동하는 엔진입니다. 에이전트 루프, 도구 관리, 세션 지속성 및 확장 프로토콜을 제공하며 LLM 제공자, UI 프레임워크 또는 프로그래밍 언어에 얽매이지 않습니다.
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

## 기능

- **🔄 Agent Loop** — LLM → 도구 → LLM 사이클, 스트리밍, 취소 및 오류 복구 지원
- **🔌 Extension Protocol** — JSON-RPC 2.0 유선 프로토콜. 모든 언어로 확장 기능 작성 가능
- **📦 20+ LLM Providers** — OpenAI, Anthropic, Google, Mistral, Groq, DeepSeek, Bedrock 등 20+ LLM 제공자 (pi-ai 통해)
- **🛡️ Capability Sandbox** — 도구에 필요한 것을 선언하세요. 나머지는 모두 차단합니다.
- **💾 Session Persistence** — 추가 전용 JSONL 형식. 재시작 간 대화를 재개합니다.
- **🖥️ TUI + REPL** — 구문 강조 기능이 있는 전체 화면 TUI 또는 라인 기반 REPL
- **📝 Context Files** — AGENTS.md / CLAUDE.md 프로젝트별 자동 로딩
- **🔧 Extensions** — 모든 언어, 모든 도구, 모든 훅. 확장 기능은 함수 호출이 아닌 하위 프로세스입니다.

## 빠른 시작

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

## 제공자 구성

Dhara가 작동하려면 LLM 제공자가 필요합니다. 두 가지 방법이 있습니다:

### 옵션 1: 대화형 설정 (권장)

TUI 내에서 `/login`을 실행하여 대화형으로 제공자를 구성하세요:

1. `dhara`를 실행하여 TUI에 진입
2. `/login` 입력
3. 인증 유형으로 **API Key** 선택
4. 목록에서 제공자 선택
5. API 키 입력 (글머리 기호 문자로 마스킹됨)

API 키는 `~/.dhara/config.json`에 안전하게 저장됩니다.

### 옵션 2: CLI 플래그 / 환경 변수

해당 환경 변수를 설정하고 `--provider`를 사용하세요:

```bash
export OPENAI_API_KEY="sk-..."
dhara --provider openai --model gpt-4o

export ANTHROPIC_API_KEY="sk-ant-..."
dhara --provider anthropic --model claude-sonnet-4-20250514
```

## 제공자

Dhara는 20+ LLM 제공자를 지원합니다. 내장 제공자 (추가 종속성 불필요):
`openai`, `anthropic`, `opencode-go`.

[pi-ai](https://github.com/earendil-works/pi-mono) 통합을 통한 추가 제공자.
해당 환경 변수를 설정하고 `--provider`를 사용하세요:

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

## 표준 도구

Dhara는 6가지 필수 도구와 함께 제공됩니다. 나머지는 모두 확장 기능입니다.

| Tool | Description | Capability |
|---|---|---|
| `read` | Read file contents | `filesystem:read` |
| `write` | Create/overwrite files | `filesystem:write` |
| `edit` | Surgical text replacement | `filesystem:read`, `filesystem:write` |
| `ls` | Directory listing | `filesystem:read` |
| `grep` | Pattern search across files | `filesystem:read` |
| `bash` | Shell command execution | `process:spawn` |

네트워크 도구(웹 가져오기, 웹 검색), 데이터베이스 도구, git 작업 — 모두 **확장 기능**에 속합니다.

## 확장 기능

확장 기능은 **stdin/stdout을 통한 JSON-RPC 2.0**으로 통신합니다. 모든 언어에서 작동합니다.

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

설치: `manifest.json`과 함께 `~/.dhara/extensions/my-extension/`에 복사하세요.

## 구성

Dhara는 2계층 구성 시스템을 사용합니다:

- **전역**: `~/.dhara/config.json` — 모든 프로젝트에 대한 설정
- **프로젝트**: `.dhara/config.json`을 프로젝트 루트에 — 전역을 재정의

프로젝트 구성이 전역보다 우선합니다. CLI 플래그는 둘 다 재정의합니다.

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

> **참고**: 레거시 `.dhara/settings.json` 파일은 하위 호환성을 위해 여전히 로드되지만, `.dhara/config.json`이 권장되는 프로젝트 수준 구성 파일입니다.
> compatibility, but `.dhara/config.json` is the recommended project-level
> config file.

## 문서

Full documentation is at **[dhara.zosma.ai](https://dhara.zosma.ai)**.

- [Getting Started Guide](docs/getting-started/index.mdx)
- [Writing Your First Extension](docs/guides/write-first-extension.mdx)
- [Architecture Overview](spec/architecture.md)
- [Extension Protocol Spec](spec/extension-protocol.md)
- [Session Format](spec/session-format.md)
- [Roadmap](spec/roadmap.md)

## 아키텍처

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

## 프로젝트 상태

Dhara는 활발히 개발 중입니다. 페이즈 0–3(명세, 코어, 표준 라이브러리, CLI)이 완료되었습니다. 현재 작업은 문서, 확장 생태계 및 출시 준비에 중점을 두고 있습니다.
complete. Current work focuses on documentation, extension ecosystem, and launch prep.

See [spec/roadmap.md](spec/roadmap.md) for details.

## 기여

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 라이선스

MIT — see [LICENSE](LICENSE). Spec documents are CC-BY-4.0 — see [LICENSE-SPEC](LICENSE-SPEC.md).

Built with ❤️ by [Zosma AI](https://zosma.ai).
