import { create } from 'zustand';
import {
  Node,
  Edge,
  Connection,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  XYPosition,
} from '@xyflow/react';
import { nanoid } from 'nanoid';

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
export type NodeStatus = 'idle' | 'running' | 'success' | 'error' | 'waiting';

export interface NodeProgress {
  status: NodeStatus;
  progress?: number;
  message?: string;
  output?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
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

// History entry for undo/redo
interface HistoryEntry {
  nodes: Node<IrisNodeData>[];
  edges: Edge[];
  nodeConfigs: Record<string, NodeConfig>;
}

// Store state
interface IrisEditorState {
  // Workflow metadata
  workflowId: string | null;
  workflowName: string;
  isDirty: boolean;

  // React Flow state
  nodes: Node<IrisNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;

  // Node configurations (keyed by node id)
  nodeConfigs: Record<string, NodeConfig>;

  // Execution state
  isExecuting: boolean;
  executionId: string | null;
  executionProgress: Record<string, NodeProgress>;

  // Validation errors (nodeId -> error message)
  validationErrors: Record<string, string>;

  // History for undo/redo
  history: HistoryEntry[];
  historyIndex: number;
  maxHistorySize: number;

  // Actions - Workflow
  initWorkflow: (id: string, name: string, nodes?: Node<IrisNodeData>[], edges?: Edge[]) => void;
  resetEditor: () => void;
  clearWorkflow: () => void;  // Clear nodes and edges but keep workflow ID
  setDirty: (dirty: boolean) => void;

  // Actions - Nodes
  addNode: (type: string, position: XYPosition, data: Partial<IrisNodeData>) => string;
  updateNode: (id: string, data: Partial<IrisNodeData>) => void;
  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => string | null;
  selectNode: (id: string | null) => void;
  onNodesChange: (changes: NodeChange[]) => void;

  // Actions - Edges
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  deleteEdge: (id: string) => void;

  // Actions - Node Config
  updateNodeConfig: (nodeId: string, config: Partial<NodeConfig>) => void;
  updateNodeInput: (nodeId: string, inputName: string, input: Partial<InputConfig>) => void;
  updateNodeOutput: (nodeId: string, outputName: string, output: Partial<OutputConfig>) => void;
  updateNodeSettings: (nodeId: string, settings: Record<string, unknown>) => void;

  // Actions - Execution
  setExecuting: (executing: boolean, executionId?: string) => void;
  updateNodeProgress: (nodeId: string, progress: Partial<NodeProgress>) => void;
  clearExecutionProgress: () => void;

  // Actions - Validation
  setNodeValidationError: (nodeId: string, error: string) => void;
  clearNodeValidationError: (nodeId: string) => void;
  clearValidationErrors: () => void;

