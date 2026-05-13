/**
 * CLI subcommands for `dhara config ...`.
 *
 * These operate on the ~/.dhara/config.json file via ConfigManager.
 */
import type { ConfigManager } from "../core/config.js";
import type { ProviderConfig } from "../core/config.js";

// ── Help ───────────────────────────────────────────────────────────────────────

function printConfigUsage(): void {
  process.stdout.write(`Usage: dhara config <subcommand> [args]

Subcommands:
  list                         Show full configuration
  get <key>                    Get a config value (providers, activeProvider, session)
  set <key> <value>            Set a config value (e.g. session.maxIterations 20)
  delete <key>                 Remove a provider or reset a config key
  set-provider <id> <api-key>  Add or update a provider with API key auth
                               Optional: --name "Display Name" --model "gpt-4o"
  switch <provider-id>         Switch the active provider
`);
}

// ── Subcommand handlers ────────────────────────────────────────────────────────

function handleList(configManager: ConfigManager): void {
  const cfg = configManager.config;

  const out: string[] = [];
  out.push(`Active Provider: ${cfg.activeProvider ?? "(none)"}`);
  out.push("");

  const session = cfg.session;
  out.push("Session Settings:");
  out.push(`  autoSave: ${session.autoSave}`);
  out.push(`  maxIterations: ${session.maxIterations}`);
  out.push("");

  const providers = configManager.listProviders();
  if (providers.length === 0) {
    out.push("No providers configured.");
  } else {
    out.push(`Providers (${providers.length}):`);
    for (const p of providers) {
      const active = p.id === cfg.activeProvider ? " ★ ACTIVE" : "";
      const authType = p.auth.type === "api_key" ? "API key" : "OAuth";
      const model = p.defaultModel ? ` model=${p.defaultModel}` : "";
      const baseUrl = p.baseUrl ? ` baseUrl=${p.baseUrl}` : "";
      out.push(`  ${p.id} (${p.name}) [${authType}]${model}${baseUrl}${active}`);
    }
  }

  process.stdout.write(`${out.join("\n")}\n`);
}

function handleGet(configManager: ConfigManager, key: string | undefined): void {
  if (!key) {
    process.stderr.write("Error: 'dhara config get' requires a key argument.\n");
    printConfigUsage();
    process.exit(1);
  }

  const cfg = configManager.config;

  switch (key) {
    case "providers": {
      const providers = configManager.listProviders();
      process.stdout.write(`${JSON.stringify(providers, null, 2)}\n`);
      break;
    }
    case "activeProvider": {
      process.stdout.write(`${cfg.activeProvider ?? "(none)"}\n`);
      break;
    }
    case "session": {
      process.stdout.write(`${JSON.stringify(cfg.session, null, 2)}\n`);
      break;
    }
    default: {
      // Try to interpret key as provider property
      // Format: providers.<id> or providers.<id>.apiKey etc.
      if (key.startsWith("providers.")) {
        const parts = key.split(".");
        const providerId = parts[1];
        const provider = configManager.getProvider(providerId);
        if (!provider) {
          process.stderr.write(`Error: Provider not found: ${providerId}\n`);
          process.exit(1);
        }
        if (parts.length === 2) {
          process.stdout.write(`${JSON.stringify(provider, null, 2)}\n`);
        } else if (parts[2] === "apiKey") {
          const apiKey = configManager.getApiKey(providerId);
          process.stdout.write(`${apiKey ?? "(not set)"}\n`);
        } else {
          const val = (provider as unknown as Record<string, unknown>)[parts[2]];
          if (val === undefined) {
            process.stderr.write(`Error: Unknown property: ${key}\n`);
            process.exit(1);
          }
          process.stdout.write(`${String(val)}\n`);
        }
      } else {
        process.stderr.write(`Error: Unknown config key: ${key}\n`);
        process.exit(1);
      }
    }
  }
}

