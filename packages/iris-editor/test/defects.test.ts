// Regression tests for the workflow editor defects listed in
// static/docs/iris/desktop-rs/04-workflow-editor.md section 2 (W-xx, U-xx).
// Written before the fixes (stage 0): every test here failed on the old
// snapshot-history store and must keep passing from stage 4 on.
//
// Run: node --import ./test/ts-resolve.mjs --test test/defects.test.ts
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useIrisEditorStore } from '../src/store/iris-editor.ts';
import { applyWorkflowToCanvas } from '../src/utils/workflow-parser.ts';
import { saveWorkflowGraph } from '../src/orchestrator/save-workflow.ts';

const S = () => useIrisEditorStore.getState();

function fresh() {
  S().resetEditor();
  S().initWorkflow('wf-1', 'Defects');
}

function add(type: string, label = type, x = 0): string {
  return S().addNode(type, { x, y: 0 }, { type, label });
}

function edgesInto(target: string, handle: string) {
  return S().edges.filter((e) => e.target === target && e.targetHandle === handle);
}

beforeEach(fresh);

// W-03: picking "node output" in the input source panel must create an edge,
// not a config-only link the engine never reads.
test('W-03 selecting a node output in the panel creates the edge', () => {
  const src = add('GEN_TEXT_TO_TEXT', 'Source');
  const dst = add('GEN_TEXT_TO_IMAGE', 'Target');
  S().updateNodeInput(dst, 'prompt', { source: 'node', nodeId: src, outputName: 'text' });

  const edges = edgesInto(dst, 'prompt');
  assert.equal(edges.length, 1, 'one edge into prompt');
  assert.equal(edges[0].source, src);
  assert.equal(edges[0].sourceHandle, 'text');
  assert.notEqual(S().nodeConfigs[dst]?.inputs?.prompt?.source, 'node', 'no config-only node link');
});

// W-04: duplicating a node must not copy config-level links to the original's
// upstream nodes (the copy has no edges, so it must not look connected).
test('W-04 duplicate does not carry node links in config.inputs', () => {
  const src = add('GEN_TEXT_TO_TEXT', 'Source');
  const dst = add('GEN_TEXT_TO_IMAGE', 'Target');
  S().onConnect({ source: src, sourceHandle: 'text', target: dst, targetHandle: 'prompt' });

  const copy = S().duplicateNode(dst);
  assert.ok(copy);
  const inputs = S().nodeConfigs[copy!]?.inputs ?? {};
  for (const [name, input] of Object.entries(inputs)) {
    assert.notEqual(input?.source, 'node', `input ${name} of the copy points at a node without an edge`);
  }
  assert.equal(edgesInto(copy!, 'prompt').length, 0);
});

// W-05: one input handle takes one edge; a second connection replaces the
// first (and one undo restores the original edge).
test('W-05 a second connection to the same input replaces the first', () => {
  const a = add('GEN_TEXT_TO_TEXT', 'A');
  const b = add('GEN_TEXT_TO_TEXT', 'B');
  const dst = add('GEN_TEXT_TO_IMAGE', 'Target');
  S().onConnect({ source: a, sourceHandle: 'text', target: dst, targetHandle: 'prompt' });
  S().onConnect({ source: b, sourceHandle: 'text', target: dst, targetHandle: 'prompt' });

  let edges = edgesInto(dst, 'prompt');
  assert.equal(edges.length, 1, 'exactly one edge per input handle');
  assert.equal(edges[0].source, b);

  S().undo();
  edges = edgesInto(dst, 'prompt');
  assert.equal(edges.length, 1);
  assert.equal(edges[0].source, a, 'undo restores the replaced edge');
});

// W-08: renaming a router route moves the edge to the new port name; deleting
// the route removes its edge.
test('W-08 renaming or removing a dynamic port keeps edges consistent', () => {
  const router = add('UTIL_ROUTER', 'Router');
  const dst = add('UTIL_TRANSFORM', 'Next');
  S().updateNodeSettings(router, { routes: JSON.stringify([{ name: 'big', condition: 'true' }]) });
  S().onConnect({ source: router, sourceHandle: 'big', target: dst, targetHandle: 'input' });

  S().updateNodeSettings(router, { routes: JSON.stringify([{ name: 'large', condition: 'true' }]) });
  let edges = edgesInto(dst, 'input');
  assert.equal(edges.length, 1);
  assert.equal(edges[0].sourceHandle, 'large', 'edge follows the renamed port');

  S().updateNodeSettings(router, { routes: '[]' });
  edges = edgesInto(dst, 'input');
  assert.equal(edges.length, 0, 'edge of a removed port is removed');
});

