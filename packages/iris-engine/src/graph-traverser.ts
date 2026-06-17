/**
 * Iris - Graph Traverser
 * Handles DAG traversal and topological sorting for workflow execution.
 *
 * Moved here from `core/server/src/modules/iris/execution/engine/graph-traverser.ts`.
 * The Prisma row types (`IrisNode` / `IrisEdge`) used as `buildGraph` inputs are
 * replaced by the structural `GraphInputNode` / `GraphInputEdge` interfaces below
 * — they declare only the fields the traverser actually reads, so a Prisma row
 * (which has a superset of fields) is assignable without the engine depending on
 * `@prisma/client`.
 */

import { WorkflowGraph, GraphNode, GraphEdge, IrisNodeType } from './types.js';
import { WorkflowCycleError } from './errors.js';

/** Minimal node shape `buildGraph` consumes. Prisma's `IrisNode` row satisfies
 *  this structurally (it has these fields and more). */
export interface GraphInputNode {
  id: string;
  nodeId: string;
  type: IrisNodeType;
  config: unknown;
  provider?: { name: string } | null;
}

/** Minimal edge shape `buildGraph` consumes. Prisma's `IrisEdge` row satisfies
 *  this structurally. */
export interface GraphInputEdge {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string;
  targetHandle: string;
}

export class GraphTraverser {
  /**
   * Build a graph structure from nodes and edges
   */
  buildGraph(
    nodes: GraphInputNode[],
    edges: GraphInputEdge[]
  ): WorkflowGraph {
    // Initialize graph nodes
    const graphNodes = new Map<string, GraphNode>();

    for (const node of nodes) {
      graphNodes.set(node.nodeId, {
        id: node.nodeId,
        type: node.type,
        config: node.config as Record<string, unknown>,
        inputs: new Map(),
        outputs: new Map(),
        depth: 0,
        dependencies: new Set(),
      });
    }

    // Build edges
    const graphEdges: GraphEdge[] = [];

    for (const edge of edges) {
      // Find the nodes by their internal IDs
      const sourceNode = nodes.find(n => n.id === edge.sourceNodeId);
      const targetNode = nodes.find(n => n.id === edge.targetNodeId);

      if (!sourceNode || !targetNode) continue;

      const sourceNodeId = sourceNode.nodeId;
      const targetNodeId = targetNode.nodeId;

      graphEdges.push({
        id: edge.edgeId,
        source: { nodeId: sourceNodeId, portId: edge.sourceHandle },
        target: { nodeId: targetNodeId, portId: edge.targetHandle },
      });

      // Update node connections
      const graphSourceNode = graphNodes.get(sourceNodeId);
      const graphTargetNode = graphNodes.get(targetNodeId);

      if (graphSourceNode && graphTargetNode) {
        // Add to source's outputs
        const existingOutputs =
          graphSourceNode.outputs.get(edge.sourceHandle) ?? [];
        existingOutputs.push({
          nodeId: targetNodeId,
          portId: edge.targetHandle,
        });
        graphSourceNode.outputs.set(edge.sourceHandle, existingOutputs);

        // Add to target's inputs
        graphTargetNode.inputs.set(edge.targetHandle, {
          nodeId: sourceNodeId,
          portId: edge.sourceHandle,
        });

        // Track dependency
        graphTargetNode.dependencies.add(sourceNodeId);
      }
    }

    // Calculate depths and find entry/exit nodes
    const entryNodes: string[] = [];
    const exitNodes: string[] = [];

    for (const [nodeId, node] of graphNodes) {
      if (node.inputs.size === 0) {
        entryNodes.push(nodeId);
      }
      if (node.outputs.size === 0) {
        exitNodes.push(nodeId);
      }
    }

    // Calculate node depths (BFS from entry nodes)
    this.calculateDepths(graphNodes, entryNodes);

    // Topological sort using Kahn's algorithm
    const topologicalOrder = this.topologicalSort(graphNodes);

    return {
      nodes: graphNodes,
      edges: graphEdges,
      entryNodes,
      exitNodes,
      topologicalOrder,
    };
  }

