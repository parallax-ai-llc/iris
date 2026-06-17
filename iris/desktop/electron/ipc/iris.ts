/**
 * Local Iris workflow engine — runs workflows fully locally (BYOK), not the
 * cloud. Two run modes share one REST surface (`iris-host-local`):
 *
 *  - **daemon** (default): a *detached* background Node process (spawned via
 *    `process.execPath` with `ELECTRON_RUN_AS_NODE`) that **outlives the app** —
 *    close the window and batch jobs / scheduled workflows keep running. A
 *    `<userData>/iris-flow/daemon.json` lockfile lets the next launch reattach
 *    instead of starting a second daemon. The renderer's IrisApiClient seam
 *    points at the daemon's port.
 *  - **in-process** (TEST_MODE only): the old embedded `buildServer` on an
 *    ephemeral port, so E2E stays deterministic and leaves no detached process.
 *
 * BYOK keys: a `.env` at `<userData>/iris-flow/.env` is the base; Settings can
 * OVERRIDE any key, stored encrypted (safeStorage) in `keys.json`. Override wins.
 * Electron owns the keys (only it can decrypt) and (a) passes them to the daemon
 * as env at spawn and (b) pushes live changes to the daemon's token-guarded
 * `/api/iris/runtime/keys`. The engine reads `process.env` per provider at run.
 */

import net from 'node:net';
import path from 'node:path';
import http from 'node:http';
import { promises as fs, openSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { app, ipcMain, shell, safeStorage } from 'electron';
import {
  loadConfig,
  buildServer,
  publicBaseUrl,
  readDaemonLockfile,
  removeDaemonLockfile,
  isProcessAlive,
  type ResolvedConfig,
  type DaemonLockfile,
} from 'iris-host-local';
import { API_KEY_ENV_MAPPING } from 'iris-engine';
import type { FastifyInstance } from 'fastify';

const isTestMode = process.env.TEST_MODE === 'true';

/** In-process server (TEST_MODE only). */
let server: FastifyInstance | null = null;
/** Detached daemon coordinates (production/dev). */
let daemonPid = 0;
let daemonToken = '';
let apiBaseUrl = '';
let dataDir = '';

/** Curated, de-duplicated list of provider key fields (the mapping has aliases
 *  sharing an env var, e.g. fal/pika → PIKA_API_KEY, x/xai → XAI_API_KEY). */
const KEY_FIELDS: ReadonlyArray<{ envVar: string; label: string }> = [
  { envVar: 'OPENAI_API_KEY', label: 'OpenAI' },
  { envVar: 'ANTHROPIC_API_KEY', label: 'Anthropic' },
  { envVar: 'GOOGLE_API_KEY', label: 'Google AI' },
  { envVar: 'XAI_API_KEY', label: 'xAI (Grok)' },
  { envVar: 'PERPLEXITY_API_KEY', label: 'Perplexity' },
  { envVar: 'DEEPSEEK_API_KEY', label: 'DeepSeek' },
  { envVar: 'STABILITY_API_KEY', label: 'Stability AI' },
  { envVar: 'REPLICATE_API_KEY', label: 'Replicate' },
  { envVar: 'PIKA_API_KEY', label: 'Fal.ai / Pika' },
  { envVar: 'IDEOGRAM_API_KEY', label: 'Ideogram' },
  { envVar: 'RECRAFT_API_KEY', label: 'Recraft' },
  { envVar: 'RUNWAY_API_KEY', label: 'Runway' },
  { envVar: 'LUMA_API_KEY', label: 'Luma' },
  { envVar: 'ELEVENLABS_API_KEY', label: 'ElevenLabs' },
  { envVar: 'SUNO_API_KEY', label: 'Suno' },
];

export interface IrisKeyStatus {
  envVar: string;
  label: string;
  /** A value is present from the `.env`/shell base. */
  hasEnv: boolean;
  /** A Settings-page override is set (wins over `.env`). */
  hasOverride: boolean;
  /** Last 4 chars of the effective value (for display); empty if unset. */
  last4: string;
}

// Base values from `.env` + shell env (captured at startup, no overrides).
let envBase: Record<string, string | undefined> = {};
// Settings-page overrides (decrypted), keyed by env var.
let overrides: Record<string, string> = {};

const ENV_TEMPLATE = `# Iris local workflow — BYOK provider API keys.
# Uncomment and fill the providers you want to use, then restart the app.
# (You can also set/override these from Settings → Workflow API Keys.)
#
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# GOOGLE_API_KEY=...
# XAI_API_KEY=...
# STABILITY_API_KEY=...
# REPLICATE_API_KEY=...
# ELEVENLABS_API_KEY=...
`;

function keysFile(): string {
  return path.join(dataDir, 'keys.json');
}

function encrypt(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64');
  }
  return value;
}

