import type { EventBus } from "../../../core/events.js";

/**
 * Subscribe to event bus events and write structured JSON lines to an output
 * stream. Designed for CI/CD pipeline consumption.
 *
 * Each event is serialized as a single JSON line:
 *
 * ```
 * {"type":"delta","content":[{"type":"text","text":"Hello"}]}
 * {"type":"tool_call","tool":"read","input":{"path":"file.txt"}}
 * {"type":"tool_result","tool":"read","isError":false}
 * {"type":"done","reason":"stop"}
 * ```
 */
export function subscribeJsonStream(
  eventBus: EventBus,
  options: { output: NodeJS.WriteStream },
): () => void {
  const { output } = options;

  const write = (obj: Record<string, unknown>) => {
    output.write(`${JSON.stringify(obj)}\n`);
  };

  const unsubs: Array<() => void> = [];

  // Agent lifecycle events
  unsubs.push(
    eventBus.subscribe<Record<string, unknown>>("agent:start", () => {
      write({ type: "start" });
      return { action: "allow" };
    }),
  );

  unsubs.push(
    eventBus.subscribe<Record<string, unknown>>("agent:end", () => {
      write({ type: "done", reason: "stop" });
      return { action: "allow" };
    }),
  );

  unsubs.push(
    eventBus.subscribe<{ error?: string }>("agent:error", (data) => {
      write({ type: "error", message: data?.error ?? "Unknown error" });
      return { action: "allow" };
    }),
  );

  unsubs.push(
    eventBus.subscribe<Record<string, unknown>>("agent:cancelled", () => {
      write({ type: "done", reason: "cancelled" });
      return { action: "allow" };
    }),
  );

  // Message events
  unsubs.push(
    eventBus.subscribe<Record<string, unknown>>("message:delta", (data) => {
      write({ type: "delta", ...data });
      return { action: "allow" };
    }),
  );

  unsubs.push(
    eventBus.subscribe<{ text?: string }>("message:reasoning", (data) => {
      write({ type: "reasoning", text: data?.text ?? "" });
      return { action: "allow" };
    }),
  );

  // Tool events
  unsubs.push(
    eventBus.subscribe<{ tool?: { name: string }; name?: string; input?: unknown; args?: unknown }>(
      "tool:call_start",
      (data) => {
        write({
          type: "tool_call",
          tool: data?.tool?.name ?? data?.name ?? "unknown",
          input: data?.input ?? data?.args ?? {},
        });
        return { action: "allow" };
      },
    ),
  );

  unsubs.push(
    eventBus.subscribe<{ tool?: { name: string } }>("tool:call_cancelled", (data) => {
      write({
        type: "tool_cancelled",
        tool: data?.tool?.name ?? "unknown",
      });
      return { action: "allow" };
    }),
  );

  // Return unsubscribe function
  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
}
