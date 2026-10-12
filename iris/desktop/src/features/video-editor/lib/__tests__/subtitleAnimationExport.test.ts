/**
 * Subtitle animation parity — the preview (SubtitleOverlay) and the export
 * (per-frame SVG → PNG sequence) read the same values from
 * lib/subtitleAnimation.ts. These tests pin the preset maths, check that the
 * frame SVG carries those values, and that buildExportRequest sends one frame
 * per output frame for animated subtitles (static ones keep a single PNG).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  subtitleAnimationFrame, subtitleAnimationFrameAt, subtitleKeyframeState, isSubtitleAnimated,
} from '../subtitleAnimation';
import { cubicBezier } from '@/shared/lib/utils/keyframeEasing';
import { buildSubtitleSvg } from '../renderSubtitlePng';
import { interpolateKeyframes } from '@/shared/lib/utils/effectRenderer';
import type { SubtitleClip, Track } from '@/types/editor.types';

vi.mock('../renderSubtitlePng', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../renderSubtitlePng')>();
  // jsdom has no canvas: rasterising returns a stable token per distinct SVG.
  const seen = new Map<string, string>();
  return {
    ...mod,
    rasterizeSubtitleSvg: vi.fn(async (svg: string) => {
      if (!seen.has(svg)) seen.set(svg, `data:image/png;base64,${seen.size}`);
      return seen.get(svg)!;
    }),
  };
});

const { buildExportRequest } = await import('../buildExportRequest');

const style: SubtitleClip['style'] = {
  fontSize: 32, fontFamily: 'Arial', fontColor: '#FFFFFF', backgroundColor: '#000000',
  backgroundOpacity: 0.5, position: { x: 50, y: 80 }, alignment: 'center', verticalAlign: 'bottom',
  animation: 'none', animationColor: '#FFD700',
};

function sub(extra: Partial<SubtitleClip> = {}): SubtitleClip {
  return {
    id: 's1', trackId: 's', type: 'subtitle', name: 's', text: 'one two three four',
    startTime: 1, endTime: 3, sourceStartTime: 0, sourceEndTime: 2, style, ...extra,
  };
}

describe('subtitleAnimationFrame (preview maths)', () => {
  it('highlight colours every word up to floor(p·words)', () => {
    const f = subtitleAnimationFrame('one two three four', 'highlight', 0.5, '#fff', '#f00');
    const words = f.segments.filter((s) => !s.space);
    expect(words.map((w) => w.color)).toEqual(['#f00', '#f00', '#f00', '#fff']);
  });

  it('typewriter shows floor(p·chars) characters and keeps the rest in layout', () => {
    const f = subtitleAnimationFrame('abcdefghij', 'typewriter', 0.35, '#fff', '#f00');
    expect(f.segments.map((s) => [s.text, s.opacity])).toEqual([['abc', 1], ['defghij', 0]]);
  });

  it('bounce / fade-word / slide-up / glow / wave follow the preview formulas', () => {
    const b = subtitleAnimationFrame('a b', 'bounce', 0.25, '#fff', '#f00').segments.filter((s) => !s.space);
    // Preview formula max(0, (1 − wp)·−20): a shown word sits at 0, a hidden one at −30.
    expect(b[0]).toMatchObject({ translateY: 0, opacity: 1 });
    expect(b[1]).toMatchObject({ translateY: -30, opacity: 0 });
    const fw = subtitleAnimationFrame('a b', 'fade-word', 0.75, '#fff', '#f00').segments.filter((s) => !s.space);
    expect(fw.map((s) => s.opacity)).toEqual([1, 0.5]);
    const su = subtitleAnimationFrame('a', 'slide-up', 0.1, '#fff', '#f00');
    expect(su.blockTranslateY).toBeCloseTo(21);
    expect(su.blockOpacity).toBeCloseTo(0.4);
    expect(subtitleAnimationFrame('a', 'glow', 1 / 12, '#fff', '#f00').glow).toBeCloseTo(8);
    const w = subtitleAnimationFrame('ab', 'wave', 0.5, '#fff', '#f00').segments;
    expect(w[1].translateY).toBeCloseTo(Math.sin(4 - 0.3) * 3);
  });

  it('replays the preview CSS transitions of word state changes (bounce / highlight / scale)', () => {
    // 2 words over 2 s → word 1 switches at t = 1.
    const b = subtitleAnimationFrameAt('a b', 'bounce', 1.15, 2, '#ffffff', '#ff0000').segments.filter((s) => !s.space);
    expect(b[1].translateY).toBeCloseTo(-30 + 30 * cubicBezier(0.5, 0.34, 1.56, 0.64, 1), 6);
    expect(b[1].opacity).toBeCloseTo(cubicBezier(0.75, 0.25, 0.1, 0.25, 1), 6);
    // Word 0 is shown from the clip start (mounted state, no transition): the
    // preview formula max(0, (1 − wp)·−20) with wp = 1.15.
    expect(b[0].translateY).toBeCloseTo(3, 6);
    expect(b[0].opacity).toBe(1);
    const hl = subtitleAnimationFrameAt('a b', 'highlight', 1.075, 2, '#000000', '#ffffff').segments.filter((s) => !s.space);
    const k = Math.round(255 * cubicBezier(0.5, 0.25, 0.1, 0.25, 1));
    expect(hl[1].color).toBe('#' + k.toString(16).padStart(2, '0').repeat(3));
    const sc = subtitleAnimationFrameAt('a b', 'scale', 1.1, 2, '#000000', '#ffffff').segments.filter((s) => !s.space);
    expect(sc[0].scale).toBeCloseTo(1.3 - 0.3 * cubicBezier(0.5, 0.25, 0.1, 0.25, 1), 6);
    expect(sc[1].scale).toBeCloseTo(1 + 0.3 * cubicBezier(0.5, 0.25, 0.1, 0.25, 1), 6);
    expect(subtitleAnimationFrameAt('a b', 'scale', 1.5, 2, '#000000', '#ffffff').segments[2].scale).toBe(1.3);
  });

  it('animationKeyframes use the shared keyframe interpolation', () => {
    const kfs = [
      { time: 0, property: 'x' as const, value: 20, easing: 'ease-in' },
      { time: 2, property: 'x' as const, value: 80 },
      { time: 0, property: 'opacity' as const, value: 0 },
      { time: 1, property: 'opacity' as const, value: 1 },
    ];
    const s = subtitleKeyframeState(kfs, 0.7);
    expect(s.x).toBeCloseTo(interpolateKeyframes(kfs as never, 'x', 0.7)!);
    expect(s.opacity).toBeCloseTo(0.7);
    expect(s.scale).toBeUndefined();
  });

  it('isSubtitleAnimated covers presets and keyframes', () => {
    expect(isSubtitleAnimated(sub())).toBe(false);
    expect(isSubtitleAnimated(sub({ style: { ...style, animation: 'wave' } }))).toBe(true);
    expect(isSubtitleAnimated(sub({ animationKeyframes: [{ time: 0, property: 'x', value: 1 }] }))).toBe(true);
  });
});

describe('buildSubtitleSvg at a frame time', () => {
  it('typewriter hides the unrevealed characters with fill-opacity 0', () => {
    const clip = sub({ text: 'abcdefghij', style: { ...style, animation: 'typewriter' } });
    const svg = buildSubtitleSvg(clip, 640, 360, { time: 0.7 }); // p = 0.35 → 'abc'
    expect(svg).toMatch(/<tspan[^>]*>abc<\/tspan><tspan[^>]*fill-opacity="0"[^>]*>defghij<\/tspan>/);
  });

  it('keyframed position, opacity and scale move the whole box', () => {
    const clip = sub({
      animationKeyframes: [
        { time: 0, property: 'x', value: 25 },
        { time: 2, property: 'x', value: 75 },
        { time: 0, property: 'opacity', value: 0.5 },
        { time: 0, property: 'scale', value: 2 },
      ],
    });
    const atStart = buildSubtitleSvg(clip, 640, 360, { time: 0 });
    const atEnd = buildSubtitleSvg(clip, 640, 360, { time: 2 });
    const textX = (svg: string) => Number(/<text x="([\d.]+)"/.exec(svg)![1]);
    expect(textX(atStart)).toBeCloseTo(160, 0);
    expect(textX(atEnd)).toBeCloseTo(480, 0);
    expect(atStart).toContain('opacity="0.5"');
    expect(atStart).toMatch(/scale\(2\)/);
  });

  it('glow pulses with the preview radius (σ = radius / 2)', () => {
    const clip = sub({ style: { ...style, animation: 'glow' } });
    const svg = buildSubtitleSvg(clip, 640, 360, { time: 2 / 12 }); // p = 1/12 → radius 8
    expect(svg).toContain('stdDeviation="4.00"');
    expect(svg).toContain('stdDeviation="8.00"');
  });

  it('slide-up offsets and fades the text, not the box', () => {
    const clip = sub({ style: { ...style, animation: 'slide-up' } });
    const svg = buildSubtitleSvg(clip, 640, 360, { time: 0.2 }); // p = 0.1
    expect(svg).toMatch(/<g transform="translate\(0 21(\.0+)?\)" opacity="0\.4(0*)?">\s*<text/);
  });
});

describe('buildExportRequest — animated subtitles', () => {
  const tracks = (clip: SubtitleClip): Track[] => [{
    id: 's', type: 'subtitle', name: 's', locked: false, muted: false, solo: false, visible: true,
    volume: 1, height: 50, clips: [clip],
  }];
  const params = {
    duration: 4, width: 320, height: 180, frameRate: 10, format: 'mp4' as const, quality: 'high' as const,
    includeSubtitles: true, subtitleFormat: 'burned' as const, outputPath: '',
  };

  it('sends one frame per output frame (deduplicated images) for an animated subtitle', async () => {
    const clip = sub({ text: 'abcd', style: { ...style, animation: 'typewriter' } });
    const req = await buildExportRequest({ ...params, tracks: tracks(clip) });
    const [entry] = req.subtitleOverlays as Array<Record<string, unknown>>;
    expect(entry.startTime).toBe(1);
    expect(entry.endTime).toBe(3);
    const index = entry.frameIndex as number[];
    expect(index).toHaveLength(20); // 2 s at 10 fps
    // 'abcd' typewriter at p = f/20: floor(4p) = 0..3 characters → 4 distinct images.
    expect(new Set(index).size).toBe(4);
    expect((entry.frameDataUrls as string[]).length).toBe(4);
    expect(index.slice(0, 6)).toEqual([0, 0, 0, 0, 0, 1]);
    expect(entry.pngDataUrl).toBeUndefined();
  });

  it('keeps a single PNG for a static subtitle', async () => {
    const req = await buildExportRequest({ ...params, tracks: tracks(sub()) });
    const [entry] = req.subtitleOverlays as Array<Record<string, unknown>>;
    expect(typeof entry.pngDataUrl).toBe('string');
    expect(entry.frameIndex).toBeUndefined();
  });

  it('a marked range keeps the animation on clip time', async () => {
    const clip = sub({ text: 'abcd', style: { ...style, animation: 'typewriter' } });
    const req = await buildExportRequest({ ...params, tracks: tracks(clip), range: { start: 2, end: 4 } });
    const [entry] = req.subtitleOverlays as Array<Record<string, unknown>>;
    expect(entry.startTime).toBe(0);
    // Second half of the clip only (p = 0.5..0.95): 2..3 characters → 2 images.
    expect(new Set(entry.frameIndex as number[]).size).toBe(2);
    expect(entry.frameIndex).toHaveLength(10);
  });
});
