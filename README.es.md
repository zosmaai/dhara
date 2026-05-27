<p align="center">
  <img src="assets/dhara-logo.svg" width="120" height="120" alt="Dhara logo">
</p>

<h1 align="center">Dhara</h1>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh.md">中文</a> | **Español** | <a href="./README.ja.md">日本語</a> | <a href="./README.de.md">Deutsch</a> | <a href="./README.fr.md">Français</a> | <a href="./README.pt.md">Português</a> | <a href="./README.ru.md">Русский</a> | <a href="./README.ko.md">한국어</a> | [हिंदी](./README.hi.md)
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

Dhara (धारा, "flujo" en sánscrito) es el motor que impulsa agentes de codificación de IA. Proporciona el bucle del agente, gestión de herramientas, persistencia de sesiones y protocolo de extensión — sin estar atado a ningún proveedor de LLM, framework de UI o lenguaje de programación.
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

## Características

- **🔄 Agent Loop** — Ciclo LLM → herramienta → LLM con transmisión, cancelación y recuperación de errores
- **🔌 Extension Protocol** — Protocolo por cable JSON-RPC 2.0. Escribe extensiones en cualquier idioma
- **📦 20+ LLM Providers** — 20+ proveedores LLM: OpenAI, Anthropic, Google, Mistral, Groq, DeepSeek, Bedrock y más vía pi-ai
- **🛡️ Capability Sandbox** — Declara qué necesitan las herramientas. Bloquea todo lo demás.
- **💾 Session Persistence** — Formato JSONL de solo añadidura. Reanuda conversaciones entre reinicios.
- **🖥️ TUI + REPL** — TUI de pantalla completa con resaltado de sintaxis, o REPL basado en líneas
- **📝 Context Files** — AGENTS.md / CLAUDE.md con carga automática por proyecto
- **🔧 Extensions** — Cualquier idioma, cualquier herramienta, cualquier gancho. Las extensiones son subprocesos, no llamadas a funciones.

## Inicio Rápido

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

## Configurar un Proveedor

Dhara necesita un proveedor LLM para funcionar. Hay dos formas:

### Opción 1: Configuración interactiva (recomendada)

Ejecuta `/login` dentro del TUI para configurar un proveedor interactivamente:

1. Inicia `dhara` para entrar al TUI
2. Escribe `/login`
3. Elige **API Key** como tipo de autenticación
4. Selecciona tu proveedor de la lista
5. Ingresa tu clave API (enmascarada con caracteres de viñeta)

Tu clave API se almacena de forma segura en `~/.dhara/config.json`.

### Opción 2: Banderas CLI / variables de entorno

Configura la variable de entorno correspondiente y usa `--provider`:

```bash
export OPENAI_API_KEY="sk-..."
dhara --provider openai --model gpt-4o

export ANTHROPIC_API_KEY="sk-ant-..."
dhara --provider anthropic --model claude-sonnet-4-20250514
```

## Proveedores

Dhara soporta 20+ proveedores LLM. Proveedores integrados (sin dependencias extra):
`openai`, `anthropic`, `opencode-go`.

Más proveedores a través de la integración [pi-ai](https://github.com/earendil-works/pi-mono).
Configura la variable de entorno correspondiente y usa `--provider`:

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

## Herramientas Estándar

Dhara incluye 6 herramientas esenciales. Todo lo demás es una extensión.

| Tool | Description | Capability |
|---|---|---|
| `read` | Read file contents | `filesystem:read` |
| `write` | Create/overwrite files | `filesystem:write` |
| `edit` | Surgical text replacement | `filesystem:read`, `filesystem:write` |
| `ls` | Directory listing | `filesystem:read` |
| `grep` | Pattern search across files | `filesystem:read` |
| `bash` | Shell command execution | `process:spawn` |

Herramientas de red (web fetch, web search), herramientas de base de datos, operaciones git — todo pertenece a **extensiones**.

## Extensiones

Las extensiones se comunican mediante **JSON-RPC 2.0 sobre stdin/stdout**. Cualquier idioma funciona.

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

Instalación: copia a `~/.dhara/extensions/my-extension/` con un `manifest.json`.

## Configuración

Dhara usa un sistema de configuración de dos niveles:

- **Global**: `~/.dhara/config.json` — ajustes para todos los proyectos
- **Proyecto**: `.dhara/config.json` en la raíz de tu proyecto — anula lo global

La configuración del proyecto tiene prioridad sobre la global. Las banderas CLI anulan ambas.

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

> **Nota**: Los archivos heredados `.dhara/settings.json` aún se cargan por compatibilidad retrospectiva, pero `.dhara/config.json` es el archivo de configuración recomendado a nivel de proyecto.
> compatibility, but `.dhara/config.json` is the recommended project-level
> config file.

## Documentación

Full documentation is at **[dhara.zosma.ai](https://dhara.zosma.ai)**.

- [Getting Started Guide](docs/getting-started/index.mdx)
- [Writing Your First Extension](docs/guides/write-first-extension.mdx)
- [Architecture Overview](spec/architecture.md)
- [Extension Protocol Spec](spec/extension-protocol.md)
- [Session Format](spec/session-format.md)
- [Roadmap](spec/roadmap.md)

## Arquitectura

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

## Estado del Proyecto

Dhara está en desarrollo activo. Las fases 0–3 (Especificación, Núcleo, Biblioteca Estándar, CLI) están completas. El trabajo actual se centra en documentación, ecosistema de extensiones y preparación para el lanzamiento.
complete. Current work focuses on documentation, extension ecosystem, and launch prep.

See [spec/roadmap.md](spec/roadmap.md) for details.

## Contribuir

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Licencia

MIT — see [LICENSE](LICENSE). Spec documents are CC-BY-4.0 — see [LICENSE-SPEC](LICENSE-SPEC.md).

Built with ❤️ by [Zosma AI](https://zosma.ai).
