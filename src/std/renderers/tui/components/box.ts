/**
 * Box component: a container with optional border, title, and padding.
 *
 * Used for panels, dialogs, and grouping related content.
 */
import { type Component, visibleWidth } from "./component.js";
import type { Theme } from "../theme.js";

export interface BoxConfig {
  /** Box title shown in top border. */
  title?: string;
  /** Border style name from theme. */
  borderStyle?: string;
  /** Title style name from theme. */
  titleStyle?: string;
  /** Number of padding columns on left/right. */
  paddingX?: number;
  /** Whether to draw borders. Default: true. */
  bordered?: boolean;
}

export class Box implements Component {
  private children: Component[] = [];
  private config: BoxConfig;
  private theme: Theme;

  constructor(theme: Theme, config: BoxConfig = {}) {
    this.theme = theme;
    this.config = { bordered: true, paddingX: 1, ...config };
  }

  addChild(child: Component): void {
    this.children.push(child);
  }

  removeChild(child: Component): void {
    this.children = this.children.filter((c) => c !== child);
  }

  clearChildren(): void {
    this.children = [];
  }

  render(width: number, _height?: number): string[] {
    const borderStyle = this.config.borderStyle ?? "panel.border";
    const titleStyle = this.config.titleStyle ?? "panel.title";
    const border = this.theme.resolve(borderStyle);
    const titleCode = this.theme.resolve(titleStyle);
    const pad = this.config.paddingX ?? 1;
    const bordered = this.config.bordered !== false;

    const innerWidth = bordered ? width - 2 - pad * 2 : width;
    const result: string[] = [];

    // Top border
    if (bordered) {
      if (this.config.title) {
        const titleText = ` ${this.config.title} `;
        const plainTitle = ` ${this.config.title} `;
        const visibleTitle = visibleWidth(plainTitle);
        const remaining = width - 2 - visibleTitle;

        const leftLen = Math.floor(remaining / 2);
        const rightLen = remaining - leftLen;

        const left = `${border.prefix}─${"─".repeat(Math.max(0, leftLen))}${border.reset}`;
        const titled = `${titleCode.prefix}${titleText}${titleCode.reset}`;
        const right = `${border.prefix}${"─".repeat(Math.max(0, rightLen))}${border.reset}`;

        const topLine =
          `${border.prefix}┌${border.reset}${left}${titled}${right}${border.prefix}┐${border.reset}`;
        result.push(topLine);
      } else {
        result.push(
          `${border.prefix}┌${"─".repeat(width - 2)}┐${border.reset}`,
        );
      }
    }

    // Content area
    const borderPrefix = bordered ? `${border.prefix}│${border.reset}` : "";
    const borderSuffix = bordered ? `${border.prefix}│${border.reset}` : "";
    const padStr = " ".repeat(pad);

    if (this.children.length === 0) {
      // Empty box
      if (bordered) {
        result.push(`${borderPrefix}${" ".repeat(width - 2)}${borderSuffix}`);
      }
    } else {
      for (const child of this.children) {
        const childLines = child.render(innerWidth);
        for (const line of childLines) {
          const padded = `${padStr}${line}`;
          if (bordered) {
            result.push(`${borderPrefix}${padded}${" ".repeat(Math.max(0, width - 2 - visibleWidth(padded)))}${borderSuffix}`);
          } else {
            result.push(padded);
          }
        }
      }
    }

    // Bottom border
    if (bordered) {
      result.push(
        `${border.prefix}└${"─".repeat(width - 2)}┘${border.reset}`,
      );
    }

    return result;
  }

  handleInput?(data: string): boolean {
    for (const child of this.children) {
      if (child.handleInput?.(data)) return true;
    }
    return false;
  }

  invalidate(): void {
    for (const child of this.children) {
      child.invalidate();
    }
  }
}
