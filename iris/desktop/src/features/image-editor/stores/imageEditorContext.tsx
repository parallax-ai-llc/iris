/**
 * Image Editor Store Context — Provider component
 *
 * The context object itself lives in `imageEditorContextValue.ts` and the
 * hooks in `imageEditorContextHooks.ts` so this file only exports the
 * provider component (required by `react-refresh/only-export-components`).
 */

import type { ReactNode } from 'react';
import { ImageEditorStoreContext, type ImageEditorStoreApi } from './imageEditorContextValue';

export type { ImageEditorStoreApi };

interface ProviderProps {
  store: ImageEditorStoreApi | null;
  children: ReactNode;
}

/**
 * Wrap the editor UI tree with this provider.
 * When `activeTabId` changes the parent swaps the `store` prop
 * → all descendants re-subscribe to the new store instantly.
 */
export function ImageEditorStoreProvider({ store, children }: ProviderProps) {
  return (
    <ImageEditorStoreContext.Provider value={store}>
      {children}
    </ImageEditorStoreContext.Provider>
  );
}
