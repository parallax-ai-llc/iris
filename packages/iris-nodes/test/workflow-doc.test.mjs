/**
 * Workflow document v2: migration from every v1 shape and the round-trip
 * contract `normalize(load(save(doc))) === normalize(doc)`.
 * Run with `pnpm --filter iris-nodes test` (builds first; imports `dist/`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  migrateWorkflowDoc,
  migrateWorkflowDocWithReport,
  normalizeWorkflowDoc,
  workflowDocToRows,
  workflowDocGraphJson,
} from '../dist/index.js';

const localV1 = {
  id: 'wf1',
  name: 'Local v1',
  userId: 'local',
  status: 'DRAFT',
  nodes: [
    { id: 't', nodeId: 't', type: 'TRIGGER_MANUAL', label: 'Start', config: {}, inputPorts: [], outputPorts: [], position: { x: 10, y: 20 } },
    {
      id: 'llm',
      nodeId: 'llm',
      type: 'GEN_TEXT_TO_TEXT',
      label: 'LLM',
      config: {
        provider: 'openai',
        model: 'gpt-4o',
        settings: { temperature: 0.2 },
        inputs: {
          prompt: { source: 'node', nodeId: 't', outputName: 'text' },
          context: { source: 'user', value: 'be brief' },
        },
        outputs: { text: { variableName: 'answer', saveToStorage: false } },
      },
      inputPorts: [],
      outputPorts: [],
      position: { x: 300, y: 20 },
    },
    {
      id: 'img',
      nodeId: 'img',
      type: 'GEN_TEXT_TO_IMAGE',
      label: 'Image',
      config: {
        settings: {},
        inputs: { prompt: { source: 'node', nodeId: 'llm', outputName: 'text' } },
      },
      inputPorts: [],
      outputPorts: [],
    },
  ],
  edges: [
    { edgeId: 'e1', sourceNodeId: 'llm', targetNodeId: 'img', sourceHandle: 'text', targetHandle: 'prompt' },
    { edgeId: 'e1dup', sourceNodeId: 'llm', targetNodeId: 'img', sourceHandle: 'text', targetHandle: 'prompt' },
  ],
  totalExecutions: 3,
};

test('v1 node links become edges once; existing edges win', () => {
  const { doc, fromVersion, changes } = migrateWorkflowDocWithReport(localV1);
  assert.equal(fromVersion, 1);
  assert.equal(doc.schemaVersion, 2);
  assert.equal(doc.revision, 0);
  // t.text -> llm.prompt was config-only: now an edge.
  const intoPrompt = doc.edges.filter(e => e.target === 'llm' && e.targetHandle === 'prompt');
  assert.equal(intoPrompt.length, 1);
  assert.equal(intoPrompt[0].source, 't');
  assert.equal(intoPrompt[0].sourceHandle, 'text');
  // img.prompt already had e1: the link is dropped, the duplicate edge too.
  const intoImg = doc.edges.filter(e => e.target === 'img');
  assert.deepEqual(intoImg.map(e => e.id), ['e1']);
  for (const n of doc.nodes) {
    for (const input of Object.values(n.config.inputs)) assert.notEqual(input.source, 'node');
  }
  assert.equal(doc.nodes.find(n => n.id === 'llm').config.inputs.context.value, 'be brief');
  assert.ok(changes.some(c => c.kind === 'node-link-to-edge' && c.nodeId === 'llm'));
  assert.ok(changes.some(c => c.kind === 'node-link-dropped' && c.nodeId === 'img' && c.reason === 'edge-exists'));
  assert.ok(changes.some(c => c.kind === 'duplicate-edge-dropped' && c.edgeId === 'e1dup'));
  assert.deepEqual(doc.nodes.find(n => n.id === 't').position, { x: 10, y: 20 });
  assert.deepEqual(doc.nodes.find(n => n.id === 'img').position, { x: 0, y: 0 });
});

test('cloud DTO shape (db ids, positionX/Y, ports as handles) is read', () => {
  const doc = migrateWorkflowDoc({
    id: 'cloud-1',
    name: 'Cloud',
    nodes: [
      { id: 'db-1', nodeId: 'a', type: 'TRIGGER_MANUAL', label: 'A', positionX: 5, positionY: 6, config: {} },
      { id: 'db-2', nodeId: 'b', type: 'UTIL_TRANSFORM', label: 'B', positionX: 7, positionY: 8, config: { settings: {} } },
    ],
    edges: [{ id: 'db-e', edgeId: 'ab', sourceNodeId: 'db-1', targetNodeId: 'db-2', sourcePortId: 'text', targetPortId: 'input' }],
  });
  assert.deepEqual(doc.edges, [{ id: 'ab', source: 'a', sourceHandle: 'text', target: 'b', targetHandle: 'input' }]);
  assert.deepEqual(doc.nodes[0].position, { x: 5, y: 6 });
});

test('several edges into one input: the last one is kept (engine behavior)', () => {
  const { doc, changes } = migrateWorkflowDocWithReport({
    nodes: [
      { id: 'a', type: 'TRIGGER_MANUAL' },
      { id: 'b', type: 'TRIGGER_MANUAL' },
      { id: 'c', type: 'UTIL_TRANSFORM' },
    ],
    edges: [
      { edgeId: 'first', sourceNodeId: 'a', targetNodeId: 'c', sourceHandle: 'text', targetHandle: 'input' },
      { edgeId: 'last', sourceNodeId: 'b', targetNodeId: 'c', sourceHandle: 'text', targetHandle: 'input' },
    ],
  });
  assert.deepEqual(doc.edges.map(e => e.id), ['last']);
  assert.ok(changes.some(c => c.kind === 'extra-input-edge-dropped' && c.edgeId === 'first'));
});

test('a link to a missing node is dropped, not turned into an orphan edge', () => {
  const { doc, changes } = migrateWorkflowDocWithReport({
    nodes: [{ id: 'x', type: 'GEN_TEXT_TO_IMAGE', config: { inputs: { prompt: { source: 'node', nodeId: 'ghost' } } } }],
    edges: [],
  });
  assert.equal(doc.edges.length, 0);
  assert.deepEqual(doc.nodes[0].config.inputs, {});
  assert.ok(changes.some(c => c.kind === 'node-link-dropped' && c.reason === 'source-missing'));
});

test('orphan edges are kept for checkGraph (migration never guesses)', () => {
  const doc = migrateWorkflowDoc({
    nodes: [{ id: 'a', type: 'TRIGGER_MANUAL' }],
    edges: [{ edgeId: 'o', sourceNodeId: 'a', targetNodeId: 'gone', sourceHandle: 'text', targetHandle: 'input' }],
  });
  assert.equal(doc.edges.length, 1);
});

test('migration is idempotent and v2 survives a JSON round trip', () => {
  const once = migrateWorkflowDoc(localV1);
  const twice = migrateWorkflowDoc(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(normalizeWorkflowDoc(twice), normalizeWorkflowDoc(once));
  const r = migrateWorkflowDocWithReport(once);
  assert.equal(r.fromVersion, 2);
  assert.deepEqual(r.changes, []);
});

test('rows round trip: doc -> host rows -> doc', () => {
  const doc = { ...migrateWorkflowDoc(localV1), revision: 7 };
  const rows = workflowDocToRows(doc);
  const back = migrateWorkflowDoc({ id: doc.id, name: doc.name, revision: doc.revision, ...rows });
  assert.deepEqual(normalizeWorkflowDoc(back), normalizeWorkflowDoc(doc));
});

test('normalize ignores node/edge order; graph json ignores id/name/revision', () => {
  const doc = migrateWorkflowDoc(localV1);
  const shuffled = { ...doc, nodes: [...doc.nodes].reverse(), edges: [...doc.edges].reverse() };
  assert.deepEqual(normalizeWorkflowDoc(shuffled), normalizeWorkflowDoc(doc));
  assert.equal(workflowDocGraphJson({ ...shuffled, id: 'other', name: 'x', revision: 9 }), workflowDocGraphJson(doc));
});

test('unknown top-level config keys are preserved', () => {
  const doc = migrateWorkflowDoc({ nodes: [{ id: 'w', type: 'OUTPUT_WEBHOOK', config: { url: 'https://x.test', settings: { a: 1 } } }] });
  assert.equal(doc.nodes[0].config.url, 'https://x.test');
  assert.deepEqual(doc.nodes[0].config.settings, { a: 1 });
});

test('a link that would close a cycle is dropped', () => {
  const { doc, changes } = migrateWorkflowDocWithReport({
    nodes: [
      { id: 'a', type: 'UTIL_TRANSFORM', config: { inputs: { input: { source: 'node', nodeId: 'b', outputName: 'output' } } } },
      { id: 'b', type: 'UTIL_TRANSFORM' },
    ],
    edges: [{ edgeId: 'ab', sourceNodeId: 'a', targetNodeId: 'b', sourceHandle: 'output', targetHandle: 'input' }],
  });
  assert.deepEqual(doc.edges.map(e => e.id), ['ab']);
  assert.ok(changes.some(c => c.kind === 'node-link-dropped' && c.reason === 'would-cycle'));
});
