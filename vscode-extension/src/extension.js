const vscode = require("vscode");
const { execSync } = require("child_process");

/**
 * Activate the Dhara VS Code extension.
 */
function activate(context) {
  console.log("[dhara] Extension activated");

  // Command: Run a custom prompt
  const runPrompt = vscode.commands.registerCommand("dhara.runPrompt", async () => {
    const prompt = await vscode.window.showInputBox({
      placeHolder: "Enter a prompt for Dhara (e.g., 'Explain this file')",
      prompt: "Dhara Prompt",
    });

    if (!prompt) return;

    const config = vscode.workspace.getConfiguration("dhara");
    const binary = config.get("binaryPath", "dhara");
    const provider = config.get("provider", "opencode-go");
    const model = config.get("model", "");

    await runDhara(prompt, { binary, provider, model });
  });

  // Command: Run on selected code
  const runSelection = vscode.commands.registerCommand("dhara.runSelection", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active editor");
      return;
    }

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);

    if (!selectedText) {
      vscode.window.showErrorMessage("No text selected");
      return;
    }

    const prompt = await vscode.window.showInputBox({
      placeHolder: "What do you want to do with the selected code?",
      prompt: "Dhara: Selected Code",
      value: "Review this code",
    });

    if (!prompt) return;

    const config = vscode.workspace.getConfiguration("dhara");
    const binary = config.get("binaryPath", "dhara");
    const provider = config.get("provider", "opencode-go");
    const model = config.get("model", "");

    await runDhara(`${prompt}\n\n\`\`\`\n${selectedText}\n\`\`\``, { binary, provider, model });
  });

  context.subscriptions.push(runPrompt, runSelection);
}

/**
 * Execute dhara with the given prompt and show results.
 */
async function runDhara(prompt, opts) {
  const { binary, provider, model } = opts;

  // Show progress notification
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Running Dhara...",
      cancellable: true,
    },
    async (progress, token) => {
      const args = [binary, "--json"];
      if (provider) args.push("--provider", provider);
      if (model) args.push("--model", model);
      args.push(prompt);

      return new Promise((resolve, reject) => {
        const { execFile } = require("child_process");
        const child = execFile(args[0], args.slice(1), {
          maxBuffer: 10 * 1024 * 1024,
          timeout: 120_000,
          cwd: vscode.workspace.rootPath,
        });

        token.onCancellationRequested(() => {
          child.kill();
          reject(new Error("Cancelled"));
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        child.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        child.on("close", (code) => {
          if (code === 0 || code === null) {
            resolve({ stdout, stderr });
          } else {
            reject(new Error(stderr || `Exit code ${code}`));
          }
        });

        child.on("error", (err) => {
          reject(new Error(`Failed to start dhara: ${err.message}`));
        });
      });
    },
  );

  if (result) {
    // Try to parse JSON output
    try {
      const lines = result.stdout.trim().split("\n");
      const events = lines.map((l) => JSON.parse(l));
      const textParts = events
        .filter((e) => e.type === "message" && e.content)
        .map((e) => e.content);

      const output = textParts.length > 0 ? textParts.join("\n") : result.stdout;

      // Show in new untitled document
      const doc = await vscode.workspace.openTextDocument({
        content: output,
        language: "markdown",
      });
      vscode.window.showTextDocument(doc);
    } catch {
      // Fallback: show raw output
      const doc = await vscode.workspace.openTextDocument({
        content: result.stdout || result.stderr || "(no output)",
        language: "plaintext",
      });
      vscode.window.showTextDocument(doc);
    }
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
