#!/usr/bin/env node
/**
 * Windows release build wrapper.
 *
 * Runs `electron-builder --win` with Azure Trusted Signing enabled when all
 * required env vars are present. Falls back to an unsigned build with a loud
 * warning when any are missing, so local dev builds still complete.
 *
 * Signing is handled by scripts/sign-windows.cjs which calls signtool.exe
 * directly from Node.js — bypassing the TrustedSigning PowerShell module's
 * Start-Process which has execution policy issues on some machines.
 *
 * Required env vars to enable signing:
 *   - TRUSTED_SIGNING_ENDPOINT              e.g. https://<region>.codesigning.azure.net
 *   - TRUSTED_SIGNING_ACCOUNT_NAME          Azure Trusted Signing account
 *   - TRUSTED_SIGNING_CERT_PROFILE_NAME     certificate profile in that account
 *   - AZURE_TENANT_ID                       Entra ID tenant
 *   - AZURE_CLIENT_ID                       service principal app id
 *   - AZURE_CLIENT_SECRET                   service principal secret
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const REQUIRED = [
  'TRUSTED_SIGNING_ENDPOINT',
  'TRUSTED_SIGNING_ACCOUNT_NAME',
  'TRUSTED_SIGNING_CERT_PROFILE_NAME',
  'AZURE_TENANT_ID',
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET',
];

const missing = REQUIRED.filter((k) => !process.env[k]);
const signingEnabled = missing.length === 0;

const builderArgs = ['exec', 'electron-builder', '--win', '--publish', 'never'];

let tempConfigPath = null;

if (signingEnabled) {
  console.log('[build-win] Azure Trusted Signing enabled → sign-windows.cjs');

  // sign path must use forward slashes inside JSON to avoid JSON parse issues
  const signScript = resolve(__dirname, 'sign-windows.cjs').replace(/\\/g, '/');

  // Read the base build config from package.json so --config doesn't lose
  // icon, nsis settings, artifactName, etc. (electron-builder treats --config
  // as the sole config source, not an overlay on top of package.json).
  const pkg = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'));
  const baseConfig = pkg.build ?? {};

  const fullConfig = {
    ...baseConfig,
    win: {
      ...baseConfig.win,
      signtoolOptions: {
        sign: signScript,
      },
    },
  };

  tempConfigPath = resolve(tmpdir(), `iris-eb-win-${Date.now()}.json`);
  writeFileSync(tempConfigPath, JSON.stringify(fullConfig));
  builderArgs.push('--config', tempConfigPath);
} else {
  console.warn(
    `[build-win] WARNING: producing UNSIGNED build. Missing env vars: ${missing.join(', ')}`,
  );
}

const isWindows = process.platform === 'win32';

const child = spawn('pnpm', builderArgs, {
  cwd: projectRoot,
  stdio: 'inherit',
  env: process.env,
  shell: isWindows,
});

child.on('exit', (code) => {
  if (tempConfigPath) {
    try { unlinkSync(tempConfigPath); } catch (_) {}
  }
  process.exit(code ?? 1);
});

child.on('error', (err) => {
  if (tempConfigPath) {
    try { unlinkSync(tempConfigPath); } catch (_) {}
  }
  console.error(err);
  process.exit(1);
});
