/// Dhara Extension main loop.
///
/// Handles JSON-RPC stdin/stdout protocol with automatic
/// tool dispatch and lifecycle management.

use std::cell::Cell;
use std::io::{self, BufRead, Write};
use serde_json::{json, Value};
use crate::protocol::{create_error, create_success, serialize_message};
use crate::types::*;

type ToolHandler = Box<dyn Fn(Value) -> ToolResult>;

/// A Dhara extension.
pub struct Extension {
    name: String,
    version: String,
    description: String,
    tools: Vec<(ToolDefinition, ToolHandler)>,
    shutdown: Cell<bool>,
}

impl Extension {
    /// Create a new extension.
    pub fn new(name: &str, version: &str) -> Self {
        Self {
            name: name.to_string(),
            version: version.to_string(),
            description: String::new(),
            tools: Vec::new(),
            shutdown: Cell::new(false),
        }
    }

    /// Set the extension description.
    pub fn description(mut self, desc: &str) -> Self {
        self.description = desc.to_string();
        self
    }

    /// Register a tool.
    pub fn tool<F>(mut self, name: &str, description: &str, params: Value, handler: F) -> Self
    where
        F: Fn(Value) -> ToolResult + 'static,
    {
        let def = ToolDefinition {
            name: name.to_string(),
            description: description.to_string(),
            parameters: params,
            capabilities: None,
        };
        self.tools.push((def, Box::new(handler)));
        self
    }

    /// Run the main loop (read stdin, write stdout).
    pub fn run(&self) -> io::Result<()> {
        let stdin = io::stdin();
        let mut stdout = io::stdout();

        for line in stdin.lock().lines() {
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }

            let response = self.dispatch(&line);
            if let Some(resp) = response {
                writeln!(&stdout, "{resp}")?;
                stdout.flush()?;
            }

            if self.shutdown.get() {
                break;
            }
        }

        Ok(())
    }

    fn dispatch(&self, raw: &str) -> Option<String> {
        let data: Value = serde_json::from_str(raw).ok()?;
        let method = data.get("method")?.as_str()?;
        let msg_id = data.get("id").cloned();

        let parse_id = |v: &Value| -> Id {
            match v {
                Value::Number(n) => Id::Number(n.as_u64().unwrap_or(0)),
                Value::String(s) => Id::String(s.clone()),
                _ => Id::Number(0),
            }
        };

        match method {
            "initialize" => {
                let id = msg_id.as_ref().map(parse_id).unwrap_or(Id::Number(0));
                let result = InitializeResult {
                    protocol_version: "0.1.0".to_string(),
                    name: self.name.clone(),
                    version: self.version.clone(),
                    description: self.description.clone(),
                    tools: self.tools.iter().map(|(def, _)| def.clone()).collect(),
                };
                Some(serialize_message(&create_success(id, serde_json::to_value(result).ok()?)))
            }

            "tools/execute" => {
                let id = msg_id.as_ref().map(parse_id).unwrap_or(Id::Number(0));
                let params = data.get("params")?;
                let tool_name = params.get("toolName")?.as_str()?;
                let input = params.get("input").cloned().unwrap_or(json!({}));

                for (def, handler) in &self.tools {
                    if def.name == tool_name {
                        let result = handler(input);
                        return Some(serialize_message(&create_success(
                            id,
                            serde_json::to_value(result).ok()?,
                        )));
                    }
                }

                Some(serialize_message(&create_error(
                    id,
                    error_codes::TOOL_NOT_FOUND,
                    &format!("Tool not found: {tool_name}"),
                )))
            }

            "shutdown" => {
                self.shutdown.set(true);
                let id = msg_id.as_ref().map(parse_id).unwrap_or(Id::Number(0));
                Some(serialize_message(&create_success(id, json!({"status": "ok"}))))
            }

            _ => {
                let id = msg_id.as_ref().map(parse_id).unwrap_or(Id::Number(0));
                Some(serialize_message(&create_error(
                    id,
                    error_codes::METHOD_NOT_FOUND,
                    &format!("Unknown method: {method}"),
                )))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_initialize_response() {
        let ext = Extension::new("test-ext", "1.0.0")
            .description("A test extension")
            .tool("echo", "Echo input", json!({"type":"object"}), |input| {
                ToolResult {
                    content: vec![ContentBlock {
                        block_type: "text".to_string(),
                        text: Some(input["message"].as_str().unwrap_or("").to_string()),
                    }],
                    is_error: None,
                }
            });

        let resp = ext.dispatch(r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);
        assert!(resp.is_some());
        let data: Value = serde_json::from_str(&resp.unwrap()).unwrap();
        assert_eq!(data["result"]["name"], "test-ext");
        assert_eq!(data["result"]["tools"][0]["name"], "echo");
    }

    #[test]
    fn test_tool_execution() {
        let ext = Extension::new("test-ext", "1.0.0")
            .tool("echo", "Echo input", json!({}), |input| {
                ToolResult {
                    content: vec![ContentBlock {
                        block_type: "text".to_string(),
                        text: Some(input["message"].as_str().unwrap_or("").to_string()),
                    }],
                    is_error: None,
                }
            });

        let resp = ext.dispatch(
            r#"{"jsonrpc":"2.0","id":2,"method":"tools/execute",
               "params":{"toolName":"echo","input":{"message":"hello"}}}"#,
        );
        assert!(resp.is_some());
        let data: Value = serde_json::from_str(&resp.unwrap()).unwrap();
        assert_eq!(data["result"]["content"][0]["text"], "hello");
    }

    #[test]
    fn test_unknown_tool() {
        let ext = Extension::new("test-ext", "1.0.0");
        let resp = ext.dispatch(
            r#"{"jsonrpc":"2.0","id":3,"method":"tools/execute",
               "params":{"toolName":"nonexistent","input":{}}}"#,
        );
        assert!(resp.is_some());
        let data: Value = serde_json::from_str(&resp.unwrap()).unwrap();
        assert!(data["error"].is_object());
    }

    #[test]
    fn test_shutdown() {
        let ext = Extension::new("test-ext", "1.0.0");
        let resp = ext.dispatch(r#"{"jsonrpc":"2.0","id":4,"method":"shutdown"}"#);
        assert!(resp.is_some());
        assert!(ext.shutdown.get());
    }
}