  /**
   * Calculate depth of each node (distance from entry)
   */
  private calculateDepths(
    nodes: Map<string, GraphNode>,
    entryNodes: string[]
  ): void {
    const queue = [...entryNodes];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const nodeId = queue.shift()!;

      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = nodes.get(nodeId)!;

      // Process all outputs
      for (const [, outputs] of node.outputs) {
        for (const output of outputs) {
          const targetNode = nodes.get(output.nodeId);
          if (targetNode) {
            targetNode.depth = Math.max(targetNode.depth, node.depth + 1);
            queue.push(output.nodeId);
          }
        }
      }
    }
  }

  /**
   * Topological sort using Kahn's algorithm
   */
  private topologicalSort(nodes: Map<string, GraphNode>): string[] {
    const result: string[] = [];
    const inDegree = new Map<string, number>();
    const queue: string[] = [];

    // Calculate in-degrees
    for (const [nodeId, node] of nodes) {
      inDegree.set(nodeId, node.dependencies.size);

      if (node.dependencies.size === 0) {
        queue.push(nodeId);
      }
    }

    // Process nodes with no dependencies
    while (queue.length > 0) {
      // Sort by depth for consistent ordering
      queue.sort((a, b) => nodes.get(a)!.depth - nodes.get(b)!.depth);

      const nodeId = queue.shift()!;
      result.push(nodeId);

      const node = nodes.get(nodeId)!;

      // Reduce in-degree of dependent nodes
      for (const [, outputs] of node.outputs) {
        for (const output of outputs) {
          const currentDegree = inDegree.get(output.nodeId) ?? 0;
          const newDegree = currentDegree - 1;
          inDegree.set(output.nodeId, newDegree);

          if (newDegree === 0) {
            queue.push(output.nodeId);
          }
        }
      }
    }

    // Check for cycles
    if (result.length !== nodes.size) {
      throw new WorkflowCycleError();
    }

    return result;
  }

  /**
   * Get subgraph execution order starting from a specific node
   */
  getSubgraphOrder(
    graph: WorkflowGraph,
    startNodeId: string,
    endNodeId?: string
  ): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const queue = [startNodeId];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;

      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      result.push(nodeId);

      if (endNodeId && nodeId === endNodeId) {
        break;
      }

      const node = graph.nodes.get(nodeId);
      if (node) {
        for (const [, outputs] of node.outputs) {
          for (const output of outputs) {
            if (!visited.has(output.nodeId)) {
              queue.push(output.nodeId);
            }
          }
        }
      }
    }

    // Sort by topological order
    const orderMap = new Map(graph.topologicalOrder.map((id, i) => [id, i]));
    result.sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0));

    return result;
  }

  /**
   * Get the loop body — nodes reachable from a loop node's `item`/`index` outputs.
   * Excludes nodes reached only via the `done` output (post-loop tail).
   * Returned in topological order.
   */
  getLoopBody(graph: WorkflowGraph, loopNodeId: string): string[] {
    const node = graph.nodes.get(loopNodeId);
    if (!node) return [];

    const body = new Set<string>();
    const queue: string[] = [];
    for (const portId of ['item', 'index']) {
      const targets = node.outputs.get(portId);
      if (!targets) continue;
      for (const t of targets) queue.push(t.nodeId);
    }

    while (queue.length > 0) {
      const id = queue.shift()!;
      if (body.has(id) || id === loopNodeId) continue;
      body.add(id);
      const n = graph.nodes.get(id);
      if (!n) continue;
      for (const [, outs] of n.outputs) {
        for (const o of outs) {
          if (!body.has(o.nodeId)) queue.push(o.nodeId);
        }
      }
    }

    const orderMap = new Map(graph.topologicalOrder.map((id, i) => [id, i]));
    return [...body].sort(
      (a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0)
    );
  }

  /**
   * Get all nodes that depend on a given node
   */
  getDependents(graph: WorkflowGraph, nodeId: string): string[] {
    const dependents: string[] = [];
    const visited = new Set<string>();
    const queue: string[] = [];

    const node = graph.nodes.get(nodeId);
    if (!node) return dependents;

    // Add direct dependents
    for (const [, outputs] of node.outputs) {
      for (const output of outputs) {
        queue.push(output.nodeId);
      }
    }

    // BFS to find all dependents
    while (queue.length > 0) {
      const currentId = queue.shift()!;

      if (visited.has(currentId)) continue;
      visited.add(currentId);
      dependents.push(currentId);

      const currentNode = graph.nodes.get(currentId);
      if (currentNode) {
        for (const [, outputs] of currentNode.outputs) {
          for (const output of outputs) {
            if (!visited.has(output.nodeId)) {
              queue.push(output.nodeId);
            }
          }
        }
      }
    }

    return dependents;
  }

  /**
   * Get all dependencies (ancestors) of a node
   */
  getDependencies(graph: WorkflowGraph, nodeId: string): string[] {
    const dependencies: string[] = [];
    const visited = new Set<string>();
    const queue: string[] = [];

    const node = graph.nodes.get(nodeId);
    if (!node) return dependencies;

    // Add direct dependencies
    for (const depId of node.dependencies) {
      queue.push(depId);
    }

    // BFS to find all dependencies
    while (queue.length > 0) {
      const currentId = queue.shift()!;

      if (visited.has(currentId)) continue;
      visited.add(currentId);
      dependencies.push(currentId);

      const currentNode = graph.nodes.get(currentId);
      if (currentNode) {
        for (const depId of currentNode.dependencies) {
          if (!visited.has(depId)) {
            queue.push(depId);
          }
        }
      }
    }

    return dependencies;
  }

  /**
   * Validate graph structure
   */
  validateGraph(graph: WorkflowGraph): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for entry nodes
    if (graph.entryNodes.length === 0) {
      errors.push(
        'Workflow must have at least one entry node (node without inputs)'
      );
    }

    // Check for exit nodes
    if (graph.exitNodes.length === 0) {
      errors.push(
        'Workflow must have at least one exit node (node without outputs)'
      );
    }

    // Check for disconnected nodes
    const connected = new Set(graph.topologicalOrder);
    for (const nodeId of graph.nodes.keys()) {
      if (!connected.has(nodeId)) {
        errors.push(`Node ${nodeId} is disconnected from the main graph`);
      }
    }

    // Check for missing trigger nodes
    const hasTrigger = Array.from(graph.nodes.values()).some(node =>
      node.type.startsWith('TRIGGER_')
    );
    if (!hasTrigger) {
      errors.push('Workflow should have at least one trigger node');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get parallel execution groups
   * Returns groups of nodes that can be executed in parallel
   */
  getParallelGroups(graph: WorkflowGraph): string[][] {
    const groups: string[][] = [];
    const completed = new Set<string>();

    // Process nodes level by level
    while (completed.size < graph.nodes.size) {
      const group: string[] = [];

      for (const nodeId of graph.topologicalOrder) {
        if (completed.has(nodeId)) continue;

        const node = graph.nodes.get(nodeId)!;

        // Check if all dependencies are completed
        const allDepsCompleted = Array.from(node.dependencies).every(depId =>
          completed.has(depId)
        );

        if (allDepsCompleted) {
          group.push(nodeId);
        }
      }

      if (group.length === 0) {
        // This shouldn't happen with a valid DAG
        break;
      }

      groups.push(group);

      // Mark all nodes in this group as completed
      for (const nodeId of group) {
        completed.add(nodeId);
      }
    }

    return groups;
  }
}
