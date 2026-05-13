# web-tools

Dhara extension that fetches URLs and searches the web.

**Demonstrates**: Network extensions with `network:outbound` capability.

## Tools

| Tool | Description |
|---|---|
| `web_fetch` | Fetch URL content with configurable max length |
| `web_search` | Web search (stub — needs API key for real backend) |

## Install

```bash
cp -r examples/web-tools-extension ~/.dhara/extensions/web-tools
```

## Usage

```bash
dhara "Fetch https://example.com and summarize it"
```

## Why This Is an Extension

`web_fetch` and `web_search` are NOT in Dhara's standard library because
network tools require API keys, rate limiting, and backend services —
perfectly suited for extensions.
