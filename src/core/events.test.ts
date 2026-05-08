import { describe, expect, it, vi } from "vitest";
import { createEventBus, type HookResult } from "./events.js";

function allow(): HookResult {
  return { action: "allow" };
}

function block(reason?: string): HookResult {
  return { action: "block", reason };
}

describe("EventBus", () => {
  describe("subscribe + emit", () => {
    it("delivers events to subscribers", () => {
      const bus = createEventBus();
      const handler = vi.fn(() => allow());

      bus.subscribe("tool:call_start", handler);
      const result = bus.emit("tool:call_start", { toolName: "read" });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ toolName: "read" });
      expect(result).toEqual({ blocked: false });
    });

    it("delivers to multiple subscribers in order", () => {
      const bus = createEventBus();
      const order: number[] = [];

      bus.subscribe("ev", () => {
        order.push(1);
        return allow();
      });
      bus.subscribe("ev", () => {
        order.push(2);
        return allow();
      });
      bus.emit("ev", {});

      expect(order).toEqual([1, 2]);
    });
  });

  describe("unsubscribe", () => {
    it("removes a specific subscriber", () => {
      const bus = createEventBus();
      const handler = vi.fn(() => allow());

      const unsubscribe = bus.subscribe("ev", handler);
      unsubscribe();
      bus.emit("ev", {});

      expect(handler).not.toHaveBeenCalled();
    });

    it("removes only the targeted subscriber", () => {
      const bus = createEventBus();
      const a = vi.fn(() => allow());
      const b = vi.fn(() => allow());

      bus.subscribe("ev", a);
      const unsubB = bus.subscribe("ev", b);
      unsubB();
      bus.emit("ev", {});

      expect(a).toHaveBeenCalledTimes(1);
      expect(b).not.toHaveBeenCalled();
    });

    it("cleans up empty event entries", () => {
      const bus = createEventBus();
      const unsub = bus.subscribe("ev", () => allow());

      expect(bus.listenerCount("ev")).toBe(1);
      unsub();
      expect(bus.listenerCount("ev")).toBe(0);
    });
  });

  describe("blocking hooks", () => {
    it("vetoes events when a blocking hook returns block", () => {
      const bus = createEventBus();
      const normal = vi.fn(() => allow());

      bus.subscribe("ev", () => block("unsafe"), { blocking: true });
      bus.subscribe("ev", normal);

      const result = bus.emit("ev", {});

      expect(result).toEqual({ blocked: true, reason: "unsafe" });
      expect(normal).not.toHaveBeenCalled();
    });

    it("allows events when all blocking hooks return allow", () => {
      const bus = createEventBus();
      const normal = vi.fn(() => allow());

      bus.subscribe("ev", () => allow(), { blocking: true });
      bus.subscribe("ev", normal);

      const result = bus.emit("ev", {});

      expect(result).toEqual({ blocked: false });
      expect(normal).toHaveBeenCalledTimes(1);
    });

    it("evaluates blocking hooks in subscription order", () => {
      const bus = createEventBus();
      const order: string[] = [];

      bus.subscribe(
        "ev",
        () => {
          order.push("first");
          return allow();
        },
        { blocking: true },
      );
      bus.subscribe(
        "ev",
        () => {
          order.push("second");
          return block("second");
        },
        { blocking: true },
      );
      bus.subscribe(
        "ev",
        () => {
          order.push("third");
          return allow();
        },
        { blocking: true },
      );

      bus.emit("ev", {});

      // Only first two evaluated — second blocks, third never runs
      expect(order).toEqual(["first", "second"]);
    });

    it("blocks when a blocking hook throws (fail-closed)", () => {
      const bus = createEventBus();
      const normal = vi.fn(() => allow());

      bus.subscribe(
        "ev",
        () => {
          throw new Error("hook crashed");
        },
        { blocking: true },
      );
      bus.subscribe("ev", normal);

      const result = bus.emit("ev", {});

      expect(result).toEqual({ blocked: true, reason: "Blocking hook error: hook crashed" });
      expect(normal).not.toHaveBeenCalled();
    });
  });

  describe("non-blocking error isolation", () => {
    it("skips a crashing non-blocking listener and continues to others", () => {
      const bus = createEventBus();
      const order: number[] = [];

      bus.subscribe("ev", () => {
        order.push(1);
        return allow();
      });
      bus.subscribe("ev", () => {
        throw new Error("crash");
      });
      bus.subscribe("ev", () => {
        order.push(3);
        return allow();
      });

      bus.emit("ev", {});

      expect(order).toEqual([1, 3]);
    });

    it("does not affect the emit result when a non-blocking listener crashes", () => {
      const bus = createEventBus();

      bus.subscribe("ev", () => {
        throw new Error("crash");
      });

      const result = bus.emit("ev", {});
      expect(result).toEqual({ blocked: false });
    });
  });

  describe("listenerCount", () => {
    it("returns 0 for events with no listeners", () => {
      expect(createEventBus().listenerCount("unknown")).toBe(0);
    });

    it("returns the correct count after subscribe and unsubscribe", () => {
      const bus = createEventBus();
      const unsub1 = bus.subscribe("ev", () => allow());
      const unsub2 = bus.subscribe("ev", () => allow());

      expect(bus.listenerCount("ev")).toBe(2);
      unsub1();
      expect(bus.listenerCount("ev")).toBe(1);
      unsub2();
      expect(bus.listenerCount("ev")).toBe(0);
    });
  });

  describe("cross-event isolation", () => {
    it("does not deliver events to listeners of different types", () => {
      const bus = createEventBus();
      const handler = vi.fn(() => allow());

      bus.subscribe("session:start", handler);
      bus.emit("tool:call_start", {});

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
