"""
Main extension class for building Dhara extensions in Python.

Provides a JSON-RPC stdin/stdout loop with automatic protocol handling.
"""

from __future__ import annotations

import json
import sys
from typing import Any, Callable

from .protocol import ErrorCodes

# ── Type aliases ─────────────────────────────────────────────────────────────────

ToolHandler = Callable[[dict[str, Any]], dict[str, Any]]
ToolDefinition = dict[str, Any]


# ── Extension class ──────────────────────────────────────────────────────────────


class Extension:
    """
    A Dhara extension that communicates via JSON-RPC over stdin/stdout.

    Usage::

        ext = Extension(name="my-ext", version="1.0.0")

        @ext.tool(
            name="hello",
            description="Say hello",
            parameters={"type": "object", "properties": {"name": {"type": "string"}}},
        )
        def hello(input: dict) -> dict:
            name = input.get("name", "world")
            return {"content": [{"type": "text", "text": f"Hello, {name}!"}]}

        ext.run()
    """

    def __init__(
        self,
        name: str = "python-ext",
        version: str = "1.0.0",
        *,
        description: str = "",
        debug: bool = False,
    ):
        self.name = name
        self.version = version
        self.description = description
        self.debug = debug
        self._tools: dict[str, tuple[ToolDefinition, ToolHandler]] = {}
        self._shutdown_requested = False

    # ── Tool registration ───────────────────────────────────────────────────────

    def tool(
        self,
        name: str,
        description: str = "",
        parameters: dict[str, Any] | None = None,
        capabilities: list[str] | None = None,
    ) -> Callable[[ToolHandler], ToolHandler]:
        """
        Decorator that registers a tool handler.
        """
        def decorator(handler: ToolHandler) -> ToolHandler:
            tool_def: ToolDefinition = {
                "name": name,
                "description": description,
                "parameters": parameters or {"type": "object", "properties": {}},
            }
            if capabilities:
                tool_def["capabilities"] = capabilities
            self._tools[name] = (tool_def, handler)
            return handler
        return decorator

    # ── Message dispatch ─────────────────────────────────────────────────────────

    def _dispatch(self, raw_line: str) -> str | None:
        """
        Dispatch a single JSON-RPC request.
        Returns a JSON response string, or None for notifications.
        """
        try:
            data = json.loads(raw_line)
        except json.JSONDecodeError:
            return json.dumps(
                {"jsonrpc": "2.0", "id": None, "error": {"code": ErrorCodes.PARSE_ERROR, "message": "Invalid JSON"}},
                separators=(",", ":"),
            )

        method = data.get("method", "")
        msg_id = data.get("id")

        if method == "initialize":
            resp = {
                "protocolVersion": "0.1.0",
                "name": self.name,
                "version": self.version,
                "description": self.description,
                "tools": [defn for defn, _ in self._tools.values()],
            }
            return json.dumps({"jsonrpc": "2.0", "id": msg_id, "result": resp}, separators=(",", ":"))

        if method == "tools/execute":
            params = data.get("params", {})
            tool_name = params.get("toolName", "")
            tool_input = params.get("input", {})

            if tool_name not in self._tools:
                return json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": msg_id,
                        "error": {"code": ErrorCodes.TOOL_NOT_FOUND, "message": f"Tool not found: {tool_name}"},
                    },
                    separators=(",", ":"),
                )

            _defn, handler = self._tools[tool_name]
            try:
                result = handler(tool_input)
                return json.dumps({"jsonrpc": "2.0", "id": msg_id, "result": result}, separators=(",", ":"))
            except Exception as exc:
                return json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": msg_id,
                        "error": {"code": ErrorCodes.TOOL_EXECUTION_ERROR, "message": f"Tool error: {exc}"},
                    },
                    separators=(",", ":"),
                )

        if method == "shutdown":
            self._shutdown_requested = True
            return json.dumps(
                {"jsonrpc": "2.0", "id": msg_id, "result": {"status": "ok"}},
                separators=(",", ":"),
            )

        # Unknown method
        return json.dumps(
            {
                "jsonrpc": "2.0",
                "id": msg_id,
                "error": {"code": ErrorCodes.METHOD_NOT_FOUND, "message": f"Unknown: {method}"},
            },
            separators=(",", ":"),
        )

    # ── Main loop ────────────────────────────────────────────────────────────────

    def run(self) -> None:
        """Run the extension main loop (stdin → stdout JSON-RPC)."""
        if self.debug:
            sys.stderr.write(f"[dhara:{self.name}] started\n")

        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            if self.debug:
                sys.stderr.write(f"[dhara:{self.name}] << {line}\n")
            response = self._dispatch(line)
            if response:
                print(response, flush=True)
            if self._shutdown_requested:
                break

        if self.debug:
            sys.stderr.write(f"[dhara:{self.name}] stopped\n")


def create_extension(
    name: str = "python-ext",
    version: str = "1.0.0",
    description: str = "",
) -> Extension:
    """Create a new Dhara extension instance."""
    return Extension(name=name, version=version, description=description)
