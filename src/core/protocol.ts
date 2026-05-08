import { EventEmitter } from "events";
import type { Readable, Writable } from "stream";

export interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface ExtensionProtocol {
  sendRequest<T>(method: string, params: unknown): Promise<T>;
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
    stdout.write(JSON.stringify(msg) + "\n");
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
      const req = pending.get(msg.id)!;
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
    sendRequest<T>(method: string, params: unknown): Promise<T> {
      if (closed) return Promise.reject(new Error("Protocol closed"));
      const id = nextId++;
      sendMessage({ jsonrpc: "2.0", id, method, params });
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
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
