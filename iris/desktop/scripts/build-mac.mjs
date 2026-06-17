#!/usr/bin/env node
/**
 * Serial macOS build: builds x64 and arm64 DMG/ZIP one at a time, with
 * cleanup between archs. Parallel DMG creation overloads DiskArbitration
 * and causes "hdiutil: detach: timeout" failures.
 *
 * Usage:
 *   node scripts/build-mac.mjs
 */

import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

if (process.platform !== 'darwin') {
  console.error('build-mac.mjs only runs on darwin');
  process.exit(1);
}

// Set environment variables for dmg-builder timeout
process.env.DMG_BUILDER_TIMEOUT = '600'; // 10 minutes
process.env.DMG_BUILD_TIMEOUT = '600';
process.env.HDIUTIL_TIMEOUT = '600';

function run(cmd, args, cwd = projectRoot) {
  return new Promise((resolvePromise, rejectPromise) => {
    console.log(`\n> ${cmd} ${args.join(' ')}\n`);
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', env: process.env });
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', rejectPromise);
  });
}

function cleanup() {
  const cleanupScript = resolve(__dirname, 'mac-cleanup.mjs');
  spawnSync(process.execPath, [cleanupScript], { stdio: 'inherit' });
}

async function buildArch(arch) {
  const maxAttempts = 3; // Increased from 2 to 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    cleanup();
    try {
      await run('pnpm', ['exec', 'electron-builder', '--mac', `--${arch}`, '--publish', 'never']);
      return;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      console.warn(`\n[build-mac] ${arch} build failed (attempt ${attempt}), retrying...\n`);
      cleanup();
      await new Promise((r) => setTimeout(r, 5000)); // Increased from 3000ms to 5000ms
    }
  }
}

try {
  await run('pnpm', ['release:clean']);
  await run('pnpm', ['exec', 'tsc']);
  await run('pnpm', ['exec', 'vite', 'build']);

  await buildArch('x64');
  await buildArch('arm64');

  cleanup();
  console.log('\n[build-mac] all archs built successfully\n');
} catch (err) {
  cleanup();
  console.error(err.message);
  process.exit(1);
}
