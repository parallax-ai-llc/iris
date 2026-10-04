/**
 * LocalNodeHost — the open-source local implementation of the engine's
 * `NodeExecutorHost` port (the seam node-executor + handlers run against).
 *
 * Where the Parallax cloud wires this to GCS + Prisma + token plans + OpenAI
 * Whisper (`createServerNodeHost`), the local host wires it to plain disk and a
 * no-op meter:
 *
 *   media         → write/read files under <dataDir>/assets, public copies under
 *                   <dataDir>/public (served by the local Fastify server).
 *   assets        → read an asset's sidecar metadata by id.
 *   workflow      → list a workflow's nodes via the LocalWorkflowStore.
 *   usage         → no-op (local is unmetered: always allow, consume 0).
 *   transcription → OpenAI Whisper via raw fetch using the user's BYOK key.
 *   handlers      → omitted (ffmpeg video/audio + Sheets append) → the engine
 *                   surfaces NODE_NOT_SUPPORTED (501) for those node types.
 *
 * No encryption (the cloud's GCS+AES is replaced by raw files), single user
 * (`userId` is a constant from the host), no billing.
 */

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type {
  NodeExecutorHost,
  MediaHost,
  AssetHost,
  WorkflowHost,
  UsageHost,
  TranscriptionHost,
  StoreOutputInput,
  StoreOutputResult,
  StorePublicInput,
  StorePublicResult,
  EngineStoredAssetInfo,
  EngineWorkflowNode,
  TokenCheckResult,
  TranscriptionResult,
  TranscriptionOpts,
} from 'iris-engine';
import {
  PUBLIC_STORE_FORMATS,
  PUBLIC_STORE_MAX_BYTES,
  isValidAssetId,
  publicStoreFormat,
  safeHttpFetchBuffer,
} from 'iris-engine';
import { ensureDir, readJsonOrNull, writeJson } from './fs-util.js';
import type { LocalWorkflowStore } from './local-workflow-store.js';

export interface LocalNodeHostOptions {
  dataDir: string;
  store: LocalWorkflowStore;
  /** Lazily-resolved base URL of the local server (e.g. http://localhost:4747).
   *  Lazy because the server binds its port after the host is constructed. */
  getPublicBaseUrl: () => string;
  /** Constant single-user id (default "local"). */
  userId?: string;
  /** Whether UTIL_HTTP_REQUEST may call private / loopback addresses.
   *  Default `true`: self-host runs on the user's own machine, where hitting
   *  localhost services is legitimate. Set `false` to restore the engine's
   *  strict SSRF guard (e.g. when exposing the local host to others). The
   *  engine's timeout and response-size caps apply either way. */
  allowPrivateNetworkHttp?: boolean;
}

/** Sidecar metadata stored next to every persisted asset (one dir per asset). */
interface AssetMeta {
  id: string;
  userId: string;
  /** Logical path/folder reported back to the engine. */
  path: string;
  /** Absolute disk path of the data file. */
  storagePath: string;
  mimeType: string;
  assetType: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER';
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  provider?: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

function extForType(type: string, contentType?: string): string {
  if (contentType) {
    const sub = contentType.split('/')[1]?.split(';')[0];
    if (sub) return sub === 'jpeg' ? 'jpg' : sub;
  }
  switch (type) {
    case 'image':
      return 'png';
    case 'video':
      return 'mp4';
    case 'audio':
      return 'mp3';
    default:
      return 'txt';
  }
}

function mimeForType(type: string, contentType?: string): string {
  if (contentType) return contentType;
  switch (type) {
    case 'image':
      return 'image/png';
    case 'video':
      return 'video/mp4';
    case 'audio':
      return 'audio/mpeg';
    default:
      return 'text/plain';
  }
}

function assetTypeForType(
  type: string,
): 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER' {
  switch (type) {
    case 'image':
      return 'IMAGE';
    case 'video':
      return 'VIDEO';
    case 'audio':
      return 'AUDIO';
    default:
      return 'OTHER';
  }
}

