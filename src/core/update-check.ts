import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ─── Constants ─────────────────────────────────────────────────────────

const NPM_REGISTRY_URL = "https://registry.npmjs.org/@zosmaai/dhara/latest";
const UPDATE_CHECK_FILE = "update-check.json";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // Once per day

// ─── Types ─────────────────────────────────────────────────────────────

/**
 * Information about a newer version available on npm.
 */
export interface UpdateInfo {
  /** Latest version published on npm. */
  latestVersion: string;
  /** Currently installed version. */
  currentVersion: string;
}

interface CachedCheck {
  latestVersion: string;
  checkedAt: string; // ISO 8601 timestamp
}

// ─── Semver comparison (minimal, no deps) ──────────────────────────────

/**
 * Compare two semver strings: returns `true` if `a > b`.
 *
 * Supports MAJOR.MINOR.PATCH comparison only (no pre-release tags).
 * Short strings are treated as 0-padded (e.g. "1.2" → "1.2.0").
 */
export function semverGt(a: string, b: string): boolean {
  const toNum = (s: string): number => {
    const n = Number(s);
    return Number.isNaN(n) ? 0 : n;
  };
  const aParts = a.split(".").map(toNum);
  const bParts = b.split(".").map(toNum);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const av = aParts[i] ?? 0;
    const bv = bParts[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
}

// ─── Cache helpers (private) ───────────────────────────────────────────

function getStoragePath(): string {
  return join(homedir(), ".dhara", UPDATE_CHECK_FILE);
}

function readCachedCheck(): CachedCheck | null {
  try {
    const raw = readFileSync(getStoragePath(), "utf-8");
    return JSON.parse(raw) as CachedCheck;
  } catch {
    return null;
  }
}

function writeCachedCheck(info: CachedCheck): void {
  try {
    mkdirSync(join(homedir(), ".dhara"), { recursive: true });
    writeFileSync(getStoragePath(), JSON.stringify(info), "utf-8");
  } catch {
    // Best-effort — don't crash startup over a cache write
  }
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Check whether a newer version of dhara is available on npm.
 *
 * **Design:**
 * - Non-critical — never throws, always resolves.
 * - Caches the result for 24 hours (stored in `~/.dhara/update-check.json`).
 * - Respects `DHARA_SKIP_UPDATE_CHECK=1` to disable all network I/O.
 * - `DHARA_OFFLINE=1` also disables the check.
 * - Uses the cached result even if the 24h window hasn't expired,
 *   so a previously-detected update keeps showing until the cache rolls.
 *
 * @param currentVersion The currently installed dhara version.
 * @returns `UpdateInfo` if a newer version exists, `null` otherwise.
 */
export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  // Respect disable flags
  if (process.env.DHARA_SKIP_UPDATE_CHECK === "1" || process.env.DHARA_OFFLINE === "1") {
    return null;
  }

  // ── Check cache ──────────────────────────────────────────────────
  const cached = readCachedCheck();
  const now = Date.now();

  if (cached) {
    const elapsed = now - new Date(cached.checkedAt).getTime();
    if (elapsed < CHECK_INTERVAL_MS) {
      // Cache is still fresh — use it
      if (semverGt(cached.latestVersion, currentVersion)) {
        return { latestVersion: cached.latestVersion, currentVersion };
      }
      return null;
    }
  }

  // ── Fetch from npm registry ──────────────────────────────────────

  // 5-second timeout to prevent startup hanging on slow / missing networks
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(NPM_REGISTRY_URL, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      // npm returned an error — fall back to cache if available
      if (cached && semverGt(cached.latestVersion, currentVersion)) {
        return { latestVersion: cached.latestVersion, currentVersion };
      }
      return null;
    }

    const data = (await response.json()) as { version?: string };
    const latestVersion = data.version;
    if (!latestVersion) return null;

    // Persist to cache
    writeCachedCheck({ latestVersion, checkedAt: new Date().toISOString() });

    if (semverGt(latestVersion, currentVersion)) {
      return { latestVersion, currentVersion };
    }

    return null;
  } catch {
    // Network failure or timeout — gracefully fall back to cache
    clearTimeout(timeout);
    if (cached && semverGt(cached.latestVersion, currentVersion)) {
      return { latestVersion: cached.latestVersion, currentVersion };
    }
    return null;
  }
}

/**
 * Format an update notification as a single-line user-facing string.
 */
export function formatUpdateMessage(info: UpdateInfo): string {
  return (
    `Update available: ${info.latestVersion} (current: ${info.currentVersion}). ` +
    `Run "npm update -g @zosmaai/dhara" to upgrade.`
  );
}
