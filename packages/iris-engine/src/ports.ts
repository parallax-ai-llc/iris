// Host ports — the seams that decouple the engine from any specific runtime.
//
// The engine depends ONLY on these interfaces. Each host supplies its own
// implementation:
//
//   Parallax cloud (closed source)   →  Prisma store, GCS storage, token meter,
//                                        server-env secrets
//   iris-host-local (open source)     →  JSON-file store, local-disk storage,
//                                        no-op meter, BYOK secrets from .env / UI
//   iris/desktop (future)             →  Electron main-process store + secrets
//
// This is the single most important contract in the extraction: get these right
// and the 9.6k-line engine becomes portable without touching node logic.
//
// NOTE: the idealized `WorkflowStore` / `ExecutionLogEntry` / `EngineHost`
// sketches that once lived here have been **realized** as the concrete,
// call-site-shaped ports `WorkflowStore` (`./workflow-store.ts`) and
// `NodeExecutorHost` (`./node-host.ts`). The remaining interfaces below are
// still high-level sketches kept for reference.

import type {
  AssetKind,
  ExecutionContext,
  ExecutionStatus,
  UsageRecord,
} from './domain.js';
import type { AssetReference, NodeResult } from './types.js';

/** Read/write of binary media. Replaces the server's GCS `StorageService`. */
export interface MediaStorage {
  /** Resolve a stored object (or remote URL) to bytes for node processing. */
  read(ctx: ExecutionContext, ref: { url?: string; storagePath?: string }): Promise<Buffer>;

  /** Persist bytes and return a reference (url and/or host-internal path). */
  write(
    ctx: ExecutionContext,
    data: Buffer,
    opts: { mimeType?: string; fileName?: string; kind?: AssetKind },
  ): Promise<AssetReference>;
}

/** The BYOK seam. Resolves the credential a provider adapter needs.
 *  - Cloud host: returns the server's shared env key.
 *  - Local host: returns the user's own key from .env / the settings UI. */
export interface SecretProvider {
  /** `provider` is a provider name like `openai`, `anthropic`, `replicate`. */
  getApiKey(ctx: ExecutionContext, provider: string): Promise<string | undefined>;
}

/** The billing/quota seam. Cloud host enforces token plans; local host no-ops. */
export interface UsageMeter {
  /** Called before an AI node runs. Reject to block execution (e.g. no balance). */
  check(
    ctx: ExecutionContext,
    node: { type: string; model?: string },
  ): Promise<{ allowed: boolean; reason?: string }>;

  /** Called after an AI node runs, with what it consumed. */
  record(ctx: ExecutionContext, usage: UsageRecord): Promise<void>;
}

/** Engine lifecycle events for progress UIs. Implementations may bridge this to
 *  an EventEmitter, websocket, or polling table. */
export interface EngineEventSink {
  emit(event: EngineEvent): void;
}

export type EngineEvent =
  | { type: 'execution:started'; executionId: string }
  | { type: 'node:started'; executionId: string; nodeId: string }
  | { type: 'node:completed'; executionId: string; nodeId: string; result: NodeResult }
  | { type: 'node:failed'; executionId: string; nodeId: string; error: string }
  | { type: 'execution:completed'; executionId: string; status: ExecutionStatus };

export interface EngineLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/** High-level sketch of the engine's host surface. The concrete, realized
 *  ports are `WorkflowStore` (`./workflow-store.ts`) for persistence and
 *  `NodeExecutorHost` (`./node-host.ts`) for media/usage/etc. */
export interface EngineHost {
  storage: MediaStorage;
  secrets: SecretProvider;
  usage: UsageMeter;
  events?: EngineEventSink;
  logger?: EngineLogger;
}
