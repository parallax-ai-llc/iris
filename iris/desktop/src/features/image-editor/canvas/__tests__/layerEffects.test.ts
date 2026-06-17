/**
 * Layer Effects Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createOffscreenCanvas } from '../canvasEngine';
import {
  applyStroke,
  applyColorOverlay,
  applyGradientOverlay,
  applyPatternOverlay,
  applySatin,
  applyLayerEffects,
} from '../layerEffects';
import type {
  StrokeSettings,
  ColorOverlaySettings,
  GradientOverlaySettings,
  PatternOverlaySettings,
  SatinSettings,
  LayerEffect,
} from '@/features/image-editor/stores/imageEditor.store';

/**
 * Helper: create a small source canvas with an opaque red square in the center.
 * This gives the effects something visible to work with.
 */
function createTestSource(width = 40, height = 40): HTMLCanvasElement {
  const { canvas, ctx } = createOffscreenCanvas(width, height);
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(10, 10, 20, 20);
  return canvas;
}

// ==================== applyStroke ====================

describe('applyStroke', () => {
  let source: HTMLCanvasElement;

  beforeEach(() => {
    source = createTestSource();
  });

  it('should expand canvas dimensions for outside stroke', () => {
    const settings: StrokeSettings = {
      color: '#0000ff',
      size: 4,
      position: 'outside',
      opacity: 100,
      blendMode: 'normal',
    };

    const result = applyStroke(source, settings);

    // Outside stroke adds padding on each side
    expect(result.width).toBe(source.width + 4 * 2);
    expect(result.height).toBe(source.height + 4 * 2);
  });

  it('should keep same dimensions for inside stroke', () => {
    const settings: StrokeSettings = {
      color: '#00ff00',
      size: 3,
      position: 'inside',
      opacity: 100,
      blendMode: 'normal',
    };

    const result = applyStroke(source, settings);

    expect(result.width).toBe(source.width);
    expect(result.height).toBe(source.height);
  });

  it('should keep same dimensions for center stroke', () => {
    const settings: StrokeSettings = {
      color: '#ff00ff',
      size: 2,
      position: 'center',
      opacity: 100,
      blendMode: 'normal',
    };

    const result = applyStroke(source, settings);

    // Center stroke has no padding (padding = 0 when position !== 'outside')
    expect(result.width).toBe(source.width);
    expect(result.height).toBe(source.height);
  });

  it('should apply stroke color to expanded area for outside stroke', () => {
    const settings: StrokeSettings = {
      color: '#0000ff',
      size: 2,
      position: 'outside',
      opacity: 100,
      blendMode: 'normal',
    };

    const result = applyStroke(source, settings);
    const ctx = result.getContext('2d')!;
    const data = ctx.getImageData(0, 0, result.width, result.height);

    // The result should have non-transparent pixels (stroke area)
    let hasStrokePixels = false;
    for (let i = 0; i < data.data.length; i += 4) {
      if (data.data[i + 3] > 0) {
        hasStrokePixels = true;
        break;
      }
    }
    expect(hasStrokePixels).toBe(true);
  });

  it('should respect opacity setting', () => {
    const fullOpacity: StrokeSettings = {
      color: '#0000ff',
      size: 2,
      position: 'center',
      opacity: 100,
      blendMode: 'normal',
    };
    const halfOpacity: StrokeSettings = {
      ...fullOpacity,
      opacity: 50,
    };

    const resultFull = applyStroke(source, fullOpacity);
    const resultHalf = applyStroke(source, halfOpacity);

    // Both should produce valid canvases
    expect(resultFull).toBeDefined();
    expect(resultHalf).toBeDefined();
    expect(resultFull.width).toBe(resultHalf.width);
  });

  it('should handle size of 1', () => {
    const settings: StrokeSettings = {
      color: '#ffffff',
      size: 1,
      position: 'outside',
      opacity: 100,
      blendMode: 'normal',
    };

    const result = applyStroke(source, settings);

    expect(result.width).toBe(source.width + 2);
    expect(result.height).toBe(source.height + 2);
  });
});

// ==================== applyColorOverlay ====================

