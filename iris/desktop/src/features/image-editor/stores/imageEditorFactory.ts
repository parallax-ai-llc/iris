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

export type ImageEditorStoreApi = StoreApi<ImageEditorState & ImageEditorActions>;

/**
 * Create a brand-new, isolated image editor store.
 * Each open tab gets its own instance so tab switching is just a context swap.
 */
export function createImageEditorStore(
  overrides?: Partial<ImageEditorState>,
): ImageEditorStoreApi {
  return createStore<ImageEditorState & ImageEditorActions>()(
    subscribeWithSelector((set, get, api) => ({
      ..._createImageEditorSlice(set, get, api),
      ...overrides,
    })),
  );
}
