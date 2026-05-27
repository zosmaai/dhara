<p align="center">
  <img src="assets/dhara-logo.svg" width="120" height="120" alt="Dhara logo">
</p>

<h1 align="center">Dhara</h1>

<p align="center">
  [English](./README.md) | [中文](./README.zh.md) | [Español](./README.es.md) | [日本語](./README.ja.md) | [Deutsch](./README.de.md) | [Français](./README.fr.md) | [Português](./README.pt.md) | [Русский](./README.ru.md) | [한국어](./README.ko.md) | **हिंदी**
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

Dhara (धारा) वह इंजन है जो AI कोडिंग एजेंटों को शक्ति प्रदान करता है। यह एजेंट लूप, टूल प्रबंधन, सत्र स्थिरता और एक्सटेंशन प्रोटोकॉल प्रदान करता है — बिना किसी LLM प्रदाता, UI फ्रेमवर्क या प्रोग्रामिंग भाषा से बंधे हुए।
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

## विशेषताएँ

- **🔄 Agent Loop** — LLM → टूल → LLM चक्र स्ट्रीमिंग, रद्दीकरण और त्रुटि पुनर्प्राप्ति के साथ
- **🔌 Extension Protocol** — JSON-RPC 2.0 वायर प्रोटोकॉल। किसी भी भाषा में एक्सटेंशन लिखें
- **📦 20+ LLM Providers** — 20+ LLM प्रदाता: OpenAI, Anthropic, Google, Mistral, Groq, DeepSeek, Bedrock और अधिक pi-ai के माध्यम से
- **🛡️ Capability Sandbox** — घोषित करें कि टूल को क्या चाहिए। बाकी सब कुछ ब्लॉक करें।
- **💾 Session Persistence** — केवल-जोड़ें JSONL प्रारूप। रीस्टार्ट के बीच बातचीत फिर से शुरू करें।
- **🖥️ TUI + REPL** — सिंटैक्स हाइलाइटिंग के साथ फुल-स्क्रीन TUI, या लाइन-आधारित REPL
- **📝 Context Files** — AGENTS.md / CLAUDE.md प्रति प्रोजेक्ट ऑटो-लोडिंग
- **🔧 Extensions** — कोई भी भाषा, कोई भी टूल, कोई भी हुक। एक्सटेंशन सबप्रोसेस हैं, फंक्शन कॉल नहीं।

## त्वरित शुरुआत

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

## प्रदाता कॉन्फ़िगर करें

Dhara को कार्य करने के लिए LLM प्रदाता की आवश्यकता है। दो तरीके हैं:

### विकल्प 1: इंटरैक्टिव सेटअप (अनुशंसित)

प्रदाता को इंटरैक्टिव रूप से कॉन्फ़िगर करने के लिए TUI के अंदर `/login` चलाएँ:

1. TUI में प्रवेश करने के लिए `dhara` लॉन्च करें
2. `/login` टाइप करें
3. प्रमाणीकरण प्रकार के रूप में **API Key** चुनें
4. सूची से अपना प्रदाता चुनें
5. अपनी API कुंजी दर्ज करें (बुलेट वर्णों से मास्क की गई)

आपकी API कुंजी `~/.dhara/config.json` में सुरक्षित रूप से संग्रहीत है।

### विकल्प 2: CLI फ़्लैग / पर्यावरण चर

संबंधित पर्यावरण चर सेट करें और `--provider` का उपयोग करें:

```bash
export OPENAI_API_KEY="sk-..."
dhara --provider openai --model gpt-4o

export ANTHROPIC_API_KEY="sk-ant-..."
dhara --provider anthropic --model claude-sonnet-4-20250514
```

## प्रदाता

Dhara 20+ LLM प्रदाताओं का समर्थन करता है। अंतर्निहित प्रदाता (कोई अतिरिक्त निर्भरता नहीं):
`openai`, `anthropic`, `opencode-go`.

[pi-ai](https://github.com/earendil-works/pi-mono) एकीकरण के माध्यम से अतिरिक्त प्रदाता।
संबंधित पर्यावरण चर सेट करें और `--provider` का उपयोग करें:

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

## मानक उपकरण

Dhara 6 आवश्यक उपकरणों के साथ आता है। बाकी सब कुछ एक एक्सटेंशन है।

| Tool | Description | Capability |
|---|---|---|
| `read` | Read file contents | `filesystem:read` |
| `write` | Create/overwrite files | `filesystem:write` |
| `edit` | Surgical text replacement | `filesystem:read`, `filesystem:write` |
| `ls` | Directory listing | `filesystem:read` |
| `grep` | Pattern search across files | `filesystem:read` |
| `bash` | Shell command execution | `process:spawn` |

नेटवर्क उपकरण (वेब फ़ेच, वेब सर्च), डेटाबेस उपकरण, git संचालन — सब कुछ **एक्सटेंशन** में आता है।

## एक्सटेंशन

एक्सटेंशन **stdin/stdout पर JSON-RPC 2.0** के माध्यम से संचार करते हैं। कोई भी भाषा काम करती है।

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

स्थापना: `manifest.json` के साथ `~/.dhara/extensions/my-extension/` में कॉपी करें।

## कॉन्फ़िगरेशन

Dhara दो-स्तरीय कॉन्फ़िगरेशन सिस्टम का उपयोग करता है:

- **वैश्विक**: `~/.dhara/config.json` — सभी प्रोजेक्ट के लिए सेटिंग्स
- **प्रोजेक्ट**: `.dhara/config.json` आपके प्रोजेक्ट रूट में — वैश्विक को ओवरराइड करता है

प्रोजेक्ट कॉन्फ़िगरेशन वैश्विक पर प्राथमिकता लेता है। CLI फ़्लैग दोनों को ओवरराइड करते हैं।

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

> **नोट**: लिगेसी `.dhara/settings.json` फ़ाइलें अभी भी पिछड़ी संगतता के लिए लोड की जाती हैं, लेकिन `.dhara/config.json` अनुशंसित प्रोजेक्ट-स्तरीय कॉन्फ़िगरेशन फ़ाइल है।
> compatibility, but `.dhara/config.json` is the recommended project-level
> config file.

## दस्तावेज़ीकरण

Full documentation is at **[dhara.zosma.ai](https://dhara.zosma.ai)**.

- [Getting Started Guide](docs/getting-started/index.mdx)
- [Writing Your First Extension](docs/guides/write-first-extension.mdx)
- [Architecture Overview](spec/architecture.md)
- [Extension Protocol Spec](spec/extension-protocol.md)
- [Session Format](spec/session-format.md)
- [Roadmap](spec/roadmap.md)

## आर्किटेक्चर

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

## परियोजना स्थिति

Dhara सक्रिय विकास में है। चरण 0–3 (विनिर्देश, कोर, मानक पुस्तकालय, CLI) पूर्ण हैं। वर्तमान कार्य दस्तावेज़ीकरण, एक्सटेंशन इकोसिस्टम और लॉन्च तैयारी पर केंद्रित है।
complete. Current work focuses on documentation, extension ecosystem, and launch prep.

See [spec/roadmap.md](spec/roadmap.md) for details.

## योगदान

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## लाइसेंस

MIT — see [LICENSE](LICENSE). Spec documents are CC-BY-4.0 — see [LICENSE-SPEC](LICENSE-SPEC.md).

Built with ❤️ by [Zosma AI](https://zosma.ai).
