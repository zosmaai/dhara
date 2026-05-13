"""
dhara-extension — Python SDK for building Dhara extensions.

Provides:
- Extension class with tool registration and JSON-RPC loop
- Protocol helpers for message parsing and serialization
"""

from .extension import Extension, create_extension, ToolHandler, ToolDefinition
from .protocol import (
    ErrorCodes,
    JsonRpcRequest,
    JsonRpcSuccess,
    JsonRpcErrorResponse,
    parse_message,
    serialize_message,
    create_success,
    create_error,
)

__all__ = [
    "Extension",
    "create_extension",
    "ToolHandler",
    "ToolDefinition",
    "ErrorCodes",
    "JsonRpcRequest",
    "JsonRpcSuccess",
    "JsonRpcErrorResponse",
    "parse_message",
    "serialize_message",
    "create_success",
    "create_error",
]
