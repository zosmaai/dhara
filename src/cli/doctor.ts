/**
 * `dhara doctor` — diagnostic command.
 *
 * Checks the Dhara installation, configuration, and environment
 * for common issues.
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ConfigManager } from "../core/config.js";

interface CheckResult {
  name: string;
  status: "ok" | "warn" | "fail";
  message: string;
}

function checkPass(name: string, message: string): CheckResult {
  return { name, status: "ok", message };
}

function checkWarn(name: string, message: string): CheckResult {
  return { name, status: "warn", message };
}

function checkFail(name: string, message: string): CheckResult {
  return { name, status: "fail", message };
}

export function runDoctor(configManager: ConfigManager): void {
  const results: CheckResult[] = [];

  // ── Node.js version ──
  const nodeVersion = process.version;
  const nodeMajor = Number(nodeVersion.slice(1).split(".")[0]);
  if (nodeMajor >= 20) {
    results.push(checkPass("Node.js version", `Node ${nodeVersion}`));
  } else {
    results.push(checkFail("Node.js version", `Node ${nodeVersion} (need >= 20)`));
  }

  // ── Dhara storage directory ──
  const dharaDir = join(homedir(), ".dhara");
  const dharaDirExists = existsSync(dharaDir);
  if (dharaDirExists) {
    results.push(checkPass("~/.dhara directory", "Exists"));
  } else {
    results.push(checkFail("~/.dhara directory", "Not found — run dhara to initialize"));
  }

  // ── Config file ──
  const configPath = configManager.configPath;
  const configExists = existsSync(configPath);
  if (configExists) {
    results.push(checkPass("Config file", configPath));
  } else if (dharaDirExists) {
    results.push(checkWarn("Config file", "Not found (using defaults)"));
  } else {
    results.push(checkWarn("Config file", "N/A (no .dhara dir)"));
  }

  // ── Active provider ──
  const activeProvider = configManager.getActiveProvider();
  if (activeProvider) {
    results.push(checkPass("Active provider", `${activeProvider.id} (${activeProvider.name})`));
  } else {
    results.push(
      checkWarn("Active provider", "None configured — set one with `dhara config set-provider`"),
    );
  }

  // ── API keys configured ──
  const providers = configManager.listProviders();
  let configuredKeys = 0;
  for (const p of providers) {
    const apiKey = configManager.getApiKey(p.id);
    if (apiKey) configuredKeys++;
  }
  if (configuredKeys > 0) {
    results.push(
      checkPass("API keys configured", `${configuredKeys}/${providers.length} providers`),
    );
  } else {
    results.push(checkWarn("API keys configured", "None — `dhara config set-provider <id> <key>`"));
  }

  // ── Environment variables ──
  const relevantEnvVars = [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENCODE_API_KEY",
    "DHARA_API_KEY",
    "GOOGLE_API_KEY",
    "MISTRAL_API_KEY",
    "GROQ_API_KEY",
    "DEEPSEEK_API_KEY",
  ];
  const envKeysFound = relevantEnvVars.filter((v) => process.env[v]);
  if (envKeysFound.length > 0) {
    results.push(
      checkPass("API key env vars", `${envKeysFound.length} set: ${envKeysFound.join(", ")}`),
    );
  } else {
    results.push(checkWarn("API key env vars", "None set in environment"));
  }

  // ── Git ──
  try {
    execSync("git --version", { stdio: "pipe", encoding: "utf-8" });
    results.push(checkPass("Git", "Available"));
  } catch {
    results.push(checkWarn("Git", "Not found in PATH"));
  }

  // ── Session directory ──
  const sessionDir = join(dharaDir, "sessions");
  const sessionDirExists = existsSync(sessionDir);
  if (sessionDirExists) {
    results.push(checkPass("Session storage", sessionDir));
  } else if (dharaDirExists) {
    results.push(
      checkPass("Session storage", "Not yet created (will be created on first session)"),
    );
  } else {
    results.push(checkWarn("Session storage", "N/A (no .dhara dir)"));
  }

  // ── Session count ──
  let sessionCount = 0;
  if (sessionDirExists) {
    try {
      sessionCount = readdirSync(sessionDir).filter((f) => f.endsWith(".jsonl")).length;
    } catch {
      // ignore
    }
  }
  results.push(checkPass("Saved sessions", `${sessionCount} session file(s)`));

  // ── Home directory ──
  try {
    const home = homedir();
    statSync(home);
    results.push(checkPass("Home directory", home));
  } catch {
    results.push(checkFail("Home directory", "Cannot access"));
  }

  // ── Terminal capability ──
  if (process.stdout.isTTY) {
    results.push(checkPass("Terminal", `TTY: ${process.env.TERM ?? "unknown"}`));
  } else {
    results.push(checkPass("Terminal", "Non-TTY (piped/CI mode)"));
  }

  // ── Display results ──
  let ok = 0;
  let warnings = 0;
  let fail = 0;

  process.stdout.write("\n  Dhara Diagnostic Report\n");
  process.stdout.write("  ═══════════════════════\n\n");

  for (const r of results) {
    const icon = r.status === "ok" ? "✓" : r.status === "warn" ? "⚠" : "✗";
    const tag = r.status === "ok" ? "OK" : r.status === "warn" ? "WARN" : "FAIL";
    process.stdout.write(`  ${icon} [${tag}] ${r.name}\n`);
    process.stdout.write(`    ${r.message}\n\n`);

    if (r.status === "ok") ok++;
    else if (r.status === "warn") warnings++;
    else fail++;
  }

  process.stdout.write(`  Summary: ${ok} passed, ${warnings} warnings, ${fail} failures\n`);

  if (fail > 0) {
    process.exit(1);
  }
}
