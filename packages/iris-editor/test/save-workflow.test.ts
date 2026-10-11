// Save vs. concurrent edits. Runs on Node's built-in type stripping
// (Node 22.18+ / 23.6+): `node --test test/save-workflow.test.ts`.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useIrisEditorStore } from '../src/store/iris-editor.ts';
import { saveWorkflowGraph } from '../src/orchestrator/save-workflow.ts';

const WORKFLOW = { id: 'wf-1', name: 'Test', description: undefined };

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface Calls {
  nodes: unknown[][];
  edges: unknown[][];
}

/** Fake API whose PUT nodes waits for `gate` (if given) before resolving. */
function fakeApi(gate?: Promise<void>) {
  const calls: Calls = { nodes: [], edges: [] };
  const api = {
    async updateWorkflow() {
      return null;
    },
    async updateNodes(_id: string, nodes: unknown[]) {
      calls.nodes.push(nodes);
      if (gate) await gate;
      return null;
    },
    async updateEdges(_id: string, edges: unknown[]) {
      calls.edges.push(edges);
      return null;
    },
  };
  return { api, calls };
}

function startEditing() {
  const store = useIrisEditorStore.getState();
  store.resetEditor();
  useIrisEditorStore.getState().initWorkflow(WORKFLOW.id, WORKFLOW.name);
  useIrisEditorStore.getState().addNode('TRIGGER_MANUAL', { x: 0, y: 0 }, { type: 'TRIGGER_MANUAL', label: 'Trigger' });
  assert.equal(useIrisEditorStore.getState().isDirty, true);
}

beforeEach(() => {
  startEditing();
});

test('save without concurrent edits clears isDirty', async () => {
  const { api, calls } = fakeApi();
  const result = await saveWorkflowGraph({ workflow: WORKFLOW, getState: useIrisEditorStore.getState, api });

  assert.equal(result.upToDate, true);
  assert.equal(result.status, 'ACTIVE');
  assert.equal(useIrisEditorStore.getState().isDirty, false);
  assert.equal(calls.nodes[0].length, 1);
});

test('an edit made while the save is in flight keeps isDirty', async () => {
  const gate = deferred();
  const { api, calls } = fakeApi(gate.promise);
  const saving = saveWorkflowGraph({ workflow: WORKFLOW, getState: useIrisEditorStore.getState, api });

  // The save has sent PUT nodes with the one-node snapshot; the user adds a node.
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.nodes.length, 1);
  useIrisEditorStore.getState().addNode('UTIL_TRANSFORM', { x: 200, y: 0 }, { type: 'UTIL_TRANSFORM', label: 'Transform' });
  gate.resolve();

  const result = await saving;
  assert.equal(result.upToDate, false);
  assert.equal(calls.nodes[0].length, 1, 'the save sent the snapshot taken at its start');
  assert.equal(useIrisEditorStore.getState().nodes.length, 2);
  assert.equal(useIrisEditorStore.getState().isDirty, true, 'the unsaved edit must stay dirty');

  // A second save picks up the edit and clears isDirty.
  const again = await saveWorkflowGraph({ workflow: WORKFLOW, getState: useIrisEditorStore.getState, api: fakeApi().api });
  assert.equal(again.upToDate, true);
  assert.equal(useIrisEditorStore.getState().isDirty, false);
});

test('a config edit during the save keeps isDirty', async () => {
  const gate = deferred();
  const { api } = fakeApi(gate.promise);
  const nodeId = useIrisEditorStore.getState().nodes[0].id;
  const saving = saveWorkflowGraph({ workflow: WORKFLOW, getState: useIrisEditorStore.getState, api });

  await new Promise((r) => setImmediate(r));
  useIrisEditorStore.getState().updateNodeSettings(nodeId, { text: 'changed' });
  gate.resolve();

  assert.equal((await saving).upToDate, false);
  assert.equal(useIrisEditorStore.getState().isDirty, true);
});

test('selecting nodes or edges during the save does not keep isDirty', async () => {
  const gate = deferred();
  const { api } = fakeApi(gate.promise);
  const nodeId = useIrisEditorStore.getState().nodes[0].id;
  const saving = saveWorkflowGraph({ workflow: WORKFLOW, getState: useIrisEditorStore.getState, api });

  await new Promise((r) => setImmediate(r));
  const store = useIrisEditorStore.getState();
  store.selectNode(nodeId);
  store.onNodesChange([{ type: 'select', id: nodeId, selected: true }]);
  store.onEdgesChange([{ type: 'select', id: 'no-such-edge', selected: true }]);
  gate.resolve();

  assert.equal((await saving).upToDate, true);
  assert.equal(useIrisEditorStore.getState().isDirty, false);
});

test('a failed save keeps isDirty', async () => {
  const gate = deferred();
  const { api } = fakeApi(gate.promise);
  const saving = saveWorkflowGraph({ workflow: WORKFLOW, getState: useIrisEditorStore.getState, api });

  await new Promise((r) => setImmediate(r));
  gate.reject(new Error('network down'));

  await assert.rejects(saving, /network down/);
  assert.equal(useIrisEditorStore.getState().isDirty, true);
});

test('every edit bumps editRevision; selection does not', () => {
  const store = useIrisEditorStore.getState();
  const nodeId = store.nodes[0].id;
  const before = useIrisEditorStore.getState().editRevision;

  store.onNodesChange([{ type: 'select', id: nodeId, selected: true }]);
  assert.equal(useIrisEditorStore.getState().editRevision, before);

  store.onNodesChange([{ type: 'position', id: nodeId, position: { x: 5, y: 5 } }]);
  assert.equal(useIrisEditorStore.getState().editRevision, before + 1);

  store.setDirty(false);
  assert.equal(useIrisEditorStore.getState().editRevision, before + 1);
  assert.equal(useIrisEditorStore.getState().markSaved(before), false, 'stale revision');
});
