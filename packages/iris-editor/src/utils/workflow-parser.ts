import { nanoid } from 'nanoid';
import type { XYPosition, Connection } from '@xyflow/react';
import { NODE_DEFINITIONS, getNodeDefaultSettings } from '../constants/node-definitions';
import { irisEditorStore, type IrisEditorStoreApi, type IrisNodeData, type NodeConfig } from '@editor/store/iris-editor';

// Action types for workflow modifications
export type WorkflowAction = 'add' | 'modify' | 'delete';

// Types for the workflow JSON structure from AI
export interface WorkflowNodeJSON {
  nodeId: string;
  type: string;
  label?: string;
  position?: { x: number; y: number };
  config?: Record<string, unknown>;
  action?: WorkflowAction;  // Default: 'add'
}

export interface WorkflowEdgeJSON {
  edgeId?: string;
  sourceNodeId: string;
  sourceHandle: string;
  targetNodeId: string;
  targetHandle: string;
  action?: WorkflowAction;  // Default: 'add'
}

export interface WorkflowJSON {
  nodes: WorkflowNodeJSON[];
  edges: WorkflowEdgeJSON[];
  explanation?: string;
}

export interface ApplyWorkflowResult {
  nodesCreated: number;
  nodesModified: number;
  nodesDeleted: number;
  edgesCreated: number;
  edgesDeleted: number;
  warnings: string[];
}

/**
 * Locate the JSON object inside a ```json-workflow fence, tolerating triple
 * backticks that appear inside string literals (e.g. systemPrompt content).
 *
 * Why: a non-greedy /```json-workflow ... ```/ regex stops at the first inner
 * ``` it sees, which truncates the payload and breaks JSON.parse.
 */
