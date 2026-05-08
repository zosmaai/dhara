import { describe, expect, it, vi } from "vitest";
import { createEventBus } from "./events.js";

describe("EventBus", () => {
  it("should emit events to subscribers", () => {
    const bus = createEventBus();
    const listener = vi.fn();

    bus.subscribe("tool:call_start", listener);
    bus.emit("tool:call_start", { toolName: "read", input: { path: "/tmp" } });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ toolName: "read", input: { path: "/tmp" } });
  });

  it("should support multiple subscribers", () => {
    const bus = createEventBus();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    bus.subscribe("tool:call_start", listener1);
    bus.subscribe("tool:call_start", listener2);
    bus.emit("tool:call_start", { toolName: "read", input: {} });

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it("should return an unsubscribe function", () => {
    const bus = createEventBus();
    const listener = vi.fn();

    const unsubscribe = bus.subscribe("tool:call_start", listener);
    unsubscribe();
    bus.emit("tool:call_start", { toolName: "read", input: {} });

    expect(listener).not.toHaveBeenCalled();
  });

  it("should support blocking hooks that can veto events", () => {
    const bus = createEventBus();
    const blockingHook = vi.fn(() => ({ block: true, reason: "test" }));
    const normalListener = vi.fn();

    bus.subscribe("tool:call_start", blockingHook, { blocking: true });
    bus.subscribe("tool:call_start", normalListener);

    const result = bus.emit("tool:call_start", { toolName: "read", input: {} });

    expect(result).toEqual({ blocked: true, reason: "test" });
    expect(blockingHook).toHaveBeenCalledTimes(1);
    expect(normalListener).not.toHaveBeenCalled();
  });

  it("should emit to all listeners if no blocking hook vetoes", () => {
    const bus = createEventBus();
    const blockingHook = vi.fn(() => ({ block: false }));
    const normalListener = vi.fn();

    bus.subscribe("tool:call_start", blockingHook, { blocking: true });
    bus.subscribe("tool:call_start", normalListener);

    const result = bus.emit("tool:call_start", { toolName: "read", input: {} });

    expect(result).toEqual({ blocked: false });
    expect(blockingHook).toHaveBeenCalledTimes(1);
    expect(normalListener).toHaveBeenCalledTimes(1);
  });

  it("should not emit to listeners of different event types", () => {
    const bus = createEventBus();
    const listener = vi.fn();

    bus.subscribe("session:start", listener);
    bus.emit("tool:call_start", { toolName: "read", input: {} });

    expect(listener).not.toHaveBeenCalled();
  });
});
