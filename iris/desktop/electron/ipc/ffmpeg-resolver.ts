/**
 * Shared FFmpeg path resolver + auto-install fallback.
 *
 * Resolution order (first hit wins):
 *   1. Bundled `ffmpeg-static` binary (with app.asar → app.asar.unpacked rewrite)
 *   2. Previously auto-downloaded binary in userData/ffmpeg-runtime
 *   3. System `ffmpeg` on PATH (or common system locations)
 *   4. Auto-download a portable binary from ffmpeg-static's GitHub release
 *
 * The asar rewrite is the critical fix: in a packaged Electron app
 * `require('ffmpeg-static')` returns a path inside app.asar, and while
 * `fs.existsSync()` returns true via Electron's transparent asar shim,
 * `child_process.spawn()` goes straight to the OS and cannot execute a file
 * inside an asar archive. electron-builder auto-unpacks .exe binaries to
 * app.asar.unpacked, but the returned path is not rewritten — so spawn fails
 * silently and the user sees "FFmpeg not found".
 */

import { app } from 'electron';
import path from 'path';
import { existsSync, createWriteStream, chmodSync, statSync } from 'fs';
import { mkdir, unlink, rename } from 'fs/promises';
import { spawn, execSync } from 'child_process';
import { createRequire } from 'module';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import https from 'https';
import http from 'http';

const _require = createRequire(import.meta.url);

// xfade filter was added in 4.3 — the lowest version we accept.
const MIN_FFMPEG_VERSION = [4, 3, 0];

// ffmpeg-static publishes a per-platform binary at this URL pattern:
//   https://github.com/eugeneware/ffmpeg-static/releases/download/<tag>/ffmpeg-<platform>-<arch>.gz
const FFMPEG_BINARY_RELEASE_TAG = 'b6.1.1';
const FFMPEG_DOWNLOAD_BASE = 'https://github.com/eugeneware/ffmpeg-static/releases/download';

// ── Path resolution helpers ────────────────────────────────────────────────

// Rewrites paths that point inside app.asar to the unpacked location.
// Required so child_process.spawn can actually execute the binary.
function unpackAsarPath(p: string): string {
  // Use a regex so this works regardless of OS path separator and survives
  // any path normalization Electron applies along the way.
  return p.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
}

function getBundledFFmpegPath(): string | null {
  try {
    const raw = _require('ffmpeg-static') as string | null;
    if (!raw) return null;
    const fixed = app.isPackaged ? unpackAsarPath(raw) : raw;
    return existsSync(fixed) ? fixed : null;
  } catch {
    return null;
  }
}

function getDownloadedFFmpegDir(): string {
  return path.join(app.getPath('userData'), 'ffmpeg-runtime');
}

function getDownloadedFFmpegPath(): string {
  const bin = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  return path.join(getDownloadedFFmpegDir(), bin);
}

function getSystemFFmpegPath(): string | null {
  try {
    const cmd = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
    const result = execSync(cmd, { encoding: 'utf8', timeout: 5000 }).trim();
    const firstLine = result.split('\n')[0].trim();
    if (firstLine && existsSync(firstLine)) return firstLine;
  } catch { /* not in PATH */ }

  const candidates = process.platform === 'win32'
    ? ['C:\\ffmpeg\\bin\\ffmpeg.exe']
    : ['/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/bin/ffmpeg'];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

// ── Version verification ───────────────────────────────────────────────────

function parseVersion(output: string): number[] {
  const match = output.match(/ffmpeg version (\d+)\.(\d+)(?:\.(\d+))?/i);
  if (!match) return [0, 0, 0];
  return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3] ?? '0')];
}

function isVersionSufficient(version: number[]): boolean {
  for (let i = 0; i < MIN_FFMPEG_VERSION.length; i++) {
    if (version[i] > MIN_FFMPEG_VERSION[i]) return true;
    if (version[i] < MIN_FFMPEG_VERSION[i]) return false;
  }
  return true;
}

