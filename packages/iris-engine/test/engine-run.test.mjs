/**
 * WorkflowEngine runs against an in-memory store: v2 document reading, the
 * document snapshot run, graph warnings and cancellation reaching the HTTP
 * request in flight. Run with `pnpm --filter iris-engine test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  WorkflowEngine,
  abortableFetch,
  abortableSleep,
  runWithAbortSignal,
  requireStoredOutput,
  computeNodeCacheKey,
} from '../dist/index.js';

function memoryStore(workflow) {
  const s = {
    workflow,
    executions: new Map(),
    started: [],
    results: new Map(),
    logs: [],
    cachePuts: 0,
    async loadWorkflow(id) {
      return id === workflow.id ? structuredClone(workflow) : null;
    },
    async createExecution(input) {
      const id = `exec-${s.executions.size + 1}`;
      s.executions.set(id, { ...input, status: 'PENDING' });
      return { id, workflowId: input.workflowId, status: 'PENDING' };
    },
    async getExecutionResult(id) {
      const e = s.executions.get(id);
      return e ? { status: e.status, outputAssets: null, errorMessage: e.errorMessage ?? null } : null;
    },
    async updateExecutionStatus(id, status) {
      s.executions.get(id).status = status;
    },
    async finalizeExecution(id, detail) {
      Object.assign(s.executions.get(id), detail);
    },
    async startNodeResult(executionId, nodeId, inputData) {
      s.started.push({ nodeId, inputData });
    },
    async ensureNodeResult() {},
    async saveNodeResult(executionId, nodeId, result) {
      s.results.set(nodeId, result);
    },
    async updateNodeProgress() {},
    async appendLog(executionId, entry) {
      s.logs.push(entry);
    },
    async incrementWorkflowStats() {},
    async setWorkflowStatus() {},
    async getCachedResult() {
      return null;
    },
    async putCachedResult() {
      s.cachePuts++;
    },
    async deleteCachedResult() {},
  };
  return s;
}

const host = {
  media: {
    async storeOutput() {
      return { success: false, error: 'no storage' };
    },
    async downloadDecrypted() {
      throw new Error('no');
    },
    async getTempPublicUrlForAsset() {
      return { success: false };
    },
    async storePublic() {
      return { success: false };
    },
  },
  assets: { async getAssetById() { return null; } },
  workflow: { async listNodes() { return []; } },
  usage: {
    async checkNodeTokens() { return { allowed: true }; },
    async chargeNodeTokens() { return { success: true }; },
    async getBalance() { return 0; },
  },
  transcription: {},
  http: { allowPrivateNetwork: true },
};

const row = (nodeId, type, config = {}) => ({
  id: nodeId,
  nodeId,
  type,
  label: nodeId,
  config,
  inputPorts: [],
  outputPorts: [],
});

function waitFor(engine, event, pred = () => true) {
  return new Promise(resolve => {
    const on = payload => {
      if (!pred(payload)) return;
      engine.off(event, on);
      resolve(payload);
    };
    engine.on(event, on);
  });
}

test('abortableFetch / abortableSleep follow the run scope', async () => {
  const c = new AbortController();
  const sleeping = runWithAbortSignal(c.signal, () => abortableSleep(10_000));
  c.abort('cancelled');
  await assert.rejects(sleeping, err => err.code === 'CANCELLED');
  // Outside a run nothing changes.
  await abortableSleep(1);
});

test('requireStoredOutput fails only when the host forbids the inline fallback', () => {
  const failed = { success: false, error: 'disk full' };
  requireStoredOutput({ media: {} }, failed);
  requireStoredOutput({ media: { allowInlineFallback: true } }, failed);
  assert.throws(() => requireStoredOutput({ media: { allowInlineFallback: false } }, failed), /disk full/);
  requireStoredOutput({ media: { allowInlineFallback: false } }, { success: true });
});

test('asset content hashes replace ids in the cache key only when given', () => {
  const asset = { id: 'a1', type: 'IMAGE', path: '/x.png' };
  const base = { type: 'EDIT_IMAGE_UPSCALE', config: { inputs: { image: { source: 'storage', storageAssetId: 'a2' } } }, inputs: { image: asset } };
  const plain = computeNodeCacheKey(base);
  assert.equal(computeNodeCacheKey({ ...base, assetHashes: new Map() }), plain);
  const h1 = computeNodeCacheKey({ ...base, assetHashes: new Map([['a1', 'sha-1'], ['a2', 'sha-2']]) });
  const h2 = computeNodeCacheKey({ ...base, assetHashes: new Map([['a1', 'sha-1b'], ['a2', 'sha-2']]) });
  assert.notEqual(h1, plain);
  assert.notEqual(h1, h2, 'new bytes under the same id give a new key');
});

test('a v1 config-only node link is run as an edge; dropped edges are logged', async () => {
  const store = memoryStore({
    id: 'wf',
    name: 'v1',
    userId: 'u',
    nodes: [
      row('t', 'TRIGGER_MANUAL'),
      row('tpl', 'UTIL_TEMPLATE', {
        settings: {},
        inputs: { template: { source: 'node', nodeId: 't', outputName: 'text' } },
      }),
    ],
    edges: [{ edgeId: 'dangling', sourceNodeId: 't', targetNodeId: 'ghost', sourceHandle: 'text', targetHandle: 'input' }],
  });
  const engine = new WorkflowEngine(store, host);
  const done = waitFor(engine, 'execution:completed');
  const started = waitFor(engine, 'execution:started');
  await engine.execute('wf', 'u', { inputs: {}, trigger: { type: 'manual', data: { inputValue: 'hello' } } });
  const startEvent = await started;
  await done;
  assert.match(startEvent.docHash, /^[0-9a-f]{64}$/);
  const tplStart = store.started.find(s => s.nodeId === 'tpl');
  assert.equal(tplStart.inputData.template, 'hello', 'the link delivered the trigger text');
  assert.ok(
    store.logs.some(l => l.eventType === 'GRAPH_WARNING' && l.message.includes('dangling')),
    JSON.stringify(store.logs.map(l => l.eventType)),
  );
});

test('a document snapshot runs instead of the stored graph', async () => {
  const store = memoryStore({ id: 'wf', name: 'stored', userId: 'u', nodes: [row('t', 'TRIGGER_MANUAL')], edges: [] });
  const engine = new WorkflowEngine(store, host);
  const done = waitFor(engine, 'execution:completed');
  await engine.execute('wf', 'u', {
    trigger: { type: 'manual', data: { inputValue: 'snap' } },
    doc: {
      schemaVersion: 2,
      id: 'wf',
      name: 'screen',
      revision: 3,
      nodes: [
        { id: 't', type: 'TRIGGER_MANUAL', label: 't', position: { x: 0, y: 0 }, config: { settings: {}, inputs: {}, outputs: {} } },
        { id: 'tpl', type: 'UTIL_TEMPLATE', label: 'tpl', position: { x: 0, y: 0 }, config: { settings: {}, inputs: {}, outputs: {} } },
      ],
      edges: [{ id: 'e', source: 't', sourceHandle: 'text', target: 'tpl', targetHandle: 'template' }],
    },
  });
  await done;
  assert.deepEqual(store.started.map(s => s.nodeId), ['t', 'tpl']);
  assert.equal(store.started[1].inputData.template, 'snap');
});

test('cancel aborts the HTTP request in flight and nothing is cached', async () => {
  let closed;
  const requestClosed = new Promise(r => (closed = r));
  let arrived;
  const requestArrived = new Promise(r => (arrived = r));
  const server = http.createServer((req, res) => {
    arrived();
    req.socket.on('close', () => closed(Date.now()));
    // never answers
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/slow`;
  try {
    const store = memoryStore({
      id: 'wf',
      name: 'cancel',
      userId: 'u',
      nodes: [row('t', 'TRIGGER_MANUAL'), row('get', 'UTIL_HTTP_REQUEST', { settings: { url, method: 'GET' } })],
      edges: [{ edgeId: 'e', sourceNodeId: 't', targetNodeId: 'get', sourceHandle: 'trigger', targetHandle: 'trigger' }],
    });
    const engine = new WorkflowEngine(store, host);
    const done = waitFor(engine, 'execution:completed');
    const exec = await engine.execute('wf', 'u', { trigger: { type: 'manual', data: {} } });
    await requestArrived;
    const cancelledAt = Date.now();
    assert.equal(await engine.cancel(exec.id), true);
    const closedAt = await requestClosed;
    assert.ok(closedAt - cancelledAt < 2000, 'the socket closed right after cancel');
    const final = await done;
    assert.equal(final.status, 'cancelled');
    assert.equal(store.executions.get(exec.id).status, 'CANCELLED');
    assert.equal(store.cachePuts, 0);
    const getResult = store.results.get('get');
    assert.ok(!getResult || getResult.status !== 'completed' || getResult.outputs?.status !== 200);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test('a provider request is aborted when the run is cancelled (deepseek adapter)', async () => {
  const { createAndInitializeAdapter } = await import('../dist/index.js');
  const realFetch = globalThis.fetch;
  const signals = [];
  globalThis.fetch = (url, init) => {
    signals.push(init?.signal);
    return new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
      );
    });
  };
  try {
    const adapter = await createAndInitializeAdapter('deepseek', { apiKey: 'test-key' });
    const run = new AbortController();
    const pending = runWithAbortSignal(run.signal, () =>
      adapter.execute({ capability: 'text-to-text', prompt: 'hi', model: 'deepseek-chat' }),
    );
    await new Promise(r => setImmediate(r));
    assert.equal(signals.length, 1, 'the provider request was sent');
    assert.equal(signals[0].aborted, false);
    run.abort('cancelled');
    // The adapter either rejects with the abort or returns a failed response.
    const outcome = await pending.then(r => r, e => e);
    assert.equal(signals[0].aborted, true, 'the provider request saw the abort');
    assert.ok(outcome?.name === 'AbortError' || outcome?.success === false);
  } finally {
    globalThis.fetch = realFetch;
  }
});
