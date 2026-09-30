/**
 * Supply-chain checks for `.iex` bundles (Electron main process).
 *
 * Marketplace bundles reach users through one path only: the owner uploads the
 * archive, the server stores it at
 *   https://storage.googleapis.com/parallax-ai-images/{production|dev}/extensions/<extensionId>/<version>/<id>-<version>.iex
 * records its SHA-256 next to the URL, and an admin approves it
 * (core/server `extension-bundle-integrity.ts`). A URL or hash coming from
 * anywhere else is not trusted, so before anything is extracted:
 *   1. only https URLs under the official prefixes are fetched (no redirects),
 *   2. the download is capped at the server's upload limit,
 *   3. the bytes must match the server-issued SHA-256 (missing hash = refuse),
 *   4. every zip entry is checked before any file is written: no absolute or
 *      drive paths, no `..`, no symlinks, no duplicate names, bounded size.
 *
 * Local `.iex` files (developer flow) skip 1–3 but still go through 4.
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

/** Where the server stores bundles. Keep in sync with StorageService / GCS_BUCKET_NAME. */
export const OFFICIAL_BUNDLE_URL_PREFIXES = {
  production: 'https://storage.googleapis.com/parallax-ai-images/production/extensions/',
  dev: 'https://storage.googleapis.com/parallax-ai-images/dev/extensions/',
} as const;

/**
 * Packaged builds talk to the production API, so only production uploads are
 * accepted there. Unpackaged runs (vite + a local server) also accept `dev/`.
 */
export function officialBundleUrlPrefixes(isPackaged: boolean): string[] {
  return isPackaged
    ? [OFFICIAL_BUNDLE_URL_PREFIXES.production]
    : [OFFICIAL_BUNDLE_URL_PREFIXES.production, OFFICIAL_BUNDLE_URL_PREFIXES.dev];
}

/** Mirrors the server's upload cap (MAX_EXTENSION_BUNDLE_BYTES, 50MB). */
export const MAX_BUNDLE_BYTES = 50 * 1024 * 1024;
/** Zip-bomb guards for extraction. */
export const MAX_BUNDLE_ENTRIES = 5000;
export const MAX_BUNDLE_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;

const SHA256_HEX = /^[0-9a-f]{64}$/;
/** `<extensionId>/<version>/<manifestId>-<version>.iex` after the official prefix. */
const OBJECT_SUFFIX = /^[\w-]+\/[\w.-]+\/[\w.-]+\.iex$/;
/** Unix file type bits stored in the high word of a zip entry's external attributes. */
const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

/** A bundle refused by these checks. The message is shown to the user as-is. */
export class BundleRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BundleRejectedError';
  }
}

/** Lower-cased SHA-256 hex digest, or null when `value` is not one. */
export function normalizeSha256(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const hex = value.trim().toLowerCase();
  return SHA256_HEX.test(hex) ? hex : null;
}

/**
 * Throw unless `source` is an https URL under one of the official prefixes, in
 * canonical form. Anything the URL parser would rewrite (dot segments, `%2e`,
 * backslashes, default ports) is refused, as are credentials, queries and
 * fragments — the string checked must be the string fetched.
 */
export function assertOfficialBundleUrl(source: string, allowedPrefixes: readonly string[]): void {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new BundleRejectedError('Bundle URL is not a valid URL');
  }
  if (url.protocol !== 'https:') {
    throw new BundleRejectedError('Bundle URL must use https');
  }
  if (url.href !== source || url.username || url.password || url.search || url.hash) {
    throw new BundleRejectedError('Bundle URL is not in canonical form');
  }
  const prefix = allowedPrefixes.find((p) => source.startsWith(p));
  if (!prefix) {
    throw new BundleRejectedError(
      `Bundle is not hosted on the official marketplace storage (${url.host}${url.pathname})`,
    );
  }
  const rest = source.slice(prefix.length);
  if (!OBJECT_SUFFIX.test(rest) || rest.split('/').some((s) => s === '.' || s === '..')) {
    throw new BundleRejectedError('Bundle URL does not point at a marketplace bundle');
  }
}

