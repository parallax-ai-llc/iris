// @vitest-environment node
/**
 * Export fidelity for animated edits — speed keyframes / time remapping, blur
 * keyframes and subtitle animation. Same method as exportFidelity.integration:
 * render with the real arg builder + ffmpeg-static, read frames / samples back
 * and compare with what the preview computes for the same instant.
 *
 * The preview references are computed independently here (closed-form speed
 * integrals, interpolateKeyframes for blur) so the test does not just echo the
 * shared helpers the export uses.
 */

import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { ExportClip } from '../../../../../electron/ipc/export-render/types';
import { interpolateKeyframes } from '@/shared/lib/utils/effectRenderer';
import { FPS, H, W, createHarness, luma, run, track, videoClip } from './exportFidelityHarness';

const h = createHarness('iris-export-anim-');
const src: Record<string, string> = {};

/**
 * Seek time that reads back output frame f: the harness seeks with an output
 * `-ss`, which returns the first frame whose pts ≥ t, so stay at (or just
 * below) the frame's own start.
 */
const atFrame = (f: number) => Math.floor((f / FPS) * 1000) / 1000;

/** Start time of the source frame the preview's <video> shows at source time s. */
const shownSourceFrame = (s: number) => Math.floor(s * FPS + 1e-6) / FPS;

/** Source time encoded in the grey level of the time-ramp source (Y = 16 + 60·T). */
function sourceTimeAt(file: string, t: number): number {
  return luma(h.pixel(file, t, 160, 120)) / (60 * 255 / 219);
}