function decrypt(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(value, 'base64'));
    } catch {
      return value; // plaintext fallback / legacy
    }
  }
  return value;
}

async function loadOverrides(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(keysFile(), 'utf8');
    const stored = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [envVar, enc] of Object.entries(stored)) {
      if (enc) out[envVar] = decrypt(enc);
    }
    return out;
  } catch {
    return {};
  }
}

async function saveOverrides(): Promise<void> {
  const enc: Record<string, string> = {};
  for (const [envVar, value] of Object.entries(overrides)) {
    if (value) enc[envVar] = encrypt(value);
  }
  await fs.writeFile(keysFile(), JSON.stringify(enc, null, 2), 'utf8');
}

/** Recompute process.env for the known key fields: override ?? .env base. */
function applyKeys(): void {
  for (const { envVar } of KEY_FIELDS) {
    const value = overrides[envVar] ?? envBase[envVar];
    if (value) process.env[envVar] = value;
    else delete process.env[envVar];
  }
}

function keyStatus(): IrisKeyStatus[] {
  return KEY_FIELDS.map(({ envVar, label }) => {
    const effective = overrides[envVar] ?? envBase[envVar] ?? '';
    return {
      envVar,
      label,
      hasEnv: !!envBase[envVar],
      hasOverride: !!overrides[envVar],
      last4: effective ? effective.slice(-4) : '',
    };
  });
}

/** Reserve a free loopback port (engine media URLs are built from it). */
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

async function ensureEnvFile(): Promise<void> {
  const envPath = path.join(dataDir, '.env');
  try {
    await fs.access(envPath);
  } catch {
    await fs.writeFile(envPath, ENV_TEMPLATE, 'utf8');
  }
}

/** The effective key map (override ?? .env base) to hand the daemon. */
function mergedKeyMap(): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const { envVar } of KEY_FIELDS) {
    out[envVar] = overrides[envVar] ?? envBase[envVar] ?? null;
  }
  return out;
}

/** Load `.env` + overrides into process.env. Shared by both run modes. */
async function prepareKeysAndConfig(): Promise<ResolvedConfig> {
  dataDir = path.join(app.getPath('userData'), 'iris-flow');
  await fs.mkdir(dataDir, { recursive: true });
  await ensureEnvFile();

  // loadConfig reads `<IRIS_FLOW_DATA_DIR>/.env` (+ ~/.iris-flow/.env) into
  // process.env. Capture that as the base, then layer Settings overrides on top.
  process.env.IRIS_FLOW_DATA_DIR = dataDir;
  const config = await loadConfig();

  envBase = {};
  for (const { envVar } of KEY_FIELDS) envBase[envVar] = process.env[envVar];
  overrides = await loadOverrides();
  applyKeys();

  config.configuredProviders = Object.entries(API_KEY_ENV_MAPPING)
    .filter(([, envVar]) => !!process.env[envVar])
    .map(([provider]) => provider);
  return config;
}

// ── Daemon helpers (production/dev) ──────────────────────────────────────────

/** Path to the daemon entrypoint inside the installed `iris-host-local`. */
function daemonScriptPath(): string {
  return createRequire(import.meta.url).resolve('iris-host-local/daemon');
}

