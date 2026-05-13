/// JSON-RPC protocol serialization/deserialization helpers.

use serde_json::Value;
use crate::types::*;

/// Parse a JSON-RPC message from a JSON string.
pub fn parse_message(raw: &str) -> Result<Message, serde_json::Error> {
    serde_json::from_str(raw)
}

/// Serialize a message to a JSON string.
pub fn serialize_message(msg: &Message) -> String {
    serde_json::to_string(msg).unwrap_or_default()
}

/// Create a success response.
pub fn create_success(id: Id, result: Value) -> Message {
    Message::Success(JsonRpcSuccess {
        jsonrpc: "2.0".to_string(),
        id,
        result,
    })
}

/// Create an error response.
pub fn create_error(id: Id, code: i32, message: &str) -> Message {
    Message::Error(JsonRpcErrorResponse {
        jsonrpc: "2.0".to_string(),
        id,
        error: JsonRpcError {
            code,
            message: message.to_string(),
            data: None,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_parse_request() {
        let raw = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#;
        let msg = parse_message(raw).unwrap();
        match msg {
            Message::Request(req) => {
                assert_eq!(req.method, "initialize");
                assert_eq!(req.id, Some(Id::Number(1)));
            }
            _ => panic!("Expected request"),
        }
    }

    #[test]
    fn test_parse_success() {
        let raw = r#"{"jsonrpc":"2.0","id":1,"result":{"status":"ok"}}"#;
        let msg = parse_message(raw).unwrap();
        match msg {
            Message::Success(s) => {
                assert_eq!(s.result, json!({"status": "ok"}));
            }
            _ => panic!("Expected success"),
        }
    }

    #[test]
    fn test_serialize_create_success() {
        let msg = create_success(Id::Number(1), json!({"ok": true}));
        let raw = serialize_message(&msg);
        let parsed = parse_message(&raw).unwrap();
        match parsed {
            Message::Success(s) => {
                assert_eq!(s.result, json!({"ok": true}));
            }
            _ => panic!("Expected success"),
        }
    }

    #[test]
    fn test_create_error() {
        let msg = create_error(Id::Number(1), -32601, "Not found");
        let raw = serialize_message(&msg);
        let parsed = parse_message(&raw).unwrap();
        match parsed {
            Message::Error(e) => {
                assert_eq!(e.error.code, -32601);
                assert_eq!(e.error.message, "Not found");
            }
            _ => panic!("Expected error"),
        }
    }
}
