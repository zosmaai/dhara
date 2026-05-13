# dhara-extension-py

Python SDK for building [Dhara](https://github.com/zosmaai/dhara) extensions.

## Installation

```bash
pip install dhara-extension
```

Or install from source:

```bash
cd packages/dhara-extension-py
pip install -e .
```

## Quick Start

Create a file `hello-ext/main.py`:

```python
#!/usr/bin/env python3
"""A simple Dhara extension using the Python SDK."""

from dhara_extension import Extension

ext = Extension(
    name="hello-ext",
    version="1.0.0",
    description="A friendly hello extension",
)

@ext.tool(
    name="hello",
    description="Greet someone by name",
    parameters={
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "Name to greet",
            },
        },
        "required": ["name"],
    },
)
def hello(input_data):
    name = input_data.get("name", "World")
    greeting = f"Hello, {name}! Welcome to Dhara."
    return {
        "content": [
            {"type": "text", "text": greeting},
        ],
    }

@ext.tool(
    name="count",
    description="Count items in a list",
)
def count(input_data):
    items = input_data.get("items", [])
    return {
        "content": [
            {"type": "text", "text": f"Counted {len(items)} items."},
        ],
    }

if __name__ == "__main__":
    ext.run()
```

And a `manifest.json`:

```json
{
    "name": "hello-ext",
    "version": "1.0.0",
    "runtime": {
        "type": "subprocess",
        "command": "python3 main.py",
        "protocol": "json-rpc"
    },
    "provides": {
        "tools": ["hello", "count"]
    },
    "capabilities": []
}
```

## API Reference

### `Extension(name, version, description="", debug=False)`

Main extension class.

- **`tool(name, description, parameters, capabilities)`** — Decorator to register a tool handler
- **`run()`** — Start the JSON-RPC stdin/stdout loop

### `create_extension(name, version, description="")`

Convenience function to create an `Extension` instance.

## Protocol

Extensions communicate with Dhara via JSON-RPC 2.0 over stdin/stdout:

```
→ {"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
← {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"0.1.0","name":"hello-ext","tools":[...]}}

→ {"jsonrpc":"2.0","id":2,"method":"tools/execute",
     "params":{"toolName":"hello","input":{"name":"World"}}}
← {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"Hello, World!"}]}}
```

See the [Dhara Extension Protocol](https://github.com/zosmaai/dhara/blob/main/spec/extension-protocol.md) for details.
