/**
 * Shared access to the embedded local Iris engine (the detached daemon, or the
 * in-process server under TEST_MODE — started by Electron main, see
 * electron/ipc/iris.ts). Both the `workflows` and `batch` features talk to it,
 * so the base-URL resolver + fetch helper live here in `shared/` rather than in
 * either feature.
 */

let baseUrlPromise: Promise<string> | null = null;

/** Resolve (once) the embedded engine's base URL over IPC. */
export function getIrisApiBaseUrl(): Promise<string> {
  if (!baseUrlPromise) {
    baseUrlPromise =
      window.electronAPI?.iris?.getApiBaseUrl?.() ?? Promise.resolve('');
  }
  return baseUrlPromise;
}

/** Fetch a JSON endpoint on the local engine, surfacing its `{ error }` body. */
export async function irisLocalFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const base = await getIrisApiBaseUrl();
  if (!base) throw new Error('Local Iris engine is not running');
  const res = await fetch(`${base}${path}`, init);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export interface LocalWorkflowNode {
  id?: string;
  nodeId?: string;
  type?: string;
  label?: string;
  config?: Record<string, unknown>;
}

export interface LocalWorkflowFull {
  id: string;
  name: string;
  status?: string;
  description?: string;
  nodes: LocalWorkflowNode[];
  edges?: unknown[];
  totalExecutions?: number;
  updatedAt?: string;
}

/** All local workflows (full graph) — used by the batch workflow picker. */
export async function listLocalWorkflows(): Promise<LocalWorkflowFull[]> {
  const r = await irisLocalFetch<{ workflows: LocalWorkflowFull[] }>(
    '/api/iris/workflows',
  );
  return r.workflows ?? [];
}

/** One local workflow (full graph), or null if missing. */
export async function getLocalWorkflow(
  id: string,
): Promise<LocalWorkflowFull | null> {
  try {
    const r = await irisLocalFetch<{ workflow: LocalWorkflowFull }>(
      `/api/iris/workflows/${id}`,
    );
    return r.workflow ?? null;
  } catch {
    return null;
  }
}
