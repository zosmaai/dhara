import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { type ExtensionProtocol, createExtensionProtocol } from "./protocol.js";
import type { ContentBlock, ToolRegistration } from "./provider.js";

/** Default grace period (ms) before sending SIGTERM after cancellation. */
const CANCELLATION_GRACE_MS = 5_000;

/** Default grace period (ms) between SIGTERM and SIGKILL. */
const KILL_GRACE_MS = 2_000;

/**
 * Extension manifest as declared in manifest.json.
 */
export interface ExtensionManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  runtime: {
    type: "subprocess" | "wasm" | "socket";
    command?: string;
    protocol: "json-rpc";
  };
  capabilities?: string[];
}

/**
 * Tool descriptor returned by an extension's initialize response.
 */
export interface ExtensionToolDescriptor {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  returns?: Record<string, unknown>;
  capabilities?: string[];
}

/**
 * Initialize response from an extension handshake.
 */
interface InitializeResult {
  protocolVersion: string;
  name: string;
  version: string;
  tools?: ExtensionToolDescriptor[];
}

/**
 * Manages the lifecycle of extension subprocesses and routes tool
 * calls to extensions via JSON-RPC.
 */
export class ExtensionManager {
  private extensions: Map<
    string,
    {
      manifest: ExtensionManifest;
      process: ChildProcess;
      protocol: ExtensionProtocol;
      toolDescriptors: ExtensionToolDescriptor[];
    }
  > = new Map();

  /**
   * Discover and load extensions from the given directories.
   *
   * Each directory is scanned for manifest.json files. Extensions
   * are spawned, initialized, and their tools are registered.
   */
  async loadExtensions(extensionDirs: string[]): Promise<void> {
    const manifests = discoverManifests(extensionDirs);

    for (const manifest of manifests) {
      await this.spawnExtension(manifest);
    }
  }

