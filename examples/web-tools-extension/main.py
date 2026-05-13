#!/usr/bin/env python3
"""
web-tools — Dhara extension for fetching URLs and searching the web.

Registers two tools:
  - web_fetch:  Fetches content from a URL
  - web_search: Searches the web (stub, requires API key)

This demonstrates that network tools belong in extensions, not the
standard library. Install by copying to ~/.dhara/extensions/web-tools/.
"""

import json
import sys
import urllib.request
import urllib.error
from urllib.parse import urlencode

EXTENSION_NAME = "web-tools"
EXTENSION_VERSION = "1.0.0"

TOOLS = [
    {
        "name": "web_fetch",
        "description": "Fetch content from a URL and return it as plain text",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to fetch",
                },
                "maxLength": {
                    "type": "number",
                    "description": "Maximum characters to return (default: 10000)",
                },
            },
            "required": ["url"],
        },
        "capabilities": ["network:outbound"],
    },
    {
        "name": "web_search",
        "description": "Search the web for information",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query",
                },
                "maxResults": {
                    "type": "number",
                    "description": "Max results (default: 5)",
                },
            },
            "required": ["query"],
        },
        "capabilities": ["network:outbound"],
    },
]


def handle_tool(tool_name, params):
    if tool_name == "web_fetch":
        return handle_web_fetch(params)
    elif tool_name == "web_search":
        return handle_web_search(params)
    else:
        raise ValueError(f"Unknown tool: {tool_name}")


def handle_web_fetch(params):
    url = params.get("url", "")
    max_length = int(params.get("maxLength", 10000))

    if not url.startswith(("http://", "https://")):
        return {
            "content": [{"type": "text", "text": "Error: URL must start with http:// or https://"}],
            "isError": True,
        }

    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Dhara-WebTools/1.0"},
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            content_type = response.headers.get("Content-Type", "")
            if "text" not in content_type and "json" not in content_type and "xml" not in content_type:
                return {
                    "content": [{"type": "text", "text": f"Error: Unsupported content type: {content_type}"}],
                    "isError": True,
                }

            raw = response.read().decode("utf-8", errors="replace")
            text = raw[:max_length]

            if len(raw) > max_length:
                text += f"\n\n... (truncated, original length: {len(raw)} chars)"

            return {
                "content": [{"type": "text", "text": text}],
                "metadata": {
                    "url": url,
                    "status": response.status,
                    "contentType": content_type,
                    "truncated": len(raw) > max_length,
                },
            }

    except urllib.error.HTTPError as e:
        return {
            "content": [{"type": "text", "text": f"HTTP {e.code}: {e.reason}"}],
            "isError": True,
        }
    except urllib.error.URLError as e:
        return {
            "content": [{"type": "text", "text": f"URL Error: {e.reason}"}],
            "isError": True,
        }
    except Exception as e:
        return {
            "content": [{"type": "text", "text": f"Error: {str(e)}"}],
            "isError": True,
        }


def handle_web_search(params):
    query = params.get("query", "")
    max_results = int(params.get("maxResults", 5))

    return {
        "content": [{"type": "text", "text": (
            f"Web search is not configured. To enable it:\n\n"
            f"1. Get a search API key (e.g., from Exa, Perplexity, or SerpAPI)\n"
            f"2. Search backend integrations are available as separate extensions\n\n"
            f"Your query was: {query}\n"
            f"Requested results: {max_results}\n"
        )}],
        "metadata": {
            "query": query,
            "configured": False,
        },
    }


def handle_message(message):
    req = json.loads(message)
    method = req.get("method")
    msg_id = req.get("id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "result": {
                "protocolVersion": "0.1.0",
                "name": EXTENSION_NAME,
                "version": EXTENSION_VERSION,
                "tools": TOOLS,
            },
            "id": msg_id,
        }

    elif method == "tools/execute":
        tool_name = req.get("params", {}).get("toolName")
        params = req.get("params", {}).get("input", {})
        result = handle_tool(tool_name, params)
        return {
            "jsonrpc": "2.0",
            "result": result,
            "id": msg_id,
        }

    elif method == "shutdown":
        response = {
            "jsonrpc": "2.0",
            "result": {"status": "ok"},
            "id": msg_id,
        }
        print(json.dumps(response))
        sys.stdout.flush()
        sys.exit(0)

    else:
        return {
            "jsonrpc": "2.0",
            "error": {"code": -32601, "message": f"Unknown method: {method}"},
            "id": msg_id,
        }


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        response = handle_message(line)
        print(json.dumps(response))
        sys.stdout.flush()


if __name__ == "__main__":
    main()
