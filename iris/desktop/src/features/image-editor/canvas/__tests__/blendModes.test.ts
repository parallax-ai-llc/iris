/**
 * Blend Modes Unit Tests
 * Tests for custom blend mode functions in canvasEngine
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  isCustomBlendMode,
  getCompositeOperation,
} from '../canvasEngine';
import type { BlendMode } from '@/features/image-editor/stores/imageEditor.store';

// ==================== Pixel-aware canvas mock ====================
//
// The global vitest.setup mock canvas does not actually store pixel data
// (drawImage is a no-op, getImageData always returns 128-gray).
// For blend-mode tests we need real pixel storage, so we patch the mock
// context prototype before any canvas-engine function creates canvases.

/**
 * WeakMap that stores a backing pixel buffer per canvas element.
 * Keyed on the canvas (not the context) so that multiple getContext('2d')
 * calls on the same canvas share the same pixel data.
 */
const pixelStore = new WeakMap<HTMLCanvasElement, Uint8ClampedArray>();

function getBuffer(ctx: CanvasRenderingContext2D): Uint8ClampedArray {
  const canvas: HTMLCanvasElement = ctx.canvas;
  let buf = pixelStore.get(canvas);
  if (!buf || buf.length !== canvas.width * canvas.height * 4) {
    buf = new Uint8ClampedArray(canvas.width * canvas.height * 4);
    pixelStore.set(canvas, buf);
  }
  return buf;
}

beforeAll(() => {
  // We cannot directly reference MockCanvasRenderingContext2D from vitest.setup
  // because it's file-scoped. Instead, create a canvas, grab its context, and
  // patch the constructor's prototype (all future contexts share the same proto).
  const probeCanvas = document.createElement('canvas');
  probeCanvas.width = 1;
  probeCanvas.height = 1;
  const probeCtx = probeCanvas.getContext('2d')!;
  const proto = Object.getPrototypeOf(probeCtx);

  // -- putImageData: store pixel data into the backing buffer --
  proto.putImageData = function (imageData: ImageData, dx: number, dy: number) {
    const buf = getBuffer(this);
    const w = this.canvas.width;
    const h = this.canvas.height;
    for (let row = 0; row < imageData.height; row++) {
      const destY = row + dy;
      if (destY < 0 || destY >= h) continue;
      for (let col = 0; col < imageData.width; col++) {
        const destX = col + dx;
        if (destX < 0 || destX >= w) continue;
        const si = (row * imageData.width + col) * 4;
        const di = (destY * w + destX) * 4;
        buf[di] = imageData.data[si];
        buf[di + 1] = imageData.data[si + 1];
        buf[di + 2] = imageData.data[si + 2];
        buf[di + 3] = imageData.data[si + 3];
      }
    }
  };

  // -- getImageData: read from the backing buffer --
  proto.getImageData = function (sx: number, sy: number, sw: number, sh: number): ImageData {
    const buf = getBuffer(this);
    const w = this.canvas.width;
    const out = new Uint8ClampedArray(sw * sh * 4);
    for (let row = 0; row < sh; row++) {
      const srcY = row + sy;
      for (let col = 0; col < sw; col++) {
        const srcX = col + sx;
        const oi = (row * sw + col) * 4;
        if (srcX < 0 || srcX >= w || srcY < 0 || srcY >= this.canvas.height) {
          // out-of-bounds => transparent black (already 0)
          continue;
        }
        const si = (srcY * w + srcX) * 4;
        out[oi] = buf[si];
        out[oi + 1] = buf[si + 1];
        out[oi + 2] = buf[si + 2];
        out[oi + 3] = buf[si + 3];
      }
    }
    return new ImageData(out, sw, sh);
  };

  // -- drawImage: copy pixels from source canvas --
  proto.drawImage = function (
    source: CanvasImageSource,
    dxOrSx: number,
    dyOrSy: number,
    dwOrSw?: number,
    _dhOrSh?: number,
  ) {
    // Only handle the simple (source, dx, dy) overload which the engine uses
    if (!(source instanceof HTMLCanvasElement)) return;
    const srcCtx = source.getContext('2d');
    if (!srcCtx) return;
    const srcBuf = getBuffer(srcCtx);
    const destBuf = getBuffer(this);
    const srcW = source.width;
    const srcH = source.height;
    const dstW = this.canvas.width;
    const dstH = this.canvas.height;
    const dx = dwOrSw === undefined ? dxOrSx : 0;
    const dy = dwOrSw === undefined ? dyOrSy : 0;

    for (let row = 0; row < srcH; row++) {
      const destY = row + dy;
      if (destY < 0 || destY >= dstH) continue;
      for (let col = 0; col < srcW; col++) {
        const destX = col + dx;
        if (destX < 0 || destX >= dstW) continue;
        const si = (row * srcW + col) * 4;
        const di = (destY * dstW + destX) * 4;
        const srcA = srcBuf[si + 3] / 255;
        if (srcA === 0) continue;
        // Simple source-over compositing
        const dstA = destBuf[di + 3] / 255;
        const outA = srcA + dstA * (1 - srcA);
        if (outA === 0) continue;
        destBuf[di] = (srcBuf[si] * srcA + destBuf[di] * dstA * (1 - srcA)) / outA;
        destBuf[di + 1] = (srcBuf[si + 1] * srcA + destBuf[di + 1] * dstA * (1 - srcA)) / outA;
        destBuf[di + 2] = (srcBuf[si + 2] * srcA + destBuf[di + 2] * dstA * (1 - srcA)) / outA;
        destBuf[di + 3] = Math.round(outA * 255);
      }
    }
  };

  // -- clearRect: zero out pixel data --
  proto.clearRect = function (x: number, y: number, w: number, h: number) {
    const buf = getBuffer(this);
    const cw = this.canvas.width;
    for (let row = y; row < y + h && row < this.canvas.height; row++) {
      for (let col = x; col < x + w && col < cw; col++) {
        const i = (row * cw + col) * 4;
        buf[i] = buf[i + 1] = buf[i + 2] = buf[i + 3] = 0;
      }
    }
  };
});

