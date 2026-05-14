# dhara-extension-rs

Rust SDK for building [Dhara](https://github.com/zosmaai/dhara) extensions.

## Add to Cargo.toml

```toml
[dependencies]
dhara-extension = "0.1"
```

## Quick Start

```rust
use dhara_extension::Extension;
use dhara_extension::types::{ToolResult, ContentBlock};
use serde_json::json;

fn main() {
    Extension::new("hello-rust", "1.0.0")
        .description("A Rust extension for Dhara")
        .tool(
            "hello",
            "Greet someone",
            json!({
                "type": "object",
                "properties": {
                    "name": { "type": "string" }
                }
            }),
            |input| {
                let name = input["name"].as_str().unwrap_or("World");
                ToolResult {
                    content: vec![ContentBlock {
                        block_type: "text".to_string(),
                        text: Some(format!("Hello, {name}!")),
                    }],
                    is_error: None,
                }
            },
        )
        .run()
        .expect("Extension failed");
}
```

## Protocol

See the [Dhara Extension Protocol](https://github.com/zosmaai/dhara/blob/main/spec/extension-protocol.md).
