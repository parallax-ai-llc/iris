// Command history and document commands of the editor store (04 3.4~3.5,
// 07 C2/C3). Run: node --import ./test/ts-resolve.mjs --test test/store-commands.test.ts
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWorkflowDoc } from 'iris-nodes';
import { createIrisEditorStore, useIrisEditorStore } from '../src/store/iris-editor.ts';
import { DocHistory, ROOT_ENTRY_ID } from '../src/history/history.ts';
import { applyWorkflowToCanvas } from '../src/utils/workflow-parser.ts';

const S = () => useIrisEditorStore.getState();
const snapshot = () => JSON.stringify(normalizeWorkflowDoc(S().doc));

function add(type: string, label = type, x = 0): string {
  return S().addNode(type, { x, y: 0 }, { type, label });
}

beforeEach(() => {
  S().resetEditor();
  S().initWorkflow('wf', 'Commands');
});

test('DocHistory: merge window, transactions, rollback, dirty by entry id', () => {
  let now = 0;
  let doc = 0;
  const h = new DocHistory<number>(() => doc, (d) => (doc = d), { now: () => now });
  const set = (to: number, mergeKey?: string) => {
    const from = doc;
    h.execute({ label: 'set', do: () => to, undo: () => from, bytes: 8, mergeKey });
  };
  assert.equal(h.isDirty, false);
  set(1, 'k');
  now = 500;
  set(2, 'k');
  assert.equal(h.list().length, 1, 'typing within 1 s merges');
  now = 2000;
  set(3, 'k');
  assert.equal(h.list().length, 2, 'after 1 s a new step starts');
  h.breakMerge();
  set(4, 'k');
  assert.equal(h.list().length, 3, 'breakMerge (blur) starts a new step');

  h.markSaved(h.headEntryId);
  assert.equal(h.isDirty, false);
  h.undo();
  assert.equal(h.isDirty, true);
  h.redo();
  assert.equal(h.isDirty, false, 'back at the saved entry is clean');

  h.begin('batch');
  set(10);
  set(11);
  h.commit();
  assert.equal(doc, 11);
  assert.equal(h.list().length, 4, 'a transaction is one entry');
  h.undo();
  assert.equal(doc, 4);

  h.begin('discard');
  set(99);
  h.rollback();
  assert.equal(doc, 4);
  assert.equal(h.canRedo, true, 'rollback leaves no entry and keeps redo');
});

test('DocHistory: trimming keeps the saved point meaningful', () => {
  let doc = 0;
  const h = new DocHistory<number>(() => doc, (d) => (doc = d), { maxEntries: 2 });
  const set = (to: number) => {
    const from = doc;
    h.execute({ label: 's', do: () => to, undo: () => from, bytes: 1 });
  };
  assert.equal(h.savedEntryId, ROOT_ENTRY_ID);
  set(1);
  set(2);
  set(3); // root state 0 is gone
  assert.equal(h.savedEntryId, null);
  assert.equal(h.isDirty, true);
});

test('every command: do -> undo restores the document, redo restores the result (C2 property)', () => {
  const a = add('TRIGGER_MANUAL', 'T');
  const b = add('GEN_TEXT_TO_TEXT', 'LLM', 300);
  const c = add('UTIL_ROUTER', 'Router', 600);
  const actions: Array<[string, () => void]> = [
    ['addNode', () => add('UTIL_TRANSFORM', 'X', 900)],
    ['connect', () => S().onConnect({ source: a, sourceHandle: 'text', target: b, targetHandle: 'prompt' })],
    ['settings', () => S().updateNodeSettings(b, { systemPrompt: 'hi' })],
    ['input', () => S().updateNodeInput(b, 'context', { source: 'user', value: 'v' })],
    ['output', () => S().updateNodeOutput(b, 'text', { variableName: 'answer', saveToStorage: false })],
    ['rename', () => S().updateNode(b, { label: 'Renamed' })],
    ['move', () => S().moveNodes({ [b]: { x: 5, y: 6 } })],
    ['routes', () => S().updateNodeSettings(c, { routes: '[{"name":"r1","condition":"true"}]' })],
    ['duplicate', () => S().duplicateNode(b)],
    ['deleteNode', () => S().deleteNode(c)],
  ];
  for (const [name, act] of actions) {
    S().history.breakMerge();
    const before = snapshot();
    act();
    const after = snapshot();
    assert.notEqual(after, before, `${name} changed the document`);
    S().undo();
    assert.equal(snapshot(), before, `${name}: undo restores`);
    S().redo();
    assert.equal(snapshot(), after, `${name}: redo restores`);
  }
});

