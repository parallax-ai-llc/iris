/**
 * History (undo/redo) + dirty-tracking actions of the image editor store.
 *
 * Split out of `imageEditor.store.ts`. `isDirty` is derived (see
 * `../dirtyTracking.ts`): these actions only move `historyIndex` and the saved
 * point; the store's dirty-aware `set` recomputes `isDirty`.
 *
 * Each entry stores the document state needed to restore it: the layer stack
 * and the document (canvas) size. Undo / redo / clicking a History row restore
 * both, so crop, Image Size and Canvas Size undo back to the old dimensions.
 *
 * Layer-structure actions (add, delete, reorder, merge ...) push their entry
 * through `pushLayerStructureHistory`. Such an entry is "absorbable" until the
 * current task ends: when a feature adds a layer and then pushes its own entry
 * in the same synchronous block (Text, AI result layers), the explicit push
 * replaces the structural one, so the user sees one step, not two.
 */

import type { StoreApi } from 'zustand';
import { generateId } from '@/shared/lib/utils/id';
import { useActionsStore } from '../actions.store';
import { shiftSavedIndexOnPush } from '../dirtyTracking';
import { LAYER_PROPERTY_LABELS } from './layerProperties.slice';
import type { HistoryState, ImageEditorActions, ImageEditorState } from '../imageEditor.store';

type Full = ImageEditorState & ImageEditorActions;
type SetState = StoreApi<Full>['setState'];
type GetState = StoreApi<Full>['getState'];

export type HistorySliceActions = Pick<
  ImageEditorActions,
  'pushHistory' | 'undo' | 'redo' | 'goToHistoryState' | 'clearHistory' | 'canUndo' | 'canRedo' | 'markDirty' | 'clearDirty'
>;

/** History labels that map to a recordable action step (Actions panel recording). */
const LABEL_TO_ACTION_TYPE: Record<string, string> = {
  'Crop': 'crop:apply',
  'Adjustments': 'adjust:apply',
  'Transform': 'transform:rotate',
  'Flip Horizontal': 'transform:flip-h',
  'Flip Vertical': 'transform:flip-v',
  'Brush Stroke': 'draw:brush-stroke',
  'Fill': 'draw:fill',
  'Layer Added': 'layer:add',
  'Layer Deleted': 'layer:delete',
  'Layer Duplicated': 'layer:duplicate',
  'Merge Down': 'layer:merge-down',
  'Filter': 'filter:apply',
  'Content-Aware Fill': 'selection:content-aware-fill',
};

/**
 * Layer-structure labels without a playable action step. They must not fall
 * back to 'adjust:apply' when the Actions panel is recording.
 */
const UNRECORDED_LABELS = new Set([
  'Layer Order',
  'Flatten Image',
  'Stamp Visible',
  'New Group',
  'Ungroup',
  'Move to Group',
  'Adjustment Layer',
  'Fill Layer',
  'Text',
  // Layer property changes (slices/layerProperties.slice.ts)
  ...LAYER_PROPERTY_LABELS,
  // Pixel operations without a playable step (slices/layerPixelOps.slice.ts)
  'Warp',
  'Fill Path',
  'Stroke Path',
]);

function recordAction(label: string) {
  if (UNRECORDED_LABELS.has(label)) return;
  try {
    const actionsState = useActionsStore.getState();
    if (actionsState.isRecording) {
      const actionType = LABEL_TO_ACTION_TYPE[label] || 'adjust:apply';
      actionsState.recordStep(actionType as Parameters<typeof actionsState.recordStep>[0], { label });
    }
  } catch { /* actions store not available */ }
}

/**
 * Ids of entries pushed by a layer-structure action in the current task. An
 * explicit `pushHistory` in the same task replaces such an entry instead of
 * appending a second one (see the file header). Cleared by a microtask.
 */
const absorbableEntryIds = new Set<string>();

/**
 * Push the history entry of a layer-structure change (add, delete, reorder,
 * duplicate, merge, group ...). The entry snapshots the layers as they are now.
 */
export function pushLayerStructureHistory(get: GetState, label: string): void {
  get().pushHistory(label, '', true, { absorbable: true });
}

