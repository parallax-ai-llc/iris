/**
 * Node result cache on the local host: the file store (`LocalNodeCacheStore`),
 * its wiring into `LocalWorkflowStore`, the startup cleanup, and the cache
 * options of `POST /api/iris/workflows/:id/execute` through the real
 * `buildServer`. Run with `pnpm --filter iris-host-local test` (builds first;
 * this imports the compiled `dist/`).
 *
 * Covers spec iris-node-result-cache.md DoD 7 (7-day cleanup at startup) and
 * DoD 8 (the local engine reuses, re-runs and runs-up-to like the cloud one).
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildServer, LocalNodeCacheStore, LocalWorkflowStore } from '../dist/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PORT = 4748;
const HOST = `localhost:${PORT}`;

function tempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function entry(cacheKey, overrides = {}) {
  const now = new Date().toISOString();
  return {
    cacheKey,
    nodeType: 'UTIL_REGEX',
    outputData: { replaced: `out-${cacheKey}` },
    assets: [],
    sourceExecutionId: 'exec-1',
    createdAt: now,
    lastUsedAt: now,
    ...overrides,
  };
}

const cacheFile = (dataDir, workflowId) => path.join(dataDir, 'cache', `${workflowId}.json`);
const readCache = (dataDir, workflowId) =>
  JSON.parse(readFileSync(cacheFile(dataDir, workflowId), 'utf8'));
const writeCache = (dataDir, workflowId, data) => {
  mkdirSync(path.join(dataDir, 'cache'), { recursive: true });
  writeFileSync(cacheFile(dataDir, workflowId), JSON.stringify(data), 'utf8');
};

// ─── LocalNodeCacheStore ─────────────────────────────────────────────────────

describe('LocalNodeCacheStore', () => {
  let dataDir;
  let store;

  beforeEach(() => {
    dataDir = tempDir('iris-flow-cache-');
    store = new LocalNodeCacheStore(dataDir);
  });

  const cleanup = () => rmSync(dataDir, { recursive: true, force: true });

  test('put then get returns the entry and writes <dataDir>/cache/<workflowId>.json', async () => {
    try {
      await store.put('wf-1', entry('k1'));

      assert.ok(existsSync(cacheFile(dataDir, 'wf-1')));
      assert.deepEqual(Object.keys(readCache(dataDir, 'wf-1')), ['k1']);

      const hit = await store.get('wf-1', 'k1');
      assert.equal(hit.cacheKey, 'k1');
      assert.equal(hit.nodeType, 'UTIL_REGEX');
      assert.deepEqual(hit.outputData, { replaced: 'out-k1' });
      assert.equal(hit.sourceExecutionId, 'exec-1');
    } finally {
      cleanup();
    }
  });

  test('get returns null for an unknown key and for an unknown workflow', async () => {
    try {
      await store.put('wf-1', entry('k1'));

      assert.equal(await store.get('wf-1', 'missing'), null);
      assert.equal(await store.get('wf-other', 'k1'), null);
    } finally {
      cleanup();
    }
  });

  test('keeps workflows apart (same key in two workflows)', async () => {
    try {
      await store.put('wf-1', entry('k', { outputData: { v: 1 } }));
      await store.put('wf-2', entry('k', { outputData: { v: 2 } }));

      assert.deepEqual((await store.get('wf-1', 'k')).outputData, { v: 1 });
      assert.deepEqual((await store.get('wf-2', 'k')).outputData, { v: 2 });
    } finally {
      cleanup();
    }
  });

  test('put replaces an existing entry for the same key', async () => {
    try {
      await store.put('wf-1', entry('k', { outputData: { v: 1 } }));
      await store.put('wf-1', entry('k', { outputData: { v: 2 }, sourceExecutionId: 'exec-2' }));

      const hit = await store.get('wf-1', 'k');
      assert.deepEqual(hit.outputData, { v: 2 });
      assert.equal(hit.sourceExecutionId, 'exec-2');
      assert.equal(Object.keys(readCache(dataDir, 'wf-1')).length, 1);
    } finally {
      cleanup();
    }
  });

  test('a hit refreshes lastUsedAt on disk and keeps createdAt', async () => {
    try {
      const old = new Date(Date.now() - 5 * DAY_MS).toISOString();
      await store.put('wf-1', entry('k', { createdAt: old, lastUsedAt: old }));
      const before = Date.now();

      const hit = await store.get('wf-1', 'k');

      assert.ok(Date.parse(hit.lastUsedAt) >= before, 'returned lastUsedAt is fresh');
      const onDisk = readCache(dataDir, 'wf-1').k;
      assert.equal(onDisk.lastUsedAt, hit.lastUsedAt);
      assert.equal(onDisk.createdAt, old);
    } finally {
      cleanup();
    }
  });

  test('a miss does not create or touch a file', async () => {
    try {
      assert.equal(await store.get('wf-1', 'k'), null);
      assert.equal(existsSync(path.join(dataDir, 'cache')), false);
    } finally {
      cleanup();
    }
  });

  test('delete removes one entry and the file once it is empty', async () => {
    try {
      await store.put('wf-1', entry('k1'));
      await store.put('wf-1', entry('k2'));

      await store.delete('wf-1', 'k1');
      assert.deepEqual(Object.keys(readCache(dataDir, 'wf-1')), ['k2']);
      assert.equal(await store.get('wf-1', 'k1'), null);

      await store.delete('wf-1', 'k2');
      assert.equal(existsSync(cacheFile(dataDir, 'wf-1')), false);
    } finally {
      cleanup();
    }
  });

  test('delete of an absent key or workflow is a no-op', async () => {
    try {
      await store.put('wf-1', entry('k1'));

      await store.delete('wf-1', 'nope');
      await store.delete('wf-unknown', 'k1');

      assert.deepEqual(Object.keys(readCache(dataDir, 'wf-1')), ['k1']);
    } finally {
      cleanup();
    }
  });

  test('evicts the least recently used entry on the 501st put', async () => {
    try {
      // 500 entries, key0 the oldest and key499 the newest.
      const base = Date.now() - 100 * 1000;
      const seeded = {};
      for (let i = 0; i < 500; i += 1) {
        const stamp = new Date(base + i * 100).toISOString();
        seeded[`key${i}`] = entry(`key${i}`, { createdAt: stamp, lastUsedAt: stamp });
      }
      writeCache(dataDir, 'wf-1', seeded);

      await store.put('wf-1', entry('newest'));

      const keys = Object.keys(readCache(dataDir, 'wf-1'));
      assert.equal(keys.length, 500);
      assert.ok(keys.includes('newest'));
      assert.ok(!keys.includes('key0'), 'oldest entry evicted');
      assert.ok(keys.includes('key1'));
      assert.ok(keys.includes('key499'));
    } finally {
      cleanup();
    }
  });

  test('a recently read entry survives eviction (LRU, not FIFO)', async () => {
    try {
      const base = Date.now() - 100 * 1000;
      const seeded = {};
      for (let i = 0; i < 500; i += 1) {
        const stamp = new Date(base + i * 100).toISOString();
        seeded[`key${i}`] = entry(`key${i}`, { createdAt: stamp, lastUsedAt: stamp });
      }
      writeCache(dataDir, 'wf-1', seeded);

      assert.ok(await store.get('wf-1', 'key0')); // touch the oldest
      await store.put('wf-1', entry('newest'));

      const keys = Object.keys(readCache(dataDir, 'wf-1'));
      assert.equal(keys.length, 500);
      assert.ok(keys.includes('key0'), 'touched entry kept');
      assert.ok(!keys.includes('key1'), 'next-oldest evicted instead');
    } finally {
      cleanup();
    }
  });

  test('cleanupExpired removes only entries unused for more than 7 days', async () => {
    try {
      const now = Date.now();
      const at = days => new Date(now - days * DAY_MS).toISOString();
      writeCache(dataDir, 'wf-1', {
        old: entry('old', { createdAt: at(30), lastUsedAt: at(8) }),
        justOver: entry('justOver', {
          createdAt: at(9),
          lastUsedAt: new Date(now - 7 * DAY_MS - 1000).toISOString(),
        }),
        fresh: entry('fresh', { createdAt: at(30), lastUsedAt: at(6) }),
        edge: entry('edge', { createdAt: at(30), lastUsedAt: new Date(now - 7 * DAY_MS).toISOString() }),
      });

      const { removed } = await store.cleanupExpired(now);

      assert.equal(removed, 2);
      const keys = Object.keys(readCache(dataDir, 'wf-1')).sort();
      assert.deepEqual(keys, ['edge', 'fresh']);
    } finally {
      cleanup();
    }
  });

  test('cleanupExpired deletes a workflow file whose entries all expired and counts across files', async () => {
    try {
      const now = Date.now();
      const stale = new Date(now - 8 * DAY_MS).toISOString();
      writeCache(dataDir, 'wf-dead', {
        a: entry('a', { lastUsedAt: stale }),
        b: entry('b', { lastUsedAt: stale }),
      });
      writeCache(dataDir, 'wf-live', {
        c: entry('c', { lastUsedAt: stale }),
        d: entry('d'),
      });

      const { removed } = await store.cleanupExpired(now);

      assert.equal(removed, 3);
      assert.equal(existsSync(cacheFile(dataDir, 'wf-dead')), false);
      assert.deepEqual(Object.keys(readCache(dataDir, 'wf-live')), ['d']);
    } finally {
      cleanup();
    }
  });

  test('cleanupExpired uses an injected clock and is safe without a cache dir', async () => {
    try {
      assert.deepEqual(await store.cleanupExpired(), { removed: 0 });

      await store.put('wf-1', entry('k'));
      assert.deepEqual(await store.cleanupExpired(Date.now()), { removed: 0 });
      // Eight days later the same entry is gone.
      assert.deepEqual(await store.cleanupExpired(Date.now() + 8 * DAY_MS), { removed: 1 });
      assert.equal(existsSync(cacheFile(dataDir, 'wf-1')), false);
    } finally {
      cleanup();
    }
  });

  test('a corrupt cache file reads as an empty cache and is replaced on the next put', async () => {
    try {
      mkdirSync(path.join(dataDir, 'cache'), { recursive: true });
      writeFileSync(cacheFile(dataDir, 'wf-1'), '{not json', 'utf8');

      assert.equal(await store.get('wf-1', 'k'), null);
      await store.put('wf-1', entry('k'));
      assert.ok(await store.get('wf-1', 'k'));
    } finally {
      cleanup();
    }
  });

  test('clearWorkflow drops the whole file', async () => {
    try {
      await store.put('wf-1', entry('k1'));
      await store.put('wf-1', entry('k2'));

      await store.clearWorkflow('wf-1');

      assert.equal(existsSync(cacheFile(dataDir, 'wf-1')), false);
      assert.equal(await store.get('wf-1', 'k1'), null);
    } finally {
      cleanup();
    }
  });

  test('refuses workflow ids that are not safe file names', async () => {
    try {
      const outside = path.join(dataDir, 'escaped.json');
      for (const bad of ['../escaped', '..\\escaped', 'a/b', '', 'x'.repeat(200)]) {
        await store.put(bad, entry('k'));
        assert.equal(await store.get(bad, 'k'), null);
        await store.delete(bad, 'k');
        await store.clearWorkflow(bad);
      }
      assert.equal(existsSync(outside), false);
      assert.equal(existsSync(path.join(dataDir, 'cache')), false);
    } finally {
      cleanup();
    }
  });

  test('concurrent puts to one workflow all land (file lock)', async () => {
    try {
      await Promise.all(
        Array.from({ length: 25 }, (_, i) => store.put('wf-1', entry(`k${i}`))),
      );

      assert.equal(Object.keys(readCache(dataDir, 'wf-1')).length, 25);
    } finally {
      cleanup();
    }
  });
});

// ─── LocalWorkflowStore wiring ───────────────────────────────────────────────

describe('LocalWorkflowStore node cache', () => {
  let dataDir;
  let store;

  beforeEach(() => {
    dataDir = tempDir('iris-flow-wfstore-');
    store = new LocalWorkflowStore(dataDir);
  });

  const cleanup = () => rmSync(dataDir, { recursive: true, force: true });

  test('get / put / delete go through <dataDir>/cache and ignore the user id', async () => {
    try {
      await store.putCachedResult('wf-1', 'local', entry('k'));
      assert.ok(existsSync(cacheFile(dataDir, 'wf-1')));

      assert.equal((await store.getCachedResult('wf-1', 'k')).cacheKey, 'k');
      assert.equal(await store.getCachedResult('wf-1', 'zzz'), null);

      await store.deleteCachedResult('wf-1', 'k');
      assert.equal(await store.getCachedResult('wf-1', 'k'), null);
    } finally {
      cleanup();
    }
  });

  test('cleanupExpiredNodeCache removes entries unused for 8 days', async () => {
    try {
      const stale = new Date(Date.now() - 8 * DAY_MS).toISOString();
      writeCache(dataDir, 'wf-1', {
        a: entry('a', { lastUsedAt: stale }),
        b: entry('b'),
      });

      assert.deepEqual(await store.cleanupExpiredNodeCache(), { removed: 1 });
      assert.deepEqual(Object.keys(readCache(dataDir, 'wf-1')), ['b']);
    } finally {
      cleanup();
    }
  });

  test('deleting the workflow deletes its cache file', async () => {
    try {
      const wf = await store.createWorkflow({ name: 'cached', userId: 'local' });
      await store.putCachedResult(wf.id, 'local', entry('k'));
      assert.ok(existsSync(cacheFile(dataDir, wf.id)));

      assert.equal(await store.deleteWorkflow(wf.id), true);

      assert.equal(existsSync(cacheFile(dataDir, wf.id)), false);
    } finally {
      cleanup();
    }
  });

  test('deleting a workflow that does not exist returns false', async () => {
    try {
      assert.equal(await store.deleteWorkflow('does-not-exist'), false);
    } finally {
      cleanup();
    }
  });

  test("saveNodeResult stores status 'cached' as CACHED with zero usage", async () => {
    try {
      const execution = await store.createExecution({
        workflowId: 'wf-1',
        userId: 'local',
        triggerType: 'MANUAL',
        triggerData: {},
        inputData: {},
      });
      await store.startNodeResult(execution.id, 'a', {});

      await store.saveNodeResult(execution.id, 'a', {
        nodeId: 'a',
        status: 'cached',
        outputs: { replaced: 'x' },
        assets: [],
        usage: { estimatedCost: 0, totalTokens: 0, tokensConsumed: 0 },
        duration: 0,
      });

      const saved = (await store.getExecution(execution.id)).nodeResults.a;
      assert.equal(saved.status, 'CACHED');
      assert.equal(saved.tokensUsed, 0);
      assert.equal(saved.apiCost, 0);
      assert.deepEqual(saved.outputData, { replaced: 'x' });
    } finally {
      cleanup();
    }
  });
});

// ─── Local engine through buildServer ────────────────────────────────────────

const config = dataDir => ({
  port: PORT,
  host: '127.0.0.1',
  dataDir,
  openBrowser: false,
  configuredProviders: [],
});

const node = (nodeId, type, cfg = {}) => ({
  id: nodeId,
  nodeId,
  type,
  label: nodeId,
  config: cfg,
  inputPorts: [],
  outputPorts: [],
});

const edge = (from, fromPort, to, toPort) => ({
  edgeId: `${from}.${fromPort}->${to}.${toPort}`,
  sourceNodeId: from,
  targetNodeId: to,
  sourceHandle: fromPort,
  targetHandle: toPort,
});

/** trigger -text-> a -replaced-> b -replaced-> c, all pure utility nodes. */
function chain({ bReplacement = '0' } = {}) {
  return {
    nodes: [
      node('trigger', 'TRIGGER_MANUAL'),
      node('a', 'UTIL_REGEX', { settings: { pattern: '\\w+', mode: 'extract', flags: 'g' } }),
      node('b', 'UTIL_REGEX', {
        settings: { pattern: 'o', mode: 'replace', replacement: bReplacement, flags: 'g' },
      }),
      node('c', 'UTIL_REGEX', {
        settings: { pattern: 'l', mode: 'replace', replacement: '1', flags: 'g' },
      }),
    ],
    edges: [
      edge('trigger', 'text', 'a', 'text'),
      edge('a', 'replaced', 'b', 'text'),
      edge('b', 'replaced', 'c', 'text'),
    ],
  };
}

