# Tool Schema

> A declarative, typed, language-agnostic schema for defining agent tools.

## Why a Standard Tool Schema

Pi uses TypeBox (a TypeScript-specific schema library) for tool parameters. This means:
- Only TypeScript extensions can define tools
- No standard way to describe tool outputs
- No capability declarations
- No versioning

We use **JSON Schema** (an open standard) for both inputs and outputs, plus metadata for capabilities, versioning, and display.

## Tool Definition

```typescript
interface ToolDefinition {
  // Identity
  name: string;                     // Unique tool name (e.g., "fs_read")
  version: string;                  // Semantic version (e.g., "1.0.0")
  description: string;              // What this tool does (shown to LLM)
  
  // Schema
  parameters: JSONSchemaObject;     // Input schema (JSON Schema draft 2020-12)
  returns: JSONSchemaObject;        // Output schema (JSON Schema draft 2020-12)
  
  // Security
  capabilities: Capability[];       // Required capabilities
  
  // Display
  display?: {
    icon?: string;                  // Icon name for UI
    category?: string;              // Category for grouping
    color?: string;                 // Display color hint
    progressIndicator?: boolean;    // Show progress while executing
  };
  
  // Behavior
  destructive?: boolean;            // This tool modifies state
  streaming?: boolean;              // Tool supports streaming output
  timeout?: number;                 // Default timeout in seconds
  cacheable?: boolean;              // Identical inputs produce identical outputs
  
  // LLM hints
  hints?: {
    priority?: number;              // 0-100, higher = preferred when ambiguous
    examples?: ToolExample[];       // Example inputs/outputs for the LLM
    whenToUse?: string;             // Natural language description of when to use
    whenNotToUse?: string;          // Natural language description of when NOT to use
  };
}
```

## Example Tool Definitions

### File Read (Core Standard Tool)

```json
{
  "name": "fs_read",
  "version": "1.0.0",
  "description": "Read the contents of a file. Supports text files and images (jpg, png, gif, webp). For text files, defaults to first 2000 lines. Use offset/limit for large files.",
  "parameters": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "Path to the file to read (relative or absolute)"
      },
      "offset": {
        "type": "integer",
        "description": "Line number to start reading from (1-indexed)",
        "minimum": 1
      },
      "limit": {
        "type": "integer",
        "description": "Maximum number of lines to read",
        "minimum": 1
      }
    },
    "required": ["path"],
    "additionalProperties": false
  },
  "returns": {
    "type": "object",
    "properties": {
      "content": {
        "type": "array",
        "items": {
          "oneOf": [
            {
              "type": "object",
              "properties": {
                "type": { "const": "text" },
                "text": { "type": "string" }
              }
            },
            {
              "type": "object",
              "properties": {
                "type": { "const": "image" },
                "data": { "type": "string", "format": "base64" },
                "mimeType": { "type": "string" }
              }
            }
          ]
        }
      },
      "lineCount": { "type": "integer" },
      "truncated": { "type": "boolean" }
    },
    "required": ["content"]
  },
  "capabilities": ["filesystem:read"],
  "display": {
    "icon": "file-text",
    "category": "filesystem",
    "progressIndicator": true
  },
  "destructive": false,
  "cacheable": true,
  "hints": {
    "priority": 90,
    "whenToUse": "When you need to examine the contents of a file",
    "whenNotToUse": "When you need to search across many files (use search tool instead)"
  }
}
```

### Bash (Core Standard Tool)

```json
{
  "name": "shell_exec",
  "version": "1.0.0",
  "description": "Execute a shell command in the current working directory. Returns stdout and stderr.",
  "parameters": {
    "type": "object",
    "properties": {
      "command": {
        "type": "string",
        "description": "Shell command to execute"
      },
      "timeout": {
        "type": "integer",
        "description": "Timeout in seconds (optional)",
        "minimum": 1,
        "maximum": 300
      },
      "cwd": {
        "type": "string",
        "description": "Working directory override"
      }
    },
    "required": ["command"],
    "additionalProperties": false
  },
  "returns": {
    "type": "object",
    "properties": {
      "stdout": { "type": "string" },
      "stderr": { "type": "string" },
      "exitCode": { "type": "integer" },
      "duration_ms": { "type": "integer" }
    },
    "required": ["stdout", "stderr", "exitCode"]
  },
  "capabilities": ["process:spawn"],
  "display": {
    "icon": "terminal",
    "category": "execution",
    "progressIndicator": true
  },
  "destructive": true,
  "streaming": true,
  "hints": {
    "priority": 50,
    "whenToUse": "For file operations like ls, grep, find, git commands, running tests, or any system command",
    "whenNotToUse": "For precise file edits (use fs_edit instead), for reading a single file (use fs_read instead)"
  }
}
```

