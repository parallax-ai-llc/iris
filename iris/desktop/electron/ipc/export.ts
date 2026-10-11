/**
 * Export IPC handlers - Local FFmpeg-based video rendering
 *
 * Converts timeline data into FFmpeg filter_complex commands
 * and renders the final video on the user's machine.
 */

import { ipcMain, BrowserWindow, app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, createWriteStream } from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import https from 'https';
import http from 'http';
import { ensureFFmpegAvailable, findFFmpegPathSync, type EnsureProgress } from './ffmpeg-resolver';
// FFmpeg argument building lives in ./export-render/ (pure, unit-testable).
import { buildFFmpegArgs } from './export-render/ffmpeg-args';
import type { ExportProgress, ExportRenderExtras, ExportRequest } from './export-render/types';

// Download a remote URL to a local temp file, returns local path
async function downloadToTemp(url: string, ext: string, authToken?: string, redirectCount = 0): Promise<string> {
  if (redirectCount > 5) throw new Error('Too many redirects');
  const tempDir = path.join(app.getPath('temp'), 'iris-export');
  await fs.mkdir(tempDir, { recursive: true });
  const fileName = `asset_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
  const localPath = path.join(tempDir, fileName);

  return new Promise((resolve, reject) => {
    const file = createWriteStream(localPath);
    const protocol = url.startsWith('https') ? https : http;
    const headers: Record<string, string> = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const reqOptions = { headers };

    protocol.get(url, reqOptions, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(localPath).catch(() => {});
        downloadToTemp(res.headers.location, ext, authToken, redirectCount + 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        file.close();
        fs.unlink(localPath).catch(() => {});
        reject(new Error(`HTTP ${res.statusCode} downloading asset`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(localPath); });
      file.on('error', (err) => { file.close(); fs.unlink(localPath).catch(() => {}); reject(err); });
      res.on('error', (err) => { file.close(); fs.unlink(localPath).catch(() => {}); reject(err); });
    }).on('error', (err) => {
      file.close();
      fs.unlink(localPath).catch(() => {});
      reject(err);
    });
  });
}

// Guess file extension from URL or mime
function guessExt(url: string): string {
  const match = url.match(/\.(mp4|mov|webm|mp3|m4a|aac|wav|gif|jpg|jpeg|png|webp)(\?|$)/i);
  return match ? `.${match[1].toLowerCase()}` : '.mp4';
}

// FFmpeg path resolution + auto-install lives in ./ffmpeg-resolver.
// findFFmpegPath() is kept as a thin sync shim for hot paths (probe handlers).
function findFFmpegPath(): string {
  return findFFmpegPathSync();
}

// Check if a local file has an audio stream using ffmpeg -i (parses stderr)
async function checkSourceHasAudio(ffmpegPath: string, filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, ['-i', filePath], { stdio: 'pipe' });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', () => resolve(stderr.includes('Audio:')));
    proc.on('error', () => resolve(false));
  });
}

// ==================== Subtitle Export ====================

async function exportSubtitles(
  request: ExportRequest,
  format: 'srt' | 'vtt'
): Promise<string | null> {
  const subtitleTracks = request.tracks.filter((t) => t.type === 'subtitle');
  const allSubs = subtitleTracks.flatMap((t) => t.clips)
    .filter((c) => c.text)
    .sort((a, b) => a.startTime - b.startTime);

  if (allSubs.length === 0) return null;

  const ext = format === 'srt' ? '.srt' : '.vtt';
  const outputPath = request.outputPath.replace(/\.[^.]+$/, ext);

  let content = '';

  if (format === 'vtt') {
    content = 'WEBVTT\n\n';
  }

  allSubs.forEach((sub, i) => {
    const startTC = formatTimecode(sub.startTime, format);
    const endTC = formatTimecode(sub.endTime, format);

    if (format === 'srt') {
      content += `${i + 1}\n${startTC} --> ${endTC}\n${sub.text}\n\n`;
    } else {
      content += `${startTC} --> ${endTC}\n${sub.text}\n\n`;
    }
  });

  await fs.writeFile(outputPath, content, 'utf-8');
  return outputPath;
}

function formatTimecode(seconds: number, format: 'srt' | 'vtt'): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  const sep = format === 'srt' ? ',' : '.';
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(ms).padStart(3, '0')}`;
}

// ==================== Active Export Process ====================

let activeExport: ChildProcess | null = null;

function sendProgress(win: InstanceType<typeof BrowserWindow> | null, progress: ExportProgress) {
  win?.webContents.send('export:progress', progress);
}