describe('local engine: node result cache over HTTP', () => {
  let dataDir;
  let app;
  let workflowId;

  const json = (method, url, payload) =>
    app.inject({
      method,
      url,
      headers: { host: HOST, 'content-type': 'application/json' },
      payload,
    });

  async function waitForExecution(executionId) {
    const file = path.join(dataDir, 'executions', `${executionId}.json`);
    for (let i = 0; i < 200; i += 1) {
      if (existsSync(file)) {
        try {
          const exec = JSON.parse(readFileSync(file, 'utf8'));
          if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(exec.status)) return exec;
        } catch {
          // The file is mid-write; try again.
        }
      }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`execution ${executionId} did not finish`);
  }

  /** Run the workflow and return `{ status of each node, execution }`. */
  async function run(extra = {}, input = 'hello world') {
    const res = await json('POST', `/api/iris/workflows/${workflowId}/execute`, {
      trigger: { type: 'manual', data: { inputValue: input, inputType: 'text' } },
      ...extra,
    });
    assert.equal(res.statusCode, 200, res.body);
    const exec = await waitForExecution(res.json().executionId);
    const statuses = Object.fromEntries(
      Object.entries(exec.nodeResults).map(([id, r]) => [id, r.status]),
    );
    return { exec, statuses };
  }

  const hitsOf = exec =>
    exec.logs.filter(l => l.eventType === 'NODE_CACHE_HIT').map(l => l.message);

  beforeEach(async () => {
    dataDir = tempDir('iris-flow-cache-e2e-');
    app = await buildServer(config(dataDir));
    const created = await json('POST', '/api/iris/workflows', { name: 'chain', ...chain() });
    assert.equal(created.statusCode, 200);
    workflowId = created.json().workflow.id;
  });

  const teardown = async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  };

  test('DoD 8/1: the second manual run reuses a, b and c with zero usage', async () => {
    try {
      const first = await run();
      assert.deepEqual(first.statuses, {
        trigger: 'COMPLETED',
        a: 'COMPLETED',
        b: 'COMPLETED',
        c: 'COMPLETED',
      });
      assert.equal(first.exec.nodeResults.c.outputData.replaced, 'he110 w0r1d');
      assert.equal(Object.keys(readCache(dataDir, workflowId)).length, 3);

      const second = await run();
      assert.deepEqual(second.statuses, {
        trigger: 'COMPLETED',
        a: 'CACHED',
        b: 'CACHED',
        c: 'CACHED',
      });
      assert.equal(second.exec.status, 'COMPLETED');
      assert.equal(second.exec.nodeResults.c.outputData.replaced, 'he110 w0r1d');
      for (const id of ['a', 'b', 'c']) {
        assert.equal(second.exec.nodeResults[id].tokensUsed, 0);
        assert.equal(second.exec.nodeResults[id].apiCost, 0);
      }
      assert.equal(second.exec.totalTokensUsed, 0);
      assert.deepEqual(hitsOf(second.exec), ['cache hit a', 'cache hit b', 'cache hit c']);
    } finally {
      await teardown();
    }
  });

  test('DoD 8/2: changing b re-runs b and c while a stays cached', async () => {
    try {
      await run();

      const next = chain({ bReplacement: 'X' });
      const patched = await json('PATCH', `/api/iris/workflows/${workflowId}`, {
        nodes: next.nodes,
      });
      assert.equal(patched.statusCode, 200);

      const { statuses, exec } = await run();
      assert.deepEqual(statuses, {
        trigger: 'COMPLETED',
        a: 'CACHED',
        b: 'COMPLETED',
        c: 'COMPLETED',
      });
      assert.equal(exec.nodeResults.b.outputData.replaced, 'hellX wXrld');
      assert.equal(exec.nodeResults.c.outputData.replaced, 'he11X wXr1d');
    } finally {
      await teardown();
    }
  });

  test('a different trigger input re-runs every node', async () => {
    try {
      await run({}, 'hello world');

      const { statuses } = await run({}, 'hello there');

      assert.deepEqual(statuses, {
        trigger: 'COMPLETED',
        a: 'COMPLETED',
        b: 'COMPLETED',
        c: 'COMPLETED',
      });
    } finally {
      await teardown();
    }
  });

  test('DoD 8/4: forceNodeIds and the legacy startNodeId re-run only that node', async () => {
    try {
      await run();

      const forced = await run({ forceNodeIds: ['b'] });
      assert.deepEqual(forced.statuses, {
        trigger: 'COMPLETED',
        a: 'CACHED',
        b: 'COMPLETED',
        c: 'CACHED',
      });

      const legacy = await run({ startNodeId: 'b' });
      assert.deepEqual(legacy.statuses, forced.statuses);
    } finally {
      await teardown();
    }
  });

  test('DoD 8/4: endNodeId runs the ancestors (cache first) and skips the rest', async () => {
    try {
      // Cold cache: the ancestors run.
      const cold = await run({ endNodeId: 'b' });
      assert.deepEqual(cold.statuses, {
        trigger: 'COMPLETED',
        a: 'COMPLETED',
        b: 'COMPLETED',
        c: 'SKIPPED',
      });
      assert.equal(cold.exec.status, 'COMPLETED');

      // Warm cache: the same ancestors come from the cache.
      const warm = await run({ endNodeId: 'b' });
      assert.deepEqual(warm.statuses, {
        trigger: 'COMPLETED',
        a: 'CACHED',
        b: 'CACHED',
        c: 'SKIPPED',
      });
    } finally {
      await teardown();
    }
  });

  test('useCache:false runs everything again but still writes the cache', async () => {
    try {
      await run();

      const fresh = await run({ useCache: false });
      assert.deepEqual(fresh.statuses, {
        trigger: 'COMPLETED',
        a: 'COMPLETED',
        b: 'COMPLETED',
        c: 'COMPLETED',
      });
      const sources = Object.values(readCache(dataDir, workflowId)).map(
        e => e.sourceExecutionId,
      );
      assert.ok(sources.every(id => id === fresh.exec.id), 'entries rewritten by the new run');

      const after = await run();
      assert.equal(after.statuses.c, 'CACHED');
    } finally {
      await teardown();
    }
  });

  test('a non-boolean useCache is ignored (defaults to reading the cache)', async () => {
    try {
      await run();

      const { statuses } = await run({ useCache: 'false' });

      assert.equal(statuses.c, 'CACHED');
    } finally {
      await teardown();
    }
  });

  test('an unknown endNodeId answers 400 INVALID_NODE and creates no execution', async () => {
    try {
      const res = await json('POST', `/api/iris/workflows/${workflowId}/execute`, {
        endNodeId: 'ghost',
      });

      assert.equal(res.statusCode, 400);
      assert.equal(res.json().code, 'INVALID_NODE');
      const dir = path.join(dataDir, 'executions');
      assert.deepEqual(existsSync(dir) ? readdirSync(dir) : [], []);
    } finally {
      await teardown();
    }
  });

  test('an endNodeId inside a loop body answers 400 INVALID_NODE mentioning the loop', async () => {
    try {
      const loopWf = await json('POST', '/api/iris/workflows', {
        name: 'loop',
        nodes: [
          node('trigger', 'TRIGGER_MANUAL'),
          node('items', 'UTIL_REGEX', {
            settings: { pattern: '\\w+', mode: 'extract', flags: 'g' },
          }),
          node('loop', 'UTIL_LOOP'),
          node('body', 'UTIL_REGEX', {
            settings: { pattern: 'x', mode: 'replace', replacement: 'y' },
          }),
        ],
        edges: [
          edge('trigger', 'text', 'items', 'text'),
          edge('items', 'matches', 'loop', 'items'),
          edge('loop', 'item', 'body', 'text'),
        ],
      });
      const loopId = loopWf.json().workflow.id;

      const res = await json('POST', `/api/iris/workflows/${loopId}/execute`, {
        endNodeId: 'body',
      });

      assert.equal(res.statusCode, 400);
      assert.equal(res.json().code, 'INVALID_NODE');
      assert.match(res.json().error, /loop/);
      const dir = path.join(dataDir, 'executions');
      assert.deepEqual(existsSync(dir) ? readdirSync(dir) : [], []);
    } finally {
      await teardown();
    }
  });

  test('unknown ids in forceNodeIds are ignored, not an error', async () => {
    try {
      await run();

      const { statuses } = await run({ forceNodeIds: ['ghost', 'trigger'] });

      assert.deepEqual(statuses, {
        trigger: 'COMPLETED',
        a: 'CACHED',
        b: 'CACHED',
        c: 'CACHED',
      });
    } finally {
      await teardown();
    }
  });

  test('deleting the workflow through the API removes its cache file', async () => {
    try {
      await run();
      assert.ok(existsSync(cacheFile(dataDir, workflowId)));

      const res = await json('DELETE', `/api/iris/workflows/${workflowId}`);

      assert.equal(res.statusCode, 200);
      assert.equal(existsSync(cacheFile(dataDir, workflowId)), false);
    } finally {
      await teardown();
    }
  });
});

