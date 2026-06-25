/**
 * Pre-render IPC handlers - Merge multiple timeline clips into a single file
 *
 * Used by AI tools (Upscale, AutoCut, Auto-Reframe) that require a single
 * video asset but need to process a multi-clip timeline project.
 *
 * Flow:
 *   1. Renderer calls prerender:mergeClips with clip data
 *   2. FFmpeg concat filter merges clips into a temp MP4
 *   3. Progress events are sent back to renderer
 *   4. On completion, temp file path is returned
 *   5. Renderer uploads the temp file to server → gets assetId
 *   6. Renderer calls prerender:cleanup to delete the temp file
 */

import { ipcMain, BrowserWindow } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { existsSync, createWriteStream } from 'fs';
import http from 'http';
import https from 'https';
import { spawn, type ChildProcess } from 'child_process';
import { findFFmpegPathSync } from './ffmpeg-resolver';

// ==================== Remote URL → Local File ====================

async function downloadToTemp(url: string, redirectCount = 0): Promise<string> {
  if (redirectCount > 5) throw new Error('Too many redirects');
  const ext = (url.match(/\.(mp4|mov|webm|mp3|m4a|aac|wav|mkv)(\?|$)/i)?.[1] || 'mp4').toLowerCase();
  const tempDir = os.tmpdir();
  const localPath = path.join(tempDir, `prerender-src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);

  return new Promise((resolve, reject) => {
    const file = createWriteStream(localPath);
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(localPath).catch(() => {});
        downloadToTemp(res.headers.location, redirectCount + 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        file.close();
        fs.unlink(localPath).catch(() => {});
        reject(new Error(`HTTP ${res.statusCode} downloading source`));
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

async function resolveClipSources<T extends { sourceUrl: string }>(clips: T[]): Promise<{ clips: T[]; tempFiles: string[] }> {
  const tempFiles: string[] = [];
  const resolved: T[] = [];
  for (const clip of clips) {
    const src = clip.sourceUrl;
    if (/^https?:\/\//i.test(src)) {
      const local = await downloadToTemp(src);
      tempFiles.push(local);
      resolved.push({ ...clip, sourceUrl: local });
    } else if (src.startsWith('file://')) {
      resolved.push({ ...clip, sourceUrl: src.replace(/^file:\/\//, '') });
    } else {
      if (!existsSync(src)) {
        throw new Error(`Source file not found: ${src}`);
      }
      resolved.push(clip);
    }
  }
  return { clips: resolved, tempFiles };
}

// ==================== FFmpeg Path (shared resolver) ====================

const findFFmpegPath = findFFmpegPathSync;

// Check if a local file has an audio stream using ffmpeg -i (parses stderr).
// Mirrors the export pipeline's probe so the concat never references a
// non-existent [idx:a] pad (which fails with "matches no streams").
function checkSourceHasAudio(ffmpegPath: string, filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, ['-i', filePath], { stdio: 'pipe' });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', () => resolve(stderr.includes('Audio:')));
    proc.on('error', () => resolve(false));
  });
}

// Normalize an audio chain so every concat/amix input shares the same
// sample rate / layout / format (otherwise FFmpeg rejects mismatched inputs).
const AUDIO_NORMALIZE = 'aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo';

/**
 * The amount of source media a clip actually contributes.
 *
 * The clip's playable length on the timeline is `endTime - startTime`; that is
 * the authoritative duration. The source out-point (`sourceEndTime`) can be
 * larger than the timeline range (e.g. split/trimmed clips whose source window
 * was never tightened) — using it directly would stretch the output to several
 * times the real length. So we read exactly `timelineDuration * speed` seconds
 * of source, never past the source out-point.
 */
function resolveClipWindow(clip: {
  startTime: number;
  endTime: number;
  sourceStartTime: number;
  sourceEndTime: number;
  speed?: number;
}): { speed: number; srcStart: number; srcEnd: number; outDuration: number } {
  const speed = clip.speed && clip.speed > 0 ? clip.speed : 1;
  const srcStart = clip.sourceStartTime;
  const maxSrcDur = Math.max(0, clip.sourceEndTime - srcStart);
  const timelineDur = Math.max(0, clip.endTime - clip.startTime);
  // Prefer the timeline-derived length; fall back to the full source range when
  // the timeline duration is missing/degenerate.
  const wantSrcDur = timelineDur > 0 ? timelineDur * speed : maxSrcDur;
  const srcDur = Math.min(maxSrcDur, wantSrcDur);
  return { speed, srcStart, srcEnd: srcStart + srcDur, outDuration: srcDur / speed };
}

// ==================== Types ====================

interface PrerenderClip {
  sourceUrl: string;      // Local file path or remote URL
  startTime: number;      // Timeline start (seconds)
  endTime: number;        // Timeline end (seconds)
  sourceStartTime: number; // Source media in-point offset (seconds)
  sourceEndTime: number;   // Source media out-point offset (seconds)
  volume?: number;
  speed?: number;
}

interface PrerenderRequest {
  clips: PrerenderClip[];
  width: number;
  height: number;
  frameRate?: number;
  outputPath?: string;
}

interface PrerenderProgress {
  status: 'preparing' | 'rendering' | 'completed' | 'failed';
  progress: number;
  message: string;
  error?: string;
  outputPath?: string;
}

// ==================== Active Process ====================

let activePrerender: ChildProcess | null = null;

function sendPrerenderProgress(win: InstanceType<typeof BrowserWindow> | null, progress: PrerenderProgress) {
  win?.webContents.send('prerender:progress', progress);
}

// ==================== IPC Handlers ====================

export function setupPrerenderHandlers() {
  /**
   * Merge multiple video clips into a single MP4 using FFmpeg concat filter.
   * Returns { success, outputPath } on completion.
   */
  ipcMain.handle('prerender:mergeClips', async (event, request: PrerenderRequest) => {
    const win = BrowserWindow.fromWebContents(event.sender);

    // Cancel any existing prerender
    if (activePrerender) {
      activePrerender.removeAllListeners();
      activePrerender.stderr?.removeAllListeners();
      activePrerender.stdout?.removeAllListeners();
      activePrerender.kill();
      activePrerender = null;
    }

    const outputPath = request.outputPath ??
      path.join(os.tmpdir(), `prerender-${Date.now()}.mp4`);

    const rawClips = request.clips;
    if (!rawClips || rawClips.length === 0) {
      return { success: false, error: 'No clips provided' };
    }

    let tempFiles: string[] = [];
    try {
      const resolved = await resolveClipSources(rawClips);
      tempFiles = resolved.tempFiles;
      const clips = resolved.clips;

      // Single clip - just trim, no concat needed
      if (clips.length === 1) {
        return await renderSingleClip(win, clips[0], request, outputPath);
      }

      // Multi-clip: build FFmpeg filter_complex concat
      return await renderMultiClipConcat(win, clips, request, outputPath);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to resolve sources' };
    } finally {
      for (const f of tempFiles) {
        fs.unlink(f).catch(() => {});
      }
    }
  });

  /**
   * Delete a temporary pre-rendered file.
   */
  ipcMain.handle('prerender:cleanup', async (_, filePath: string) => {
    try {
      if (existsSync(filePath)) {
        await fs.unlink(filePath);
      }
      return { success: true };
    } catch {
      return { success: false };
    }
  });

  /**
   * Cancel an in-progress pre-render.
   */
  ipcMain.handle('prerender:cancel', () => {
    if (activePrerender) {
      activePrerender.removeAllListeners();
      activePrerender.stderr?.removeAllListeners();
      activePrerender.stdout?.removeAllListeners();
      activePrerender.kill(process.platform === 'win32' ? undefined : 'SIGTERM');
      activePrerender = null;
      return { cancelled: true };
    }
    return { cancelled: false };
  });
}

// ==================== Single Clip Render ====================

async function renderSingleClip(
  win: InstanceType<typeof BrowserWindow> | null,
  clip: PrerenderClip,
  request: PrerenderRequest,
  outputPath: string,
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  const ffmpegPath = findFFmpegPath();
  const { speed, srcStart, srcEnd, outDuration: clipDuration } = resolveClipWindow(clip);

  const args: string[] = [
    '-y',
    '-ss', String(srcStart),
    '-t', String(srcEnd - srcStart),
    '-i', clip.sourceUrl,
  ];

  const vFilters: string[] = [];
  if (speed !== 1) {
    vFilters.push(`setpts=${1 / speed}*PTS`);
  }
  vFilters.push(`scale=${request.width}:${request.height}:force_original_aspect_ratio=decrease`);
  vFilters.push(`pad=${request.width}:${request.height}:(ow-iw)/2:(oh-ih)/2`);

  args.push('-vf', vFilters.join(','));

  // Audio
  const aFilters: string[] = [];
  if (speed !== 1) {
    aFilters.push(`atempo=${speed}`);
  }
  if (clip.volume !== undefined && clip.volume !== 1) {
    aFilters.push(`volume=${clip.volume}`);
  }
  if (aFilters.length > 0) {
    args.push('-af', aFilters.join(','));
  }

  args.push(
    '-c:v', 'libx264',
    '-crf', '18',
    '-preset', 'fast',
    '-c:a', 'aac',
    '-r', String(request.frameRate || 30),
    '-movflags', '+faststart',
    outputPath,
  );

  sendPrerenderProgress(win, {
    status: 'rendering',
    progress: 5,
    message: 'Rendering single clip...',
  });

  return runFFmpeg(win, ffmpegPath, args, clipDuration, outputPath);
}

// ==================== Multi-Clip Concat ====================

async function renderMultiClipConcat(
  win: InstanceType<typeof BrowserWindow> | null,
  clips: PrerenderClip[],
  request: PrerenderRequest,
  outputPath: string,
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  const ffmpegPath = findFFmpegPath();

  // Probe each source for an audio stream. Clips without audio (AI-generated
  // video, extracted-and-deleted audio, images) get a synthesized silent track
  // so every concat audio pad exists and shares the same format — otherwise
  // FFmpeg fails with "matches no streams" or "do not match".
  const hasAudioFlags = await Promise.all(
    clips.map((c) => checkSourceHasAudio(ffmpegPath, c.sourceUrl))
  );

  const args: string[] = ['-y'];

  // Add each clip as an input
  for (const clip of clips) {
    args.push('-i', clip.sourceUrl);
  }

  // Build filter_complex
  const filterParts: string[] = [];
  const vLabels: string[] = [];
  const aLabels: string[] = [];
  let totalDuration = 0;

  clips.forEach((clip, idx) => {
    const { speed, srcStart, srcEnd, outDuration: clipDuration } = resolveClipWindow(clip);
    totalDuration += clipDuration;

    // Video chain
    const vFilters: string[] = [];
    vFilters.push(`trim=start=${srcStart}:end=${srcEnd}`);
    vFilters.push('setpts=PTS-STARTPTS');
    if (speed !== 1) {
      vFilters.push(`setpts=${1 / speed}*PTS`);
    }
    vFilters.push(`scale=${request.width}:${request.height}:force_original_aspect_ratio=decrease`);
    vFilters.push(`pad=${request.width}:${request.height}:(ow-iw)/2:(oh-ih)/2`);
    vFilters.push('setsar=1');

    const vLabel = `v${idx}`;
    filterParts.push(`[${idx}:v]${vFilters.join(',')}[${vLabel}]`);
    vLabels.push(`[${vLabel}]`);

    // Audio chain
    const aLabel = `a${idx}`;
    if (hasAudioFlags[idx]) {
      const aFilters: string[] = [];
      aFilters.push(`atrim=start=${srcStart}:end=${srcEnd}`);
      aFilters.push('asetpts=PTS-STARTPTS');
      if (speed !== 1) {
        aFilters.push(`atempo=${speed}`);
      }
      if (clip.volume !== undefined && clip.volume !== 1) {
        aFilters.push(`volume=${clip.volume}`);
      }
      aFilters.push(AUDIO_NORMALIZE);
      filterParts.push(`[${idx}:a]${aFilters.join(',')}[${aLabel}]`);
    } else {
      // No audio stream: synthesize silence for this clip's duration.
      filterParts.push(
        `anullsrc=channel_layout=stereo:sample_rate=44100,atrim=end=${clipDuration},asetpts=PTS-STARTPTS,${AUDIO_NORMALIZE}[${aLabel}]`
      );
    }
    aLabels.push(`[${aLabel}]`);
  });

  // Concat filter: interleave [v0][a0][v1][a1]...
  const n = clips.length;
  const interleavedLabels = vLabels.map((vl, i) => vl + aLabels[i]).join('');
  filterParts.push(`${interleavedLabels}concat=n=${n}:v=1:a=1[outv][outa]`);

  args.push('-filter_complex', filterParts.join(';'));
  args.push('-map', '[outv]', '-map', '[outa]');

  args.push(
    '-c:v', 'libx264',
    '-crf', '18',
    '-preset', 'fast',
    '-c:a', 'aac',
    '-r', String(request.frameRate || 30),
    '-movflags', '+faststart',
    outputPath,
  );

  sendPrerenderProgress(win, {
    status: 'preparing',
    progress: 0,
    message: `Merging ${clips.length} clips...`,
  });

  return runFFmpeg(win, ffmpegPath, args, totalDuration, outputPath);
}

// ==================== FFmpeg Runner ====================

function runFFmpeg(
  win: InstanceType<typeof BrowserWindow> | null,
  ffmpegPath: string,
  args: string[],
  totalDuration: number,
  outputPath: string,
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args, { stdio: 'pipe' });
    activePrerender = proc;

    let stderr = '';

    proc.stderr?.on('data', (data: Buffer) => {
      const line = data.toString();
      stderr += line;

      // Parse progress from FFmpeg time= output
      const timeMatch = line.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const mins = parseInt(timeMatch[2]);
        const secs = parseFloat(timeMatch[3]);
        const currentTime = hours * 3600 + mins * 60 + secs;
        const progress = totalDuration > 0
          ? Math.min(95, Math.round((currentTime / totalDuration) * 95))
          : 0;

        sendPrerenderProgress(win, {
          status: 'rendering',
          progress,
          message: `Rendering... ${progress}%`,
        });
      }
    });

    proc.on('close', (code) => {
      activePrerender = null;

      if (code === 0) {
        sendPrerenderProgress(win, {
          status: 'completed',
          progress: 100,
          message: 'Pre-render completed',
          outputPath,
        });
        resolve({ success: true, outputPath });
      } else {
        const errorMsg = stderr.split('\n').filter(Boolean).pop() || `FFmpeg exited with code ${code}`;
        sendPrerenderProgress(win, {
          status: 'failed',
          progress: 0,
          message: 'Pre-render failed',
          error: errorMsg,
        });
        resolve({ success: false, error: errorMsg });
      }
    });

    proc.on('error', (err) => {
      activePrerender = null;
      sendPrerenderProgress(win, {
        status: 'failed',
        progress: 0,
        message: 'Pre-render failed',
        error: err.message,
      });
      resolve({ success: false, error: err.message });
    });
  });
}