/** Extensions the public dir may hold (see iris-engine public-store.ts). */
const publicStoreExts = new Set(
  Object.values(PUBLIC_STORE_FORMATS).map(f => f.ext),
);

/** Deadline for one OUTPUT_STORAGE download (media can be large). */
const PUBLIC_STORE_FETCH_TIMEOUT_MS = 120_000;

/** safe-http messages that mean a policy refusal rather than a transient
 *  network failure: the node fails instead of passing the URL through. */
const BLOCKED_FETCH_PATTERN =
  /was blocked|size limit|Unsupported protocol|Too many redirects/;

/** Strip an optional `data:<mime>;base64,` prefix from a base64 string. */
function stripDataUrl(b64: string): string {
  const comma = b64.indexOf(',');
  return b64.startsWith('data:') && comma !== -1 ? b64.slice(comma + 1) : b64;
}

class LocalMediaHost implements MediaHost {
  constructor(private opts: LocalNodeHostOptions) {}

  private assetsDir(): string {
    return path.join(this.opts.dataDir, 'assets');
  }

  private publicDir(): string {
    return path.join(this.opts.dataDir, 'public');
  }

  /** Path to an asset's sidecar metadata file (one directory per asset id). */
  private metaFile(id: string): string {
    return path.join(this.assetsDir(), id, 'meta.json');
  }

  async storeOutput(input: StoreOutputInput): Promise<StoreOutputResult> {
    try {
      const { output } = input;
      const contentType =
        (output.metadata?.contentType as string | undefined) ?? undefined;

      let buffer: Buffer;
      let resolvedContentType = contentType;
      if (output.base64) {
        buffer = Buffer.from(stripDataUrl(output.base64), 'base64');
      } else if (output.url) {
        const res = await fetch(output.url);
        if (!res.ok) {
          return { success: false, error: `Download failed: ${res.status}` };
        }
        resolvedContentType =
          resolvedContentType || res.headers.get('content-type') || undefined;
        buffer = Buffer.from(await res.arrayBuffer());
      } else {
        return { success: false, error: 'storeOutput: no base64 or url' };
      }

      const id = randomUUID();
      const ext = extForType(output.type, resolvedContentType);
      const mimeType = mimeForType(output.type, resolvedContentType);
      const assetType = assetTypeForType(output.type);
      const dir = path.join(this.assetsDir(), id);
      await ensureDir(dir);
      const baseName = (input.baseName || `generated-${output.type}`).replace(
        /[^\w.-]/g,
        '_',
      );
      const fileName = `${baseName}.${ext}`;
      const storagePath = path.join(dir, fileName);
      await fs.writeFile(storagePath, buffer);

      const logicalPath = input.storagePath || `assets/${id}/${fileName}`;
      const meta: AssetMeta = {
        id,
        userId: input.userId,
        path: logicalPath,
        storagePath,
        mimeType,
        assetType,
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        model: input.model,
        provider: input.provider,
        metadata: output.metadata ?? null,
        createdAt: new Date().toISOString(),
      };
      await writeJson(this.metaFile(id), meta);

      return {
        success: true,
        apiUrl: `/api/iris/assets/${id}/download`,
        assetType: assetType === 'OTHER' ? undefined : assetType,
        asset: { id, path: logicalPath, storagePath },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'storeOutput failed',
      };
    }
  }

  async downloadDecrypted(input: {
    userId: string;
    storagePath: string;
  }): Promise<{ buffer: Buffer; contentType?: string }> {
    // No encryption locally — storagePath is a plain disk path.
    const buffer = await fs.readFile(input.storagePath);
    return { buffer };
  }

