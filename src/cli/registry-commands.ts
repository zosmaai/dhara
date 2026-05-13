/**
 * Registry CLI commands for `dhara registry ...`.
 *
 * These operate on the extension package registry.
 */
import type { ConfigManager } from "../core/config.js";

interface PackageInfo {
  name: string;
  version: string;
  description: string;
  author?: string;
  license?: string;
  capabilities?: string[];
  tools?: string[];
  downloads?: number;
  updatedAt?: string;
}

const DEFAULT_REGISTRY = "https://registry.dhara.zosma.ai";

// ── Help ──

function printRegistryUsage(): void {
  process.stdout.write(`Usage: dhara registry <subcommand> [args]

Subcommands:
  search <query>           Search for packages
  info <package>           Show package details
  install <package>        Install a package (via manifest link)
  publish                  Publish current directory as package
  list                     List installed packages
`);
}

// ── API helpers ──

function registryUrl(path: string): string {
  const base = process.env.DHARA_REGISTRY ?? DEFAULT_REGISTRY;
  return `${base}/api/v1${path}`;
}

async function apiGet(path: string): Promise<unknown> {
  const url = registryUrl(path);
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Registry responded with ${resp.status}: ${resp.statusText}`);
    }
    return resp.json() as Promise<unknown>;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Registry request failed: ${msg}`);
  }
}

// ── Handlers ──

async function handleSearch(query: string | undefined): Promise<void> {
  if (!query) {
    process.stderr.write("Error: 'registry search' requires a query.\n");
    process.exit(1);
  }

  try {
    const data = await apiGet(`/packages?q=${encodeURIComponent(query)}`);
    const results = (data as { packages?: PackageInfo[] }).packages ?? [];
    if (results.length === 0) {
      process.stdout.write(`No packages found for "${query}".\n`);
      return;
    }

    process.stdout.write(`Found ${results.length} package(s):\n\n`);
    for (const pkg of results) {
      process.stdout.write(
        `  ${pkg.name.padEnd(30)} ${pkg.version.padEnd(10)} ${pkg.description.slice(0, 50)}\n`,
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${msg}\n`);
    process.exit(1);
  }
}

async function handleInfo(pkgName: string | undefined): Promise<void> {
  if (!pkgName) {
    process.stderr.write("Error: 'registry info' requires a package name.\n");
    process.exit(1);
  }

  try {
    const pkg = (await apiGet(`/packages/${encodeURIComponent(pkgName)}`)) as PackageInfo;
    const out: string[] = [];
    out.push(`Package:    ${pkg.name}`);
    out.push(`Version:    ${pkg.version}`);
    out.push(`License:    ${pkg.license ?? "N/A"}`);
    out.push(`Downloads:  ${pkg.downloads ?? 0}`);
    if (pkg.description) out.push(`Description: ${pkg.description}`);
    if (pkg.tools?.length) out.push(`Tools:       ${pkg.tools.join(", ")}`);
    if (pkg.capabilities?.length) out.push(`Capabilities: ${pkg.capabilities.join(", ")}`);
    process.stdout.write(`${out.join("\n")}\n`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${msg}\n`);
    process.exit(1);
  }
}

async function handleInstall(pkgName: string | undefined): Promise<void> {
  if (!pkgName) {
    process.stderr.write("Error: 'registry install' requires a package name.\n");
    process.exit(1);
  }

  try {
    const pkg = (await apiGet(`/packages/${encodeURIComponent(pkgName)}`)) as PackageInfo;
    process.stdout.write(
      `Installing ${pkgName}@${pkg.version}...\n  (Installation from registry requires the registry server to be running)\n  To manually install:\n    mkdir -p ~/.dhara/extensions/${pkgName}\n    # Download package files into ~/.dhara/extensions/${pkgName}/\n    # Ensure manifest.json is present\n`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${msg}\n`);
    process.exit(1);
  }
}

// ── Entry point ──

export async function handleRegistrySubcommand(
  _configManager: ConfigManager,
  args: string[],
): Promise<void> {
  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h") {
    printRegistryUsage();
    return;
  }

  switch (sub) {
    case "search":
      await handleSearch(args[1]);
      break;
    case "info":
      await handleInfo(args[1]);
      break;
    case "install":
      await handleInstall(args[1]);
      break;
    case "list":
      process.stdout.write("Installed packages:\n");
      process.stdout.write("  (Check ~/.dhara/extensions/ for installed packages)\n");
      break;
    default:
      process.stderr.write(`Error: Unknown registry subcommand: ${sub}\n`);
      printRegistryUsage();
      process.exit(1);
  }
}