### Semantic Code Search (Extension Tool)

```json
{
  "name": "code_search",
  "version": "1.0.0",
  "description": "Search code semantically using embeddings. Returns relevant code snippets ranked by relevance.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Natural language search query"
      },
      "language": {
        "type": "string",
        "enum": ["typescript", "python", "rust", "go", "java", "all"],
        "description": "Filter by programming language",
        "default": "all"
      },
      "maxResults": {
        "type": "integer",
        "description": "Maximum number of results",
        "default": 10,
        "minimum": 1,
        "maximum": 50
      },
      "includeTests": {
        "type": "boolean",
        "description": "Include test files in results",
        "default": false
      }
    },
    "required": ["query"],
    "additionalProperties": false
  },
  "returns": {
    "type": "object",
    "properties": {
      "results": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "file": { "type": "string" },
            "line": { "type": "integer" },
            "snippet": { "type": "string" },
            "relevance": { "type": "number", "minimum": 0, "maximum": 1 }
          }
        }
      },
      "totalMatches": { "type": "integer" },
      "searchTime_ms": { "type": "integer" }
    }
  },
  "capabilities": ["filesystem:read", "network:outbound"],
  "display": {
    "icon": "search",
    "category": "search",
    "color": "blue"
  },
  "destructive": false,
  "cacheable": true
}
```

## Tool Result Format

Every tool returns a standard result:

```typescript
interface ToolResult {
  // Content for the LLM
  content: ContentBlock[];
  
  // Richer display for the UI (optional)
  display?: DisplayBlock[];
  
  // Machine-readable metadata (optional)
  metadata?: Record<string, unknown>;
  
  // Execution info
  isError: boolean;
  duration_ms: number;
}
```

### Content Blocks (for LLM)

```typescript
type ContentBlock =
  | TextBlock
  | ImageBlock
  | FileBlock;

interface TextBlock {
  type: "text";
  text: string;
}

interface ImageBlock {
  type: "image";
  data: string;        // Base64
  mimeType: string;
}

interface FileBlock {
  type: "file";
  path: string;
  content: string;
  language?: string;
}
```

### Display Blocks (for UI)

Display blocks let tools provide richer output for the UI without dumping it all into the LLM context:

```typescript
type DisplayBlock =
  | TableDisplay
  | DiffDisplay
  | ProgressDisplay
  | ChartDisplay
  | CustomDisplay;

interface TableDisplay {
  type: "table";
  columns: { key: string; label: string; width?: number }[];
  rows: Record<string, unknown>[];
}

interface DiffDisplay {
  type: "diff";
  filePath: string;
  hunks: DiffHunk[];
}

interface ProgressDisplay {
  type: "progress";
  current: number;
  total: number;
  label: string;
}

interface ChartDisplay {
  type: "chart";
  chartType: "bar" | "line" | "pie";
  data: Record<string, unknown>;
}

interface CustomDisplay {
  type: "custom";
  component: string;     // Registered UI component name
  props: Record<string, unknown>;
}
```

## Tool Discovery

Tools are discovered through extensions. The core maintains a tool registry:

```
Agent starts
  → Load extensions
  → Each extension declares tools via manifest
  → Core validates tool schemas against JSON Schema
  → Core checks capabilities (user must approve)
  → Registered tools become available to the LLM
```

### Conflict Resolution

If two extensions register tools with the same name:
1. **Explicitly enabled tools win** over auto-discovered tools
2. **User settings override** — user can pick which extension's tool to use
3. **Namespace fallback** — if unambiguous, use `{extension}.{tool}` format

## Standard Tool Library

The reference implementation ships a standard library of tools that cover 90% of coding agent use cases:

| Tool | Capabilities | Description |
|---|---|---|
| `fs_read` | filesystem:read | Read file contents |
| `fs_write` | filesystem:write | Create or overwrite files |
| `fs_edit` | filesystem:write | Surgical text replacement |
| `fs_list` | filesystem:read | List directory contents |
| `fs_search` | filesystem:read | Grep/find across files |
| `shell_exec` | process:spawn | Execute shell commands |
| `web_fetch` | network:outbound | Fetch URL contents |
| `web_search` | network:outbound | Search the web |

Users can replace any standard tool with a custom one from a package. Standard tools are just the default extension, not special.
