/**
 * Auto-save of the open video project.
 *
 * Trigger: the editor's derived unsaved-changes check
 * (`useEditorStore.getState().hasUnsavedChanges()`, see
 * stores/editor/documentLifecycle.ts). No hand-set dirty flag is involved.
 *
 * Rules:
 *  - Only a project that already exists in the cloud is auto-saved
 *    (`currentProject` set, not provisional, not loading). A provisional
 *    (never saved) project is never turned into a cloud project automatically;
 *    that still takes an explicit save with a name.
 *  - Debounce: the save runs `autoSaveInterval` (30 s) after the LAST edit.
 *    Every timeline change (tracks, markers, history position) restarts it.
 *  - One save at a time: when the timer fires while a save (auto or manual) is
 *    in flight, the run is retried after that save instead of starting a second
 *    request. Edits made during a save stay unsaved (save point rule) and are
 *    picked up by the next run.
 *  - Failure: retried silently with exponential backoff (30 s, 60 s, 120 s, ...,
 *    capped at 5 min). After AUTO_SAVE_MAX_RETRIES consecutive failures it stops
 *    and waits for the next edit, which schedules one more attempt at the capped
 *    delay. A success resets the backoff.
 *  - Closing the editor, closing the project or switching to another project
 *    clears the pending timer and the backoff.
 *
 * Clip sources (cloud asset, `file://`, `blob:`) do not matter: the manual
 * save path (`saveEditorTimeline`) writes them as they are, and so does this.
 */

import { useEditorStore } from '../stores/editor.store';
import { useVideoProjectStore } from '../stores/videoProject.store';
import { isEditorTimelineSaving, saveEditorTimeline } from './saveEditorTimeline';

export const AUTO_SAVE_MAX_BACKOFF_MS = 5 * 60_000;
export const AUTO_SAVE_MAX_RETRIES = 5;

/** The project currently open in the cloud, or null when auto-save must not run. */
function cloudProjectId(): string | null {
  const p = useVideoProjectStore.getState();
  if (!p.autoSaveEnabled || !p.currentProject || p.isProvisional || p.currentProjectLoading) return null;
  if (!useEditorStore.getState().isEditorOpen) return null;
  return p.currentProject.id;
}

/** Delay before the next attempt: the debounce interval, doubled per consecutive failure. */
export function autoSaveDelay(interval: number, failures: number): number {
  if (failures <= 0) return interval;
  return Math.min(interval * 2 ** failures, Math.max(interval, AUTO_SAVE_MAX_BACKOFF_MS));
}

/** Starts auto-save for the editor page; returns the cleanup (unsubscribe + clear timer). */
export function setupAutoSave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  let running = false;
  let rerunAfterSave = false;
  let disposed = false;
  let projectKey: string | null = cloudProjectId();

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const reset = () => {
    clearTimer();
    failures = 0;
    rerunAfterSave = false;
  };

  const schedule = () => {
    clearTimer();
    if (disposed || cloudProjectId() === null) return;
    const interval = useVideoProjectStore.getState().autoSaveInterval;
    timer = setTimeout(fire, autoSaveDelay(interval, Math.min(failures, AUTO_SAVE_MAX_RETRIES)));
  };

  const fire = async () => {
    timer = null;
    const projectId = cloudProjectId();
    if (disposed || projectId === null) return;
    if (running) {
      rerunAfterSave = true;
      return;
    }
    if (isEditorTimelineSaving()) {
      // A manual save is writing right now; look again once the interval passed.
      schedule();
      return;
    }
    if (!useEditorStore.getState().hasUnsavedChanges()) return;

    running = true;
    let ok = false;
    try {
      ok = await saveEditorTimeline(); // no thumbnail: the stored one is kept
    } catch {
      ok = false;
    } finally {
      running = false;
    }

    // Closed or switched while the request was in flight: the new state was reset already.
    if (disposed || cloudProjectId() !== projectId) return;

    if (ok) {
      failures = 0;
      // Edits made during the save are still unsaved; save them after the debounce.
      if (rerunAfterSave || useEditorStore.getState().hasUnsavedChanges()) {
        rerunAfterSave = false;
        if (!timer) schedule();
      }
      return;
    }

    failures += 1;
    rerunAfterSave = false;
    console.warn(`[auto-save] save failed (${failures}/${AUTO_SAVE_MAX_RETRIES})`);
    // Back off; after the retry limit, wait for the next edit.
    if (failures < AUTO_SAVE_MAX_RETRIES) schedule();
    else clearTimer();
  };

  // Any timeline change is an edit for the debounce. The unsaved check itself
  // runs only when the timer fires, so runtime-only changes cost nothing.
  const unsubscribeEditor = useEditorStore.subscribe(
    (s) => [s.tracks, s.markers, s.history, s.historyIndex, s.isEditorOpen] as const,
    ([, , , , isEditorOpen], prev) => {
      if (!isEditorOpen) {
        reset();
        return;
      }
      if (!prev[4]) {
        // Editor (re)opened: a fresh document starts with a fresh backoff.
        reset();
      }
      schedule();
    },
    { equalityFn: (a, b) => a.every((v, i) => Object.is(v, b[i])) },
  );

  const unsubscribeProject = useVideoProjectStore.subscribe(
    () => cloudProjectId(),
    (key) => {
      if (key === projectKey) return;
      projectKey = key;
      // Project closed, switched, became provisional, or auto-save was turned
      // off: drop the pending run and the backoff. (A provisional project that
      // just got its first manual save becomes eligible from its next edit.)
      reset();
    },
  );

  return () => {
    disposed = true;
    unsubscribeEditor();
    unsubscribeProject();
    reset();
  };
}