describe('export fidelity — animated edits (real FFmpeg render)', () => {
  beforeAll(() => {
    h.setup();
    // Grey level encodes the source time; a 440 Hz tone plays only in [0, 1) s.
    src.ramp = h.make('ramp.mp4', [
      '-f', 'lavfi', '-i', `nullsrc=s=${W}x${H}:r=${FPS}:d=3`,
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3',
      '-vf', "geq=lum='16+60*T':cb=128:cr=128,format=yuv420p",
      '-af', "volume=0.5,volume=enable='gte(t,1)':volume=0", '-ac', '2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '0', '-c:a', 'aac', '-b:a', '192k', '-t', '3',
    ]);
    // Sharp vertical edge at x = 160 (black | white).
    src.edge = h.make('edge.mp4', [
      '-f', 'lavfi', '-i', `nullsrc=s=${W}x${H}:r=${FPS}:d=3`,
      '-vf', "geq=lum='if(gte(X,160),235,16)':cb=128:cr=128,format=yuv420p",
      '-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '0', '-t', '3',
    ]);
    src.blue = h.make('blue.mp4', [
      '-f', 'lavfi', '-i', `color=c=blue:s=${W}x${H}:r=${FPS}:d=3`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-t', '3',
    ]);
  }, 60_000);

  afterAll(() => h.teardown());

  // ── #6 speed keyframes / time remapping ─────────────────────────────────
  it('#6 speed keyframes map timeline → source time by ∫speed (video + audio)', () => {
    // speed 1 → 2 linearly over [0, 2]: S(t) = t + t²/4.
    const keyframes = [
      { time: 0, property: 'speed', value: 1 },
      { time: 2, property: 'speed', value: 2 },
    ];
    const out = h.render([track('v1', 'video', [videoClip('c1', src.ramp, 0, 2, { keyframes })])], 2);
    expect(h.frameCount(out)).toBe(2 * FPS);
    for (const f of [6, 30, 45, 57]) {
      const ft = f / FPS;
      // Preview: the <video> shows the last source frame at or before S(t).
      const expected = shownSourceFrame(ft + (ft * ft) / 4);
      expect(Math.abs(sourceTimeAt(out, atFrame(f)) - expected)).toBeLessThan(0.025);
    }
    // The tone ends where S(t) = 1 → t = 2√2 − 2 ≈ 0.828 s (static speed: 1.0 s).
    const toneRms = h.rms(src.ramp, 0.1, 0.6).l;
    expect(h.rms(out, 0.1, 0.6).l / toneRms).toBeGreaterThan(0.85);
    expect(h.rms(out, 0.1, 0.6).l / toneRms).toBeLessThan(1.15);
    expect(h.rms(out, 0.88, 0.1).l).toBeLessThan(0.02 * toneRms + 0.002);
    expect(Math.abs(h.audioDuration(out) - 2)).toBeLessThan(0.03);
  }, 120_000);

  it('#6 time remapping keyframes (speed multiplier, linear) drive the source time', () => {
    // speed 0.5 → 2 over [0, 1], then 2: S(t) = 0.5t + 0.75t² (t ≤ 1), 1.25 + 2(t − 1).
    const timeRemappingKeyframes = [{ time: 0, speed: 0.5 }, { time: 1, speed: 2 }];
    const out = h.render([track('v1', 'video', [
      videoClip('c1', src.ramp, 0, 1.5, { timeRemappingKeyframes } as Partial<ExportClip>),
    ])], 1.5);
    expect(h.frameCount(out)).toBe(45);
    const S = (t: number) => (t <= 1 ? 0.5 * t + 0.75 * t * t : 1.25 + 2 * (t - 1));
    for (const f of [9, 24, 36, 42]) {
      expect(Math.abs(sourceTimeAt(out, atFrame(f)) - shownSourceFrame(S(f / FPS)))).toBeLessThan(0.025);
    }
  }, 120_000);

  it('#6 a slow keyframed speed below 0.5× keeps the tone and the slot length', () => {
    const keyframes = [
      { time: 0, property: 'speed', value: 0.3 },
      { time: 1, property: 'speed', value: 0.3 },
    ];
    const out = h.render([track('v1', 'video', [videoClip('c1', src.ramp, 0, 1, { keyframes })])], 1);
    expect(h.frameCount(out)).toBe(FPS);
    expect(Math.abs(sourceTimeAt(out, atFrame(20)) - shownSourceFrame(0.3 * (20 / FPS)))).toBeLessThan(0.025);
    const toneRms = h.rms(src.ramp, 0.1, 0.6).l;
    expect(h.rms(out, 0.2, 0.6).l / toneRms).toBeGreaterThan(0.8);
    expect(Math.abs(h.audioDuration(out) - 1)).toBeLessThan(0.03);
  }, 120_000);

  // ── #7 blur keyframes ───────────────────────────────────────────────────
  it('#7 blur keyframes follow the preview curve with the static blur mapping (σ = px / 5)', () => {
    const keyframes = [
      { time: 0, property: 'blur', value: 0 },
      { time: 2, property: 'blur', value: 20 },
    ];
    const out = h.render([track('v1', 'video', [videoClip('c1', src.edge, 0, 2, { keyframes })])], 2);
    for (const f of [0, 30, 54]) {
      const px = interpolateKeyframes(keyframes as never, 'blur', f / FPS)!;
      const ref = path.join(h.dir(), `edge_ref_${f}.png`);
      const vf = px > 0 ? `gblur=sigma=${(px / 5).toFixed(3)}` : 'null';
      run(['-y', '-i', src.edge, '-ss', (f / FPS).toFixed(3), '-frames:v', '1', '-vf', vf, ref]);
      const expected = h.row(ref, 0, 120);
      const got = h.row(out, atFrame(f), 120);
      let maxDiff = 0;
      for (let x = 130; x < 190; x++) maxDiff = Math.max(maxDiff, Math.abs(got[x] - expected[x]));
      expect(maxDiff).toBeLessThan(10); // x264 + σ steps of 0.05 (sharp vs blurred ≈ 85)
    }
  }, 120_000);

  // ── #8 subtitle animation ──────────────────────────────────────────────
  it('#8 an animated subtitle frame sequence lands frame-exact on its timeline slot', () => {
    // Frame k of the sequence: a 20×20 white box at x = 10 + 4k, y = 100.
    const pattern = path.join(h.dir(), 'subseq_%05d.png');
    run(['-y', '-f', 'lavfi', '-i', `color=c=black@0:s=${W}x${H}:r=${FPS}:d=1`,
      '-vf', "format=rgba,geq=r=255:g=255:b=255:a='if(between(X,10+4*N,29+4*N)*between(Y,100,119),255,0)'",
      '-frames:v', '30', '-start_number', '0', pattern]);
    const out = h.render([track('v1', 'video', [videoClip('c1', src.blue, 0, 2)])], 2, {
      subtitleOverlays: [{ framePattern: pattern, frameCount: 30, startTime: 0.5, endTime: 1.5 }],
    });
    const isWhite = (t: number, x: number) => luma(h.pixel(out, t, x, 110)) > 200;
    for (const f of [15, 18, 30, 44]) {
      const k = f - 15;
      expect(isWhite(atFrame(f), 20 + 4 * k)).toBe(true);
      expect(isWhite(atFrame(f), 4 + 4 * k)).toBe(false);
      expect(isWhite(atFrame(f), 36 + 4 * k)).toBe(false);
    }
    expect(isWhite(atFrame(14), 20)).toBe(false);
    expect(isWhite(atFrame(46), 20 + 4 * 29)).toBe(false);
  }, 120_000);

  it('#8 ASS fallback moves the subtitle with its position keyframes (\\move)', () => {
    const sub: ExportClip = {
      id: 's1', type: 'subtitle', startTime: 0, endTime: 1, sourceStartTime: 0, sourceEndTime: 1, sourceUrl: '',
      text: 'XXXX',
      // White box (BorderStyle 3 draws it in the outline colour) on a blue frame.
      style: {
        fontSize: 24, fontFamily: 'Arial', fontColor: '#FFFFFF', backgroundColor: '#FFFFFF',
        backgroundOpacity: 1, position: { x: 50, y: 50 },
      },
      animationKeyframes: [
        { time: 0, property: 'x', value: 25 },
        { time: 1, property: 'x', value: 75 },
      ],
    } as ExportClip;
    const out = h.render([
      track('v1', 'video', [videoClip('c1', src.blue, 0, 1)]),
      track('s', 'subtitle', [sub]),
    ], 1, { burnSubtitles: true });
    const isWhite = (t: number, x: number) => luma(h.pixel(out, t, x, 120)) > 200;
    // t ≈ 0.1 → centre x ≈ 96 px; t ≈ 0.9 → x ≈ 224 px (frame is 320 wide).
    expect(isWhite(atFrame(3), 96)).toBe(true);
    expect(isWhite(atFrame(3), 240)).toBe(false);
    expect(isWhite(atFrame(27), 224)).toBe(true);
    expect(isWhite(atFrame(27), 80)).toBe(false);
  }, 120_000);
});

