#!/usr/bin/env python3
"""
code-search — Dhara extension for code search (ripgrep / ack).

Tools:
  - code_search: Search code with ripgrep (regex, path filter, context)
  - file_find: Find files by glob pattern (recursive)
"""

import json
import subprocess
import sys
from pathlib import Path

EXTENSION_NAME = "code-search"
EXTENSION_VERSION = "1.0.0"

TOOLS = [
    {
        "name": "code_search",
        "description": "Search code with ripgrep (regex search). Supports regex patterns, file type filters, and context lines.",
        "parameters": {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "Regex pattern to search for"},
                "path": {"type": "string", "description": "Directory or file to search (default: cwd)"},
                "file_type": {"type": "string", "description": "File extension filter (e.g. 'py', 'ts', 'rs')"},
                "max_results": {"type": "integer", "description": "Maximum results to return (default: 50)"},
                "context": {"type": "integer", "description": "Lines of context before/after each match"},
                "case_sensitive": {"type": "boolean", "description": "Case sensitive search (default: false)"},
            },
            "required": ["pattern"],
        },
        "capabilities": ["process:spawn"],
    },
    {
        "name": "file_find",
        "description": "Find files matching a glob pattern using fd or find.",
        "parameters": {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "Glob pattern (e.g. '*.ts', '**/*.py')"},
                "path": {"type": "string", "description": "Root directory (default: cwd)"},
                "max_depth": {"type": "integer", "description": "Maximum directory depth"},
            },
            "required": ["pattern"],
        },
        "capabilities": ["process:spawn"],
    },
]


def run_cmd(args, timeout=30):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return result.stdout, result.stderr, result.returncode
    except subprocess.TimeoutExpired:
        return "", "Command timed out", -1
    except FileNotFoundError:
        return "", f"Command not found: {args[0]}", -1


def handle_code_search(params):
    pattern = params.get("pattern", "")
    path = params.get("path", ".")
    file_type = params.get("file_type")
    max_results = int(params.get("max_results", 50))
    context = params.get("context")
    case_sensitive = params.get("case_sensitive", False)

    if not pattern:
        return {"content": [{"type": "text", "text": "Error: pattern is required"}], "isError": True}

    # Prefer ripgrep (rg), fall back to grep
    has_rg = False
    try:
        subprocess.run(["rg", "--version"], capture_output=True, timeout=5)
        has_rg = True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    args = []
    if has_rg:
        args = ["rg", "--no-heading", "--line-number"]
        if not case_sensitive:
            args.append("-i")
        if context:
            args.extend(["-C", str(context)])
        args.extend([pattern, path])
    else:
        args = ["grep", "-rn"]
        if not case_sensitive:
            args.append("-i")
        if context:
            args.extend(["-C", str(context)])
        args.extend([pattern, path])

    stdout, stderr, code = run_cmd(args)
    if code != 0 and code != 1:  # rg exits 1 for no matches
        return {"content": [{"type": "text", "text": stderr or "No matches found."}], "isError": code != 1}

    lines = stdout.strip().split("\n")
    if not lines or lines == [""]:
        return {"content": [{"type": "text", "text": "No matches found."}]}

    # Apply max_results
    if len(lines) > max_results:
        lines = lines[:max_results]
        lines.append(f"... and {len(lines) - max_results} more matches (use more specific pattern)")

    result_text = "\n".join(lines)
    return {"content": [{"type": "text", "text": result_text}]}


def handle_file_find(params):
    pattern = params.get("pattern", "")
    path = params.get("path", ".")
    max_depth = params.get("max_depth")

    # Prefer fd, fall back to find
    has_fd = False
    try:
        subprocess.run(["fd", "--version"], capture_output=True, timeout=5)
        has_fd = True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    args = []
    if has_fd:
        args = ["fd", pattern, path]
        if max_depth:
            args.extend(["--max-depth", str(max_depth)])
    else:
        args = ["find", path, "-name", pattern]
        if max_depth:
            args.extend(["-maxdepth", str(max_depth)])

    stdout, stderr, code = run_cmd(args)
    if code != 0:
        return {"content": [{"type": "text", "text": stderr}], "isError": True}

    files = stdout.strip().split("\n") if stdout.strip() else ["No files found."]
    return {"content": [{"type": "text", "text": "\n".join(files[:200])}]}


def dispatch(data):
    method = data.get("method", "")
    msg_id = data.get("id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "protocolVersion": "0.1.0",
                "name": EXTENSION_NAME,
                "version": EXTENSION_VERSION,
                "tools": TOOLS,
            },
        }

    if method == "tools/execute":
        params = data.get("params", {})
        tool_name = params.get("toolName", "")
        tool_input = params.get("input", {})

        if tool_name == "code_search":
            result = handle_code_search(tool_input)
        elif tool_name == "file_find":
            result = handle_file_find(tool_input)
        else:
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "error": {"code": -32001, "message": f"Unknown tool: {tool_name}"},
            }

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
