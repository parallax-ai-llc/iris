/**
 * Waveform peak extraction (main process, ffmpeg streaming).
 *
 * Used for sources too long to decode in the renderer with the Web Audio API
 * (decodeAudioData must hold the ENTIRE decoded PCM in RAM — multiple GB for an
 * hours-long file, which OOMs the renderer). Here we pipe mono s16le PCM at a low
 * sample rate from ffmpeg's stdout and reduce it to per-bucket peaks on the fly, so
 * memory stays bounded regardless of source duration.
 *
 * Results are cached to a sidecar file in userData so re-opening a project doesn't
 * re-run ffmpeg.
 */

import { ipcMain, app } from 'electron';
import path from 'path';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { findFFmpegPathSync } from './ffmpeg-resolver';

interface ExtractRequest {
  /** Local file path, file:// URL, or http(s) URL ffmpeg can read directly. */
  src: string;
  /** Desired number of peak buckets (the result may be smaller for short sources). */
  sampleCount: number;
  /** Optional bearer token for http(s) sources behind auth. */
  authToken?: string;
}
interface ExtractResult { success: boolean; peaks?: number[]; error?: string }

// Mono s16le at this rate. 8 kHz is far more than enough to capture a peak envelope
// while keeping the streamed data small (~16 KB/s).
const PCM_SAMPLE_RATE = 8000;
// Internal raw-peak resolution before downsampling to the requested count. Bounds the
// in-memory array: 3 h × 200/s ≈ 2.16M numbers (~17 MB in the main process — fine).
const INTERNAL_PEAKS_PER_SECOND = 200;
const MAX_RAW_PEAKS = 4_000_000; // safety cap (~5.5 h)

function cacheDir(): string {
  return path.join(app.getPath('userData'), 'waveform-cache');
}

function cacheKeyPath(req: ExtractRequest): string {
  const h = createHash('sha1')
    .update(`${req.src}|${req.sampleCount}`)
    .digest('hex');
  return path.join(cacheDir(), `${h}.json`);
}

/** Normalize a file:// URL to a filesystem path; pass through plain paths / http URLs. */
function toFfmpegInput(src: string): string {
  if (src.startsWith('file://')) {
    try {
      const p = decodeURIComponent(new URL(src).pathname);
      // Windows: "/C:/foo" → "C:/foo"
      return p.replace(/^\/([A-Za-z]:)/, '$1');
    } catch {
      return src;
    }
  }
  return src;
}

function downsampleMax(src: number[], target: number): number[] {
  if (target >= src.length) return src.slice();
  const out = new Array<number>(target);
  for (let i = 0; i < target; i++) {
    const from = Math.floor((i / target) * src.length);
    const to = Math.max(from + 1, Math.floor(((i + 1) / target) * src.length));
    let m = 0;
    for (let j = from; j < to; j++) if (src[j] > m) m = src[j];
    out[i] = m;
  }
  return out;
}

function runFfmpegPeaks(ffmpegPath: string, args: string[]): Promise<number[]> {
  return new Promise<number[]>((resolve, reject) => {
    const samplesPerBucket = Math.max(1, Math.round(PCM_SAMPLE_RATE / INTERNAL_PEAKS_PER_SECOND));
    const raw: number[] = [];
    let curMax = 0;
    let sampleInBucket = 0;
    let leftoverByte = -1; // a low byte split across two chunks (s16le = little-endian)
    let killed = false;
    const stderrTail: string[] = [];

    const proc = spawn(ffmpegPath, args, { windowsHide: true });

    proc.stderr?.on('data', (c: Buffer) => {
      stderrTail.push(c.toString());
      if (stderrTail.length > 24) stderrTail.shift();
    });

    const pushSample = (val: number) => {
      const abs = Math.abs(val) / 32768;
      if (abs > curMax) curMax = abs;
      if (++sampleInBucket >= samplesPerBucket) {
        raw.push(curMax);
        curMax = 0;
        sampleInBucket = 0;
        if (raw.length >= MAX_RAW_PEAKS && !killed) {
          killed = true;
          proc.kill('SIGTERM');
        }
      }
    };

    proc.stdout?.on('data', (chunk: Buffer) => {
      if (killed) return;
      let offset = 0;
      const len = chunk.length;
      if (leftoverByte !== -1 && len > 0) {
        const sample = (leftoverByte | (chunk[0] << 8));
        pushSample((sample << 16) >> 16); // sign-extend 16-bit
        offset = 1;
        leftoverByte = -1;
      }
      for (let i = offset; i + 1 < len; i += 2) {
        const sample = (chunk[i] | (chunk[i + 1] << 8));
        pushSample((sample << 16) >> 16);
        if (killed) return;
      }
      // A trailing odd byte carries over to the next chunk.
      if ((len - offset) % 2 === 1) leftoverByte = chunk[len - 1];
    });

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (sampleInBucket > 0) raw.push(curMax);
      if (!killed && code !== 0 && raw.length === 0) {
        reject(new Error(`ffmpeg failed (code ${code}): ${stderrTail.join('').slice(-300)}`));
        return;
      }
      resolve(raw);
    });
  });
}

export function setupWaveformHandlers(): void {
  ipcMain.handle(
    'waveform:extractPeaks',
    async (_, req: ExtractRequest): Promise<ExtractResult> => {
      try {
        if (!req?.src) return { success: false, error: 'No source provided' };
        const sampleCount = Math.max(16, Math.min(Math.floor(req.sampleCount) || 0, 200000));

        // Sidecar cache hit
        const cachePath = cacheKeyPath({ ...req, sampleCount });
        if (existsSync(cachePath)) {
          try {
            const cached = JSON.parse(await readFile(cachePath, 'utf8'));
            if (Array.isArray(cached?.peaks) && cached.peaks.length > 0) {
              return { success: true, peaks: cached.peaks };
            }
          } catch {
            /* corrupt cache — recompute */
          }
        }

        const ffmpegPath = findFFmpegPathSync();
        const input = toFfmpegInput(req.src);

        const args: string[] = [];
        if (req.src.startsWith('http') && req.authToken) {
          args.push('-headers', `Authorization: Bearer ${req.authToken}\r\n`);
        }
        args.push(
          '-i', input,
          '-vn', '-ac', '1', '-f', 's16le', '-ar', String(PCM_SAMPLE_RATE), '-'
        );

        const raw = await runFfmpegPeaks(ffmpegPath, args);
        if (raw.length === 0) return { success: false, error: 'No audio stream / empty output' };

        // Downsample to the requested resolution and normalize so the tallest bar = 1.
        const peaks = downsampleMax(raw, Math.min(sampleCount, raw.length));
        let globalMax = 1e-6;
        for (let i = 0; i < peaks.length; i++) if (peaks[i] > globalMax) globalMax = peaks[i];
        for (let i = 0; i < peaks.length; i++) peaks[i] /= globalMax;

        // Persist to sidecar cache (best-effort).
        try {
          await mkdir(cacheDir(), { recursive: true });
          await writeFile(cachePath, JSON.stringify({ peaks }), 'utf8');
        } catch {
          /* cache write failures are non-fatal */
        }

        return { success: true, peaks };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Waveform extraction failed' };
      }
    }
  );
}