// W-16: an AI "modify" must start from the current config, not the config
// the node was loaded with.
test('W-16 AI modify keeps inputs and settings changed after load', () => {
  const node = add('GEN_TEXT_TO_IMAGE', 'Image');
  S().updateNodeInput(node, 'prompt', { source: 'user', value: 'a red fox' });
  S().updateNodeSettings(node, { size: '1024x1024' });

  applyWorkflowToCanvas({
    nodes: [{ nodeId: node, type: 'GEN_TEXT_TO_IMAGE', action: 'modify', config: { style: 'photo' } }],
    edges: [],
  });

  const cfg = S().nodeConfigs[node];
  assert.equal(cfg.inputs.prompt?.value, 'a red fox', 'user input survives the AI modify');
  assert.equal(cfg.settings.size, '1024x1024', 'user setting survives the AI modify');
  assert.equal(cfg.settings.style, 'photo');
});

// W-19: when the API can save the whole document at once, the save is one
// request (not PATCH + PUT nodes + PUT edges).
test('W-19 save uses a single document request when available', async () => {
  add('TRIGGER_MANUAL', 'Trigger');
  const calls: string[] = [];
  const api = {
    async saveWorkflowDoc(_id: string, _body: unknown) {
      calls.push('doc');
      return { revision: 1 };
    },
    async updateWorkflow() {
      calls.push('patch');
      return null;
    },
    async updateNodes() {
      calls.push('nodes');
      return null;
    },
    async updateEdges() {
      calls.push('edges');
      return null;
    },
  };
  await saveWorkflowGraph({
    workflow: { id: 'wf-1', name: 'Defects', description: undefined },
    getState: S as never,
    api: api as never,
  });
  assert.deepEqual(calls, ['doc']);
});

// U-01: setting changes are undoable on their own.
test('U-01 a settings change is its own undo step', () => {
  const node = add('GEN_TEXT_TO_TEXT', 'LLM');
  S().updateNodeSettings(node, { systemPrompt: 'abc' });

  S().undo();
  assert.ok(S().nodes.some((n) => n.id === node), 'undo must not remove the node');
  assert.equal(S().nodeConfigs[node]?.settings?.systemPrompt, undefined, 'undo reverts the setting');

  S().redo();
  assert.equal(S().nodeConfigs[node]?.settings?.systemPrompt, 'abc');
});

// U-02: an edit after undo truncates the redo branch; redo must not wipe it.
test('U-02 redo after an edit does not discard the edit', () => {
  const a = add('GEN_TEXT_TO_TEXT', 'A');
  add('GEN_TEXT_TO_TEXT', 'B');
  S().undo();
  S().updateNodeSettings(a, { systemPrompt: 'typed after undo' });
  S().redo();
  assert.equal(S().nodeConfigs[a]?.settings?.systemPrompt, 'typed after undo');
});

// U-06: deleting a multi-node selection removes every selected node in one
// undo step.
test('U-06 deleting a multi selection removes all selected nodes, one undo restores them', () => {
  const a = add('GEN_TEXT_TO_TEXT', 'A');
  const b = add('GEN_TEXT_TO_TEXT', 'B', 300);
  const keep = add('GEN_TEXT_TO_TEXT', 'Keep', 600);
  S().selectNode(keep);
  S().onNodesChange([
    { id: a, type: 'select', selected: true },
    { id: b, type: 'select', selected: true },
  ]);
  (S() as unknown as { deleteSelection: () => void }).deleteSelection();
  const ids = S().nodes.map((n) => n.id);
  assert.deepEqual(ids, [keep]);

  S().undo();
  assert.deepEqual(new Set(S().nodes.map((n) => n.id)), new Set([a, b, keep]));
});
