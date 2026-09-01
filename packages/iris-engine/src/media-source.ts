/**
 * Media source primitives — the pure, host-independent half of media handling.
 *
 * These functions take a URL / base64 / buffer and resolve it to bytes + a MIME
 * type, with no dependency on any persistence or cloud layer. They are the read
 * /convert side of the `MediaStorage` seam: every host (cloud GCS, local disk,
 * desktop) reuses them, while the *write* side (encrypting + recording an asset
 * row) stays in the host.
 *
 * Moved out of `core/server`'s `media-storage-utils.ts`; the server re-exports
 * them so existing import paths keep working.
 */

import { safeHttpFetchBuffer } from './safe-http.js';
import type { HttpRequestPolicy } from './safe-http.js';

/** Default overall deadline for a media download. Media files are much larger
 *  than the HTTP-request node's text responses, so the 30s node default would
 *  cut off legitimate video downloads. */
export const DEFAULT_MEDIA_FETCH_TIMEOUT_MS = 300_000;
/** Default buffered-size cap for a media download. Bigger than the HTTP-request
 *  node's 10MB (generated videos routinely exceed it) but still a hard ceiling
 *  so a hostile or broken URL can't buffer unbounded bytes into memory. */
export const DEFAULT_MEDIA_MAX_RESPONSE_BYTES = 500 * 1024 * 1024;

/** Input data types that can be resolved to a buffer. */
export type MediaDataSource =
  | { type: 'url'; value: string }
  | { type: 'base64'; value: string; mimeType?: string }
  | { type: 'buffer'; value: Buffer; mimeType: string };

/** Normalized adapter output shape (what a provider adapter emits). */
export interface AdapterOutput {
  type: 'image' | 'video' | 'audio' | 'text';
  url?: string;
  base64?: string;
  text?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Parse a data URL (data:type/subtype;base64,data) into its components.
 * Accepts optional media-type parameters (`data:text/csv;charset=utf-8;base64,…`)
 * — the mime type is the segment before the first `;`.
 */
export function parseDataUrl(
  dataUrl: string
): { mimeType: string; base64Data: string } | null {
  const match = dataUrl.match(/^data:([^,]*);base64,(.+)$/);
  if (!match) return null;
  const mimeType = match[1].split(';')[0].trim() || 'application/octet-stream';
  return {
    mimeType,
    base64Data: match[2],
  };
}

/**
 * Determine file extension from mime type.
 */
export function getFileExtension(mimeType: string): string {
  const extensionMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/aac': 'aac',
    'audio/flac': 'flac',
  };
  return extensionMap[mimeType] || 'bin';
}

/**
 * Determine asset type from mime type.
 */
export function getAssetTypeFromMimeType(
  mimeType: string
): 'IMAGE' | 'VIDEO' | 'AUDIO' {
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (mimeType.startsWith('audio/')) return 'AUDIO';
  // Default to IMAGE for unknown types
  return 'IMAGE';
}

/**
 * Detect mime type from a buffer's magic bytes.
 */
export function detectMimeTypeFromBuffer(buffer: Buffer): string | null {
  // Check magic bytes
  if (buffer.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // GIF: 47 49 46 38
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return 'image/gif';
  }

  // WebP: 52 49 46 46 ... 57 45 42 50
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  // MP4: ftyp at offset 4 (with various brands)
  if (
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    return 'video/mp4';
  }

  // WebM: 1A 45 DF A3
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return 'video/webm';
  }

  // MP3: FF FB or FF FA or FF F3 or ID3 (49 44 33)
  if (
    (buffer[0] === 0xff &&
      (buffer[1] === 0xfb || buffer[1] === 0xfa || buffer[1] === 0xf3)) ||
    (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33)
  ) {
    return 'audio/mpeg';
  }

  // WAV: RIFF...WAVE
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x41 &&
    buffer[10] === 0x56 &&
    buffer[11] === 0x45
  ) {
    return 'audio/wav';
  }

  // OGG: OggS
  if (
    buffer[0] === 0x4f &&
    buffer[1] === 0x67 &&
    buffer[2] === 0x67 &&
    buffer[3] === 0x53
  ) {
    return 'audio/ogg';
  }

  // FLAC: fLaC
  if (
    buffer[0] === 0x66 &&
    buffer[1] === 0x4c &&
    buffer[2] === 0x61 &&
    buffer[3] === 0x43
  ) {
    return 'audio/flac';
  }

  return null;
}

