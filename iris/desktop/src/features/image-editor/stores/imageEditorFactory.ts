/**
 * Image Editor Store Factory
 *
 * Creates independent Zustand store instances for each editor tab.
 * This enables instant tab switching without snapshot serialisation/deserialisation.
 */

import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import type { StoreApi } from 'zustand';
import { _createImageEditorSlice, type ImageEditorState, type ImageEditorActions } from './imageEditor.store';
import { createDirtyAwareSet, resolveDirtyPatch } from './dirtyTracking';

export type ImageEditorStoreApi = StoreApi<ImageEditorState & ImageEditorActions>;

type Full = ImageEditorState & ImageEditorActions;

/**
 * Create a brand-new, isolated image editor store.
 * Each open tab gets its own instance so tab switching is just a context swap.
 *
 * Every update (actions and external `setState`) goes through the dirty-aware
 * `set`, so `isDirty` is always derived from history / saved point.
 */
export function createImageEditorStore(
  overrides?: Partial<ImageEditorState>,
): ImageEditorStoreApi {
  return createStore<Full>()(
    subscribeWithSelector((set, get, api) => {
      const dirtyAwareSet = createDirtyAwareSet<Full>(set as Parameters<typeof createDirtyAwareSet<Full>>[0]) as typeof set;
      api.setState = dirtyAwareSet as typeof api.setState;
      const initial = {
        ..._createImageEditorSlice(dirtyAwareSet as ImageEditorStoreApi['setState'], get, api),
        ...overrides,
      } as Full;
      return { ...initial, ...resolveDirtyPatch(initial, {}) } as Full;
    }),
  );
}
