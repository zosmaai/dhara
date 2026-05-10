#!/usr/bin/env node

import { type ContextFile, loadContextFiles, reloadContextFiles } from "../core/context-loader.js";
import { type ProjectSettings, loadProjectConfig } from "../core/project-config.js";
import type { Provider } from "../core/provider.js";
import { createSandbox } from "../core/sandbox.js";
import { SessionManager } from "../core/session-manager.js";
import { createSession } from "../core/session.js";
import { createAnthropicProvider } from "../std/providers/anthropic-provider.js";
import { createOpenAIProvider } from "../std/providers/openai-provider.js";
import { createStandardToolMap } from "../std/tools/index.js";
import { runRepl } from "./repl.js";

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
  dhara <prompt> [options]    One-shot: run a single prompt and exit
  dhara [options]             REPL mode: interactive session (default)

Options:
  --provider <name>        LLM provider.
                           Known: openai, anthropic, opencode-go
                           Default: opencode-go
  --model <id>             Model ID (e.g. "deepseek-v4-flash", "gpt-4o")
  --base-url <url>         Custom API base URL
  --cwd <path>             Working directory (default: current directory)
  --resume <id>            Resume a previous session by ID (REPL mode only)
  --no-context-files       Disable AGENTS.md / CLAUDE.md loading
  --no-project-config      Disable .dhara/settings.json loading
  --help                   Show this help message

Environment:
  Known providers use conventional env vars:
    OPENCODE_API_KEY   API key for opencode-go
    OPENAI_API_KEY     API key for openai
    ANTHROPIC_API_KEY  API key for anthropic
  For custom providers, set DHARA_API_KEY as fallback.

Examples:
  dhara "List the files in this project"   One-shot
  dhara                                     REPL mode
  dhara --resume abc123                     Resume session
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
  "resume",
  "no-context-files",
  "no-project-config",
]);

interface ResolvedConfig {
  providerName: string;
  modelId: string;
  baseUrl: string | undefined;
  cwd: string;
  apiKey: string;
  provider: Provider;
  projectSettings?: ProjectSettings;
}

function resolveConfig(args: string[]): ResolvedConfig {
  const rawProvider = getArg(args, "provider") ?? "opencode-go";
  const providerName = rawProvider in KNOWN_PROVIDERS ? rawProvider : rawProvider;
  const providerInfo = KNOWN_PROVIDERS[providerName];
  const modelId = getArg(args, "model") ?? providerInfo?.defaultModel ?? "deepseek-v4-flash";
  const baseUrl = getArg(args, "base-url") ?? providerInfo?.defaultBaseUrl;
  const cwd = getArg(args, "cwd") ?? process.cwd();

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

  // Load project-level config overrides
  const disableProjectConfig = args.includes("--no-project-config");
  const projectConfig = disableProjectConfig ? undefined : loadProjectConfig(cwd);

  const finalModelId = projectConfig?.settings.model ?? modelId;
  const finalBaseUrl = projectConfig?.settings.baseUrl ?? baseUrl;

  return {
    providerName,
    modelId: finalModelId,
    baseUrl: finalBaseUrl,
    cwd,
    apiKey,
    provider,
    projectSettings: projectConfig?.settings,
  };
}

function extractPrompt(args: string[]): string | undefined {
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
  return prompt || undefined;
}

/**
 * Build the final system prompt by prepending context files to the base prompt.
 */
function buildSystemPrompt(cwd: string, contextFiles: ContextFile[]): string {
  const basePrompt = `You are Dhara, an AI coding agent operating in ${cwd}. You have access to file operations (read, write, edit, ls, grep) and shell commands (bash). Be concise and helpful.`;

  if (contextFiles.length === 0) return basePrompt;

  const contextParts = contextFiles.map(
    (f) => `<context file="${f.path}" source="${f.source}">\n${f.content.trimEnd()}\n</context>`,
  );

  return `${contextParts.join("\n\n")}\n\n---\n\n${basePrompt}`;
}

/**
 * Load context files, build system prompt, return the result + reload function.
 */
function createContextState(cwd: string, disableContextFiles: boolean) {
  let contextFiles: ContextFile[] = disableContextFiles ? [] : loadContextFiles(cwd).files;

  function build(): string {
    return buildSystemPrompt(cwd, contextFiles);
  }

  function reload() {
    contextFiles = disableContextFiles ? [] : reloadContextFiles(cwd).files;
    return build();
  }

  function getFiles() {
    return contextFiles;
  }

  return { build, reload, getFiles };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    printUsage();
    process.exit(0);
  }

  const prompt = extractPrompt(args);
  const resumeSessionId = getArg(args, "resume");
  const disableContextFiles = args.includes("--no-context-files");

  // ── REPL mode (no prompt argument) ──────────────────────────────────
  if (!prompt) {
    const cfg = resolveConfig(args);
    const sessionManager = new SessionManager();
    const ctxState = createContextState(cfg.cwd, disableContextFiles);

    const initialSystemPrompt = ctxState.build();
    const projectConfig = loadProjectConfig(cfg.cwd);

    await runRepl({
      input: process.stdin,
      output: process.stdout,
      sessionManager,
      provider: cfg.provider,
      cwd: cfg.cwd,
      modelId: cfg.modelId,
      providerName: cfg.providerName,
      systemPrompt: initialSystemPrompt,
      maxIterations: cfg.projectSettings?.maxIterations ?? 10,
      resumeSessionId,
      contextFiles: ctxState.getFiles(),
      projectConfigDir: projectConfig?.configDir,
      onReload: () => {
        const newPrompt = ctxState.reload();
        const newProjectConfig = loadProjectConfig(cfg.cwd);
        return {
          systemPrompt: newPrompt,
          contextFiles: ctxState.getFiles(),
          projectConfigDir: newProjectConfig?.configDir,
          maxIterations: newProjectConfig?.settings.maxIterations ?? 10,
        };
      },
    });

    process.exit(0);
  }

  // ── One-shot mode ───────────────────────────────────────────────────
  const cfg = resolveConfig(args);
  const ctxState = createContextState(cfg.cwd, disableContextFiles);

  const sandbox = createSandbox({
    granted: [
      "filesystem:read",
      "filesystem:write",
      "filesystem:*",
      "process:spawn",
      "network:outbound",
    ],
    cwd: cfg.cwd,
  });

  const session = createSession({
    cwd: cfg.cwd,
    model: { id: cfg.modelId, provider: cfg.providerName },
  });

  const tools = createStandardToolMap({ cwd: cfg.cwd, sandbox });

  const { createAgentLoop } = await import("../core/agent-loop.js");
  const agent = createAgentLoop({
    provider: cfg.provider,
    session,
    tools,
    systemPrompt: ctxState.build(),
    maxIterations: cfg.projectSettings?.maxIterations ?? 10,
  });

  process.stderr.write(`\n  dhara  •  ${cfg.providerName}/${cfg.modelId}  •  ${cfg.cwd}\n`);
  process.stderr.write(
    `  ${"\u2500".repeat(Math.max(cfg.providerName.length + cfg.modelId.length + cfg.cwd.length + 8, 30))}\n\n`,
  );

  try {
    await agent.run(prompt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`\nError: ${msg}\n`);
    process.exit(1);
  }

  // Print the latest assistant response
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
