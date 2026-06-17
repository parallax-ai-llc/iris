#!/usr/bin/env node
/**
 * `npx iris-flow` entry point.
 *
 * Loads config (+ BYOK keys into process.env), starts the local Fastify server,
 * prints the URL, and opens a browser. No server/DB/cloud required — just the
 * user's own AI API keys.
 */

import { spawn } from 'node:child_process';
import { loadConfig, publicBaseUrl } from './config.js';
import { buildServer } from './server.js';

/** Open a URL in the default browser, cross-platform, with no extra deps. */
function openBrowser(url: string): void {
  const platform = process.platform;
  try {
    if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', '""', url], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    } else if (platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    // Non-fatal — the user can open the URL manually.
  }
}

async function main(): Promise<void> {
  const config = await loadConfig();
  const app = await buildServer(config);

  await app.listen({ port: config.port, host: config.host });
  const url = publicBaseUrl(config.host, config.port);

  // eslint-disable-next-line no-console
  console.log(`\n  iris-flow running at ${url}`);
  if (config.configuredProviders.length) {
    // eslint-disable-next-line no-console
    console.log(`  BYOK providers: ${config.configuredProviders.join(', ')}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(
      '  ⚠ No API keys found. Create a .env file (see .env.example) with ' +
        'e.g. OPENAI_API_KEY=... to run AI nodes.',
    );
  }
  // eslint-disable-next-line no-console
  console.log(`  Data dir: ${config.dataDir}\n`);

  if (config.openBrowser) openBrowser(url);

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(error => {
  // eslint-disable-next-line no-console
  console.error('iris-flow failed to start:', error);
  process.exit(1);
});
