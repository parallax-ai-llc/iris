/**
 * Connection rules: resolvePorts / canConnect / checkGraph / diffDynamicOutputs.
 * Run with `pnpm --filter iris-nodes test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePorts,
  canConnect,
  checkGraph,
  orphanEdgeIds,
  diffDynamicOutputs,
  getNodeDefinition,
} from '../dist/index.js';

const node = (id, type, settings = {}) => ({
  id,
  type,
  label: id,
  position: { x: 0, y: 0 },
  config: { settings, inputs: {}, outputs: {} },
});
const edge = (id, source, sourceHandle, target, targetHandle) => ({ id, source, sourceHandle, target, targetHandle });
const doc = (nodes, edges = []) => ({ nodes, edges });

test('resolvePorts adds router routes and decision options', () => {
  const router = node('r', 'UTIL_ROUTER', { routes: JSON.stringify([{ name: 'big', condition: 'true' }]) });
  assert.deepEqual(resolvePorts(router).outputs.map(p => p.name), ['big', 'default']);
  const decision = node('d', 'AI_DECISION', { mode: 'choice', options: 'cat\ndog' });
  const names = resolvePorts(decision).outputs.map(p => p.name);
  assert.ok(names.includes('cat') && names.includes('dog') && !names.includes('true'));
  assert.equal(resolvePorts(node('x', 'NOPE')), null);
});

test('canConnect: ok, type mismatch, unknown port/type, self, trigger input', () => {
  const g = doc([node('t', 'TRIGGER_MANUAL'), node('llm', 'GEN_TEXT_TO_TEXT'), node('img', 'GEN_TEXT_TO_IMAGE')]);
  assert.deepEqual(canConnect(g, { source: 't', sourceHandle: 'text', target: 'llm', targetHandle: 'prompt' }), { ok: true });
  assert.deepEqual(canConnect(g, { source: 't', sourceHandle: 'image', target: 'llm', targetHandle: 'prompt' }), { ok: false, reason: 'type-mismatch' });
  assert.deepEqual(canConnect(g, { source: 't', sourceHandle: 'nope', target: 'llm', targetHandle: 'prompt' }), { ok: false, reason: 'unknown-port' });
  assert.deepEqual(canConnect(g, { source: 'llm', sourceHandle: 'text', target: 'llm', targetHandle: 'prompt' }), { ok: false, reason: 'self' });
  assert.deepEqual(canConnect(g, { source: 'llm', sourceHandle: 'text', target: 't', targetHandle: 'x' }), { ok: false, reason: 'trigger-input' });
  assert.deepEqual(canConnect(g, { source: 'zz', sourceHandle: 'text', target: 'llm', targetHandle: 'prompt' }), { ok: false, reason: 'unknown-node' });
  const withUnknown = doc([...g.nodes, node('old', 'REMOVED_TYPE')]);
  assert.deepEqual(canConnect(withUnknown, { source: 'old', sourceHandle: 'out', target: 'llm', targetHandle: 'prompt' }), { ok: false, reason: 'unknown-port' });
});

test('canConnect accepts dynamic router ports (W-07)', () => {
  const g = doc([node('r', 'UTIL_ROUTER', { routes: '[{"name":"big","condition":"true"}]' }), node('n', 'UTIL_TRANSFORM')]);
  assert.equal(canConnect(g, { source: 'r', sourceHandle: 'big', target: 'n', targetHandle: 'input' }).ok, true);
  assert.equal(canConnect(g, { source: 'r', sourceHandle: 'small', target: 'n', targetHandle: 'input' }).ok, false);
});

test('canConnect names the edge to replace on the same input; same edge is a no-op', () => {
  const g = doc(
    [node('a', 'GEN_TEXT_TO_TEXT'), node('b', 'GEN_TEXT_TO_TEXT'), node('img', 'GEN_TEXT_TO_IMAGE')],
    [edge('e1', 'a', 'text', 'img', 'prompt')],
  );
  assert.deepEqual(canConnect(g, { source: 'b', sourceHandle: 'text', target: 'img', targetHandle: 'prompt' }), { ok: true, replaces: 'e1' });
  assert.deepEqual(canConnect(g, { source: 'a', sourceHandle: 'text', target: 'img', targetHandle: 'prompt' }), { ok: true, existing: 'e1' });
});

test('canConnect rejects cycles (W-11)', () => {
  const g = doc(
    [node('a', 'UTIL_TRANSFORM'), node('b', 'UTIL_TRANSFORM'), node('c', 'UTIL_MERGE')],
    [edge('ab', 'a', 'output', 'b', 'input'), edge('bc', 'b', 'output', 'c', 'input1')],
  );
  assert.deepEqual(canConnect(g, { source: 'c', sourceHandle: 'merged', target: 'a', targetHandle: 'input' }), { ok: false, reason: 'cycle' });
});

test('checkGraph reports orphan edges, missing handles, multiple inputs, cycles by id', () => {
  const g = doc(
    [node('a', 'UTIL_TRANSFORM'), node('b', 'UTIL_TRANSFORM'), node('r', 'UTIL_ROUTER'), node('u', 'GONE_TYPE')],
    [
      edge('orphan', 'a', 'output', 'ghost', 'input'),
      edge('badport', 'r', 'renamed-route', 'b', 'input'),
      edge('ab', 'a', 'output', 'b', 'input'),
      edge('ba', 'b', 'output', 'a', 'input'),
    ],
  );
  const issues = checkGraph(g);
  const codes = issues.map(i => `${i.code}:${i.edgeId ?? i.nodeId}`);
  assert.ok(codes.includes('orphan-edge:orphan'), codes.join(' '));
  assert.ok(codes.includes('unknown-port:badport'), codes.join(' '));
  assert.ok(codes.includes('multiple-inputs:badport'), codes.join(' '));
  assert.ok(codes.includes('unknown-node-type:u'), codes.join(' '));
  assert.ok(codes.includes('cycle:a') && codes.includes('cycle:b'), codes.join(' '));
  assert.deepEqual(new Set(orphanEdgeIds(issues)), new Set(['orphan', 'badport']));
  assert.deepEqual(checkGraph(doc([node('a', 'TRIGGER_MANUAL'), node('b', 'UTIL_TRANSFORM')], [edge('ok', 'a', 'text', 'b', 'input')])), []);
});

test('diffDynamicOutputs: rename by position, removal past the end (W-08)', () => {
  const statics = getNodeDefinition('UTIL_ROUTER').outputs;
  const routes = names => ({ routes: JSON.stringify(names.map(name => ({ name, condition: 'true' }))) });
  assert.deepEqual(diffDynamicOutputs('UTIL_ROUTER', statics, routes(['a', 'b']), routes(['a', 'c'])), { renamed: [{ from: 'b', to: 'c' }], removed: [] });
  assert.deepEqual(diffDynamicOutputs('UTIL_ROUTER', statics, routes(['a', 'b']), routes(['a'])), { renamed: [], removed: ['b'] });
  assert.deepEqual(diffDynamicOutputs('UTIL_ROUTER', statics, routes(['a', 'b']), routes(['b', 'a'])), { renamed: [], removed: [] });
  const dec = getNodeDefinition('AI_DECISION').outputs;
  const r = diffDynamicOutputs('AI_DECISION', dec, { mode: 'yesno' }, { mode: 'choice', options: 'x' });
  assert.ok(r.removed.includes('true') && r.removed.includes('false'));
});
