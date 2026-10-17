/**
 * validateWorkflowSemantics on v2 documents. Run with `pnpm --filter iris-nodes test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkflowSemantics, migrateWorkflowDoc } from '../dist/index.js';

const n = (id, type, config = {}) => ({
  id,
  type,
  label: id,
  position: { x: 0, y: 0 },
  config: { settings: {}, inputs: {}, outputs: {}, ...config },
});
const e = (id, source, sourceHandle, target, targetHandle) => ({ id, source, sourceHandle, target, targetHandle });

test('required input: edge or direct value counts, a v1 node link alone does not (W-02)', () => {
  const base = [n('t', 'TRIGGER_MANUAL'), n('llm', 'GEN_TEXT_TO_TEXT', { provider: 'openai', model: 'm' })];
  const missing = validateWorkflowSemantics({ nodes: base, edges: [e('x', 't', 'text', 'llm', 'context')] });
  assert.deepEqual(missing.map(i => [i.code, i.nodeId]), [['required-input', 'llm']]);

  const viaEdge = validateWorkflowSemantics({ nodes: base, edges: [e('x', 't', 'text', 'llm', 'prompt')] });
  assert.deepEqual(viaEdge, []);

  const direct = [base[0], n('llm', 'GEN_TEXT_TO_TEXT', { provider: 'openai', model: 'm', inputs: { prompt: { source: 'user', value: 'hi' } } })];
  assert.deepEqual(validateWorkflowSemantics({ nodes: direct, edges: [e('x', 't', 'text', 'llm', 'context')] }), []);

  // A raw v1 link that slipped through without migration does not count.
  const raw = [base[0], n('llm', 'GEN_TEXT_TO_TEXT', { provider: 'openai', model: 'm', inputs: { prompt: { source: 'node', nodeId: 't' } } })];
  assert.equal(validateWorkflowSemantics({ nodes: raw, edges: [e('x', 't', 'text', 'llm', 'context')] })[0].code, 'required-input');
});

test('messages keep the cloud wording', () => {
  const issues = validateWorkflowSemantics({ nodes: [n('a', 'GEN_TEXT_TO_IMAGE'), n('b', 'TRIGGER_MANUAL'), n('c', 'TRIGGER_WEBHOOK')], edges: [] });
  const msgs = issues.map(i => i.message);
  assert.ok(msgs.includes('Workflow can only have one trigger node. Found 2 triggers: b, c'));
  assert.ok(msgs.includes('Node "a" is not connected to any other node'));
  assert.ok(msgs.includes('Node "a" requires a model to be selected'));
  assert.ok(msgs.includes('Node "a" requires a provider to be selected'));
  assert.deepEqual(validateWorkflowSemantics({ nodes: [], edges: [] }).map(i => i.code), ['empty']);
});

test('conditions use the injected expression checker; loop caps use the injected cap', () => {
  const f = n('f', 'UTIL_FILTER', { settings: { condition: 'bad ((' } });
  const loop = n('l', 'UTIL_LOOP', { settings: { maxIterations: 50 } });
  const t = n('t', 'TRIGGER_MANUAL');
  const edges = [e('1', 't', 'text', 'f', 'input'), e('2', 'f', 'output', 'l', 'items')];
  const issues = validateWorkflowSemantics({ nodes: [t, f, loop], edges }, {
    validateExpression: src => (src.includes('((') ? 'unbalanced' : null),
    maxLoopIterationsTotal: 10,
  });
  const codes = issues.map(i => i.code);
  assert.ok(codes.includes('invalid-condition'));
  assert.ok(codes.includes('loop-cap'));
  assert.ok(!validateWorkflowSemantics({ nodes: [t, f, loop], edges }).some(i => i.code === 'invalid-condition'));
});

test('validates what migration produced from v1 rows', () => {
  const doc = migrateWorkflowDoc({
    nodes: [
      { id: 't', nodeId: 't', type: 'TRIGGER_MANUAL', config: {} },
      { id: 'llm', nodeId: 'llm', type: 'GEN_TEXT_TO_TEXT', config: { provider: 'p', model: 'm', inputs: { prompt: { source: 'node', nodeId: 't', outputName: 'text' } } } },
    ],
    edges: [],
  });
  assert.deepEqual(validateWorkflowSemantics(doc), []);
});
