/**
 * useProjectLeaveGuard - one gate for every way of leaving the open video
 * project (File > Go Back / header X, File > New, File > Open).
 *
 * The only condition for the "Unsaved Changes" dialog is
 * `useEditorStore.getState().hasUnsavedChanges()` (derived from the history
 * position and the save point, see stores/editor/documentLifecycle.ts). Where
 * the clips come from (cloud asset, blob:, file://) does not matter.
 *
 * Dialog answers:
 *  - Discard: leave without saving.
 *  - Cancel: stay; nothing changes.
 *  - Save & Continue: leave only once the save succeeded. A first save of a
 *    provisional project asks for a name first (SaveProjectModal); the action
 *    is parked and resumed by the name-save (`takeParkedAction`).
 */

import { useCallback, useRef, useState } from 'react';
import { useEditorStore } from '../stores/editor.store';

export type ProjectLeaveAction = 'close' | 'new' | 'open';

/**
 * Result of the save used by "Save & Continue": true = saved, false = failed,
 * 'deferred' = a name prompt was opened and the save happens later.
 */
export type LeaveSaveResult = boolean | 'deferred';

export function useProjectLeaveGuard(proceed: (action: ProjectLeaveAction) => void) {
  const [pendingAction, setPendingAction] = useState<ProjectLeaveAction | null>(null);
  const parkedRef = useRef<ProjectLeaveAction | null>(null);

  const requestLeave = useCallback(
    (action: ProjectLeaveAction) => {
      if (useEditorStore.getState().hasUnsavedChanges()) {
        setPendingAction(action);
        return;
      }
      proceed(action);
    },
    [proceed],
  );

  const cancelLeave = useCallback(() => setPendingAction(null), []);

  const discardAndLeave = useCallback(() => {
    const action = pendingAction;
    setPendingAction(null);
    if (action) proceed(action);
  }, [pendingAction, proceed]);

  const saveAndLeave = useCallback(
    async (save: () => Promise<LeaveSaveResult>) => {
      const action = pendingAction;
      setPendingAction(null);
      if (!action) return;
      parkedRef.current = action;
      const result = await save();
      if (result === 'deferred') return; // resumed by takeParkedAction after the name-save
      if (parkedRef.current === action) parkedRef.current = null;
      if (result === true) proceed(action);
    },
    [pendingAction, proceed],
  );

  /** Take (and clear) the action parked by "Save & Continue" while a name is asked for. */
  const takeParkedAction = useCallback((): ProjectLeaveAction | null => {
    const action = parkedRef.current;
    parkedRef.current = null;
    return action;
  }, []);

  return { pendingAction, requestLeave, cancelLeave, discardAndLeave, saveAndLeave, takeParkedAction };
}