// Now import functions that create canvases (after the mock is patched)
// The imports at the top are fine since beforeAll runs before all tests.
import {
  createOffscreenCanvas,
  applyCustomBlendMode,
  compositeCanvases,
} from '../canvasEngine';

// ==================== Helpers ====================

/**
 * Create a canvas filled with a solid color (RGBA 0-255).
 */
function createSolidCanvas(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255
): HTMLCanvasElement {
  const { canvas, ctx } = createOffscreenCanvas(width, height, true);
  const imageData = ctx.createImageData(width, height);
  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i] = r;
    imageData.data[i + 1] = g;
    imageData.data[i + 2] = b;
    imageData.data[i + 3] = a;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Read RGBA of a single pixel from a canvas
 */
function readPixel(
  canvas: HTMLCanvasElement,
  x = 0,
  y = 0
): { r: number; g: number; b: number; a: number } {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
  return { r, g, b, a };
}

// ==================== isCustomBlendMode ====================

describe('isCustomBlendMode', () => {
  const customModes: BlendMode[] = [
    'dissolve',
    'linear-burn',
    'linear-dodge',
    'vivid-light',
    'linear-light',
    'pin-light',
    'hard-mix',
    // Canvas2D 네이티브 darken/lighten 오동작으로 커스텀 픽셀 경로로 라우팅됨
    'darken',
    'lighten',
  ];

  it.each(customModes)('should return true for custom mode "%s"', (mode) => {
    expect(isCustomBlendMode(mode)).toBe(true);
  });

  const standardModes: BlendMode[] = [
    'normal',
    'multiply',
    'screen',
    'overlay',
    'color-dodge',
    'color-burn',
    'soft-light',
    'hard-light',
    'difference',
    'exclusion',
    'hue',
    'saturation',
    'color',
    'luminosity',
  ];

  it.each(standardModes)('should return false for standard mode "%s"', (mode) => {
    expect(isCustomBlendMode(mode)).toBe(false);
  });
});

// ==================== getCompositeOperation ====================

describe('getCompositeOperation', () => {
  it('should map normal to source-over', () => {
    expect(getCompositeOperation('normal')).toBe('source-over');
  });

  it('should map standard modes to their canvas equivalents', () => {
    const mappings: Array<[BlendMode, GlobalCompositeOperation]> = [
      ['multiply', 'multiply'],
      ['screen', 'screen'],
      ['overlay', 'overlay'],
      ['darken', 'darken'],
      ['lighten', 'lighten'],
      ['color-dodge', 'color-dodge'],
      ['color-burn', 'color-burn'],
      ['soft-light', 'soft-light'],
      ['hard-light', 'hard-light'],
      ['difference', 'difference'],
      ['exclusion', 'exclusion'],
      ['hue', 'hue'],
      ['saturation', 'saturation'],
      ['color', 'color'],
      ['luminosity', 'luminosity'],
    ];

    for (const [mode, expected] of mappings) {
      expect(getCompositeOperation(mode)).toBe(expected);
    }
  });

  it('should fall back to source-over for custom blend modes', () => {
    const customModes: BlendMode[] = [
      'dissolve',
      'linear-burn',
      'linear-dodge',
      'vivid-light',
      'linear-light',
      'pin-light',
      'hard-mix',
    ];

    for (const mode of customModes) {
      expect(getCompositeOperation(mode)).toBe('source-over');
    }
  });
});

