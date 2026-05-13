import type { Readable, Writable } from "node:stream";

export interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface ExtensionProtocol {
  /**
   * Send a JSON-RPC request and wait for a response.
   *
   * @param method - JSON-RPC method name.
   * @param params - Parameters to send.
   * @param signal - Optional AbortSignal. When aborted, the pending
   *   request is rejected with a cancellation error. The extension
   *   should also receive a tools/cancel notification via separate path.
   */
  sendRequest<T>(method: string, params: unknown, signal?: AbortSignal): Promise<T>;
  sendNotification(method: string, params: unknown): void;
  onNotification<T>(method: string, handler: (params: T) => void): () => void;
  close(): void;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

export function createExtensionProtocol({
  stdin,
  stdout,
}: {
  stdin: Readable;
  stdout: Writable;
}): ExtensionProtocol {
  let nextId = 1;
  const pending = new Map<number, PendingRequest>();
  const notificationHandlers = new Map<string, ((params: unknown) => void)[]>();
  let buffer = "";
  let closed = false;

  function sendMessage(msg: JsonRpcMessage) {
    if (closed) return;
    stdout.write(`${JSON.stringify(msg)}\n`);
  }

  function onData(chunk: Buffer) {
    buffer += chunk.toString("utf-8");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg: JsonRpcMessage = JSON.parse(line);
        handleMessage(msg);
      } catch {
        // Ignore malformed JSON lines
      }
    }
  }

  function handleMessage(msg: JsonRpcMessage) {
    // Response to a request
    if (msg.id !== undefined && pending.has(msg.id)) {
      const req = pending.get(msg.id);
      if (!req) return;
      pending.delete(msg.id);
      if (msg.error) {
        req.reject(new Error(msg.error.message));
      } else {
        req.resolve(msg.result);
      }
      return;
    }

    // Notification from extension
    if (msg.method && msg.id === undefined) {
      const handlers = notificationHandlers.get(msg.method) ?? [];
      for (const handler of handlers) {
        try {
          handler(msg.params);
        } catch {
          // Handler errors should not crash the protocol
        }
      }
    }
  }

  stdin.on("data", onData);

  return {
    sendRequest<T>(method: string, params: unknown, signal?: AbortSignal): Promise<T> {
      if (closed) return Promise.reject(new Error("Protocol closed"));
      const id = nextId++;

      sendMessage({ jsonrpc: "2.0", id, method, params });

      return new Promise((resolve, reject) => {
        const request: PendingRequest = {
          resolve: resolve as (v: unknown) => void,
          reject,
        };

        pending.set(id, request);

        // Handle abort signal
        if (signal) {
          if (signal.aborted) {
            pending.delete(id);
            reject(new Error("Request cancelled"));
            return;
          }

          const onAbort = () => {
            pending.delete(id);
            reject(new Error("Request cancelled"));
          };

          signal.addEventListener("abort", onAbort, { once: true });

          // Clean up the listener if the request completes normally
          const originalResolve = request.resolve;
          const originalReject = request.reject;

          request.resolve = (value) => {
            signal.removeEventListener("abort", onAbort);
            originalResolve(value);
          };

          request.reject = (reason) => {
            signal.removeEventListener("abort", onAbort);
            originalReject(reason);
          };
        }
      });
    },

    sendNotification(method: string, params: unknown) {
      if (closed) return;
      sendMessage({ jsonrpc: "2.0", method, params });
    },

    onNotification<T>(method: string, handler: (params: T) => void): () => void {
      const list = notificationHandlers.get(method) ?? [];
      const wrapped = (params: unknown) => handler(params as T);
      list.push(wrapped);
      notificationHandlers.set(method, list);

      return () => {
        const current = notificationHandlers.get(method) ?? [];
        const idx = current.indexOf(wrapped);
        if (idx !== -1) current.splice(idx, 1);
      };
    },

    close() {
      closed = true;
      stdin.off("data", onData);
      for (const req of pending.values()) {
        req.reject(new Error("Protocol closed"));
      }
      pending.clear();
    },
  };
}

// ── Serialization helpers ───────────────────────────────────────────────────────

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * Serialize a JSON-RPC message to a JSON string.
 */
export function serializeMessage(msg: JsonRpcMessage): string {
  return JSON.stringify(msg);
}

/**
 * Parse a JSON string into a JSON-RPC message.
 * Returns undefined if the input is not valid JSON-RPC.
 */
export function parseMessage(raw: string): JsonRpcMessage | undefined {
  try {
    const parsed = JSON.parse(raw) as JsonRpcMessage;
    if (parsed.jsonrpc !== "2.0") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Create a JSON-RPC success response.
 */
export function createResponse(id: number | string | undefined | null, result: unknown): JsonRpcMessage {
  return { jsonrpc: "2.0", id: id ?? undefined, result };
}

/**
 * Create a JSON-RPC error response.
 */
export function createErrorResponse(
  id: number | string | undefined | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcMessage {
  const error: { code: number; message: string; data?: unknown } = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id: id ?? undefined, error };
}