/** Minimal loopback JSON request (avoids pulling in a fetch polyfill in main). */
function httpJson(
  method: 'GET' | 'POST',
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
  timeoutMs = 3000,
): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const u = new URL(url);
    const req = http.request(
      {
        method,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        headers: {
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
        timeout: timeoutMs,
      },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          let json: unknown = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch {
            /* non-JSON */
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

async function healthOk(baseUrl: string): Promise<boolean> {
  try {
    const { status } = await httpJson('GET', `${baseUrl}/api/health`);
    return status === 200;
  } catch {
    return false;
  }
}

/** Push the current effective keys to a running daemon (token-guarded). */
async function pushKeysToDaemon(): Promise<void> {
  if (!apiBaseUrl || !daemonToken) return;
  try {
    await httpJson(
      'POST',
      `${apiBaseUrl}/api/iris/runtime/keys`,
      { keys: mergedKeyMap() },
      { 'x-iris-daemon-token': daemonToken },
    );
  } catch {
    /* daemon may be mid-restart — next ensureDaemon re-syncs */
  }
}

/** Spawn the detached daemon. process.env already carries the merged keys
 *  (applyKeys ran), so they're inherited; the daemon won't override real env. */
function spawnDaemon(): void {
  const script = daemonScriptPath();
  let stdout: number | 'ignore' = 'ignore';
  try {
    stdout = openSync(path.join(dataDir, 'daemon.log'), 'a');
  } catch {
    /* keep 'ignore' if the log can't be opened */
  }
  const child = spawn(process.execPath, [script], {
    cwd: dataDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      IRIS_FLOW_DATA_DIR: dataDir,
    },
    detached: true,
    stdio: ['ignore', stdout, stdout],
  });
  child.unref();
}

/** Poll the lockfile + health until the daemon is up (or time out). */
async function waitForDaemon(timeoutMs = 15000): Promise<DaemonLockfile> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const lf = await readDaemonLockfile(dataDir);
    if (lf && isProcessAlive(lf.pid) && (await healthOk(lf.baseUrl))) return lf;
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('iris daemon did not become ready in time');
}

/** Ensure a daemon is running: reattach to a live one, else spawn a new one. */
async function ensureDaemon(): Promise<void> {
  const existing = await readDaemonLockfile(dataDir);
  if (existing && isProcessAlive(existing.pid) && (await healthOk(existing.baseUrl))) {
    apiBaseUrl = existing.baseUrl;
    daemonToken = existing.token;
    daemonPid = existing.pid;
    await pushKeysToDaemon(); // re-sync in case keys changed since it started
    console.log(`[IrisEngine] reattached to daemon ${apiBaseUrl} (pid ${daemonPid})`);
    return;
  }
  if (existing) await removeDaemonLockfile(dataDir); // stale lockfile

  spawnDaemon();
  const lf = await waitForDaemon();
  apiBaseUrl = lf.baseUrl;
  daemonToken = lf.token;
  daemonPid = lf.pid;
  console.log(`[IrisEngine] started daemon ${apiBaseUrl} (pid ${daemonPid})`);
}

// ── Public lifecycle ─────────────────────────────────────────────────────────

/** Start the local engine. Daemon by default; in-process under TEST_MODE. */
export async function startIrisServer(): Promise<void> {
  const config = await prepareKeysAndConfig();

  if (isTestMode) {
    if (server) return;
    config.host = '127.0.0.1';
    config.port = await findFreePort('127.0.0.1');
    server = await buildServer(config);
    await server.listen({ host: config.host, port: config.port });
    apiBaseUrl = publicBaseUrl(config.host, config.port);
    console.log(
      `[IrisEngine] in-process server on ${apiBaseUrl} (test mode, providers: ${
        config.configuredProviders.join(', ') || 'none'
      })`,
    );
    return;
  }

  await ensureDaemon();
}

/**
 * App shutdown hook. In TEST_MODE this closes the in-process server. In daemon
 * mode it is intentionally a NO-OP — the daemon must survive the app closing
 * (that's the whole point). Use `stopDaemon()` (tray) to actually stop it.
 */
export async function stopIrisServer(): Promise<void> {
  if (!server) return;
  try {
    await server.close();
  } finally {
    server = null;
    apiBaseUrl = '';
  }
}

/** Whether a daemon is currently running (for the tray). */
export async function isDaemonRunning(): Promise<boolean> {
  if (isTestMode) return !!server;
  const lf = await readDaemonLockfile(dataDir);
  return !!(lf && isProcessAlive(lf.pid));
}

/** Explicitly stop the background daemon (tray "Stop background engine"). */
export async function stopDaemon(): Promise<void> {
  if (isTestMode) {
    await stopIrisServer();
    return;
  }
  const lf = await readDaemonLockfile(dataDir);
  if (lf && isProcessAlive(lf.pid)) {
    try {
      process.kill(lf.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
  await removeDaemonLockfile(dataDir);
  apiBaseUrl = '';
  daemonPid = 0;
  daemonToken = '';
}

/** (Re)start the daemon (tray "Start background engine"). */
export async function startDaemon(): Promise<void> {
  if (!dataDir) await prepareKeysAndConfig();
  await ensureDaemon();
}

export function setupIrisHandlers(): void {
  // Renderer reads this once on boot to build its local IrisApiClient.
  ipcMain.handle('iris:getApiBaseUrl', () => apiBaseUrl);

  // Open the BYOK .env in the OS default editor.
  ipcMain.handle('iris:openEnvFile', async () => {
    if (!dataDir) return false;
    await ensureEnvFile();
    await shell.openPath(path.join(dataDir, '.env'));
    return true;
  });

  // Settings page: read key status (never returns raw keys).
  ipcMain.handle('iris:getKeyStatus', () => keyStatus());

  // Settings page: set/clear an override. Empty value clears it (falls back to
  // .env). Takes effect immediately for new executions.
  ipcMain.handle('iris:setKey', async (_e, envVar: string, value: string) => {
    if (!KEY_FIELDS.some((f) => f.envVar === envVar)) {
      throw new Error(`Unknown key field: ${envVar}`);
    }
    const trimmed = (value ?? '').trim();
    if (trimmed) overrides[envVar] = trimmed;
    else delete overrides[envVar];
    await saveOverrides();
    applyKeys();
    // Push the change to the running daemon so it takes effect without a
    // restart (no-op in TEST_MODE / when no daemon is up).
    await pushKeysToDaemon();
    return keyStatus();
  });
}
