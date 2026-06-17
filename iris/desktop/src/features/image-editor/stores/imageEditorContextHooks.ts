/**
 * Image Editor Store Context — Hooks
 *
 * Split from `imageEditorContext.tsx` so the component file only exports
 * components (required by `react-refresh/only-export-components`).
 */

import { useContext } from 'react';
import { useStore } from 'zustand';
import { ImageEditorStoreContext, type ImageEditorStoreApi } from './imageEditorContextValue';
import type { ImageEditorState, ImageEditorActions } from './imageEditor.store';

/**
 * React hook — drop-in replacement for the old global `useImageEditorStore()`.
 *
 * Overloads:
 *   useImageEditorStoreCtx()          → full state + actions
 *   useImageEditorStoreCtx(selector)  → derived slice
 */
export function useImageEditorStoreCtx(): ImageEditorState & ImageEditorActions;
export function useImageEditorStoreCtx<T>(
  selector: (s: ImageEditorState & ImageEditorActions) => T,
): T;
export function useImageEditorStoreCtx<T>(
  selector?: (s: ImageEditorState & ImageEditorActions) => T,
) {
  const store = useContext(ImageEditorStoreContext);
  if (!store) {
    throw new Error(
      'useImageEditorStoreCtx must be used within <ImageEditorStoreProvider>',
    );
  }
  const effectiveSelector =
    selector ??
    ((s: ImageEditorState & ImageEditorActions) => s as unknown as T);
  return useStore(store, effectiveSelector);
}

/**
 * Return the raw `StoreApi` ref — useful inside `useEffect` / callbacks
 * where you need `.getState()` without triggering a subscription.
 */
export function useImageEditorStoreApi(): ImageEditorStoreApi {
  const store = useContext(ImageEditorStoreContext);
  if (!store) {
    throw new Error(
      'useImageEditorStoreApi must be used within <ImageEditorStoreProvider>',
    );
  }
  return store;
}
