/**
 * Branch pruning — the runtime half of the gate nodes.
 *
 * Gate nodes (`UTIL_CONDITION`, `UTIL_CONDITIONAL`, `UTIL_ROUTER`,
 * `UTIL_FILTER`, `UTIL_TRY_CATCH`) emit a value on exactly one of their
 * branch ports and `null` on the rest. Historically the engine executed the
 * downstream of *every* port anyway (a `null` input passes `gatherInputs`),
 * so a "false" branch still ran its generators with an empty prompt and paid
 * for it, or failed and took the whole run down.
 *
 * The fix is a tiny protocol:
 *
 *   1. A gate lists the ports it did NOT take under `outputs.__inertPorts`.
 *   2. An edge is *dead* when its source node was skipped, or when its source
 *      port is inert.
 *   3. A node whose incoming edges are ALL dead is skipped (`status:
 *      'skipped'`), which in turn kills its own outgoing edges — so pruning
 *      propagates transitively down the untaken branch.
 *   4. A node with at least one live edge runs (join semantics — `UTIL_MERGE`
 *      still fires when only one branch reached it). Dead edges simply don't
 *      contribute an input, so config fallbacks apply as if unconnected.
 *
 * Nodes without incoming edges (triggers, config-only sources) are never
 * skipped. A source node with no recorded result (start-from-node runs) is
 * treated as live so behaviour matches the pre-pruning engine there.
 */

import type { ExecutionState, GraphNode, NodeResult } from './types.js';

/** Hidden output key under which a gate node lists its untaken ports. */
export const INERT_PORTS_KEY = '__inertPorts';

/** Attach the untaken-port list to a gate node's outputs. */
export function markInertPorts(
  outputs: Record<string, unknown>,
  inertPorts: string[]
): void {
  outputs[INERT_PORTS_KEY] = inertPorts;
}

/** Read a result's inert-port list (empty when the node is not a gate). */
export function getInertPorts(result: NodeResult | undefined): string[] {
  const raw = result?.outputs?.[INERT_PORTS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is string => typeof p === 'string');
}

/**
 * Whether the edge `sourceNodeId.sourcePortId → (this node)` carries data.
 * Dead when the source was skipped or the port is inert; live otherwise,
 * including when the source has no result yet (never pessimise).
 */
export function isConnectionLive(
  state: Pick<ExecutionState, 'nodeResults'>,
  connection: { nodeId: string; portId: string }
): boolean {
  const sourceResult = state.nodeResults.get(connection.nodeId);
  if (!sourceResult) return true;
  if (sourceResult.status === 'skipped') return false;
  return !getInertPorts(sourceResult).includes(connection.portId);
}

/**
 * A node is skipped when it has incoming edges and none of them are live.
 */
export function shouldSkipNode(
  graphNode: Pick<GraphNode, 'inputs'>,
  state: Pick<ExecutionState, 'nodeResults'>
): boolean {
  if (graphNode.inputs.size === 0) return false;
  for (const connection of graphNode.inputs.values()) {
    if (isConnectionLive(state, connection)) return false;
  }
  return true;
}

/** Build the result recorded for a pruned node. */
export function createSkippedResult(nodeId: string): NodeResult {
  return {
    nodeId,
    status: 'skipped',
    outputs: {},
    assets: [],
    duration: 0,
  };
}
