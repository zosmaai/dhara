#!/usr/bin/env python3
"""
git-tools — Dhara extension for common Git operations.

Registers tools:
  - git_status: Show working tree status
  - git_diff:   Show unstaged diff
  - git_log:    Show recent commit log
  - git_commit: Create a git commit

This demonstrates that domain-specific tools (git, database, cloud)
belong in extensions, not the standard library.
"""

import json
import subprocess
import sys

EXTENSION_NAME = "git-tools"
EXTENSION_VERSION = "1.0.0"

TOOLS = [
    {
        "name": "git_status",
        "description": "Show the working tree status (git status)",
        "parameters": {
            "type": "object",
            "properties": {},
        },
        "capabilities": ["process:spawn"],
    },
    {
        "name": "git_diff",
        "description": "Show unstaged diff (git diff)",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Optional file path to show diff for",
                },
                "staged": {
                    "type": "boolean",
                    "description": "Show staged diff (--cached) instead of unstaged",
                },
            },
        },
        "capabilities": ["process:spawn"],
    },
    {
        "name": "git_log",
        "description": "Show recent commit history",
        "parameters": {
            "type": "object",
            "properties": {
                "count": {
                    "type": "number",
                    "description": "Number of commits to show (default: 10)",
                },
                "branch": {
                    "type": "string",
                    "description": "Branch name (default: current)",
                },
            },
        },
        "capabilities": ["process:spawn"],
    },
    {
        "name": "git_commit",
        "description": "Create a git commit with the given message",
        "parameters": {
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "Commit message",
                },
                "all": {
                    "type": "boolean",
                    "description": "Auto-stage all tracked files (-a flag)",
                },
            },
            "required": ["message"],
        },
        "capabilities": ["process:spawn"],
    },
]


def run_git(args, timeout=30):
    """Run a git command and return its output."""
    try:
        result = subprocess.run(
            ["git"] + args,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.stdout, result.stderr, result.returncode
    except subprocess.TimeoutExpired:
        return "", "Command timed out", -1
    except FileNotFoundError:
        return "", "Git is not installed or not in PATH", -1


def handle_tool(tool_name, params):
    if tool_name == "git_status":
        stdout, stderr, code = run_git(["status"])
        if code != 0:
            return {"content": [{"type": "text", "text": stderr}], "isError": True}
        return {"content": [{"type": "text", "text": stdout}]}

    elif tool_name == "git_diff":
        args = ["diff"]
        if params.get("staged"):
            args.append("--cached")
        path = params.get("path")
        if path:
            args.append(path)

        stdout, stderr, code = run_git(args)
        if code != 0:
            return {"content": [{"type": "text", "text": stderr}], "isError": True}
        if not stdout.strip():
            return {"content": [{"type": "text", "text": "No changes."}]}
        return {"content": [{"type": "text", "text": stdout}]}

    elif tool_name == "git_log":
        count = int(params.get("count", 10))
        args = ["log", f"--max-count={count}", "--oneline", "--decorate"]
        branch = params.get("branch")
        if branch:
            args.append(branch)

        stdout, stderr, code = run_git(args)
        if code != 0:
            return {"content": [{"type": "text", "text": stderr}], "isError": True}
        if not stdout.strip():
            return {"content": [{"type": "text", "text": "No commits found."}]}
        return {"content": [{"type": "text", "text": stdout}]}

    elif tool_name == "git_commit":
        message = params.get("message", "")
        if not message:
            return {"content": [{"type": "text", "text": "Commit message is required"}], "isError": True}

        args = ["commit"]
        if params.get("all"):
            args.append("-a")
        args.extend(["-m", message])

        stdout, stderr, code = run_git(args)
        if code != 0:
            return {"content": [{"type": "text", "text": stderr}], "isError": True}
        return {"content": [{"type": "text", "text": stdout}]}

    else:
        raise ValueError(f"Unknown tool: {tool_name}")


def handle_message(message):
    req = json.loads(message)
    method = req.get("method")
    msg_id = req.get("id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "result": {
                "protocolVersion": "0.1.0",
                "name": EXTENSION_NAME,
                "version": EXTENSION_VERSION,
                "tools": TOOLS,
            },
            "id": msg_id,
        }

    elif method == "tools/execute":
        tool_name = req.get("params", {}).get("toolName")
        params = req.get("params", {}).get("input", {})
        result = handle_tool(tool_name, params)
        return {
            "jsonrpc": "2.0",
            "result": result,
            "id": msg_id,
        }

    elif method == "shutdown":
        response = {
            "jsonrpc": "2.0",
            "result": {"status": "ok"},
            "id": msg_id,
        }
        print(json.dumps(response))
        sys.stdout.flush()
        sys.exit(0)

    else:
        return {
            "jsonrpc": "2.0",
            "error": {"code": -32601, "message": f"Unknown method: {method}"},
            "id": msg_id,
        }


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        response = handle_message(line)
        print(json.dumps(response))
        sys.stdout.flush()


if __name__ == "__main__":
    main()
