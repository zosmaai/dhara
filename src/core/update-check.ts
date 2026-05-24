// ─── Constants ─────────────────────────────────────────────────────────

const NPM_REGISTRY_URL = "https://registry.npmjs.org/@zosmaai/dhara/latest";

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

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Check whether a newer version of dhara is available on npm.
 *
 * **Design:**
 * - Non-critical — never throws, always resolves.
 * - Runs every time dhara starts (no cache — it's a tiny 200-byte CDN request).
 * - Respects `DHARA_SKIP_UPDATE_CHECK=1` to disable all network I/O.
 * - `DHARA_OFFLINE=1` also disables the check.
 *
 * @param currentVersion The currently installed dhara version.
 * @returns `UpdateInfo` if a newer version exists, `null` otherwise.
 */
export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  // Respect disable flags
  if (process.env.DHARA_SKIP_UPDATE_CHECK === "1" || process.env.DHARA_OFFLINE === "1") {
    return null;
  }

  // 5-second timeout to prevent hanging on slow / missing networks
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(NPM_REGISTRY_URL, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = (await response.json()) as { version?: string };
    const latestVersion = data.version;
    if (!latestVersion) return null;

    if (semverGt(latestVersion, currentVersion)) {
      return { latestVersion, currentVersion };
    }

    return null;
  } catch {
    clearTimeout(timeout);
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
