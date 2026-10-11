/**
 * Layer property changes that are part of the document: visibility, lock,
 * opacity, fill opacity and blend mode. They are saved (PSD keeps all of
 * them), so like Photoshop each change is one history entry: the change makes
 * the document dirty and one undo reverts it.
 *
 * `updateLayer` stays a raw setter for features that push their own entry
 * after a multi-step edit. UI controls and commands that change these
 * properties call `setLayerProperties` instead.
 *
 * Slider gestures: consecutive opacity (or fill opacity) changes of the same
 * layer within `GESTURE_WINDOW_MS` update the entry they started instead of
 * adding one per input event, so dragging a slider is one step.
 */

import type { StoreApi } from 'zustand';
import type { ImageEditorActions, ImageEditorState, Layer } from '../imageEditor.store';

type Full = ImageEditorState & ImageEditorActions;
type SetState = StoreApi<Full>['setState'];
type GetState = StoreApi<Full>['getState'];

export type LayerPropertiesSliceActions = Pick<ImageEditorActions, 'setLayerProperties'>;

/** Layer fields `setLayerProperties` accepts. */
export type LayerDocumentProperties = Partial<Pick<Layer, 'visible' | 'locked' | 'opacity' | 'fillOpacity' | 'blendMode'>>;

/** History labels of layer property changes (not playable Actions steps). */
export const LAYER_PROPERTY_LABELS = [
  'Hide Layer',
  'Show Layer',
  'Lock Layer',
  'Unlock Layer',
  'Layer Opacity',
  'Fill Opacity',
  'Blending Change',
  'Layer Properties',
] as const;

/** Continuous properties driven by sliders. */
const SLIDER_KEYS = new Set<keyof LayerDocumentProperties>(['opacity', 'fillOpacity']);

export const GESTURE_WINDOW_MS = 800;

function labelFor(patch: LayerDocumentProperties): string {
  const keys = Object.keys(patch) as (keyof LayerDocumentProperties)[];
  if (keys.length !== 1) return 'Layer Properties';
  switch (keys[0]) {
    case 'visible': return patch.visible ? 'Show Layer' : 'Hide Layer';
    case 'locked': return patch.locked ? 'Lock Layer' : 'Unlock Layer';
    case 'opacity': return 'Layer Opacity';
    case 'fillOpacity': return 'Fill Opacity';
    default: return 'Blending Change';
  }
}

export function createLayerPropertiesSlice(set: SetState, get: GetState): LayerPropertiesSliceActions {
  /** The slider entry that later changes of the same gesture update in place. */
  let gesture: { entryId: string; layerId: string; key: string; at: number } | null = null;

  return {
    setLayerProperties: (layerId, patch) => {
      const layer = get().layers.find((l) => l.id === layerId);
      if (!layer) return;

      // Only fields that actually change count.
      const changed: LayerDocumentProperties = {};
      for (const key of Object.keys(patch) as (keyof LayerDocumentProperties)[]) {
        const value = patch[key];
        if (value !== undefined && layer[key] !== value) {
          (changed as Record<string, unknown>)[key] = value;
        }
      }
      const keys = Object.keys(changed);
      if (keys.length === 0) return;

      set((state) => ({
        layers: state.layers.map((l) => (l.id === layerId ? { ...l, ...changed } : l)),
      }));

      const now = Date.now();
      const sliderKey = keys.length === 1 && SLIDER_KEYS.has(keys[0] as keyof LayerDocumentProperties) ? keys[0] : null;
      const { history, historyIndex, savedHistoryIndex } = get();
      const current = history[historyIndex];
      const continues = !!sliderKey && !!gesture && !!current
        && gesture.entryId === current.id
        && gesture.layerId === layerId
        && gesture.key === sliderKey
        && now - gesture.at <= GESTURE_WINDOW_MS;

      if (continues && current) {
        // Same slider gesture: refresh the entry's snapshot instead of adding one.
        const updated = { ...current, timestamp: now, layers: get().layers.map((l) => ({ ...l })) };
        set({
          history: history.map((h, i) => (i === historyIndex ? updated : h)),
          // The saved state is no longer what this entry holds.
          savedHistoryIndex: savedHistoryIndex === historyIndex ? null : savedHistoryIndex,
        });
        gesture = { ...gesture!, at: now };
        return;
      }

      get().pushHistory(labelFor(changed), '');
      const pushed = get().history[get().historyIndex];
      gesture = sliderKey && pushed ? { entryId: pushed.id, layerId, key: sliderKey, at: now } : null;
    },
  };
}
