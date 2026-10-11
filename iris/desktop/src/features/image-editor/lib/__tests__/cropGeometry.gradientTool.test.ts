import { describe, it, expect } from 'vitest';
import { rectFromDrag } from '../cropGeometry';
import { resolveGradientStops } from '../gradientTool';

const BOUNDS = { width: 480, height: 320 };

describe('rectFromDrag (new crop box)', () => {
  it('down-right drag spans anchor..pointer', () => {
    expect(rectFromDrag({ x: 100, y: 60 }, { x: 300, y: 260 }, BOUNDS)).toEqual({ x: 100, y: 60, width: 200, height: 200 });
  });

  it('up-left drag gives the same box (no minimum-size collapse)', () => {
    expect(rectFromDrag({ x: 300, y: 260 }, { x: 100, y: 60 }, BOUNDS)).toEqual({ x: 100, y: 60, width: 200, height: 200 });
  });

  it('mixed directions and clamping to the image', () => {
    expect(rectFromDrag({ x: 100, y: 100 }, { x: -50, y: 400 }, BOUNDS)).toEqual({ x: 0, y: 100, width: 100, height: 220 });
  });

  it('aspect ratio follows the width in the drag direction and fits the image', () => {
    expect(rectFromDrag({ x: 300, y: 200 }, { x: 100, y: 0 }, BOUNDS, 1)).toEqual({ x: 100, y: 0, width: 200, height: 200 });
    // ratio 2:1 upward from y=50 is limited by the top edge
    expect(rectFromDrag({ x: 300, y: 50 }, { x: 0, y: 0 }, BOUNDS, 2)).toEqual({ x: 200, y: 0, width: 100, height: 50 });
  });
});

describe('resolveGradientStops', () => {
  const stops = [
    { offset: 0, color: '#112233' },
    { offset: 1, color: '#445566' },
  ];

  it('defaults to foreground -> background', () => {
    expect(resolveGradientStops({ colorStops: stops, reverse: false, colorSource: 'foreground-background' }, '#ff0000', '#ffffff')).toEqual([
      { offset: 0, color: '#ff0000' },
      { offset: 1, color: '#ffffff' },
    ]);
    // settings saved before colorSource existed behave the same
    expect(resolveGradientStops({ colorStops: stops, reverse: false }, '#ff0000', '#ffffff')[0].color).toBe('#ff0000');
  });

  it('custom stops and reverse', () => {
    expect(resolveGradientStops({ colorStops: stops, reverse: false, colorSource: 'custom' }, '#ff0000', '#ffffff')).toEqual(stops);
    expect(resolveGradientStops({ colorStops: stops, reverse: true, colorSource: 'custom' }, '#ff0000', '#ffffff')).toEqual([
      { offset: 0, color: '#445566' },
      { offset: 1, color: '#112233' },
    ]);
  });
});