/**
 * Move to `index`, restoring what that entry recorded: the layer stack and the
 * document size. Keeps `activeLayerId` pointing at an existing layer.
 */
function jumpTo(set: SetState, get: GetState, history: HistoryState[], index: number) {
  const target = history[index];
  const updates: Partial<ImageEditorState> = { historyIndex: index };
  if (target.layers) {
    const layers = target.layers.map((l) => ({ ...l }));
    updates.layers = layers;
    const { activeLayerId } = get();
    if (!activeLayerId || !layers.some((l) => l.id === activeLayerId)) {
      updates.activeLayerId = layers.length > 0 ? layers[layers.length - 1].id : null;
    }
  }
  if (target.canvasWidth && target.canvasHeight && target.canvasWidth > 0 && target.canvasHeight > 0) {
    updates.canvasWidth = target.canvasWidth;
    updates.canvasHeight = target.canvasHeight;
  }
  set(updates);
}

export function createHistorySlice(set: SetState, get: GetState): HistorySliceActions {
  return {
    /**
     * Push a history entry. `markDirty = false` marks a baseline entry (the
     * 'Open' state): when the document is clean, the saved point moves onto it.
     */
    pushHistory: (label, imageData, markDirty = true, options) => {
      const absorbable = options?.absorbable === true;
      const {
        history, historyIndex, maxHistoryStates, layers, savedHistoryIndex, isDirty, canvasWidth, canvasHeight,
      } = get();
      const newState: HistoryState = {
        id: generateId(),
        label,
        timestamp: Date.now(),
        imageData,
        // Save layers snapshot for proper undo/redo
        layers: layers.map((l) => ({ ...l })),
        // Document size, so crop / Image Size / Canvas Size undo restores it
        canvasWidth,
        canvasHeight,
      };

      // An explicit push right after a layer-structure push (same task) replaces it.
      const current = history[historyIndex];
      const absorb = !absorbable && !!current && absorbableEntryIds.has(current.id);
      if (absorb) absorbableEntryIds.delete(current.id);
      const keepUpTo = absorb ? historyIndex : historyIndex + 1;

      // Remove any future states if we're in the middle of history, then limit size
      const newHistory = [...history.slice(0, keepUpTo), newState];
      const trimmedHistory = newHistory.slice(-maxHistoryStates);
      const removed = newHistory.length - trimmedHistory.length;
      const newIndex = trimmedHistory.length - 1;

      if (absorbable) {
        // Record the action step only if no explicit push absorbs this entry.
        absorbableEntryIds.add(newState.id);
        queueMicrotask(() => {
          if (absorbableEntryIds.delete(newState.id)) recordAction(label);
        });
      } else {
        recordAction(label);
      }

      const baseline = !markDirty && !isDirty;
      set({
        history: trimmedHistory,
        historyIndex: newIndex,
        savedHistoryIndex: baseline ? newIndex : shiftSavedIndexOnPush(savedHistoryIndex, keepUpTo - 1, removed),
      });
    },

    undo: () => {
      const { historyIndex, history } = get();
      if (historyIndex > 0) jumpTo(set, get, history, historyIndex - 1);
    },

    redo: () => {
      const { history, historyIndex } = get();
      if (historyIndex < history.length - 1) jumpTo(set, get, history, historyIndex + 1);
    },

    goToHistoryState: (index) => {
      const { history } = get();
      if (index >= 0 && index < history.length) jumpTo(set, get, history, index);
    },

    clearHistory: () => {
      // The saved state survives only if we are standing on it.
      set({ history: [], historyIndex: -1, savedHistoryIndex: get().isDirty ? null : -1 });
    },

    canUndo: () => get().historyIndex > 0,

    canRedo: () => {
      const { history, historyIndex } = get();
      return historyIndex < history.length - 1;
    },

    /** Record a change that has no history entry (stays dirty until the next save). */
    markDirty: () => {
      set({ isDirty: true });
    },

    /** The current state is now the saved state (call after a successful save). */
    clearDirty: () => {
      set({ isDirty: false });
    },
  };
}
