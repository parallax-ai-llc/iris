/**
 * Proxy generation IPC handlers.
 *
 * Generates a low-resolution editing proxy (720p H.264, fast preset) for a
 * source video so the editor can scrub/play smoothly without decoding the full
 * resolution master. The proxy lives under <userData>/proxies/<assetId>.mp4.
 *
 * Channels:
 *   - proxy:generate           start a single transcode (with live progress)
 *   - proxy:cancel             cancel a specific assetId job (or all)
 *   - proxy:hash               compute mtime+size hash for invalidation
 *   - proxy:check              check if a proxy file exists on disk
 *   - proxy:progress (event)   emitted on the renderer for live progress
 *
 * The handlers are intentionally per-job (not batched here). The renderer
 * orchestrates the queue/concurrency so the modal can show overall + current
 * item progress without the main process needing to know about UX details.
 */

import { ipcMain, app, BrowserWindow } from 'electron';
import path from 'path';
import { existsSync, statSync } from 'fs';
import { mkdir, unlink } from 'fs/promises';
import { spawn, type ChildProcess } from 'child_process';
import { createHash } from 'crypto';
import { findFFmpegPathSync } from './ffmpeg-resolver';

// ── ffmpeg path resolution ────────────────────────────────────────────────
const findFFmpegPath = findFFmpegPathSync;

// ── paths ──────────────────────────────────────────────────────────────────
function getProxyDir(): string {
  return path.join(app.getPath('userData'), 'proxies');
}

function getProxyOutputPath(assetId: string): string {
  return path.join(getProxyDir(), `proxy_${assetId}.mp4`);
}

// ── invalidation hash ──────────────────────────────────────────────────────
/**
 * Cheap content hash based on size + mtime. Avoids reading the full file
 * (proxies are typically multi-GB masters). Stable enough to detect a
 * replaced/edited source between sessions.
 */
function computeFileHash(filePath: string): string | null {
  try {
    const st = statSync(filePath);
    const h = createHash('sha1');
    h.update(filePath);
    h.update(String(st.size));
    h.update(String(st.mtimeMs));
    return h.digest('hex');
  } catch {
    return null;
  }
}

// ── duration probing ───────────────────────────────────────────────────────
function probeDurationSeconds(ffmpegPath: string, inputPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, ['-i', inputPath], { windowsHide: true });
    let stderr = '';
    proc.stderr?.on('data', (b: Buffer) => { stderr += b.toString(); });
    proc.on('close', () => {
      // Parse "Duration: HH:MM:SS.xx" from ffmpeg stderr
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      if (!m) { resolve(null); return; }
      const [, hh, mm, ss] = m;
      resolve(Number(hh) * 3600 + Number(mm) * 60 + Number(ss));
    });
    proc.on('error', () => resolve(null));
  });
}

// Parse "time=HH:MM:SS.xx" from ffmpeg progress lines
function parseTime(stderr: string): number | null {
  const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(stderr);
  if (!m) return null;
  const [, hh, mm, ss] = m;
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss);
}

// ── job tracking (for cancel) ──────────────────────────────────────────────
const activeJobs = new Map<string, ChildProcess>();