  /**
   * Spawn an extension subprocess, perform the initialize handshake,
   * and register its tools.
   */
  private async spawnExtension(manifest: ExtensionManifest): Promise<void> {
    if (this.extensions.has(manifest.name)) {
      return; // Already loaded
    }

    if (manifest.runtime.type !== "subprocess" || !manifest.runtime.command) {
      console.warn(`Extension "${manifest.name}": only subprocess type is supported, skipping.`);
      return;
    }

    // Spawn the subprocess
    const [cmd, ...args] = manifest.runtime.command.split(/\s+/);
    const extProcess = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (!extProcess.stdout || !extProcess.stdin) {
      extProcess.kill();
      console.warn(`Extension "${manifest.name}": failed to create stdio, skipping.`);
      return;
    }

    // Create protocol wrapper
    const protocol = createExtensionProtocol({
      stdin: extProcess.stdout,
      stdout: extProcess.stdin,
    });

    // Handle unexpected exits
    extProcess.on("exit", (code) => {
      this.extensions.delete(manifest.name);
      if (code !== 0 && code !== null) {
        console.warn(`Extension "${manifest.name}" exited unexpectedly with code ${code}`);
      }
    });

    // Handle errors
    extProcess.on("error", (err) => {
      this.extensions.delete(manifest.name);
      console.warn(`Extension "${manifest.name}" error: ${err.message}`);
    });

    // Perform initialize handshake
    try {
      const result = await protocol.sendRequest<InitializeResult>("initialize", {
        protocolVersion: "0.1.0",
        capabilities: { tools: true },
      });

      this.extensions.set(manifest.name, {
        manifest,
        process: extProcess,
        protocol,
        toolDescriptors: result.tools ?? [],
      });
    } catch (err) {
      extProcess.kill();
      console.warn(
        `Extension "${manifest.name}": initialize failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Get all tool registrations from loaded extensions.
   * These can be merged with standard tools for the agent loop.
   */
  getToolRegistrations(): ToolRegistration[] {
    const registrations: ToolRegistration[] = [];

    for (const [extName, ext] of this.extensions) {
      for (const desc of ext.toolDescriptors) {
        const toolName = desc.name;

        registrations.push({
          definition: {
            name: toolName,
            description: desc.description,
            parameters: desc.parameters,
          },
          execute: async (input, signal) => {
            return this.executeTool(extName, toolName, input, signal);
          },
        });
      }
    }

    return registrations;
  }

  /**
   * Route a tool call to an extension via JSON-RPC.
   */
  private async executeTool(
    extName: string,
    toolName: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<import("./session.js").ToolResult> {
    const ext = this.extensions.get(extName);
    if (!ext) {
      return {
        content: [{ type: "text", text: `Extension "${extName}" is not loaded.` }],
        isError: true,
      };
    }

    // Create a cancellation controller that also handles grace period
    const cancelController = new AbortController();
    let cancelGraceTimer: ReturnType<typeof setTimeout> | undefined;

    // When the user aborts: send tools/cancel and start grace timer
    const cancelHandler = () => {
      // Send cancellation notification to extension
      ext.protocol.sendNotification("tools/cancel", {
        toolCallId: toolName,
      });

      // Start grace period timer — after this, abort the sendRequest
      cancelGraceTimer = setTimeout(() => {
        cancelController.abort();
      }, CANCELLATION_GRACE_MS);
    };

    if (signal) {
      if (signal.aborted) {
        cancelHandler();
      } else {
        signal.addEventListener("abort", cancelHandler, { once: true });
      }
    }

    try {
      const result = await ext.protocol.sendRequest<{
        content: Array<{ type: string; text?: string }>;
        isError?: boolean;
      }>(
        "tools/execute",
        {
          toolName,
          input,
        },
        cancelController.signal,
      );

      return {
        content: (result.content ?? []).map(
          (c): ContentBlock => ({
            type: "text" as const,
            text: c.text ?? "",
          }),
        ),
        isError: result.isError ?? false,
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Extension tool "${toolName}" error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    } finally {
      if (cancelGraceTimer) {
        clearTimeout(cancelGraceTimer);
      }
      if (signal) {
        signal.removeEventListener("abort", cancelHandler);
      }

      // If cancellation was triggered, escalate to kill chain
      if (cancelController.signal.aborted) {
        await this.graceKill(ext.process, KILL_GRACE_MS, KILL_GRACE_MS);
      }
    }
  }

  /**
   * Wait for a process to exit with a grace period, then escalate.
   * Returns true if the process exited before escalation.
   */
  private async graceKill(
    proc: ChildProcess,
    cancelGraceMs: number,
    killGraceMs: number,
  ): Promise<boolean> {
    // Process already dead
    if (proc.exitCode !== null || proc.killed) return true;

    // Wait for natural exit within grace period
    const exited = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), cancelGraceMs);
      proc.once("exit", () => {
        clearTimeout(timer);
        resolve(true);
      });
      proc.once("error", () => {
        clearTimeout(timer);
        resolve(true);
      });
    });

    if (exited) return true;

    // Grace period expired — send SIGTERM
    proc.kill("SIGTERM");

    // Wait for exit after SIGTERM
    const sigtermExited = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), killGraceMs);
      proc.once("exit", () => {
        clearTimeout(timer);
        resolve(true);
      });
    });

    if (sigtermExited) return true;

    // SIGKILL as last resort
    proc.kill("SIGKILL");
    return false;
  }

  /**
   * Get the names of all tool descriptors from loaded extensions.
   */
  getExtensionToolNames(): string[] {
    const names: string[] = [];
    for (const ext of this.extensions.values()) {
      for (const desc of ext.toolDescriptors) {
        names.push(desc.name);
      }
    }
    return names;
  }

  /**
   * Shut down all extensions cleanly.
   *
   * Sends shutdown request with a 5-second timeout.
   * If the extension doesn't respond, escalates to SIGTERM → SIGKILL.
   */
  async shutdownAll(): Promise<void> {
    const shutdowns: Promise<void>[] = [];

    for (const [, ext] of this.extensions) {
      shutdowns.push(
        (async () => {
          // Create a timeout signal for shutdown request
          const ac = new AbortController();
          const timer = setTimeout(() => ac.abort(), CANCELLATION_GRACE_MS);

          try {
            await ext.protocol.sendRequest("shutdown", {}, ac.signal);
          } catch {
            // Shutdown request failed or timed out — escalate
          } finally {
            clearTimeout(timer);
          }

          // Graceful kill chain
          await this.graceKill(ext.process, KILL_GRACE_MS, KILL_GRACE_MS);
          ext.protocol.close();
        })(),
      );
    }

    await Promise.all(shutdowns);
    this.extensions.clear();
  }
}

/**
 * Discover extension manifests from the given directories.
 * Scans each directory for manifest.json files.
 */
function discoverManifests(dirs: string[]): ExtensionManifest[] {
  const manifests: ExtensionManifest[] = [];

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);

      // Check if entry is a directory with a manifest
      let manifestPath = join(fullPath, "manifest.json");
      if (!existsSync(manifestPath)) {
        manifestPath = join(fullPath, "manifest.yaml");
      }
      if (!existsSync(manifestPath)) {
        // Also check if the entry itself is a manifest file
        if (entry === "manifest.json" || entry === "manifest.yaml") {
          manifestPath = fullPath;
        } else {
          continue;
        }
      }

      try {
        const content = readFileSync(manifestPath, "utf-8");
        const isYaml = manifestPath.endsWith(".yaml");
        const manifest = (
          isYaml ? parseSimpleYaml(content) : JSON.parse(content)
        ) as ExtensionManifest;

        // Validate required fields
        if (!manifest.name || !manifest.runtime?.command) {
          console.warn(`Invalid manifest at ${manifestPath}: missing "name" or "runtime.command"`);
          continue;
        }

        manifests.push(manifest);
      } catch (err) {
        console.warn(
          `Failed to parse manifest at ${manifestPath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return manifests;
}

/**
 * Parse a simple subset of YAML that covers extension manifest files.
 *
 * Supports:
 * - Key-value pairs: `name: value`
 * - Quoted strings: `description: "some text"`
 * - Nested objects (2 levels): `runtime:\n  type: subprocess`
 * - Arrays: `capabilities:\n  - item1\n  - item2`
 *
 * Not supported: multi-line strings, anchors, aliases, complex types.
 */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");

  let currentKey: string | null = null;
  let currentObj: Record<string, unknown> | null = null;
  let currentArray: unknown[] | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, ""); // Trim trailing whitespace
    if (!line || line.trimStart().startsWith("#")) continue;

    // Array item: starts with "  - " or "- "
    const arrayMatch = line.match(/^\s*-\s+(.*)/);
    if (arrayMatch && currentKey) {
      const value = parseYamlValue(arrayMatch[1]);
      if (currentArray) {
        currentArray.push(value);
      } else {
        currentArray = [value];
        result[currentKey] = currentArray;
      }
      continue;
    }

    // Nested key: starts with "  " and has no leading "-"
    const nestedMatch = line.match(/^\s{2}([\w-]+):\s*(.*)/);
    if (nestedMatch && currentKey) {
      if (!currentObj) {
        currentObj = {};
        result[currentKey] = currentObj;
      }
      const val = parseYamlValue(nestedMatch[2]);
      if (val !== undefined) {
        currentObj[nestedMatch[1]] = val;
      }
      continue;
    }

    // Top-level key
    const topMatch = line.match(/^([\w-]+):\s*(.*)/);
    if (topMatch) {
      currentKey = topMatch[1];
      currentObj = null;
      currentArray = null;
      const val = parseYamlValue(topMatch[2]);
      if (val !== undefined) {
        result[currentKey] = val;
      }
    }
  }

  return result;
}

/**
 * Parse a single YAML value.
 */
function parseYamlValue(value: string): unknown {
  const trimmed = value.trim();

  if (trimmed === "" || trimmed === "~") return undefined;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;

  // Quoted string
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  // Number
  const num = Number(trimmed);
  if (!Number.isNaN(num) && trimmed !== "") return num;

  return trimmed;
}
