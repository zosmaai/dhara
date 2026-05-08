/**
 * Result returned by a blocking hook handler.
 *
 * - `{ action: "allow" }` — permit the event to continue
 * - `{ action: "block", reason }` — veto the event, stop propagation
 */
export type HookResult =
  | { action: "allow" }
  | { action: "block"; reason?: string };

/**
 * Result returned by {@link EventBus.emit}.
 *
 * - `{ blocked: false }` — all handlers allowed the event
 * - `{ blocked: true, reason }` — a blocking hook vetoed the event
 */
export type EmitResult =
  | { blocked: false }
  | { blocked: true; reason?: string };

/**
 * Internal representation of a subscribed listener.
 */
interface Listener<T> {
  handler: (payload: T) => HookResult;
  blocking: boolean;
}

/**
 * A typed event bus supporting pub/sub with optional blocking hooks.
 *
 * Blocking hooks can veto events, preventing subsequent non-blocking
 * listeners from receiving the payload. If a blocking hook throws,
 * the event is blocked (fail-closed) and the error message is used
 * as the reason.
 *
 * Non-blocking listeners that throw are silently skipped — their
 * failure does not affect other listeners.
 */
export interface EventBus {
  /**
   * Subscribe to an event.
   *
   * @param event - Event type string (e.g. `"tool:call_start"`)
   * @param handler - Called when the event is emitted. Blocking handlers
   *   must return a {@link HookResult}. Non-blocking handlers should return
   *   `{ action: "allow" }`.
   * @param options - `{ blocking: true }` if this handler can veto events.
   * @returns Unsubscribe function. Call to remove the subscription.
   */
  subscribe<T>(
    event: string,
    handler: (payload: T) => HookResult,
    options?: { blocking?: boolean }
  ): () => void;

  /**
   * Emit an event to all subscribers.
   *
   * Blocking hooks are evaluated first, in subscription order. If any
   * blocking hook returns `{ action: "block" }`, the event is vetoed
   * and non-blocking listeners do not receive it.
   *
   * @param event - Event type string
   * @param payload - Data passed to all handlers
   * @returns Whether the event was blocked and by whom
   */
  emit<T>(event: string, payload: T): EmitResult;

  /**
   * Count active listeners for an event type.
   */
  listenerCount(event: string): number;
}

/**
 * Create a new {@link EventBus} instance.
 */
export function createEventBus(): EventBus {
  const listeners = new Map<string, Listener<unknown>[]>();

  return {
    subscribe<T>(
      event: string,
      handler: (payload: T) => HookResult,
      options: { blocking?: boolean } = {}
    ): () => void {
      const list = listeners.get(event) ?? [];
      const listener: Listener<unknown> = {
        handler: handler as (payload: unknown) => HookResult,
        blocking: options.blocking ?? false,
      };
      list.push(listener);
      listeners.set(event, list);

      return () => {
        const current = listeners.get(event) ?? [];
        const idx = current.indexOf(listener);
        if (idx !== -1) {
          current.splice(idx, 1);
        }
        if (current.length === 0) {
          listeners.delete(event);
        }
      };
    },

    emit<T>(event: string, payload: T): EmitResult {
      const list = listeners.get(event) ?? [];

      // Evaluate blocking hooks first
      for (const listener of list) {
        if (!listener.blocking) continue;

        try {
          const result = listener.handler(payload);
          if (result.action === "block") {
            return { blocked: true, reason: result.reason };
          }
        } catch (err) {
          // Fail-closed: if a blocking hook crashes, block the event
          const reason = err instanceof Error ? err.message : String(err);
          return { blocked: true, reason: `Blocking hook error: ${reason}` };
        }
      }

      // Dispatch to non-blocking listeners
      for (const listener of list) {
        if (listener.blocking) continue;

        try {
          listener.handler(payload);
        } catch {
          // Non-blocking listener errors are silently ignored.
          // The bus continues dispatching to other listeners.
        }
      }

      return { blocked: false };
    },

    listenerCount(event: string): number {
      return listeners.get(event)?.length ?? 0;
    },
  };
}