interface VerifyResult {
  ok: boolean;
  version?: string;
  sufficient: boolean;
}

async function verifyFFmpeg(p: string): Promise<VerifyResult> {
  return new Promise((resolve) => {
    let settled = false;
    const safe = (r: VerifyResult) => { if (!settled) { settled = true; resolve(r); } };

    let proc;
    try {
      proc = spawn(p, ['-version'], { stdio: 'pipe', windowsHide: true });
    } catch {
      return safe({ ok: false, sufficient: false });
    }

    let out = '';
    proc.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { out += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) return safe({ ok: false, sufficient: false });
      const m = out.match(/ffmpeg version (\S+)/i);
      const versionStr = m?.[1];
      const nums = parseVersion(out);
      safe({ ok: true, version: versionStr, sufficient: isVersionSufficient(nums) });
    });
    proc.on('error', () => safe({ ok: false, sufficient: false }));
    setTimeout(() => { try { proc.kill(); } catch {/* noop */} safe({ ok: false, sufficient: false }); }, 5000);
  });
}

// ── Auto-download (last-resort fallback) ───────────────────────────────────

// ffmpeg-static publishes binaries only for these platform/arch pairs.
function getDownloadUrl(): string | null {
  const platform = process.platform;
  const arch = process.arch;
  const supported: Record<string, string[]> = {
    darwin: ['x64', 'arm64'],
    linux: ['x64', 'ia32', 'arm64', 'arm'],
    win32: ['x64', 'ia32'],
  };
  if (!supported[platform]?.includes(arch)) return null;
  return `${FFMPEG_DOWNLOAD_BASE}/${FFMPEG_BINARY_RELEASE_TAG}/ffmpeg-${platform}-${arch}.gz`;
}