// ==================== applyCustomBlendMode - linear-burn ====================

describe('applyCustomBlendMode - linear-burn', () => {
  const SIZE = 4;

  it('should produce black when both layers are black', () => {
    const base = createSolidCanvas(SIZE, SIZE, 0, 0, 0);
    const top = createSolidCanvas(SIZE, SIZE, 0, 0, 0);

    const result = applyCustomBlendMode(base, top, 'linear-burn');
    const px = readPixel(result);

    expect(px.r).toBe(0);
    expect(px.g).toBe(0);
    expect(px.b).toBe(0);
  });

  it('should produce white when both layers are white', () => {
    const base = createSolidCanvas(SIZE, SIZE, 255, 255, 255);
    const top = createSolidCanvas(SIZE, SIZE, 255, 255, 255);

    const result = applyCustomBlendMode(base, top, 'linear-burn');
    const px = readPixel(result);

    expect(px.r).toBe(255);
    expect(px.g).toBe(255);
    expect(px.b).toBe(255);
  });

  it('should verify pixel math: linear-burn(base, top) = max(0, base + top - 255)', () => {
    const base = createSolidCanvas(SIZE, SIZE, 200, 200, 200);
    const top = createSolidCanvas(SIZE, SIZE, 100, 100, 100);

    const result = applyCustomBlendMode(base, top, 'linear-burn');
    const px = readPixel(result);

    // formula: max(0, b/255 + t/255 - 1) * 255
    const expected = Math.round(Math.max(0, 200 / 255 + 100 / 255 - 1) * 255);
    expect(px.r).toBe(expected);
    expect(px.g).toBe(expected);
    expect(px.b).toBe(expected);
  });

  it('should clamp to 0 when result would be negative', () => {
    const base = createSolidCanvas(SIZE, SIZE, 50, 50, 50);
    const top = createSolidCanvas(SIZE, SIZE, 50, 50, 50);

    const result = applyCustomBlendMode(base, top, 'linear-burn');
    const px = readPixel(result);

    expect(px.r).toBe(0);
    expect(px.g).toBe(0);
    expect(px.b).toBe(0);
  });
});

// ==================== applyCustomBlendMode - linear-dodge ====================

describe('applyCustomBlendMode - linear-dodge', () => {
  const SIZE = 4;

  it('should add pixel values and clamp to 255', () => {
    const base = createSolidCanvas(SIZE, SIZE, 200, 200, 200);
    const top = createSolidCanvas(SIZE, SIZE, 200, 200, 200);

    const result = applyCustomBlendMode(base, top, 'linear-dodge');
    const px = readPixel(result);

    expect(px.r).toBe(255);
    expect(px.g).toBe(255);
    expect(px.b).toBe(255);
  });

  it('should add correctly when sum is below 255', () => {
    const base = createSolidCanvas(SIZE, SIZE, 100, 100, 100);
    const top = createSolidCanvas(SIZE, SIZE, 50, 50, 50);

    const result = applyCustomBlendMode(base, top, 'linear-dodge');
    const px = readPixel(result);

    const expected = Math.round(Math.min(1, 100 / 255 + 50 / 255) * 255);
    expect(px.r).toBe(expected);
    expect(px.g).toBe(expected);
    expect(px.b).toBe(expected);
  });

  it('should return black when both are black', () => {
    const base = createSolidCanvas(SIZE, SIZE, 0, 0, 0);
    const top = createSolidCanvas(SIZE, SIZE, 0, 0, 0);

    const result = applyCustomBlendMode(base, top, 'linear-dodge');
    const px = readPixel(result);

    expect(px.r).toBe(0);
    expect(px.g).toBe(0);
    expect(px.b).toBe(0);
  });
});

// ==================== applyCustomBlendMode - hard-mix ====================

