/**
 * Dhara Header — logo + keybinding hints shown at the top of the TUI.
 * Mirrors pi's ExpandableText header pattern with logo line, compact instructions,
 * and onboarding text.
 */
import { type Component, visibleWidth } from "@earendil-works/pi-tui";
import { color } from "./dhara-theme.js";

// ── Constants ────────────────────────────────────────────────────────

// ── Header Component ─────────────────────────────────────────────────

export class HeaderComponent implements Component {
  private version: string;

  constructor(version: string) {
    this.version = version;
  }

  invalidate(): void {
    // no cache to clear
  }

  render(width: number): string[] {
    const lines: string[] = [];

    // ── Logo line ───────────────────────────────────────────────────
    const logo = `${color.bold(color.accent("dhara"))}${color.dim(` v${this.version}`)}`;
    const plainLen = visibleWidth(`dhara v${this.version}`);
    const padding = width - plainLen - 4;
    lines.push(`  ${logo}${padding > 0 ? " ".repeat(padding) : ""}`);

    // ── Compact instructions (always shown) ─────────────────────────
    const compact = [
      `${color.muted("Ctrl+C")} ${color.dim("interrupt")}`,
      `${color.muted("Ctrl+D")} ${color.dim("exit")}`,
      `${color.muted("/")} ${color.dim("commands")}`,
      `${color.muted("Shift+Enter")} ${color.dim("newline")}`,
    ].join(color.muted(" · "));

    lines.push(`  ${compact}`);
    lines.push("");

    // ── Onboarding line ─────────────────────────────────────────────
    lines.push(`  ${color.dim("Dhara is an AI coding agent. Ask it questions or give it tasks.")}`);
    lines.push("");

    return lines;
  }
}
