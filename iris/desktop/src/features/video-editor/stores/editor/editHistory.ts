/**
 * Coalesced history entries for edits that arrive as a stream (inspector
 * sliders, Lumetri, effect parameters, typed text, mixer faders).
 *
 * Such an edit changes the tracks at once and schedules ONE history entry that
 * is pushed after the stream goes quiet. Anything that needs the history to be
 * current first settles the pending entry:
 *  - `pushHistory` folds it into its own entry (the snapshot already holds the change),
 *  - undo / redo / history jumps and save points commit it first, so Undo reverts
 *    the slider move and Redo brings it back (it is never lost),
 *  - opening/closing a project drops it.
 */

export const HISTORY_COALESCE_MS = 500;

let timer: ReturnType<typeof setTimeout> | null = null;
let pendingLabel: string | null = null;

/**
 * Schedule (or extend) the pending entry. The first label of a burst is kept.
 * `commit` runs when the burst ends; `isBusy` postpones it (e.g. during a drag).
 */
export function scheduleHistoryCommit(label: string, commit: (label: string) => void, isBusy: () => boolean): void {
  if (pendingLabel === null) pendingLabel = label;
  if (timer) clearTimeout(timer);
  const fire = () => {
    if (isBusy()) {
      timer = setTimeout(fire, HISTORY_COALESCE_MS);
      return;
    }
    const l = pendingLabel;
    timer = null;
    pendingLabel = null;
    if (l !== null) commit(l);
  };
  timer = setTimeout(fire, HISTORY_COALESCE_MS);
}

/** Cancel the pending entry and return its label (null when nothing was pending). */
export function takePendingHistory(): string | null {
  if (timer) clearTimeout(timer);
  timer = null;
  const l = pendingLabel;
  pendingLabel = null;
  return l;
}