test('typing in one field is one undo step; another field starts a new one', () => {
  const n = add('GEN_TEXT_TO_TEXT', 'LLM');
  const steps = S().history.list().length;
  for (const value of ['a', 'ab', 'abc']) S().updateNodeSettings(n, { systemPrompt: value });
  assert.equal(S().history.list().length, steps + 1);
  S().updateNodeSettings(n, { temperature: 0.5 });
  assert.equal(S().history.list().length, steps + 2);
  S().undo();
  S().undo();
  assert.equal(S().nodeConfigs[n].settings.systemPrompt, undefined);
});

test('scenario: type "abc", drag another node, undo twice, redo brings the text back (04 7장)', () => {
  const n = add('GEN_TEXT_TO_TEXT', 'LLM');
  const other = add('UTIL_TRANSFORM', 'Other', 300);
  for (const value of ['a', 'ab', 'abc']) S().updateNodeSettings(n, { systemPrompt: value });
  S().onNodesChange([{ id: other, type: 'position', position: { x: 350, y: 10 }, dragging: true }]);
  S().onNodesChange([{ id: other, type: 'position', position: { x: 400, y: 20 }, dragging: true }]);
  S().onNodesChange([{ id: other, type: 'position', position: { x: 400, y: 20 }, dragging: false }]);
  assert.deepEqual(S().doc.nodes.find((x) => x.id === other)?.position, { x: 400, y: 20 });
  S().undo();
  assert.deepEqual(S().doc.nodes.find((x) => x.id === other)?.position, { x: 300, y: 0 }, 'first undo: the drag');
  assert.equal(S().nodeConfigs[n].settings.systemPrompt, 'abc');
  S().undo();
  assert.equal(S().nodeConfigs[n].settings.systemPrompt, undefined, 'second undo: the typing');
  S().redo();
  assert.equal(S().nodeConfigs[n].settings.systemPrompt, 'abc');
});

test('selection and size changes are not edits', () => {
  const n = add('GEN_TEXT_TO_TEXT', 'LLM');
  S().setDirty(false);
  const rev = S().editRevision;
  S().onNodesChange([{ id: n, type: 'select', selected: true }]);
  S().onNodesChange([{ id: n, type: 'dimensions', dimensions: { width: 200, height: 80 } }]);
  assert.equal(S().isDirty, false);
  assert.equal(S().editRevision, rev);
  assert.equal(S().nodes[0].selected, true);
});

test('refused connections change nothing (type mismatch, cycle, unknown port)', () => {
  const t = add('TRIGGER_MANUAL', 'T');
  const img = add('GEN_TEXT_TO_IMAGE', 'Img', 300);
  const a = add('UTIL_TRANSFORM', 'A', 600);
  const b = add('UTIL_TRANSFORM', 'B', 900);
  const before = snapshot();
  assert.equal(S().onConnect({ source: t, sourceHandle: 'image', target: img, targetHandle: 'prompt' }).ok, false);
  assert.equal(S().onConnect({ source: t, sourceHandle: 'nope', target: img, targetHandle: 'prompt' }).ok, false);
  S().onConnect({ source: a, sourceHandle: 'output', target: b, targetHandle: 'input' });
  const r = S().onConnect({ source: b, sourceHandle: 'output', target: a, targetHandle: 'input' });
  assert.deepEqual(r, { ok: false, reason: 'cycle' });
  assert.equal(S().edges.length, 1);
  assert.equal(S().checkConnection({ source: t, sourceHandle: 'text', target: img, targetHandle: 'prompt' }).ok, true);
  assert.notEqual(snapshot(), before);
});

