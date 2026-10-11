// @vitest-environment node
/**
 * Graph-shape regressions for the real arg builder: every path that used to
 * exist in electron/ipc/export.ts (overlays, junction xfade, intra-clip xfade,
 * chroma key, GIF, audio-only, split sources, empty timeline) must still
 * produce a valid file of the right length.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildFFmpegArgs } from '../ffmpeg-args';
import type { ExportClip, ExportRequest, ExportTrack } from '../types';

function findFFmpeg(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('ffmpeg-static') as string | { default: string };
  return typeof mod === 'string' ? mod : mod.default;
}

const FFMPEG = findFFmpeg();
const W = 320;
const H = 240;
const FPS = 30;
let dir = '';
const src: Record<string, string> = {};

function run(args: string[]): Buffer {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...args], { maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr?.toString()}\nargs: ${args.join(' ')}`);
  return r.stdout;
}

let seq = 0;
function render(
  tracks: ExportTrack[],
  duration: number,
  format: ExportRequest['format'] = 'mp4',
): string {
  const outputPath = path.join(dir, `g_${seq++}.${format === 'gif' ? 'gif' : 'mp4'}`);
  run(buildFFmpegArgs({
    outputPath, format, quality: 'low', frameRate: FPS, width: W, height: H,
    duration, tracks, includeSubtitles: false,
  }, new Set([src.a, src.b, src.tone]), { tempDir: dir }));
  return outputPath;
}

function frameCount(file: string): number {
  return run(['-i', file, '-map', '0:v:0', '-vf', 'scale=8:8', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1']).length / 64;
}

function audioSeconds(file: string): number {
  return run(['-i', file, '-map', '0:a:0', '-f', 'f32le', '-ac', '1', '-ar', '48000', 'pipe:1']).length / 4 / 48000;
}

function pixel(file: string, t: number, x: number, y: number): number[] {
  const b = run(['-i', file, '-ss', t.toFixed(3), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  const i = (y * W + x) * 3;
  return [b[i], b[i + 1], b[i + 2]];
}

const track = (id: string, type: ExportTrack['type'], clips: ExportClip[]): ExportTrack =>
  ({ id, type, muted: false, volume: 1, clips });

const video = (id: string, url: string, s: number, e: number, extra: Partial<ExportClip> = {}): ExportClip => ({
  id, type: 'video', startTime: s, endTime: e, sourceStartTime: 0, sourceEndTime: e - s, sourceUrl: url,
  volume: 1, muted: false, speed: 1, transform: { scale: 1, rotation: 0, opacity: 1, x: 0, y: 0 }, effects: [], ...extra,
});

describe('export graph regressions (real FFmpeg render)', () => {
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-export-graph-'));
    const mk = (name: string, color: string, freq: number) => {
      const out = path.join(dir, name);
      run(['-y', '-f', 'lavfi', '-i', `color=c=${color}:s=${W}x${H}:r=${FPS}:d=3`,
        '-f', 'lavfi', '-i', `sine=frequency=${freq}:sample_rate=44100:duration=3`,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-t', '3', out]);
      return out;
    };
    src.a = mk('a.mp4', 'green', 440);
    src.b = mk('b.mp4', 'blue', 660);
    src.png = path.join(dir, 'logo.png');
    run(['-y', '-f', 'lavfi', '-i', 'color=c=red:s=64x48', '-frames:v', '1', src.png]);
    src.tone = path.join(dir, 'tone.wav');
    run(['-y', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=22050:duration=3', '-ac', '1', src.tone]);
  }, 60_000);

  afterAll(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('overlay track + image overlay composite over the base (top track wins)', () => {
    const out = render([
      track('top', 'video', [{ ...video('img', src.png, 0, 2, { mediaType: 'image', sourceWidth: 64, sourceHeight: 48 }) }]),
      track('mid', 'video', [video('ov', src.b, 0, 2, { transform: { scale: 0.5, rotation: 0, opacity: 1, x: 0, y: 0 } })]),
      track('base', 'video', [video('c1', src.a, 0, 2)]),
    ], 2);
    expect(frameCount(out)).toBe(60);
    const [r] = pixel(out, 1, 160, 120); // red image at the centre
    expect(r).toBeGreaterThan(180);
    const [, , b] = pixel(out, 1, 100, 120); // blue overlay ring around it
    expect(b).toBeGreaterThan(150);
    const [, g] = pixel(out, 1, 10, 10); // green base in the corner
    expect(g).toBeGreaterThan(80);
  }, 60_000);

  it('junction xfade + intra-clip wipe + chroma key + glow render without graph errors', () => {
    const out = render([track('v', 'video', [
      video('c1', src.a, 0, 1, {
        effects: [
          { type: 'transition', enabled: true, transitionType: 'dissolve', transitionPosition: 'end', transitionDuration: 0.3 },
          { type: 'filter', enabled: true, filterType: 'glow', filterIntensity: 40 },
        ],
      }),
      video('c2', src.b, 1, 2, {
        effects: [
          { type: 'transition', enabled: true, transitionType: 'wipe', transitionPosition: 'end', transitionDuration: 0.3 },
          { type: 'filter', enabled: true, filterType: 'chroma-key', filterParams: { keyColor: '#00FF00' } },
        ],
      }),
    ])], 2);
    // xfade overlaps the junction by 0.3 s, so the stream is shorter than the timeline.
    expect(frameCount(out)).toBeGreaterThanOrEqual(Math.round(1.7 * FPS) - 1);
    expect(audioSeconds(out)).toBeGreaterThan(1.6);
  }, 60_000);

  it('split clips of the same source and its separated audio share the input safely', () => {
    const out = render([
      track('v', 'video', [
        video('c1', src.a, 0, 1),
        video('c2', src.a, 1, 2, { sourceStartTime: 1.5, sourceEndTime: 2.5 }),
      ]),
      track('au', 'audio', [{
        id: 'sep', type: 'audio', startTime: 0, endTime: 2, sourceStartTime: 0, sourceEndTime: 2,
        sourceUrl: src.a, volume: 1, muted: false,
      }]),
    ], 2);
    expect(frameCount(out)).toBe(60);
    expect(audioSeconds(out)).toBeCloseTo(2, 1);
  }, 60_000);

  it('audio-only timeline renders black video for the full duration', () => {
    const out = render([
      track('v', 'video', []),
      track('m', 'music', [{
        id: 'm1', type: 'music', startTime: 0.5, endTime: 1.5, sourceStartTime: 0, sourceEndTime: 1,
        sourceUrl: src.tone, volume: 0.8, fadeIn: 0.2, fadeOut: 0.2,
      }]),
    ], 2);
    expect(frameCount(out)).toBe(60);
    expect(audioSeconds(out)).toBeCloseTo(1.5, 1);
  }, 60_000);

  it('GIF output and an empty timeline still render', () => {
    const gif = render([track('v', 'video', [video('c1', src.a, 0, 1)])], 1, 'gif');
    expect(fs.statSync(gif).size).toBeGreaterThan(0);
    const empty = render([], 1);
    expect(frameCount(empty)).toBe(30);
  }, 60_000);
});
