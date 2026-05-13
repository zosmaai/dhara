#!/usr/bin/env node

import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type ContextFile, loadContextFiles, reloadContextFiles } from "../core/context-loader.js";
import { createEventBus } from "../core/events.js";
import { ExtensionManager } from "../core/extension-manager.js";
import { type ProjectSettings, loadProjectConfig } from "../core/project-config.js";
import type { Provider } from "../core/provider.js";
import { createSandbox } from "../core/sandbox.js";
import { SessionManager } from "../core/session-manager.js";
import { createSession } from "../core/session.js";
import { type Skill, discoverSkills, reloadSkills } from "../core/skills.js";
import { createAnthropicProvider } from "../std/providers/anthropic-provider.js";
import { createOpenAIProvider } from "../std/providers/openai-provider.js";
import { createPiAiProvider } from "../std/providers/pi-ai-adapter.js";
import { createStandardToolMap } from "../std/tools/index.js";
import { mergeExtensionTools } from "../std/tools/index.js";
import { ANSI, subscribePromptEvents, tag, useColor } from "./output-utils.js";
import { runRepl } from "./repl.js";
import { runTui } from "./tui-runner.js";

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

function getVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(__dirname, "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version as string;
  } catch {
    return "0.1.0";
  }
}

function printUsage(): void {
  process.stdout.write(`dhara — The Agent Protocol Standard v${getVersion()}

Usage:
  dhara <prompt> [options]    One-shot: run a single prompt and exit
  dhara [options]             TUI mode: full-screen interactive session (default)
  dhara --repl [options]      REPL mode: line-based interactive session

Options:
  --provider <name>        LLM provider.
                           Known: openai, anthropic, opencode-go
                           Also: google, mistral, groq, deepseek, and 20+ more via pi-ai
                           Default: opencode-go
  --model <id>             Model ID (e.g. "deepseek-v4-flash", "gpt-4o")
  --base-url <url>         Custom API base URL
  --cwd <path>             Working directory (default: current directory)
  --resume <id>            Resume a previous session by ID
  --theme <name|path>      TUI theme (built-in: dhara-default, dracula)
  --repl                   Use line-based REPL instead of TUI
  --no-context-files       Disable AGENTS.md / CLAUDE.md loading
  --no-project-config      Disable .dhara/settings.json loading
  --version                Show version and exit
  --help                   Show this help message

Environment:
  Known providers use conventional env vars:
    OPENCODE_API_KEY   API key for opencode-go
    OPENAI_API_KEY     API key for openai
    ANTHROPIC_API_KEY  API key for anthropic
  For custom providers, set DHARA_API_KEY as fallback.
  pi-ai providers (google, mistral, groq, deepseek, etc.) use their
  own standard env vars (GOOGLE_API_KEY, MISTRAL_API_KEY, etc.).

REPL commands (type /help in session):
  /exit, /quit       Exit the REPL
  /save              Save the current session
  /list              List saved sessions
  /history [N]       Show recent conversation history
  /status            Show configuration and stats
  /skills            List loaded skills
  /reload            Reload config files and skills

Features:
  Streaming output   Real-time token display
  Tool progress      Visible tool execution with diffs
  Token tracking     Usage displayed after each response
  Extensions         Subprocess tools via JSON-RPC
  Context files      AGENTS.md / CLAUDE.md auto-loading

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
  "version",
  "provider",
  "model",
  "base-url",
  "cwd",
  "resume",
  "repl",
  "theme",
  "json",
  "no-context-files",
  "no-project-config",
]);

interface ResolvedConfig {
  providerName: string;
  modelId: string;
  baseUrl: string | undefined;
  cwd: string;
  apiKey: string | undefined;
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
    : undefined; // pi-ai providers auto-discover their API key

  // Load project-level config overrides first
  const disableProjectConfig = args.includes("--no-project-config");
  const projectConfig = disableProjectConfig ? undefined : loadProjectConfig(cwd);

  const finalModelId = projectConfig?.settings.model ?? modelId;
  const finalBaseUrl = projectConfig?.settings.baseUrl ?? baseUrl;
  const maxTokens = projectConfig?.settings.maxTokens;

  let provider: Provider;
  try {
    if (providerName === "anthropic") {
      if (!apiKey) {
        process.stderr.write(
          `Error: No API key found for "anthropic". Set ANTHROPIC_API_KEY or DHARA_API_KEY.\n`,
        );
        process.exit(1);
      }
      provider = createAnthropicProvider({ apiKey, maxTokens });
    } else if (providerName === "openai" || providerName === "opencode-go") {
      if (!apiKey) {
        process.stderr.write(
          `Error: No API key found for "${providerName}". Set ${providerInfo?.envVar ?? "DHARA_API_KEY"} or DHARA_API_KEY.\n`,
        );
        process.exit(1);
      }
      provider = createOpenAIProvider({ apiKey, baseUrl: finalBaseUrl });
    } else {
      // Use pi-ai adapter for all other providers (google, mistral, groq, etc.)
      // pi-ai auto-discovers API keys from standard environment variables.
      provider = createPiAiProvider({
        provider: providerName,
        model: finalModelId,
        apiKey,
        baseUrl: finalBaseUrl,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error creating provider: ${msg}\n`);
    process.exit(1);
  }

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
 * Build the final system prompt by prepending context files and skills.
 */