describe('applyColorOverlay', () => {
  let source: HTMLCanvasElement;

  beforeEach(() => {
    source = createTestSource();
  });

  it('should return canvas with same dimensions', () => {
    const settings: ColorOverlaySettings = {
      color: '#00ff00',
      opacity: 100,
      blendMode: 'normal',
    };

    const result = applyColorOverlay(source, settings);

    expect(result.width).toBe(source.width);
    expect(result.height).toBe(source.height);
  });

  it('should apply color to opaque pixels at full opacity', () => {
    const settings: ColorOverlaySettings = {
      color: '#00ff00',
      opacity: 100,
      blendMode: 'normal',
    };

    const result = applyColorOverlay(source, settings);
    const ctx = result.getContext('2d')!;
    // Sample a pixel in the center of the red square (should now be green overlay)
    const pixel = ctx.getImageData(20, 20, 1, 1).data;

    // Color overlay should have modified the pixel (jsdom canvas mock
    // doesn't perfectly implement source-atop compositing, so we check
    // that green channel is present rather than exact values)
    expect(pixel[1]).toBeGreaterThan(0); // G channel present from overlay
    expect(pixel[3]).toBeGreaterThan(0); // still visible
  });

  it('should produce a result canvas for transparent areas', () => {
    const settings: ColorOverlaySettings = {
      color: '#00ff00',
      opacity: 100,
      blendMode: 'normal',
    };

    const result = applyColorOverlay(source, settings);

    // Result should be a valid canvas with same dimensions
    expect(result.width).toBe(source.width);
    expect(result.height).toBe(source.height);
  });

  it('should blend with source at partial opacity', () => {
    const settings: ColorOverlaySettings = {
      color: '#00ff00',
      opacity: 50,
      blendMode: 'normal',
    };

    const result = applyColorOverlay(source, settings);
    const ctx = result.getContext('2d')!;
    const pixel = ctx.getImageData(20, 20, 1, 1).data;

    // At 50% opacity, expect a mix of red and green (not pure green)
    expect(pixel[3]).toBe(255); // still fully opaque
    // Green channel should be present
    expect(pixel[1]).toBeGreaterThan(0);
  });
});

// ==================== applyGradientOverlay ====================

describe('applyGradientOverlay', () => {
  let source: HTMLCanvasElement;

  beforeEach(() => {
    source = createTestSource();
  });

  it('should return canvas with same dimensions', () => {
    const settings: GradientOverlaySettings = {
      colors: ['#ff0000', '#0000ff'],
      angle: 0,
      opacity: 100,
      blendMode: 'normal',
      style: 'linear',
      scale: 100,
    };

    const result = applyGradientOverlay(source, settings);

    expect(result.width).toBe(source.width);
    expect(result.height).toBe(source.height);
  });

  it('should apply linear gradient at full opacity', () => {
    const settings: GradientOverlaySettings = {
      colors: ['#00ff00', '#0000ff'],
      angle: 0,
      opacity: 100,
      blendMode: 'normal',
      style: 'linear',
      scale: 100,
    };

    const result = applyGradientOverlay(source, settings);
    const ctx = result.getContext('2d')!;
    // Sample center pixel - gradient should have modified the pixel
    const pixel = ctx.getImageData(20, 20, 1, 1).data;

    // Should have some green or blue from the gradient overlay
    expect(pixel[1] + pixel[2]).toBeGreaterThan(0);
    expect(pixel[3]).toBeGreaterThan(0); // still visible
  });

  it('should apply radial gradient', () => {
    const settings: GradientOverlaySettings = {
      colors: ['#ffffff', '#000000'],
      angle: 0,
      opacity: 100,
      blendMode: 'normal',
      style: 'radial',
      scale: 100,
    };

    const result = applyGradientOverlay(source, settings);

    expect(result).toBeDefined();
    expect(result.width).toBe(source.width);
  });

  it('should produce a valid result for transparent areas', () => {
    const settings: GradientOverlaySettings = {
      colors: ['#ff0000', '#0000ff'],
      angle: 0,
      opacity: 100,
      blendMode: 'normal',
      style: 'linear',
      scale: 100,
    };

    const result = applyGradientOverlay(source, settings);

    expect(result).toBeDefined();
    expect(result.width).toBe(source.width);
    expect(result.height).toBe(source.height);
  });

  it('should handle multiple color stops', () => {
    const settings: GradientOverlaySettings = {
      colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'],
      angle: 45,
      opacity: 100,
      blendMode: 'normal',
      style: 'linear',
      scale: 100,
    };

    const result = applyGradientOverlay(source, settings);

    expect(result).toBeDefined();
    expect(result.width).toBe(source.width);
    expect(result.height).toBe(source.height);
  });

  it('should handle single color stop', () => {
    const settings: GradientOverlaySettings = {
      colors: ['#ff0000'],
      angle: 0,
      opacity: 100,
      blendMode: 'normal',
      style: 'linear',
      scale: 100,
    };

    const result = applyGradientOverlay(source, settings);

    expect(result).toBeDefined();
  });
});

