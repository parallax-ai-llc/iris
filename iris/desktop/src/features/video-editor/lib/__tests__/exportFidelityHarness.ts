/**
 * Shared harness for the export-fidelity integration tests.
 *
 * Renders synthetic timelines through the REAL arg builder
 * (electron/ipc/export-render/ffmpeg-args.ts) with the ffmpeg-static binary
 * (the same package the main process bundles) and reads frames / samples back.
 * Not a test file itself (no `.test.` in the name).
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildFFmpegArgs } from '../../../../../electron/ipc/export-render/ffmpeg-args';
import type {
  ExportClip, ExportRenderExtras, ExportRequest, ExportTrack, SubtitleOverlayEntry,
} from '../../../../../electron/ipc/export-render/types';

export const W = 320;
export const H = 240;
export const FPS = 30;

function findFFmpeg(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('ffmpeg-static') as string | { default: string };
  return typeof mod === 'string' ? mod : mod.default;
}

export const FFMPEG = findFFmpeg();

export function run(args: string[], cwd?: string): Buffer {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...args], { maxBuffer: 256 * 1024 * 1024, cwd });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr?.toString()}\nargs: ${args.join(' ')}`);
  return r.stdout;
}

function probeAudio(file: string): boolean {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  return (r.stderr ?? '').includes('Audio:');
}

export const luma = ([r, g, b]: [number, number, number]) => 0.299 * r + 0.587 * g + 0.114 * b;

export function track(id: string, type: ExportTrack['type'], clips: ExportClip[], extra: Partial<ExportTrack> = {}): ExportTrack {
  return { id, type, muted: false, volume: 1, clips, ...extra };
}

export function videoClip(id: string, sourceUrl: string, start: number, end: number, extra: Partial<ExportClip> = {}): ExportClip {
  return {
    id, type: 'video', startTime: start, endTime: end, sourceStartTime: 0, sourceEndTime: end - start,
    sourceUrl, volume: 1, muted: false, speed: 1,
    transform: { scale: 1, rotation: 0, opacity: 1, x: 0, y: 0 }, effects: [], ...extra,
  };
}

export function audioClip(id: string, sourceUrl: string, start: number, end: number, extra: Partial<ExportClip> = {}): ExportClip {
  return {
    id, type: 'audio', startTime: start, endTime: end, sourceStartTime: 0, sourceEndTime: end - start,
    sourceUrl, volume: 1, muted: false, fadeIn: 0, fadeOut: 0, ...extra,
  };
}

export interface RenderOptions {
  /** Sources the export treats as having an audio stream (default: all). */
  sourcesWithAudio?: Set<string>;
  subtitleOverlays?: SubtitleOverlayEntry[];
  /** Burn subtitle-track clips (ASS fallback when no overlays are given). */
  burnSubtitles?: boolean;
}

export interface Harness {
  dir: () => string;
  setup: () => void;
  teardown: () => void;
  /** Write a file into the temp dir with an ffmpeg command (args after `-y`). */
  make: (name: string, args: string[]) => string;
  render: (tracks: ExportTrack[], duration: number, opts?: RenderOptions) => string;
  /** RGB of pixel (x, y) of the frame shown at time t. */
  pixel: (file: string, t: number, x: number, y: number) => [number, number, number];
  /** Luma of every pixel in row y of the frame shown at time t. */
  row: (file: string, t: number, y: number) => number[];
  frameCount: (file: string) => number;
  hasAudioStream: (file: string) => boolean;
  /** Per-channel RMS of [t0, t0+d). */
  rms: (file: string, t0: number, d: number) => { l: number; r: number };
  /** Audio duration in seconds (decoded sample count). */
  audioDuration: (file: string) => number;
}

export function createHarness(prefix: string): Harness {
  let dir = '';
  let seq = 0;

  const frameRgb = (file: string, t: number): Buffer =>
    run(['-i', file, '-ss', t.toFixed(3), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);

  const decodeAudio = (file: string, t0?: number, d?: number): Float32Array => {
    const a = ['-i', file];
    if (t0 !== undefined) a.push('-ss', t0.toFixed(3));
    if (d !== undefined) a.push('-t', d.toFixed(3));
    a.push('-map', '0:a:0', '-f', 'f32le', '-ac', '2', '-ar', '48000', 'pipe:1');
    const buf = run(a);
    return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
  };

  return {
    dir: () => dir,
    setup: () => { dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); },
    teardown: () => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); },
    make: (name, args) => {
      const out = path.join(dir, name);
      run(['-y', ...args, out]);
      return out;
    },
    render: (tracks, duration, opts = {}) => {
      const outputPath = path.join(dir, `out_${seq++}.mp4`);
      const request: ExportRequest & ExportRenderExtras = {
        outputPath, format: 'mp4', quality: 'high', frameRate: FPS, width: W, height: H,
        duration, tracks, includeSubtitles: !!opts.subtitleOverlays || !!opts.burnSubtitles,
        subtitleFormat: 'burned', subtitleOverlays: opts.subtitleOverlays,
      };
      // Default: probe like the IPC handler does (checkSourceHasAudio).
      const sources = opts.sourcesWithAudio ??
        new Set(tracks.flatMap((t) => t.clips.map((c) => c.sourceUrl)).filter((u) => u && probeAudio(u)));
      const args = buildFFmpegArgs(request, sources, { tempDir: dir });
      // Same as the IPC handler: write the ASS file and run with its folder as cwd.
      if (request._assContent && request._assPath) fs.writeFileSync(request._assPath, request._assContent, 'utf-8');
      run(args, request._ffmpegCwd);
      return outputPath;
    },
    pixel: (file, t, x, y) => {
      const buf = frameRgb(file, t);
      const i = (y * W + x) * 3;
      return [buf[i], buf[i + 1], buf[i + 2]];
    },
    row: (file, t, y) => {
      const buf = frameRgb(file, t);
      const out: number[] = [];
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3;
        out.push(luma([buf[i], buf[i + 1], buf[i + 2]]));
      }
      return out;
    },
    frameCount: (file) => {
      const buf = run(['-i', file, '-map', '0:v:0', '-vf', 'scale=8:8', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1']);
      return buf.length / 64;
    },
    hasAudioStream: probeAudio,
    rms: (file, t0, d) => {
      const f = decodeAudio(file, t0, d);
      let l = 0; let r = 0;
      const n = Math.floor(f.length / 2);
      for (let i = 0; i < n; i++) { l += f[2 * i] ** 2; r += f[2 * i + 1] ** 2; }
      return { l: Math.sqrt(l / n), r: Math.sqrt(r / n) };
    },
    audioDuration: (file) => decodeAudio(file).length / 2 / 48000,
  };
}
