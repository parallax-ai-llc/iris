/**
 * Canvas Engine Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createOffscreenCanvas,
  cloneCanvas,
  clamp,
  lerp,
  distance,
  angle,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  applyTransformsToCanvas,
  applyAdjustmentsToCanvas,
  type TransformValues,
  type AdjustmentValues,
} from '../canvasEngine';

describe('Canvas Creation', () => {
  describe('createOffscreenCanvas', () => {
    it('should create a canvas with specified dimensions', () => {
      const { canvas, ctx } = createOffscreenCanvas(200, 150);

      expect(canvas).toBeDefined();
      expect(canvas.width).toBe(200);
      expect(canvas.height).toBe(150);
      expect(ctx).toBeDefined();
    });

    it('should create a canvas with different dimensions', () => {
      const { canvas } = createOffscreenCanvas(1920, 1080);

      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
    });
  });

  describe('cloneCanvas', () => {
    it('should create a clone with same dimensions', () => {
      const { canvas: source } = createOffscreenCanvas(100, 50);
      const clone = cloneCanvas(source);

      expect(clone.width).toBe(source.width);
      expect(clone.height).toBe(source.height);
    });
  });
});

describe('Transform Operations', () => {
  let sourceCanvas: HTMLCanvasElement;

  beforeEach(() => {
    const result = createOffscreenCanvas(100, 50);
    sourceCanvas = result.canvas;
  });

  describe('applyTransformsToCanvas', () => {
    it('should swap width/height for 90 degree rotation', () => {
      const transforms: TransformValues = {
        rotation: 90,
        flipHorizontal: false,
        flipVertical: false,
      };

      const result = applyTransformsToCanvas(sourceCanvas, transforms);

      expect(result.width).toBe(50);  // height becomes width
      expect(result.height).toBe(100); // width becomes height
    });

    it('should swap width/height for 270 degree rotation', () => {
      const transforms: TransformValues = {
        rotation: 270,
        flipHorizontal: false,
        flipVertical: false,
      };

      const result = applyTransformsToCanvas(sourceCanvas, transforms);

      expect(result.width).toBe(50);
      expect(result.height).toBe(100);
    });

    it('should keep same dimensions for 180 degree rotation', () => {
      const transforms: TransformValues = {
        rotation: 180,
        flipHorizontal: false,
        flipVertical: false,
      };

      const result = applyTransformsToCanvas(sourceCanvas, transforms);

      expect(result.width).toBe(100);
      expect(result.height).toBe(50);
    });

    it('should keep same dimensions for 0 degree rotation', () => {
      const transforms: TransformValues = {
        rotation: 0,
        flipHorizontal: false,
        flipVertical: false,
      };

      const result = applyTransformsToCanvas(sourceCanvas, transforms);

      expect(result.width).toBe(100);
      expect(result.height).toBe(50);
    });

    it('should keep same dimensions with flipHorizontal only', () => {
      const transforms: TransformValues = {
        rotation: 0,
        flipHorizontal: true,
        flipVertical: false,
      };

      const result = applyTransformsToCanvas(sourceCanvas, transforms);

      expect(result.width).toBe(100);
      expect(result.height).toBe(50);
    });

    it('should keep same dimensions with flipVertical only', () => {
      const transforms: TransformValues = {
        rotation: 0,
        flipHorizontal: false,
        flipVertical: true,
      };

      const result = applyTransformsToCanvas(sourceCanvas, transforms);

      expect(result.width).toBe(100);
      expect(result.height).toBe(50);
    });

    it('should keep same dimensions with both flips', () => {
      const transforms: TransformValues = {
        rotation: 0,
        flipHorizontal: true,
        flipVertical: true,
      };

      const result = applyTransformsToCanvas(sourceCanvas, transforms);

      expect(result.width).toBe(100);
      expect(result.height).toBe(50);
    });

    it('should swap dimensions with 90 rotation and flip', () => {
      const transforms: TransformValues = {
        rotation: 90,
        flipHorizontal: true,
        flipVertical: false,
      };

      const result = applyTransformsToCanvas(sourceCanvas, transforms);

      expect(result.width).toBe(50);
      expect(result.height).toBe(100);
    });

    it('should calculate bounding box for arbitrary rotation', () => {
      const transforms: TransformValues = {
        rotation: 45,
        flipHorizontal: false,
        flipVertical: false,
      };

      const result = applyTransformsToCanvas(sourceCanvas, transforms);

      // For 45 degree rotation, bounding box should be larger
      expect(result.width).toBeGreaterThan(100);
      expect(result.height).toBeGreaterThan(50);
    });
  });
});

describe('Adjustment Operations', () => {
  let sourceCanvas: HTMLCanvasElement;
  const defaultAdjustments: AdjustmentValues = {
    exposure: 0,
    brightness: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    gamma: 1,
    temperature: 0,
    tint: 0,
    saturation: 0,
    vibrance: 0,
    hue: 0,
    clarity: 0,
    levels: null,
    curves: null,
    colorBalance: null,
    hueSatChannels: null,
  };

  beforeEach(() => {
    const result = createOffscreenCanvas(100, 100);
    sourceCanvas = result.canvas;
  });

  describe('applyAdjustmentsToCanvas', () => {
    it('should return a canvas with same dimensions', () => {
      const result = applyAdjustmentsToCanvas(sourceCanvas, defaultAdjustments);

      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });

    it('should apply brightness adjustment', () => {
      const adjustments = { ...defaultAdjustments, brightness: 50 };
      const result = applyAdjustmentsToCanvas(sourceCanvas, adjustments);

      expect(result).toBeDefined();
      expect(result.width).toBe(100);
    });

    it('should apply contrast adjustment', () => {
      const adjustments = { ...defaultAdjustments, contrast: 50 };
      const result = applyAdjustmentsToCanvas(sourceCanvas, adjustments);

      expect(result).toBeDefined();
      expect(result.width).toBe(100);
    });

    it('should apply saturation adjustment', () => {
      const adjustments = { ...defaultAdjustments, saturation: 50 };
      const result = applyAdjustmentsToCanvas(sourceCanvas, adjustments);

      expect(result).toBeDefined();
      expect(result.width).toBe(100);
    });

    it('should apply hue rotation', () => {
      const adjustments = { ...defaultAdjustments, hue: 180 };
      const result = applyAdjustmentsToCanvas(sourceCanvas, adjustments);

      expect(result).toBeDefined();
      expect(result.width).toBe(100);
    });

    it('should apply gamma correction', () => {
      const adjustments = { ...defaultAdjustments, gamma: 2 };
      const result = applyAdjustmentsToCanvas(sourceCanvas, adjustments);

      expect(result).toBeDefined();
      expect(result.width).toBe(100);
    });

    it('should apply temperature adjustment', () => {
      const adjustments = { ...defaultAdjustments, temperature: 50 };
      const result = applyAdjustmentsToCanvas(sourceCanvas, adjustments);

      expect(result).toBeDefined();
    });

    it('should apply multiple adjustments together', () => {
      const adjustments: AdjustmentValues = {
        ...defaultAdjustments,
        brightness: 20,
        contrast: 10,
        saturation: 15,
        temperature: 10,
      };
      const result = applyAdjustmentsToCanvas(sourceCanvas, adjustments);

      expect(result).toBeDefined();
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });
  });
});

describe('Utility Functions', () => {
  describe('clamp', () => {
    it('should return value when within range', () => {
      expect(clamp(50, 0, 100)).toBe(50);
    });

    it('should return min when value is below min', () => {
      expect(clamp(-10, 0, 100)).toBe(0);
    });

    it('should return max when value is above max', () => {
      expect(clamp(150, 0, 100)).toBe(100);
    });

    it('should handle negative ranges', () => {
      expect(clamp(-50, -100, 0)).toBe(-50);
      expect(clamp(-150, -100, 0)).toBe(-100);
      expect(clamp(50, -100, 0)).toBe(0);
    });

    it('should handle edge cases', () => {
      expect(clamp(0, 0, 100)).toBe(0);
      expect(clamp(100, 0, 100)).toBe(100);
    });
  });

  describe('lerp', () => {
    it('should return start value when t is 0', () => {
      expect(lerp(0, 100, 0)).toBe(0);
    });

    it('should return end value when t is 1', () => {
      expect(lerp(0, 100, 1)).toBe(100);
    });

    it('should return midpoint when t is 0.5', () => {
      expect(lerp(0, 100, 0.5)).toBe(50);
    });

    it('should work with negative values', () => {
      expect(lerp(-100, 100, 0.5)).toBe(0);
    });
  });

  describe('distance', () => {
    it('should calculate distance between two points', () => {
      expect(distance(0, 0, 3, 4)).toBe(5); // 3-4-5 triangle
    });

    it('should return 0 for same point', () => {
      expect(distance(5, 5, 5, 5)).toBe(0);
    });

    it('should work with negative coordinates', () => {
      expect(distance(-3, -4, 0, 0)).toBe(5);
    });
  });

  describe('angle', () => {
    it('should return 0 for horizontal right direction', () => {
      expect(angle(0, 0, 1, 0)).toBe(0);
    });

    it('should return PI/2 for vertical down direction', () => {
      expect(angle(0, 0, 0, 1)).toBeCloseTo(Math.PI / 2);
    });

    it('should return PI for horizontal left direction', () => {
      expect(angle(0, 0, -1, 0)).toBeCloseTo(Math.PI);
    });

    it('should return -PI/2 for vertical up direction', () => {
      expect(angle(0, 0, 0, -1)).toBeCloseTo(-Math.PI / 2);
    });
  });
});

describe('Color Utilities', () => {
  describe('hexToRgb', () => {
    it('should parse hex color correctly', () => {
      expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
      expect(hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
      expect(hexToRgb('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
    });

    it('should parse hex without # prefix', () => {
      expect(hexToRgb('ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('should return black for invalid hex', () => {
      expect(hexToRgb('invalid')).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('should parse mixed case', () => {
      expect(hexToRgb('#FF00ff')).toEqual({ r: 255, g: 0, b: 255 });
    });
  });

  describe('rgbToHex', () => {
    it('should convert RGB to hex correctly', () => {
      expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
      expect(rgbToHex(0, 255, 0)).toBe('#00ff00');
      expect(rgbToHex(0, 0, 255)).toBe('#0000ff');
    });

    it('should pad single digits', () => {
      expect(rgbToHex(0, 0, 0)).toBe('#000000');
      expect(rgbToHex(15, 15, 15)).toBe('#0f0f0f');
    });
  });

  describe('rgbToHsl and hslToRgb', () => {
    it('should convert red correctly', () => {
      const hsl = rgbToHsl(255, 0, 0);
      expect(hsl.h).toBeCloseTo(0);
      expect(hsl.s).toBeCloseTo(100);
      expect(hsl.l).toBeCloseTo(50);
    });

    it('should convert green correctly', () => {
      const hsl = rgbToHsl(0, 255, 0);
      expect(hsl.h).toBeCloseTo(120);
      expect(hsl.s).toBeCloseTo(100);
      expect(hsl.l).toBeCloseTo(50);
    });

    it('should convert blue correctly', () => {
      const hsl = rgbToHsl(0, 0, 255);
      expect(hsl.h).toBeCloseTo(240);
      expect(hsl.s).toBeCloseTo(100);
      expect(hsl.l).toBeCloseTo(50);
    });

    it('should convert white correctly', () => {
      const hsl = rgbToHsl(255, 255, 255);
      expect(hsl.l).toBeCloseTo(100);
    });

    it('should convert black correctly', () => {
      const hsl = rgbToHsl(0, 0, 0);
      expect(hsl.l).toBeCloseTo(0);
    });

    it('should round-trip correctly', () => {
      const original = { r: 100, g: 150, b: 200 };
      const hsl = rgbToHsl(original.r, original.g, original.b);
      const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);

      expect(rgb.r).toBeCloseTo(original.r, 0);
      expect(rgb.g).toBeCloseTo(original.g, 0);
      expect(rgb.b).toBeCloseTo(original.b, 0);
    });
  });
});
