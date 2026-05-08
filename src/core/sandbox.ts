/**
 * A capability represents a permission that an extension can request.
 *
 * Examples: `"filesystem:read"`, `"network:outbound"`, `"process:spawn"`
 */
export type Capability = string;

/**
 * Result of a sandbox permission check.
 */
export type PermissionResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Audit log entry for every sandbox check.
 */
export interface AuditEntry {
  capability: string;
  allowed: boolean;
  reason?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

/**
 * Configuration for the sandbox.
 */
export interface SandboxConfig {
  /** List of granted capabilities */
  granted: Capability[];
  /** Current working directory for path checks */
  cwd?: string;
  /** Allowed outbound domains (empty = all allowed) */
  allowedDomains?: string[];
  /** Allowed process commands (empty = all allowed) */
  allowedCommands?: string[];
  /** Optional audit log callback */
  onAudit?: (entry: AuditEntry) => void;
}

/**
 * A capability-based sandbox that enforces security boundaries.
 *
 * The sandbox does not execute operations — it only checks whether
 * an operation is permitted. Tools call the sandbox before acting.
 */
export interface Sandbox {
  /** Check a generic capability */
  check(capability: Capability): PermissionResult;
  /** Check file read permission */
  checkFileRead(path: string): PermissionResult;
  /** Check file write permission */
  checkFileWrite(path: string): PermissionResult;
  /** Check network outbound permission */
  checkNetworkOutbound(url: string): PermissionResult;
  /** Check process spawn permission */
  checkProcessSpawn(command: string): PermissionResult;
}

function resolvePath(cwd: string, inputPath: string): string {
  // Normalize path separators
  const normalized = inputPath.replace(/\\/g, "/");

  // If absolute, use as-is (will be checked against cwd)
  if (normalized.startsWith("/")) {
    return normalized;
  }

  // Relative — resolve against cwd
  return `${cwd}/${normalized}`.replace(/\/+/g, "/");
}

function isWithinCwd(cwd: string, targetPath: string): boolean {
  // Ensure both end with / for prefix matching
  const cwdNormalized = cwd.endsWith("/") ? cwd : `${cwd}/`;
  const resolved = resolvePath(cwd, targetPath);

  // Resolve ".." segments
  const parts = resolved.split("/").filter(Boolean);
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "..") {
      if (stack.length === 0) return false; // Escaped above root
      stack.pop();
    } else if (part !== ".") {
      stack.push(part);
    }
  }

  const finalPath = `/${stack.join("/")}`;
  return finalPath === cwd || finalPath.startsWith(cwdNormalized);
}

function parseDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    // Try parsing as domain directly
    return url.split("/")[0] || null;
  }
}

function parseCommand(command: string): string {
  return command.trim().split(/\s+/)[0] ?? "";
}

function matchesCapability(granted: string[], requested: string): boolean {
  for (const cap of granted) {
    // Exact match
    if (cap === requested) return true;
    // Wildcard: "filesystem:*" matches "filesystem:read"
    if (cap.endsWith(":*")) {
      const prefix = cap.slice(0, -1); // "filesystem:"
      if (requested.startsWith(prefix) && requested !== prefix.slice(0, -1)) {
        return true;
      }
    }
  }
  return false;
}

export function createSandbox(config: SandboxConfig): Sandbox {
  const cwd = config.cwd ?? process.cwd();
  const granted = config.granted;
  const allowedDomains = config.allowedDomains;
  const allowedCommands = config.allowedCommands;
  const onAudit = config.onAudit;

  function audit(
    capability: string,
    result: PermissionResult,
    details?: Record<string, unknown>
  ): void {
    if (!onAudit) return;
    onAudit({
      capability,
      allowed: result.allowed,
      reason: result.allowed ? undefined : result.reason,
      timestamp: new Date().toISOString(),
      details,
    });
  }

  function checkGeneric(capability: string): PermissionResult {
    if (matchesCapability(granted, capability)) {
      return { allowed: true };
    }
    return { allowed: false, reason: `Capability "${capability}" not granted` };
  }

  return {
    check(capability: string): PermissionResult {
      const result = checkGeneric(capability);
      audit(capability, result);
      return result;
    },

    checkFileRead(path: string): PermissionResult {
      const capResult = checkGeneric("filesystem:read");
      if (!capResult.allowed) {
        audit("filesystem:read", capResult, { path });
        return capResult;
      }

      if (!isWithinCwd(cwd, path)) {
        const result: PermissionResult = {
          allowed: false,
          reason: `Path "${path}" is outside cwd "${cwd}"`,
        };
        audit("filesystem:read", result, { path });
        return result;
      }

      audit("filesystem:read", { allowed: true }, { path });
      return { allowed: true };
    },

    checkFileWrite(path: string): PermissionResult {
      const capResult = checkGeneric("filesystem:write");
      if (!capResult.allowed) {
        audit("filesystem:write", capResult, { path });
        return capResult;
      }

      if (!isWithinCwd(cwd, path)) {
        const result: PermissionResult = {
          allowed: false,
          reason: `Path "${path}" is outside cwd "${cwd}"`,
        };
        audit("filesystem:write", result, { path });
        return result;
      }

      audit("filesystem:write", { allowed: true }, { path });
      return { allowed: true };
    },

    checkNetworkOutbound(url: string): PermissionResult {
      const capResult = checkGeneric("network:outbound");
      if (!capResult.allowed) {
        audit("network:outbound", capResult, { url });
        return capResult;
      }

      if (allowedDomains && allowedDomains.length > 0) {
        const domain = parseDomain(url);
        if (!domain || !allowedDomains.includes(domain)) {
          const result: PermissionResult = {
            allowed: false,
            reason: `Domain "${domain ?? url}" is not in allowed list`,
          };
          audit("network:outbound", result, { url });
          return result;
        }
      }

      audit("network:outbound", { allowed: true }, { url });
      return { allowed: true };
    },

    checkProcessSpawn(command: string): PermissionResult {
      const capResult = checkGeneric("process:spawn");
      if (!capResult.allowed) {
        audit("process:spawn", capResult, { command });
        return capResult;
      }

      if (allowedCommands && allowedCommands.length > 0) {
        const cmd = parseCommand(command);
        if (!allowedCommands.includes(cmd)) {
          const result: PermissionResult = {
            allowed: false,
            reason: `Command "${cmd}" is not in allowed list`,
          };
          audit("process:spawn", result, { command });
          return result;
        }
      }

      audit("process:spawn", { allowed: true }, { command });
      return { allowed: true };
    },
  };
}
