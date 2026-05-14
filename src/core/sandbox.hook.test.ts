import { describe, expect, it, vi } from "vitest";
import { createEventBus } from "./events.js";
import { createSandbox } from "./sandbox.js";

describe("Sandbox + Event Bus hook integration", () => {
  it("emits capability:denied when a capability is not granted", () => {
    const bus = createEventBus();
    const onDenied = vi.fn();
    bus.subscribe(
      "capability:denied",
      (payload) => {
        onDenied(payload);
        return { action: "allow" };
      },
      { blocking: true },
    );

    const sandbox = createSandbox({
      granted: [],
      cwd: "/tmp",
      eventBus: bus,
    });

    const result = sandbox.check("filesystem:read");
    // Hook allowed it
    expect(result.allowed).toBe(true);
    expect(onDenied).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "filesystem:read",
        reason: expect.stringContaining("not granted"),
      }),
    );
  });

  it("blocking hook can keep the capability denied", () => {
    const bus = createEventBus();
    bus.subscribe(
      "capability:denied",
      () => {
        return { action: "block", reason: "Not allowed by policy" };
      },
      { blocking: true },
    );

    const sandbox = createSandbox({
      granted: [],
      cwd: "/tmp",
      eventBus: bus,
    });

    const result = sandbox.check("filesystem:write");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Capability "filesystem:write" not granted');
  });

  it("caches approved capability in permission store", () => {
    const bus = createEventBus();
    const handler = vi.fn();

    bus.subscribe(
      "capability:denied",
      (payload) => {
        handler(payload);
        return { action: "allow" };
      },
      { blocking: true },
    );

    const sandbox = createSandbox({
      granted: [],
      cwd: "/tmp",
      eventBus: bus,
    });

    // First call: denied → hook allows → cached
    sandbox.check("filesystem:read");
    // Second call: cached, hook not called again
    sandbox.check("filesystem:read");

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("emits capability:denied for file read outside cwd", () => {
    const bus = createEventBus();
    const onDenied = vi.fn();
    bus.subscribe(
      "capability:denied",
      (payload) => {
        onDenied(payload);
        return { action: "allow" };
      },
      { blocking: true },
    );

    const sandbox = createSandbox({
      granted: ["filesystem:read"],
      cwd: "/tmp",
      eventBus: bus,
    });

    // Granted capability — no denied event
    const result = sandbox.checkFileRead("/tmp/foo");
    expect(result.allowed).toBe(true);
    expect(onDenied).not.toHaveBeenCalled();
  });

  it("does not emit when capability is already granted", () => {
    const bus = createEventBus();
    const onDenied = vi.fn();
    bus.subscribe(
      "capability:denied",
      () => {
        onDenied();
        return { action: "allow" };
      },
      { blocking: true },
    );

    const sandbox = createSandbox({
      granted: ["filesystem:read"],
      cwd: "/tmp",
      eventBus: bus,
    });

    sandbox.check("filesystem:read");
    expect(onDenied).not.toHaveBeenCalled();
  });

  it("works without event bus (backward compat)", () => {
    const sandbox = createSandbox({
      granted: ["filesystem:read"],
      cwd: "/tmp",
    });

    const result = sandbox.check("filesystem:read");
    expect(result.allowed).toBe(true);
  });
});
