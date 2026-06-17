/**
 * NodeExecutorHost — the concrete host seam the node executor + handlers run
 * against once they move into the engine.
 *
 * Where `ports.ts` sketches the high-level orchestrator contract (Phase 0),
 * this interface is shaped to the *actual* call sites in node-executor.ts and
 * the handler files. It is expressed entirely in **engine-native types** — no
 * `@prisma/client`, no `StorageService`, no GCS `Storage` — so the engine never
 * depends on a server runtime. Each host supplies its own implementation:
 *
 *   Parallax cloud  →  Prisma + GCS StorageService + token plans + Whisper
 *   iris-host-local →  JSON store + local disk + no-op meter + local Whisper
 *   iris/desktop    →  Electron main + disk + OS keychain
 *
 * API-key resolution is intentionally NOT part of this host: the engine reads
 * provider keys from `process.env` via `getApiKeyForProvider` (see
 * `node-executor-config.ts`). The cloud sets server env; a local host populates
 * `process.env` from the user's BYOK settings. That keeps the BYOK seam env-
 * based and host-agnostic.
 */

import type { AssetKind } from './domain.js';
import type {
  NodeDefinition,
  AssetReference,
  UsageInfo,
} from './types.js';

/** A media output emitted by a provider adapter, ready to be persisted. */
export interface AdapterMediaOutput {
  type: 'image' | 'video' | 'audio' | 'text';
  url?: string;
  base64?: string;
  metadata?: Record<string, unknown>;
}

/** Engine-native reference to a stored asset (replaces the Prisma `IrisAsset`
 *  row that the server returns). Only the fields the engine actually reads. */
export interface EngineStoredAsset {
  /** Library asset id, used in the emitted `AssetReference.id`. */
  id: string;
  /** Logical folder/path the asset lives under. */
  path: string;
  /** Host-internal storage path (for later decryption / temp-url). */
  storagePath?: string | null;
}

export interface StoreOutputInput {
  output: AdapterMediaOutput;
  userId: string;
  storagePath?: string;
  workflowId?: string;
  executionId?: string;
  nodeId?: string;
  /** Base file name (e.g. a Suno title, or `generated-<type>`). */
  baseName?: string;
  parentAssetId?: string;
  // AI-generation provenance recorded on the asset.
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  provider?: string;
}

export interface StoreOutputResult {
  success: boolean;
  /** API URL for the stored object (e.g. `/api/iris/assets/{id}/download`). */
  apiUrl?: string;
  asset?: EngineStoredAsset;
  assetType?: 'IMAGE' | 'VIDEO' | 'AUDIO';
  error?: string;
}

/** Source for a public-storage put (the OUTPUT_STORAGE node). */
export type PublicStoreSource =
  | { kind: 'bytes'; buffer: Buffer; contentType: string }
  | { kind: 'text'; text: string }
  | { kind: 'url'; url: string }
  | { kind: 'gcsUri'; uri: string };

export interface StorePublicInput {
  source: PublicStoreSource;
  /** User the object is namespaced under. */
  userId: string;
  /** Optional caller-supplied subfolder. */
  folder?: string;
}

export interface StorePublicResult {
  success: boolean;
  /** Publicly reachable URL of the stored object. */
  publicUrl?: string;
  assetType?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER';
  error?: string;
}

/** Read/write of media + temporary public exposure. Replaces direct GCS +
 *  `media-storage-utils` usage in node-executor and the media/video handlers. */
export interface MediaHost {
  /** Persist a generated adapter output and record it in the library. */
  storeOutput(input: StoreOutputInput): Promise<StoreOutputResult>;

  /** Decrypt + read a stored asset's bytes (e.g. for local image processing). */
  downloadDecrypted(input: {
    userId: string;
    storagePath: string;
  }): Promise<{ buffer: Buffer; contentType?: string }>;

  /** Expose a stored (encrypted) asset at a temporary public URL so an external
   *  provider (Replicate, fal.ai, …) can fetch it. */
  getTempPublicUrlForAsset(input: {
    userId: string;
    storagePath: string;
    provider: string;
    contentType?: string;
  }): Promise<{ success: boolean; publicUrl?: string; error?: string }>;

  /** Store arbitrary data (base64/url/gs:/text) to a public location and return
   *  its URL. Backs the OUTPUT_STORAGE node. */
  storePublic(input: StorePublicInput): Promise<StorePublicResult>;
}

/** Read access to library assets (replaces `prisma.irisAsset.findUnique`). */
export interface AssetHost {
  /** Resolve an asset id to the fields the engine needs, or null if missing. */
  getAssetById(id: string): Promise<EngineStoredAssetInfo | null>;
}

