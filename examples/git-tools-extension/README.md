# git-tools

Dhara extension for common Git operations.

**Demonstrates**: Domain-specific tools (git, database, cloud) as extensions.

## Tools

| Tool | Description |
|---|---|
| `git_status` | Show working tree status |
| `git_diff` | Show unstaged or staged diff (with optional file path) |
| `git_log` | Show recent commit history (configurable count + branch) |
| `git_commit` | Create a git commit with message |

## Install

```bash
cp -r examples/git-tools-extension ~/.dhara/extensions/git-tools
```

## Usage

```bash
dhara "Show me the git status and recent commits"
dhara "What's the diff on src/main.ts?"
dhara "Commit all changes with message 'Fix login bug'"
```
