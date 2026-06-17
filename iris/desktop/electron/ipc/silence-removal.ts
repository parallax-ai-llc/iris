/**
 * Silence Removal IPC handlers - Detect and remove silent segments from video
 *
 * Client-side processing using FFmpeg's silencedetect filter.
 *
 * Flow:
 *   1. Renderer calls silence:detect with threshold and duration params
 *   2. FFmpeg silencedetect filter analyzes audio, returns silent segments
 *   3. Renderer calculates non-silent segments and calls silence:remove
 *   4. FFmpeg trim+concat produces a new video without silent parts
 *   5. Progress events sent via silence:progress channel
 */

import { ipcMain, BrowserWindow } from 'electron';
import path from 'path';
import os from 'os';
import { existsSync } from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { findFFmpegPathSync } from './ffmpeg-resolver';

const findFFmpegPath = findFFmpegPathSync;

// ==================== Types ====================

interface SilenceDetectRequest {
  inputPath: string;
  noiseThresholdDb: number;   // e.g., -30
  minSilenceDuration: number; // e.g., 0.5 seconds
}

interface SilentSegment {
  start: number;
  end: number;
  duration: number;
}

interface SilenceRemoveRequest {
  inputPath: string;
  nonSilentSegments: Array<{ start: number; end: number }>;
  outputPath?: string;
}

interface SilenceProgress {
  status: 'detecting' | 'removing' | 'completed' | 'failed';
  progress: number;
  message: string;
  error?: string;
  outputPath?: string;
}

// ==================== Active Process ====================

let activeProcess: ChildProcess | null = null;

function sendProgress(win: InstanceType<typeof BrowserWindow> | null, progress: SilenceProgress) {
  win?.webContents.send('silence:progress', progress);
}

// ==================== IPC Handlers ====================

