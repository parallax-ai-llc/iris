/**
 * Asset lookups on the local host (`getAssetById` in src/local-node-host.ts and
 * the `/api/iris/assets/:id/download` route). Run with
 * `pnpm --filter iris-host-local test` (builds first; imports `dist/`).
 *
 * The local host is single-user, so the owner check matches every asset it
 * stored itself. What matters here is that an id can never step outside
 * `<dataDir>/assets` and that a different requester is refused.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildServer, createLocalNodeHost } from '../dist/index.js';

const BASE = 'http://localhost:4747';

describe('local getAssetById', () => {
  let dataDir;
  let host;
  let assetId;

  before(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'iris-flow-assets-'));
    host = createLocalNodeHost({ dataDir, store: {}, getPublicBaseUrl: () => BASE });
    const stored = await host.media.storeOutput({
      output: { type: 'text', base64: Buffer.from('hello').toString('base64') },
      userId: 'local',
    });
    assert.equal(stored.success, true);
    assetId = stored.asset.id;
    // A meta.json one level above the assets dir, as a traversal target.
    writeFileSync(
      path.join(dataDir, 'meta.json'),
      JSON.stringify({ storagePath: path.join(dataDir, 'meta.json'), userId: 'local' }),
    );
  });

  after(() => rmSync(dataDir, { recursive: true, force: true }));

  test('returns the asset to its own user', async () => {
    const asset = await host.assets.getAssetById(assetId, 'local');
    assert.equal(asset?.userId, 'local');
  });

  test('refuses a different requester', async () => {
    assert.equal(await host.assets.getAssetById(assetId, 'someone-else'), null);
  });

  test('refuses ids that are not plain asset ids', async () => {
    for (const id of ['..', '..\\..', 'a.b', '', '../assets']) {
      assert.equal(await host.assets.getAssetById(id, 'local'), null, id);
    }
  });
});

describe('/api/iris/assets/:id/download', () => {
  let dataDir;
  let app;

  before(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'iris-flow-dl-'));
    app = await buildServer({
      port: 4747,
      host: '127.0.0.1',
      dataDir,
      openBrowser: false,
      configuredProviders: [],
    });
    mkdirSync(path.join(dataDir, 'assets'), { recursive: true });
    writeFileSync(
      path.join(dataDir, 'meta.json'),
      JSON.stringify({ storagePath: path.join(dataDir, 'meta.json'), mimeType: 'text/plain' }),
    );
  });

  after(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('404s an id with dots or separators', async () => {
    for (const id of ['..', '..%5C..', '..%2F..']) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/iris/assets/${id}/download`,
        headers: { host: 'localhost:4747' },
      });
      assert.equal(res.statusCode, 404, id);
    }
  });
});