function handleSet(
  configManager: ConfigManager,
  key: string | undefined,
  value: string | undefined,
): void {
  if (!key || value === undefined) {
    process.stderr.write("Error: 'dhara config set' requires a key and value.\n");
    printConfigUsage();
    process.exit(1);
  }

  const cfg = configManager.config;

  switch (key) {
    case "session.maxIterations": {
      const n = Number(value);
      if (Number.isNaN(n) || n < 1) {
        process.stderr.write("Error: maxIterations must be a positive number.\n");
        process.exit(1);
      }
      cfg.session.maxIterations = n;
      configManager.setSessionConfig(cfg.session);
      process.stdout.write(`session.maxIterations set to ${n}\n`);
      break;
    }
    case "session.autoSave": {
      if (value !== "true" && value !== "false") {
        process.stderr.write("Error: autoSave must be 'true' or 'false'.\n");
        process.exit(1);
      }
      cfg.session.autoSave = value === "true";
      configManager.setSessionConfig(cfg.session);
      process.stdout.write(`session.autoSave set to ${value}\n`);
      break;
    }
    case "activeProvider": {
      try {
        configManager.setActiveProvider(value);
        process.stdout.write(`Active provider set to: ${value}\n`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        process.stderr.write(`Error: ${msg}\n`);
        process.exit(1);
      }
      break;
    }
    default: {
      process.stderr.write(`Error: Unknown config key: ${key}\n`);
      process.exit(1);
    }
  }
}

function handleDelete(configManager: ConfigManager, key: string | undefined): void {
  if (!key) {
    process.stderr.write("Error: 'dhara config delete' requires a key argument.\n");
    printConfigUsage();
    process.exit(1);
  }

  if (key.startsWith("providers.")) {
    const providerId = key.split(".")[1];
    configManager.removeProvider(providerId);
    process.stdout.write(`Removed provider: ${providerId}\n`);
  } else {
    process.stderr.write(`Error: Cannot delete config key: ${key}\n`);
    process.exit(1);
  }
}

function handleSetProvider(
  configManager: ConfigManager,
  providerId: string | undefined,
  apiKey: string | undefined,
  name?: string,
  defaultModel?: string,
): void {
  if (!providerId || !apiKey) {
    process.stderr.write("Error: 'dhara config set-provider' requires <id> and <api-key>.\n");
    printConfigUsage();
    process.exit(1);
  }

  const existing = configManager.getProvider(providerId);
  const provider: ProviderConfig = {
    id: providerId,
    name: name ?? existing?.name ?? providerId,
    authType: "api_key",
    auth: { type: "api_key", apiKey },
    defaultModel: defaultModel ?? existing?.defaultModel,
    enabled: true,
  };

  configManager.setProvider(provider);
  process.stdout.write(
    `Provider "${providerId}" ${existing ? "updated" : "added"}.\n  Name: ${provider.name}\n  Auth: API key\n${provider.defaultModel ? `  Model: ${provider.defaultModel}\n` : ""}`,
  );
}

function handleSwitch(configManager: ConfigManager, providerId: string | undefined): void {
  if (!providerId) {
    process.stderr.write("Error: 'dhara config switch' requires a provider ID.\n");
    printConfigUsage();
    process.exit(1);
  }

  try {
    configManager.setActiveProvider(providerId);
    process.stdout.write(`Switched active provider to: ${providerId}\n`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`Error: ${msg}\n`);
    process.exit(1);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function handleConfigSubcommand(configManager: ConfigManager, args: string[]): void {
  // dhara config [subcommand] [...args]
  // args = everything after "config"

  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h") {
    printConfigUsage();
    return;
  }

  switch (sub) {
    case "list":
      handleList(configManager);
      break;

    case "get":
      handleGet(configManager, args[1]);
      break;

    case "set":
      handleSet(configManager, args[1], args[2]);
      break;

    case "delete":
      handleDelete(configManager, args[1]);
      break;

    case "set-provider":
    case "setProvider": {
      // Parse optional named args
      let name: string | undefined;
      let defaultModel: string | undefined;
      for (let i = 3; i < args.length; i++) {
        if (args[i] === "--name" && i + 1 < args.length) name = args[++i];
        if (args[i] === "--model" && i + 1 < args.length) defaultModel = args[++i];
      }
      handleSetProvider(configManager, args[1], args[2], name, defaultModel);
      break;
    }

    case "switch":
      handleSwitch(configManager, args[1]);
      break;

    default:
      process.stderr.write(`Error: Unknown config subcommand: ${sub}\n`);
      printConfigUsage();
      process.exit(1);
  }
}
