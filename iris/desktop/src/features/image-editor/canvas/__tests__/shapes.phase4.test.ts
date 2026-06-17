/**
 * Phase 4: drawCustomShape Unit Tests
 * Tests the custom shape drawing function that renders SVG path data
 * scaled to fit a draw area.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { drawCustomShape } from '../shapes';
import type { ShapeDrawOptions } from '../shapes';
import type { ShapeSettings } from '@/features/image-editor/stores/imageEditor.store';

// Path2D is not available in the jsdom/happy-dom test environment.
// Provide a minimal stub so drawCustomShape can construct one.
beforeAll(() => {
  if (typeof globalThis.Path2D === 'undefined') {
    (globalThis as Record<string, unknown>).Path2D = class Path2D {
      constructor(_path?: string) {
        // stub
      }
    };
  }
});

// ==================== Helpers ====================

function createMockCtx() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
}

function createDefaultSettings(
  overrides: Partial<ShapeSettings> = {}
): ShapeSettings {
  return {
    fillEnabled: true,
    fillColor: '#ff0000',
    strokeEnabled: true,
    strokeColor: '#000000',
    strokeWidth: 2,
    cornerRadius: 0,
    sides: 5,
    innerRadius: 50,
    ...overrides,
  } as ShapeSettings;
}

function createDrawOptions(
  overrides: Partial<ShapeDrawOptions> = {}
): ShapeDrawOptions {
  return {
    x1: 10,
    y1: 10,
    x2: 110,
    y2: 110,
    ...overrides,
  };
}

const TRIANGLE_PATH = 'M12 2 L22 22 L2 22 Z';

// ==================== drawCustomShape ====================

describe('drawCustomShape', () => {
  it('draws an SVG path scaled to the draw area', () => {
    const ctx = createMockCtx();
    const options = createDrawOptions({ x1: 0, y1: 0, x2: 48, y2: 48 });
    const settings = createDefaultSettings();

    drawCustomShape(ctx, TRIANGLE_PATH, options, settings);

    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.translate).toHaveBeenCalledWith(0, 0);
    // 48 / 24 = 2
    expect(ctx.scale).toHaveBeenCalledWith(2, 2);
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('translates to the top-left corner when x2 < x1', () => {
    const ctx = createMockCtx();
    // x2 < x1 means Math.min picks x2 as origin
    const options = createDrawOptions({ x1: 100, y1: 0, x2: 0, y2: 48 });
    const settings = createDefaultSettings();

    drawCustomShape(ctx, TRIANGLE_PATH, options, settings);

    expect(ctx.translate).toHaveBeenCalledWith(0, 0);
    // width = abs(0 - 100) = 100, height = 48; scale = 100/24, 48/24
    expect(ctx.scale).toHaveBeenCalledWith(100 / 24, 48 / 24);
  });

  it('fills the path when fillEnabled is true', () => {
    const ctx = createMockCtx();
    const options = createDrawOptions();
    const settings = createDefaultSettings({ fillEnabled: true, strokeEnabled: false });

    drawCustomShape(ctx, TRIANGLE_PATH, options, settings);

    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(ctx.fillStyle).toBe('#ff0000');
  });

  it('does not fill the path when fillEnabled is false', () => {
    const ctx = createMockCtx();
    const options = createDrawOptions();
    const settings = createDefaultSettings({ fillEnabled: false, strokeEnabled: true });

    drawCustomShape(ctx, TRIANGLE_PATH, options, settings);

    expect(ctx.fill).not.toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('strokes the path when strokeEnabled is true', () => {
    const ctx = createMockCtx();
    const options = createDrawOptions({ x1: 0, y1: 0, x2: 48, y2: 48 });
    const settings = createDefaultSettings({
      fillEnabled: false,
      strokeEnabled: true,
      strokeColor: '#00ff00',
      strokeWidth: 4,
    });

    drawCustomShape(ctx, TRIANGLE_PATH, options, settings);

    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.strokeStyle).toBe('#00ff00');
    // lineWidth is adjusted: strokeWidth * (24 / max(width, height)) = 4 * (24 / 48) = 2
    expect(ctx.lineWidth).toBe(2);
  });

  it('does not stroke the path when strokeEnabled is false', () => {
    const ctx = createMockCtx();
    const options = createDrawOptions();
    const settings = createDefaultSettings({ fillEnabled: true, strokeEnabled: false });

    drawCustomShape(ctx, TRIANGLE_PATH, options, settings);

    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('does not throw and returns early for zero-width draw area', () => {
    const ctx = createMockCtx();
    const options = createDrawOptions({ x1: 50, y1: 10, x2: 50, y2: 100 });
    const settings = createDefaultSettings();

    expect(() => {
      drawCustomShape(ctx, TRIANGLE_PATH, options, settings);
    }).not.toThrow();

    // Should return early without calling save/restore
    expect(ctx.save).not.toHaveBeenCalled();
    expect(ctx.restore).not.toHaveBeenCalled();
  });

  it('does not throw and returns early for zero-height draw area', () => {
    const ctx = createMockCtx();
    const options = createDrawOptions({ x1: 10, y1: 50, x2: 100, y2: 50 });
    const settings = createDefaultSettings();

    expect(() => {
      drawCustomShape(ctx, TRIANGLE_PATH, options, settings);
    }).not.toThrow();

    expect(ctx.save).not.toHaveBeenCalled();
    expect(ctx.restore).not.toHaveBeenCalled();
  });

  it('always calls save before restore', () => {
    const ctx = createMockCtx();
    const callOrder: string[] = [];
    (ctx.save as ReturnType<typeof vi.fn>).mockImplementation(() => callOrder.push('save'));
    (ctx.restore as ReturnType<typeof vi.fn>).mockImplementation(() => callOrder.push('restore'));

    const options = createDrawOptions();
    const settings = createDefaultSettings();

    drawCustomShape(ctx, TRIANGLE_PATH, options, settings);

    const saveIdx = callOrder.indexOf('save');
    const restoreIdx = callOrder.indexOf('restore');
    expect(saveIdx).toBeLessThan(restoreIdx);
  });

  it('handles both fill and stroke simultaneously', () => {
    const ctx = createMockCtx();
    const options = createDrawOptions();
    const settings = createDefaultSettings({
      fillEnabled: true,
      strokeEnabled: true,
    });

    drawCustomShape(ctx, TRIANGLE_PATH, options, settings);

    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });
});