test('copy + paste: only internal edges, new ids, no secrets, one undo step', () => {
  const t = add('TRIGGER_MANUAL', 'T');
  const a = add('GEN_TEXT_TO_TEXT', 'A', 300);
  const b = add('GEN_TEXT_TO_IMAGE', 'B', 600);
  S().onConnect({ source: t, sourceHandle: 'text', target: a, targetHandle: 'prompt' });
  S().onConnect({ source: a, sourceHandle: 'text', target: b, targetHandle: 'prompt' });
  S().updateNodeSettings(a, { apiKeyOverride: 'sk-secret', systemPrompt: 'keep' });
  S().onNodesChange([
    { id: a, type: 'select', selected: true },
    { id: b, type: 'select', selected: true },
  ]);
  const fragment = S().copySelection();
  assert.ok(fragment);
  assert.equal(fragment.nodes.length, 2);
  assert.equal(fragment.edges.length, 1, 'the edge from the trigger stays behind');
  assert.equal(fragment.nodes.find((n) => n.id === a)?.config.settings.apiKeyOverride, undefined);

  const steps = S().history.list().length;
  const result = S().pasteFragment(JSON.parse(JSON.stringify(fragment)), { x: 1000, y: 1000 });
  assert.equal(result.nodeIds.length, 2);
  assert.equal(S().history.list().length, steps + 1);
  for (const id of result.nodeIds) assert.ok(![t, a, b].includes(id));
  const pastedEdges = S().edges.filter((e) => result.nodeIds.includes(e.target));
  assert.equal(pastedEdges.length, 1);
  assert.ok(result.nodeIds.includes(pastedEdges[0].source));
  assert.deepEqual(new Set(S().getSelectedNodeIds()), new Set(result.nodeIds), 'pasted nodes become the selection');
  S().undo();
  assert.equal(S().doc.nodes.length, 3);
});

test('paste is untrusted: unknown types and a second trigger are skipped', () => {
  add('TRIGGER_MANUAL', 'T');
  const result = S().pasteFragment({
    kind: 'iris-workflow-fragment',
    schemaVersion: 2,
    nodes: [
      { id: 'x', type: 'TRIGGER_WEBHOOK', label: 'x', position: { x: 0, y: 0 }, config: { settings: {}, inputs: {}, outputs: {} } },
      { id: 'y', type: 'NOT_A_NODE', label: 'y', position: { x: 0, y: 0 }, config: { settings: {}, inputs: {}, outputs: {} } },
      { id: 'z', type: 'UTIL_TRANSFORM', label: 'z', position: { x: 0, y: 0 }, config: { settings: {}, inputs: {}, outputs: {} } },
    ],
    edges: [{ id: 'e', source: 'outside', sourceHandle: 'output', target: 'z', targetHandle: 'input' }],
  });
  assert.equal(result.nodeIds.length, 1);
  assert.equal(result.skippedTrigger, true);
  assert.deepEqual(result.skippedTypes, ['NOT_A_NODE']);
  assert.equal(S().edges.length, 0, 'edges to nodes outside the fragment are dropped');
  assert.equal(S().pasteFragment('not a fragment').nodeIds.length, 0);
});

test('AI apply is one undo step and goes through the connection rules', () => {
  const t = add('TRIGGER_MANUAL', 'T');
  const steps = S().history.list().length;
  const before = snapshot();
  const result = applyWorkflowToCanvas({
    nodes: [
      { nodeId: 'n1', type: 'GEN_TEXT_TO_TEXT', label: 'LLM' },
      { nodeId: 'n2', type: 'GEN_TEXT_TO_IMAGE', label: 'Img' },
      { nodeId: t, type: 'TRIGGER_MANUAL', action: 'modify', position: { x: 40, y: 40 } },
    ],
    edges: [
      { sourceNodeId: t, sourceHandle: 'text', targetNodeId: 'n1', targetHandle: 'prompt' },
      { sourceNodeId: 'n1', sourceHandle: 'text', targetNodeId: 'n2', targetHandle: 'prompt' },
      { sourceNodeId: t, sourceHandle: 'image', targetNodeId: 'n1', targetHandle: 'context' },
    ],
  });
  assert.equal(result.nodesCreated, 2);
  assert.equal(result.edgesCreated, 2);
  assert.equal(result.warnings.length, 1, 'the image -> text edge is refused');
  assert.equal(S().history.list().length, steps + 1);
  S().undo();
  assert.equal(snapshot(), before);
});

