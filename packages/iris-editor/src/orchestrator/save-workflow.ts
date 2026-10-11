/**
 * Saving the editor graph.
 *
 * A save is three requests (PATCH name/status, PUT nodes, PUT edges) and the
 * user can keep editing while they are in flight. The save therefore works
 * on a snapshot taken when it starts and records the store's `editRevision`
 * at that moment. When the requests finish it clears `isDirty` only if the
 * revision has not moved (`markSaved`); an edit made during the save keeps
 * the graph dirty so it is not shown as saved and is not lost on close. A
 * failed save leaves `isDirty` as it was. Nothing is re-saved automatically.
 *
 * This module only uses type imports so it can be tested without a bundler.
 */
import type { Edge, Node } from '@xyflow/react';
import type {
  ApiEdgeInput,
  ApiNodeInput,
  IrisApiClient,
  Workflow,
  WorkflowStatus,
} from '../lib/apis/iris-api-client';
import type { IrisNodeData, NodeConfig } from '../store/iris-editor';

/** The parts of the editor store a save needs. */
export interface SaveStoreState {
  nodes: Node<IrisNodeData>[];
  edges: Edge[];
  nodeConfigs: Record<string, NodeConfig>;
  editRevision: number;
  markSaved: (revision: number) => boolean;
}

export interface SaveWorkflowInput {
  workflow: Pick<Workflow, 'id' | 'name' | 'description'>;
  /** Read the store at call time (e.g. `useIrisEditorStore.getState`). */
  getState: () => SaveStoreState;
  api: Pick<IrisApiClient, 'updateWorkflow' | 'updateNodes' | 'updateEdges'>;
}

export interface SaveWorkflowResult {
  /** Status written to the workflow (ACTIVE when the graph has a trigger). */
  status: WorkflowStatus;
  /**
   * True when the saved snapshot is still the current graph and `isDirty`
   * was cleared; false when the graph was edited during the save.
   */
  upToDate: boolean;
}

/** Map the store graph to the node/edge payloads the API stores. */
export function toApiGraph(
  nodes: Node<IrisNodeData>[],
  edges: Edge[],
  nodeConfigs: Record<string, NodeConfig>,
): { nodes: ApiNodeInput[]; edges: ApiEdgeInput[] } {
  const apiNodes = nodes.map((node) => {
    const storeConfig = nodeConfigs[node.id];
    const mergedConfig = {
      ...(node.data.config as unknown as Record<string, unknown>),
      model: storeConfig?.model,
      provider: storeConfig?.provider,
      settings: storeConfig?.settings || {},
      inputs: storeConfig?.inputs || {},
      outputs: storeConfig?.outputs || {},
    };
    return {
      nodeId: node.id,
      type: node.data.type,
      label: node.data.label,
      positionX: node.position.x,
      positionY: node.position.y,
      config: mergedConfig,
    };
  });

  const apiEdges = edges.map((edge) => ({
    edgeId: edge.id,
    sourceNodeId: edge.source,
    sourceHandle: edge.sourceHandle || 'output',
    targetNodeId: edge.target,
    targetHandle: edge.targetHandle || 'input',
  }));

  return { nodes: apiNodes, edges: apiEdges };
}

/**
 * Save the graph as it is now. Throws when a request fails (`isDirty` is
 * left untouched).
 */
export async function saveWorkflowGraph({
  workflow,
  getState,
  api,
}: SaveWorkflowInput): Promise<SaveWorkflowResult> {
  // One consistent snapshot: graph and revision read together.
  const { nodes, edges, nodeConfigs, editRevision } = getState();

  const hasTrigger = nodes.some((node) => node.data.type.startsWith('TRIGGER_'));
  const status: WorkflowStatus = hasTrigger ? 'ACTIVE' : 'DRAFT';
  const graph = toApiGraph(nodes, edges, nodeConfigs);

  await api.updateWorkflow(workflow.id, {
    name: workflow.name,
    description: workflow.description,
    status,
  });
  await api.updateNodes(workflow.id, graph.nodes);
  await api.updateEdges(workflow.id, graph.edges);

  const upToDate = getState().markSaved(editRevision);
  return { status, upToDate };
}
