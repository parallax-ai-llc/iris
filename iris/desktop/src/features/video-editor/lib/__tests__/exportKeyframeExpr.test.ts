// @vitest-environment node
/**
 * keyframeExpr() must evaluate to exactly what the preview's
 * interpolateKeyframes() returns. FFmpeg evaluates the expression itself
 * (aevalsrc samples it at 1 kHz), so this checks the real parser/evaluator.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { keyframeExpr } from '../../../../../electron/ipc/export-render/keyframe-expr';
import { interpolateKeyframes } from '@/shared/lib/utils/effectRenderer';
import type { Keyframe } from '@/types/videoProject.types';

function findFFmpeg(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('ffmpeg-static') as string | { default: string };
  return typeof mod === 'string' ? mod : mod.default;
}

const RATE = 1000;

/** Evaluate `expr(t)` with FFmpeg for t = 0, 1/RATE, … < duration. */
function ffEval(expr: string, duration: number): Float32Array {
  const r = spawnSync(findFFmpeg(), [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `aevalsrc=exprs='${expr}':s=${RATE}:d=${duration}`,
    '-f', 'f32le', '-c:a', 'pcm_f32le', 'pipe:1',
  ], { maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr.toString());
  const b = r.stdout;
  return new Float32Array(b.buffer, b.byteOffset, b.length / 4);
}

const cases: Array<[string, Keyframe[]]> = [
  ['single keyframe', [{ time: 0.5, property: 'opacity', value: 0.4 }]],
  ['linear with clamps', [
    { time: 0.5, property: 'opacity', value: 0.2 },
    { time: 1.5, property: 'opacity', value: 0.9 },
  ]],
  ['mixed easings, unsorted, negative values', [
    { time: 2, property: 'x', value: -40, easing: 'ease-out' },
    { time: 0, property: 'x', value: 10, easing: 'ease-in' },
    { time: 1, property: 'x', value: 80, easing: 'ease-in-out' },
    { time: 2.6, property: 'x', value: 5 },
  ]],
  ['bezier and preview-linear easings', [
    { time: 0, property: 'scale', value: 1, easing: 'bezier', bezierPoints: [0.68, -0.55, 0.27, 1.55] },
    { time: 1.2, property: 'scale', value: 2, easing: 'hold' },
    { time: 2, property: 'scale', value: 0.5, easing: 'auto-bezier' },
    { time: 2.8, property: 'scale', value: 1 },
  ]],
];

describe('keyframeExpr matches interpolateKeyframes', () => {
  it.each(cases)('%s', (_name, keyframes) => {
    const prop = keyframes[0].property;
    const expr = keyframeExpr(keyframes, prop, 't');
    expect(expr).not.toBeNull();
    const values = ffEval(expr!, 3);
    let maxErr = 0;
    for (let i = 0; i < values.length; i++) {
      const want = interpolateKeyframes(keyframes, prop, i / RATE)!;
      maxErr = Math.max(maxErr, Math.abs(values[i] - want));
    }
    // float32 output + piecewise-linear bezier sampling (24 steps)
    const span = Math.max(...keyframes.map((k) => Math.abs(k.value))) || 1;
    expect(maxErr / span).toBeLessThan(0.01);
  });

  it('returns null without keyframes for the property', () => {
    expect(keyframeExpr([{ time: 0, property: 'x', value: 1 }], 'y', 't')).toBeNull();
    expect(keyframeExpr(undefined, 'x', 't')).toBeNull();
  });
});
