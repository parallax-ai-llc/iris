/**
 * Workflow editor store.
 *
 * The saved state is one `WorkflowDoc` (iris-nodes v2): nodes with their one
 * config, and the edge list as the only record of connections. Every change to
 * it goes through a history command (`history/history.ts`, 07 C2), so undo,
 * redo and dirty tracking cover settings, inputs and outputs too (U-01/U-02),
 * and one user action is one undo step (AI apply, paste, multi delete).
 *
 * What React Flow renders (`nodes`, `edges`) and the per-node `nodeConfigs`
 * the panels read are derived from the document plus view state (selection,
 * size, the position while dragging, run status). `data.config` and
 * `nodeConfigs[id]` are the same object (W-17).
 *
 * Connections follow the shared rules in iris-nodes (`canConnect`): one edge
 * per input handle (a new one replaces the old, W-05), unknown ports and
 * cycles are refused, and the input source panel's "node output" choice adds
 * an edge instead of a config-only link (W-03).
 *
 * The public action names and fields of the previous store are kept so iris/web
 * and the desktop app keep working; new callers use `doc`, `history` and the
 * selection / clipboard actions. `createIrisEditorStore()` makes an independent
 * store (one per open document); `useIrisEditorStore` is the default instance.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { createContext, createElement, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import {
  applyNodeChanges,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type XYPosition,
} from '@xyflow/react';
import { nanoid } from 'nanoid';
import {
  getNodeDefinition,
  migrateWorkflowDoc,
  canConnect,
  checkGraph,
  type ConnectResult,
  type DocInputConfig,
  type DocNode,
  type DocNodeConfig,
  type GraphIssue,
  type WorkflowDoc,
} from 'iris-nodes';
import { DocHistory, type History } from '../history/history';
import {
  addNodes,
  connect,
  copyFragment,
  docCommand,
  emptyConfig,
  emptyDoc,
  moveNodes,
  orphanEdges,
  pasteFragment,
  patchSettings,
  removeEdges,
  removeNodes,
  renameNode,
  setNodeConfig,
  updateNode as updateDocNode,
  type PasteResult,
  type WorkflowFragment,
} from './doc-model';

// Node configuration types
export type InputSourceType = 'user' | 'node' | 'storage' | 'url';

export interface InputConfig {
  source: InputSourceType;
  value?: string;
  nodeId?: string;
  outputName?: string;
  storageAssetId?: string;
}

export interface OutputConfig {
  variableName: string;
  saveToStorage: boolean;
  quality?: 'low' | 'medium' | 'high';
  storagePath?: string;
}

export interface NodeConfig {
  provider?: string;
  model?: string;
  inputs: Record<string, InputConfig>;
  outputs: Record<string, OutputConfig>;
  settings: Record<string, unknown>;
}

// Node execution status
export type NodeStatus = 'idle' | 'running' | 'success' | 'error' | 'waiting' | 'skipped';

export interface NodeProgress {
  status: NodeStatus;
  progress?: number;
  message?: string;
  output?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  /** True when the result was reused from the node result cache (status stays 'success'). */
  cached?: boolean;
}

// Custom node data. Index signature satisfies @xyflow/react v12's
// `Node<T extends Record<string, unknown>>` constraint while keeping the
// declared fields strongly typed.
export interface IrisNodeData extends Record<string, unknown> {
  type: string;
  label: string;
  category: string;
  config: NodeConfig;
  status: NodeStatus;
  lastOutput?: unknown;
}

// Store state
export interface IrisEditorState {
  // Workflow metadata
  workflowId: string | null;
  workflowName: string;
  /** History head differs from the saved entry (or a host forced it). */
  isDirty: boolean;
  /** Bumped on every document change (undo/redo included). */
  editRevision: number;

  /** The saved state (v2 document). */
  doc: WorkflowDoc;
  /** Revision of the saved copy the document was loaded from / last saved as
   *  (local REST host optimistic concurrency); null when unknown. */
  baseRevision: number | null;
  /** Undo/redo stack of this document (07 C2). */
  history: History;
  /** Structural issues of the current document (orphan connections, missing
   *  ports, cycles), by node and edge id. */
  graphIssues: GraphIssue[];

