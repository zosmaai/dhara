#!/usr/bin/env python3
"""Tests for the Dhara Python SDK."""

import json
import subprocess
import sys
import unittest


class TestProtocolHelpers(unittest.TestCase):
    """Test protocol.py message helpers."""

    def setUp(self):
        from dhara_extension.protocol import parse_message, serialize_message, create_success, create_error
        import json as _json
        self._json = _json
        self.parse = parse_message
        self.serialize = serialize_message
        self.success = create_success
        self.error = create_error

    def test_parse_request(self):
        msg = self.parse('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"0.1.0"}}')
        # parse_message returns dataclass objects
        self.assertEqual(msg.method, "initialize")
        self.assertEqual(msg.id, 1)

    def test_parse_success(self):
        msg = self.parse('{"jsonrpc":"2.0","id":1,"result":{"status":"ok"}}')
        self.assertEqual(msg.result, {"status": "ok"})

    def test_parse_error(self):
        msg = self.parse('{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"Not found"}}')
        self.assertEqual(msg.error.code, -32601)

    def test_serialize_success(self):
        result = self.success(1, {"tools": []})
        raw = self.serialize(result)
        data = json.loads(raw)
        self.assertEqual(data["id"], 1)
        self.assertEqual(data["result"]["tools"], [])

    def test_serialize_error(self):
        err = self.error(1, code=-32000, message="Tool error")
        raw = self.serialize(err)
        data = json.loads(raw)
        self.assertEqual(data["id"], 1)
        self.assertEqual(data["error"]["code"], -32000)

    def test_create_extension(self):
        from dhara_extension import create_extension
        ext = create_extension("test-ext", "1.0.0", "A test extension")
        self.assertEqual(ext.name, "test-ext")
        self.assertEqual(ext.version, "1.0.0")


class TestExtensionTools(unittest.TestCase):
    """Test tool registration and dispatch."""

    def setUp(self):
        from dhara_extension import Extension
        self.ext = Extension("test-ext", "1.0.0", description="A test extension")

        @self.ext.tool(
            name="echo",
            description="Echo input",
            parameters={"type": "object", "properties": {"message": {"type": "string"}}},
        )
        def echo(input_data):
            msg = input_data.get("message", "")
            return {"content": [{"type": "text", "text": msg}]}

        self.echo_handler = echo

    def test_tool_registration(self):
        self.assertIn("echo", self.ext._tools)

    def test_initialize_response(self):
        import json
        resp = self.ext._dispatch('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}')
        data = json.loads(resp)
        self.assertEqual(data["id"], 1)
        self.assertIn("tools", data["result"])
        tool_names = [t["name"] for t in data["result"]["tools"]]
        self.assertIn("echo", tool_names)

    def test_tool_execution(self):
        import json
        resp = self.ext._dispatch(
            '{"jsonrpc":"2.0","id":2,"method":"tools/execute","params":{"toolName":"echo","input":{"message":"hello"}}}'
        )
        data = json.loads(resp)
        self.assertEqual(data["id"], 2)
        self.assertEqual(data["result"]["content"][0]["text"], "hello")

    def test_unknown_tool(self):
        import json
        resp = self.ext._dispatch(
            '{"jsonrpc":"2.0","id":3,"method":"tools/execute","params":{"toolName":"nonexistent","input":{}}}'
        )
        data = json.loads(resp)
        self.assertIn("error", data)
        self.assertIn("not found", data["error"]["message"])

    def test_shutdown(self):
        import json
        resp = self.ext._dispatch('{"jsonrpc":"2.0","id":4,"method":"shutdown"}')
        data = json.loads(resp)
        self.assertEqual(data["result"]["status"], "ok")
        self.assertTrue(self.ext._shutdown_requested)

    def test_unknown_method(self):
        import json
        resp = self.ext._dispatch('{"jsonrpc":"2.0","id":5,"method":"bogus","params":{}}')
        data = json.loads(resp)
        self.assertIn("error", data)
        self.assertIn("Unknown", data["error"]["message"])

    def test_invalid_json(self):
        import json
        resp = self.ext._dispatch("not json")
        data = json.loads(resp)
        self.assertIn("error", data)


if __name__ == "__main__":
    unittest.main()
