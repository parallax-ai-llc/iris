/**
 * Saving the editor graph.
 *
 * The save works on the document as it is when the save starts and on the
 * history entry it was at (`headEntryId`, 07 C3). When the requests finish,
 * that entry becomes the saved point: if the user kept editing meanwhile the
 * document stays dirty, and undoing back to the saved point makes it clean.
 * A failed save leaves the saved point where it was. Nothing is re-saved
 * automatically.
 *
 * Hosts that can store a whole document at once (`saveWorkflowDoc`, the local
 * REST host) get one request with the revision the editor loaded, so a save
 * is atomic and a stale copy is refused (W-19). Other hosts (the cloud) keep
 * the three requests (PATCH name/status, PUT nodes, PUT edges), built from the
 * same document.
 *
 * This module only uses type imports so it can be tested without a bundler.
 */
import type { Edge, Node } from '@xyflow/react';
import type { WorkflowDoc } from 'iris-nodes';
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
  /** Document stores (current editor) also provide these. */
  doc?: WorkflowDoc;
  history?: { headEntryId: string };
  baseRevision?: number | null;
  markSavedEntry?: (entryId: string, baseRevision?: number | null) => boolean;
}

export interface SaveWorkflowInput {
  workflow: Pick<Workflow, 'id' | 'name' | 'description'>;
  /** Read the store at call time (e.g. `useIrisEditorStore.getState`). */
  getState: () => SaveStoreState;
  api: Pick<IrisApiClient, 'updateWorkflow' | 'updateNodes' | 'updateEdges' | 'saveWorkflowDoc'>;
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

/** The document as the cloud's node/edge payloads (the only DTO mapping). */
export function docToApiGraph(doc: WorkflowDoc): { nodes: ApiNodeInput[]; edges: ApiEdgeInput[] } {
  return {
    nodes: doc.nodes.map((n) => ({
      nodeId: n.id,
      type: n.type,
      label: n.label,
      positionX: n.position.x,
      positionY: n.position.y,
      config: n.config as unknown as Record<string, unknown>,
    })),
    edges: doc.edges.map((e) => ({
      edgeId: e.id,
      sourceNodeId: e.source,
      sourceHandle: e.sourceHandle,
      targetNodeId: e.target,
      targetHandle: e.targetHandle,
    })),
  };
}

/**
 * Save the graph as it is now. Throws when a request fails (the saved point
 * is left untouched), including `WorkflowRevisionConflictError` on a stale
 * single-document save.
 */
export async function saveWorkflowGraph({
  workflow,
  getState,
  api,
}: SaveWorkflowInput): Promise<SaveWorkflowResult> {
  // One consistent snapshot: graph and history position read together.
  const state = getState();
  const { doc } = state;
  const entryId = state.history?.headEntryId;

  if (doc && entryId !== undefined && state.markSavedEntry) {
    const hasTrigger = doc.nodes.some((n) => n.type.startsWith('TRIGGER_'));
    const status: WorkflowStatus = hasTrigger ? 'ACTIVE' : 'DRAFT';
    let baseRevision: number | null | undefined;
    if (api.saveWorkflowDoc) {
      const named = { ...doc, id: workflow.id, name: workflow.name };
      const saved = await api.saveWorkflowDoc(workflow.id, {
        doc: named,
        ...(typeof state.baseRevision === 'number' ? { baseRevision: state.baseRevision } : {}),
      });
      baseRevision = saved?.revision ?? null;
    } else {
      const graph = docToApiGraph(doc);
      await api.updateWorkflow(workflow.id, {
        name: workflow.name,
        description: workflow.description,
        status,
      });
      await api.updateNodes(workflow.id, graph.nodes);
      await api.updateEdges(workflow.id, graph.edges);
    }
    const upToDate = getState().markSavedEntry!(entryId, baseRevision);
    return { status, upToDate };
  }

  // Older store shape (nodes / edges / nodeConfigs + editRevision).
  const { nodes, edges, nodeConfigs, editRevision } = state;
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