  // Actions - History
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Utilities
  getUpstreamNodes: (nodeId: string) => Node<IrisNodeData>[];
  getAvailableVariables: (nodeId: string) => Array<{ nodeId: string; nodeName: string; outputName: string; type: string }>;
}

const DEFAULT_NODE_CONFIG: NodeConfig = {
  inputs: {},
  outputs: {},
  settings: {},
};

const MAX_HISTORY_SIZE = 50;

export const useIrisEditorStore = create<IrisEditorState>()((set, get) => ({
  // Initial state
  workflowId: null,
  workflowName: 'Untitled Workflow',
  isDirty: false,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  nodeConfigs: {},
  isExecuting: false,
  executionId: null,
  executionProgress: {},
  validationErrors: {},
  history: [],
  historyIndex: -1,
  maxHistorySize: MAX_HISTORY_SIZE,

  // Workflow actions
  initWorkflow: (id, name, nodes = [], edges = []) => {
    const nodeConfigs: Record<string, NodeConfig> = {};
    nodes.forEach((node) => {
      nodeConfigs[node.id] = node.data?.config || { ...DEFAULT_NODE_CONFIG };
    });
    set({
      workflowId: id,
      workflowName: name,
      nodes,
      edges,
      nodeConfigs,
      selectedNodeId: null,
      isDirty: false,
      history: [],
      historyIndex: -1,
      isExecuting: false,
      executionId: null,
      executionProgress: {},
      validationErrors: {},
    });
    // Seed history with the initial state so the first mutation creates a valid undo target.
    get().pushHistory();
  },

  resetEditor: () => {
    set({
      workflowId: null,
      workflowName: 'Untitled Workflow',
      nodes: [],
      edges: [],
      selectedNodeId: null,
      nodeConfigs: {},
      isDirty: false,
      history: [],
      historyIndex: -1,
      isExecuting: false,
      executionId: null,
      executionProgress: {},
      validationErrors: {},
    });
  },

  // Clear only nodes and edges (keep workflow identity)
  clearWorkflow: () => {
    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      nodeConfigs: {},
      isDirty: true,
      executionProgress: {},
      validationErrors: {},
    });
    get().pushHistory();
  },

  setDirty: (dirty) => set({ isDirty: dirty }),

  // Node actions
  addNode: (type, position, data) => {
    const id = nanoid(10);
    const newNode: Node<IrisNodeData> = {
      id,
      type: 'irisNode',
      position,
      data: {
        type,
        label: data.label || type,
        category: data.category || 'UTILITY',
        config: data.config || { ...DEFAULT_NODE_CONFIG },
        status: 'idle',
        ...data,
      },
    };

    set((state) => ({
      nodes: [...state.nodes, newNode],
      nodeConfigs: {
        ...state.nodeConfigs,
        [id]: data.config || { ...DEFAULT_NODE_CONFIG },
      },
      isDirty: true,
    }));
    get().pushHistory();

    return id;
  },

  updateNode: (id, data) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...data } } : node
      ),
      isDirty: true,
    }));
    get().pushHistory();
  },

  deleteNode: (id) => {
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== id),
      edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id),
      nodeConfigs: Object.fromEntries(
        Object.entries(state.nodeConfigs).filter(([key]) => key !== id)
      ),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      isDirty: true,
    }));
    get().pushHistory();
  },

  duplicateNode: (id) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === id);
    if (!node) return null;

    const newId = nanoid(10);
    const offset = { x: 50, y: 50 };
    const newNode: Node<IrisNodeData> = {
      ...node,
      id: newId,
      position: {
        x: node.position.x + offset.x,
        y: node.position.y + offset.y,
      },
      selected: false,
    };

    set((state) => ({
      nodes: [...state.nodes, newNode],
      nodeConfigs: {
        ...state.nodeConfigs,
        [newId]: state.nodeConfigs[id] ? { ...state.nodeConfigs[id] } : { ...DEFAULT_NODE_CONFIG },
      },
      isDirty: true,
    }));
    get().pushHistory();

    return newId;
  },

  selectNode: (id) => set({ selectedNodeId: id }),

  onNodesChange: (changes) => {
    // Don't mark as dirty for selection-only changes
    const hasNonSelectionChange = changes.some(
      (change) => change.type !== 'select'
    );

    // Detect end-of-drag: a position change with dragging === false.
    // We push history once when the drag finishes so the move is undoable
    // without flooding history during the drag.
    const isDragEnd = changes.some(
      (change) => change.type === 'position' && change.dragging === false
    );

    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes) as Node<IrisNodeData>[],
      isDirty: hasNonSelectionChange ? true : state.isDirty,
    }));

    if (isDragEnd) {
      get().pushHistory();
    }
  },

  // Edge actions
  onEdgesChange: (changes) => {
    set((state) => {
      // Handle edge removals - clear corresponding nodeConfigs.inputs
      const updatedNodeConfigs = { ...state.nodeConfigs };
      
      for (const change of changes) {
        if (change.type === 'remove') {
          const edgeToRemove = state.edges.find((e) => e.id === change.id);
          if (edgeToRemove && edgeToRemove.target) {
            const targetId = edgeToRemove.target;
            const targetHandle = edgeToRemove.targetHandle || 'input';
            const existingConfig = updatedNodeConfigs[targetId] || {};
            const existingInputs = { ...(existingConfig.inputs || {}) };
            
            // Clear the input that was connected via this edge
            delete existingInputs[targetHandle];
            
            updatedNodeConfigs[targetId] = {
              ...existingConfig,
              inputs: existingInputs,
            };
          }
        }
      }
      
      return {
        edges: applyEdgeChanges(changes, state.edges),
        nodeConfigs: updatedNodeConfigs,
        isDirty: true,
      };
    });
  },

  onConnect: (connection) => {
    if (!connection.source || !connection.target) return;

    const sourceId = connection.source;
    const targetId = connection.target;

    set((state) => {
      // Update nodeConfigs to reflect the new connection
      // Set the target node's input to use the source node's output
      const targetHandle = connection.targetHandle || 'input';
      const sourceHandle = connection.sourceHandle || 'output';
      const existingConfig = state.nodeConfigs[targetId] || { ...DEFAULT_NODE_CONFIG };
      const existingInputs = existingConfig.inputs || {};

      return {
        edges: addEdge(
          {
            ...connection,
            id: `e-${sourceId}-${targetId}-${nanoid(6)}`,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#6366f1', strokeWidth: 2 },
          },
          state.edges
        ),
        nodeConfigs: {
          ...state.nodeConfigs,
          [targetId]: {
            ...existingConfig,
            inputs: {
              ...existingInputs,
              [targetHandle]: {
                source: 'node' as InputSourceType,
                nodeId: sourceId,
                outputName: sourceHandle,
              },
            },
          },
        },
        isDirty: true,
      };
    });
    get().pushHistory();
  },

  deleteEdge: (id) => {
    set((state) => {
      // Find the edge being deleted to clear the corresponding input from nodeConfigs
      const edgeToDelete = state.edges.find((edge) => edge.id === id);
      
      if (edgeToDelete && edgeToDelete.target) {
        const targetId = edgeToDelete.target;
        const targetHandle = edgeToDelete.targetHandle || 'input';
        const existingConfig = state.nodeConfigs[targetId] || {};
        const existingInputs = { ...(existingConfig.inputs || {}) };
        
        // Clear the input that was connected via this edge
        delete existingInputs[targetHandle];

        return {
          edges: state.edges.filter((edge) => edge.id !== id),
          nodeConfigs: {
            ...state.nodeConfigs,
            [targetId]: {
              ...existingConfig,
              inputs: existingInputs,
            },
          },
          isDirty: true,
        };
      }

      return {
        edges: state.edges.filter((edge) => edge.id !== id),
        isDirty: true,
      };
    });
    get().pushHistory();
  },

  // Node config actions
  updateNodeConfig: (nodeId, config) => {
    set((state) => ({
      nodeConfigs: {
        ...state.nodeConfigs,
        [nodeId]: {
          ...state.nodeConfigs[nodeId],
          ...config,
        },
      },
      isDirty: true,
    }));
    get().pushHistory();
  },

  updateNodeInput: (nodeId, inputName, input) => {
    set((state) => {
      const existingConfig = state.nodeConfigs[nodeId] || {};
      const inputs = existingConfig.inputs || {};
      return {
        nodeConfigs: {
          ...state.nodeConfigs,
          [nodeId]: {
            ...DEFAULT_NODE_CONFIG,
            ...existingConfig,
            inputs: {
              ...inputs,
              [inputName]: {
                ...(inputs[inputName] || {}),
                ...input,
              },
            },
          },
        },
        isDirty: true,
      };
    });
  },

  updateNodeOutput: (nodeId, outputName, output) => {
    set((state) => {
      const existingConfig = state.nodeConfigs[nodeId] || {};
      const outputs = existingConfig.outputs || {};
      return {
        nodeConfigs: {
          ...state.nodeConfigs,
          [nodeId]: {
            ...DEFAULT_NODE_CONFIG,
            ...existingConfig,
            outputs: {
              ...outputs,
              [outputName]: {
                ...(outputs[outputName] || {}),
                ...output,
              },
            },
          },
        },
        isDirty: true,
      };
    });
  },

  updateNodeSettings: (nodeId, settings) => {
    set((state) => {
      const existingConfig = state.nodeConfigs[nodeId] || {};
      const existingSettings = existingConfig.settings || {};
      return {
        nodeConfigs: {
          ...state.nodeConfigs,
          [nodeId]: {
            ...DEFAULT_NODE_CONFIG,
            ...existingConfig,
            settings: {
              ...existingSettings,
              ...settings,
            },
          },
        },
        isDirty: true,
      };
    });
  },

  // Execution actions
  setExecuting: (executing, executionId) => {
    set({
      isExecuting: executing,
      executionId: executionId || null,
    });
  },

  updateNodeProgress: (nodeId, progress) => {
    set((state) => ({
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
    set({
      executionProgress: {},
      isExecuting: false,
      executionId: null,
    });
  },

  // Validation actions
  setNodeValidationError: (nodeId, error) => {
    set((state) => ({
      validationErrors: {
        ...state.validationErrors,
        [nodeId]: error,
      },
    }));
  },

  clearNodeValidationError: (nodeId) => {
    set((state) => {
      const { [nodeId]: _, ...rest } = state.validationErrors;
      return { validationErrors: rest };
    });
  },

  clearValidationErrors: () => {
    set({ validationErrors: {} });
  },

  // History actions
  pushHistory: () => {
    const state = get();
    const entry: HistoryEntry = {
      nodes: JSON.parse(JSON.stringify(state.nodes)),
      edges: JSON.parse(JSON.stringify(state.edges)),
      nodeConfigs: JSON.parse(JSON.stringify(state.nodeConfigs)),
    };

    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(entry);

    if (newHistory.length > state.maxHistorySize) {
      newHistory.shift();
    }

    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  undo: () => {
    const state = get();
    if (state.historyIndex <= 0) return;

    const prevEntry = state.history[state.historyIndex - 1];
    set({
      nodes: prevEntry.nodes,
      edges: prevEntry.edges,
      nodeConfigs: prevEntry.nodeConfigs,
      historyIndex: state.historyIndex - 1,
      isDirty: true,
    });
  },

  redo: () => {
    const state = get();
    if (state.historyIndex >= state.history.length - 1) return;

    const nextEntry = state.history[state.historyIndex + 1];
    set({
      nodes: nextEntry.nodes,
      edges: nextEntry.edges,
      nodeConfigs: nextEntry.nodeConfigs,
      historyIndex: state.historyIndex + 1,
      isDirty: true,
    });
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  // Utilities
  getUpstreamNodes: (nodeId) => {
    const state = get();
    const upstreamIds = new Set<string>();
    const nodesToCheck = [nodeId];

    while (nodesToCheck.length > 0) {
      const currentId = nodesToCheck.pop()!;
      const incomingEdges = state.edges.filter((e) => e.target === currentId);

      for (const edge of incomingEdges) {
        if (!upstreamIds.has(edge.source)) {
          upstreamIds.add(edge.source);
          nodesToCheck.push(edge.source);
        }
      }
    }

    return state.nodes.filter((n) => upstreamIds.has(n.id));
  },

  getAvailableVariables: (nodeId) => {
    const state = get();
    const upstreamNodes = get().getUpstreamNodes(nodeId);
    const variables: Array<{ nodeId: string; nodeName: string; outputName: string; type: string }> = [];

    for (const node of upstreamNodes) {
      const config = state.nodeConfigs[node.id];
      if (config?.outputs) {
        for (const [outputName, output] of Object.entries(config.outputs)) {
          variables.push({
            nodeId: node.id,
            nodeName: node.data.label,
            outputName: output.variableName || outputName,
            type: 'unknown',
          });
        }
      }
    }

    return variables;
  },
}));
