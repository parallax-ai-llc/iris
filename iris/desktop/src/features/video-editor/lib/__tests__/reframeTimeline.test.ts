import { describe, it, expect } from 'vitest';
import { reframeTimelineData } from '../reframeTimeline';
import type { TimelineClip, TimelineData, TimelineTrack } from '@/types/videoProject.types';

function clip(partial: Partial<TimelineClip>): TimelineClip {
  return {
    id: 'c1',
    type: 'video',
    trackId: 't1',
    startTime: 0,
    endTime: 5,
    duration: 5,
    inPoint: 0,
    outPoint: 5,
    opacity: 1,
    scale: 1,
    x: 0,
    y: 0,
    rotation: 0,
    speed: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    effects: [],
    keyframes: [],
    name: 'clip',
    locked: false,
    ...partial,
  };
}

function timeline(clips: TimelineClip[]): TimelineData {
  const track: TimelineTrack = {
    id: 't1',
    type: 'video',
    name: 'V1',
    locked: false,
    muted: false,
    visible: true,
    height: 60,
    clips,
  };
  return {
    version: 1,
    settings: { backgroundColor: '#000000', defaultTransitionDuration: 0.5, audioFadeDefault: 0.3 },
    tracks: [track],
    markers: [],
  };
}

// 1920x1080 (landscape) → 1080x1920 (shorts). Fit factor k = min(1080/1920, 1920/1080) = 0.5625
const LAND = { w: 1920, h: 1080 };
const SHORT = { w: 1080, h: 1920 };
const K = 0.5625;

describe('reframeTimelineData', () => {
  it('returns the same reference when dimensions are unchanged', () => {
    const t = timeline([clip({})]);
    expect(reframeTimelineData(t, LAND.w, LAND.h, LAND.w, LAND.h)).toBe(t);
  });

  it('returns the same reference for invalid dimensions', () => {
    const t = timeline([clip({})]);
    expect(reframeTimelineData(t, 0, LAND.h, SHORT.w, SHORT.h)).toBe(t);
  });

  it('does not mutate the input', () => {
    const original = clip({ type: 'image', x: 400, y: 0, scale: 1 });
    const t = timeline([original]);
    reframeTimelineData(t, LAND.w, LAND.h, SHORT.w, SHORT.h);
    expect(original.x).toBe(400);
    expect(original.scale).toBe(1);
  });

  it('scales image clip offset and scale by the fit factor', () => {
    const t = timeline([clip({ type: 'image', x: 400, y: 100, scale: 2 })]);
    const out = reframeTimelineData(t, LAND.w, LAND.h, SHORT.w, SHORT.h).tracks[0].clips[0];
    expect(out.x).toBeCloseTo(400 * K);
    expect(out.y).toBeCloseTo(100 * K);
    expect(out.scale).toBeCloseTo(2 * K);
  });

  it('keeps a full-frame video clip filling the frame (scale untouched)', () => {
    const t = timeline([clip({ type: 'video', x: 0, y: 0, scale: 1 })]);
    const out = reframeTimelineData(t, LAND.w, LAND.h, SHORT.w, SHORT.h).tracks[0].clips[0];
    expect(out.scale).toBe(1); // object-contain refits it automatically
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });

  it('pulls an out-of-frame element back so its centre stays on canvas', () => {
    // An image pushed far right in the wide frame would land outside the narrow frame.
    const t = timeline([clip({ type: 'image', x: 5000, y: 0, scale: 1 })]);
    const out = reframeTimelineData(t, LAND.w, LAND.h, SHORT.w, SHORT.h).tracks[0].clips[0];
    expect(out.x).toBeLessThanOrEqual(SHORT.w / 2);
    expect(out.x).toBeGreaterThanOrEqual(-SHORT.w / 2);
  });

  it('guarantees an edge image that fit before still fits after', () => {
    // Image natural 400px wide at scale 1, right edge near the old frame edge.
    const rightEdgeX = LAND.w / 2 - 200; // half of 400 inside
    const t = timeline([clip({ type: 'image', x: rightEdgeX, y: 0, scale: 1, sourceWidth: 400, sourceHeight: 400 })]);
    const out = reframeTimelineData(t, LAND.w, LAND.h, SHORT.w, SHORT.h).tracks[0].clips[0];
    const halfDisplay = (400 * (out.scale ?? 1)) / 2;
    expect(out.x + halfDisplay).toBeLessThanOrEqual(SHORT.w / 2 + 0.001);
  });

  it('keeps subtitle fontSize and percentage position unchanged', () => {
    const t = timeline([
      clip({ type: 'subtitle', fontSize: 48, textPositionX: 90, textPositionY: 50 }),
    ]);
    const out = reframeTimelineData(t, LAND.w, LAND.h, SHORT.w, SHORT.h).tracks[0].clips[0];
    expect(out.fontSize).toBe(48); // text is never shrunk on reframe
    expect(out.textPositionX).toBe(90);
    expect(out.textPositionY).toBe(50);
  });

  it('scales x/y keyframe values for image clips', () => {
    const t = timeline([
      clip({
        type: 'image',
        keyframes: [
          { time: 0, property: 'x', value: 800 },
          { time: 1, property: 'scale', value: 2 },
          { time: 2, property: 'opacity', value: 0.5 },
        ],
      }),
    ]);
    const out = reframeTimelineData(t, LAND.w, LAND.h, SHORT.w, SHORT.h).tracks[0].clips[0];
    expect(out.keyframes[0].value).toBeCloseTo(800 * K);
    expect(out.keyframes[1].value).toBeCloseTo(2 * K);
    expect(out.keyframes[2].value).toBe(0.5); // opacity untouched
  });

  it('leaves audio clips untouched', () => {
    const t = timeline([clip({ type: 'audio', x: 0, y: 0, scale: 1, volume: 0.8 })]);
    const out = reframeTimelineData(t, LAND.w, LAND.h, SHORT.w, SHORT.h).tracks[0].clips[0];
    expect(out.volume).toBe(0.8);
  });
});
