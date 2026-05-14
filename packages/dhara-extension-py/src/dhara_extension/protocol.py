"""JSON-RPC 2.0 message types for the Dhara extension protocol."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# ── JSON-RPC message types ──────────────────────────────────────────────────────


@dataclass
class JsonRpcRequest:
    """A JSON-RPC 2.0 request from the core."""

    jsonrpc: str = "2.0"
    id: int | str | None = None
    method: str = ""
    params: dict[str, Any] = field(default_factory=dict)


@dataclass
class JsonRpcSuccess:
    """A successful JSON-RPC 2.0 response."""

    jsonrpc: str = "2.0"
    id: int | str | None = None
    result: Any = None


@dataclass
class JsonRpcError:
    """A JSON-RPC 2.0 error object."""

    code: int = -32603
    message: str = "Internal error"
    data: Any = None


@dataclass
class JsonRpcErrorResponse:
    """An error JSON-RPC 2.0 response."""

    jsonrpc: str = "2.0"
    id: int | str | None = None
    error: JsonRpcError | None = None


JsonRpcMessage = JsonRpcRequest | JsonRpcSuccess | JsonRpcErrorResponse


# ── Standard error codes (mirrors @zosmaai/dhara-extension) ────────────────────


class ErrorCodes:
    """Standard JSON-RPC error codes used by Dhara."""

    PARSE_ERROR = -32700
    INVALID_REQUEST = -32600
    METHOD_NOT_FOUND = -32601
    INVALID_PARAMS = -32602
    INTERNAL_ERROR = -32603

    # Dhara-specific codes
    TOOL_EXECUTION_ERROR = -32000
    TOOL_NOT_FOUND = -32001
    CAPABILITY_DENIED = -32002
    EXTENSION_CRASHED = -32003
    HANDSHAKE_TIMEOUT = -32004
    SHUTDOWN = -32005


# ── Dhara protocol message helpers ──────────────────────────────────────────────


def parse_message(line: str) -> JsonRpcMessage:
    """Parse a single JSON-RPC message from a JSON string."""
    import json

    data = json.loads(line)

    if "method" in data:
        return JsonRpcRequest(
            jsonrpc=data.get("jsonrpc", "2.0"),
            id=data.get("id"),
            method=data["method"],
            params=data.get("params", {}),
        )

    if "error" in data:
        err = data.get("error", {})
        return JsonRpcErrorResponse(
            jsonrpc=data.get("jsonrpc", "2.0"),
            id=data.get("id"),
            error=JsonRpcError(
                code=err.get("code", -32603),
                message=err.get("message", "Unknown error"),
                data=err.get("data"),
            ),
        )

    return JsonRpcSuccess(
        jsonrpc=data.get("jsonrpc", "2.0"),
        id=data.get("id"),
        result=data.get("result"),
    )


def serialize_message(message: JsonRpcMessage) -> str:
    """Serialize a JSON-RPC message to a JSON string."""
    import json

    if isinstance(message, JsonRpcRequest):
        obj: dict[str, Any] = {
            "jsonrpc": message.jsonrpc,
            "method": message.method,
        }
        if message.id is not None:
            obj["id"] = message.id
        if message.params:
            obj["params"] = message.params
        return json.dumps(obj, separators=(",", ":"))

    if isinstance(message, JsonRpcSuccess):
        obj = {
            "jsonrpc": message.jsonrpc,
            "id": message.id,
            "result": message.result,
        }
        return json.dumps(obj, separators=(",", ":"))

    if isinstance(message, JsonRpcErrorResponse):
        obj = {
            "jsonrpc": message.jsonrpc,
            "id": message.id,
            "error": {
                "code": message.error.code if message.error else ErrorCodes.INTERNAL_ERROR,
                "message": message.error.message if message.error else "Unknown error",
            },
        }
        if message.error and message.error.data:
            obj["error"]["data"] = message.error.data
        return json.dumps(obj, separators=(",", ":"))

    return json.dumps(message, separators=(",", ":"))


def create_success(id: int | str | None, result: Any) -> JsonRpcSuccess:
    """Create a success response."""
    return JsonRpcSuccess(id=id, result=result)


def create_error(
    id: int | str | None,
    code: int = ErrorCodes.INTERNAL_ERROR,
    message: str = "Internal error",
    data: Any = None,
) -> JsonRpcErrorResponse:
    """Create an error response."""
    return JsonRpcErrorResponse(id=id, error=JsonRpcError(code=code, message=message, data=data))
