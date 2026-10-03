/**
 * OUTPUT_STORAGE public put on the local host (`storePublic` in
 * src/local-node-host.ts) and the headers on `/public/*`. Run with
 * `pnpm --filter iris-host-local test` (builds first; imports `dist/`).
 *
 * Files in `<dataDir>/public` are served from the engine's own origin, which
 * the access guard trusts, so a stored HTML or SVG document must never run
 * script there.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildServer, createLocalNodeHost } from '../dist/index.js';

const BASE = 'http://localhost:4747';

describe('local storePublic', () => {
  let dataDir;
  let host;
  let strictHost;

  before(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'iris-flow-store-'));
    const opts = { dataDir, store: {}, getPublicBaseUrl: () => BASE };
    host = createLocalNodeHost(opts);
    strictHost = createLocalNodeHost({ ...opts, allowPrivateNetworkHttp: false });
  });

  after(() => rmSync(dataDir, { recursive: true, force: true }));

  test('stores allowlisted media with its own extension', async () => {
    const r = await host.media.storePublic({
      source: { kind: 'bytes', buffer: Buffer.from('png'), contentType: 'image/png' },
      userId: 'local',
    });
    assert.equal(r.success, true);
    assert.match(r.publicUrl, /^http:\/\/localhost:4747\/public\/.+\.png$/);
    assert.equal(r.assetType, 'IMAGE');
  });

  test('stores HTML and SVG as .bin', async () => {
    for (const contentType of ['text/html', 'image/svg+xml', 'application/xhtml+xml']) {
      const r = await host.media.storePublic({
        source: { kind: 'bytes', buffer: Buffer.from('<script>1</script>'), contentType },
        userId: 'local',
      });
      assert.equal(r.success, true);
      assert.match(r.publicUrl, /\.bin$/, contentType);
    }
  });

  test('refuses gs:// sources as a policy block', async () => {
    const r = await host.media.storePublic({
      source: { kind: 'gcsUri', uri: 'gs://bucket/production/storage/u/a.png' },
      userId: 'local',
    });
    assert.equal(r.success, false);
    assert.equal(r.blocked, true);
  });

  test('blocks private addresses when the host turns the network guard on', async () => {
    const r = await strictHost.media.storePublic({
      source: { kind: 'url', url: 'http://169.254.169.254/computeMetadata/v1/' },
      userId: 'local',
    });
    assert.equal(r.success, false);
    assert.equal(r.blocked, true);
  });
});

describe('/public serving headers', () => {
  let dataDir;
  let app;

  before(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'iris-flow-public-'));
    app = await buildServer({
      port: 4747,
      host: '127.0.0.1',
      dataDir,
      openBrowser: false,
      configuredProviders: [],
    });
    // A file written by an older build could still carry an .html name.
    writeFileSync(path.join(dataDir, 'public', 'old.html'), '<script>1</script>');
  });

  after(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('sends nosniff and a sandboxing CSP', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/public/old.html',
      headers: { host: 'localhost:4747' },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.match(String(res.headers['content-security-policy']), /sandbox/);
    assert.match(String(res.headers['content-security-policy']), /default-src 'none'/);
  });
});
