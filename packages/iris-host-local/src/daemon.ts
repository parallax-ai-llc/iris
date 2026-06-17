#!/usr/bin/env node
/**
 * iris-host-local **daemon** entrypoint.
 *
 * Same local Fastify server as `npx iris-flow`, but designed to be spawned as a
 * **detached background process** (by the desktop app) that outlives the UI:
 * close the app and batch jobs / scheduled workflows keep running. It writes a
 * `<dataDir>/daemon.json` lockfile (pid + port + runtime-key token) so the next
 * app launch reattaches to the running daemon instead of starting another.
 *
 * BYOK keys arrive two ways: the embedder passes them as env vars at spawn (they
 * win over `.env` since `loadConfig` never overrides real env), and live changes
 * are pushed to `POST /api/iris/runtime/keys` (token-guarded).
 *
 * Lifecycle: SIGTERM/SIGINT → remove lockfile, close server, exit. The embedder
 * stops the daemon by `process.kill(pid, 'SIGTERM')`.
 */

import net from 'node:net';
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { loadConfig, publicBaseUrl } from './config.js';
import { buildServer } from './server.js';
import { writeDaemonLockfile, removeDaemonLockfile } from './daemon-lockfile.js';

/** Reserve a free loopback port (fallback when the preferred port is taken). */
function findFreePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, host, () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** Listen on `port`, falling back to a free port if it's already in use. */
async function listenWithFallback(
  app: FastifyInstance,
  host: string,
  port: number,
): Promise<number> {
  try {
    await app.listen({ host, port });
    return port;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      const free = await findFreePort(host);
      await app.listen({ host, port: free });
      return free;
    }
    throw e;
  }
}

async function main(): Promise<void> {
  const config = await loadConfig();
  const token = randomBytes(24).toString('hex');
  const app = await buildServer(config, { runtimeKeyToken: token });

  const port = await listenWithFallback(app, config.host, config.port);
  const baseUrl = publicBaseUrl(config.host, port);

  await writeDaemonLockfile(config.dataDir, {
    pid: process.pid,
    port,
    host: config.host,
    baseUrl,
    token,
    startedAt: new Date().toISOString(),
  });

  // eslint-disable-next-line no-console
  console.log(
    `[iris-daemon] listening on ${baseUrl} (pid ${process.pid}, data: ${config.dataDir}, ` +
      `providers: ${config.configuredProviders.join(', ') || 'none'})`,
  );

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await removeDaemonLockfile(config.dataDir);
    await app.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(error => {
  // eslint-disable-next-line no-console
  console.error('[iris-daemon] failed to start:', error);
  process.exit(1);
});
