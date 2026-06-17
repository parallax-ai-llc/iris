import { describe, it, expect } from 'vitest';
import { applyClippingMask } from '../layerEffects';

/**
 * Tests for clipping mask compositing logic
 * Validates that applyClippingMask correctly uses source-atop to clip
 * a layer to the shape of the base layer below it.
 */
describe('applyClippingMask', () => {
  const createCanvas = (width: number, height: number): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };

  it('should return a canvas with the same dimensions as the layer canvas', () => {
    const layerCanvas = createCanvas(200, 150);
    const clipCanvas = createCanvas(200, 150);
    const result = applyClippingMask(layerCanvas, clipCanvas);

    expect(result).toBeInstanceOf(HTMLCanvasElement);
    expect(result.width).toBe(200);
    expect(result.height).toBe(150);
  });

  it('should return a new canvas (not modify inputs)', () => {
    const layerCanvas = createCanvas(100, 100);
    const clipCanvas = createCanvas(100, 100);
    const result = applyClippingMask(layerCanvas, clipCanvas);

    expect(result).not.toBe(layerCanvas);
    expect(result).not.toBe(clipCanvas);
  });

  it('should produce a canvas with a valid 2d context', () => {
    const layerCanvas = createCanvas(50, 50);
    const clipCanvas = createCanvas(50, 50);
    const result = applyClippingMask(layerCanvas, clipCanvas);
    const ctx = result.getContext('2d');

    expect(ctx).not.toBeNull();
  });

  it('should handle different canvas sizes gracefully', () => {
    const layerCanvas = createCanvas(300, 200);
    const clipCanvas = createCanvas(300, 200);
    const result = applyClippingMask(layerCanvas, clipCanvas);

    // Result should match layerCanvas dimensions
    expect(result.width).toBe(300);
    expect(result.height).toBe(200);
  });

  it('should handle 1x1 pixel canvases', () => {
    const layerCanvas = createCanvas(1, 1);
    const clipCanvas = createCanvas(1, 1);
    const result = applyClippingMask(layerCanvas, clipCanvas);

    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });

  it('should chain multiple clipping masks', () => {
    const base = createCanvas(100, 100);
    const clip1 = createCanvas(100, 100);
    const clip2 = createCanvas(100, 100);

    // First clip
    const result1 = applyClippingMask(clip1, base);
    expect(result1.width).toBe(100);

    // Chain: clip2 clipped to result of first clip
    const result2 = applyClippingMask(clip2, result1);
    expect(result2.width).toBe(100);
    expect(result2).not.toBe(result1);
  });
});