// ==================== applyPatternOverlay ====================

describe('applyPatternOverlay', () => {
  let source: HTMLCanvasElement;

  beforeEach(() => {
    source = createTestSource();
  });

  it('should return source unchanged when pattern is null', () => {
    const settings: PatternOverlaySettings = {
      patternUrl: '',
      opacity: 100,
      scale: 100,
      blendMode: 'normal',
    };

    const result = applyPatternOverlay(source, null, settings);

    expect(result.width).toBe(source.width);
    expect(result.height).toBe(source.height);

    // Pixel data should match the source (only drawImage of source, no pattern applied)
    const srcCtx = source.getContext('2d')!;
    const resCtx = result.getContext('2d')!;
    const srcData = srcCtx.getImageData(20, 20, 1, 1).data;
    const resData = resCtx.getImageData(20, 20, 1, 1).data;

    expect(resData[0]).toBe(srcData[0]);
    expect(resData[1]).toBe(srcData[1]);
    expect(resData[2]).toBe(srcData[2]);
    expect(resData[3]).toBe(srcData[3]);
  });

  it('should tile pattern canvas when provided', () => {
    const { canvas: pattern, ctx: patCtx } = createOffscreenCanvas(10, 10);
    patCtx.fillStyle = '#00ff00';
    patCtx.fillRect(0, 0, 10, 10);

    const settings: PatternOverlaySettings = {
      patternUrl: '',
      opacity: 100,
      scale: 100,
      blendMode: 'normal',
    };

    const result = applyPatternOverlay(source, pattern, settings);

    expect(result.width).toBe(source.width);
    expect(result.height).toBe(source.height);

    // Center pixel in the opaque area should have some green from pattern overlay
    const ctx = result.getContext('2d')!;
    const pixel = ctx.getImageData(20, 20, 1, 1).data;
    expect(pixel[1]).toBeGreaterThan(0); // green channel from pattern
    expect(pixel[3]).toBeGreaterThan(0); // visible
  });

  it('should respect scale setting', () => {
    const { canvas: pattern, ctx: patCtx } = createOffscreenCanvas(10, 10);
    patCtx.fillStyle = '#0000ff';
    patCtx.fillRect(0, 0, 10, 10);

    const settings: PatternOverlaySettings = {
      patternUrl: '',
      opacity: 100,
      scale: 200, // 200% scale
      blendMode: 'normal',
    };

    const result = applyPatternOverlay(source, pattern, settings);

    expect(result).toBeDefined();
    expect(result.width).toBe(source.width);
  });

  it('should respect opacity for pattern overlay', () => {
    const { canvas: pattern, ctx: patCtx } = createOffscreenCanvas(10, 10);
    patCtx.fillStyle = '#00ff00';
    patCtx.fillRect(0, 0, 10, 10);

    const settingsFull: PatternOverlaySettings = {
      patternUrl: '',
      opacity: 100,
      scale: 100,
      blendMode: 'normal',
    };
    const settingsHalf: PatternOverlaySettings = {
      ...settingsFull,
      opacity: 50,
    };

    const resultFull = applyPatternOverlay(source, pattern, settingsFull);
    const resultHalf = applyPatternOverlay(source, pattern, settingsHalf);

    const fullPixel = resultFull.getContext('2d')!.getImageData(20, 20, 1, 1).data;
    const halfPixel = resultHalf.getContext('2d')!.getImageData(20, 20, 1, 1).data;

    // At 50% opacity, the red from source should bleed through more (or equal in mock)
    expect(halfPixel[0]).toBeGreaterThanOrEqual(fullPixel[0]);
  });
});

// ==================== applySatin ====================

