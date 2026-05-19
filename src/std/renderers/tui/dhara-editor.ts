/**
 * DharaEditor — Custom editor that intercepts Ctrl+C and Ctrl+D
 * before the Editor's internal handler processes them.
 *
 * Mirrors pi's CustomEditor pattern: extends pi-tui Editor,
 * overrides handleInput to check app-level keybindings first,
 * then delegates to super.handleInput for normal editing.
 */
import { Editor, matchesKey } from "@earendil-works/pi-tui";

export class DharaEditor extends Editor {
  /** Handler for Ctrl+C (double-tap exit logic) */
  onCtrlC?: () => void;
  /** Handler for Ctrl+D (exit on empty editor) */
  onCtrlD?: () => void;
  /** Handler for Ctrl+O (toggle tool result expansion) */
  onToggleToolExpansion?: () => void;

  handleInput(data: string): void {
    // Ctrl+C — intercept before Editor's internal handler (which binds it to
    // tui.input.copy and silently returns). We always consume Ctrl+C so it
    // never reaches the Editor's internal handler.
    //
    // Use matchesKey() because with Kitty keyboard protocol active, Ctrl+C
    // arrives as a CSI-u sequence (\x1b[99;5u) not the raw byte \x03.
    if (matchesKey(data, "ctrl+c")) {
      this.onCtrlC?.();
      return;
    }

    // Ctrl+D — only intercept when editor is empty (exit).
    // When editor has content, fall through to Editor for delete-forward.
    //
    // Use matchesKey() because with Kitty keyboard protocol active, Ctrl+D
    // arrives as a CSI-u sequence (\x1b[100;5u) not the raw byte \x04.
    if (matchesKey(data, "ctrl+d")) {
      if (this.getText().length === 0) {
        this.onCtrlD?.();
        return;
      }
      // Fall through to Editor for deleteCharForward
    }

    // Ctrl+O — toggle tool result expansion
    if (matchesKey(data, "ctrl+o")) {
      this.onToggleToolExpansion?.();
      return;
    }

    // All other input — let Editor handle normally
    super.handleInput(data);
  }
}
