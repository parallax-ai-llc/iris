/**
 * Browser access to the local engine (`src/access-guard.ts`), exercised through
 * the real `buildServer`. Run with `pnpm --filter iris-host-local test` (builds
 * first; this imports the compiled `dist/`).
 *
 * The engine is unauthenticated by design, so these checks are what stop a
 * website the user happens to visit from creating/running workflows with their
 * BYOK keys or reading local assets.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildServer } from '../dist/index.js';

const PORT = 4747;
const HOST = `localhost:${PORT}`;
const TOKEN = 'a'.repeat(48);

function config(dataDir, extra = {}) {
  return {
    port: PORT,
    host: '127.0.0.1',
    dataDir,
    openBrowser: false,
    configuredProviders: [],
    ...extra,
  };
}

async function withServer(opts, fn) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'iris-flow-guard-'));
  const app = await buildServer(config(dataDir, opts.config), opts.server);
  try {
    await fn(app);
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
}

const listWorkflows = async app =>
  (
    await app.inject({ method: 'GET', url: '/api/iris/workflows', headers: { host: HOST } })
  ).json().workflows;

describe('npx iris-flow (no token): Host + Origin checks', () => {
  let app;
  let dataDir;

  before(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'iris-flow-guard-'));
    app = await buildServer(config(dataDir));
  });

  after(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('serves same-machine clients without an Origin (CLI, the engine itself)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health', headers: { host: HOST } });
    assert.equal(res.statusCode, 200);
  });

  test('lets the bundled editor (same origin) create a workflow', async () => {
    for (const origin of ['http://localhost:4747', 'http://127.0.0.1:4747', 'http://[::1]:4747']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/iris/workflows',
        headers: { host: HOST, origin, 'content-type': 'application/json' },
        payload: { name: `from ${origin}` },
      });
      assert.ok(res.statusCode < 300, `${origin} → ${res.statusCode}`);
      assert.equal(res.headers['access-control-allow-origin'], origin);
    }
  });

  test('refuses a cross-site POST and creates nothing', async () => {
    const before = (await listWorkflows(app)).length;
    const res = await app.inject({
      method: 'POST',
      url: '/api/iris/workflows',
      headers: { host: HOST, origin: 'https://evil.example', 'content-type': 'application/json' },
      payload: { name: 'pwned' },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.headers['access-control-allow-origin'], undefined);
    assert.equal((await listWorkflows(app)).length, before);
  });

  test('refuses a "simple" cross-site request that skips the CORS preflight', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/iris/workflows',
      headers: { host: HOST, origin: 'https://evil.example', 'content-type': 'text/plain' },
      payload: '{"name":"pwned"}',
    });
    assert.equal(res.statusCode, 403);
  });

  test('never lets another site read responses (no CORS reflection)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/iris/assets',
      headers: { host: HOST, origin: 'https://evil.example' },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });

  test('refuses the "null" origin (sandboxed iframes on any site) unless configured', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/iris/workflows',
      headers: { host: HOST, origin: 'null' },
    });
    assert.equal(res.statusCode, 403);
  });

  test('does not answer a preflight for another site', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/iris/workflows',
      headers: {
        host: HOST,
        origin: 'https://evil.example',
        'access-control-request-method': 'POST',
      },
    });
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });

  test('answers a preflight from its own origin', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/iris/workflows',
      headers: {
        host: HOST,
        origin: 'http://localhost:4747',
        'access-control-request-method': 'POST',
      },
    });
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:4747');
  });

  test('refuses DNS rebinding (foreign Host header)', async () => {
    for (const host of ['evil.example:4747', 'evil.example', 'localhost:9999', 'localhost']) {
      const res = await app.inject({ method: 'GET', url: '/api/health', headers: { host } });
      assert.equal(res.statusCode, 403, host);
    }
  });
});

describe('IRIS_FLOW_ALLOWED_ORIGINS / allowedOrigins', () => {
  test('lets a configured origin through and reflects it', async () => {
    await withServer({ config: { allowedOrigins: ['https://studio.example'] } }, async app => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/iris/workflows',
        headers: { host: HOST, origin: 'https://studio.example' },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['access-control-allow-origin'], 'https://studio.example');
    });
  });
});

describe('desktop daemon (accessToken): browser requests need the per-launch token', () => {
  const server = { accessToken: TOKEN, runtimeKeyToken: TOKEN, allowedOrigins: ['null'] };

  test('rejects a browser request without the token, even from an allowed origin', async () => {
    await withServer({ server }, async app => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/iris/workflows',
        headers: { host: HOST, origin: 'null', 'content-type': 'application/json' },
        payload: { name: 'from a sandboxed iframe' },
      });
      assert.equal(res.statusCode, 401);
      assert.equal((await listWorkflows(app)).length, 0);
    });
  });

  test('rejects a wrong token', async () => {
    await withServer({ server }, async app => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/iris/workflows',
        headers: { host: HOST, origin: 'null', 'x-iris-daemon-token': 'b'.repeat(48) },
      });
      assert.equal(res.statusCode, 401);
    });
  });

  test('accepts the desktop renderer (file:// → Origin null) with the token and lets it read', async () => {
    await withServer({ server }, async app => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/iris/workflows',
        headers: {
          host: HOST,
          origin: 'null',
          'content-type': 'application/json',
          'x-iris-daemon-token': TOKEN,
        },
        payload: { name: 'from the app' },
      });
      assert.ok(res.statusCode < 300, String(res.statusCode));
      assert.equal(res.headers['access-control-allow-origin'], 'null');
    });
  });

  test('refuses a cross-site <img>/<video> load (no Origin, but Sec-Fetch-Site)', async () => {
    await withServer({ server }, async app => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/iris/assets',
        headers: { host: HOST, 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors' },
      });
      assert.equal(res.statusCode, 401);
    });
  });

  test('still serves non-browser clients (the engine fetching its own asset URLs, ffmpeg)', async () => {
    await withServer({ server }, async app => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/health',
        // What Node's fetch sends: no Origin, no Sec-Fetch-Site.
        headers: { host: HOST, 'sec-fetch-mode': 'cors', 'user-agent': 'node' },
      });
      assert.equal(res.statusCode, 200);
    });
  });

  test('keeps the runtime key push token-only, even for non-browser clients', async () => {
    await withServer({ server }, async app => {
      const denied = await app.inject({
        method: 'POST',
        url: '/api/iris/runtime/keys',
        headers: { host: HOST, 'content-type': 'application/json' },
        payload: { keys: { OPENAI_API_KEY: 'sk-attacker' } },
      });
      assert.equal(denied.statusCode, 403);
      assert.notEqual(process.env.OPENAI_API_KEY, 'sk-attacker');
    });
  });
});
