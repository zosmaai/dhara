<p align="center">
  <img src="assets/dhara-logo.svg" width="120" height="120" alt="Dhara logo">
</p>

<h1 align="center">Dhara</h1>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh.md">中文</a> | <a href="./README.es.md">Español</a> | <a href="./README.ja.md">日本語</a> | <a href="./README.de.md">Deutsch</a> | <a href="./README.fr.md">Français</a> | **Português** | <a href="./README.ru.md">Русский</a> | <a href="./README.ko.md">한국어</a> | [हिंदी](./README.hi.md)
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

Dhara (धारा, "fluxo" em sânscrito) é o motor que alimenta agentes de codificação de IA. Ele fornece o loop do agente, gerenciamento de ferramentas, persistência de sessão e protocolo de extensão — sem estar vinculado a nenhum provedor LLM, framework de UI ou linguagem de programação.
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

## Recursos

- **🔄 Agent Loop** — Ciclo LLM → ferramenta → LLM com streaming, cancelamento e recuperação de erros
- **🔌 Extension Protocol** — Protocolo de fio JSON-RPC 2.0. Escreva extensões em qualquer idioma
- **📦 20+ LLM Providers** — 20+ provedores LLM: OpenAI, Anthropic, Google, Mistral, Groq, DeepSeek, Bedrock e mais via pi-ai
- **🛡️ Capability Sandbox** — Declare o que as ferramentas precisam. Bloqueie todo o resto.
- **💾 Session Persistence** — Formato JSONL somente anexação. Retome conversas entre reinicializações.
- **🖥️ TUI + REPL** — TUI em tela cheia com realce de sintaxe, ou REPL baseado em linhas
- **📝 Context Files** — AGENTS.md / CLAUDE.md carregamento automático por projeto
- **🔧 Extensions** — Qualquer idioma, qualquer ferramenta, qualquer hook. Extensões são subprocessos, não chamadas de função.

## Início Rápido

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

## Configurar um Provedor

Dhara precisa de um provedor LLM para funcionar. Existem duas maneiras:

### Opção 1: Configuração interativa (recomendada)

Execute `/login` dentro do TUI para configurar um provedor interativamente:

1. Inicie `dhara` para entrar no TUI
2. Digite `/login`
3. Escolha **API Key** como tipo de autenticação
4. Selecione seu provedor na lista
5. Digite sua chave API (mascarada com caracteres de marcador)

Sua chave API é armazenada com segurança em `~/.dhara/config.json`.

### Opção 2: Flags CLI / variáveis de ambiente

Defina a variável de ambiente correspondente e use `--provider`:

```bash
export OPENAI_API_KEY="sk-..."
dhara --provider openai --model gpt-4o

export ANTHROPIC_API_KEY="sk-ant-..."
dhara --provider anthropic --model claude-sonnet-4-20250514
```

## Provedores

Dhara suporta 20+ provedores LLM. Provedores integrados (sem dependências extras):
`openai`, `anthropic`, `opencode-go`.

Provedores adicionais através da integração [pi-ai](https://github.com/earendil-works/pi-mono).
Defina a variável de ambiente correspondente e use `--provider`:

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

## Ferramentas Padrão

Dhara vem com 6 ferramentas essenciais. Todo o resto é uma extensão.

| Tool | Description | Capability |
|---|---|---|
| `read` | Read file contents | `filesystem:read` |
| `write` | Create/overwrite files | `filesystem:write` |
| `edit` | Surgical text replacement | `filesystem:read`, `filesystem:write` |
| `ls` | Directory listing | `filesystem:read` |
| `grep` | Pattern search across files | `filesystem:read` |
| `bash` | Shell command execution | `process:spawn` |

Ferramentas de rede (web fetch, web search), ferramentas de banco de dados, operações git — tudo pertence às **extensões**.

## Extensões

Extensões se comunicam via **JSON-RPC 2.0 sobre stdin/stdout**. Qualquer idioma funciona.

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

Instalação: copie para `~/.dhara/extensions/my-extension/` com um `manifest.json`.

## Configuração

Dhara usa um sistema de configuração em dois níveis:

- **Global**: `~/.dhara/config.json` — configurações para todos os projetos
- **Projeto**: `.dhara/config.json` na raiz do seu projeto — substitui o global

A configuração do projeto tem precedência sobre a global. Flags CLI substituem ambos.

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

> **Nota**: Arquivos `.dhara/settings.json` legados ainda são carregados para compatibilidade retrógrada, mas `.dhara/config.json` é o arquivo de configuração recomendado em nível de projeto.
> compatibility, but `.dhara/config.json` is the recommended project-level
> config file.

## Documentação

Full documentation is at **[dhara.zosma.ai](https://dhara.zosma.ai)**.

- [Getting Started Guide](docs/getting-started/index.mdx)
- [Writing Your First Extension](docs/guides/write-first-extension.mdx)
- [Architecture Overview](spec/architecture.md)
- [Extension Protocol Spec](spec/extension-protocol.md)
- [Session Format](spec/session-format.md)
- [Roadmap](spec/roadmap.md)

## Arquitetura

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

## Status do Projeto

Dhara está em desenvolvimento ativo. As fases 0–3 (Especificação, Núcleo, Biblioteca Padrão, CLI) estão completas. O trabalho atual foca em documentação, ecossistema de extensões e preparação para lançamento.
complete. Current work focuses on documentation, extension ecosystem, and launch prep.

See [spec/roadmap.md](spec/roadmap.md) for details.

## Contribuir

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Licença

MIT — see [LICENSE](LICENSE). Spec documents are CC-BY-4.0 — see [LICENSE-SPEC](LICENSE-SPEC.md).

Built with ❤️ by [Zosma AI](https://zosma.ai).
