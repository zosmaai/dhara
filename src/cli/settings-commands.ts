/**
 * Settings commands — interactive /settings menu.
 *
 * Uses pi-tui's SettingsList component to provide a scrollable,
 * searchable settings menu with cycling values and submenus.
 *
 * Settings:
 * - Theme (cycle: dhara-default, dracula, nord, catppuccin)
 * - Thinking Level (cycle: off, minimal, low, high)
 * - Auto-save (cycle: on, off)
 * - Max iterations (cycle: 5, 10, 15, 20, 30, 50)
 * - Session storage dir (submenu for path)
 */

import type { SettingItem } from "@earendil-works/pi-tui";
import { SettingsList } from "@earendil-works/pi-tui";
import type { ConfigManager } from "../core/config.js";
import type { DharaApp } from "../std/renderers/tui/dhara-app.js";
import { getSettingsListTheme } from "../std/renderers/tui/dhara-theme.js";
import type { TUI } from "../std/renderers/tui/index.js";

/**
 * Configuration for settings that need runtime updates.
 */
export interface SettingsContext {
  /** Called when theme changes. Returns true if successful. */
  onThemeChange?: (newTheme: string) => boolean;
  /** Called when thinking level changes. */
  onThinkingLevelChange?: (newLevel: string) => void;
}

/**
 * Run the interactive /settings menu using pi-tui's SettingsList.
 */
export function handleSettings(
  tui: TUI,
  chat: DharaApp,
  configManager: ConfigManager,
  ctx: SettingsContext,
  currentTheme: string,
): void {
  const config = configManager.config;
  const currentThinkingLevel = "off"; // Default until stored in config
  const autoSave = config.session.autoSave;
  const maxIterations = config.session.maxIterations;

  const items: SettingItem[] = [
    {
      id: "theme",
      label: "Theme",
      description: "Change the TUI color theme",
      currentValue: currentTheme,
      values: ["dhara-default", "dracula", "nord", "catppuccin"],
    },
    {
      id: "thinking",
      label: "Thinking Level",
      description: "How much thinking/reasoning to show",
      currentValue: currentThinkingLevel,
      values: ["off", "minimal", "low", "high"],
    },
    {
      id: "auto-save",
      label: "Auto-Save",
      description: "Automatically save session after each interaction",
      currentValue: autoSave ? "on" : "off",
      values: ["on", "off"],
    },
    {
      id: "max-iterations",
      label: "Max Iterations",
      description: "Maximum agent loop iterations per prompt",
      currentValue: String(maxIterations),
      values: ["5", "10", "15", "20", "30", "50"],
    },
  ];

  const settingsList = new SettingsList(
    items,
    10,
    getSettingsListTheme(),
    (id: string, newValue: string) => {
      switch (id) {
        case "theme": {
          if (ctx.onThemeChange?.(newValue)) {
            chat.addMessage({
              role: "system",
              content: `Theme changed to: ${newValue}`,
            });
          } else {
            chat.addMessage({
              role: "error",
              content: `Theme "${newValue}" not found.`,
            });
          }
          break;
        }
        case "thinking":
          ctx.onThinkingLevelChange?.(newValue);
          chat.addMessage({
            role: "system",
            content: `Thinking level set to: ${newValue}`,
          });
          break;
        case "auto-save":
          configManager.setSessionConfig({ autoSave: newValue === "on" });
          chat.addMessage({
            role: "system",
            content: `Auto-save ${newValue === "on" ? "enabled" : "disabled"}.`,
          });
          break;
        case "max-iterations": {
          const n = Number(newValue);
          if (!Number.isNaN(n) && n > 0) {
            configManager.setSessionConfig({ maxIterations: n });
            chat.addMessage({
              role: "system",
              content: `Max iterations set to: ${n}`,
            });
          }
          break;
        }
      }
      tui.requestRender();
    },
    () => {
      tui.hideOverlay();
    },
    { enableSearch: true },
  );

  tui.showOverlay(settingsList, { anchor: "center", width: "70%" });
}
