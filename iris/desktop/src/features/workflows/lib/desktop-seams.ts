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

import { useEffect, useMemo, useState } from 'react';
import {
  createLocalApiClient,
  createLocalT,
  type IrisEditorSeams,
  type ModelsSeam,
} from 'iris-editor';

// Stable module-level references — the editor's config effects depend on these
// ([agents]/[fetchAgents]); a fresh object per render would spin a render loop.
// The model list comes from the static node-definitions fallback in
// ModelSelector; `availableProviders` is layered on to gate models by BYOK keys.
const STABLE_AGENTS: ModelsSeam['agents'] = [];
const NOOP_FETCH = () => {};
const localT = createLocalT();

/** Build the editor seams for a resolved local engine base URL. */
export function useDesktopEditorSeams(
  baseUrl: string,
  onClose: () => void,
): IrisEditorSeams {
  // BYOK providers with a configured key (from the embedded engine's
  // /api/health). `undefined` until loaded → ModelSelector gates nothing.
  const [providers, setProviders] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch(`${baseUrl}/api/health`)
      .then(r => r.json())
      .then(h => {
        if (!cancelled) setProviders(h.providers ?? []);
      })
      .catch(() => {
        if (!cancelled) setProviders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  const modelsSeam = useMemo<ModelsSeam>(
    () => ({
      agents: STABLE_AGENTS,
      fetchAgents: NOOP_FETCH,
      isLoading: false,
      availableProviders: providers,
    }),
    [providers],
  );

  return useMemo<IrisEditorSeams>(
    () => ({
      apiClient: createLocalApiClient(baseUrl),
      t: localT,
      useModels: () => modelsSeam,
      navigate: onClose,
    }),
    [baseUrl, onClose, modelsSeam],
  );
}
