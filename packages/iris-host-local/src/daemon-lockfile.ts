/**
 * Daemon lockfile — the rendezvous between a long-lived `iris-host-local` server
 * process and whatever launched it (the desktop app). Written to
 * `<dataDir>/daemon.json` once the server is listening; read back to discover a
 * still-running daemon (and its port + runtime-key token) instead of spawning a
 * second one.
 *
 * Shared by the daemon entrypoint (`daemon.ts`) and the embedder (Electron main)
 * so the file shape + path stay in lockstep.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';

export interface DaemonLockfile {
  /** OS process id of the daemon — used for liveness checks + SIGTERM. */
  pid: number;
  port: number;
  host: string;
  /** Base URL clients reach the daemon at (e.g. `http://localhost:4747`). */
  baseUrl: string;
  /** Shared secret for the loopback `/api/iris/runtime/keys` push endpoint. */
  token: string;
  /** ISO timestamp the daemon started listening. */
  startedAt: string;
  version?: string;
}

export function daemonLockfilePath(dataDir: string): string {
  return path.join(dataDir, 'daemon.json');
}

export async function readDaemonLockfile(
  dataDir: string,
): Promise<DaemonLockfile | null> {
  try {
    const raw = await fs.readFile(daemonLockfilePath(dataDir), 'utf8');
    return JSON.parse(raw) as DaemonLockfile;
  } catch {
    return null;
  }
}

export async function writeDaemonLockfile(
  dataDir: string,
  lock: DaemonLockfile,
): Promise<void> {
  await fs.writeFile(
    daemonLockfilePath(dataDir),
    JSON.stringify(lock, null, 2),
    'utf8',
  );
}

export async function removeDaemonLockfile(dataDir: string): Promise<void> {
  try {
    await fs.unlink(daemonLockfilePath(dataDir));
  } catch {
    /* already gone */
  }
}

/** Whether a process with this pid is currently alive. `kill(pid, 0)` sends no
 *  signal — it only probes existence. ESRCH = gone; EPERM = alive but owned by
 *  another user (still running). */
export function isProcessAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}
