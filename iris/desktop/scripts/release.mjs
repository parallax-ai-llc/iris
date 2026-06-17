#!/usr/bin/env node
/**
 * Cross-platform release wrapper.
 * Loads .env.local (if present), then runs build + upload for the target.
 *
 * Usage:
 *   node scripts/release.mjs --target=win|mac|linux --env=dev|production
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const args = process.argv.slice(2);
const getArg = (name) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split('=')[1] : undefined;
};

const target = getArg('target');
const env = getArg('env');

if (!['win', 'mac', 'linux'].includes(target)) {
  console.error('Invalid --target. Use win|mac|linux');
  process.exit(1);
}
if (!['dev', 'production'].includes(env)) {
  console.error('Invalid --env. Use dev|production');
  process.exit(1);
}

const envFile = resolve(projectRoot, '.env.local');
if (existsSync(envFile)) {
  dotenv.config({ path: envFile });
  console.log(`Loaded env from ${envFile}`);
} else {
  console.log('.env.local not found, continuing with existing environment');
}

const isWindows = process.platform === 'win32';

function run(args, cwd = projectRoot) {
  return new Promise((resolvePromise, rejectPromise) => {
    console.log(`\n> pnpm ${args.join(' ')}\n`);
    const child = spawn('pnpm', args, {
      cwd,
      stdio: 'inherit',
      env: process.env,
      shell: isWindows,
    });
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`pnpm ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', rejectPromise);
  });
}

const uploadScript = env === 'production' ? 'release:upload:prod' : 'release:upload:dev';
const monorepoRoot = resolve(projectRoot, '..');

function macCleanup(setup = false) {
  if (process.platform !== 'darwin' || target !== 'mac') return;
  const cleanupScript = resolve(__dirname, 'mac-cleanup.mjs');
  const cleanupArgs = [cleanupScript];
  if (setup) cleanupArgs.push('--setup');
  spawnSync(process.execPath, cleanupArgs, { stdio: 'inherit' });
}

async function buildWithMacRetry() {
  if (target !== 'mac' || process.platform !== 'darwin') {
    await run([`release:build:${target}`]);
    return;
  }
  macCleanup(true);
  try {
    await run([`release:build:${target}`]);
  } catch (err) {
    console.warn('\n[release] mac build failed, cleaning up and retrying once...\n');
    macCleanup(false);
    await run([`release:build:${target}`]);
  }
}

try {
  await run(['--filter', 'iris-nodes', 'build'], monorepoRoot);
  await buildWithMacRetry();
  await run([uploadScript]);
} catch (err) {
  console.error(err.message);
  process.exit(1);
} finally {
  macCleanup(false);
}