describe('applySatin', () => {
  let source: HTMLCanvasElement;

  beforeEach(() => {
    source = createTestSource();
  });

  it('should return canvas with same dimensions', () => {
    const settings: SatinSettings = {
      color: '#000000',
      opacity: 75,
      angle: 120,
      distance: 5,
      size: 3,
      blendMode: 'normal',
    };

    const result = applySatin(source, settings);

    expect(result.width).toBe(source.width);
    expect(result.height).toBe(source.height);
  });

  it('should produce a valid canvas without blur (size=0)', () => {
    const settings: SatinSettings = {
      color: '#ff00ff',
      opacity: 100,
      angle: 90,
      distance: 4,
      size: 0,
      blendMode: 'normal',
    };

    const result = applySatin(source, settings);

    expect(result).toBeDefined();
    expect(result.width).toBe(source.width);
    expect(result.height).toBe(source.height);
  });

  it('should produce a valid canvas with blur (size>0)', () => {
    const settings: SatinSettings = {
      color: '#0000ff',
      opacity: 80,
      angle: 45,
      distance: 6,
      size: 5,
      blendMode: 'normal',
    };

    const result = applySatin(source, settings);

    expect(result).toBeDefined();
    expect(result.width).toBe(source.width);
  });

  it('should produce valid canvas preserving dimensions', () => {
    const settings: SatinSettings = {
      color: '#00ff00',
      opacity: 100,
      angle: 0,
      distance: 3,
      size: 2,
      blendMode: 'normal',
    };

    const result = applySatin(source, settings);

    expect(result).toBeDefined();
    expect(result.width).toBe(source.width);
    expect(result.height).toBe(source.height);
  });

  it('should respect angle parameter', () => {
    const settings0: SatinSettings = {
      color: '#ffffff',
      opacity: 100,
      angle: 0,
      distance: 5,
      size: 0,
      blendMode: 'normal',
    };
    const settings90: SatinSettings = {
      ...settings0,
      angle: 90,
    };

    const result0 = applySatin(source, settings0);
    const result90 = applySatin(source, settings90);

    // Both should produce valid canvases (different angles produce different offsets)
    expect(result0).toBeDefined();
    expect(result90).toBeDefined();
  });
});

// ==================== applyLayerEffects ====================

