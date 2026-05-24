import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, formatUpdateMessage, semverGt } from "./update-check.js";

// ─── Helpers ───────────────────────────────────────────────────────────

function withMockFetch(impl: () => Response) {
  const orig = globalThis.fetch;
  globalThis.fetch = vi.fn(impl);
  return () => {
    globalThis.fetch = orig;
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe("semverGt", () => {
  it("returns true when a > b", () => {
    expect(semverGt("0.2.0", "0.1.0")).toBe(true);
    expect(semverGt("1.0.0", "0.9.9")).toBe(true);
    expect(semverGt("0.10.0", "0.9.0")).toBe(true);
    expect(semverGt("0.1.1", "0.1.0")).toBe(true);
  });

  it("returns false when a < b", () => {
    expect(semverGt("0.1.0", "0.2.0")).toBe(false);
    expect(semverGt("0.9.9", "1.0.0")).toBe(false);
    expect(semverGt("0.1.0", "0.1.1")).toBe(false);
  });

  it("returns false when a === b", () => {
    expect(semverGt("0.1.0", "0.1.0")).toBe(false);
    expect(semverGt("1.0.0", "1.0.0")).toBe(false);
  });

  it("handles unequal part lengths (2 vs 3 parts)", () => {
    expect(semverGt("1.0", "0.9.9")).toBe(true);
    expect(semverGt("0.9", "1.0.0")).toBe(false);
    expect(semverGt("1.0", "1.0.0")).toBe(false);
  });

  it("handles more than 3 parts", () => {
    expect(semverGt("0.1.0.1", "0.1.0")).toBe(true);
    expect(semverGt("0.1.0", "0.1.0.1")).toBe(false);
  });

  it("handles non-numeric parts gracefully", () => {
    expect(semverGt("0.1.0-alpha", "0.1.0")).toBe(false);
    expect(semverGt("0.1.1", "0.1.0-alpha")).toBe(true);
  });
});

describe("checkForUpdate", () => {
  beforeEach(() => {
    delete process.env.DHARA_SKIP_UPDATE_CHECK;
    delete process.env.DHARA_OFFLINE;
  });

  it("returns null when DHARA_SKIP_UPDATE_CHECK=1", async () => {
    process.env.DHARA_SKIP_UPDATE_CHECK = "1";
    const result = await checkForUpdate("0.1.0");
    expect(result).toBeNull();
  });

  it("returns null when DHARA_OFFLINE=1", async () => {
    process.env.DHARA_OFFLINE = "1";
    const result = await checkForUpdate("0.1.0");
    expect(result).toBeNull();
  });

  it("returns UpdateInfo when npm has a newer version", async () => {
    const restore = withMockFetch(() =>
      Promise.resolve(new Response(JSON.stringify({ version: "0.2.0" }), { status: 200 })),
    );
    try {
      const result = await checkForUpdate("0.1.0");
      expect(result).not.toBeNull();
      expect(result?.latestVersion).toBe("0.2.0");
      expect(result?.currentVersion).toBe("0.1.0");
    } finally {
      restore();
    }
  });

  it("returns null when current version is already latest", async () => {
    const restore = withMockFetch(() =>
      Promise.resolve(new Response(JSON.stringify({ version: "0.1.0" }), { status: 200 })),
    );
    try {
      const result = await checkForUpdate("0.1.0");
      expect(result).toBeNull();
    } finally {
      restore();
    }
  });

  it("returns null when npm registry call fails", async () => {
    const restore = withMockFetch(() => Promise.reject(new Error("Network failure")));
    try {
      const result = await checkForUpdate("0.1.0");
      expect(result).toBeNull();
    } finally {
      restore();
    }
  });

  it("returns null when npm returns non-200", async () => {
    const restore = withMockFetch(() =>
      Promise.resolve(new Response("Not Found", { status: 404 })),
    );
    try {
      const result = await checkForUpdate("0.1.0");
      expect(result).toBeNull();
    } finally {
      restore();
    }
  });

  it("returns null when npm response has no version field", async () => {
    const restore = withMockFetch(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
    );
    try {
      const result = await checkForUpdate("0.1.0");
      expect(result).toBeNull();
    } finally {
      restore();
    }
  });

  it("passes an AbortSignal to fetch for timeout protection", async () => {
    const restore = withMockFetch(() =>
      Promise.resolve(new Response(JSON.stringify({ version: "0.2.0" }), { status: 200 })),
    );
    try {
      await checkForUpdate("0.1.0");
      const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
      expect(mockFetch).toHaveBeenCalledOnce();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs).toHaveLength(2);
      expect(callArgs[1]).toBeDefined();
      expect(callArgs[1].signal).toBeDefined();
    } finally {
      restore();
    }
  });
});

describe("formatUpdateMessage", () => {
  it("formats a user-facing update message", () => {
    const msg = formatUpdateMessage({ latestVersion: "0.2.0", currentVersion: "0.1.0" });
    expect(msg).toContain("0.2.0");
    expect(msg).toContain("0.1.0");
    expect(msg).toContain("npm update -g @zosmaai/dhara");
  });
});