/**
 * Fetch media data from various sources and convert to a Buffer.
 * Pure: no host services — URL sources go through the engine's guarded fetch
 * (`safeHttpFetchBuffer`): SSRF validation re-checked on every redirect hop,
 * an overall deadline, and a buffered-size cap.
 *
 * `policy` is the host's outbound-fetch policy (`NodeExecutorHost.http`).
 * Omitted fields fall back to the media defaults above (not the HTTP node's
 * 30s/10MB), so passing a host policy that only sets `allowPrivateNetwork`
 * keeps media downloads working. Callers without host access can omit it —
 * that means the strict cloud posture (SSRF guard ON).
 */
export async function fetchMediaAsBuffer(
  source: MediaDataSource,
  policy?: HttpRequestPolicy
): Promise<{ buffer: Buffer; mimeType: string } | { error: string }> {
  try {
    switch (source.type) {
      case 'buffer':
        return { buffer: source.value, mimeType: source.mimeType };

      case 'base64': {
        // Check if it's a data URL format (data:mime/type;base64,...)
        const parsed = parseDataUrl(source.value);
        if (parsed) {
          const buffer = Buffer.from(parsed.base64Data, 'base64');
          return { buffer, mimeType: parsed.mimeType };
        }
        // Plain base64 string
        const buffer = Buffer.from(source.value, 'base64');
        const detectedMime = detectMimeTypeFromBuffer(buffer);
        const mimeType =
          source.mimeType || detectedMime || 'application/octet-stream';
        return { buffer, mimeType };
      }

      case 'url': {
        // Check if it's actually a data URL
        if (source.value.startsWith('data:')) {
          const parsed = parseDataUrl(source.value);
          if (parsed) {
            const buffer = Buffer.from(parsed.base64Data, 'base64');
            return { buffer, mimeType: parsed.mimeType };
          }
          return { error: 'Invalid data URL format' };
        }

        // Guarded fetch from an HTTP(S) URL. Policy violations, timeouts, and
        // oversized bodies throw with a user-facing message; the outer catch
        // turns that into `{ error }` like every other failure here.
        const response = await safeHttpFetchBuffer(
          source.value,
          { method: 'GET', headers: {} },
          {
            ...policy,
            timeoutMs: policy?.timeoutMs ?? DEFAULT_MEDIA_FETCH_TIMEOUT_MS,
            maxResponseBytes:
              policy?.maxResponseBytes ?? DEFAULT_MEDIA_MAX_RESPONSE_BYTES,
          }
        );
        if (response.status < 200 || response.status >= 300) {
          return {
            error: `Failed to fetch URL: ${response.status}`,
          };
        }
        const buffer = response.body;

        // Determine mime type from response or detect from buffer
        const detectedMime = detectMimeTypeFromBuffer(buffer);
        const mimeType =
          response.contentType?.split(';')[0] ||
          detectedMime ||
          'application/octet-stream';

        return { buffer, mimeType };
      }

      default:
        return { error: 'Unknown source type' };
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error fetching media';
    return { error: message };
  }
}

/**
 * Convert adapter output to a MediaDataSource.
 * Handles the various output formats AI providers emit.
 */
export function adapterOutputToDataSource(output: {
  type: string;
  url?: string;
  base64?: string;
  mimeType?: string;
}): MediaDataSource | null {
  // Check for URL first
  if (output.url) {
    return { type: 'url', value: output.url };
  }

  // Check for base64
  if (output.base64) {
    const mimeType =
      output.mimeType ||
      (output.type === 'video'
        ? 'video/mp4'
        : output.type === 'audio'
          ? 'audio/mpeg'
          : 'image/png');
    return { type: 'base64', value: output.base64, mimeType };
  }

  return null;
}
