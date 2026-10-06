/**
 * LocalNodeCacheStore — disk persistence for the engine's node result cache.
 *
 * One JSON file per workflow maps cache keys to entries:
 *
 *   <dataDir>/cache/<workflowId>.json   Record<cacheKey, NodeCacheEntry>
 *
 * Every mutation is a read-modify-write under `withFileLock`, so concurrent
 * node writes from one run never clobber each other. The local host is single
 * user, so the `userId` the engine passes is not part of the key.
 *
 * Limits mirror the cloud store: at most `MAX_CACHE_ENTRIES_PER_WORKFLOW`
 * entries per workflow (least recently used evicted first) and entries unused
 * for `CACHE_RETENTION_DAYS` are removed by `cleanupExpired()` (run when the
 * local engine starts).
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  CACHE_RETENTION_DAYS,
  MAX_CACHE_ENTRIES_PER_WORKFLOW,
} from 'iris-engine';
import type { NodeCacheEntry } from 'iris-engine';
import { withFileLock, readJson, writeJson, listJsonIds } from './fs-util.js';

type CacheFile = Record<string, NodeCacheEntry>;

/** Workflow ids become file names; anything else is refused. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

const DAY_MS = 24 * 60 * 60 * 1000;

function lastUsedMs(entry: NodeCacheEntry): number {
  const ms = Date.parse(entry.lastUsedAt ?? entry.createdAt ?? '');
  return Number.isFinite(ms) ? ms : 0;
}

export class LocalNodeCacheStore {
  private cacheDir: string;

  constructor(dataDir: string) {
    this.cacheDir = path.join(dataDir, 'cache');
  }

  private cacheFile(workflowId: string): string {
    return path.join(this.cacheDir, `${workflowId}.json`);
  }

  private async readFile(file: string): Promise<CacheFile> {
    try {
      const data = await readJson<CacheFile>(file, {});
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch {
      // A corrupt cache file is just an empty cache.
      return {};
    }
  }

  /** Look up an entry; a hit refreshes `lastUsedAt` on disk. */
  async get(workflowId: string, cacheKey: string): Promise<NodeCacheEntry | null> {
    if (!SAFE_ID.test(workflowId)) return null;
    const file = this.cacheFile(workflowId);
    return withFileLock(file, async () => {
      const data = await this.readFile(file);
      const entry = data[cacheKey];
      if (!entry) return null;
      const touched: NodeCacheEntry = {
        ...entry,
        lastUsedAt: new Date().toISOString(),
      };
      data[cacheKey] = touched;
      await writeJson(file, data);
      return touched;
    });
  }

  /** Insert or replace an entry, evicting the least recently used past the cap. */
  async put(workflowId: string, entry: NodeCacheEntry): Promise<void> {
    if (!SAFE_ID.test(workflowId)) return;
    const file = this.cacheFile(workflowId);
    await withFileLock(file, async () => {
      const data = await this.readFile(file);
      data[entry.cacheKey] = entry;
      const keys = Object.keys(data);
      if (keys.length > MAX_CACHE_ENTRIES_PER_WORKFLOW) {
        keys
          .sort((a, b) => lastUsedMs(data[a]) - lastUsedMs(data[b]))
          .slice(0, keys.length - MAX_CACHE_ENTRIES_PER_WORKFLOW)
          .forEach(key => {
            delete data[key];
          });
      }
      await writeJson(file, data);
    });
  }

  /** Remove one entry (no-op when absent). */
  async delete(workflowId: string, cacheKey: string): Promise<void> {
    if (!SAFE_ID.test(workflowId)) return;
    const file = this.cacheFile(workflowId);
    await withFileLock(file, async () => {
      const data = await this.readFile(file);
      if (!(cacheKey in data)) return;
      delete data[cacheKey];
      if (Object.keys(data).length === 0) {
        await fs.rm(file, { force: true });
      } else {
        await writeJson(file, data);
      }
    });
  }

  /** Drop a workflow's whole cache (used when the workflow is deleted). */
  async clearWorkflow(workflowId: string): Promise<void> {
    if (!SAFE_ID.test(workflowId)) return;
    const file = this.cacheFile(workflowId);
    await withFileLock(file, async () => {
      await fs.rm(file, { force: true });
    });
  }

  /** Remove entries unused for `CACHE_RETENTION_DAYS`; empty files are deleted. */
  async cleanupExpired(now: number = Date.now()): Promise<{ removed: number }> {
    const cutoff = now - CACHE_RETENTION_DAYS * DAY_MS;
    let removed = 0;
    const ids = await listJsonIds(this.cacheDir);
    for (const workflowId of ids) {
      if (!SAFE_ID.test(workflowId)) continue;
      const file = this.cacheFile(workflowId);
      await withFileLock(file, async () => {
        const data = await this.readFile(file);
        let changed = false;
        for (const [key, entry] of Object.entries(data)) {
          if (lastUsedMs(entry) < cutoff) {
            delete data[key];
            removed += 1;
            changed = true;
          }
        }
        if (Object.keys(data).length === 0) {
          await fs.rm(file, { force: true });
        } else if (changed) {
          await writeJson(file, data);
        }
      });
    }
    return { removed };
  }
}
