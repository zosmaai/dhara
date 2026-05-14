import { describe, expect, it } from "vitest";
import { createPermissionStore } from "./permission-store.js";

describe("PermissionStore", () => {
  it("returns false for unknown keys", () => {
    const store = createPermissionStore();
    expect(store.has("filesystem:write:/tmp/foo")).toBe(false);
  });

  it("returns true after grant", () => {
    const store = createPermissionStore();
    store.grant("filesystem:write:/tmp/foo");
    expect(store.has("filesystem:write:/tmp/foo")).toBe(true);
  });

  it("returns false after grant + revoke", () => {
    const store = createPermissionStore();
    store.grant("network:outbound:api.example.com");
    store.revoke("network:outbound:api.example.com");
    expect(store.has("network:outbound:api.example.com")).toBe(false);
  });

  it("clears all cached permissions", () => {
    const store = createPermissionStore();
    store.grant("a");
    store.grant("b");
    store.clear();
    expect(store.has("a")).toBe(false);
    expect(store.has("b")).toBe(false);
  });

  it("handles multiple independent grants", () => {
    const store = createPermissionStore();
    store.grant("fs:read:/a");
    store.grant("fs:write:/b");
    expect(store.has("fs:read:/a")).toBe(true);
    expect(store.has("fs:write:/b")).toBe(true);
    expect(store.has("fs:read:/b")).toBe(false);
  });
});