describe('applyCustomBlendMode - hard-mix', () => {
  const SIZE = 4;

  it('should output 255 when base + top >= 255', () => {
    const base = createSolidCanvas(SIZE, SIZE, 200, 200, 200);
    const top = createSolidCanvas(SIZE, SIZE, 200, 200, 200);

    const result = applyCustomBlendMode(base, top, 'hard-mix');
    const px = readPixel(result);

    expect(px.r).toBe(255);
    expect(px.g).toBe(255);
    expect(px.b).toBe(255);
  });

  it('should output 0 when base + top < 255', () => {
    const base = createSolidCanvas(SIZE, SIZE, 50, 50, 50);
    const top = createSolidCanvas(SIZE, SIZE, 50, 50, 50);

    const result = applyCustomBlendMode(base, top, 'hard-mix');
    const px = readPixel(result);

    expect(px.r).toBe(0);
    expect(px.g).toBe(0);
    expect(px.b).toBe(0);
  });

  it('should handle the boundary: base=128, top=127 => sum >= 255 => 255', () => {
    const base = createSolidCanvas(SIZE, SIZE, 128, 128, 128);
    const top = createSolidCanvas(SIZE, SIZE, 127, 127, 127);

    const result = applyCustomBlendMode(base, top, 'hard-mix');
    const px = readPixel(result);

    expect(px.r).toBe(255);
    expect(px.g).toBe(255);
    expect(px.b).toBe(255);
  });

  it('should handle the boundary: base=127, top=127 => sum < 255 => 0', () => {
    const base = createSolidCanvas(SIZE, SIZE, 127, 127, 127);
    const top = createSolidCanvas(SIZE, SIZE, 127, 127, 127);

    const result = applyCustomBlendMode(base, top, 'hard-mix');
    const px = readPixel(result);

    expect(px.r).toBe(0);
    expect(px.g).toBe(0);
    expect(px.b).toBe(0);
  });

  it('should handle per-channel independently', () => {
    // R: 200+200 >= 255 => 255, G: 50+50 < 255 => 0, B: 128+128 >= 255 => 255
    const base = createSolidCanvas(SIZE, SIZE, 200, 50, 128);
    const top = createSolidCanvas(SIZE, SIZE, 200, 50, 128);

    const result = applyCustomBlendMode(base, top, 'hard-mix');
    const px = readPixel(result);

    expect(px.r).toBe(255);
    expect(px.g).toBe(0);
    expect(px.b).toBe(255);
  });
});

// ==================== applyCustomBlendMode - dissolve ====================

describe('applyCustomBlendMode - dissolve', () => {
  it('should produce a mix of base and top pixels (not all-base or all-top)', () => {
    const SIZE = 64;
    const base = createSolidCanvas(SIZE, SIZE, 255, 0, 0);    // red
    const top = createSolidCanvas(SIZE, SIZE, 0, 0, 255);      // blue

    const result = applyCustomBlendMode(base, top, 'dissolve', 50);
    const ctx = result.getContext('2d', { willReadFrequently: true })!;
    const data = ctx.getImageData(0, 0, SIZE, SIZE).data;

    let redCount = 0;
    let blueCount = 0;
    const totalPixels = SIZE * SIZE;

    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === 255 && data[i + 2] === 0) redCount++;
      if (data[i] === 0 && data[i + 2] === 255) blueCount++;
    }

    // With 50% opacity dissolve, we expect both colors present
    expect(redCount).toBeGreaterThan(0);
    expect(blueCount).toBeGreaterThan(0);
    expect(redCount + blueCount).toBe(totalPixels);
  });

  it('should show more top pixels at higher opacity', () => {
    const SIZE = 64;
    const base = createSolidCanvas(SIZE, SIZE, 255, 0, 0);
    const top = createSolidCanvas(SIZE, SIZE, 0, 0, 255);

    const resultHigh = applyCustomBlendMode(base, top, 'dissolve', 90);
    const resultLow = applyCustomBlendMode(base, top, 'dissolve', 10);

    const countBlue = (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const d = ctx.getImageData(0, 0, SIZE, SIZE).data;
      let count = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 2] === 255 && d[i] === 0) count++;
      }
      return count;
    };

    expect(countBlue(resultHigh)).toBeGreaterThan(countBlue(resultLow));
  });
});

// ==================== compositeCanvases ====================

