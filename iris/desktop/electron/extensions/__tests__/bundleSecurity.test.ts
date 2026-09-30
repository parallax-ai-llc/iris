// @vitest-environment node
// (Main-process code; adm-zip's `instanceof Uint8Array` checks break across the
// jsdom VM realm.)
/**
 * Unit tests for electron/extensions/bundleSecurity.ts — the checks that stand
 * between a marketplace bundle URL and code running on the user's machine.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import {
  OFFICIAL_BUNDLE_URL_PREFIXES,
  BundleRejectedError,
  assertOfficialBundleUrl,
  downloadVerifiedBundle,
  extractBundleSafely,
  normalizeSha256,
  officialBundleUrlPrefixes,
  openIexArchive,
} from '../bundleSecurity';

const PROD = OFFICIAL_BUNDLE_URL_PREFIXES.production;
const DEV = OFFICIAL_BUNDLE_URL_PREFIXES.dev;
const GOOD_URL = `${PROD}cmabc123/1.2.3/acme.hello-1.2.3.iex`;

const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

function responseOf(body: Buffer, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(new Uint8Array(body), { status: init.status ?? 200, headers: init.headers });
}

/** A zip whose entry names are written verbatim (addFile would normalize them). */
function zipWithRawNames(entries: { name: string; data?: string; attr?: number }[]): AdmZip {
  const zip = new AdmZip();
  entries.forEach((e, i) => {
    zip.addFile(`placeholder-${i}.txt`, Buffer.from(e.data ?? 'x'));
    const entry = zip.getEntry(`placeholder-${i}.txt`)!;
    entry.entryName = e.name;
    if (e.attr !== undefined) entry.attr = e.attr;
  });
  // Round-trip through bytes so the names come back the way a parser sees them.
  return new AdmZip(zip.toBuffer());
}

describe('officialBundleUrlPrefixes', () => {
  it('packaged builds accept production uploads only', () => {
    expect(officialBundleUrlPrefixes(true)).toEqual([PROD]);
  });

  it('dev runs also accept dev uploads', () => {
    expect(officialBundleUrlPrefixes(false)).toEqual([PROD, DEV]);
  });
});

describe('assertOfficialBundleUrl', () => {
  const allowed = [PROD];

  it('accepts a canonical production bundle URL', () => {
    expect(() => assertOfficialBundleUrl(GOOD_URL, allowed)).not.toThrow();
  });

  it.each([
    ['plain http', GOOD_URL.replace('https://', 'http://')],
    ['an attacker host', 'https://evil.example/production/extensions/cmabc123/1.2.3/acme.hello-1.2.3.iex'],
    [
      'another GCS bucket on the same host',
      'https://storage.googleapis.com/attacker-bucket/production/extensions/cmabc123/1.2.3/a-1.0.0.iex',
    ],
    [
      'a virtual-hosted bucket name',
      'https://parallax-ai-images.storage.googleapis.com/production/extensions/cmabc123/1.2.3/a-1.2.3.iex',
    ],
    ['a look-alike host', 'https://storage.googleapis.com.evil.example/parallax-ai-images/production/extensions/x/1/a.iex'],
    ['the dev prefix in a packaged build', `${DEV}cmabc123/1.2.3/acme.hello-1.2.3.iex`],
    ['other objects in the official bucket', 'https://storage.googleapis.com/parallax-ai-images/production/public/image/a.iex'],
    ['a dot-segment escape', `${PROD}cmabc123/../../public/evil.iex`],
    ['an encoded dot-segment escape', `${PROD}cmabc123/%2e%2e/%2e%2e/public/evil.iex`],
    ['a backslash path', `${PROD}cmabc123\\1.2.3\\a.iex`],
    ['a query string', `${GOOD_URL}?generation=1`],
    ['a fragment', `${GOOD_URL}#x`],
    ['embedded credentials', GOOD_URL.replace('https://', 'https://user:pass@')],
    ['an explicit port', GOOD_URL.replace('storage.googleapis.com', 'storage.googleapis.com:8443')],
    ['a non-.iex object', `${PROD}cmabc123/1.2.3/acme.hello-1.2.3.zip`],
    ['a malformed URL', 'https://'],
  ])('rejects %s', (_label, url) => {
    expect(() => assertOfficialBundleUrl(url, allowed)).toThrow(BundleRejectedError);
  });
});

