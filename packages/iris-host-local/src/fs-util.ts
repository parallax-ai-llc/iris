/**
 * Filesystem helpers shared by the local store and host.
 *
 * The store keeps a workflow/execution as one JSON file each and rewrites the
 * whole file on every mutation (atomically, see `writeJson`). Because a single execution fans several node
 * writes at the same file concurrently, every write is funnelled through a
 * per-path promise chain (`withFileLock`) so the last writer never clobbers an
 * in-flight read-modify-write.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Per-path serialization queue (simple in-process mutex). */
const fileLocks = new Map<string, Promise<unknown>>();

/** Run `fn` exclusively for `key`, serializing concurrent callers. */
export function withFileLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = fileLocks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  // Keep the chain alive but swallow rejections so one failure doesn't poison
  // the queue for later writers.
  fileLocks.set(
    key,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/** Read + parse a JSON file, or return `fallback` if it doesn't exist. */
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}

/** Read + parse a JSON file, or return null if it doesn't exist. */
export async function readJsonOrNull<T>(file: string): Promise<T | null> {
  return readJson<T | null>(file, null);
}

let tmpCounter = 0;

/**
 * Pretty-write a JSON file (creating its parent directory) atomically: the
 * bytes go to a temp file next to it, are fsynced, then renamed over the
 * target. A reader sees the old file or the new one, never a half-written
 * one, and a crash mid-write leaves the old file intact (W-20).
 */
export async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFileAtomic(file, JSON.stringify(value, null, 2));
}

/** Atomic text write (temp file + fsync + rename). */
export async function writeFileAtomic(file: string, data: string): Promise<void> {
  const dir = path.dirname(file);
  await ensureDir(dir);
  const tmp = path.join(
    dir,
    `.${path.basename(file)}.${process.pid}.${Date.now()}.${tmpCounter++}.tmp`,
  );
  const handle = await fs.open(tmp, 'w');
  try {
    await handle.writeFile(data, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await renameWithRetry(tmp, file);
  } catch (error) {
    await fs.unlink(tmp).catch(() => undefined);
    throw error;
  }
}

/** Windows refuses a rename over a file another handle is reading
 *  (EPERM/EACCES/EBUSY) for a moment; retry briefly before giving up. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const retryable = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
      if (!retryable || attempt >= 20) throw error;
      await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
}

/** List the ids (filenames without `.json`) in a directory. */
export async function listJsonIds(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter(e => e.endsWith('.json'))
      .map(e => e.slice(0, -'.json'.length));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