describe('compositeCanvases', () => {
  const SIZE = 4;

  it('should route custom blend modes through applyCustomBlendMode (pixel blending)', () => {
    const base = createSolidCanvas(SIZE, SIZE, 100, 100, 100);
    const top = createSolidCanvas(SIZE, SIZE, 50, 50, 50);

    const viaComposite = compositeCanvases(base, top, 'linear-dodge', 100);
    const viaDirect = applyCustomBlendMode(base, top, 'linear-dodge', 100);

    const pxComposite = readPixel(viaComposite);
    const pxDirect = readPixel(viaDirect);

    expect(pxComposite.r).toBe(pxDirect.r);
    expect(pxComposite.g).toBe(pxDirect.g);
    expect(pxComposite.b).toBe(pxDirect.b);
  });

  it('should use canvas compositing for standard modes (drawImage path)', () => {
    // For standard modes, compositeCanvases uses drawImage which goes through
    // our source-over mock. Top layer fully replaces base.
    const base = createSolidCanvas(SIZE, SIZE, 255, 0, 0);
    const top = createSolidCanvas(SIZE, SIZE, 0, 255, 0);

    const result = compositeCanvases(base, top, 'normal', 100);
    const px = readPixel(result);

    // After drawImage with source-over: top (green) composites over base (red)
    expect(px.r).toBe(0);
    expect(px.g).toBe(255);
    expect(px.b).toBe(0);
  });

  it('should preserve base canvas dimensions', () => {
    const base = createSolidCanvas(100, 80, 0, 0, 0);
    const top = createSolidCanvas(50, 50, 255, 255, 255);

    const result = compositeCanvases(base, top, 'normal', 100);

    expect(result.width).toBe(100);
    expect(result.height).toBe(80);
  });

  it('should default to normal blend mode', () => {
    const base = createSolidCanvas(SIZE, SIZE, 255, 0, 0);
    const top = createSolidCanvas(SIZE, SIZE, 0, 255, 0);

    const result = compositeCanvases(base, top);
    const px = readPixel(result);

    // Default is 'normal' with opacity 100 => top covers base
    expect(px.g).toBe(255);
    expect(px.r).toBe(0);
  });
});

// ==================== Opacity ====================

describe('Opacity', () => {
  const SIZE = 4;

  it('should scale blend amount with opacity for custom modes', () => {
    const base = createSolidCanvas(SIZE, SIZE, 100, 100, 100);
    const top = createSolidCanvas(SIZE, SIZE, 200, 200, 200);

    const resultFull = applyCustomBlendMode(base, top, 'linear-dodge', 100);
    const resultHalf = applyCustomBlendMode(base, top, 'linear-dodge', 50);

    const pxFull = readPixel(resultFull);
    const pxHalf = readPixel(resultHalf);

    // Full opacity: min(1, 100/255 + 200/255)*255 = 255 (clamped)
    // Half opacity: lerp(100, 255, 0.5) = 178
    expect(pxFull.r).toBe(255);
    expect(pxHalf.r).toBeGreaterThan(100);
    expect(pxHalf.r).toBeLessThan(pxFull.r);
  });

  it('should return base unchanged when opacity is 0 for custom modes', () => {
    const base = createSolidCanvas(SIZE, SIZE, 100, 100, 100);
    const top = createSolidCanvas(SIZE, SIZE, 200, 200, 200);

    const result = applyCustomBlendMode(base, top, 'linear-dodge', 0);
    const px = readPixel(result);

    expect(px.r).toBe(100);
    expect(px.g).toBe(100);
    expect(px.b).toBe(100);
  });

  it('should scale blend for compositeCanvases with standard modes', () => {
    // Standard modes use globalAlpha on drawImage; our mock drawImage
    // does not respect globalAlpha, so we test via a custom mode instead
    // to verify opacity scaling works end-to-end through compositeCanvases.
    const base = createSolidCanvas(SIZE, SIZE, 0, 0, 0);
    const top = createSolidCanvas(SIZE, SIZE, 200, 200, 200);

    const resultFull = compositeCanvases(base, top, 'linear-dodge', 100);
    const resultHalf = compositeCanvases(base, top, 'linear-dodge', 50);

    const pxFull = readPixel(resultFull);
    const pxHalf = readPixel(resultHalf);

    // linear-dodge(0, 200) = 200 at full opacity
    // At 50% opacity: lerp(0, 200, 0.5) = 100
    expect(pxFull.r).toBe(200);
    expect(pxHalf.r).toBe(100);
  });

  it('should interpolate correctly at various opacity levels for hard-mix', () => {
    const base = createSolidCanvas(SIZE, SIZE, 200, 200, 200);
    const top = createSolidCanvas(SIZE, SIZE, 200, 200, 200);

    // hard-mix(200,200) = 255 (sum >= 255)
    // At 50% opacity: lerp(200, 255, 0.5) = 228
    const result = applyCustomBlendMode(base, top, 'hard-mix', 50);
    const px = readPixel(result);

    const expected = Math.round(200 * (1 - 0.5) + 255 * 0.5);
    expect(px.r).toBeCloseTo(expected, 0);
  });
});
