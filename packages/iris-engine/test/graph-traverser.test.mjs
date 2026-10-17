/**
 * GraphTraverser ordering. Run with `pnpm --filter iris-engine test`
 * (builds first; imports `dist/`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GraphTraverser } from '../dist/index.js';

const node = (id, type = 'UTIL_TRANSFORM') => ({ id, nodeId: id, type, config: {} });
const edge = (id, source, sourceHandle, target, targetHandle) => ({
  edgeId: id,
  sourceNodeId: source,
  targetNodeId: target,
  sourceHandle,
  targetHandle,
});

// W-12: in-degree counts unique upstream nodes but used to be decremented once
// per edge, so two edges from A into B released B before its other
// dependency C ran. Depths alone did not hide it here because C's depth grows
// through a longer path discovered after C was visited.
test('W-12 a node never precedes one of its dependencies', () => {
  const nodes = ['A', 'D', 'E', 'F', 'C', 'B'].map(id => node(id));
  const edges = [
    edge('e1', 'A', 'output', 'B', 'x'),
    edge('e2', 'A', 'output', 'B', 'y'),
    edge('e3', 'D', 'output', 'C', 'p'),
    edge('e4', 'D', 'output', 'E', 'input'),
    edge('e5', 'E', 'output', 'F', 'input'),
    edge('e6', 'F', 'output', 'C', 'q'),
    edge('e7', 'C', 'output', 'B', 'z'),
  ];
  const graph = new GraphTraverser().buildGraph(nodes, edges);
  const order = graph.topologicalOrder;
  for (const [id, n] of graph.nodes) {
    for (const dep of n.dependencies) {
      assert.ok(
        order.indexOf(dep) < order.indexOf(id),
        `${dep} must run before ${id} (order: ${order.join(' ')})`,
      );
    }
  }
});
