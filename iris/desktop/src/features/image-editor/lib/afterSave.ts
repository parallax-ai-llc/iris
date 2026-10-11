/**
 * The action that waits for a save to finish ("Save and Close" closes the tab).
 *
 * Every save path reports its outcome with `settle(saved)`: the action runs
 * only when the file was really written (`saved === true`). A cancelled save
 * dialog, a cancelled overwrite confirmation or an error settles with `false`,
 * which drops the action so the tab (and its unsaved work) stays open.
 */

export interface AfterSaveSlot {
  /** Run `action` after the next successful save. */
  set(action: () => void): void;
  /** Forget the pending action (the save flow was dismissed). */
  clear(): void;
  /** Report the save outcome; runs the pending action only when `saved`. */
  settle(saved: boolean): void;
  readonly pending: boolean;
}

export function createAfterSaveSlot(): AfterSaveSlot {
  let action: (() => void) | null = null;
  return {
    set(next) {
      action = next;
    },
    clear() {
      action = null;
    },
    settle(saved) {
      const run = action;
      action = null;
      if (saved && run) run();
    },
    get pending() {
      return action !== null;
    },
  };
}
