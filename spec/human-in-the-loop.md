# Human-in-the-Loop (HITL) Approval Flow

> **Status:** Draft v1
> **Applies to:** Agent loop, tool execution, event bus
> **Analogous to:** OpenAI Agents SDK `needs_approval`, LangGraph `interrupt()`, Anthropic approval gates

## Problem

An agent with tool access can perform irreversible or high-risk actions (file writes, network calls, process execution). The agent loop needs a standard way to **pause before executing a tool**, ask a human for approval, and resume after the decision — without coupling to any specific UI framework.

## Design

The HITL flow is built on two existing Dhara primitives:

1. **Event bus blocking hooks** — already used for `capability:denied`
2. **Session append-only state** — already persists conversations

### Flow

```
LLM responds with tool calls
  → For each tool call:
    → If tool.needsApproval:
      → Emit tool:approval_required (blocking event)
      → If hook blocks → inject rejection tool_result
      → If hook allows → execute normally
    → Execute tool normally
  → Append results, loop
```

### Tool Declaration

Tools declare approval requirements via the `needsApproval` field:

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** If true, always require human approval before execution.
   *  If a function, called with the input to decide dynamically. */
  needsApproval?: boolean | ((input: Record<string, unknown>) => boolean);
}
```

### ApprovalRequest Event

When a tool with `needsApproval` is about to execute, the agent loop emits:

```typescript
interface ApprovalRequest {
  /** Unique identifier for this approval request */
  id: string;
  /** Tool name being requested */
  toolName: string;
  /** Parsed tool input parameters */
  input: Record<string, unknown>;
  /** Human-readable description of what the tool does */
  description: string;
  /** Session context (last user message, etc.) */
  context?: string;
}
```

Event: `tool:approval_required` with payload `ApprovalRequest`.

### Blocking Hook Contract

A blocking subscriber to `tool:approval_required` decides the outcome:

- **`{ action: "allow" }`** — approval granted, tool executes normally
- **`{ action: "block", reason: "..." }`** — approval denied, tool call is rejected with the given reason

The event bus fail-closed behavior applies: if a blocking hook throws, the request is treated as rejected.

### Approval Events

| Event | Payload | Description |
|---|---|---|
| `tool:approval_required` | `ApprovalRequest` | Emitted before a tool that needs approval |
| `tool:approval_granted` | `{ toolName, input }` | Emitted when approval is granted |
| `tool:approval_denied` | `{ toolName, input, reason }` | Emitted when approval is denied |

### Rejected Tool Flow

When a tool call is rejected, the agent loop appends a `tool_result` entry with `isError: true` containing the rejection reason. The LLM receives this as a failed tool call and can re-plan.

### State Persistence

Pending approval requests are stored in the session metadata:

```typescript
interface ApprovalPending {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  timestamp: string;
}
```

The `SessionMeta` gains an optional `pendingApprovals: ApprovalPending[]` field.
When approvals are resolved, the pending entry is removed.

## Implementation

### Changes to `provider.ts`

Add `needsApproval` to `ToolDefinition`:

```typescript
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  needsApproval?: boolean | ((input: Record<string, unknown>) => boolean);
}
```

### Changes to `agent-loop.ts`

In the tool execution loop, before calling `executeTool`:

```
for (const toolCall of response.toolCalls) {
  const tool = tools.get(toolCall.name);
  
  // Check if this tool needs approval
  if (tool && needsApproval(tool.definition, toolCall.input)) {
    const approvalRequest: ApprovalRequest = {
      id: `${session.meta.id}:${toolCall.id}`,
      toolName: toolCall.name,
      input: toolCall.input,
      description: tool.definition.description,
    };
    
    emit("tool:approval_required", approvalRequest);
    
    const emitResult = eventBus.emit("tool:approval_required", approvalRequest);
    
    if (emitResult.blocked) {
      // Approval denied — inject rejection as tool result
      const reason = emitResult.reason ?? "Approval denied by human";
      // ... create rejected tool result
      continue;
    }
    // Approval granted — execute normally
  }
  
  // ... execute tool
}
```

### Example: TUI Approval Prompt

```typescript
eventBus.subscribe("tool:approval_required", (request) => {
  // Show in TUI status bar
  showApprovalPrompt(request);
  // Wait for human response (async)
  const decision = await waitForHumanInput();
  return decision ? { action: "allow" } : { action: "block", reason: "User rejected" };
}, { blocking: true });
```

### Example: Auto-approve (no-op handler)

```typescript
// Trusted tools — auto-approve everything
eventBus.subscribe("tool:approval_required", () => {
  return { action: "allow" };
}, { blocking: true });
```

## Non-Goals

- **UI rendering** — How approval is displayed is up to the UI layer (TUI, REPL, web)
- **Async notifications** — Slack/email/pager integration belongs in extensions
- **Policy engine** — Complex approval rules (thresholds, time-of-day, user roles) belong in the hook implementation
- **Long-running persistence** — Cross-process approval (approve from a different machine) is a future extension

## Comparison

| Feature | OpenAI SDK | LangGraph | Dhara (this spec) |
|---|---|---|---|
| Tool-level flag | `needs_approval=True` | `interrupt()` in node | `needsApproval` on ToolDefinition |
| Blocking mechanism | RunState interruptions | Checkpoint + resume | Event bus blocking hooks |
| State persistence | RunState serialization | Thread checkpoint | Session metadata |
| Custom rejection | `rejection_message` param | `Command(resume=...)` | Block reason message |
| Auto-decision callback | `on_approval` callback | N/A | Non-blocking handler |
