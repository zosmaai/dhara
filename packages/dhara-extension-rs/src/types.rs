/// JSON-RPC 2.0 protocol types for the Dhara extension protocol.

use serde::{Deserialize, Serialize};
use serde_json::Value;

// ── Request / Response ──────────────────────────────────────────────────────────

/// A JSON-RPC 2.0 request from the core.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<Id>,
    pub method: String,
    #[serde(default, skip_serializing_if = "Value::is_null")]
    pub params: Value,
}

/// A JSON-RPC 2.0 success response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcSuccess {
    pub jsonrpc: String,
    pub id: Id,
    pub result: Value,
}

/// A JSON-RPC 2.0 error response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcErrorResponse {
    pub jsonrpc: String,
    pub id: Id,
    pub error: JsonRpcError,
}

/// JSON-RPC error object.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

/// A JSON-RPC ID (number or string).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Id {
    Number(u64),
    String(String),
}

/// Any JSON-RPC message.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Message {
    Request(JsonRpcRequest),
    Success(JsonRpcSuccess),
    Error(JsonRpcErrorResponse),
}

// ── Error codes ─────────────────────────────────────────────────────────────────

pub use error_codes::*;

pub mod error_codes {
    pub const PARSE_ERROR: i32 = -32700;
    pub const INVALID_REQUEST: i32 = -32600;
    pub const METHOD_NOT_FOUND: i32 = -32601;
    pub const INVALID_PARAMS: i32 = -32602;
    pub const INTERNAL_ERROR: i32 = -32603;
    pub const TOOL_EXECUTION_ERROR: i32 = -32000;
    pub const TOOL_NOT_FOUND: i32 = -32001;
    pub const CAPABILITY_DENIED: i32 = -32002;
    pub const EXTENSION_CRASHED: i32 = -32003;
    pub const HANDSHAKE_TIMEOUT: i32 = -32004;
}

// ── Dhara protocol types ────────────────────────────────────────────────────────

/// Tool definition returned during initialize handshake.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub parameters: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub capabilities: Option<Vec<String>>,
}

/// Initialize result sent to core.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitializeResult {
    pub protocol_version: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tools: Vec<ToolDefinition>,
}

/// Tool execution result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub content: Vec<ContentBlock>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_error: Option<bool>,
}

/// A content block in a tool result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentBlock {
    #[serde(rename = "type")]
    pub block_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}
