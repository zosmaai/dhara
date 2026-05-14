#!/usr/bin/env python3
"""
test-runner — Dhara extension for running tests.

Tools:
  - run_tests: Discover and run tests (vitest, pytest, or custom command)
  - list_tests: List available test files
"""

import json
import os
import subprocess
import sys
from pathlib import Path

EXTENSION_NAME = "test-runner"
EXTENSION_VERSION = "1.0.0"

TOOLS = [
    {
        "name": "run_tests",
        "description": "Discover and run tests. Auto-detects vitest, pytest, or uses custom command.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Test file or directory (default: .)"},
                "command": {"type": "string", "description": "Override auto-detected test command"},
                "filter": {"type": "string", "description": "Test name filter / keyword"},
                "coverage": {"type": "boolean", "description": "Run with coverage (default: false)"},
                "timeout": {"type": "integer", "description": "Test timeout in seconds (default: 120)"},
            },
        },
        "capabilities": ["process:spawn"],
    },
    {
        "name": "list_tests",
        "description": "List test files found in the project.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Directory to scan (default: .)"},
            },
        },
        "capabilities": ["process:spawn"],
    },
]


def detect_test_command(cwd="."):
    """Auto-detect the test framework based on config files."""
    if os.path.exists(os.path.join(cwd, "package.json")):
        # Check for vitest or jest in package.json
        try:
            with open(os.path.join(cwd, "package.json")) as f:
                pkg = json.load(f)
            deps = {**pkg.get("devDependencies", {}), **pkg.get("dependencies", {})}
            if "vitest" in deps:
                return "npx vitest run"
            if "jest" in deps:
                return "npx jest"
            if "mocha" in deps:
                return "npx mocha"
            # Check scripts
            scripts = pkg.get("scripts", {})
            if "test" in scripts:
                script = scripts["test"]
                return f"npm run test --" if " " not in script else script
        except (json.JSONDecodeError, OSError):
            pass
    if os.path.exists(os.path.join(cwd, "pyproject.toml")) or os.path.exists(os.path.join(cwd, "setup.py")):
        return "python3 -m pytest"
    if os.path.exists(os.path.join(cwd, "Cargo.toml")):
        return "cargo test"
    if os.path.exists(os.path.join(cwd, "go.mod")):
        return "go test ./..."
    return "echo 'No test framework detected. Use --command to specify.'"


def list_test_files(cwd="."):
    """Find test files in the project."""
    patterns = [
        "**/*.test.ts", "**/*.test.tsx", "**/*.test.js", "**/*.test.jsx",
        "**/*.spec.ts", "**/*.spec.tsx", "**/*.spec.js", "**/*.spec.jsx",
        "**/test_*.py", "**/*_test.py", "**/*_test.go",
    ]
    found = []
    for pattern in patterns:
        try:
            result = subprocess.run(
                ["python3", "-c", f"""
import glob; files = glob.glob('{pattern}', recursive=True)
print('\\n'.join(sorted(files)[:100]))
"""],
                capture_output=True, text=True, timeout=10, cwd=cwd,
            )
            for f in result.stdout.strip().split("\n"):
                if f and f not in found:
                    found.append(f)
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass

    return sorted(found)


def handle_run_tests(params):
    path = params.get("path", ".")
    command = params.get("command")
    test_filter = params.get("filter")
    coverage = params.get("coverage", False)
    timeout = int(params.get("timeout", 120))

    if not command:
        command = detect_test_command(path)

    # Build the command
    if command.startswith("npx ") and test_filter:
        command += f' -t "{test_filter}"'
    elif command.startswith("python3 -m pytest") and test_filter:
        command += f" -k '{test_filter}'"
    elif command.startswith("cargo test") and test_filter:
        command += f" {test_filter}"

    if coverage:
        if "vitest" in command:
            command += " --coverage"
        elif "pytest" in command:
            command += " --cov"
        elif "jest" in command:
            command += " --coverage"

    try:
        result = subprocess.run(
            command.split(),
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=path,
        )
        output = result.stdout
        if result.stderr:
            output += "\n--- stderr ---\n" + result.stderr
        if result.returncode != 0:
            output += f"\n\nExit code: {result.returncode}"

        return {"content": [{"type": "text", "text": output[:10000]}]}
    except subprocess.TimeoutExpired:
        return {"content": [{"type": "text", "text": f"Tests timed out after {timeout}s"}], "isError": True}
    except FileNotFoundError:
        return {"content": [{"type": "text", "text": f"Command not found: {command.split()[0]}"}], "isError": True}


def handle_list_tests(params):
    path = params.get("path", ".")
    files = list_test_files(path)
    if not files:
        return {"content": [{"type": "text", "text": "No test files found."}]}
    return {"content": [{"type": "text", "text": f"Found {len(files)} test file(s):\n" + "\n".join(files)}]}


def dispatch(data):
    method = data.get("method", "")
    msg_id = data.get("id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0", "id": msg_id,
            "result": {"protocolVersion": "0.1.0", "name": EXTENSION_NAME, "version": EXTENSION_VERSION, "tools": TOOLS},
        }

    if method == "tools/execute":
        params = data.get("params", {})
        tool_name = params.get("toolName", "")
        tool_input = params.get("input", {})
        if tool_name == "run_tests":
            result = handle_run_tests(tool_input)
        elif tool_name == "list_tests":
            result = handle_list_tests(tool_input)
        else:
            return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32001, "message": f"Unknown: {tool_name}"}}
        return {"jsonrpc": "2.0", "id": msg_id, "result": result}

    if method == "shutdown":
        sys.exit(0)

    return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32601, "message": f"Unknown: {method}"}}


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        response = dispatch(json.loads(line))
        print(json.dumps(response), flush=True)


if __name__ == "__main__":
    main()
