/**
 * IrisEditorProvider — the single injection point for everything app-specific.
 *
 * The vendored editor (verbatim from iris/web) reaches its host through three
 * channels, all configured here:
 *   1. `irisApiClient` singleton  — bridged via setIrisApiClient (module-level,
 *      because components call it outside React, in effects/handlers).
 *   2. React hooks (`useI18n`, `useAgentStore`) — read this context.
 *   3. Optional component slots (storage browser / file attachment) — read this
 *      context; when absent the relevant input-source UI degrades gracefully.
 *
 *   iris/web injects its real client, i18n, agent store, and media components.
 *   iris-host-local injects a local-endpoint client, an English i18n, a static
 *   model list, and omits the cloud-only media components.
 */

import {
  createContext,
  useContext,
  type ComponentType,
  type ReactNode,
} from 'react';
import type { IrisApiClient } from './lib/apis/iris-api-client';
import { setIrisApiClient } from './lib/apis/iris-api-client';
import type { AgentModel } from './store/agent';

export interface ModelsSeam {
  agents: AgentModel[];
  fetchAgents: () => void;
  isLoading: boolean;
}

export interface IrisEditorSeams {
  apiClient: IrisApiClient;
  /** i18n translate. Second arg is a fallback string or interpolation params. */
  t: (key: string, params?: string | Record<string, unknown>) => string;
  /** Agent/model list source (ModelSelector). */
  useModels: () => ModelsSeam;
  /** App navigation (back / upgrade / not-found). No-op if omitted. */
  navigate?: (path: string) => void;
  /** Optional media/storage components (storage input source, output picker). */
  StorageBrowserModal?: ComponentType<Record<string, unknown>>;
  StorageLocationPicker?: ComponentType<Record<string, unknown>>;
  FileAttachment?: ComponentType<Record<string, unknown>>;
}

const SeamsContext = createContext<IrisEditorSeams | null>(null);

export function useSeams(): IrisEditorSeams {
  const ctx = useContext(SeamsContext);
  if (!ctx) {
    throw new Error(
      'iris-editor: missing <IrisEditorProvider>. Wrap the editor with it.',
    );
  }
  return ctx;
}

export function IrisEditorProvider({
  value,
  children,
}: {
  value: IrisEditorSeams;
  children: ReactNode;
}) {
  // Bridge the module-level singleton synchronously so effects/handlers that
  // call `irisApiClient.*` after mount hit the injected implementation.
  setIrisApiClient(value.apiClient);
  return (
    <SeamsContext.Provider value={value}>{children}</SeamsContext.Provider>
  );
}