  // React Flow state (derived from `doc` + view state)
  nodes: Node<IrisNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;

  // Node configurations (keyed by node id, same objects as data.config)
  nodeConfigs: Record<string, NodeConfig>;

  // Execution state
  isExecuting: boolean;
  executionId: string | null;
  executionProgress: Record<string, NodeProgress>;
  /** A stop was requested and the run has not ended yet. */
  isStopping: boolean;

  // Validation errors (nodeId -> error message)
  validationErrors: Record<string, string>;

  // Actions - Workflow
  initWorkflow: (id: string, name: string, nodes?: Node<IrisNodeData>[], edges?: Edge[]) => void;
  /** Open a document (any saved version; read through `migrateWorkflowDoc`). */
  initDoc: (raw: unknown, options?: { baseRevision?: number | null }) => void;
  resetEditor: () => void;
  clearWorkflow: () => void;
  setDirty: (dirty: boolean) => void;
  /**
   * Clear `isDirty` after a save of the graph taken at `revision`. Returns
   * false (and keeps `isDirty`) when the graph was edited after that point.
   */
  markSaved: (revision: number) => boolean;
  /** Mark the history entry a save started from as saved (07 C3). Returns
   *  true when it is still the head (nothing edited during the save). */
  markSavedEntry: (entryId: string, baseRevision?: number | null) => boolean;

  // Actions - Nodes
  addNode: (type: string, position: XYPosition, data: Partial<IrisNodeData>) => string;
  updateNode: (id: string, data: Partial<IrisNodeData>) => void;
  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => string | null;
  selectNode: (id: string | null) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  /** Move nodes as one undo step (programmatic moves, AI layout). */
  moveNodes: (positions: Record<string, XYPosition>) => void;

  // Actions - Edges
  onEdgesChange: (changes: EdgeChange[]) => void;
  /** Connect by the shared rules; refused connections change nothing. */
  onConnect: (connection: Connection) => ConnectResult;
  /** Would `connection` be accepted? (`isValidConnection` while dragging) */
  checkConnection: (connection: Connection) => ConnectResult;
  deleteEdge: (id: string) => void;
  /** Remove connections `checkGraph` reports as orphaned (one undo step). */
  cleanupOrphanEdges: () => number;

  // Actions - Selection / clipboard
  /** Ids of the selected nodes (view state). */
  getSelectedNodeIds: () => string[];
  /** Delete the selected nodes and edges as one undo step (U-06). */
  deleteSelection: () => void;
  /** The selected nodes and the edges between them, or null. */
  copySelection: () => WorkflowFragment | null;
  /** Paste a fragment (untrusted); the pasted nodes become the selection. */
  pasteFragment: (raw: unknown, at?: XYPosition) => PasteResult;
  /** Copy + paste in place, offset. Returns the new node ids. */
  duplicateSelection: () => string[];

  // Actions - Node Config
  updateNodeConfig: (nodeId: string, config: Partial<NodeConfig>) => void;
  updateNodeInput: (nodeId: string, inputName: string, input: Partial<InputConfig>) => void;
  updateNodeOutput: (nodeId: string, outputName: string, output: Partial<OutputConfig>) => void;
  updateNodeSettings: (nodeId: string, settings: Record<string, unknown>) => void;

  /** Run `fn` as one undo step named `label` (nested calls join the outer). */
  transaction: <T>(label: string, fn: () => T) => T;

  // Actions - Execution
  setExecuting: (executing: boolean, executionId?: string) => void;
  setStopping: (stopping: boolean) => void;
  updateNodeProgress: (nodeId: string, progress: Partial<NodeProgress>) => void;
  clearExecutionProgress: () => void;

  // Actions - Validation
  setNodeValidationError: (nodeId: string, error: string) => void;
  clearNodeValidationError: (nodeId: string) => void;
  clearValidationErrors: () => void;

  // Actions - History
  /** Kept for callers of the old store: ends the current typing merge. */
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Utilities
  getUpstreamNodes: (nodeId: string) => Node<IrisNodeData>[];
  getAvailableVariables: (nodeId: string) => Array<{ nodeId: string; nodeName: string; outputName: string; type: string }>;
}