// ==================== IPC Handlers ====================

export function setupExportHandlers() {
  // Ensure FFmpeg is available — bundled binary, system install, or auto-download.
  // Streams progress to the renderer so the UI can show "Setting up..." rather
  // than a hard "not found" error.
  ipcMain.handle('export:ensureFFmpeg', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await ensureFFmpegAvailable((p: EnsureProgress) => {
      win?.webContents.send('export:ffmpegSetupProgress', p);
    });
    return result;
  });

  // Back-compat alias — older renderer builds call export:checkFFmpeg.
  // Delegates to the same ensure flow so users always get auto-install.
  ipcMain.handle('export:checkFFmpeg', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await ensureFFmpegAvailable((p: EnsureProgress) => {
      win?.webContents.send('export:ffmpegSetupProgress', p);
    });
    return result;
  });

  // Probe video dimensions from a URL using ffmpeg directly (no full download needed).
  // Uses -probesize and -analyzeduration to limit how much data ffmpeg reads,
  // and kills the process as soon as dimensions are parsed from stderr.
  // Probe duration via ffmpeg. Falls back here when the renderer's
  // <video preload="metadata"> probe returns 0 (encrypted streams,
  // missing previewUrl, unsupported browser codec). Reads only the
  // container header so it's cheap.
  ipcMain.handle('video:probeDuration', async (_, url: string, authToken?: string) => {
    const ffmpegPath = findFFmpegPath();
    return await new Promise<number | null>((resolve) => {
      let resolved = false;
      const safe = (v: number | null) => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(v); } };

      const args: string[] = [];
      if (authToken) args.push('-headers', `Authorization: Bearer ${authToken}\r\n`);
      args.push('-probesize', '5000000', '-analyzeduration', '0', '-i', url);

      const proc = spawn(ffmpegPath, args, { stdio: 'pipe' });
      let stderr = '';
      const tryParse = () => {
        const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
        if (!m) return;
        const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
        proc.kill();
        safe(sec);
      };
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); tryParse(); });
      proc.on('close', () => { tryParse(); safe(null); });
      proc.on('error', () => safe(null));
      const timer = setTimeout(() => { proc.kill(); safe(null); }, 10000);
    });
  });

  ipcMain.handle('video:probeDimensions', async (_, url: string, authToken?: string) => {
    const ffmpegPath = findFFmpegPath();

    return await new Promise<{ width: number; height: number } | null>((resolve) => {
      let resolved = false;
      const safeResolve = (val: { width: number; height: number } | null) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        resolve(val);
      };

      const args: string[] = [];
      if (authToken) {
        // ffmpeg HTTP header option — must end with \r\n
        args.push('-headers', `Authorization: Bearer ${authToken}\r\n`);
      }
      // Limit probe to 5MB / 0 analysis duration — only read container headers
      args.push('-probesize', '5000000', '-analyzeduration', '0', '-i', url);

      const proc = spawn(ffmpegPath, args, { stdio: 'pipe' });
      let stderr = '';

      const tryParse = () => {
        // Parse encoded dimensions from the Video stream line
        const dimMatch = stderr.match(/Video:.*?[, ](\d{2,5})x(\d{2,5})[, ]/);
        if (!dimMatch) return;
        const encodedW = parseInt(dimMatch[1]);
        const encodedH = parseInt(dimMatch[2]);

        // Parse rotation from stream metadata tag or displaymatrix side data
        let rotation = 0;
        const rotateMeta = stderr.match(/rotate\s*:\s*(-?\d+)/);
        if (rotateMeta) {
          rotation = Math.abs(parseInt(rotateMeta[1]));
        } else {
          const displayMatrix = stderr.match(/displaymatrix.*?rotation of (-?\d+\.?\d*) degrees/i);
          if (displayMatrix) {
            rotation = Math.abs(Math.round(parseFloat(displayMatrix[1])));
          }
        }

        const width  = (rotation === 90 || rotation === 270) ? encodedH : encodedW;
        const height = (rotation === 90 || rotation === 270) ? encodedW : encodedH;

        // Kill ffmpeg immediately — we have what we need
        proc.kill();
        safeResolve({ width, height });
      };

      proc.stderr?.on('data', (d: Buffer) => {
        stderr += d.toString();
        tryParse();
      });

      proc.on('close', () => {
        // Final attempt in case dimensions arrived in the last chunk
        tryParse();
        safeResolve(null);
      });
      proc.on('error', () => safeResolve(null));

      // Kill after 10s to avoid hanging
      const timer = setTimeout(() => { proc.kill(); safeResolve(null); }, 10000);
    });
  });

  // Start export rendering
  ipcMain.handle('export:start', async (event, request: ExportRequest) => {
    const win = BrowserWindow.fromWebContents(event.sender);

    // Cancel any existing export
    if (activeExport) {
      activeExport.kill();
      activeExport = null;
    }

    sendProgress(win, {
      status: 'preparing',
      progress: 0,
      message: 'Preparing export...',
    });

    const tempFiles: string[] = [];
    try {
      // Allow callers (e.g. Silence Removal flattening the timeline) to omit a
      // destination — render to a temp file and return its path.
      if (!request.outputPath) {
        request.outputPath = path.join(app.getPath('temp'), `iris-flatten-${Date.now()}.mp4`);
      }

      // Ensure output directory exists
      const outputDir = path.dirname(request.outputPath);
      await fs.mkdir(outputDir, { recursive: true });

      // Resolve sourceUrls — all assets must already be local
      for (const track of request.tracks) {
        for (const clip of track.clips) {
          if (!clip.sourceUrl) continue;

          if (clip.sourceUrl.startsWith('file://')) {
            clip.sourceUrl = decodeURIComponent(clip.sourceUrl.replace(/^file:\/\/\//, ''));
          } else if (clip.sourceUrl.startsWith('http://127.0.0.1:') && clip.sourceUrl.includes('path=')) {
            // Local media server URL — the real local file path is in the ?path= query.
            // Served over HTTP only so <video>/<audio> can Range-stream in the editor.
            const localPath = new URL(clip.sourceUrl).searchParams.get('path');
            if (!localPath) {
              throw new Error(`Invalid local media URL: ${clip.sourceUrl}. Restart the project.`);
            }
            clip.sourceUrl = localPath;
          } else if (clip.sourceUrl.startsWith('http')) {
            throw new Error(`Asset not downloaded locally: ${clip.sourceUrl}. Restart the project.`);
          }
        }
      }

      // Validate: all media clips must have valid local file paths
      const missingFiles: string[] = [];
      for (const track of request.tracks) {
        for (const clip of track.clips) {
          if (clip.sourceUrl && !clip.sourceUrl.startsWith('http') && !existsSync(clip.sourceUrl)) {
            missingFiles.push(`${clip.type}:${clip.sourceUrl}`);
          }
        }
      }
      if (missingFiles.length > 0) {
        console.error('[Export] Missing files:', missingFiles);
      }

      // Write subtitle PNG overlays to temp files (rasterized by the renderer)
      if (request.subtitleOverlays && request.subtitleOverlays.length > 0) {
        const subTempDir = path.join(app.getPath('temp'), 'iris-export');
        await fs.mkdir(subTempDir, { recursive: true });
        for (const overlay of request.subtitleOverlays) {
          if (!overlay.pngDataUrl) continue;
          const b64 = overlay.pngDataUrl.replace(/^data:image\/png;base64,/, '');
          const buf = Buffer.from(b64, 'base64');
          const tmpPng = path.join(
            subTempDir,
            `subtitle_${Date.now()}_${Math.random().toString(36).slice(2)}.png`,
          );
          await fs.writeFile(tmpPng, buf);
          overlay.pngPath = tmpPng;
          tempFiles.push(tmpPng);
        }
      }

      // Export subtitles separately if needed
      if (request.includeSubtitles && request.subtitleFormat && request.subtitleFormat !== 'burned') {
        const subPath = await exportSubtitles(request, request.subtitleFormat);
        if (subPath) {
          sendProgress(win, {
            status: 'preparing',
            progress: 25,
            message: `Subtitles exported to ${path.basename(subPath)}`,
          });
        }
      }

      // Build FFmpeg command
      const ffmpegPath = findFFmpegPath();

      // Probe each unique local source for audio streams
      const sourcesWithAudio = new Set<string>();
      const uniqueLocalPaths = Array.from(new Set(
        request.tracks.flatMap((t) => t.clips).map((c) => c.sourceUrl).filter(Boolean)
      ));
      for (const srcPath of uniqueLocalPaths) {
        if (await checkSourceHasAudio(ffmpegPath, srcPath)) {
          sourcesWithAudio.add(srcPath);
        }
      }

      const args = buildFFmpegArgs(request, sourcesWithAudio, { tempDir: app.getPath('temp') });

      // Write burned subtitle ASS file if prepared by buildFFmpegArgs
      const reqWithAss = request as ExportRequest & ExportRenderExtras;
      if (reqWithAss._assContent && reqWithAss._assPath) {
        await fs.writeFile(reqWithAss._assPath, reqWithAss._assContent, 'utf-8');
        tempFiles.push(reqWithAss._assPath);
      }

      sendProgress(win, {
        status: 'rendering',
        progress: 10,
        message: 'Starting FFmpeg render...',
      });

      // Log the full FFmpeg command for debugging
      const ffmpegCmd = `${ffmpegPath} ${args.join(' ')}`;
      console.log('[Export] FFmpeg command:', ffmpegCmd);
      try { require('fs').writeFileSync(require('path').join(require('os').tmpdir(), 'iris-export-cmd.log'), ffmpegCmd); } catch {};

      // Spawn FFmpeg process
      return new Promise<{ success: boolean; outputPath?: string; error?: string }>((resolve) => {
        const spawnOpts: any = { stdio: 'pipe' };
        if ((request as any)._ffmpegCwd) spawnOpts.cwd = (request as any)._ffmpegCwd;
        const proc = spawn(ffmpegPath, args, spawnOpts);
        activeExport = proc;
        let cancelled = false;
        (proc as any).__onCancel = () => { cancelled = true; };

        let stderr = '';

        proc.stderr?.on('data', (data: Buffer) => {
          const line = data.toString();
          stderr += line;

          // Parse progress from FFmpeg stderr
          // FFmpeg outputs: frame=  123 fps= 30 q=28.0 size=    1234kB time=00:00:04.10 bitrate=2467.2kbits/s speed=1.05x
          const timeMatch = line.match(/time=(\d+):(\d+):(\d+\.\d+)/);
          if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const mins = parseInt(timeMatch[2]);
            const secs = parseFloat(timeMatch[3]);
            const currentTime = hours * 3600 + mins * 60 + secs;
            const progress = Math.min(95, 10 + (currentTime / request.duration) * 85);

            const speedMatch = line.match(/speed=\s*([\d.]+)x/);
            const speed = speedMatch ? parseFloat(speedMatch[1]) : 0;
            const remaining = speed > 0
              ? Math.round((request.duration - currentTime) / speed)
              : 0;

            sendProgress(win, {
              status: 'rendering',
              progress: Math.round(progress),
              message: speed > 0
                ? `Rendering... ${Math.round(progress)}% (${remaining}s remaining)`
                : `Rendering... ${Math.round(progress)}%`,
            });
          }
        });

        const cleanup = () => {
          for (const f of tempFiles) {
            fs.unlink(f).catch(() => {});
          }
        };

        proc.on('close', (code) => {
          activeExport = null;
          cleanup();

          if (cancelled) {
            sendProgress(win, {
              status: 'cancelled',
              progress: 0,
              message: 'Export cancelled',
            });
            resolve({ success: false, error: 'cancelled' });
            return;
          }

          if (code === 0) {
            sendProgress(win, {
              status: 'completed',
              progress: 100,
              message: 'Export completed!',
              outputPath: request.outputPath,
            });
            resolve({ success: true, outputPath: request.outputPath });
          } else {
            const stderrLines = stderr.split('\n').filter(Boolean);
            console.error('[Export] FFmpeg failed. Last stderr lines:\n', stderrLines.slice(-10).join('\n'));
            const errorMsg = stderrLines.slice(-3).join(' | ') || `FFmpeg exited with code ${code}`;
            sendProgress(win, {
              status: 'failed',
              progress: 0,
              message: 'Export failed',
              error: errorMsg,
            });
            resolve({ success: false, error: errorMsg });
          }
        });

        proc.on('error', (err) => {
          activeExport = null;
          cleanup();
          sendProgress(win, {
            status: 'failed',
            progress: 0,
            message: 'Export failed',
            error: err.message,
          });
          resolve({ success: false, error: err.message });
        });
      });
    } catch (err) {
      // Cleanup temp files on error
      for (const f of tempFiles) {
        fs.unlink(f).catch(() => {});
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      sendProgress(win, {
        status: 'failed',
        progress: 0,
        message: 'Export failed',
        error: errorMsg,
      });
      return { success: false, error: errorMsg };
    }
  });

  // Cancel export
  ipcMain.handle('export:cancel', () => {
    if (activeExport) {
      const proc: any = activeExport;
      if (typeof proc.__onCancel === 'function') proc.__onCancel();
      proc.kill(process.platform === 'win32' ? undefined : 'SIGTERM');
      activeExport = null;
      return { cancelled: true };
    }
    return { cancelled: false };
  });

  // Note: proxy:generate has moved to electron/ipc/proxy.ts (setupProxyHandlers)
}
