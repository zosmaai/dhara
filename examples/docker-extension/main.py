#!/usr/bin/env python3
"""
docker-extension — Dhara extension for Docker operations.

Tools:
  - docker_ps: List running containers
  - docker_logs: Show container logs
  - docker_exec: Execute command in container
  - docker_compose: Run docker compose commands
"""

import json
import subprocess
import sys

EXTENSION_NAME = "docker-extension"
EXTENSION_VERSION = "1.0.0"

TOOLS = [
    {
        "name": "docker_ps",
        "description": "List running Docker containers.",
        "parameters": {"type": "object", "properties": {"all": {"type": "boolean", "description": "Show all containers (including stopped)"}}},
        "capabilities": ["process:spawn"],
    },
    {
        "name": "docker_logs",
        "description": "Show container logs.",
        "parameters": {
            "type": "object",
            "properties": {
                "container": {"type": "string", "description": "Container name or ID"},
                "tail": {"type": "integer", "description": "Number of recent lines (default: 50)"},
                "follow": {"type": "boolean", "description": "Follow log output"},
            },
            "required": ["container"],
        },
        "capabilities": ["process:spawn"],
    },
    {
        "name": "docker_exec",
        "description": "Execute a command inside a running container.",
        "parameters": {
            "type": "object",
            "properties": {
                "container": {"type": "string", "description": "Container name or ID"},
                "command": {"type": "string", "description": "Command to execute"},
            },
            "required": ["container", "command"],
        },
        "capabilities": ["process:spawn"],
    },
    {
        "name": "docker_compose",
        "description": "Run docker compose commands.",
        "parameters": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "description": "Compose action (up, down, ps, logs, build, pull, restart)",
                },
                "file": {"type": "string", "description": "Compose file path"},
                "services": {"type": "string", "description": "Specific services (space-separated)"},
            },
            "required": ["action"],
        },
        "capabilities": ["process:spawn"],
    },
]


def run_docker(args, timeout=30):
    try:
        result = subprocess.run(["docker"] + args, capture_output=True, text=True, timeout=timeout)
        return result.stdout, result.stderr, result.returncode
    except subprocess.TimeoutExpired:
        return "", "Command timed out", -1
    except FileNotFoundError:
        return "", "Docker not found. Is Docker installed?", -1


def handle_docker_ps(params):
    args = ["ps"]
    if params.get("all"):
        args.append("-a")
    stdout, stderr, code = run_docker(args)
    if code != 0:
        return {"content": [{"type": "text", "text": stderr}], "isError": True}
    return {"content": [{"type": "text", "text": stdout}]}


def handle_docker_logs(params):
    container = params.get("container", "")
    tail = int(params.get("tail", 50))
    args = ["logs", "--tail", str(tail)]
    if params.get("follow"):
        args.append("--follow")
    args.append(container)
    stdout, stderr, code = run_docker(args)
    if code != 0:
        return {"content": [{"type": "text", "text": stderr}], "isError": True}
    return {"content": [{"type": "text", "text": stdout[:10000]}]}


def handle_docker_exec(params):
    container = params.get("container", "")
    command = params.get("command", "")
    if not container or not command:
        return {"content": [{"type": "text", "text": "Container and command required"}], "isError": True}
    stdout, stderr, code = run_docker(["exec", container] + command.split())
    if code != 0:
        return {"content": [{"type": "text", "text": stderr}], "isError": True}
    return {"content": [{"type": "text", "text": stdout[:10000]}]}


def handle_docker_compose(params):
    action = params.get("action", "")
    valid_actions = ["up", "down", "ps", "logs", "build", "pull", "restart", "stop"]
    if action not in valid_actions:
        return {"content": [{"type": "text", "text": f"Invalid action: {action}. Valid: {', '.join(valid_actions)}"}], "isError": True}

    args = ["compose"]
    if params.get("file"):
        args.extend(["-f", params["file"]])
    args.append(action)
    if params.get("services"):
        args.extend(params["services"].split())

    stdout, stderr, code = run_docker(args)
    if code != 0:
        return {"content": [{"type": "text", "text": stderr}], "isError": True}
    return {"content": [{"type": "text", "text": stdout[:10000]}]}


def dispatch(data):
    method = data.get("method", "")
    msg_id = data.get("id")
    if method == "initialize":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {"protocolVersion": "0.1.0", "name": EXTENSION_NAME, "version": EXTENSION_VERSION, "tools": TOOLS}}
    if method == "tools/execute":
        params = data.get("params", {})
        tool_name = params.get("toolName", "")
        tool_input = params.get("input", {})
        handlers = {"docker_ps": handle_docker_ps, "docker_logs": handle_docker_logs, "docker_exec": handle_docker_exec, "docker_compose": handle_docker_compose}
        handler = handlers.get(tool_name)
        if not handler:
            return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32001, "message": f"Unknown: {tool_name}"}}
        result = handler(tool_input)
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
