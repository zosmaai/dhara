export interface EventBus {
  subscribe<T>(
    event: string,
    handler: (payload: T) => void | { block: boolean; reason?: string },
    options?: { blocking?: boolean }
  ): () => void;
  emit<T>(event: string, payload: T): { blocked: boolean; reason?: string };
}

interface Listener<T> {
  handler: (payload: T) => void | { block: boolean; reason?: string };
  blocking: boolean;
}

export function createEventBus(): EventBus {
  const listeners = new Map<string, Listener<unknown>[]>();

  return {
    subscribe(event, handler, options = {}) {
      const list = listeners.get(event) ?? [];
      const listener: Listener<unknown> = { handler, blocking: options.blocking ?? false };
      list.push(listener);
      listeners.set(event, list);

      return () => {
        const current = listeners.get(event) ?? [];
        const idx = current.indexOf(listener);
        if (idx !== -1) {
          current.splice(idx, 1);
        }
      };
    },

    emit(event, payload) {
      const list = listeners.get(event) ?? [];

      for (const listener of list) {
        const result = listener.handler(payload);
        if (listener.blocking && result && typeof result === "object" && "block" in result && result.block) {
          return { blocked: true, reason: result.reason };
        }
      }

      return { blocked: false };
    },
  };
}
