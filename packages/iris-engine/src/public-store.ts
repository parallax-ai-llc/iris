/**
 * public-store: shared policy for the OUTPUT_STORAGE node's public put
 * (`MediaHost.storePublic`).
 *
 * Every host writes the node's input to a publicly reachable location, so the
 * hosts must agree on three things:
 *
 *   1. Which formats may be published as-is. Only plain media and data formats
 *      in `PUBLIC_STORE_FORMATS` keep their content type and get a matching
 *      file extension. Anything else (HTML, SVG, XML, JavaScript, unknown
 *      types) is stored as `application/octet-stream` with a `.bin` extension,
 *      so a public URL never serves a document a browser would render and run.
 *   2. The size cap for remote downloads (`PUBLIC_STORE_MAX_BYTES`).
 *   3. How a policy refusal surfaces: a host returns `{ blocked: true }` and
 *      the node fails with `StorePublicBlockedError` instead of quietly
 *      recording an error output.
 *
 * The caller-supplied subfolder is checked by `sanitizePublicStoreFolder`.
 */

export type PublicStoreAssetType = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER';

export interface PublicStoreFormat {
  /** Content type to store and serve. */
  contentType: string;
  /** File extension (no dot) for the stored object. */
  ext: string;
  assetType: PublicStoreAssetType;
}

/** Content type → extension for formats that may be published as-is. */
export const PUBLIC_STORE_FORMATS: Readonly<
  Record<string, { ext: string; assetType: PublicStoreAssetType }>
> = {
  'image/png': { ext: 'png', assetType: 'IMAGE' },
  'image/jpeg': { ext: 'jpg', assetType: 'IMAGE' },
  'image/gif': { ext: 'gif', assetType: 'IMAGE' },
  'image/webp': { ext: 'webp', assetType: 'IMAGE' },
  'image/avif': { ext: 'avif', assetType: 'IMAGE' },
  'image/bmp': { ext: 'bmp', assetType: 'IMAGE' },
  'image/heic': { ext: 'heic', assetType: 'IMAGE' },
  'image/heif': { ext: 'heif', assetType: 'IMAGE' },
  'video/mp4': { ext: 'mp4', assetType: 'VIDEO' },
  'video/webm': { ext: 'webm', assetType: 'VIDEO' },
  'video/quicktime': { ext: 'mov', assetType: 'VIDEO' },
  'audio/mpeg': { ext: 'mp3', assetType: 'AUDIO' },
  'audio/mp3': { ext: 'mp3', assetType: 'AUDIO' },
  'audio/wav': { ext: 'wav', assetType: 'AUDIO' },
  'audio/x-wav': { ext: 'wav', assetType: 'AUDIO' },
  'audio/wave': { ext: 'wav', assetType: 'AUDIO' },
  'audio/ogg': { ext: 'ogg', assetType: 'AUDIO' },
  'audio/flac': { ext: 'flac', assetType: 'AUDIO' },
  'audio/aac': { ext: 'aac', assetType: 'AUDIO' },
  'audio/mp4': { ext: 'm4a', assetType: 'AUDIO' },
  'audio/webm': { ext: 'weba', assetType: 'AUDIO' },
  'application/pdf': { ext: 'pdf', assetType: 'OTHER' },
  'application/json': { ext: 'json', assetType: 'OTHER' },
  'text/plain': { ext: 'txt', assetType: 'OTHER' },
  'text/csv': { ext: 'csv', assetType: 'OTHER' },
  'text/markdown': { ext: 'md', assetType: 'OTHER' },
};

export const PUBLIC_STORE_FALLBACK_TYPE = 'application/octet-stream';

/**
 * Cap for one remote download into public storage. Sized for generated media:
 * provider clips (Veo, Kling, Seedance, Runway) are a few to a few tens of MB
 * even at 1080p, so 200 MiB leaves room for long or high-bitrate clips while
 * bounding what one node run can pull. Hosts stream to storage, so the cap
 * bounds bandwidth and storage rather than memory.
 */
export const PUBLIC_STORE_MAX_BYTES = 200 * 1024 * 1024;

/** Lowercase `type/subtype` without parameters. */
function baseType(value: string | null | undefined): string {
  return String(value ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

/**
 * Pick the stored content type, extension and asset type for a declared
 * content type. Formats outside `PUBLIC_STORE_FORMATS` become
 * `application/octet-stream` + `.bin`.
 */
export function publicStoreFormat(
  declared: string | null | undefined
): PublicStoreFormat {
  const base = baseType(declared);
  const known = Object.prototype.hasOwnProperty.call(PUBLIC_STORE_FORMATS, base)
    ? PUBLIC_STORE_FORMATS[base]
    : undefined;
  if (!known) {
    return { contentType: PUBLIC_STORE_FALLBACK_TYPE, ext: 'bin', assetType: 'OTHER' };
  }
  return { contentType: base, ext: known.ext, assetType: known.assetType };
}

/** A storePublic request the host refused on policy grounds (source not
 *  allowed, blocked address, too large). The OUTPUT_STORAGE node fails with
 *  this error instead of recording a soft error output. */
export class StorePublicBlockedError extends Error {
  readonly code = 'STORE_PUBLIC_BLOCKED';
  constructor(message: string) {
    super(message);
    this.name = 'StorePublicBlockedError';
  }
}

const MAX_FOLDER_LENGTH = 200;
const MAX_FOLDER_DEPTH = 10;

/**
 * Validate the node's optional subfolder. Returns the folder with leading and
 * trailing slashes removed (undefined when empty). Throws
 * `StorePublicBlockedError` for dot segments, empty segments, backslashes,
 * percent signs (encoded dot segments), control characters, or overlong input.
 */
export function sanitizePublicStoreFolder(
  folder: string | null | undefined
): string | undefined {
  if (folder === null || folder === undefined) return undefined;
  if (typeof folder !== 'string') {
    throw new StorePublicBlockedError('Storage folder must be a string.');
  }
  const trimmed = folder.trim().replace(/^\/+|\/+$/g, '');
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_FOLDER_LENGTH) {
    throw new StorePublicBlockedError('Storage folder is too long.');
  }
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      throw new StorePublicBlockedError('Storage folder contains control characters.');
    }
  }
  if (trimmed.includes('\\') || trimmed.includes('%')) {
    throw new StorePublicBlockedError('Storage folder contains a disallowed character.');
  }
  const segments = trimmed.split('/');
  if (segments.length > MAX_FOLDER_DEPTH) {
    throw new StorePublicBlockedError('Storage folder is nested too deeply.');
  }
  for (const segment of segments) {
    if (!segment.trim() || segment === '.' || segment === '..') {
      throw new StorePublicBlockedError(
        'Storage folder must not contain empty, "." or ".." segments.'
      );
    }
  }
  return trimmed;
}
