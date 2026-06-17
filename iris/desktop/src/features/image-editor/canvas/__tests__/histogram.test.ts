/**
 * Histogram Calculation Utility Tests
 */

import { describe, it, expect } from 'vitest';
import {
  calculateHistogram,
  getCanvasImageData,
  type HistogramData,
} from '../histogram';
import { createOffscreenCanvas } from '../canvasEngine';

/**
 * Helper: build an ImageData filled with a single RGBA color.
 */
function createSolidImageData(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = a;
  }
  return new ImageData(data, width, height);
}

describe('calculateHistogram', () => {
  it('should peak red at 255 for a solid red image', () => {
    const img = createSolidImageData(10, 10, 255, 0, 0);
    const hist = calculateHistogram(img);

    // Red channel: all pixels at index 255
    expect(hist.r[255]).toBe(1);
    expect(hist.r[0]).toBe(0);

    // Green and blue: all pixels at index 0
    expect(hist.g[0]).toBe(1);
    expect(hist.g[255]).toBe(0);
    expect(hist.b[0]).toBe(1);
    expect(hist.b[255]).toBe(0);
  });

  it('should peak all channels at 255 for a solid white image', () => {
    const img = createSolidImageData(10, 10, 255, 255, 255);
    const hist = calculateHistogram(img);

    expect(hist.r[255]).toBe(1);
    expect(hist.g[255]).toBe(1);
    expect(hist.b[255]).toBe(1);
    expect(hist.l[255]).toBe(1);

    // No counts at 0
    expect(hist.r[0]).toBe(0);
    expect(hist.g[0]).toBe(0);
    expect(hist.b[0]).toBe(0);
  });

  it('should peak all channels at 0 for a solid black image', () => {
    const img = createSolidImageData(10, 10, 0, 0, 0);
    const hist = calculateHistogram(img);

    expect(hist.r[0]).toBe(1);
    expect(hist.g[0]).toBe(1);
    expect(hist.b[0]).toBe(1);
    expect(hist.l[0]).toBe(1);

    // No counts at 255
    expect(hist.r[255]).toBe(0);
    expect(hist.g[255]).toBe(0);
    expect(hist.b[255]).toBe(0);
  });

  it('should show distribution across values for a gradient', () => {
    const width = 256;
    const height = 1;
    const data = new Uint8ClampedArray(width * height * 4);

    // Horizontal grey gradient: pixel i has value i in all channels
    for (let i = 0; i < 256; i++) {
      const offset = i * 4;
      data[offset] = i;     // R
      data[offset + 1] = i; // G
      data[offset + 2] = i; // B
      data[offset + 3] = 255;
    }

    const img = new ImageData(data, width, height);
    const hist = calculateHistogram(img);

    // Each value 0-255 appears exactly once, so after normalization
    // every bin should equal 1 (each count is 1, maxCount is 1).
    for (let i = 0; i < 256; i++) {
      expect(hist.r[i]).toBe(1);
      expect(hist.g[i]).toBe(1);
      expect(hist.b[i]).toBe(1);
    }
  });

  it('should normalize max value to 1.0', () => {
    const img = createSolidImageData(50, 50, 128, 64, 200);
    const hist = calculateHistogram(img);

    const allValues = [...hist.r, ...hist.g, ...hist.b, ...hist.l];
    const maxValue = Math.max(...allValues);

    expect(maxValue).toBe(1);
  });

  it('should skip fully transparent pixels', () => {
    // All pixels transparent (alpha = 0)
    const img = createSolidImageData(10, 10, 255, 0, 0, 0);
    const hist = calculateHistogram(img);

    // No opaque pixels => all bins should be 0
    for (let i = 0; i < 256; i++) {
      expect(hist.r[i]).toBe(0);
      expect(hist.g[i]).toBe(0);
      expect(hist.b[i]).toBe(0);
      expect(hist.l[i]).toBe(0);
    }
  });

  it('should compute luminance using ITU-R BT.601 formula', () => {
    // Use a specific color: R=100, G=150, B=50
    const r = 100, g = 150, b = 50;
    const expectedLum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    // expectedLum = Math.round(29.9 + 88.05 + 5.7) = Math.round(123.65) = 124

    const img = createSolidImageData(4, 4, r, g, b);
    const hist = calculateHistogram(img);

    expect(hist.l[expectedLum]).toBe(1);

    // All other luminance bins should be 0
    for (let i = 0; i < 256; i++) {
      if (i !== expectedLum) {
        expect(hist.l[i]).toBe(0);
      }
    }
  });
});

describe('getCanvasImageData', () => {
  it('should return ImageData from a canvas', () => {
    const { canvas, ctx } = createOffscreenCanvas(20, 20);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 20, 20);

    const imageData = getCanvasImageData(canvas);

    expect(imageData).not.toBeNull();
    expect(imageData!.width).toBe(20);
    expect(imageData!.height).toBe(20);
    expect(imageData!.data.length).toBe(20 * 20 * 4);
  });
});

describe('HistogramData type', () => {
  it('should have r, g, b, l arrays each of length 256', () => {
    const img = createSolidImageData(2, 2, 0, 0, 0);
    const hist: HistogramData = calculateHistogram(img);

    expect(hist.r).toHaveLength(256);
    expect(hist.g).toHaveLength(256);
    expect(hist.b).toHaveLength(256);
    expect(hist.l).toHaveLength(256);
  });

  it('should contain only numbers between 0 and 1', () => {
    const img = createSolidImageData(8, 8, 120, 200, 30);
    const hist: HistogramData = calculateHistogram(img);

    const allArrays = [hist.r, hist.g, hist.b, hist.l];
    for (const arr of allArrays) {
      for (const val of arr) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    }
  });
});
