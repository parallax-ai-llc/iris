/**
 * Seam wiring for the shared `iris-editor` running inside the desktop app.
 *
 * The desktop hosts the editor against the embedded local engine server (BYOK,
 * fully local). Mirrors iris-host-local's LocalApp seams:
 *   - apiClient  → local IrisApiClient pointed at the embedded server's port
 *   - t          → English `iris.*` dictionary (full i18next wiring is a follow-up)
 *   - useModels  → static (ModelSelector falls back to iris-nodes MODEL_OPTIONS)
 *   - navigate   → close the editor / return to the list
 */

import { useMemo } from 'react';
import {
  createLocalApiClient,
  createLocalT,
  type IrisEditorSeams,
  type ModelsSeam,
} from 'iris-editor';

// Stable module-level references — the editor's config effects depend on these
// ([agents]/[fetchAgents]); a fresh object per render would spin a render loop.
const LOCAL_MODELS_SEAM: ModelsSeam = {
  agents: [],
  fetchAgents: () => {},
  isLoading: false,
};
const localT = createLocalT();

/** Build the editor seams for a resolved local engine base URL. */
export function useDesktopEditorSeams(
  baseUrl: string,
  onClose: () => void,
): IrisEditorSeams {
  return useMemo<IrisEditorSeams>(
    () => ({
      apiClient: createLocalApiClient(baseUrl),
      t: localT,
      useModels: () => LOCAL_MODELS_SEAM,
      navigate: onClose,
    }),
    [baseUrl, onClose],
  );
}
