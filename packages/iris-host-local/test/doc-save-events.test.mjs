/**
 * Stage 3 of 04-workflow-editor.md: old data opens, one-request document save
 * with revision (409 on a stale base), atomic writes under concurrent GET/PUT,
 * interrupted-run cleanup at start, and the SSE execution event stream.
 * Run with `pnpm --filter iris-host-local test` (builds first; imports `dist/`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildServer, LocalWorkflowStore, INTERRUPTED_MESSAGE } from '../dist/index.js';

const HOST = 'localhost:4747';

function config(dataDir) {
  return { port: 4747, host: '127.0.0.1', dataDir, openBrowser: false, configuredProviders: [] };
}

function tempDir() {
  return mkdtempSync(path.join(tmpdir(), 'iris-flow-stage3-'));
}

const v1Workflow = {
  id: 'old-1',
  name: 'Saved by an old version',
  userId: 'local',
  status: 'DRAFT',
  nodes: [
    { id: 't', nodeId: 't', type: 'TRIGGER_MANUAL', label: 'Start', config: {}, inputPorts: [], outputPorts: [], position: { x: 1, y: 2 } },
    {
      id: 'tpl',
      nodeId: 'tpl',
      type: 'UTIL_TEMPLATE',
      label: 'Template',
      config: { settings: {}, inputs: { template: { source: 'node', nodeId: 't', outputName: 'text' } } },
      inputPorts: [],
      outputPorts: [],
    },
  ],
  edges: [],
  totalExecutions: 0,
  successfulRuns: 0,
  failedRuns: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function seedV1(dataDir) {
  mkdirSync(path.join(dataDir, 'workflows'), { recursive: true });
  writeFileSync(path.join(dataDir, 'workflows', 'old-1.json'), JSON.stringify(v1Workflow, null, 2));
}

test('a v1 workflow file opens through the REST API (node link comes back as an edge)', async () => {
  const dataDir = tempDir();
  seedV1(dataDir);
  const app = await buildServer(config(dataDir));
  try {
    const res = await app.inject({ method: 'GET', url: '/api/iris/workflows/old-1', headers: { host: HOST } });
    assert.equal(res.statusCode, 200);
    const wf = res.json().workflow;
    assert.equal(wf.revision, 0);
    assert.deepEqual(
      wf.edges.map(e => [e.sourceNodeId, e.sourceHandle, e.targetNodeId, e.targetHandle]),
      [['t', 'text', 'tpl', 'template']],
    );
    const doc = (await app.inject({ method: 'GET', url: '/api/iris/workflows/old-1/doc', headers: { host: HOST } })).json().doc;
    assert.equal(doc.schemaVersion, 2);
    assert.deepEqual(doc.nodes.find(n => n.id === 't').position, { x: 1, y: 2 });
    // Reading never rewrites the user's file.
    assert.deepEqual(JSON.parse(readFileSync(path.join(dataDir, 'workflows', 'old-1.json'), 'utf8')), v1Workflow);
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('PUT /workflows/:id saves a whole document once; a stale baseRevision gets 409', async () => {
  const dataDir = tempDir();
  seedV1(dataDir);
  const app = await buildServer(config(dataDir));
  try {
    const get = async () => (await app.inject({ method: 'GET', url: '/api/iris/workflows/old-1/doc', headers: { host: HOST } })).json().doc;
    const doc = await get();
    doc.name = 'Renamed';
    doc.nodes[0].position = { x: 50, y: 60 };
    const put = body => app.inject({ method: 'PUT', url: '/api/iris/workflows/old-1', headers: { host: HOST }, payload: body });

    const ok = await put({ doc, baseRevision: 0 });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal(ok.json().revision, 1);
    const saved = await get();
    assert.equal(saved.name, 'Renamed');
    assert.equal(saved.revision, 1);
    assert.deepEqual(saved.nodes.find(n => n.id === 't').position, { x: 50, y: 60 });

    const stale = await put({ doc, baseRevision: 0 });
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.json().code, 'REVISION_CONFLICT');
    assert.equal(stale.json().revision, 1);
    assert.equal((await get()).revision, 1, 'a rejected save writes nothing');

    // The old split saves still bump the revision, so they conflict too.
    await app.inject({ method: 'PUT', url: '/api/iris/workflows/old-1/edges', headers: { host: HOST }, payload: { edges: [] } });
    assert.equal((await put({ doc: saved, baseRevision: 1 })).statusCode, 409);
    assert.equal((await put({ doc: saved })).statusCode, 200, 'no baseRevision = overwrite');
    assert.equal((await put({})).statusCode, 400);
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('concurrent saves and reads never see a torn file; no temp files remain', async () => {
  const dataDir = tempDir();
  seedV1(dataDir);
  const store = new LocalWorkflowStore(dataDir);
  const big = {
    ...v1Workflow,
    nodes: Array.from({ length: 300 }, (_, i) => ({
      id: `n${i}`,
      type: 'UTIL_TRANSFORM',
      label: 'x'.repeat(200),
      position: { x: i, y: i },
      config: { settings: { note: 'y'.repeat(500) }, inputs: {}, outputs: {} },
    })),
    edges: [],
  };
  const writes = Array.from({ length: 30 }, (_, i) => store.saveDoc('old-1', { ...big, name: `v${i}` }));
  const reads = Array.from({ length: 200 }, () => store.getWorkflow('old-1'));
  const results = await Promise.all([...writes, ...reads]);
  for (const r of results.slice(30)) assert.ok(r && Array.isArray(r.nodes), 'every read parsed');
  const final = await store.getWorkflow('old-1');
  assert.equal(final.revision, 30);
  assert.equal(final.nodes.length, 300);
  assert.deepEqual(readdirSync(path.join(dataDir, 'workflows')).filter(f => f.endsWith('.tmp')), []);
  rmSync(dataDir, { recursive: true, force: true });
});

test('runs left RUNNING by a dead engine are closed as INTERRUPTED at start', async () => {
  const dataDir = tempDir();
  mkdirSync(path.join(dataDir, 'executions'), { recursive: true });
  const base = {
    workflowId: 'w', userId: 'local', triggerType: 'MANUAL', triggerData: {}, inputData: {},
    outputAssets: [], totalTokensUsed: 0, estimatedCost: 0, errorMessage: null, logs: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  writeFileSync(path.join(dataDir, 'executions', 'r1.json'), JSON.stringify({
    ...base, id: 'r1', status: 'RUNNING',
    nodeResults: { a: { nodeId: 'a', status: 'COMPLETED' }, b: { nodeId: 'b', status: 'RUNNING' } },
  }));
  writeFileSync(path.join(dataDir, 'executions', 'r2.json'), JSON.stringify({ ...base, id: 'r2', status: 'COMPLETED', nodeResults: {} }));
  const app = await buildServer(config(dataDir));
  try {
    const r1 = (await app.inject({ method: 'GET', url: '/api/iris/executions/r1/status', headers: { host: HOST } })).json();
    assert.equal(r1.status, 'FAILED');
    assert.equal(r1.errorMessage, INTERRUPTED_MESSAGE);
    const nodes = (await app.inject({ method: 'GET', url: '/api/iris/executions/r1/nodes', headers: { host: HOST } })).json().nodeResults;
    assert.equal(nodes.find(n => n.nodeId === 'a').status, 'COMPLETED');
    assert.equal(nodes.find(n => n.nodeId === 'b').status, 'FAILED');
    const r2 = (await app.inject({ method: 'GET', url: '/api/iris/executions/r2/status', headers: { host: HOST } })).json();
    assert.equal(r2.status, 'COMPLETED');
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

function readSse(url, headers) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers }, res => {
      let buf = '';
      const events = [];
      res.setEncoding('utf8');
      res.on('data', chunk => {
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const data = block.split('\n').find(l => l.startsWith('data: '));
          if (data) events.push(JSON.parse(data.slice(6)));
        }
      });
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], events }));
    });
    req.on('error', reject);
  });
}

test('SSE streams numbered run events, runs the posted document, and resumes after a seq', async () => {
  const dataDir = tempDir();
  seedV1(dataDir);
  const app = await buildServer(config(dataDir));
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = app.server.address().port;
  const headers = { host: `localhost:${port}` };
  try {
    const doc = (await app.inject({ method: 'GET', url: '/api/iris/workflows/old-1/doc', headers })).json().doc;
    const exec = await app.inject({
      method: 'POST',
      url: '/api/iris/workflows/old-1/execute',
      headers,
      payload: { trigger: { type: 'manual', data: { inputValue: 'from the screen' } }, doc },
    });
    assert.equal(exec.statusCode, 200, exec.body);
    const id = exec.json().executionId;
    const all = await readSse(`http://127.0.0.1:${port}/api/iris/executions/${id}/events`, headers);
    assert.equal(all.status, 200);
    assert.match(all.type, /text\/event-stream/);
    const kinds = all.events.map(e => e.t);
    assert.equal(kinds[0], 'exec.started');
    assert.equal(kinds[kinds.length - 1], 'exec.finished');
    assert.equal(all.events[all.events.length - 1].status, 'COMPLETED');
    assert.match(all.events[0].docHash, /^[0-9a-f]{64}$/);
    const tpl = all.events.find(e => e.t === 'node.finished' && e.nodeId === 'tpl');
    assert.equal(tpl.status, 'completed');
    assert.equal(tpl.outputs.result.kind, 'text');
    assert.equal(tpl.outputs.result.preview, 'from the screen');
    all.events.forEach((e, i) => assert.equal(e.seq, i + 1));

    const resumed = await readSse(`http://127.0.0.1:${port}/api/iris/executions/${id}/events?after=2`, headers);
    assert.deepEqual(resumed.events.map(e => e.seq), all.events.slice(2).map(e => e.seq));

    const full = await app.inject({ method: 'GET', url: `/api/iris/executions/${id}/nodes/tpl/output/result`, headers });
    assert.equal(full.json().value, 'from the screen');
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('POST /workflows takes an embedder-chosen id once (desktop document id)', async () => {
  const dataDir = tempDir();
  const app = await buildServer(config(dataDir));
  try {
    const post = body => app.inject({ method: 'POST', url: '/api/iris/workflows', headers: { host: HOST }, payload: body });
    const created = await post({ id: 'doc_01JX0000000000000000000000', name: 'Mine' });
    assert.equal(created.statusCode, 200, created.body);
    assert.equal(created.json().workflow.id, 'doc_01JX0000000000000000000000');
    assert.equal((await post({ id: 'doc_01JX0000000000000000000000' })).statusCode, 409);
    assert.equal((await post({ id: '../escape' })).statusCode, 400);
    assert.equal((await post({ id: 'a'.repeat(81) })).statusCode, 400);
    const auto = await post({ name: 'No id' });
    assert.match(auto.json().workflow.id, /^[0-9a-f-]{36}$/);
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