  async getTempPublicUrlForAsset(input: {
    userId: string;
    storagePath: string;
    provider: string;
    contentType?: string;
  }): Promise<{ success: boolean; publicUrl?: string; error?: string }> {
    try {
      const buffer = await fs.readFile(input.storagePath);
      // Only allowlisted media extensions reach the public dir, so a served
      // file is never an HTML/SVG document on the engine's own origin.
      const fileExt = path.extname(input.storagePath).slice(1).toLowerCase();
      const ext = input.contentType
        ? publicStoreFormat(input.contentType).ext
        : publicStoreExts.has(fileExt)
          ? fileExt
          : 'bin';
      const url = await this.writePublic(buffer, ext);
      return { success: true, publicUrl: url };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'temp public url failed',
      };
    }
  }

  async storePublic(input: StorePublicInput): Promise<StorePublicResult> {
    try {
      const { source } = input;
      if (source.kind === 'gcsUri') {
        return {
          success: false,
          blocked: true,
          error: 'gcsUri sources are not supported on the local host',
        };
      }
      if (source.kind === 'text') {
        const url = await this.writePublic(
          Buffer.from(source.text, 'utf8'),
          'txt',
        );
        return { success: true, publicUrl: url, assetType: 'OTHER' };
      }
      let buffer: Buffer;
      let contentType: string | null;
      if (source.kind === 'url') {
        // Guarded fetch with the same network policy as UTIL_HTTP_REQUEST on
        // this host (private addresses allowed only when the host opts in),
        // plus the shared public-store size cap and a deadline.
        let res;
        try {
          res = await safeHttpFetchBuffer(
            source.url,
            { method: 'GET', headers: {} },
            {
              allowPrivateNetwork: this.opts.allowPrivateNetworkHttp ?? true,
              timeoutMs: PUBLIC_STORE_FETCH_TIMEOUT_MS,
              maxResponseBytes: PUBLIC_STORE_MAX_BYTES,
            },
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Could not fetch the URL';
          return {
            success: false,
            blocked: BLOCKED_FETCH_PATTERN.test(message),
            error: message,
          };
        }
        if (res.status < 200 || res.status >= 300) {
          return {
            success: false,
            error: `Remote URL responded with status ${res.status}`,
          };
        }
        buffer = res.body;
        contentType = res.contentType;
      } else {
        if (source.buffer.length > PUBLIC_STORE_MAX_BYTES) {
          return {
            success: false,
            blocked: true,
            error: `Data exceeds the ${PUBLIC_STORE_MAX_BYTES} byte limit for public storage.`,
          };
        }
        buffer = source.buffer;
        contentType = source.contentType;
      }
      // Allowlisted formats keep their type; anything else (HTML, SVG, XML,
      // scripts) is stored as .bin so the public dir never serves a document.
      const format = publicStoreFormat(contentType);
      const url = await this.writePublic(buffer, format.ext);
      return { success: true, publicUrl: url, assetType: format.assetType };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'storePublic failed',
      };
    }
  }

  /** Write bytes to the public dir and return their externally-shaped URL. */
  private async writePublic(buffer: Buffer, ext: string): Promise<string> {
    const dir = this.publicDir();
    await ensureDir(dir);
    const fileName = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    await fs.writeFile(path.join(dir, fileName), buffer);
    return `${this.opts.getPublicBaseUrl()}/public/${fileName}`;
  }
}

/**
 * Single-user host: every asset and every run belong to the host's one user
 * id, so the owner check is trivially satisfied here. The engine still
 * compares `userId` with the run user (asset-access.ts), and the id is
 * validated so it can never step outside `<dataDir>/assets`.
 */
class LocalAssetHost implements AssetHost {
  constructor(private opts: LocalNodeHostOptions) {}

  async getAssetById(
    id: string,
    requesterUserId: string,
  ): Promise<EngineStoredAssetInfo | null> {
    if (!isValidAssetId(id)) return null;
    const metaFile = path.join(this.opts.dataDir, 'assets', id, 'meta.json');
    const meta = await readJsonOrNull<AssetMeta>(metaFile);
    if (!meta) return null;
    const owner = meta.userId || this.opts.userId || 'local';
    if (owner !== requesterUserId) return null;
    return {
      storagePath: meta.storagePath,
      userId: owner,
      mimeType: meta.mimeType,
      metadata: meta.metadata ?? null,
    };
  }
}

