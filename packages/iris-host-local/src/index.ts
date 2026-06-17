/**
 * iris-host-local — public API surface.
 *
 * The open-source local host for the Iris workflow engine. It implements the
 * engine's two host ports against plain disk:
 *   - `LocalWorkflowStore`  → JSON-file persistence (`WorkflowStore`)
 *   - `createLocalNodeHost` → disk media + no-op meter + BYOK Whisper
 *                             (`NodeExecutorHost`)
 * and assembles them with `createLocalWorkflowEngine`. `buildServer` exposes the
 * REST API the editor calls; `npx iris-flow` (cli) wires it all together.
 *
 * These exports let the host be embedded programmatically (e.g. the desktop app
 * embedding the engine for local execution, Phase 6).
 */

export { LocalWorkflowStore } from './local-workflow-store.js';
export type {
  StoredWorkflow,
  StoredExecution,
  StoredNodeResult,
} from './local-workflow-store.js';
export { createLocalNodeHost } from './local-node-host.js';
export type { LocalNodeHostOptions } from './local-node-host.js';
export { createLocalWorkflowEngine } from './engine-factory.js';
export type {
  CreateLocalEngineOptions,
  LocalEngine,
} from './engine-factory.js';
export { loadConfig, publicBaseUrl } from './config.js';
export type { IrisFlowConfig, ResolvedConfig } from './config.js';
export { registerMediaServer } from './local-media-server.js';
export type { MediaServerOptions } from './local-media-server.js';
export { buildServer } from './server.js';
export type { BuildServerOptions } from './server.js';
export {
  daemonLockfilePath,
  readDaemonLockfile,
  writeDaemonLockfile,
  removeDaemonLockfile,
  isProcessAlive,
} from './daemon-lockfile.js';
export type { DaemonLockfile } from './daemon-lockfile.js';
export {
  LocalScheduler,
  CRON_PRESETS,
  validateCron,
  nextRunTime,
  supportedTimezones,
} from './scheduler.js';
export type { CronPreset, CronValidation } from './scheduler.js';
export { BatchManager, MAX_CONCURRENCY } from './batch.js';
export type {
  BatchJob,
  BatchJobSummary,
  BatchRow,
  BatchJobStatus,
  BatchRowStatus,
  CreateBatchInput,
} from './batch.js';