/** Read a response body, aborting as soon as it grows past `maxBytes`. */
async function readBodyCapped(res: Response, maxBytes: number): Promise<Buffer> {
  const tooLarge = () =>
    new BundleRejectedError(`Bundle is larger than ${Math.floor(maxBytes / 1024 / 1024)}MB`);

  if (!res.body) {
    const whole = Buffer.from(await res.arrayBuffer());
    if (whole.length > maxBytes) throw tooLarge();
    return whole;
  }

  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

/**
 * Download a marketplace bundle and return its bytes only if they hash to
 * `expectedSha256`. Redirects are refused: the allowlist was checked for the
 * URL we were given, not for wherever a redirect would lead.
 */
export async function downloadVerifiedBundle(
  source: string,
  opts: { expectedSha256: string; maxBytes?: number; fetchImpl?: typeof fetch },
): Promise<Buffer> {
  const maxBytes = opts.maxBytes ?? MAX_BUNDLE_BYTES;
  const fetchImpl = opts.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await fetchImpl(source, { redirect: 'error' });
  } catch (err) {
    throw new BundleRejectedError(
      `Failed to download bundle: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    throw new BundleRejectedError(`Failed to download bundle: HTTP ${res.status}`);
  }
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new BundleRejectedError(`Bundle is larger than ${Math.floor(maxBytes / 1024 / 1024)}MB`);
  }

  const bytes = await readBodyCapped(res, maxBytes);
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== opts.expectedSha256) {
    throw new BundleRejectedError(
      `Bundle integrity check failed: expected sha256 ${opts.expectedSha256}, got ${actual}`,
    );
  }
  return bytes;
}

/**
 * Open the archive behind an `installFromIex` source.
 *
 * - URL (any scheme): must pass `assertOfficialBundleUrl` and match `sha256`.
 * - Anything else: a local file the developer picked. No hash is required, and
 *   the caller must not grant it more than the community trust tier.
 */
export async function openIexArchive(
  source: string,
  opts: { sha256?: unknown; allowedUrlPrefixes: readonly string[]; fetchImpl?: typeof fetch },
): Promise<{ zip: AdmZip; isLocalFile: boolean }> {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(source)) {
    assertOfficialBundleUrl(source, opts.allowedUrlPrefixes);
    const expectedSha256 = normalizeSha256(opts.sha256);
    if (!expectedSha256) {
      throw new BundleRejectedError(
        'Bundle integrity hash (sha256) is missing, refusing to install an unverified bundle',
      );
    }
    const bytes = await downloadVerifiedBundle(source, {
      expectedSha256,
      fetchImpl: opts.fetchImpl,
    });
    return { zip: new AdmZip(bytes), isLocalFile: false };
  }

  if (!existsSync(source)) {
    throw new BundleRejectedError(`Bundle not found: ${source}`);
  }
  return { zip: new AdmZip(source), isLocalFile: true };
}

/** Why an entry name is unsafe to extract, or null when it is fine. */
function unsafeEntryReason(name: string, attr: number): string | null {
  if (name.length === 0) return 'has an empty name';
  if (name.includes('\0')) return 'contains a NUL character';
  const normalized = name.replace(/\\/g, '/');
  if (normalized.startsWith('/')) return 'is an absolute path';
  if (/^[a-zA-Z]:/.test(normalized)) return 'starts with a drive letter';
  // Also rules out Windows alternate data streams (`file.js:stream`).
  if (normalized.includes(':')) return 'contains ":"';
  if (normalized.split('/').includes('..')) return 'contains a ".." segment';
  if (((attr >>> 16) & S_IFMT) === S_IFLNK) return 'is a symbolic link';
  return null;
}

function isInside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return !path.isAbsolute(rel) && rel.split(path.sep)[0] !== '..';
}

/**
 * Extract `zip` into `targetDir`, refusing the whole archive if any entry is
 * unsafe. Every entry is validated before the first file is written, so a
 * rejected bundle leaves nothing behind. Files are written with `wx` so a
 * duplicate (or case-colliding) name cannot overwrite an earlier entry.
 */
export function extractBundleSafely(
  zip: AdmZip,
  targetDir: string,
  limits: { maxEntries?: number; maxUncompressedBytes?: number } = {},
): void {
  const maxEntries = limits.maxEntries ?? MAX_BUNDLE_ENTRIES;
  const maxBytes = limits.maxUncompressedBytes ?? MAX_BUNDLE_UNCOMPRESSED_BYTES;
  const root = path.resolve(targetDir);

  const entries = zip.getEntries();
  if (entries.length > maxEntries) {
    throw new BundleRejectedError(`Bundle has too many entries (${entries.length} > ${maxEntries})`);
  }

  const plan: { entry: AdmZip.IZipEntry; dest: string }[] = [];
  let declaredBytes = 0;
  for (const entry of entries) {
    const name = entry.entryName;
    const reason = unsafeEntryReason(name, entry.attr);
    if (reason) {
      throw new BundleRejectedError(`Bundle entry "${name}" ${reason}`);
    }
    const segments = name.replace(/\\/g, '/').split('/').filter((s) => s.length > 0 && s !== '.');
    const dest = path.resolve(root, ...segments);
    if (dest === root && !entry.isDirectory) {
      throw new BundleRejectedError(`Bundle entry "${name}" has no file name`);
    }
    if (!isInside(root, dest)) {
      throw new BundleRejectedError(`Bundle entry "${name}" escapes the extraction directory`);
    }
    if (!entry.isDirectory) {
      declaredBytes += entry.header.size;
      if (declaredBytes > maxBytes) {
        throw new BundleRejectedError('Bundle expands beyond the allowed size');
      }
    }
    plan.push({ entry, dest });
  }

  mkdirSync(root, { recursive: true });
  let writtenBytes = 0;
  for (const { entry, dest } of plan) {
    if (entry.isDirectory) {
      mkdirSync(dest, { recursive: true });
      continue;
    }
    const data = entry.getData();
    writtenBytes += data.length;
    if (writtenBytes > maxBytes) {
      throw new BundleRejectedError('Bundle expands beyond the allowed size');
    }
    mkdirSync(path.dirname(dest), { recursive: true });
    try {
      writeFileSync(dest, data, { flag: 'wx' });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new BundleRejectedError(`Bundle contains "${entry.entryName}" more than once`);
      }
      throw err;
    }
  }
}
