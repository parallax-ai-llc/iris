/**
 * Renderer-side access to the embedded local Iris engine (started in the
 * Electron main process, see electron/ipc/iris.ts). Workflows are stored and
 * executed fully locally (BYOK). The base URL + fetch helper are shared with the
 * batch feature via `@/shared/api/iris-local`.
 */

import { getIrisApiBaseUrl, irisLocalFetch } from '@/shared/api/iris-local';

// Re-exported for existing consumers (WorkflowEditorPage).
export { getIrisApiBaseUrl };

export interface LocalWorkflowSummary {
  id: string;
  name: string;
  status: string;
  nodes: unknown[];
  totalExecutions: number;
  updatedAt: string;
}

export async function listLocalWorkflows(): Promise<LocalWorkflowSummary[]> {
  const r = await irisLocalFetch<{ workflows: LocalWorkflowSummary[] }>(
    '/api/iris/workflows',
  );
  return r.workflows ?? [];
}

export async function createLocalWorkflow(
  name: string,
): Promise<LocalWorkflowSummary | null> {
  const r = await irisLocalFetch<{ workflow: LocalWorkflowSummary }>(
    '/api/iris/workflows',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    },
  );
  return r.workflow ?? null;
}

export async function deleteLocalWorkflow(id: string): Promise<void> {
  await irisLocalFetch(`/api/iris/workflows/${id}`, { method: 'DELETE' });
}