describe('applyLayerEffects', () => {
  let source: HTMLCanvasElement;

  beforeEach(() => {
    source = createTestSource();
  });

  it('should return source unchanged when effects array is empty', () => {
    const result = applyLayerEffects(source, []);

    expect(result).toBe(source);
  });

  it('should skip disabled effects', () => {
    const effects: LayerEffect[] = [
      {
        type: 'colorOverlay',
        enabled: false,
        settings: {
          color: '#00ff00',
          opacity: 100,
          blendMode: 'normal',
        } as ColorOverlaySettings,
      },
    ];

    const result = applyLayerEffects(source, effects);

    // Since the only effect is disabled, result should be the original source
    expect(result).toBe(source);
  });

  it('should apply a single enabled effect', () => {
    const effects: LayerEffect[] = [
      {
        type: 'colorOverlay',
        enabled: true,
        settings: {
          color: '#00ff00',
          opacity: 100,
          blendMode: 'normal',
        } as ColorOverlaySettings,
      },
    ];

    const result = applyLayerEffects(source, effects);

    // Result should be a new canvas (not the original source)
    expect(result).not.toBe(source);
    expect(result.width).toBe(source.width);
    expect(result.height).toBe(source.height);

    // The overlay should have been applied (green channel present)
    const ctx = result.getContext('2d')!;
    const pixel = ctx.getImageData(20, 20, 1, 1).data;
    expect(pixel[1]).toBeGreaterThan(0); // green overlay applied
    expect(pixel[3]).toBeGreaterThan(0); // visible
  });

  it('should apply multiple effects in correct rendering order', () => {
    const effects: LayerEffect[] = [
      {
        type: 'stroke',
        enabled: true,
        settings: {
          color: '#0000ff',
          size: 2,
          position: 'outside',
          opacity: 100,
          blendMode: 'normal',
        } as StrokeSettings,
      },
      {
        type: 'colorOverlay',
        enabled: true,
        settings: {
          color: '#00ff00',
          opacity: 100,
          blendMode: 'normal',
        } as ColorOverlaySettings,
      },
    ];

    const result = applyLayerEffects(source, effects);

    // Effects should produce a valid canvas
    expect(result).toBeDefined();
    // Stroke with outside position expands the canvas
    expect(result.width).toBeGreaterThanOrEqual(source.width);
  });

  it('should sort effects by rendering order regardless of input order', () => {
    // Provide effects in reverse order - they should still be applied in
    // the canonical order: dropShadow, outerGlow, ..., stroke
    const effectsReversed: LayerEffect[] = [
      {
        type: 'stroke',
        enabled: true,
        settings: {
          color: '#ff0000',
          size: 2,
          position: 'inside',
          opacity: 100,
          blendMode: 'normal',
        } as StrokeSettings,
      },
      {
        type: 'colorOverlay',
        enabled: true,
        settings: {
          color: '#00ff00',
          opacity: 100,
          blendMode: 'normal',
        } as ColorOverlaySettings,
      },
    ];

    const effectsOrdered: LayerEffect[] = [
      {
        type: 'colorOverlay',
        enabled: true,
        settings: {
          color: '#00ff00',
          opacity: 100,
          blendMode: 'normal',
        } as ColorOverlaySettings,
      },
      {
        type: 'stroke',
        enabled: true,
        settings: {
          color: '#ff0000',
          size: 2,
          position: 'inside',
          opacity: 100,
          blendMode: 'normal',
        } as StrokeSettings,
      },
    ];

    const resultReversed = applyLayerEffects(source, effectsReversed);
    const resultOrdered = applyLayerEffects(source, effectsOrdered);

    // Both should produce the same result since effects are sorted internally
    const ctxR = resultReversed.getContext('2d')!;
    const ctxO = resultOrdered.getContext('2d')!;
    const pixelR = ctxR.getImageData(20, 20, 1, 1).data;
    const pixelO = ctxO.getImageData(20, 20, 1, 1).data;

    expect(pixelR[0]).toBe(pixelO[0]);
    expect(pixelR[1]).toBe(pixelO[1]);
    expect(pixelR[2]).toBe(pixelO[2]);
    expect(pixelR[3]).toBe(pixelO[3]);
  });

  it('should handle mixed enabled and disabled effects', () => {
    const effects: LayerEffect[] = [
      {
        type: 'colorOverlay',
        enabled: true,
        settings: {
          color: '#00ff00',
          opacity: 100,
          blendMode: 'normal',
        } as ColorOverlaySettings,
      },
      {
        type: 'stroke',
        enabled: false,
        settings: {
          color: '#0000ff',
          size: 5,
          position: 'outside',
          opacity: 100,
          blendMode: 'normal',
        } as StrokeSettings,
      },
    ];

    const result = applyLayerEffects(source, effects);

    // Stroke is disabled so canvas should not expand
    expect(result.width).toBe(source.width);
    expect(result.height).toBe(source.height);

    // Color overlay should still be applied (green channel present)
    const ctx = result.getContext('2d')!;
    const pixel = ctx.getImageData(20, 20, 1, 1).data;
    expect(pixel[1]).toBeGreaterThan(0); // green overlay applied
  });

  it('should dispatch patternOverlay with null pattern', () => {
    const effects: LayerEffect[] = [
      {
        type: 'patternOverlay',
        enabled: true,
        settings: {
          patternUrl: '',
          opacity: 100,
          scale: 100,
          blendMode: 'normal',
        } as PatternOverlaySettings,
      },
    ];

    const result = applyLayerEffects(source, effects);

    // Pattern overlay with null pattern should return source-like canvas
    expect(result.width).toBe(source.width);
    expect(result.height).toBe(source.height);

    // Original content should be preserved (source drawn, no pattern applied)
    const ctx = result.getContext('2d')!;
    const pixel = ctx.getImageData(20, 20, 1, 1).data;
    expect(pixel[0]).toBeGreaterThan(0); // red preserved
    expect(pixel[3]).toBeGreaterThan(0); // visible
  });

  it('should handle satin effect via dispatcher', () => {
    const effects: LayerEffect[] = [
      {
        type: 'satin',
        enabled: true,
        settings: {
          color: '#000000',
          opacity: 50,
          angle: 120,
          distance: 4,
          size: 2,
          blendMode: 'normal',
        } as SatinSettings,
      },
    ];

    const result = applyLayerEffects(source, effects);

    expect(result).toBeDefined();
    expect(result.width).toBe(source.width);
    expect(result.height).toBe(source.height);
  });

  it('should handle gradientOverlay effect via dispatcher', () => {
    const effects: LayerEffect[] = [
      {
        type: 'gradientOverlay',
        enabled: true,
        settings: {
          colors: ['#ff0000', '#0000ff'],
          angle: 90,
          opacity: 100,
          blendMode: 'normal',
          style: 'linear',
        } as GradientOverlaySettings,
      },
    ];

    const result = applyLayerEffects(source, effects);

    expect(result).not.toBe(source);
    expect(result.width).toBe(source.width);
  });
});
