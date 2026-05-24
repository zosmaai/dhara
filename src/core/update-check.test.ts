import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, formatUpdateMessage, semverGt } from "./update-check.js";

// ─── Helpers ───────────────────────────────────────────────────────────

function withTempDir(): string {
  return mkdtempSync(join(tmpdir(), "dhara-update-"));
}

function withMockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
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
  const OLD_HOME = process.env.HOME;
  let tempHome: string;

  beforeEach(() => {
    tempHome = withTempDir();
    process.env.HOME = tempHome;
    delete process.env.DHARA_SKIP_UPDATE_CHECK;
    delete process.env.DHARA_OFFLINE;
  });

  afterEach(() => {
    process.env.HOME = OLD_HOME;
    rmSync(tempHome, { recursive: true, force: true });
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

  it("caches the result and uses cached value on subsequent calls", async () => {
    let callCount = 0;
    const restore = withMockFetch(() => {
      callCount++;
      return Promise.resolve(new Response(JSON.stringify({ version: "0.5.0" }), { status: 200 }));
    });
    try {
      // First call — fetches from npm
      const result1 = await checkForUpdate("0.2.0");
      expect(result1).not.toBeNull();
      expect(result1?.latestVersion).toBe("0.5.0");
      expect(callCount).toBe(1);

      // Second call — should use cache, not fetch
      const result2 = await checkForUpdate("0.2.0");
      expect(result2).not.toBeNull();
      expect(result2?.latestVersion).toBe("0.5.0");
      expect(callCount).toBe(1); // Still 1 — no extra fetch
    } finally {
      restore();
    }
  });

  it("times out gracefully when fetch hangs", async () => {
    // Mock fetch that hangs but respects abort signal
    const restore = withMockFetch(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = (init as { signal?: AbortSignal })?.signal;
          if (signal) {
            if (signal.aborted) {
              const err = new Error("The operation was aborted");
              err.name = "AbortError";
              reject(err);
              return;
            }
            signal.addEventListener(
              "abort",
              () => {
                const err = new Error("The operation was aborted");
                err.name = "AbortError";
                reject(err);
              },
              { once: true },
            );
          }
        }),
    );
    try {
      const result = await checkForUpdate("0.1.0");
      // Should return null due to timeout, not hang forever
      expect(result).toBeNull();
    } finally {
      restore();
    }
  }, 15_000); // 15s: 5s fetch timeout + safety margin

  it("returns null from cache when version is current (after cache roll)", async () => {
    // Seed the cache with a check that says "current version matches"
    const dharaDir = join(tempHome, ".dhara");
    mkdirSync(dharaDir, { recursive: true });
    writeFileSync(
      join(dharaDir, "update-check.json"),
      JSON.stringify({ latestVersion: "0.2.0", checkedAt: new Date().toISOString() }),
      "utf-8",
    );

    // Current version matches or exceeds cached latest
    const result = await checkForUpdate("0.3.0");
    expect(result).toBeNull();
  });

  it("returns UpdateInfo from cache for fresh check with newer version", async () => {
    // Seed the cache within the 24h window
    const dharaDir = join(tempHome, ".dhara");
    mkdirSync(dharaDir, { recursive: true });
    writeFileSync(
      join(dharaDir, "update-check.json"),
      JSON.stringify({ latestVersion: "0.5.0", checkedAt: new Date().toISOString() }),
      "utf-8",
    );

    const result = await checkForUpdate("0.2.0");
    expect(result).not.toBeNull();
    expect(result?.latestVersion).toBe("0.5.0");
    expect(result?.currentVersion).toBe("0.2.0");
  });

  it("falls back to cache when network fails and cache has a newer version", async () => {
    // Seed the cache first
    const dharaDir = join(tempHome, ".dhara");
    mkdirSync(dharaDir, { recursive: true });
    writeFileSync(
      join(dharaDir, "update-check.json"),
      JSON.stringify({
        latestVersion: "0.5.0",
        checkedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25h old — expired
      }),
      "utf-8",
    );

    // Network fails
    const restore = withMockFetch(() => Promise.reject(new Error("Network failure")));
    try {
      const result = await checkForUpdate("0.2.0");
      // Falls back to stale cache
      expect(result).not.toBeNull();
      expect(result?.latestVersion).toBe("0.5.0");
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
