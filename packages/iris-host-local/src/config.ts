/**
 * Local host configuration + BYOK key loading.
 *
 * Secrets (provider API keys) are managed the standard self-host way: a `.env`
 * file. The engine reads keys from `process.env` via `getApiKeyForProvider`
 * (see iris-engine `node-executor-config.ts`); this module just loads `.env`
 * into `process.env` before the engine runs. Keys are NEVER stored in a
 * config.json or anywhere this tool writes — `.env` is yours to gitignore.
 *
 * `.env` is loaded from (existing `process.env` always wins, then):
 *   1. ./.env                  (current working directory — the usual place)
 *   2. ~/.iris-flow/.env       (global per-user keys)
 *   3. <dataDir>/.env          (when the data dir is customized)
 *
 * Non-secret settings (port / host / dataDir / openBrowser) may optionally come
 * from `./iris-flow.json` or `~/.iris-flow/config.json`, or from env vars
 * (PORT, IRIS_FLOW_HOST, IRIS_FLOW_DATA_DIR, IRIS_FLOW_NO_OPEN).
 */

import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { API_KEY_ENV_MAPPING } from 'iris-engine';
import { readJsonOrNull } from './fs-util.js';

/** Non-secret settings only. API keys are NEVER read from here — use `.env`. */
export interface IrisFlowConfig {
  port?: number;
  host?: string;
  dataDir?: string;
  /** Whether the CLI should open a browser on start. */
  openBrowser?: boolean;
}

export interface ResolvedConfig {
  port: number;
  host: string;
  dataDir: string;
  openBrowser: boolean;
  /** Provider names whose keys are present in process.env. */
  configuredProviders: string[];
}

const DEFAULT_PORT = 4747;
const DEFAULT_HOST = '127.0.0.1';

function homeConfigPath(): string {
  return path.join(os.homedir(), '.iris-flow', 'config.json');
}

function cwdConfigPath(): string {
  return path.join(process.cwd(), 'iris-flow.json');
}

function defaultDataDir(): string {
  return path.join(os.homedir(), '.iris-flow', 'data');
}

/** Minimal `.env` parser. Mirrors dotenv semantics: `KEY=VALUE` per line,
 *  `#` comments, optional surrounding quotes, and **existing `process.env`
 *  values are never overwritten**. */
async function loadEnvFile(file: string): Promise<void> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch {
    return; // no .env here — fine
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] !== undefined) continue; // don't override real env
    let value = m[2].trim();
    // strip a trailing inline comment for unquoted values
    if (!/^["']/.test(value)) value = value.replace(/\s+#.*$/, '').trim();
    // strip matching surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

/**
 * Load `.env` into process.env + resolve server settings. Call once at startup,
 * before creating the engine.
 */
export async function loadConfig(): Promise<ResolvedConfig> {
  // 1) Load .env (cwd, then iris-flow home, then the data dir). The first file
  //    to define a var wins, and a real process.env value beats them all.
  await loadEnvFile(path.join(process.cwd(), '.env'));
  await loadEnvFile(path.join(os.homedir(), '.iris-flow', '.env'));
  const preDataDir =
    process.env.IRIS_FLOW_DATA_DIR || (await readSettingsDataDir()) || defaultDataDir();
  await loadEnvFile(path.join(preDataDir, '.env'));

  // 2) Detect which providers have a key in the environment.
  const configuredProviders = new Set<string>();
  for (const [provider, envVar] of Object.entries(API_KEY_ENV_MAPPING)) {
    if (process.env[envVar]) configuredProviders.add(provider);
  }

  // 3) Non-secret settings (env > cwd json > home json > defaults).
  const home = await readJsonOrNull<IrisFlowConfig>(homeConfigPath());
  const cwd = await readJsonOrNull<IrisFlowConfig>(cwdConfigPath());
  const merged: IrisFlowConfig = { ...home, ...cwd };

  const port = Number(process.env.PORT) || merged.port || DEFAULT_PORT;
  const host = process.env.IRIS_FLOW_HOST || merged.host || DEFAULT_HOST;
  const dataDir =
    process.env.IRIS_FLOW_DATA_DIR || merged.dataDir || defaultDataDir();
  const openBrowser =
    process.env.IRIS_FLOW_NO_OPEN === '1' ? false : merged.openBrowser !== false;

  return {
    port,
    host,
    dataDir,
    openBrowser,
    configuredProviders: [...configuredProviders],
  };
}

/** Peek at a configured dataDir (settings json) so we know where to look for a
 *  `<dataDir>/.env` before fully resolving settings. */
async function readSettingsDataDir(): Promise<string | undefined> {
  const cwd = await readJsonOrNull<IrisFlowConfig>(cwdConfigPath());
  if (cwd?.dataDir) return cwd.dataDir;
  const home = await readJsonOrNull<IrisFlowConfig>(homeConfigPath());
  return home?.dataDir;
}

/** The base URL clients (and external providers) reach this host at. Loopback
 *  bind addresses are presented as `localhost` — some setups (Windows IPv6
 *  resolution, proxies) don't route a raw `127.0.0.1` browser request, but
 *  `localhost` resolves and falls back correctly. */
export function publicBaseUrl(host: string, port: number): string {
  const loopback = ['0.0.0.0', '127.0.0.1', '::1', '::', 'localhost'];
  const presented = loopback.includes(host) ? 'localhost' : host;
  return `http://${presented}:${port}`;
}