class LocalWorkflowHost implements WorkflowHost {
  constructor(private opts: LocalNodeHostOptions) {}

  async listNodes(workflowId: string): Promise<EngineWorkflowNode[]> {
    const wf = await this.opts.store.getWorkflow(workflowId);
    if (!wf) return [];
    return wf.nodes.map(n => ({
      nodeId: n.nodeId,
      type: n.type,
      label: n.label,
      config: n.config,
    }));
  }
}

/** Unmetered local usage host — always allow, never consume. */
class LocalUsageHost implements UsageHost {
  async checkNodeTokens(): Promise<TokenCheckResult> {
    return { allowed: true };
  }
  async consumeNodeTokens(): Promise<number> {
    return 0;
  }
}

/** Build an SRT/VTT timestamp (HH:MM:SS,mmm or HH:MM:SS.mmm). */
function fmtTime(seconds: number, sep: ',' | '.'): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(millis, 3)}`;
}

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

/** OpenAI Whisper transcription via raw fetch using the user's BYOK key. */
class LocalTranscriptionHost implements TranscriptionHost {
  async transcribe(
    buffer: Buffer,
    mimeType: string,
    opts: TranscriptionOpts,
  ): Promise<TranscriptionResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'Transcription requires OPENAI_API_KEY. Set it in your iris-flow config or environment.',
      );
    }

    const form = new FormData();
    const ext = mimeType.split('/')[1]?.split(';')[0] || 'mp3';
    form.append(
      'file',
      new Blob([new Uint8Array(buffer)], { type: mimeType }),
      `audio.${ext}`,
    );
    // whisper-1 is the model that supports verbose_json (segments + duration),
    // from which we synthesize SRT/VTT.
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');
    if (opts.language) form.append('language', opts.language);
    if (opts.prompt) form.append('prompt', opts.prompt);

    const res = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Whisper transcription failed (${res.status}): ${detail}`);
    }
    const data = (await res.json()) as {
      text?: string;
      duration?: number;
      segments?: WhisperSegment[];
    };

    const segments = data.segments ?? [];
    const srt = segments
      .map(
        (seg, i) =>
          `${i + 1}\n${fmtTime(seg.start, ',')} --> ${fmtTime(seg.end, ',')}\n${seg.text.trim()}\n`,
      )
      .join('\n');
    const vtt =
      'WEBVTT\n\n' +
      segments
        .map(
          seg =>
            `${fmtTime(seg.start, '.')} --> ${fmtTime(seg.end, '.')}\n${seg.text.trim()}\n`,
        )
        .join('\n');

    return {
      srt,
      vtt,
      text: data.text ?? '',
      duration: data.duration ?? 0,
    };
  }
}

/** Assemble the local `NodeExecutorHost` from disk + no-op meter + BYOK Whisper. */
export function createLocalNodeHost(
  opts: LocalNodeHostOptions,
): NodeExecutorHost {
  return {
    media: new LocalMediaHost(opts),
    assets: new LocalAssetHost(opts),
    workflow: new LocalWorkflowHost(opts),
    usage: new LocalUsageHost(),
    transcription: new LocalTranscriptionHost(),
    // handlers intentionally omitted: ffmpeg video/audio editors and the Sheets
    // append pull heavy/non-portable deps. The engine surfaces a clear
    // NODE_NOT_SUPPORTED (501) for those node types on this host (trap #1).
    // Self-host relaxes only the SSRF network guard (localhost is the user's
    // own machine); timeout and response-size caps stay at engine defaults.
    http: { allowPrivateNetwork: opts.allowPrivateNetworkHttp ?? true },
  };
}
