<p align="center">
  <img src="assets/dhara-logo.svg" width="120" height="120" alt="Dhara logo">
</p>

<h1 align="center">Dhara</h1>

<p align="center">
  [English](./README.md) | [中文](./README.zh.md) | [Español](./README.es.md) | [日本語](./README.ja.md) | [Deutsch](./README.de.md) | **Français** | [Português](./README.pt.md) | [Русский](./README.ru.md) | [한국어](./README.ko.md) | [हिंदी](./README.hi.md)
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

Dhara (धारा, « flux » en sanskrit) est le moteur qui alimente les agents de codage IA. Il fournit la boucle d'agent, la gestion des outils, la persistance des sessions et le protocole d'extension — sans être lié à un fournisseur LLM, un framework UI ou un langage de programmation.
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

## Fonctionnalités

- **🔄 Agent Loop** — Cycle LLM → outil → LLM avec streaming, annulation et récupération d'erreur
- **🔌 Extension Protocol** — Protocole filaire JSON-RPC 2.0. Écrivez des extensions dans n'importe quelle langue
- **📦 20+ LLM Providers** — 20+ fournisseurs LLM : OpenAI, Anthropic, Google, Mistral, Groq, DeepSeek, Bedrock et plus via pi-ai
- **🛡️ Capability Sandbox** — Déclarez ce dont les outils ont besoin. Bloquez tout le reste.
- **💾 Session Persistence** — Format JSONL append-only. Reprenez les conversations après redémarrage.
- **🖥️ TUI + REPL** — TUI plein écran avec coloration syntaxique, ou REPL en ligne de commande
- **📝 Context Files** — AGENTS.md / CLAUDE.md chargement automatique par projet
- **🔧 Extensions** — N'importe quelle langue, n'importe quel outil, n'importe quel hook. Les extensions sont des sous-processus, pas des appels de fonction.

## Démarrage Rapide

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

## Configurer un Fournisseur

Dhara a besoin d'un fournisseur LLM pour fonctionner. Il y a deux façons :

### Option 1 : Configuration interactive (recommandée)

Exécutez `/login` dans le TUI pour configurer un fournisseur interactivement :

1. Lancez `dhara` pour entrer dans le TUI
2. Tapez `/login`
3. Choisissez **API Key** comme type d'authentification
4. Sélectionnez votre fournisseur dans la liste
5. Entrez votre clé API (masquée avec des caractères de puce)

Votre clé API est stockée en sécurité dans `~/.dhara/config.json`.

### Option 2 : Flags CLI / variables d'environnement

Définissez la variable d'environnement correspondante et utilisez `--provider`:

```bash
export OPENAI_API_KEY="sk-..."
dhara --provider openai --model gpt-4o

export ANTHROPIC_API_KEY="sk-ant-..."
dhara --provider anthropic --model claude-sonnet-4-20250514
```

## Fournisseurs

Dhara supporte 20+ fournisseurs LLM. Fournisseurs intégrés (sans dépendances supplémentaires) :
`openai`, `anthropic`, `opencode-go`.

Fournisseurs supplémentaires via l'intégration [pi-ai](https://github.com/earendil-works/pi-mono).
Définissez la variable d'environnement correspondante et utilisez `--provider`:

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

## Outils Standards

Dhara est livré avec 6 outils essentiels. Tout le reste est une extension.

| Tool | Description | Capability |
|---|---|---|
| `read` | Read file contents | `filesystem:read` |
| `write` | Create/overwrite files | `filesystem:write` |
| `edit` | Surgical text replacement | `filesystem:read`, `filesystem:write` |
| `ls` | Directory listing | `filesystem:read` |
| `grep` | Pattern search across files | `filesystem:read` |
| `bash` | Shell command execution | `process:spawn` |

Outils réseau (web fetch, web search), outils de base de données, opérations git — tout appartient aux **extensions**.

## Extensions

Les extensions communiquent via **JSON-RPC 2.0 sur stdin/stdout**. N'importe quelle langue fonctionne.

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

Installation : copiez dans `~/.dhara/extensions/my-extension/` avec un `manifest.json`.

## Configuration

Dhara utilise un système de configuration à deux niveaux :

- **Global** : `~/.dhara/config.json` — paramètres pour tous les projets
- **Projet** : `.dhara/config.json` à la racine de votre projet — remplace le global

La configuration du projet prime sur la configuration globale. Les flags CLI remplacent les deux.

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

> **Note** : Les fichiers `.dhara/settings.json` hérités sont encore chargés pour la rétrocompatibilité, mais `.dhara/config.json` est le fichier de configuration recommandé au niveau projet.
> compatibility, but `.dhara/config.json` is the recommended project-level
> config file.

## Documentation

Full documentation is at **[dhara.zosma.ai](https://dhara.zosma.ai)**.

- [Getting Started Guide](docs/getting-started/index.mdx)
- [Writing Your First Extension](docs/guides/write-first-extension.mdx)
- [Architecture Overview](spec/architecture.md)
- [Extension Protocol Spec](spec/extension-protocol.md)
- [Session Format](spec/session-format.md)
- [Roadmap](spec/roadmap.md)

## Architecture

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

## Statut du Projet

Dhara est en développement actif. Les phases 0–3 (Spécification, Cœur, Bibliothèque Standard, CLI) sont terminées. Le travail actuel se concentre sur la documentation, l'écosystème d'extensions et la préparation au lancement.
complete. Current work focuses on documentation, extension ecosystem, and launch prep.

See [spec/roadmap.md](spec/roadmap.md) for details.

## Contribuer

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Licence

MIT — see [LICENSE](LICENSE). Spec documents are CC-BY-4.0 — see [LICENSE-SPEC](LICENSE-SPEC.md).

Built with ❤️ by [Zosma AI](https://zosma.ai).
