/**
 * Unit tests for buildSubtitleSvg (the pure SVG-builder portion of renderSubtitlePng.ts).
 *
 * Canvas rasterization (renderSubtitleClipToPng) requires a real browser DOM
 * and is tested visually via the integration path.  These tests cover the
 * geometry / attribute correctness of the generated SVG string.
 */

import { describe, it, expect } from 'vitest';
import { buildSubtitleSvg } from '../renderSubtitlePng';
import { LOWER_THIRD_PRESETS } from '../lowerThirdPresets';
import type { SubtitleClip } from '@/types/editor.types';

// ---------- helper fixtures ----------

const baseClip: SubtitleClip = {
  id: 'c1',
  trackId: 't1',
  name: 'test',
  type: 'subtitle',
  text: 'Hello World',
  startTime: 0,
  endTime: 3,
  sourceStartTime: 0,
  sourceEndTime: 3,
  style: {
    fontSize: 32,
    fontFamily: 'Arial',
    fontColor: '#FFFFFF',
    backgroundColor: '#DC2626',
    backgroundOpacity: 0.95,
    position: { x: 50, y: 88 },
    alignment: 'center',
    verticalAlign: 'bottom',
    animation: 'none',
    animationColor: '#FFD700',
    width: 100,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
};

// ---------- tests ----------

describe('buildSubtitleSvg', () => {
  it('uses correct fill-opacity from backgroundOpacity', () => {
    const svg = buildSubtitleSvg(baseClip, 1920, 1080);
    expect(svg).toContain('fill-opacity="0.95"');
  });

  it('uses correct fill color from backgroundColor', () => {
    const svg = buildSubtitleSvg(baseClip, 1920, 1080);
    expect(svg).toContain('fill="#DC2626"');
  });

  it('uses text-anchor=middle for center alignment', () => {
    const svg = buildSubtitleSvg(baseClip, 1920, 1080);
    expect(svg).toContain('text-anchor="middle"');
  });

  it('uses text-anchor=start for left alignment', () => {
    const leftClip: SubtitleClip = {
      ...baseClip,
      style: { ...baseClip.style, alignment: 'left' },
    };
    const svg = buildSubtitleSvg(leftClip, 1920, 1080);
    expect(svg).toContain('text-anchor="start"');
  });

  it('uses text-anchor=end for right alignment', () => {
    const rightClip: SubtitleClip = {
      ...baseClip,
      style: { ...baseClip.style, alignment: 'right' },
    };
    const svg = buildSubtitleSvg(rightClip, 1920, 1080);
    expect(svg).toContain('text-anchor="end"');
  });

  it('centers box on position.x/y in project px (width=100% => boxX=0)', () => {
    const W = 1920;
    // With width=100 (full frame): boxW = W, boxX = centerX - W/2 = 960 - 960 = 0
    const svg = buildSubtitleSvg(baseClip, W, 1080);
    expect(svg).toContain('x="0.00"');
  });

  it('applies textTransform uppercase to text content', () => {
    const svg = buildSubtitleSvg(baseClip, 1920, 1080);
    expect(svg).toContain('HELLO WORLD');
    expect(svg).not.toContain('Hello World');
  });

  it('applies textTransform lowercase', () => {
    const clip: SubtitleClip = {
      ...baseClip,
      text: 'Hello World',
      style: { ...baseClip.style, textTransform: 'lowercase' },
    };
    const svg = buildSubtitleSvg(clip, 1920, 1080);
    expect(svg).toContain('hello world');
  });

  it('includes stroke attributes when stroke is defined', () => {
    const strokeClip: SubtitleClip = {
      ...baseClip,
      style: {
        ...baseClip.style,
        stroke: { color: '#000000', width: 2 },
      },
    };
    const svg = buildSubtitleSvg(strokeClip, 1920, 1080);
    expect(svg).toContain('paint-order="stroke"');
    expect(svg).toContain('stroke="#000000"');
    expect(svg).toContain('stroke-width="2"');
  });

  it('omits paint-order when stroke is not defined', () => {
    const noStrokeClip: SubtitleClip = {
      ...baseClip,
      style: { ...baseClip.style, stroke: undefined },
    };
    const svg = buildSubtitleSvg(noStrokeClip, 1920, 1080);
    expect(svg).not.toContain('paint-order="stroke"');
  });

  it('includes feDropShadow filter when dropShadow is defined and animation is not glow', () => {
    const shadowClip: SubtitleClip = {
      ...baseClip,
      style: {
        ...baseClip.style,
        dropShadow: { color: '#000000', offsetX: 2, offsetY: 2, blur: 4 },
        animation: 'none',
      },
    };
    const svg = buildSubtitleSvg(shadowClip, 1920, 1080);
    expect(svg).toContain('feDropShadow');
    expect(svg).toContain('filter="url(#ds)"');
  });

  it('omits feDropShadow when animation is glow', () => {
    const glowClip: SubtitleClip = {
      ...baseClip,
      style: {
        ...baseClip.style,
        dropShadow: { color: '#000000', offsetX: 2, offsetY: 2, blur: 4 },
        animation: 'glow',
      },
    };
    const svg = buildSubtitleSvg(glowClip, 1920, 1080);
    expect(svg).not.toContain('feDropShadow');
    expect(svg).not.toContain('filter="url(#ds)"');
  });

  it('produces a valid SVG root element with correct dimensions', () => {
    const svg = buildSubtitleSvg(baseClip, 1920, 1080);
    expect(svg).toContain('width="1920"');
    expect(svg).toContain('height="1080"');
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
  });

  it('includes letter-spacing attribute when letterSpacing != 0', () => {
    const svg = buildSubtitleSvg(baseClip, 1920, 1080);
    expect(svg).toContain('letter-spacing="1"');
  });

  it('omits letter-spacing attribute when letterSpacing is 0', () => {
    const clip: SubtitleClip = {
      ...baseClip,
      style: { ...baseClip.style, letterSpacing: 0 },
    };
    const svg = buildSubtitleSvg(clip, 1920, 1080);
    expect(svg).not.toContain('letter-spacing');
  });

  it('escapes XML special characters in text', () => {
    const clip: SubtitleClip = {
      ...baseClip,
      text: 'A & B < C > D',
      style: { ...baseClip.style, textTransform: 'none' },
    };
    const svg = buildSubtitleSvg(clip, 1920, 1080);
    expect(svg).toContain('A &amp; B &lt; C &gt; D');
  });

  it('uses auto width (capped at 80%) when style.width is undefined', () => {
    const W = 1920;
    const clip: SubtitleClip = {
      ...baseClip,
      style: { ...baseClip.style, width: undefined, textTransform: 'none' },
    };
    const svg = buildSubtitleSvg(clip, W, 1080);
    // boxW must be <= 80% of W = 1536. The rect width attribute should be <= 1536.
    // First match is the SVG root (1920), second is the rect
    const widths = [...svg.matchAll(/width="([\d.]+)"/g)].map((m) => parseFloat(m[1]));
    const rectWidth = widths[1]; // second occurrence is the rect
    expect(rectWidth).toBeLessThanOrEqual(W * 0.8);
  });

  it('renders font-family from style', () => {
    const svg = buildSubtitleSvg(baseClip, 1920, 1080);
    expect(svg).toContain('font-family="Arial"');
  });

  it('renders correct font-size', () => {
    const svg = buildSubtitleSvg(baseClip, 1920, 1080);
    expect(svg).toContain('font-size="32"');
  });
});

// ---------- every lower-third preset renders its defining style ----------

describe('buildSubtitleSvg — lower-third presets', () => {
  const W = 1280;
  const H = 720;
  const ANCHOR: Record<string, string> = { left: 'start', center: 'middle', right: 'end' };

  const minimalBase: SubtitleClip['style'] = {
    fontSize: 24,
    fontFamily: 'Arial',
    fontColor: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0.7,
    position: { x: 50, y: 88 },
    alignment: 'center',
    verticalAlign: 'bottom',
    animation: 'none',
    animationColor: '#FFD700',
  };

  for (const preset of LOWER_THIRD_PRESETS) {
    it(`${preset.id} maps background, alignment and effects faithfully`, () => {
      const style = { ...minimalBase, ...preset.style } as SubtitleClip['style'];
      const clip = { ...baseClip, text: 'Sample Name', style } as SubtitleClip;
      const svg = buildSubtitleSvg(clip, W, H);

      // Background fill + opacity exact (this was the regression)
      expect(svg).toContain(`fill="${style.backgroundColor}"`);
      expect(svg).toContain(`fill-opacity="${style.backgroundOpacity}"`);

      // Text alignment → text-anchor (was always 'middle' under ASS)
      expect(svg).toContain(`text-anchor="${ANCHOR[style.alignment]}"`);

      // Explicit box width → rect spans that fraction of the frame
      if (style.width != null) {
        expect(svg).toContain(`width="${((style.width / 100) * W).toFixed(2)}"`);
      }

      // Glow animation → coloured halo filter in the accent colour
      if (style.animation === 'glow') {
        expect(svg).toContain('<filter id="glow"');
        expect(svg).toContain(`flood-color="${style.animationColor}"`);
      } else if (style.dropShadow) {
        // Drop shadow (non-glow presets) → feDropShadow
        expect(svg).toContain('feDropShadow');
      }
    });
  }
});