// ── handlers ───────────────────────────────────────────────────────────────
export function setupProxyHandlers(): void {
  ipcMain.handle(
    'proxy:check',
    async (_, { assetId }: { assetId: string }) => {
      const outputPath = getProxyOutputPath(assetId);
      const exists = existsSync(outputPath);
      return { exists, outputPath: exists ? outputPath : null };
    },
  );

  ipcMain.handle(
    'proxy:hash',
    async (_, { filePath }: { filePath: string }) => {
      return { hash: computeFileHash(filePath) };
    },
  );

  ipcMain.handle(
    'proxy:cancel',
    async (_, { assetId }: { assetId?: string } = {}) => {
      if (assetId) {
        const proc = activeJobs.get(assetId);
        if (proc) { proc.kill('SIGTERM'); activeJobs.delete(assetId); }
        return { cancelled: true, assetId };
      }
      // Cancel all
      activeJobs.forEach((proc) => proc.kill('SIGTERM'));
      activeJobs.clear();
      return { cancelled: true };
    },
  );

  ipcMain.handle(
    'proxy:generate',
    async (
      event,
      request: {
        assetId: string;
        inputPath: string;          // local absolute path of the source
        width?: number;             // proxy width  (default 1280)
        height?: number;            // proxy height (default 720)
        force?: boolean;            // ignore cached file even if it exists
      },
    ): Promise<{
      success: boolean;
      outputPath?: string;
      hash?: string | null;
      cached?: boolean;
      cancelled?: boolean;
      error?: string;
    }> => {
      const { assetId, inputPath } = request;
      const width = request.width ?? 1280;
      const height = request.height ?? 720;

      if (!existsSync(inputPath)) {
        return { success: false, error: `Source file not found: ${inputPath}` };
      }

      const ffmpegPath = findFFmpegPath();
      const proxyDir = getProxyDir();
      await mkdir(proxyDir, { recursive: true });
      const outputPath = getProxyOutputPath(assetId);
      const hash = computeFileHash(inputPath);

      // Cache hit — caller is responsible for verifying via stored hash that
      // the source hasn't changed. We still return cached=true so callers can
      // skip a redundant DB write.
      if (!request.force && existsSync(outputPath)) {
        return { success: true, outputPath, hash, cached: true };
      }

      // Probe duration so we can compute progress as a 0..1 fraction.
      const totalDuration = await probeDurationSeconds(ffmpegPath, inputPath);

      const args = [
        '-y',
        '-i', inputPath,
        // Maintain aspect ratio inside target box, no padding (avoids letterbox
        // re-encode artifacts; renderer scales to fit anyway).
        '-vf', `scale='min(${width},iw)':'min(${height},ih)':force_original_aspect_ratio=decrease`,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '26',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputPath,
      ];

      const sender = event.sender;

      return new Promise((resolve) => {
        const proc = spawn(ffmpegPath, args, { windowsHide: true });
        activeJobs.set(assetId, proc);
        let stderrBuffer = '';
        let lastProgress = -1;

        proc.stderr?.on('data', (chunk: Buffer) => {
          stderrBuffer += chunk.toString();
          // Trim buffer to keep last ~4KB (ffmpeg writes a lot)
          if (stderrBuffer.length > 8192) stderrBuffer = stderrBuffer.slice(-4096);

          if (totalDuration && totalDuration > 0) {
            const t = parseTime(stderrBuffer);
            if (t !== null) {
              const fraction = Math.min(1, Math.max(0, t / totalDuration));
              // Throttle: only emit when changed by ≥1%
              if (fraction - lastProgress >= 0.01 || fraction >= 1) {
                lastProgress = fraction;
                if (!sender.isDestroyed()) {
                  sender.send('proxy:progress', { assetId, progress: fraction });
                }
              }
            }
          }
        });

        proc.on('close', async (code, signal) => {
          activeJobs.delete(assetId);
          if (signal === 'SIGTERM') {
            // Cleanup partial output
            await unlink(outputPath).catch(() => {});
            resolve({ success: false, cancelled: true });
            return;
          }
          if (code === 0) {
            if (!sender.isDestroyed()) {
              sender.send('proxy:progress', { assetId, progress: 1 });
            }
            resolve({ success: true, outputPath, hash, cached: false });
          } else {
            const tail = stderrBuffer.slice(-500);
            await unlink(outputPath).catch(() => {});
            resolve({
              success: false,
              error: `ffmpeg failed (code ${code}): ${tail}`,
            });
          }
        });

        proc.on('error', (err) => {
          activeJobs.delete(assetId);
          resolve({ success: false, error: err.message });
        });
      });
    },
  );
}

// Helper for tests / shutdown — kill any in-flight transcodes.
export function killAllProxyJobs(): void {
  activeJobs.forEach((proc) => proc.kill('SIGTERM'));
  activeJobs.clear();
}



// Re-export types for the renderer side via preload (for documentation)
export type ProxyProgressEvent = { assetId: string; progress: number };

// Suppress unused-var warnings for BrowserWindow import (kept for future use
// when we want to broadcast progress to all windows instead of just sender).
void BrowserWindow;