async function downloadToFile(
  url: string,
  destPath: string,
  onProgress?: (received: number, total: number) => void,
  redirects = 0
): Promise<void> {
  if (redirects > 5) throw new Error('Too many redirects');

  const protocol = url.startsWith('https') ? https : http;

  return new Promise((resolve, reject) => {
    const req = protocol.get(url, { headers: { 'User-Agent': 'iris-desktop' } }, (res) => {
      // Follow redirects manually so we can stream cleanly
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        downloadToFile(res.headers.location, destPath, onProgress, redirects + 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} downloading FFmpeg`));
        return;
      }

      const total = parseInt(res.headers['content-length'] ?? '0', 10);
      let received = 0;
      if (onProgress) {
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          onProgress(received, total);
        });
      }

      const gunzip = createGunzip();
      const file = createWriteStream(destPath);
      pipeline(res, gunzip, file).then(resolve).catch(reject);
    });
    req.on('error', reject);
    req.setTimeout(60_000, () => { req.destroy(new Error('Download timed out')); });
  });
}

async function downloadPortableFFmpeg(
  onProgress?: (received: number, total: number) => void
): Promise<string | null> {
  const url = getDownloadUrl();
  if (!url) return null;

  const destDir = getDownloadedFFmpegDir();
  const destPath = getDownloadedFFmpegPath();
  const tempPath = `${destPath}.part`;

  await mkdir(destDir, { recursive: true });

  // If a stale partial download exists, clear it first
  try { await unlink(tempPath); } catch {/* noop */}

  await downloadToFile(url, tempPath, onProgress);

  // Atomic move into place
  try { await unlink(destPath); } catch {/* noop */}
  await rename(tempPath, destPath);

  // chmod +x on Unix — Windows .exe doesn't need it
  if (process.platform !== 'win32') {
    try { chmodSync(destPath, 0o755); } catch {/* noop */}
  }

  // Sanity: file should be > 1MB; anything smaller means the download failed
  try {
    const st = statSync(destPath);
    if (st.size < 1_000_000) {
      await unlink(destPath).catch(() => {});
      return null;
    }
  } catch { return null; }

  return destPath;
}

// ── Public API ─────────────────────────────────────────────────────────────

// Cached resolved path — set once verified, reused for the session.
let cachedPath: string | null = null;

export function resetCache(): void {
  cachedPath = null;
}

/**
 * Best-effort synchronous resolver. Used by hot paths that already assume
 * FFmpeg is available (probe handlers, etc.). Falls back to the bare command
 * name when nothing concrete is found so the eventual spawn failure produces
 * a clear error rather than a path-not-found.
 */
export function findFFmpegPathSync(): string {
  if (cachedPath && existsSync(cachedPath)) return cachedPath;
  const bundled = getBundledFFmpegPath();
  if (bundled) return bundled;
  const downloaded = getDownloadedFFmpegPath();
  if (existsSync(downloaded)) return downloaded;
  const system = getSystemFFmpegPath();
  if (system) return system;
  return 'ffmpeg';
}

export interface EnsureProgress {
  status: 'checking' | 'downloading' | 'ready' | 'failed';
  progress?: number;
  message?: string;
  error?: string;
}

export interface EnsureResult {
  available: boolean;
  path: string;
  version?: string;
  needsUpgrade?: boolean;
  downloaded?: boolean;
  source?: 'bundled' | 'downloaded' | 'system';
  error?: string;
}

/**
 * Locate (or auto-install) a working FFmpeg binary. Returns the resolved
 * path on success. Designed so the UI can call this once and either get
 * immediate success (bundled binary works) or stream progress as the
 * portable binary is downloaded in the background.
 */
export async function ensureFFmpegAvailable(
  onProgress?: (p: EnsureProgress) => void
): Promise<EnsureResult> {
  onProgress?.({ status: 'checking', message: 'Locating video encoder...' });

  const tryPath = async (
    p: string | null,
    source: EnsureResult['source']
  ): Promise<EnsureResult | null> => {
    if (!p) return null;
    const v = await verifyFFmpeg(p);
    if (!v.ok) return null;
    cachedPath = p;
    return {
      available: true,
      path: p,
      version: v.version,
      needsUpgrade: !v.sufficient,
      source,
    };
  };

  const bundled = await tryPath(getBundledFFmpegPath(), 'bundled');
  if (bundled) { onProgress?.({ status: 'ready' }); return bundled; }

  const downloaded = existsSync(getDownloadedFFmpegPath())
    ? await tryPath(getDownloadedFFmpegPath(), 'downloaded')
    : null;
  if (downloaded) { onProgress?.({ status: 'ready' }); return downloaded; }

  const system = await tryPath(getSystemFFmpegPath(), 'system');
  if (system) { onProgress?.({ status: 'ready' }); return system; }

  // Nothing found — auto-download as a last resort.
  const dlUrl = getDownloadUrl();
  if (!dlUrl) {
    onProgress?.({
      status: 'failed',
      error: `Unsupported platform: ${process.platform}/${process.arch}`,
    });
    return {
      available: false,
      path: '',
      error: `Unsupported platform: ${process.platform}/${process.arch}`,
    };
  }

  try {
    onProgress?.({ status: 'downloading', progress: 0, message: 'Downloading video encoder...' });
    const dlPath = await downloadPortableFFmpeg((received, total) => {
      const pct = total > 0 ? Math.round((received / total) * 100) : 0;
      onProgress?.({
        status: 'downloading',
        progress: pct,
        message: `Downloading video encoder... ${pct}%`,
      });
    });
    if (!dlPath) {
      onProgress?.({ status: 'failed', error: 'Downloaded binary failed integrity check' });
      return { available: false, path: '', error: 'Downloaded binary failed integrity check' };
    }

    const verified = await tryPath(dlPath, 'downloaded');
    if (verified) {
      onProgress?.({ status: 'ready' });
      return { ...verified, downloaded: true };
    }

    onProgress?.({ status: 'failed', error: 'Downloaded binary did not respond' });
    return { available: false, path: dlPath, error: 'Downloaded binary did not respond' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress?.({ status: 'failed', error: msg });
    return { available: false, path: '', error: msg };
  }
}
