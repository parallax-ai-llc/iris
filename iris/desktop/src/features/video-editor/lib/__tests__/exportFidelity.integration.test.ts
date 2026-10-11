// @vitest-environment node
/**
 * Export fidelity — the rendered file must match what the editor preview shows.
 *
 * Renders small synthetic timelines through the REAL arg builder
 * (export-render/ffmpeg-args.ts) with the ffmpeg-static binary (the same
 * package the main process uses), then reads frames / audio samples back and
 * compares them with the value the preview computes for the same instant
 * (interpolateKeyframes, StereoPannerNode matrix, track mute/solo rules).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildFFmpegArgs } from '../../../../../electron/ipc/export-render/ffmpeg-args';
import type { ExportClip, ExportRequest, ExportTrack } from '../../../../../electron/ipc/export-render/types';
import { interpolateKeyframes } from '@/shared/lib/utils/effectRenderer';
import { stereoPannerMatrix } from '../audioPan';

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

function makeVideo(name: string, color: string, freq: number | null, volume = 0.5): string {
  const out = path.join(dir, name);
  const a = ['-y', '-f', 'lavfi', '-i', `color=c=${color}:s=${W}x${H}:r=${FPS}:d=3`];
  if (freq !== null) a.push('-f', 'lavfi', '-i', `sine=frequency=${freq}:sample_rate=48000:duration=3`);
  a.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p');
  if (freq !== null) a.push('-af', `volume=${volume}`, '-ac', '2', '-c:a', 'aac', '-b:a', '192k');
  a.push('-t', '3', out);
  run(a);
  return out;
}

function makeTone(name: string, freq: number, volume: number): string {
  const out = path.join(dir, name);
  run(['-y', '-f', 'lavfi', '-i', `sine=frequency=${freq}:sample_rate=48000:duration=3`,
    '-af', `volume=${volume}`, '-ac', '2', '-c:a', 'pcm_s16le', out]);
  return out;
}

let renderSeq = 0;
function render(tracks: ExportTrack[], duration: number, sourcesWithAudio?: Set<string>): string {
  const outputPath = path.join(dir, `out_${renderSeq++}.mp4`);
  const request: ExportRequest = {
    outputPath, format: 'mp4', quality: 'high', frameRate: FPS, width: W, height: H,
    duration, tracks, includeSubtitles: false,
  };
  const args = buildFFmpegArgs(request, sourcesWithAudio ?? new Set([src.whiteSine, src.blueSine, src.tone, src.tone2]), { tempDir: dir });
  run(args);
  return outputPath;
}

/** RGB of pixel (x, y) of the frame shown at time t. */
function pixel(file: string, t: number, x: number, y: number): [number, number, number] {
  const buf = run(['-i', file, '-ss', t.toFixed(3), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  const i = (y * W + x) * 3;
  return [buf[i], buf[i + 1], buf[i + 2]];
}

function frameCount(file: string): number {
  const buf = run(['-i', file, '-map', '0:v:0', '-vf', 'scale=8:8', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1']);
  return buf.length / 64;
}

function hasAudioStream(file: string): boolean {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  return (r.stderr ?? '').includes('Audio:');
}

/** Per-channel RMS of [t0, t0+d). */
function rms(file: string, t0: number, d: number): { l: number; r: number } {
  const buf = run(['-i', file, '-ss', t0.toFixed(3), '-t', d.toFixed(3), '-map', '0:a:0',
    '-f', 'f32le', '-ac', '2', '-ar', '48000', 'pipe:1']);
  const f = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
  let l = 0; let r = 0;
  const n = Math.floor(f.length / 2);
  for (let i = 0; i < n; i++) { l += f[2 * i] ** 2; r += f[2 * i + 1] ** 2; }
  return { l: Math.sqrt(l / n), r: Math.sqrt(r / n) };
}

const luma = ([r, g, b]: [number, number, number]) => 0.299 * r + 0.587 * g + 0.114 * b;

function track(id: string, type: ExportTrack['type'], clips: ExportClip[], extra: Partial<ExportTrack> = {}): ExportTrack {
  return { id, type, muted: false, volume: 1, clips, ...extra };
}

function videoClip(id: string, sourceUrl: string, start: number, end: number, extra: Partial<ExportClip> = {}): ExportClip {
  return {
    id, type: 'video', startTime: start, endTime: end, sourceStartTime: 0, sourceEndTime: end - start,
    sourceUrl, volume: 1, muted: false, speed: 1,
    transform: { scale: 1, rotation: 0, opacity: 1, x: 0, y: 0 }, effects: [], ...extra,
  };
}

function audioClip(id: string, sourceUrl: string, start: number, end: number, extra: Partial<ExportClip> = {}): ExportClip {
  return {
    id, type: 'audio', startTime: start, endTime: end, sourceStartTime: 0, sourceEndTime: end - start,
    sourceUrl, volume: 1, muted: false, fadeIn: 0, fadeOut: 0, ...extra,
  };
}

/** Reference RMS of a source's audio in [t0, t0+d). */
const sourceRms = (file: string, t0 = 0.5, d = 1) => rms(file, t0, d);

describe('export fidelity (real FFmpeg render)', () => {
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-export-fidelity-'));
    src.whiteSine = makeVideo('white_sine.mp4', 'white', 440, 0.5);
    src.blueSine = makeVideo('blue_sine.mp4', 'blue', 660, 0.5);
    src.whiteSilentStream = makeVideo('white_nosound.mp4', 'white', null);
    src.tone = makeTone('tone.wav', 1000, 0.25);
    src.tone2 = makeTone('tone2.wav', 300, 0.25);
  }, 60_000);

  afterAll(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  // ── #1 track mute / solo ────────────────────────────────────────────────
  it('#1 a muted video track keeps its pictures and only loses its sound', () => {
    const out = render([track('v1', 'video', [videoClip('c1', src.whiteSine, 0, 1)], { muted: true })], 1);
    expect(luma(pixel(out, 0.5, 160, 120))).toBeGreaterThan(200);
    if (hasAudioStream(out)) expect(rms(out, 0.2, 0.6).l).toBeLessThan(0.005);
  }, 60_000);

  it('#1 solo on an audio track silences the video track audio but keeps its pictures', () => {
    const out = render([
      track('v1', 'video', [videoClip('c1', src.whiteSine, 0, 1)]),
      track('a1', 'audio', [audioClip('a', src.tone, 0, 1)], { solo: true }),
    ], 1);
    expect(luma(pixel(out, 0.5, 160, 120))).toBeGreaterThan(200);
    const expected = sourceRms(src.tone).l;
    expect(rms(out, 0.2, 0.6).l).toBeCloseTo(expected, 2);
  }, 60_000);

  // ── #2 embedded audio vs audio-track clips ──────────────────────────────
  it('#2 an unrelated audio-track clip does not strip the video clip audio', () => {
    const out = render([
      track('v1', 'video', [videoClip('c1', src.whiteSine, 0, 1)]),
      track('a1', 'audio', [audioClip('a', src.tone, 0, 1)]),
    ], 1);
    const mixed = rms(out, 0.2, 0.6).l;
    const toneOnly = sourceRms(src.tone).l;
    const videoOnly = sourceRms(src.whiteSine).l;
    // Uncorrelated sines: RMS adds in quadrature.
    expect(mixed).toBeCloseTo(Math.sqrt(toneOnly ** 2 + videoOnly ** 2), 2);
  }, 60_000);

  it('#2 the separated copy of the same asset replaces (not doubles) the embedded audio', () => {
    const out = render([
      track('v1', 'video', [videoClip('c1', src.whiteSine, 0, 1, { audioHandledExternally: true })]),
      track('a1', 'audio', [audioClip('a', src.whiteSine, 0, 1)]),
    ], 1);
    expect(rms(out, 0.2, 0.6).l).toBeCloseTo(sourceRms(src.whiteSine).l, 2);
  }, 60_000);

  it('#2 one muted clip on the base track does not silence the other clips', () => {
    const out = render([
      track('v1', 'video', [
        videoClip('c1', src.whiteSine, 0, 1),
        videoClip('c2', src.blueSine, 1, 2, { muted: true }),
      ]),
    ], 2);
    expect(rms(out, 0.2, 0.6).l).toBeCloseTo(sourceRms(src.whiteSine).l, 2);
    expect(rms(out, 1.2, 0.6).l).toBeLessThan(0.005);
  }, 60_000);

  // ── #3 keyframes ────────────────────────────────────────────────────────
  it.each([
    ['linear', undefined],
    ['ease-in-out', undefined],
    ['bezier', [0.42, 0, 0.2, 1] as [number, number, number, number]],
  ])('#3 opacity keyframes (%s) follow the preview curve', (easing, bezierPoints) => {
    const keyframes = [
      { time: 0, property: 'opacity', value: 0, easing, bezierPoints },
      { time: 2, property: 'opacity', value: 1 },
    ];
    const out = render([track('v1', 'video', [videoClip('c1', src.whiteSine, 0, 2, { keyframes })])], 2);
    for (const t of [0.5, 1.0, 1.5]) {
      // The frame shown at t is the one starting at floor(t·fps)/fps.
      const ft = Math.floor(t * FPS + 1e-6) / FPS;
      const o = interpolateKeyframes(keyframes as never, 'opacity', ft)!;
      expect(Math.abs(luma(pixel(out, t, 160, 120)) - 255 * o)).toBeLessThan(10);
    }
  }, 120_000);

  it('#3 position / scale keyframes move the base clip like the preview transform', () => {
    // scale 0.5 → a 160×120 white box; x animates 0 → 120 px over 2 s.
    const keyframes = [
      { time: 0, property: 'x', value: 0 },
      { time: 2, property: 'x', value: 120 },
    ];
    const out = render([track('v1', 'video', [videoClip('c1', src.whiteSine, 0, 2, {
      transform: { scale: 0.5, rotation: 0, opacity: 1, x: 0, y: 0 }, keyframes,
    })])], 2);
    // t = 1 → x = 60: box spans x ∈ [140, 300), y ∈ [60, 180).
    expect(luma(pixel(out, 1, 290, 120))).toBeGreaterThan(200);
    expect(luma(pixel(out, 1, 130, 120))).toBeLessThan(40);
    expect(luma(pixel(out, 1, 220, 50))).toBeLessThan(40);
    // t = 0 → centred: x ∈ [80, 240).
    expect(luma(pixel(out, 0, 90, 120))).toBeGreaterThan(200);
    expect(luma(pixel(out, 0, 250, 120))).toBeLessThan(40);
  }, 60_000);

  it('#3 static rotation and scale are applied (previously ignored on the base track)', () => {
    const out = render([track('v1', 'video', [videoClip('c1', src.whiteSine, 0, 1, {
      transform: { scale: 0.5, rotation: 90, opacity: 1, x: 0, y: 0 },
    })])], 1);
    // 160×120 box rotated 90° → 120 wide × 160 tall around the centre.
    expect(luma(pixel(out, 0.5, 160, 50))).toBeGreaterThan(200);
    expect(luma(pixel(out, 0.5, 90, 120))).toBeLessThan(40);
  }, 60_000);

  it('#3 volume keyframes on a video clip follow the preview curve', () => {
    const keyframes = [
      { time: 0, property: 'volume', value: 0 },
      { time: 2, property: 'volume', value: 1 },
    ];
    const out = render([track('v1', 'video', [videoClip('c1', src.whiteSine, 0, 2, { keyframes })])], 2);
    const base = sourceRms(src.whiteSine).l;
    // Window [0.9, 1.1): gain ramps 0.45 → 0.55, RMS of a linear ramp ≈ mean.
    expect(rms(out, 0.9, 0.2).l / base).toBeCloseTo(interpolateKeyframes(keyframes as never, 'volume', 1)!, 1);
    expect(rms(out, 0.0, 0.1).l / base).toBeLessThan(0.1);
  }, 60_000);

  // ── #4 audio clip effects / pan / gain ──────────────────────────────────
  it('#4 audio clip effects (gain +6 dB) are rendered', () => {
    const out = render([
      track('v1', 'video', [videoClip('c1', src.whiteSilentStream, 0, 1)]),
      track('a1', 'audio', [audioClip('a', src.tone, 0, 1, {
        effects: [{ type: 'audio-effect', enabled: true, audioEffectType: 'gain', audioParams: { gain: 6 } }],
      })]),
    ], 1, new Set([src.tone]));
    expect(rms(out, 0.2, 0.6).l / sourceRms(src.tone).l).toBeCloseTo(Math.pow(10, 6 / 20), 1);
  }, 60_000);

  it('#4 pan uses the same channel matrix as the preview StereoPannerNode', () => {
    const pan = 0.5;
    const out = render([
      track('v1', 'video', [videoClip('c1', src.whiteSilentStream, 0, 1)]),
      track('a1', 'audio', [audioClip('a', src.tone, 0, 1, { pan, gain: -6 })]),
    ], 1, new Set([src.tone]));
    const m = stereoPannerMatrix(pan);
    const g = Math.pow(10, -6 / 20);
    const s = sourceRms(src.tone).l; // L == R in the source
    const got = rms(out, 0.2, 0.6);
    expect(got.l / s).toBeCloseTo((m.lFromL + m.lFromR) * g, 1);
    expect(got.r / s).toBeCloseTo((m.rFromL + m.rFromR) * g, 1);
  }, 60_000);

  // ── #5 speed / slot length ──────────────────────────────────────────────
  it('#5 a sped-up clip occupies exactly its timeline slot', () => {
    // Slot [0, 1) at 2× reads source [0, 2); the next clip must start at 1.0 s
    // even when the stored source range is slightly off (1.9 s here).
    const out = render([track('v1', 'video', [
      videoClip('c1', src.whiteSine, 0, 1, { speed: 2, sourceStartTime: 0, sourceEndTime: 1.9 }),
      videoClip('c2', src.blueSine, 1, 2),
    ])], 2);
    expect(frameCount(out)).toBe(2 * FPS);
    expect(luma(pixel(out, 0.95, 160, 120))).toBeGreaterThan(200); // still white
    const [r, , b] = pixel(out, 1.02, 160, 120);
    expect(b).toBeGreaterThan(150);
    expect(r).toBeLessThan(80);
  }, 60_000);

  it('#5 a clip placed later on the timeline starts at its position (gap is black)', () => {
    const out = render([track('v1', 'video', [videoClip('c1', src.whiteSine, 0.5, 1.5)])], 1.5);
    expect(luma(pixel(out, 0.2, 160, 120))).toBeLessThan(40);
    expect(luma(pixel(out, 0.8, 160, 120))).toBeGreaterThan(200);
    expect(frameCount(out)).toBe(Math.round(1.5 * FPS));
  }, 60_000);
});
