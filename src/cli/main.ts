#!/usr/bin/env node

import { createAgentLoop } from "../core/agent-loop.js";
import type { Provider } from "../core/provider.js";
import { createSandbox } from "../core/sandbox.js";
import { createSession } from "../core/session.js";
import { createAnthropicProvider } from "../std/providers/anthropic-provider.js";
import { createOpenAIProvider } from "../std/providers/openai-provider.js";
import { createStandardToolMap } from "../std/tools/index.js";

/**
 * Known providers with their default model, base URL, and env var name.
 */
const KNOWN_PROVIDERS: Record<
  string,
  { defaultModel: string; defaultBaseUrl?: string; envVar: string }
> = {
  openai: {
    defaultModel: "gpt-4o",
    envVar: "OPENAI_API_KEY",
  },
  anthropic: {
    defaultModel: "claude-sonnet-4-20250514",
    envVar: "ANTHROPIC_API_KEY",
  },
  "opencode-go": {
    defaultModel: "deepseek-v4-flash",
    defaultBaseUrl: "https://opencode.ai/zen/go/v1",
    envVar: "OPENCODE_API_KEY",
  },
};

function printUsage(): void {
  process.stdout.write(`dhara — The Agent Protocol Standard

Usage:
  dhara <prompt> [options]

Options:
  --provider <name>   LLM provider.
                      Known: openai, anthropic, opencode-go
                      Default: opencode-go
  --model <id>        Model ID (e.g. "deepseek-v4-flash", "gpt-4o")
  --base-url <url>    Custom API base URL (e.g. "https://opencode.ai/zen/go/v1")
  --cwd <path>        Working directory (default: current directory)
  --help              Show this help message

Environment:
  Known providers use conventional env vars:
    OPENCODE_API_KEY   API key for opencode-go
    OPENAI_API_KEY     API key for openai
    ANTHROPIC_API_KEY  API key for anthropic
  For custom providers, set DHARA_API_KEY as fallback.

Examples:
  dhara "List the files in this project"
  dhara --model deepseek-v4-pro "Review the code for bugs"
  dhara --provider openai --model gpt-4o "Write a test"
`);
}

function getArg(args: string[], name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

const OPTION_NAMES = new Set([
  "help",
  "provider",
  "model",
  "base-url",
  "cwd",
]);

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const rawProvider = getArg(args, "provider") ?? "opencode-go";
  const providerName = rawProvider in KNOWN_PROVIDERS ? rawProvider : rawProvider;

  const providerInfo = KNOWN_PROVIDERS[providerName];
  const modelId = getArg(args, "model") ?? providerInfo?.defaultModel ?? "deepseek-v4-flash";
  const baseUrl = getArg(args, "base-url") ?? providerInfo?.defaultBaseUrl;
  const cwd = getArg(args, "cwd") ?? process.cwd();

  // Gather the prompt (skip option flags and their values)
  const promptParts: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const optName = args[i].slice(2);
      if (OPTION_NAMES.has(optName)) {
        if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
          i++;
        }
      }
      continue;
    }
    promptParts.push(args[i]);
  }

  const prompt = promptParts.join(" ");
  if (!prompt) {
    process.stderr.write("Error: No prompt provided.\n");
    printUsage();
    process.exit(1);
  }

  // ── Resolve API key ────────────────────────────────────────────────
  // Try provider-specific env var, then DHARA_API_KEY fallback
  const apiKey = providerInfo
    ? (process.env[providerInfo.envVar] ?? process.env.DHARA_API_KEY)
    : (process.env.DHARA_API_KEY ?? process.env.OPENAI_API_KEY);

  if (!apiKey) {
    const envHint = providerInfo
      ? `Set ${providerInfo.envVar} or DHARA_API_KEY`
      : "Set DHARA_API_KEY or OPENAI_API_KEY";
    process.stderr.write(`Error: No API key found for "${providerName}". ${envHint}.\n`);
    process.exit(1);
  }

  // ── Create provider ────────────────────────────────────────────────
  let provider: Provider;
  try {
    if (providerName === "anthropic") {
      provider = createAnthropicProvider({ apiKey });
    } else {
      provider = createOpenAIProvider({ apiKey, baseUrl });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error creating provider: ${msg}\n`);
    process.exit(1);
  }

  // ── Create session ─────────────────────────────────────────────────
  const session = createSession({
    cwd,
    model: { id: modelId, provider: providerName },
  });

  // ── Create sandbox with full capabilities (CLI is trusted) ─────────
  const sandbox = createSandbox({
    granted: [
      "filesystem:read",
      "filesystem:write",
      "filesystem:*",
      "process:spawn",
      "network:outbound",
    ],
    cwd,
  });

  // ── Create standard tools ──────────────────────────────────────────
  const tools = createStandardToolMap({ cwd, sandbox });

  // ── Create agent loop ──────────────────────────────────────────────
  const agent = createAgentLoop({
    provider,
    session,
    tools,
    systemPrompt: `You are Dhara, an AI coding agent operating in ${cwd}. You have access to file operations (read, write, edit, ls, grep) and shell commands (bash). Be concise and helpful.`,
    maxIterations: 10,
  });

  // ── Run the prompt ─────────────────────────────────────────────────
  process.stderr.write(
    `\n  dhara  •  ${providerName}/${modelId}  •  ${cwd}\n`,
  );
  process.stderr.write(
    `  ${"─".repeat(Math.max(providerName.length + modelId.length + cwd.length + 8, 30))}\n\n`,
  );

  try {
    await agent.run(prompt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`\nError: ${msg}\n`);
    process.exit(1);
  }

  // ── Print the response ─────────────────────────────────────────────
  const path = session.getPath();
  for (let i = path.length - 1; i >= 0; i--) {
    const entry = session.getEntry(path[i]);
    if (entry && entry.type === "entry" && entry.role === "assistant") {
      const textContent = entry.content
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text)
        .join("\n");
      if (textContent) {
        process.stdout.write(`${textContent}\n`);
      }
      break;
    }
  }
}

main().catch((err) => {
  process.stderr.write(`Unexpected error: ${err.message}\n`);
  process.exit(1);
});