describe('normalizeSha256', () => {
  it('accepts a 64-char hex digest and lower-cases it', () => {
    expect(normalizeSha256('A'.repeat(64))).toBe('a'.repeat(64));
  });

  it.each([undefined, null, '', 'abc', 'g'.repeat(64), 'a'.repeat(63), 42])('rejects %s', (v) => {
    expect(normalizeSha256(v)).toBeNull();
  });
});

describe('downloadVerifiedBundle', () => {
  const body = Buffer.from('bundle-bytes');

  it('returns the bytes when they match the server-issued hash, without following redirects', async () => {
    const fetchImpl = vi.fn(async () => responseOf(body));
    const bytes = await downloadVerifiedBundle(GOOD_URL, {
      expectedSha256: sha256(body),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(bytes.equals(body)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(GOOD_URL, { redirect: 'error' });
  });

  it('rejects bytes that do not match the hash (swapped object)', async () => {
    const fetchImpl = vi.fn(async () => responseOf(Buffer.from('attacker payload')));
    await expect(
      downloadVerifiedBundle(GOOD_URL, {
        expectedSha256: sha256(body),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/integrity check failed/);
  });

  it('rejects an HTTP error', async () => {
    const fetchImpl = vi.fn(async () => responseOf(Buffer.alloc(0), { status: 404 }));
    await expect(
      downloadVerifiedBundle(GOOD_URL, {
        expectedSha256: sha256(body),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/HTTP 404/);
  });

  it('surfaces a refused redirect as a download failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed: unexpected redirect');
    });
    await expect(
      downloadVerifiedBundle(GOOD_URL, {
        expectedSha256: sha256(body),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/Failed to download bundle/);
  });

  it('refuses a declared Content-Length over the cap before reading the body', async () => {
    const fetchImpl = vi.fn(async () =>
      responseOf(body, { headers: { 'content-length': String(1024 * 1024) } }),
    );
    await expect(
      downloadVerifiedBundle(GOOD_URL, {
        expectedSha256: sha256(body),
        maxBytes: 1024,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/larger than/);
  });

  it('stops reading a body that grows past the cap', async () => {
    const big = Buffer.alloc(4096, 1);
    const fetchImpl = vi.fn(async () => responseOf(big));
    await expect(
      downloadVerifiedBundle(GOOD_URL, {
        expectedSha256: sha256(big),
        maxBytes: 1024,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/larger than/);
  });
});

describe('openIexArchive', () => {
  let workRoot: string;

  beforeEach(() => {
    workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-bundlesec-'));
  });

  afterEach(() => {
    fs.rmSync(workRoot, { recursive: true, force: true });
  });

  it('refuses a URL install without a server-issued hash and never fetches it', async () => {
    const fetchImpl = vi.fn();
    await expect(
      openIexArchive(GOOD_URL, {
        allowedUrlPrefixes: [PROD],
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/hash \(sha256\) is missing/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a non-official URL before fetching, even with a hash', async () => {
    const fetchImpl = vi.fn();
    await expect(
      openIexArchive('https://evil.example/x.iex', {
        sha256: 'a'.repeat(64),
        allowedUrlPrefixes: [PROD],
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(BundleRejectedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['file:///C:/Users/victim/evil.iex', 'ftp://example.com/evil.iex'])(
    'treats %s as a URL and refuses it',
    async (source) => {
      await expect(
        openIexArchive(source, { sha256: 'a'.repeat(64), allowedUrlPrefixes: [PROD] }),
      ).rejects.toThrow(/https/);
    },
  );

  it('opens a verified official bundle', async () => {
    const zip = new AdmZip();
    zip.addFile('iris-extension.json', Buffer.from('{}'));
    const bytes = zip.toBuffer();
    const fetchImpl = vi.fn(async () => responseOf(bytes));

    const archive = await openIexArchive(GOOD_URL, {
      sha256: sha256(bytes).toUpperCase(),
      allowedUrlPrefixes: [PROD],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(archive.isLocalFile).toBe(false);
    expect(archive.zip.getEntries().map((e) => e.entryName)).toEqual(['iris-extension.json']);
  });

  it('opens a local developer file and flags it as local', async () => {
    const zip = new AdmZip();
    zip.addFile('iris-extension.json', Buffer.from('{}'));
    const file = path.join(workRoot, 'dev.iex');
    zip.writeZip(file);

    const archive = await openIexArchive(file, { allowedUrlPrefixes: [PROD] });
    expect(archive.isLocalFile).toBe(true);
  });
});

describe('extractBundleSafely', () => {
  let workRoot: string;
  let target: string;

  beforeEach(() => {
    workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-extract-'));
    target = path.join(workRoot, 'out');
  });

  afterEach(() => {
    fs.rmSync(workRoot, { recursive: true, force: true });
  });

  it('extracts a normal bundle, including nested folders', () => {
    const zip = new AdmZip();
    zip.addFile('iris-extension.json', Buffer.from('{"id":"a.b"}'));
    zip.addFile('dist/index.js', Buffer.from('export function activate() {}'));
    zip.addFile('assets/', Buffer.alloc(0));

    extractBundleSafely(new AdmZip(zip.toBuffer()), target);

    expect(fs.readFileSync(path.join(target, 'dist', 'index.js'), 'utf-8')).toContain('activate');
    expect(fs.existsSync(path.join(target, 'iris-extension.json'))).toBe(true);
    expect(fs.statSync(path.join(target, 'assets')).isDirectory()).toBe(true);
  });

  it.each([
    ['a parent-directory escape', '../evil.js'],
    ['a nested parent-directory escape', 'dist/../../evil.js'],
    ['a backslash escape', '..\\..\\evil.js'],
    ['an absolute path', '/tmp/evil.js'],
    ['a drive-letter path', 'C:/Users/victim/evil.js'],
    ['a drive-relative path', 'C:evil.js'],
    ['an alternate data stream', 'dist/index.js:hidden'],
  ])('rejects %s and writes nothing', (_label, name) => {
    const zip = zipWithRawNames([
      { name: 'iris-extension.json', data: '{}' },
      { name },
    ]);

    expect(() => extractBundleSafely(zip, target)).toThrow(BundleRejectedError);
    // Validation runs before the first write, so even the safe entry is absent.
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.existsSync(path.join(workRoot, 'evil.js'))).toBe(false);
  });

  it('rejects a symbolic-link entry', () => {
    const zip = zipWithRawNames([
      { name: 'iris-extension.json', data: '{}' },
      { name: 'dist/index.js', data: '/etc/passwd', attr: (0o120777 << 16) >>> 0 },
    ]);
    expect(() => extractBundleSafely(zip, target)).toThrow(/symbolic link/);
  });

  it('rejects a bundle that repeats an entry name', () => {
    const zip = zipWithRawNames([
      { name: 'dist/index.js', data: 'reviewed' },
      { name: 'dist/index.js', data: 'swapped' },
    ]);
    expect(() => extractBundleSafely(zip, target)).toThrow(/more than once/);
  });

  it('enforces the entry-count limit', () => {
    const zip = new AdmZip();
    for (let i = 0; i < 5; i++) zip.addFile(`f${i}.txt`, Buffer.from('x'));
    expect(() => extractBundleSafely(zip, target, { maxEntries: 4 })).toThrow(/too many entries/);
  });

  it('enforces the uncompressed-size limit', () => {
    const zip = new AdmZip();
    zip.addFile('big.bin', Buffer.alloc(2048, 7));
    expect(() =>
      extractBundleSafely(new AdmZip(zip.toBuffer()), target, { maxUncompressedBytes: 1024 }),
    ).toThrow(/beyond the allowed size/);
  });
});