describe('local engine: startup cleanup (DoD 7)', () => {
  test('drops entries unused for 8 days when the server starts and logs the count', async () => {
    const dataDir = tempDir('iris-flow-cache-start-');
    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    let app;
    try {
      const stale = new Date(Date.now() - 8 * DAY_MS).toISOString();
      writeCache(dataDir, 'wf-old', {
        a: entry('a', { lastUsedAt: stale }),
        b: entry('b', { lastUsedAt: stale }),
      });
      writeCache(dataDir, 'wf-mixed', {
        c: entry('c', { lastUsedAt: stale }),
        d: entry('d'),
      });

      app = await buildServer(config(dataDir));

      assert.equal(existsSync(cacheFile(dataDir, 'wf-old')), false);
      assert.deepEqual(Object.keys(readCache(dataDir, 'wf-mixed')), ['d']);
      assert.ok(
        logs.some(line => line.includes('node cache: removed 3 expired entries')),
        `startup log missing: ${JSON.stringify(logs)}`,
      );
    } finally {
      console.log = originalLog;
      if (app) await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test('starts normally when there is no cache directory yet', async () => {
    const dataDir = tempDir('iris-flow-cache-empty-');
    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    let app;
    try {
      app = await buildServer(config(dataDir));

      const res = await app.inject({ method: 'GET', url: '/api/health', headers: { host: HOST } });
      assert.equal(res.statusCode, 200);
      assert.ok(logs.some(line => line.includes('node cache: removed 0 expired entries')));
    } finally {
      console.log = originalLog;
      if (app) await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