export function setupSilenceRemovalHandlers() {
  /**
   * Analyze audio loudness via FFmpeg volumedetect filter.
   * Returns mean_volume and max_volume in dBFS (negative numbers; 0 = max).
   * Used to derive an automatic silence threshold adapted to the source.
   */
  ipcMain.handle('silence:analyze', async (_event, request: { inputPath: string }) => {
    const { inputPath } = request;
    if (!inputPath || !existsSync(inputPath)) {
      return { success: false, error: 'Input file not found' };
    }

    const ffmpegPath = findFFmpegPath();
    const args = ['-i', inputPath, '-af', 'volumedetect', '-vn', '-sn', '-dn', '-f', 'null', '-'];

    return new Promise<{
      success: boolean;
      meanVolume?: number;
      maxVolume?: number;
      error?: string;
    }>((resolve) => {
      const proc = spawn(ffmpegPath, args, { stdio: 'pipe' });
      let stderr = '';
      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      proc.on('close', () => {
        const meanMatch = stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
        const maxMatch = stderr.match(/max_volume:\s*(-?[\d.]+)\s*dB/);
        if (!meanMatch || !maxMatch) {
          resolve({ success: false, error: 'Failed to parse volumedetect output' });
          return;
        }
        resolve({
          success: true,
          meanVolume: parseFloat(meanMatch[1]),
          maxVolume: parseFloat(maxMatch[1]),
        });
      });
      proc.on('error', (err) => resolve({ success: false, error: err.message }));
    });
  });

  /**
   * Detect silent segments in a video using FFmpeg silencedetect filter.
   * Returns array of silent segments with start/end timestamps.
   */
  ipcMain.handle('silence:detect', async (event, request: SilenceDetectRequest) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { inputPath, noiseThresholdDb, minSilenceDuration } = request;

    if (!inputPath || !existsSync(inputPath)) {
      return { success: false, segments: [], totalDuration: 0, error: 'Input file not found' };
    }

    // Cancel any existing process
    if (activeProcess) {
      activeProcess.kill();
      activeProcess = null;
    }

    sendProgress(win, {
      status: 'detecting',
      progress: 10,
      message: 'Analyzing audio for silent segments...',
    });

    const ffmpegPath = findFFmpegPath();

    // First, get total duration via ffprobe-style approach
    const totalDuration = await getVideoDuration(ffmpegPath, inputPath);

    const args = [
      '-i', inputPath,
      '-af', `silencedetect=noise=${noiseThresholdDb}dB:d=${minSilenceDuration}`,
      '-f', 'null',
      '-',
    ];

    return new Promise<{
      success: boolean;
      segments: SilentSegment[];
      totalDuration: number;
      error?: string;
    }>((resolve) => {
      const proc = spawn(ffmpegPath, args, { stdio: 'pipe' });
      activeProcess = proc;

      let stderr = '';

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        activeProcess = null;

        // Parse silence segments from stderr
        const segments = parseSilenceDetectOutput(stderr);

        sendProgress(win, {
          status: 'detecting',
          progress: 100,
          message: `Detected ${segments.length} silent segment(s)`,
        });

        resolve({
          success: true,
          segments,
          totalDuration,
        });
      });

      proc.on('error', (err) => {
        activeProcess = null;
        sendProgress(win, {
          status: 'failed',
          progress: 0,
          message: 'Failed to detect silence',
          error: err.message,
        });
        resolve({ success: false, segments: [], totalDuration: 0, error: err.message });
      });
    });
  });

  /**
   * Remove silent segments by concatenating only non-silent portions.
   * Uses FFmpeg trim+concat filter_complex.
   */
  ipcMain.handle('silence:remove', async (event, request: SilenceRemoveRequest) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { inputPath, nonSilentSegments } = request;

    if (!inputPath || !existsSync(inputPath)) {
      return { success: false, error: 'Input file not found' };
    }

    if (!nonSilentSegments || nonSilentSegments.length === 0) {
      return { success: false, error: 'No non-silent segments provided' };
    }

    // Cancel any existing process
    if (activeProcess) {
      activeProcess.kill();
      activeProcess = null;
    }

    const outputPath = request.outputPath ??
      path.join(os.tmpdir(), `silence-removed-${Date.now()}.mp4`);

    const ffmpegPath = findFFmpegPath();

    // Calculate total output duration for progress tracking
    const totalOutputDuration = nonSilentSegments.reduce(
      (sum, seg) => sum + (seg.end - seg.start), 0
    );

    // Single segment: simple trim
    if (nonSilentSegments.length === 1) {
      const seg = nonSilentSegments[0];
      const args = [
        '-y',
        '-ss', String(seg.start),
        '-t', String(seg.end - seg.start),
        '-i', inputPath,
        '-c:v', 'libx264',
        '-crf', '18',
        '-preset', 'fast',
        '-c:a', 'aac',
        '-movflags', '+faststart',
        outputPath,
      ];

      sendProgress(win, {
        status: 'removing',
        progress: 5,
        message: 'Removing silent segments...',
      });

      return runFFmpeg(win, ffmpegPath, args, totalOutputDuration, outputPath);
    }

    // Multiple segments: build filter_complex with trim+concat
    const args: string[] = ['-y', '-i', inputPath];

    const filterParts: string[] = [];
    const vLabels: string[] = [];
    const aLabels: string[] = [];

    nonSilentSegments.forEach((seg, idx) => {
      const vLabel = `v${idx}`;
      const aLabel = `a${idx}`;

      filterParts.push(
        `[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[${vLabel}]`
      );
      filterParts.push(
        `[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[${aLabel}]`
      );

      vLabels.push(`[${vLabel}]`);
      aLabels.push(`[${aLabel}]`);
    });

    // Concat: interleave [v0][a0][v1][a1]...
    const n = nonSilentSegments.length;
    const interleavedLabels = vLabels.map((vl, i) => vl + aLabels[i]).join('');
    filterParts.push(`${interleavedLabels}concat=n=${n}:v=1:a=1[outv][outa]`);

    args.push('-filter_complex', filterParts.join(';'));
    args.push('-map', '[outv]', '-map', '[outa]');

    args.push(
      '-c:v', 'libx264',
      '-crf', '18',
      '-preset', 'fast',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      outputPath,
    );

    sendProgress(win, {
      status: 'removing',
      progress: 5,
      message: `Removing silence — joining ${n} segments...`,
    });

    return runFFmpeg(win, ffmpegPath, args, totalOutputDuration, outputPath);
  });

  /**
   * Cancel an in-progress silence removal operation.
   */
  ipcMain.handle('silence:cancel', () => {
    if (activeProcess) {
      activeProcess.kill(process.platform === 'win32' ? undefined : 'SIGTERM');
      activeProcess = null;
      return { cancelled: true };
    }
    return { cancelled: false };
  });
}