/** View-only state of a rendered node (never saved, never in history). */
interface NodeView {
  selected?: boolean;
  dragging?: boolean;
  measured?: Node['measured'];
  width?: number;
  height?: number;
  /** Position while a drag is in progress. */
  dragPosition?: XYPosition;
  /** Extra data fields hosts put on nodes (run status, last output, ...). */
  extras?: Record<string, unknown>;
}

const EDGE_TYPE = 'smoothstep';
const EDGE_STYLE = { stroke: '#6366f1', strokeWidth: 2 };

function categoryOf(type: string): string {
  return getNodeDefinition(type)?.category ?? 'UTILITY';
}

/** Read a host-provided config (any shape) as a v2 node config. */
function normalizeConfig(type: string, raw: unknown): DocNodeConfig {
  if (!raw) return emptyConfig();
  return migrateWorkflowDoc({ nodes: [{ id: '_', type, config: raw }] }).nodes[0].config;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(value)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

export type IrisEditorStoreApi = StoreApi<IrisEditorState>;

/** A new, independent editor store (one per open document). */
export function createIrisEditorStore(): IrisEditorStoreApi {
  return createStore<IrisEditorState>()((rawSet, get) => {
    let doc: WorkflowDoc = emptyDoc();
    let forcedDirty = false;
    const views = new Map<string, NodeView>();
    const selectedEdges = new Set<string>();
    /** "Node" chosen in the input source panel before a node is picked. */
    const inputDrafts = new Map<string, true>();
    /** Doc positions of nodes when their drag started. */
    const dragStart = new Map<string, XYPosition>();
    const configCache = new Map<string, { source: DocNodeConfig; drafts: string; value: NodeConfig }>();
    const nodeCache = new Map<string, { key: unknown[]; node: Node<IrisNodeData> }>();

    const history = new DocHistory<WorkflowDoc>(
      () => doc,
      next => {
        doc = next;
      },
      { maxEntries: 200 },
    );

    const draftKey = (nodeId: string, input: string) => `${nodeId}\u0000${input}`;

    function deriveConfig(node: DocNode): NodeConfig {
      const drafts = [...inputDrafts.keys()]
        .filter(k => k.startsWith(`${node.id}\u0000`))
        .map(k => k.slice(node.id.length + 1))
        .filter(name => !doc.edges.some(e => e.target === node.id && e.targetHandle === name))
        .sort()
        .join(',');
      const hit = configCache.get(node.id);
      if (hit && hit.source === node.config && hit.drafts === drafts) return hit.value;
      let value = node.config as unknown as NodeConfig;
      if (drafts) {
        const inputs: Record<string, InputConfig> = { ...(node.config.inputs as Record<string, InputConfig>) };
        for (const name of drafts.split(',')) inputs[name] = { source: 'node' };
        value = { ...value, inputs };
      }
      configCache.set(node.id, { source: node.config, drafts, value });
      return value;
    }

    function deriveNode(node: DocNode, config: NodeConfig): Node<IrisNodeData> {
      const view = views.get(node.id) ?? {};
      const key = [node, config, view.selected, view.dragging, view.measured, view.width, view.height, view.dragPosition, view.extras];
      const hit = nodeCache.get(node.id);
      if (hit && hit.key.every((v, i) => v === key[i])) return hit.node;
      const rf: Node<IrisNodeData> = {
        id: node.id,
        type: 'irisNode',
        position: view.dragPosition ?? node.position,
        data: {
          status: 'idle',
          ...(view.extras ?? {}),
          type: node.type,
          label: node.label,
          category: categoryOf(node.type),
          config,
        },
        ...(view.selected !== undefined ? { selected: view.selected } : {}),
        ...(view.dragging !== undefined ? { dragging: view.dragging } : {}),
        ...(view.measured ? { measured: view.measured } : {}),
        ...(view.width !== undefined ? { width: view.width } : {}),
        ...(view.height !== undefined ? { height: view.height } : {}),
      };
      nodeCache.set(node.id, { key, node: rf });
      return rf;
    }

    function derive(): Pick<IrisEditorState, 'nodes' | 'edges' | 'nodeConfigs' | 'graphIssues'> {
      const nodeConfigs: Record<string, NodeConfig> = {};
      const ids = new Set<string>();
      const nodes = doc.nodes.map(n => {
        ids.add(n.id);
        const config = deriveConfig(n);
        nodeConfigs[n.id] = config;
        return deriveNode(n, config);
      });
      for (const id of [...views.keys()]) if (!ids.has(id)) views.delete(id);
      for (const id of [...nodeCache.keys()]) if (!ids.has(id)) nodeCache.delete(id);
      for (const id of [...configCache.keys()]) if (!ids.has(id)) configCache.delete(id);
      const edgeIds = new Set(doc.edges.map(e => e.id));
      for (const id of [...selectedEdges]) if (!edgeIds.has(id)) selectedEdges.delete(id);
      const edges: Edge[] = doc.edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        type: EDGE_TYPE,
        animated: true,
        style: EDGE_STYLE,
        ...(selectedEdges.has(e.id) ? { selected: true } : {}),
      }));
      return { nodes, edges, nodeConfigs, graphIssues: checkGraph(doc) };
    }

    let lastDoc = doc;
    /** Push derived state; a changed document bumps editRevision. */
    function sync(extra: Partial<IrisEditorState> = {}): void {
      const docChanged = doc !== lastDoc;
      lastDoc = doc;
      rawSet(state => ({
        ...derive(),
        doc,
        isDirty: history.isDirty || forcedDirty,
        editRevision: docChanged ? state.editRevision + 1 : state.editRevision,
        selectedNodeId:
          state.selectedNodeId && !doc.nodes.some(n => n.id === state.selectedNodeId)
            ? null
            : state.selectedNodeId,
        ...extra,
      }));
    }

    /** Record `next` as one command (no-op when nothing changed). */
    function commit(label: string, next: WorkflowDoc, mergeKey?: string): void {
      if (next === doc) return;
      history.execute(docCommand(label, doc, next, mergeKey));
    }

    function transaction<T>(label: string, fn: () => T): T {
      history.begin(label);
      try {
        const out = fn();
        history.commit();
        return out;
      } catch (error) {
        history.rollback();
        throw error;
      }
    }

    history.subscribe(() => sync());

    function setView(id: string, patch: Partial<NodeView>): void {
      views.set(id, { ...(views.get(id) ?? {}), ...patch });
    }

    function selectOnly(ids: string[]): void {
      for (const [id, v] of views) if (v.selected) views.set(id, { ...v, selected: false });
      for (const id of ids) setView(id, { selected: true });
      selectedEdges.clear();
    }

    function connectRequest(c: Connection) {
      return {
        source: c.source ?? '',
        sourceHandle: c.sourceHandle || 'output',
        target: c.target ?? '',
        targetHandle: c.targetHandle || 'input',
      };
    }

    const removedInputValue = (config: DocNodeConfig, name: string): DocNodeConfig => {
      if (!(name in config.inputs)) return config;
      const inputs = { ...config.inputs };
      delete inputs[name];
      return { ...config, inputs };
    };

    function newNodeId(): string {
      let id = nanoid(10);
      while (doc.nodes.some(n => n.id === id)) id = nanoid(10);
      return id;
    }

    return {
      workflowId: null,
      workflowName: 'Untitled Workflow',
      isDirty: false,
      editRevision: 0,
      doc,
      baseRevision: null,
      history,
      graphIssues: [],
      nodes: [],
      edges: [],
      selectedNodeId: null,
      nodeConfigs: {},
      isExecuting: false,
      executionId: null,
      executionProgress: {},
      isStopping: false,
      validationErrors: {},

      initWorkflow: (id, name, nodes = [], edges = []) => {
        get().initDoc(
          {
            id,
            name,
            nodes: nodes.map(n => ({
              id: n.id,
              type: n.data?.type,
              label: n.data?.label,
              position: n.position,
              config: n.data?.config,
            })),
            edges: edges.map(e => ({
              edgeId: e.id,
              sourceNodeId: e.source,
              targetNodeId: e.target,
              sourceHandle: e.sourceHandle,
              targetHandle: e.targetHandle,
            })),
          },
          { baseRevision: null },
        );
      },

      initDoc: (raw, options = {}) => {
        const loaded = migrateWorkflowDoc(raw);
        doc = loaded;
        views.clear();
        selectedEdges.clear();
        inputDrafts.clear();
        dragStart.clear();
        forcedDirty = false;
        history.reset();
        sync({
          workflowId: loaded.id || null,
          workflowName: loaded.name || 'Untitled Workflow',
          baseRevision: options.baseRevision ?? (raw && typeof raw === 'object' && (raw as { schemaVersion?: number }).schemaVersion === 2 ? loaded.revision : null),
          selectedNodeId: null,
          isExecuting: false,
          isStopping: false,
          executionId: null,
          executionProgress: {},
          validationErrors: {},
        });
      },

      resetEditor: () => {
        doc = emptyDoc();
        views.clear();
        selectedEdges.clear();
        inputDrafts.clear();
        dragStart.clear();
        forcedDirty = false;
        history.reset();
        sync({
          workflowId: null,
          workflowName: 'Untitled Workflow',
          baseRevision: null,
          selectedNodeId: null,
          isExecuting: false,
          isStopping: false,
          executionId: null,
          executionProgress: {},
          validationErrors: {},
        });
      },

      clearWorkflow: () => {
        commit('Clear workflow', removeNodes(doc, doc.nodes.map(n => n.id)));
        rawSet({ selectedNodeId: null, executionProgress: {}, validationErrors: {} });
      },

      setDirty: dirty => {
        if (dirty) {
          forcedDirty = true;
        } else {
          forcedDirty = false;
          history.markSaved(history.headEntryId);
        }
        sync();
      },

      markSaved: revision => {
        if (get().editRevision !== revision) return false;
        forcedDirty = false;
        history.markSaved(history.headEntryId);
        sync();
        return true;
      },

      markSavedEntry: (entryId, baseRevision) => {
        forcedDirty = false;
        history.markSaved(entryId);
        sync(baseRevision !== undefined ? { baseRevision } : {});
        return history.headEntryId === entryId;
      },

      // ── nodes ──────────────────────────────────────────────────────────────
      addNode: (type, position, data) => {
        const id = newNodeId();
        const node: DocNode = {
          id,
          type,
          label: data.label || type,
          position: { x: position.x, y: position.y },
          config: normalizeConfig(type, data.config),
        };
        const { type: _t, label: _l, category: _c, config: _cfg, ...extras } = data;
        if (Object.keys(extras).length > 0) setView(id, { extras });
        commit('Add node', addNodes(doc, [node]));
        return id;
      },

      updateNode: (id, data) => {
        const { label, config, type: _t, category: _c, ...extras } = data;
        if (Object.keys(extras).length > 0) {
          setView(id, { extras: { ...(views.get(id)?.extras ?? {}), ...extras } });
        }
        if (typeof label === 'string' || config) {
          transaction('Edit node', () => {
            if (typeof label === 'string') commit('Rename node', renameNode(doc, id, label));
            if (config) get().updateNodeConfig(id, config);
          });
        }
        sync();
      },

      deleteNode: id => {
        commit('Delete node', removeNodes(doc, [id]));
        if (get().selectedNodeId === id) rawSet({ selectedNodeId: null });
      },

      duplicateNode: id => {
        if (!doc.nodes.some(n => n.id === id)) return null;
        const result = pasteFragment(doc, copyFragment(doc, [id]), newNodeId, { offset: 50 });
        commit('Duplicate node', result.doc);
        return result.nodeIds[0] ?? null;
      },

      selectNode: id => rawSet({ selectedNodeId: id }),

      onNodesChange: changes => {
        const viewChanges: NodeChange[] = [];
        const removed: string[] = [];
        const moved = new Map<string, XYPosition>();
        let dragEnded = false;
        for (const change of changes) {
          if (change.type === 'remove') {
            removed.push(change.id);
          } else if (change.type === 'position') {
            if (change.dragging) {
              const node = doc.nodes.find(n => n.id === change.id);
              if (node && !dragStart.has(change.id)) dragStart.set(change.id, node.position);
              viewChanges.push(change);
            } else if (change.dragging === false) {
              dragEnded = true;
              const p = change.position ?? views.get(change.id)?.dragPosition;
              if (p) moved.set(change.id, p);
              viewChanges.push(change);
            } else if (change.position) {
              moved.set(change.id, change.position);
            }
          } else if (change.type === 'select' || change.type === 'dimensions') {
            viewChanges.push(change);
          }
        }

        if (viewChanges.length > 0) {
          const next = applyNodeChanges(viewChanges, get().nodes) as Node<IrisNodeData>[];
          for (const n of next) {
            const v = views.get(n.id) ?? {};
            const dragging = !!n.dragging;
            views.set(n.id, {
              ...v,
              selected: n.selected,
              dragging: n.dragging,
              measured: n.measured,
              width: n.width,
              height: n.height,
              dragPosition: dragging ? n.position : undefined,
            });
          }
        }

        if (dragEnded) {
          for (const id of dragStart.keys()) {
            if (!moved.has(id)) {
              const p = views.get(id)?.dragPosition;
              if (p) moved.set(id, p);
            }
            const v = views.get(id);
            if (v) views.set(id, { ...v, dragPosition: undefined, dragging: false });
          }
          dragStart.clear();
        }

        if (moved.size > 0 || removed.length > 0) {
          transaction(removed.length ? 'Delete' : 'Move nodes', () => {
            if (moved.size > 0) commit('Move nodes', moveNodes(doc, moved));
            if (removed.length > 0) commit('Delete', removeNodes(doc, removed));
          });
        }
        sync();
      },

      moveNodes: positions => {
        commit('Move nodes', moveNodes(doc, new Map(Object.entries(positions))));
      },

      // ── edges ──────────────────────────────────────────────────────────────
      onEdgesChange: changes => {
        const removed: string[] = [];
        for (const change of changes) {
          if (change.type === 'remove') removed.push(change.id);
          else if (change.type === 'select') {
            if (change.selected) selectedEdges.add(change.id);
            else selectedEdges.delete(change.id);
          }
        }
        if (removed.length > 0) commit('Delete connection', removeEdges(doc, removed));
        sync();
      },

      onConnect: connection => {
        const req = connectRequest(connection);
        const { doc: next, result } = connect(doc, req);
        if (result.ok) {
          inputDrafts.delete(draftKey(req.target, req.targetHandle));
          const target = doc.nodes.find(n => n.id === req.target);
          // A direct value on that input is replaced by the connection.
          const withoutValue =
            target && req.targetHandle in target.config.inputs
              ? updateDocNode(next, req.target, n => ({ ...n, config: removedInputValue(n.config, req.targetHandle) }))
              : next;
          commit(result.replaces ? 'Replace connection' : 'Connect', withoutValue);
        }
        return result;
      },

      checkConnection: connection => canConnect(doc, connectRequest(connection)),

      deleteEdge: id => {
        commit('Delete connection', removeEdges(doc, [id]));
      },

      cleanupOrphanEdges: () => {
        const ids = orphanEdges(doc);
        commit('Remove broken connections', removeEdges(doc, ids));
        return ids.length;
      },

      // ── selection / clipboard ──────────────────────────────────────────────
      getSelectedNodeIds: () => doc.nodes.filter(n => views.get(n.id)?.selected).map(n => n.id),

      deleteSelection: () => {
        let nodeIds = get().getSelectedNodeIds();
        const selectedId = get().selectedNodeId;
        if (nodeIds.length === 0 && selectedEdges.size === 0 && selectedId) nodeIds = [selectedId];
        const edgeIds = [...selectedEdges];
        if (nodeIds.length === 0 && edgeIds.length === 0) return;
        transaction('Delete', () => {
          commit('Delete', removeEdges(removeNodes(doc, nodeIds), edgeIds));
        });
        selectedEdges.clear();
        rawSet({ selectedNodeId: selectedId && nodeIds.includes(selectedId) ? null : selectedId });
        sync();
      },

      copySelection: () => {
        let ids = get().getSelectedNodeIds();
        const selectedId = get().selectedNodeId;
        if (ids.length === 0 && selectedId) ids = [selectedId];
        if (ids.length === 0) return null;
        return copyFragment(doc, ids);
      },

      pasteFragment: (raw, at) => {
        const result = pasteFragment(doc, raw, newNodeId, at ? { at } : {});
        if (result.nodeIds.length > 0) {
          commit('Paste', result.doc);
          selectOnly(result.nodeIds);
          rawSet({ selectedNodeId: result.nodeIds.length === 1 ? result.nodeIds[0] : null });
          sync();
        }
        return result;
      },

      duplicateSelection: () => {
        const fragment = get().copySelection();
        if (!fragment) return [];
        return get().pasteFragment(fragment).nodeIds;
      },

      // ── node config ────────────────────────────────────────────────────────
      updateNodeConfig: (nodeId, partial) => {
        const node = doc.nodes.find(n => n.id === nodeId);
        if (!node) return;
        transaction('Edit node settings', () => {
          const links: Array<[string, InputConfig]> = [];
          let config: DocNodeConfig = { ...node.config };
          if (partial.provider !== undefined) config.provider = partial.provider;
          if (partial.model !== undefined) config.model = partial.model;
          if (partial.settings) config.settings = { ...partial.settings };
          if (partial.outputs) config.outputs = { ...partial.outputs } as DocNodeConfig['outputs'];
          if (partial.inputs) {
            const inputs: Record<string, DocInputConfig> = {};
            for (const [name, input] of Object.entries(partial.inputs)) {
              if (!input) continue;
              if (input.source === 'node') {
                links.push([name, input]);
                continue;
              }
              inputs[name] = stripUndefined({ ...input }) as DocInputConfig;
            }
            config.inputs = inputs;
          }
          config = stripUndefined(config) as DocNodeConfig;
          commit('Edit node settings', setNodeConfig(doc, nodeId, config));
          for (const [name, input] of links) get().updateNodeInput(nodeId, name, input);
        });
      },

      updateNodeInput: (nodeId, inputName, input) => {
        const node = doc.nodes.find(n => n.id === nodeId);
        if (!node) return;
        const key = draftKey(nodeId, inputName);
        const current: InputConfig = (get().nodeConfigs[nodeId]?.inputs?.[inputName] as InputConfig) ?? { source: 'user' };
        const merged: InputConfig = { ...current, ...input } as InputConfig;
        if (merged.source === 'node') {
          if (!input.nodeId) {
            // Picking "Node" before a node: panel state only.
            inputDrafts.set(key, true);
            sync();
            return;
          }
          get().onConnect({
            source: input.nodeId,
            sourceHandle: input.outputName ?? merged.outputName ?? 'output',
            target: nodeId,
            targetHandle: inputName,
          });
          sync();
          return;
        }
        inputDrafts.delete(key);
        const value: DocInputConfig = stripUndefined({
          source: merged.source === 'url' || merged.source === 'storage' ? merged.source : 'user',
          value: merged.value,
          storageAssetId: merged.storageAssetId,
          assetId: (merged as { assetId?: string }).assetId,
        }) as DocInputConfig;
        const config: DocNodeConfig = { ...node.config, inputs: { ...node.config.inputs, [inputName]: value } };
        commit('Edit input', setNodeConfig(doc, nodeId, config), `node:${nodeId}:input:${inputName}`);
        sync();
      },

      updateNodeOutput: (nodeId, outputName, output) => {
        const node = doc.nodes.find(n => n.id === nodeId);
        if (!node) return;
        const prev = node.config.outputs[outputName] ?? { variableName: outputName, saveToStorage: false };
        const config: DocNodeConfig = {
          ...node.config,
          outputs: { ...node.config.outputs, [outputName]: { ...prev, ...output } },
        };
        commit('Edit output', setNodeConfig(doc, nodeId, config), `node:${nodeId}:output:${outputName}`);
      },

      updateNodeSettings: (nodeId, settings) => {
        const keys = Object.keys(settings).sort().join(',');
        commit('Edit setting', patchSettings(doc, nodeId, settings), `node:${nodeId}:settings:${keys}`);
      },

      transaction: (label, fn) => {
        const out = transaction(label, fn);
        sync();
        return out;
      },

      // ── execution (view state) ─────────────────────────────────────────────
      setExecuting: (executing, executionId) => {
        rawSet({
          isExecuting: executing,
          executionId: executionId || null,
          ...(executing ? {} : { isStopping: false }),
        });
      },

      setStopping: stopping => rawSet({ isStopping: stopping }),

      updateNodeProgress: (nodeId, progress) => {
        rawSet(state => ({
          executionProgress: {
            ...state.executionProgress,
            [nodeId]: {
              ...state.executionProgress[nodeId],
              ...progress,
            },
          },
        }));
      },

      clearExecutionProgress: () => {
        rawSet({ executionProgress: {}, isExecuting: false, isStopping: false, executionId: null });
      },

      // ── validation (view state) ────────────────────────────────────────────
      setNodeValidationError: (nodeId, error) => {
        rawSet(state => ({ validationErrors: { ...state.validationErrors, [nodeId]: error } }));
      },

      clearNodeValidationError: nodeId => {
        rawSet(state => {
          const { [nodeId]: _, ...rest } = state.validationErrors;
          return { validationErrors: rest };
        });
      },

      clearValidationErrors: () => rawSet({ validationErrors: {} }),

      // ── history ────────────────────────────────────────────────────────────
      pushHistory: () => history.breakMerge(),

      undo: () => {
        const before = new Set(doc.nodes.map(n => n.id));
        history.undo();
        // Nodes an undo brings back are shown selected (U-09).
        const revived = doc.nodes.filter(n => !before.has(n.id)).map(n => n.id);
        if (revived.length > 0) {
          selectOnly(revived);
          rawSet({ selectedNodeId: revived.length === 1 ? revived[0] : null });
          sync();
        }
      },

      redo: () => history.redo(),
      canUndo: () => history.canUndo,
      canRedo: () => history.canRedo,

      // ── utilities ──────────────────────────────────────────────────────────
      getUpstreamNodes: nodeId => {
        const upstreamIds = new Set<string>();
        const stack = [nodeId];
        while (stack.length > 0) {
          const currentId = stack.pop()!;
          for (const edge of doc.edges) {
            if (edge.target === currentId && !upstreamIds.has(edge.source)) {
              upstreamIds.add(edge.source);
              stack.push(edge.source);
            }
          }
        }
        return get().nodes.filter(n => upstreamIds.has(n.id));
      },

      getAvailableVariables: nodeId => {
        const state = get();
        const variables: Array<{ nodeId: string; nodeName: string; outputName: string; type: string }> = [];
        for (const node of state.getUpstreamNodes(nodeId)) {
          const config = state.nodeConfigs[node.id];
          for (const [outputName, output] of Object.entries(config?.outputs ?? {})) {
            variables.push({
              nodeId: node.id,
              nodeName: node.data.label,
              outputName: output.variableName || outputName,
              type: 'unknown',
            });
          }
        }
        return variables;
      },
    };
  });
}

