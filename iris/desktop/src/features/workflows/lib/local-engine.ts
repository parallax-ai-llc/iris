/**
 * Renderer-side access to the embedded local Iris engine (started in the
 * Electron main process, see electron/ipc/iris.ts). Workflows are stored and
 * executed fully locally (BYOK). The base URL + fetch helper are shared with the
 * batch feature via `@/shared/api/iris-local`.
 */

import { getIrisApiBaseUrl, irisLocalFetch } from '@/shared/api/iris-local';
import type { PresetTemplate } from 'iris-templates';

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

/**
 * Create a local workflow pre-populated from a preset template's graph. Maps the
 * shared `iris-templates` node/edge shape onto the local store shape
 * (`position: {x,y}`, handle ids) and creates it in one POST.
 */
export async function createLocalWorkflowFromTemplate(
  template: PresetTemplate,
): Promise<LocalWorkflowSummary | null> {
  const nodes = template.presetNodes.map((n) => ({
    id: n.nodeId,
    nodeId: n.nodeId,
    type: n.type,
    label: n.label,
    config: n.config ?? {},
    inputPorts: [],
    outputPorts: [],
    position: { x: n.positionX, y: n.positionY },
  }));
  const edges = template.presetEdges.map((e) => ({
    edgeId: e.edgeId,
    sourceNodeId: e.sourceNodeId,
    targetNodeId: e.targetNodeId,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
  }));
  const r = await irisLocalFetch<{ workflow: LocalWorkflowSummary }>(
    '/api/iris/workflows',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: template.name, nodes, edges }),
    },
  );
  return r.workflow ?? null;
}
