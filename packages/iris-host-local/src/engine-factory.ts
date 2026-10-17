/**
 * createLocalWorkflowEngine — the local mirror of the cloud's
 * `createWorkflowEngine(prisma, storageService)` factory.
 *
 * It assembles a `WorkflowEngine` from the two local host ports (JSON-file
 * `LocalWorkflowStore` + disk-backed `LocalNodeHost`) and returns the engine
 * alongside the store, since the local REST API reads workflows/executions
 * directly from the store (there is no separate persistence layer locally).
 */

import { WorkflowEngine } from 'iris-engine';
import { LocalWorkflowStore } from './local-workflow-store.js';
import type { ExecutionRecordStore } from './execution-records.js';
import { createLocalNodeHost } from './local-node-host.js';

export interface CreateLocalEngineOptions {
  dataDir: string;
  /** Lazily-resolved base URL of the local server (for public media URLs). */
  getPublicBaseUrl: () => string;
  /** Constant single-user id (default "local"). */
  userId?: string;
  /** Run record store (default: one JSON file per run). */
  executions?: ExecutionRecordStore;
  /**
   * Allow a failed output store to fall back to inline `data:` URIs / provider
   * URLs (default true, as before). The desktop app passes false so results
   * only ever travel as asset references.
   */
  allowInlineFallback?: boolean;
}

export interface LocalEngine {
  engine: WorkflowEngine;
  store: LocalWorkflowStore;
}

export function createLocalWorkflowEngine(
  opts: CreateLocalEngineOptions,
): LocalEngine {
  const store = new LocalWorkflowStore(opts.dataDir, { executions: opts.executions });
  const host = createLocalNodeHost({
    dataDir: opts.dataDir,
    store,
    getPublicBaseUrl: opts.getPublicBaseUrl,
    userId: opts.userId,
  });
  if (opts.allowInlineFallback === false) {
    host.media.allowInlineFallback = false;
  }
  const engine = new WorkflowEngine(store, host);
  return { engine, store };
}
