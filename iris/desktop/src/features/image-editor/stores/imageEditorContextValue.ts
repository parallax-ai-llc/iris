/**
 * Image Editor Store Context — Context object only
 *
 * Split from `imageEditorContext.tsx` so the provider component file can
 * satisfy `react-refresh/only-export-components` while still letting hooks
 * share the same context instance.
 */

import { createContext } from 'react';
import type { ImageEditorStoreApi } from './imageEditorFactory';

export type { ImageEditorStoreApi };

export const ImageEditorStoreContext = createContext<ImageEditorStoreApi | null>(null);