function buildSystemPrompt(cwd: string, contextFiles: ContextFile[], skills: Skill[]): string {
  const basePrompt = `You are Dhara, an AI coding agent operating in ${cwd}. You have access to file operations (read, write, edit, ls, grep) and shell commands (bash). Be concise and helpful.`;

  const parts: string[] = [];

  // Context files
  if (contextFiles.length > 0) {
    for (const f of contextFiles) {
      parts.push(
        `<context file="${f.path}" source="${f.source}">\n${f.content.trimEnd()}\n</context>`,
      );
    }
  }

  // Skills
  if (skills.length > 0) {
    for (const s of skills) {
      parts.push(`<skill name="${s.name}" source="${s.source}">\n${s.body.trimEnd()}\n</skill>`);
    }
  }

  if (parts.length === 0) return basePrompt;

  return `${parts.join("\n\n")}\n\n---\n\n${basePrompt}`;
}

/**
 * Load context files and skills, build system prompt, return state + reload.
 */
function createContextState(cwd: string, disableContextFiles: boolean) {
  let contextFiles: ContextFile[] = disableContextFiles ? [] : loadContextFiles(cwd).files;
  let skills: Skill[] = discoverSkills(cwd).skills;

  function build(): string {
    return buildSystemPrompt(cwd, contextFiles, skills);
  }

  function reload() {
    contextFiles = disableContextFiles ? [] : reloadContextFiles(cwd).files;
    skills = reloadSkills(cwd).skills;
    return build();
  }

  function getFiles() {
    return contextFiles;
  }

  function getSkills() {
    return skills;
  }

  return { build, reload, getFiles, getSkills };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--version")) {
    process.stdout.write(`dhara v${getVersion()}\n`);
    process.exit(0);
  }

  if (args.includes("--help")) {
    printUsage();
    process.exit(0);
  }

  // ── Session management subcommands ───────────────────────────────
  if (args[0] === "session") {
    const sessionManager = new SessionManager();
    const subcmd = args[1];

    if (subcmd === "list") {
      const sessions = sessionManager.list();
      if (sessions.length === 0) {
        process.stdout.write("No sessions found.\n");
        process.exit(0);
      }
      // Format as table
      for (const s of sessions) {
        const date = new Date(s.updatedAt).toLocaleString();
        process.stdout.write(
          `${s.sessionId.padEnd(12)} ${date.padEnd(25)} ${String(s.entryCount).padStart(4)} entries  ${(s.fileSize / 1024).toFixed(1)} KB  ${s.cwd}\n`,
        );
      }
      process.exit(0);
    }

    if (subcmd === "delete" && args[2]) {
      try {
        sessionManager.delete(args[2]);
        process.stdout.write(`Session deleted: ${args[2]}\n`);
      } catch (err) {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
      }
      process.exit(0);
    }

    if (subcmd === "info" && args[2]) {
      try {
        const session = sessionManager.load(args[2]);
        const meta = session.meta;
        process.stdout.write(`Session:    ${meta.sessionId}\n`);
        process.stdout.write(`Created:    ${new Date(meta.createdAt).toLocaleString()}\n`);
        process.stdout.write(`Updated:    ${new Date(meta.updatedAt).toLocaleString()}\n`);
        process.stdout.write(`CWD:        ${meta.cwd}\n`);
        process.stdout.write(
          `Model:      ${meta.model?.provider ?? "?"}/${meta.model?.id ?? "?"}\n`,
        );
        process.stdout.write(`Tags:       ${(meta.tags ?? []).join(", ") || "none"}\n`);
      } catch (err) {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
      }
      process.exit(0);
    }

    // Unknown subcommand
    process.stderr.write("Usage: dhara session <list|delete <id>|info <id>>\n");
    process.exit(1);
  }

  const prompt = extractPrompt(args);
  const resumeSessionId = getArg(args, "resume");
  const jsonMode = args.includes("--json");
  const disableContextFiles = args.includes("--no-context-files");

  // ── Extension setup (shared between REPL and one-shot) ──────────────
  const extManager = new ExtensionManager();

  // Default extension directories: global ~/.dhara/extensions, project .dhara/extensions
  const globalExtDir = join(homedir(), ".dhara", "extensions");
  const projectExtDir = join(process.cwd(), ".dhara", "extensions");

  // Ensure directories exist so users can drop extensions in
  try {
    mkdirSync(globalExtDir, { recursive: true });
  } catch {
    // Best effort
  }

  try {
    mkdirSync(projectExtDir, { recursive: true });
  } catch {
    // Best effort
  }

  await extManager.loadExtensions([globalExtDir, projectExtDir]);
  const extensionTools = extManager.getToolRegistrations();

  // ── No prompt → interactive mode (TUI or REPL) ────────────────────
  if (!prompt) {
    const cfg = resolveConfig(args);
    const sessionManager = new SessionManager();
    const ctxState = createContextState(cfg.cwd, disableContextFiles);

    const initialSystemPrompt = ctxState.build();
    const projectConfig = loadProjectConfig(cfg.cwd);

    // ── REPL mode (--repl flag) ────────────────────────────────────
    if (args.includes("--repl")) {
      try {
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
          skills: ctxState.getSkills(),
          projectConfigDir: projectConfig?.configDir,
          toolOverrides: extensionTools,
          onReload: () => {
            const newPrompt = ctxState.reload();
            const newProjectConfig = loadProjectConfig(cfg.cwd);
            return {
              systemPrompt: newPrompt,
              contextFiles: ctxState.getFiles(),
              skills: ctxState.getSkills(),
              projectConfigDir: newProjectConfig?.configDir,
              maxIterations: newProjectConfig?.settings.maxIterations ?? 10,
            };
          },
        });
      } finally {
        await extManager.shutdownAll();
      }
      process.exit(0);
    }

    // ── TUI mode (default) ────────────────────────────────────────
    try {
      await runTui({
        sessionManager,
        provider: cfg.provider,
        cwd: cfg.cwd,
        modelId: cfg.modelId,
        providerName: cfg.providerName,
        systemPrompt: initialSystemPrompt,
        maxIterations: cfg.projectSettings?.maxIterations ?? 10,
        resumeSessionId,
        toolOverrides: extensionTools,
        onReload: () => {
          const newPrompt = ctxState.reload();
          const newProjectConfig = loadProjectConfig(cfg.cwd);
          return {
            systemPrompt: newPrompt,
            maxIterations: newProjectConfig?.settings.maxIterations ?? 10,
          };
        },
      });
    } finally {
      await extManager.shutdownAll();
    }

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

  const standardTools = createStandardToolMap({ cwd: cfg.cwd, sandbox });
  const tools = mergeExtensionTools(standardTools, extensionTools);

  const { createAgentLoop } = await import("../core/agent-loop.js");
  const agent = createAgentLoop({
    provider: cfg.provider,
    session,
    tools,
    systemPrompt: ctxState.build(),
    maxIterations: cfg.projectSettings?.maxIterations ?? 10,
  });

  // Create event bus for streaming
  const eventBus = createEventBus();

  const colorEnabled = useColor(process.stdout);

  if (jsonMode) {
    // JSON mode: output structured JSON events to stdout
    try {
      const { subscribeJsonStream } = await import("../std/renderers/json-stream/index.js");
      subscribeJsonStream(eventBus, { output: process.stdout });
    } catch {
      // Fallback if json-stream module is not available:
      // subscribe to message:delta for basic output
      eventBus.subscribe<Record<string, unknown>>("message:delta", (data) => {
        process.stdout.write(`${JSON.stringify({ type: "delta", ...data })}\n`);
        return { action: "allow" };
      });
    }
  } else {
    process.stderr.write(
      `\n  ${tag(ANSI.bold, "dhara", colorEnabled)}  •  ${tag(ANSI.bold, cfg.providerName, colorEnabled)}/${tag(ANSI.bold, cfg.modelId, colorEnabled)}  •  ${tag(ANSI.dim, cfg.cwd, colorEnabled)}\n`,
    );
    process.stderr.write(`  ${tag(ANSI.dim, "One-shot mode", colorEnabled)}\n\n`);

    subscribePromptEvents(eventBus, {
      output: process.stdout,
      errorOutput: process.stderr,
      colorEnabled,
    });
  }

  try {
    await agent.run(prompt, undefined, eventBus);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`\n${tag(ANSI.red, "Error", colorEnabled)}: ${msg}\n`);
    process.exit(1);
  } finally {
    await extManager.shutdownAll();
  }
}

main().catch((err) => {
  process.stderr.write(`Unexpected error: ${err.message}\n`);
  process.exit(1);
});
