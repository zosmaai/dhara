/**
 * Dhara Footer — status bar showing provider, model, cwd, tokens, and context usage.
 * Mirrors pi's FooterComponent with a data-line format.
 */
import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { color } from "./dhara-theme.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface FooterData {
  provider: string;
  model: string;
  cwd: string;
  sessionId?: string;
  tokens?: { input: number; output: number };
  state?: "idle" | "thinking" | "streaming" | "error";
}

// ── Footer Component ─────────────────────────────────────────────────

export class FooterComponent implements Component {
  private data: FooterData;

  constructor(data: FooterData) {
    this.data = { ...data };
  }

  update(data: Partial<FooterData>): void {
    Object.assign(this.data, data);
  }

  invalidate(): void {
    // no cache
  }

  render(width: number): string[] {
    const d = this.data;
    const parts: string[] = [];

    // ── Left: cwd ───────────────────────────────────────────────────
    parts.push(color.dim(d.cwd || "~"));

    // ── Center: provider/model ──────────────────────────────────────
    if (d.provider && d.model) {
      parts.push(`${color.bold(d.provider)}/${color.bold(d.model)}`);
    }

    // ── Right: tokens ───────────────────────────────────────────────
    if (d.tokens) {
      const input = formatTokens(d.tokens.input);
      const output = formatTokens(d.tokens.output);
      parts.push(`${color.dim(`in: ${input}`)} ${color.dim(`out: ${output}`)}`);
    }

    // ── Session ID ─────────────────────────────────────────────────
    if (d.sessionId) {
      parts.push(color.muted(`#${d.sessionId}`));
    }

    // ── State indicator ────────────────────────────────────────────
    const stateIndicator = getStateIndicator(d.state);
    if (stateIndicator) {
      parts.push(stateIndicator);
    }

    // ── Assemble line ──────────────────────────────────────────────
    const raw = parts.join("  ");
    const visualLen = visibleWidth(raw);

    if (visualLen <= width) {
      return [` ${raw}${" ".repeat(Math.max(0, width - visualLen - 1))}`];
    }

    // Truncate: keep cwd + state indicator, truncate middle
    const maxMiddle = width - visibleWidth(d.cwd) - visibleWidth(stateIndicator || "") - 6;
    const middleStr = `${d.provider}/${d.model}`;
    const truncatedMiddle =
      visibleWidth(middleStr) > maxMiddle ? truncateToWidth(middleStr, maxMiddle) : middleStr;

    return [
      ` ${color.dim(d.cwd)}  ${truncatedMiddle}${stateIndicator ? `  ${stateIndicator}` : ""}`,
    ];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

function getStateIndicator(state?: string): string | null {
  switch (state) {
    case "thinking":
      return color.muted("◐");
    case "streaming":
      return color.success("▶");
    case "error":
      return color.error("●");
    default:
      return null;
  }
}
