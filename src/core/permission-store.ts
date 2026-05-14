/**
 * Permission store for caching approved user decisions.
 *
 * Avoids prompting the user for every repeated capability check.
 * Stores approvals per capability key (e.g., "filesystem:write:/tmp/foo").
 */

export interface PermissionStore {
  /** Check if a permission has been previously approved. */
  has(capabilityKey: string): boolean;
  /** Mark a permission as approved (for this session). */
  grant(capabilityKey: string): void;
  /** Revoke a specific permission. */
  revoke(capabilityKey: string): void;
  /** Clear all cached permissions. */
  clear(): void;
}

/**
 * Create an in-memory permission store.
 */
export function createPermissionStore(): PermissionStore {
  const approved = new Set<string>();

  return {
    has(capabilityKey: string): boolean {
      return approved.has(capabilityKey);
    },

    grant(capabilityKey: string): void {
      approved.add(capabilityKey);
    },

    revoke(capabilityKey: string): void {
      approved.delete(capabilityKey);
    },

    clear(): void {
      approved.clear();
    },
  };
}