function extractWorkflowJSONString(response: string): string | null {
  const fenceMatch = /```json-workflow\s*\n?/.exec(response);
  if (!fenceMatch) return null;

  const searchStart = fenceMatch.index + fenceMatch[0].length;
  const objStart = response.indexOf('{', searchStart);
  if (objStart === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = objStart; i < response.length; i++) {
    const ch = response[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return response.slice(objStart, i + 1);
      }
    }
  }

  return null;
}

/**
 * Extract json-workflow code blocks from AI response text
 */
export function extractWorkflowJSON(response: string): WorkflowJSON | null {
  const jsonStr = extractWorkflowJSONString(response);
  if (!jsonStr) return null;

  try {
    const parsed = JSON.parse(jsonStr);

    // Validate basic structure
    if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
      console.warn('Invalid workflow JSON: missing nodes array');
      return null;
    }

    if (!parsed.edges || !Array.isArray(parsed.edges)) {
      // Edges are optional, default to empty array
      parsed.edges = [];
    }

    return parsed as WorkflowJSON;
  } catch (error) {
    console.error('Failed to parse workflow JSON:', error);
    return null;
  }
}

/**
 * Validate a node type against known definitions
 */
export function isValidNodeType(type: string): boolean {
  return type in NODE_DEFINITIONS;
}

/**
 * Generate a new unique node ID that doesn't conflict with existing nodes
 */
function generateUniqueNodeId(existingIds: Set<string>): string {
  let id = nanoid(10);
  while (existingIds.has(id)) {
    id = nanoid(10);
  }
  return id;
}

/**
 * Find an existing node by its ID
 */
function findExistingNode(api: IrisEditorStoreApi, nodeId: string) {
  const store = api.getState();
  return store.nodes.find((n) => n.id === nodeId);
}

/**
 * Find an existing edge by source/target
 */
function findExistingEdge(api: IrisEditorStoreApi, sourceId: string, targetId: string, sourceHandle?: string, targetHandle?: string) {
  const store = api.getState();
  return store.edges.find((e) =>
    e.source === sourceId &&
    e.target === targetId &&
    (!sourceHandle || e.sourceHandle === sourceHandle) &&
    (!targetHandle || e.targetHandle === targetHandle)
  );
}

/**
 * Apply a workflow JSON to the canvas by creating/modifying/deleting nodes and edges
 * Returns a summary of what was changed.
 *
 * The whole apply is one undo step ("Apply AI changes", U-04). A modify starts
 * from the node's current config, so inputs and settings the user changed
 * after loading survive (W-16). Edges go through the shared connection rules
 * like a drag on the canvas; refused ones are reported as warnings (W-15).
 *
 * `store` is the editor store of the document to change (hosts with one store
 * per open document pass theirs); the default store when omitted.
 */
export function applyWorkflowToCanvas(
  workflow: WorkflowJSON,
  store: IrisEditorStoreApi = irisEditorStore,
): ApplyWorkflowResult {
  return store.getState().transaction('Apply AI changes', () => applyWorkflowInTransaction(store, workflow));
}

function applyWorkflowInTransaction(api: IrisEditorStoreApi, workflow: WorkflowJSON): ApplyWorkflowResult {
  const store = api.getState();
  const warnings: string[] = [];

  // Track ID mappings (JSON nodeId -> actual store nodeId)
  // Include existing nodes in the mapping
  const idMapping = new Map<string, string>();
  const existingNodeIds = new Set(store.nodes.map((n) => n.id));

  // Pre-populate mapping with existing node IDs
  store.nodes.forEach((n) => {
    idMapping.set(n.id, n.id);
  });

  let nodesCreated = 0;
  let nodesModified = 0;
  let nodesDeleted = 0;

  // Process nodes
  for (const nodeJson of workflow.nodes) {
    const action = nodeJson.action || 'add';

    if (action === 'delete') {
      // Delete existing node
      const existingNode = findExistingNode(api, nodeJson.nodeId);
      if (existingNode) {
        store.deleteNode(nodeJson.nodeId);
        existingNodeIds.delete(nodeJson.nodeId);
        idMapping.delete(nodeJson.nodeId);
        nodesDeleted++;
      } else {
        warnings.push(`Cannot delete: node not found: ${nodeJson.nodeId}`);
      }
      continue;
    }

    if (action === 'modify') {
      // Modify existing node
      const existingNode = findExistingNode(api, nodeJson.nodeId);
      if (!existingNode) {
        warnings.push(`Cannot modify: node not found: ${nodeJson.nodeId}`);
        continue;
      }

      // Update node data
      const updates: Partial<IrisNodeData> = {};

      if (nodeJson.label) {
        updates.label = nodeJson.label;
      }

      if (nodeJson.config) {
        // The current config (not the one the node was loaded with).
        const currentConfig: Partial<NodeConfig> =
          api.getState().nodeConfigs[nodeJson.nodeId] || existingNode.data?.config || {};
        const newSettings = { ...currentConfig.settings };

        // Merge new config into existing
        Object.entries(nodeJson.config).forEach(([key, value]) => {
          if (key === 'provider' || key === 'model') {
            // These are top-level config fields
          } else {
            newSettings[key] = value;
          }
        });

        const newConfig: Partial<NodeConfig> = {
          ...currentConfig,
          settings: newSettings,
        };

        if (nodeJson.config.provider) {
          newConfig.provider = nodeJson.config.provider as string;
        }
        if (nodeJson.config.model) {
          newConfig.model = nodeJson.config.model as string;
        }

        store.updateNodeConfig(nodeJson.nodeId, newConfig);
      }

      if (Object.keys(updates).length > 0) {
        store.updateNode(nodeJson.nodeId, updates);
      }

      // Update position if provided (an undoable move, U-08)
      if (nodeJson.position) {
        store.moveNodes({
          [nodeJson.nodeId]: { x: nodeJson.position.x, y: nodeJson.position.y },
        });
      }

      idMapping.set(nodeJson.nodeId, nodeJson.nodeId);
      nodesModified++;
      continue;
    }

    // action === 'add' (default)
    if (!nodeJson.type) {
      warnings.push(`Cannot add node without type: ${nodeJson.nodeId}`);
      continue;
    }

    if (!isValidNodeType(nodeJson.type)) {
      warnings.push(`Unknown node type: ${nodeJson.type}`);
      continue;
    }

    const nodeDef = NODE_DEFINITIONS[nodeJson.type];

    // Generate unique ID
    const newId = generateUniqueNodeId(existingNodeIds);
    existingNodeIds.add(newId);
    idMapping.set(nodeJson.nodeId, newId);

    // Merge default settings with provided config
    const defaultSettings = getNodeDefaultSettings(nodeJson.type);
    const config: NodeConfig = {
      provider: (nodeJson.config?.provider as string) || undefined,
      model: (nodeJson.config?.model as string) || undefined,
      inputs: {},
      outputs: {},
      settings: {
        ...defaultSettings,
        ...nodeJson.config,
      },
    };

    // Remove provider and model from settings (they're top-level)
    delete config.settings.provider;
    delete config.settings.model;

    const position: XYPosition = {
      x: nodeJson.position?.x ?? 100,
      y: nodeJson.position?.y ?? 200,
    };

    const nodeData: Partial<IrisNodeData> = {
      type: nodeJson.type,
      label: nodeJson.label || nodeDef.label,
      category: nodeDef.category,
      config,
      status: 'idle',
    };

    const addedId = store.addNode(nodeJson.type, position, nodeData);
    idMapping.set(nodeJson.nodeId, addedId);
    existingNodeIds.add(addedId);

    nodesCreated++;
  }

  // Process edges
  let edgesCreated = 0;
  let edgesDeleted = 0;

  for (const edgeJson of workflow.edges) {
    const action = edgeJson.action || 'add';

    // Resolve node IDs (use mapping for new nodes, direct for existing)
    const sourceId = idMapping.get(edgeJson.sourceNodeId) || edgeJson.sourceNodeId;
    const targetId = idMapping.get(edgeJson.targetNodeId) || edgeJson.targetNodeId;

    if (action === 'delete') {
      // Find and delete the edge
      const existingEdge = findExistingEdge(api, sourceId, targetId, edgeJson.sourceHandle, edgeJson.targetHandle);
      if (existingEdge) {
        store.deleteEdge(existingEdge.id);
        edgesDeleted++;
      } else {
        warnings.push(`Cannot delete: edge not found from ${edgeJson.sourceNodeId} to ${edgeJson.targetNodeId}`);
      }
      continue;
    }

    // action === 'add' (default) - modify not applicable for edges, just recreate

    // Verify source node exists
    if (!api.getState().nodes.find((n) => n.id === sourceId)) {
      warnings.push(`Edge references unknown source node: ${edgeJson.sourceNodeId}`);
      continue;
    }

    // Verify target node exists
    if (!api.getState().nodes.find((n) => n.id === targetId)) {
      warnings.push(`Edge references unknown target node: ${edgeJson.targetNodeId}`);
      continue;
    }

    // Check if edge already exists
    const existingEdge = findExistingEdge(api, sourceId, targetId, edgeJson.sourceHandle, edgeJson.targetHandle);
    if (existingEdge) {
      // Edge already exists, skip
      continue;
    }

    // Create connection
    const connection: Connection = {
      source: sourceId,
      target: targetId,
      sourceHandle: edgeJson.sourceHandle,
      targetHandle: edgeJson.targetHandle,
    };

    // Same rules as connecting on the canvas (types, ports, cycles).
    const result = api.getState().onConnect(connection);
    if (!result.ok) {
      warnings.push(
        `Edge ${edgeJson.sourceNodeId}.${edgeJson.sourceHandle} -> ${edgeJson.targetNodeId}.${edgeJson.targetHandle} refused: ${result.reason}`,
      );
      continue;
    }
    edgesCreated++;
  }

  return {
    nodesCreated,
    nodesModified,
    nodesDeleted,
    edgesCreated,
    edgesDeleted,
    warnings,
  };
}

/**
 * Check if a response contains a workflow JSON block
 */
export function hasWorkflowJSON(response: string): boolean {
  return /```json-workflow\s*[\s\S]*?```/.test(response);
}

/**
 * Parse and apply workflow from streaming response
 * This can be called as the response is being built
 */
export function tryApplyWorkflow(
  currentResponse: string,
  alreadyApplied: boolean,
  store: IrisEditorStoreApi = irisEditorStore,
): { applied: boolean; result?: ApplyWorkflowResult } {
  if (alreadyApplied) {
    return { applied: false };
  }

  if (!hasWorkflowJSON(currentResponse)) {
    return { applied: false };
  }

  const workflow = extractWorkflowJSON(currentResponse);
  if (!workflow) {
    return { applied: false };
  }

  const result = applyWorkflowToCanvas(workflow, store);
  return { applied: true, result };
}
