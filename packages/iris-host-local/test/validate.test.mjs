/**
 * Semantic validation of stored workflows. Run with
 * `pnpm --filter iris-host-local test` (builds first; imports `dist/`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateWorkflowDoc } from 'iris-nodes';
import { validateWorkflowSemantics } from '../dist/validate.js';

const row = (nodeId, type, label, config = {}) => ({
  id: nodeId,
  nodeId,
  type,
  label,
  config,
  inputPorts: [],
  outputPorts: [],
});

const llm = prompt =>
  row('llm', 'GEN_TEXT_TO_TEXT', 'LLM', {
    provider: 'openai',
    model: 'gpt-4o',
    inputs: { prompt },
    settings: {},
  });

// llm is connected (so it is not "unconnected"), but not on `prompt`.
const edges = [
  { edgeId: 'e1', sourceNodeId: 't', sourceHandle: 'text', targetNodeId: 'llm', targetHandle: 'context' },
  { edgeId: 'e2', sourceNodeId: 'llm', sourceHandle: 'text', targetNodeId: 'out', targetHandle: 'input' },
];

// W-02: a config-only `{ source: 'node', nodeId }` link (no edge) used to count
// as "connected", so validation passed and the run got an empty input.
test('W-02 a node reference that cannot become an edge does not satisfy a required input', () => {
  const wf = {
    nodes: [
      row('t', 'TRIGGER_MANUAL', 'Trigger'),
      llm({ source: 'node', nodeId: 'ghost', outputName: 'text' }),
      row('out', 'UTIL_TRANSFORM', 'Out'),
    ],
    edges,
  };
  const errors = validateWorkflowSemantics(wf);
  assert.ok(
    errors.includes('Node "LLM" requires "Prompt" input to be connected or configured'),
    `expected a missing-prompt error, got: ${JSON.stringify(errors)}`,
  );
});

// W-02 (other half): when the link's source exists, validation and the engine
// see the same graph: the migrated document has the edge the run will use.
test('W-02 a valid v1 node link passes only because it is a real edge after migration', () => {
  const wf = {
    nodes: [
      row('t', 'TRIGGER_MANUAL', 'Trigger'),
      llm({ source: 'node', nodeId: 't', outputName: 'text' }),
      row('out', 'UTIL_TRANSFORM', 'Out'),
    ],
    edges,
  };
  assert.deepEqual(validateWorkflowSemantics(wf), []);
  const doc = migrateWorkflowDoc(wf);
  assert.ok(doc.edges.some(e => e.source === 't' && e.target === 'llm' && e.targetHandle === 'prompt'));
});
