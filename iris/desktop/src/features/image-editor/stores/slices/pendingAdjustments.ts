/**
 * Auto-apply of pending (previewed, not yet applied) adjustments / filter
 * preset when the user switches layer or leaves Adjust / Filter mode.
 *
 * The apply callback (registered by EditorCanvas) may itself change the
 * active layer or the edit mode, which would call back into this flush. The
 * flag below makes that re-entry a no-op, so a callback can never recurse
 * (#1: an empty active layer used to overflow the stack).
 */

import type { StoreApi } from 'zustand';
import type { AdjustmentValues, ImageEditorActions, ImageEditorState } from '../imageEditor.store';

type Full = ImageEditorState & ImageEditorActions;
type GetState = StoreApi<Full>['getState'];

export function hasPendingAdjustments(
  adjustments: AdjustmentValues,
  activeFilterPreset: string,
  defaults: AdjustmentValues,
): boolean {
  if (activeFilterPreset !== 'none') return true;
  return (Object.keys(defaults) as (keyof AdjustmentValues)[]).some((key) => adjustments[key] !== defaults[key]);
}

/** Returns `flush()`: run the apply callback once if adjustments are pending. */
export function createPendingAdjustmentsFlusher(get: GetState, defaults: AdjustmentValues): () => void {
  let flushing = false;
  return () => {
    if (flushing) return;
    const { adjustments, activeFilterPreset, _adjustmentsApplyCallback } = get();
    if (!_adjustmentsApplyCallback || !hasPendingAdjustments(adjustments, activeFilterPreset, defaults)) return;
    flushing = true;
    try {
      _adjustmentsApplyCallback();
    } finally {
      flushing = false;
    }
  };
}