test('dirty follows the saved entry: undo back to it is clean (07 C3)', () => {
  const n = add('GEN_TEXT_TO_TEXT', 'LLM');
  S().markSavedEntry(S().history.headEntryId);
  assert.equal(S().isDirty, false);
  S().updateNodeSettings(n, { systemPrompt: 'x' });
  assert.equal(S().isDirty, true);
  S().undo();
  assert.equal(S().isDirty, false);
});

test('orphan connections are reported by id and cleaned up in one step', () => {
  S().initDoc({
    schemaVersion: 2,
    id: 'wf',
    name: 'orphans',
    revision: 4,
    nodes: [
      { id: 'r', type: 'UTIL_ROUTER', label: 'r', position: { x: 0, y: 0 }, config: { settings: {}, inputs: {}, outputs: {} } },
      { id: 'n', type: 'UTIL_TRANSFORM', label: 'n', position: { x: 0, y: 0 }, config: { settings: {}, inputs: {}, outputs: {} } },
    ],
    edges: [{ id: 'gone-port', source: 'r', sourceHandle: 'old-route', target: 'n', targetHandle: 'input' }],
  });
  assert.equal(S().baseRevision, 4);
  assert.ok(S().graphIssues.some((i) => i.edgeId === 'gone-port' && i.code === 'unknown-port'));
  assert.equal(S().cleanupOrphanEdges(), 1);
  assert.equal(S().edges.length, 0);
  S().undo();
  assert.equal(S().edges.length, 1);
});

test('stores are independent (one per open document)', () => {
  const one = createIrisEditorStore();
  const two = createIrisEditorStore();
  one.getState().initWorkflow('a', 'A');
  two.getState().initWorkflow('b', 'B');
  one.getState().addNode('UTIL_TRANSFORM', { x: 0, y: 0 }, { label: 'x' });
  assert.equal(one.getState().nodes.length, 1);
  assert.equal(two.getState().nodes.length, 0);
  assert.equal(two.getState().history.canUndo, false);
});

test('undo brings deleted nodes back selected (U-09)', () => {
  const a = add('UTIL_TRANSFORM', 'A');
  S().deleteNode(a);
  S().undo();
  assert.equal(S().selectedNodeId, a);
  assert.equal(S().nodes.find((n) => n.id === a)?.selected, true);
});

test('IrisEditorStoreProvider: hooks read the provided per-document store, else the default', async () => {
  const { createElement } = await import('react');
  const { renderToString } = await import('react-dom/server');
  const { IrisEditorStoreProvider, useIrisEditorStoreApi, irisEditorStore } = await import('../src/store/iris-editor.ts');
  const tab = createIrisEditorStore();
  let seen: unknown = null;
  function Probe() {
    seen = useIrisEditorStoreApi();
    useIrisEditorStore((s) => s.workflowName);
    return null;
  }
  renderToString(createElement(IrisEditorStoreProvider, { store: tab }, createElement(Probe)));
  assert.equal(seen, tab);
  renderToString(createElement(Probe));
  assert.equal(seen, irisEditorStore);
});

test('applyWorkflowToCanvas changes only the store it is given, as one undo step', () => {
  const tab = createIrisEditorStore();
  tab.getState().initWorkflow('tab', 'Tab');
  const defaultBefore = snapshot();
  const result = applyWorkflowToCanvas(
    {
      nodes: [
        { nodeId: 'a', type: 'TRIGGER_MANUAL', label: 'Start', position: { x: 0, y: 0 } },
        { nodeId: 'b', type: 'GEN_TEXT_TO_TEXT', label: 'LLM', position: { x: 200, y: 0 } },
      ],
      edges: [{ sourceNodeId: 'a', sourceHandle: 'text', targetNodeId: 'b', targetHandle: 'prompt' }],
    } as never,
    tab,
  );
  assert.equal(result.nodesCreated, 2);
  assert.equal(tab.getState().doc.nodes.length, 2);
  assert.equal(tab.getState().doc.edges.length, 1);
  assert.equal(snapshot(), defaultBefore, 'the default store is untouched');
  assert.deepEqual(tab.getState().history.list().map((e) => e.label), ['Apply AI changes']);
  tab.getState().undo();
  assert.equal(tab.getState().doc.nodes.length, 0);
  tab.getState().redo();
  assert.equal(tab.getState().doc.edges.length, 1);
});