export interface EngineStoredAssetInfo {
  /** Host-internal storage path. Nullable: an asset row may predate storage
   *  migration or be URL-only — the engine must guard before decrypting. */
  storagePath: string | null;
  userId: string;
  mimeType: string | null;
  metadata?: Record<string, unknown> | null;
}

/** A workflow node as the agent tool-selector needs it (replaces the Prisma
 *  `IrisNode` row read in agent mode). */
export interface EngineWorkflowNode {
  nodeId: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
}

/** Read access to a workflow's nodes (replaces `prisma.irisWorkflow.findUnique`
 *  with `include: { nodes }` in GEN_TEXT_TO_TEXT agent mode). */
export interface WorkflowHost {
  listNodes(workflowId: string): Promise<EngineWorkflowNode[]>;
}

export interface TokenCheckResult {
  allowed: boolean;
  message?: string;
  requiredTokens?: number;
  remainingTokens?: number;
}

export interface TokenUsageOpts {
  durationSeconds?: number;
  textLength?: number;
}

/** Pre-check + post-record AI usage. Cloud enforces token plans; local no-ops
 *  (always allow, consume 0). Replaces `getIrisTokenService()`. */
export interface UsageHost {
  checkNodeTokens(
    userId: string,
    nodeType: string,
    modelId: string | undefined,
    opts: TokenUsageOpts,
  ): Promise<TokenCheckResult>;

  consumeNodeTokens(
    userId: string,
    nodeType: string,
    modelId: string | undefined,
    opts: TokenUsageOpts,
  ): Promise<number>;

  /** Deduct tokens directly from the user's current period (WEB nodes). */
  addTokensToCurrentPeriod(userId: string, tokens: number): Promise<void>;
}

export interface TranscriptionResult {
  srt: string;
  vtt: string;
  text: string;
  /** Media duration in seconds (used for token accounting). */
  duration: number;
}

export interface TranscriptionOpts {
  model?: string;
  language?: string;
  prompt?: string;
}

/** Whisper-style transcription. Cloud uses OpenAI; the engine never imports the
 *  OpenAI SDK itself. Replaces `transcribeBufferToFormats(openai, …)`. */
export interface TranscriptionHost {
  transcribe(
    buffer: Buffer,
    mimeType: string,
    opts: TranscriptionOpts,
  ): Promise<TranscriptionResult>;
}

/** A node-execution result as the heavy-handler seam returns it. Engine-native
 *  shape — no server types leak across the port. */
export interface HostNodeResult {
  outputs: Record<string, unknown>;
  assets: AssetReference[];
  usage?: UsageInfo;
}

/** A handler context (the subset of execution metadata the heavy handlers read). */
export interface HandlerExecutionContext {
  executionId: string;
  workflowId: string;
  userId: string;
}

/**
 * Optional host-provided node handlers for node types whose implementation
 * pulls in heavyweight, non-portable deps the engine intentionally avoids
 * (trap #1): the ffmpeg video/audio editors (`ffmpeg-static` ~80MB binary) and
 * the Google Sheets append (`googleapis`). The engine declares the port; a host
 * that can run them (the Parallax cloud) wires the implementations in
 * `createServerNodeHost`. A host that cannot (e.g. a minimal local host) omits
 * them — the engine then surfaces a clear `NODE_NOT_SUPPORTED` (501) for those
 * node types rather than crashing on a missing dynamic import.
 *
 * The lighter handlers (`genLipSync`, `outputSlackPost`) moved into the engine
 * directly — they have no heavy deps — so they are NOT part of this seam.
 */
export interface ExtraNodeHandlers {
  videoMerge?(
    node: NodeDefinition,
    inputs: Record<string, unknown>,
    context: HandlerExecutionContext,
  ): Promise<HostNodeResult>;
  videoOverlay?(
    node: NodeDefinition,
    inputs: Record<string, unknown>,
    context: HandlerExecutionContext,
  ): Promise<HostNodeResult>;
  audioSeparate?(
    node: NodeDefinition,
    inputs: Record<string, unknown>,
    context: HandlerExecutionContext,
  ): Promise<HostNodeResult>;
  sheetAppend?(
    node: NodeDefinition,
    inputs: Record<string, unknown>,
  ): Promise<HostNodeResult>;
}

/** Everything node-executor + handlers need from their host, assembled once. */
export interface NodeExecutorHost {
  media: MediaHost;
  assets: AssetHost;
  workflow: WorkflowHost;
  usage: UsageHost;
  transcription: TranscriptionHost;
  /** Host-provided heavy node handlers (ffmpeg / googleapis). Optional: a host
   *  that omits a handler makes that node type unsupported on that host. */
  handlers?: ExtraNodeHandlers;
}

// Re-exported so hosts can annotate AssetKind on stored outputs if desired.
export type { AssetKind };