/** Default editor store (one document at a time, as before). */
export const irisEditorStore: IrisEditorStoreApi = createIrisEditorStore();

/**
 * Store of the editor below this point. Hosts with one store per open document
 * (the desktop app's tabs) wrap each editor in `IrisEditorStoreProvider`; the
 * components then read that store through `useIrisEditorStore()`. Without a
 * provider the default store is used, as before.
 */
const IrisEditorStoreContext = createContext<IrisEditorStoreApi | null>(null);

export function IrisEditorStoreProvider({ store, children }: { store: IrisEditorStoreApi; children?: ReactNode }) {
  return createElement(IrisEditorStoreContext.Provider, { value: store }, children);
}

/** The store the hooks below read: the provider's, else the default one. */
export function useIrisEditorStoreApi(): IrisEditorStoreApi {
  return useContext(IrisEditorStoreContext) ?? irisEditorStore;
}

type BoundStore = {
  (): IrisEditorState;
  <T>(selector: (state: IrisEditorState) => T): T;
} & IrisEditorStoreApi;

function useBound<T>(selector?: (state: IrisEditorState) => T) {
  return useStore(useIrisEditorStoreApi(), selector ?? ((s: IrisEditorState) => s as unknown as T));
}

/** React hook (provider's store, else the default) + store API of the default
 *  editor store (same shape as before; static calls always hit the default). */
export const useIrisEditorStore = Object.assign(useBound, irisEditorStore) as BoundStore;
