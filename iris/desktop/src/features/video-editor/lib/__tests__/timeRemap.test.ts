/**
 * timeRemap — the timeline → source mapping shared by the preview
 * (EditorPreview seek / playhead / playbackRate) and the export (speed-remap.ts).
 */

import { describe, it, expect } from 'vitest';
import { buildTimeMap, speedCurveOf, MIN_PLAYBACK_RATE } from '../timeRemap';
import { interpolateKeyframes } from '@/shared/lib/utils/effectRenderer';

describe('buildTimeMap', () => {
  it('constant speed keeps the old static mapping', () => {
    const m = buildTimeMap({ speed: 2 });
    expect(m.variable).toBe(false);
    expect(m.sourceOffsetAt(1.5)).toBe(3);
    expect(m.clipTimeAt(3)).toBe(1.5);
  });

  it('linear speed keyframes integrate exactly (S = t + t²/4 for 1 → 2 over 2 s)', () => {
    const m = buildTimeMap({
      speed: 1,
      keyframes: [{ time: 0, property: 'speed', value: 1 }, { time: 2, property: 'speed', value: 2 }],
    });
    for (const t of [0, 0.3, 1, 1.7, 2]) expect(m.sourceOffsetAt(t)).toBeCloseTo(t + (t * t) / 4, 9);
    // After the last keyframe the last speed holds.
    expect(m.sourceOffsetAt(3)).toBeCloseTo(3 + 2, 9);
    expect(m.clipTimeAt(m.sourceOffsetAt(1.234))).toBeCloseTo(1.234, 9);
  });

  it('speedAt is the preview interpolation (eased) and the integral follows it', () => {
    const keyframes = [
      { time: 0.5, property: 'speed', value: 1, easing: 'ease-in-out' },
      { time: 1.5, property: 'speed', value: 3 },
    ];
    const m = buildTimeMap({ keyframes });
    for (const t of [0, 0.7, 1, 1.4, 2]) {
      expect(m.speedAt(t)).toBeCloseTo(interpolateKeyframes(keyframes as never, 'speed', t)!, 12);
    }
    // Numeric reference: fine midpoint sum.
    let ref = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) ref += m.speedAt(((i + 0.5) / n) * 2) * (2 / n);
    expect(m.sourceOffsetAt(2)).toBeCloseTo(ref, 6);
  });

  it('time remapping points are a linear speed multiplier; speed keyframes win', () => {
    const remap = buildTimeMap({ timeRemappingKeyframes: [{ time: 0, speed: 0.5 }, { time: 1, speed: 2 }] });
    expect(remap.sourceOffsetAt(1)).toBeCloseTo(0.5 + 0.75, 9);
    expect(speedCurveOf({
      keyframes: [{ time: 0, property: 'speed', value: 3 }],
      timeRemappingKeyframes: [{ time: 0, speed: 0.5 }],
    })).toEqual([{ time: 0, value: 3, easing: undefined, bezierPoints: undefined }]);
  });

  it('clamps rates to the range the preview <video> accepts', () => {
    const m = buildTimeMap({ keyframes: [{ time: 0, property: 'speed', value: 0 }, { time: 1, property: 'speed', value: 0 }] });
    expect(m.speedAt(0.5)).toBe(MIN_PLAYBACK_RATE);
    expect(m.sourceOffsetAt(1)).toBeCloseTo(MIN_PLAYBACK_RATE, 9);
  });
});