// ==================== Helpers ====================

/**
 * Parse FFmpeg silencedetect output from stderr.
 * Lines look like:
 *   [silencedetect @ 0x...] silence_start: 1.234
 *   [silencedetect @ 0x...] silence_end: 3.456 | silence_duration: 2.222
 */
function parseSilenceDetectOutput(stderr: string): SilentSegment[] {
  const segments: SilentSegment[] = [];
  const lines = stderr.split('\n');

  let currentStart: number | null = null;

  for (const line of lines) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    if (startMatch) {
      currentStart = parseFloat(startMatch[1]);
      continue;
    }

    const endMatch = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);
    if (endMatch && currentStart !== null) {
      const end = parseFloat(endMatch[1]);
      const duration = parseFloat(endMatch[2]);
      segments.push({ start: currentStart, end, duration });
      currentStart = null;
    }
  }

  return segments;
}

/**
 * Get video duration by running FFmpeg and parsing the Duration line.
 */
function getVideoDuration(ffmpegPath: string, inputPath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, ['-i', inputPath, '-f', 'null', '-'], {
      stdio: 'pipe',
    });

    let stderr = '';
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', () => {
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      if (match) {
        const hours = parseInt(match[1]);
        const mins = parseInt(match[2]);
        const secs = parseFloat(match[3]);
        resolve(hours * 3600 + mins * 60 + secs);
      } else {
        resolve(0);
      }
    });

    proc.on('error', () => resolve(0));

    // Kill quickly — we only need the header info
    setTimeout(() => {
      proc.removeAllListeners();
      proc.stderr?.removeAllListeners();
      proc.kill();
    }, 5000);
  });
}

/**
 * Run FFmpeg process with progress tracking.
 */
function runFFmpeg(
  win: InstanceType<typeof BrowserWindow> | null,
  ffmpegPath: string,
  args: string[],
  totalDuration: number,
  outputPath: string,
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args, { stdio: 'pipe' });
    activeProcess = proc;

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

        sendProgress(win, {
          status: 'removing',
          progress,
          message: `Removing silence... ${progress}%`,
        });
      }
    });

    proc.on('close', (code) => {
      activeProcess = null;

      if (code === 0) {
        sendProgress(win, {
          status: 'completed',
          progress: 100,
          message: 'Silence removal completed',
          outputPath,
        });
        resolve({ success: true, outputPath });
      } else {
        const errorMsg = stderr.split('\n').filter(Boolean).pop() || `FFmpeg exited with code ${code}`;
        sendProgress(win, {
          status: 'failed',
          progress: 0,
          message: 'Silence removal failed',
          error: errorMsg,
        });
        resolve({ success: false, error: errorMsg });
      }
    });

    proc.on('error', (err) => {
      activeProcess = null;
      sendProgress(win, {
        status: 'failed',
        progress: 0,
        message: 'Silence removal failed',
        error: err.message,
      });
      resolve({ success: false, error: err.message });
    });
  });
}
