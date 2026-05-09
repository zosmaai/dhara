import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolRegistration } from "../../core/provider.js";
import type { Sandbox } from "../../core/sandbox.js";

/** Maximum output bytes before truncation. */
const DEFAULT_MAX_BYTES = 50 * 1024; // 50KB
/** Maximum output lines before truncation. */
const DEFAULT_MAX_LINES = 2000;

/**
 * Configuration for creating a bash tool.
 */
export interface BashToolConfig {
  /** Working directory for command execution. */
  cwd: string;
  /** Sandbox for capability and path enforcement. */
  sandbox: Sandbox;
}

/**
 * Create a tool that executes shell commands.
 *
 * The tool accepts:
 * - `command` (required) — shell command to execute
 * - `timeout` (optional) — timeout in seconds
 *
 * Output is truncated to 2000 lines or 50KB (whichever hits first).
 * On timeout or non-zero exit, the partial output is preserved in the error.
 */
export function createBashTool(config: BashToolConfig): ToolRegistration {
  const { cwd, sandbox } = config;

  return {
    definition: {
      name: "bash",
      description:
        "Execute a bash command in the current working directory. Returns stdout and stderr. Output is truncated to 2000 lines or 50KB (whichever is hit first). If truncated, full output is saved to a temp file. Optionally provide a timeout in seconds.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Bash command to execute",
          },
          timeout: {
            type: "integer",
            description: "Timeout in seconds (optional, no default timeout)",
            minimum: 1,
            maximum: 300,
          },
        },
        required: ["command"],
        additionalProperties: false,
      },
    },

    async execute(input) {
      const { command, timeout } = input as {
        command: string;
        timeout?: number;
      };

      // Check sandbox
      const permission = sandbox.checkProcessSpawn(command);
      if (!permission.allowed) {
        return {
          content: [{ type: "text", text: permission.reason ?? "Access denied" }],
          isError: true,
        };
      }

      // Verify cwd exists
      if (!existsSync(cwd)) {
        return {
          content: [
            {
              type: "text",
              text: `Working directory does not exist: ${cwd}`,
            },
          ],
          isError: true,
        };
      }

      // Temp file for full output
      const tempFile = join(
        tmpdir(),
        `dhara-bash-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );

      // Execute command using spawnSync for both stdout and stderr
      const result = spawnSync(command, [], {
        cwd,
        shell: true,
        timeout: timeout !== undefined ? timeout * 1000 : undefined,
        maxBuffer: DEFAULT_MAX_BYTES * 2,
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      const stdout = result.stdout?.toString("utf-8") ?? "";
      const stderr = result.stderr?.toString("utf-8") ?? "";
      const combined = stderr ? `${stdout}${stderr}` : stdout;
      const exitCode = result.status;
      const error = result.error;

      // Save full output to temp file
      try {
        writeFileSync(tempFile, combined || "(no output)", "utf-8");
      } catch {
        // Ignore temp file write errors
      }

      // Handle timeout
      if (error && "code" in error && error.code === "ETIMEDOUT") {
        const { text, truncated } = truncateOutput(combined);
        const output = text
          ? `${text}\n\nCommand timed out after ${timeout} seconds`
          : `Command timed out after ${timeout} seconds`;
        return {
          content: [{ type: "text", text: output }],
          metadata: {
            truncated,
            exitCode: undefined,
            fullOutputPath: truncated ? tempFile : undefined,
          },
          isError: true,
        };
      }

      // Handle kill signal
      if (result.signal) {
        const { text, truncated } = truncateOutput(combined);
        const output = text
          ? `${text}\n\nCommand was killed by signal ${result.signal}`
          : `Command was killed by signal ${result.signal}`;
        return {
          content: [{ type: "text", text: output }],
          metadata: {
            truncated,
            exitCode: null,
            fullOutputPath: truncated ? tempFile : undefined,
          },
          isError: true,
        };
      }

      // Handle other errors
      if (error) {
        const { text, truncated } = truncateOutput(combined);
        const output = text ? `${text}\n\n${error.message}` : error.message;
        return {
          content: [{ type: "text", text: output }],
          metadata: {
            truncated,
            fullOutputPath: truncated ? tempFile : undefined,
          },
          isError: true,
        };
      }

      // Handle non-zero exit (but command executed)
      if (exitCode !== null && exitCode !== 0) {
        const { text: errorText, truncated: errorTruncated } = truncateOutput(combined);
        const output = errorText
          ? `${errorText}\n\nCommand exited with code ${exitCode}`
          : `Command exited with code ${exitCode}`;
        return {
          content: [{ type: "text", text: output }],
          metadata: {
            truncated: errorTruncated,
            exitCode,
            fullOutputPath: errorTruncated ? tempFile : undefined,
          },
          isError: true,
        };
      }

      // Success
      const { text, truncated } = truncateOutput(combined);
      const finalText = truncated
        ? `${text}\n\n[Output truncated. Full output: ${tempFile}]`
        : text || "(no output)";

      return {
        content: [{ type: "text", text: finalText }],
        metadata: {
          truncated,
          fullOutputPath: truncated ? tempFile : undefined,
        },
      };
    },
  };
}

/**
 * Truncate output to max lines and max bytes.
 * Returns the truncated content and whether truncation occurred.
 */
function truncateOutput(output: string): { text: string; truncated: boolean } {
  if (!output) return { text: "", truncated: false };

  const maxLines = DEFAULT_MAX_LINES;
  const maxBytes = DEFAULT_MAX_BYTES;

  const lines = output.split("\n");
  const totalLines = lines.length;
  let resultLines = lines;

  // Truncate by lines first (keep last N lines)
  if (totalLines > maxLines) {
    const startLine = totalLines - maxLines;
    resultLines = lines.slice(startLine);

    // Then check bytes
    const text = resultLines.join("\n");
    const textBytes = Buffer.byteLength(text, "utf-8");
    if (textBytes > maxBytes) {
      let byteCount = 0;
      const byteLines: string[] = [];
      for (const line of resultLines) {
        const lineBytes = Buffer.byteLength(line, "utf-8");
        if (byteCount + lineBytes > maxBytes) break;
        byteLines.push(line);
        byteCount += lineBytes + 1;
      }
      resultLines = byteLines;
    }

    return {
      text: `[Showing last ${resultLines.length} lines of ${totalLines}. Full output saved to temp file.]\n${resultLines.join("\n")}`,
      truncated: true,
    };
  }

  // Check bytes
  const textBytes = Buffer.byteLength(output, "utf-8");
  if (textBytes > maxBytes) {
    let byteCount = 0;
    const byteLines: string[] = [];
    for (const line of lines) {
      const lineBytes = Buffer.byteLength(line, "utf-8");
      if (byteCount + lineBytes > maxBytes) break;
      byteLines.push(line);
      byteCount += lineBytes + 1;
    }
    return {
      text: `[Showing ${byteLines.length} of ${totalLines} lines (${maxBytes / 1024}KB limit). Full output saved to temp file.]\n${byteLines.join("\n")}`,
      truncated: true,
    };
  }

  return { text: output, truncated: false };
}
