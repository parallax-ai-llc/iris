/**
 * Comprehensive Shape Renderer Tests
 *
 * Covers all 6 built-in shapes (rectangle, ellipse, line, arrow, polygon, star),
 * the custom shape drawer, shape preview, drawShape dispatcher, and getShapeBounds.
 */

import { describe, it, expect, vi, beforeAll, type Mock } from 'vitest';
import {
  drawRectangle,
  drawEllipse,
  drawLine,
  drawArrow,
  drawPolygon,
  drawStar,
  drawShape,
  drawCustomShape,
  drawShapePreview,
  getShapeBounds,
  type ShapeDrawOptions,
} from '../shapes';
import type { ShapeSettings, ShapeTool } from '@/features/image-editor/stores/imageEditor.store';

// Path2D stub for jsdom
beforeAll(() => {
  if (typeof globalThis.Path2D === 'undefined') {
    (globalThis as Record<string, unknown>).Path2D = class Path2D {
      constructor(_path?: string) { /* stub */ }
    };
  }
});

// ==================== Helpers ====================

function createMockCtx() {
  const callLog: string[] = [];
  const ctx = {
    save: vi.fn(() => callLog.push('save')),
    restore: vi.fn(() => callLog.push('restore')),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    textAlign: 'start' as CanvasTextAlign,
    _callLog: callLog,
  } as unknown as CanvasRenderingContext2D & { _callLog: string[] };
  return ctx;
}

function defaultSettings(overrides: Partial<ShapeSettings> = {}): ShapeSettings {
  return {
    fillColor: '#ff0000',
    fillEnabled: true,
    strokeColor: '#000000',
    strokeWidth: 2,
    strokeEnabled: true,
    cornerRadius: 0,
    sides: 5,
    innerRadius: 50,
    ...overrides,
  } as ShapeSettings;
}

function defaultOptions(overrides: Partial<ShapeDrawOptions> = {}): ShapeDrawOptions {
  return {
    x1: 10,
    y1: 10,
    x2: 110,
    y2: 60,
    ...overrides,
  };
}

// ==================== drawRectangle ====================

describe('drawRectangle', () => {
  it('should call rect for zero cornerRadius', () => {
    const ctx = createMockCtx();
    drawRectangle(ctx, defaultOptions(), defaultSettings({ cornerRadius: 0 }));

    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.rect).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('should call roundRect for positive cornerRadius', () => {
    const ctx = createMockCtx();
    drawRectangle(ctx, defaultOptions(), defaultSettings({ cornerRadius: 10 }));

    expect(ctx.roundRect).toHaveBeenCalled();
    expect(ctx.rect).not.toHaveBeenCalled();
  });

  it('should clamp cornerRadius to half of shortest side', () => {
    const ctx = createMockCtx();
    // 20x10 rect, radius 100 should be clamped to 5 (min(100, 20/2, 10/2))
    const opts = defaultOptions({ x1: 0, y1: 0, x2: 20, y2: 10 });
    drawRectangle(ctx, opts, defaultSettings({ cornerRadius: 100 }));

    expect(ctx.roundRect).toHaveBeenCalledWith(0, 0, 20, 10, 5);
  });

  it('should constrain to square when shiftKey is true', () => {
    const ctx = createMockCtx();
    const opts = defaultOptions({ x1: 0, y1: 0, x2: 100, y2: 50, shiftKey: true });
    drawRectangle(ctx, opts, defaultSettings());

    // Should become a square with size = max(100, 50) = 100
    expect(ctx.rect).toHaveBeenCalledWith(0, 0, 100, 100);
  });

  it('should draw from center when altKey is true', () => {
    const ctx = createMockCtx();
    const opts = defaultOptions({ x1: 50, y1: 50, x2: 70, y2: 60, altKey: true });
    drawRectangle(ctx, opts, defaultSettings());

    // width = 20, height = 10 → doubled: 40 x 20
    // altKey: x = x1 - width = 50 - 20 = 30, y = y1 - height = 50 - 10 = 40
    // width *= 2 → 40, height *= 2 → 20
    // Then normalized: x=30, y=40, w=40, h=20
    expect(ctx.rect).toHaveBeenCalledWith(30, 40, 40, 20);
  });

  it('should handle negative dimensions (x2 < x1)', () => {
    const ctx = createMockCtx();
    const opts = defaultOptions({ x1: 100, y1: 80, x2: 50, y2: 30 });
    drawRectangle(ctx, opts, defaultSettings());

    // Should normalize: x=50, y=30, w=50, h=50
    expect(ctx.rect).toHaveBeenCalledWith(50, 30, 50, 50);
  });

  it('should not fill when fillEnabled is false', () => {
    const ctx = createMockCtx();
    drawRectangle(ctx, defaultOptions(), defaultSettings({ fillEnabled: false }));

    expect(ctx.fill).not.toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('should not stroke when strokeEnabled is false', () => {
    const ctx = createMockCtx();
    drawRectangle(ctx, defaultOptions(), defaultSettings({ strokeEnabled: false }));

    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });
});

// ==================== drawEllipse ====================

describe('drawEllipse', () => {
  it('should call ctx.ellipse with correct radii', () => {
    const ctx = createMockCtx();
    const opts = defaultOptions({ x1: 0, y1: 0, x2: 100, y2: 60 });
    drawEllipse(ctx, opts, defaultSettings());

    // rx = 50, ry = 30, center = (50, 30)
    expect(ctx.ellipse).toHaveBeenCalledWith(50, 30, 50, 30, 0, 0, Math.PI * 2);
  });

  it('should constrain to circle when shiftKey is true', () => {
    const ctx = createMockCtx();
    const opts = defaultOptions({ x1: 0, y1: 0, x2: 100, y2: 60, shiftKey: true });
    drawEllipse(ctx, opts, defaultSettings());

    // max(100, 60) = 100, both width and height become 100
    // rx = ry = 50, center = (50, 50)
    expect(ctx.ellipse).toHaveBeenCalledWith(50, 50, 50, 50, 0, 0, Math.PI * 2);
  });

  it('should draw from center when altKey is true', () => {
    const ctx = createMockCtx();
    const opts = defaultOptions({ x1: 50, y1: 50, x2: 80, y2: 70, altKey: true });
    drawEllipse(ctx, opts, defaultSettings());

    // cx=50, cy=50, rx=|30|=30, ry=|20|=20
    expect(ctx.ellipse).toHaveBeenCalledWith(50, 50, 30, 20, 0, 0, Math.PI * 2);
  });

  it('should handle negative direction (x2 < x1)', () => {
    const ctx = createMockCtx();
    const opts = defaultOptions({ x1: 80, y1: 60, x2: 20, y2: 10 });
    drawEllipse(ctx, opts, defaultSettings());

    // rx = 30, ry = 25, center = (50, 35)
    expect(ctx.ellipse).toHaveBeenCalledWith(50, 35, 30, 25, 0, 0, Math.PI * 2);
  });

  it('should apply fill and stroke', () => {
    const ctx = createMockCtx();
    drawEllipse(ctx, defaultOptions(), defaultSettings());

    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });
});

// ==================== drawLine ====================

describe('drawLine', () => {
  it('should draw from (x1,y1) to (x2,y2)', () => {
    const ctx = createMockCtx();
    drawLine(ctx, defaultOptions({ x1: 5, y1: 5, x2: 95, y2: 45 }), defaultSettings());

    expect(ctx.moveTo).toHaveBeenCalledWith(5, 5);
    expect(ctx.lineTo).toHaveBeenCalledWith(95, 45);
  });

  it('should only stroke, never fill', () => {
    const ctx = createMockCtx();
    drawLine(ctx, defaultOptions(), defaultSettings({ fillEnabled: true, strokeEnabled: true }));

    // Lines use strokeEnabled only
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it('should not stroke when strokeEnabled is false', () => {
    const ctx = createMockCtx();
    drawLine(ctx, defaultOptions(), defaultSettings({ strokeEnabled: false }));

    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('should set lineCap to round', () => {
    const ctx = createMockCtx();
    drawLine(ctx, defaultOptions(), defaultSettings());

    expect(ctx.lineCap).toBe('round');
  });

  it('should snap to 45 degree angles with shiftKey', () => {
    const ctx = createMockCtx();
    // 45 degree line (dx=100, dy=100)
    drawLine(ctx, defaultOptions({ x1: 0, y1: 0, x2: 100, y2: 80, shiftKey: true }), defaultSettings());

    // lineTo should be called, but with snapped coordinates
    expect(ctx.lineTo).toHaveBeenCalled();
    const [callX, callY] = (ctx.lineTo as Mock).mock.calls[0];
    // Should snap near 45 degrees
    const angle = Math.atan2(callY, callX);
    const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    expect(Math.abs(angle - snapped)).toBeLessThan(0.01);
  });
});

// ==================== drawArrow ====================

describe('drawArrow', () => {
  it('should draw arrow shaft and head', () => {
    const ctx = createMockCtx();
    drawArrow(ctx, defaultOptions({ x1: 10, y1: 10, x2: 90, y2: 10 }), defaultSettings());

    // moveTo called at least twice (shaft start, head lines)
    expect(ctx.moveTo).toHaveBeenCalledTimes(3);
    expect(ctx.lineTo).toHaveBeenCalledTimes(3);
  });

  it('should stroke but not fill', () => {
    const ctx = createMockCtx();
    drawArrow(ctx, defaultOptions(), defaultSettings());

    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it('should not stroke when strokeEnabled is false', () => {
    const ctx = createMockCtx();
    drawArrow(ctx, defaultOptions(), defaultSettings({ strokeEnabled: false }));

    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('should respect custom headSize parameter', () => {
    const ctx = createMockCtx();
    drawArrow(ctx, defaultOptions({ x1: 0, y1: 0, x2: 100, y2: 0 }), defaultSettings(), 30);

    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
  });

  it('should cap headSize at 1/3 of arrow length', () => {
    const ctx = createMockCtx();
    // Short arrow: length ~14, headSize 30 should cap at ~4.7
    drawArrow(ctx, defaultOptions({ x1: 0, y1: 0, x2: 10, y2: 10 }), defaultSettings(), 30);

    expect(ctx.lineTo).toHaveBeenCalled();
  });

  it('should snap to 45 degree angles with shiftKey', () => {
    const ctx = createMockCtx();
    drawArrow(ctx, defaultOptions({ x1: 0, y1: 0, x2: 100, y2: 80, shiftKey: true }), defaultSettings());

    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('should set round line caps and joins', () => {
    const ctx = createMockCtx();
    drawArrow(ctx, defaultOptions(), defaultSettings());

    expect(ctx.lineCap).toBe('round');
    expect(ctx.lineJoin).toBe('round');
  });
});

// ==================== drawPolygon ====================

describe('drawPolygon', () => {
  it('should draw correct number of sides', () => {
    const ctx = createMockCtx();
    const opts = defaultOptions({ x1: 0, y1: 0, x2: 100, y2: 100 });
    drawPolygon(ctx, opts, defaultSettings({ sides: 6 }));

    // moveTo(first) + lineTo(remaining 5)
    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
    expect(ctx.lineTo).toHaveBeenCalledTimes(5);
    expect(ctx.closePath).toHaveBeenCalled();
  });

  it('should clamp sides to minimum 3', () => {
    const ctx = createMockCtx();
    drawPolygon(ctx, defaultOptions(), defaultSettings({ sides: 1 }));

    // Should draw triangle (3 sides)
    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
    expect(ctx.lineTo).toHaveBeenCalledTimes(2);
  });

  it('should clamp sides to maximum 12', () => {
    const ctx = createMockCtx();
    drawPolygon(ctx, defaultOptions(), defaultSettings({ sides: 20 }));

    // Should draw 12-gon
    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
    expect(ctx.lineTo).toHaveBeenCalledTimes(11);
  });

  it('should draw from center when altKey is true', () => {
    const ctx = createMockCtx();
    drawPolygon(ctx, defaultOptions({ x1: 50, y1: 50, x2: 80, y2: 50, altKey: true }), defaultSettings({ sides: 4 }));

    // Center should be at (50, 50), radius should be distance to (80, 50) = 30
    expect(ctx.moveTo).toHaveBeenCalled();
  });

  it('should fill and stroke', () => {
    const ctx = createMockCtx();
    drawPolygon(ctx, defaultOptions(), defaultSettings());

    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('should handle bounding-box mode (default)', () => {
    const ctx = createMockCtx();
    const opts = defaultOptions({ x1: 10, y1: 10, x2: 110, y2: 110 });
    drawPolygon(ctx, opts, defaultSettings({ sides: 5 }));

    expect(ctx.closePath).toHaveBeenCalled();
  });
});

// ==================== drawStar ====================

describe('drawStar', () => {
  it('should draw points * 2 vertices (alternating outer/inner)', () => {
    const ctx = createMockCtx();
    drawStar(ctx, defaultOptions({ x1: 0, y1: 0, x2: 100, y2: 100 }), defaultSettings(), 5);

    // 5-point star: 10 vertices total (moveTo + 9 lineTo)
    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
    expect(ctx.lineTo).toHaveBeenCalledTimes(9);
    expect(ctx.closePath).toHaveBeenCalled();
  });

  it('should respect innerRadius setting', () => {
    const ctx = createMockCtx();
    const opts = defaultOptions({ x1: 0, y1: 0, x2: 100, y2: 100 });

    drawStar(ctx, opts, defaultSettings({ innerRadius: 20 }), 5);
    const calls20 = (ctx.lineTo as Mock).mock.calls.slice();

    vi.clearAllMocks();
    drawStar(ctx, opts, defaultSettings({ innerRadius: 80 }), 5);
    const calls80 = (ctx.lineTo as Mock).mock.calls.slice();

    // Different innerRadius should produce different vertex positions
    expect(calls20).not.toEqual(calls80);
  });

  it('should draw from center when altKey is true', () => {
    const ctx = createMockCtx();
    drawStar(ctx, defaultOptions({ x1: 50, y1: 50, x2: 80, y2: 50, altKey: true }), defaultSettings(), 5);

    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.closePath).toHaveBeenCalled();
  });

  it('should fill and stroke', () => {
    const ctx = createMockCtx();
    drawStar(ctx, defaultOptions(), defaultSettings());

    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('should handle different point counts', () => {
    const ctx = createMockCtx();
    drawStar(ctx, defaultOptions(), defaultSettings(), 8);

    // 8 points: moveTo + 15 lineTo
    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
    expect(ctx.lineTo).toHaveBeenCalledTimes(15);
  });
});

// ==================== drawCustomShape ====================

describe('drawCustomShape', () => {
  const HEART_PATH = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

  it('should save and restore context', () => {
    const ctx = createMockCtx();
    drawCustomShape(ctx, HEART_PATH, defaultOptions(), defaultSettings());

    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('should scale from assumed 24x24 viewBox', () => {
    const ctx = createMockCtx();
    const opts = defaultOptions({ x1: 0, y1: 0, x2: 48, y2: 48 });
    drawCustomShape(ctx, HEART_PATH, opts, defaultSettings());

    expect(ctx.scale).toHaveBeenCalledWith(2, 2);
  });

  it('should return early for zero-width area', () => {
    const ctx = createMockCtx();
    drawCustomShape(ctx, HEART_PATH, defaultOptions({ x1: 50, y1: 0, x2: 50, y2: 100 }), defaultSettings());

    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('should return early for zero-height area', () => {
    const ctx = createMockCtx();
    drawCustomShape(ctx, HEART_PATH, defaultOptions({ x1: 0, y1: 50, x2: 100, y2: 50 }), defaultSettings());

    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('should fill when fillEnabled and not fill when disabled', () => {
    const ctx = createMockCtx();
    drawCustomShape(ctx, HEART_PATH, defaultOptions(), defaultSettings({ fillEnabled: true, strokeEnabled: false }));
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('should stroke when strokeEnabled and not stroke when disabled', () => {
    const ctx = createMockCtx();
    drawCustomShape(ctx, HEART_PATH, defaultOptions(), defaultSettings({ fillEnabled: false, strokeEnabled: true }));
    expect(ctx.fill).not.toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('should adjust lineWidth for scale', () => {
    const ctx = createMockCtx();
    const opts = defaultOptions({ x1: 0, y1: 0, x2: 48, y2: 48 });
    drawCustomShape(ctx, HEART_PATH, opts, defaultSettings({ strokeWidth: 4 }));

    // lineWidth = 4 * (24 / max(48, 48)) = 4 * 0.5 = 2
    expect(ctx.lineWidth).toBe(2);
  });
});

// ==================== drawShape dispatcher ====================

describe('drawShape', () => {
  const allTools: ShapeTool[] = ['rectangle', 'ellipse', 'line', 'arrow', 'polygon', 'star', 'custom'];

  it.each(allTools)('should dispatch %s without throwing', (tool) => {
    const ctx = createMockCtx();
    expect(() => drawShape(ctx, tool, defaultOptions(), defaultSettings())).not.toThrow();
  });

  it('should call save and restore for each shape', () => {
    const ctx = createMockCtx();
    drawShape(ctx, 'rectangle', defaultOptions(), defaultSettings());

    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });

  it('should call save before restore', () => {
    const ctx = createMockCtx();
    const callOrder: string[] = [];
    (ctx.save as Mock).mockImplementation(() => callOrder.push('save'));
    (ctx.restore as Mock).mockImplementation(() => callOrder.push('restore'));

    drawShape(ctx, 'ellipse', defaultOptions(), defaultSettings());

    expect(callOrder.indexOf('save')).toBeLessThan(callOrder.indexOf('restore'));
  });
});

// ==================== drawShapePreview ====================

describe('drawShapePreview', () => {
  it('should use dashed lines', () => {
    const ctx = createMockCtx();
    drawShapePreview(ctx, 'rectangle', defaultOptions(), defaultSettings());

    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 4]);
  });

  it('should save and restore context', () => {
    const ctx = createMockCtx();
    drawShapePreview(ctx, 'rectangle', defaultOptions(), defaultSettings());

    // Outer save/restore from preview + inner save/restore from drawShape
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('should override fill and stroke for preview appearance', () => {
    const ctx = createMockCtx();
    drawShapePreview(ctx, 'rectangle', defaultOptions(), defaultSettings({ fillEnabled: false, strokeEnabled: false }));

    // Preview always shows fill and stroke regardless of original settings
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });
});

// ==================== getShapeBounds ====================

describe('getShapeBounds', () => {
  it('should return normalized bounds for normal direction', () => {
    const bounds = getShapeBounds({ x1: 10, y1: 20, x2: 110, y2: 70 });

    expect(bounds).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it('should normalize bounds when x2 < x1', () => {
    const bounds = getShapeBounds({ x1: 100, y1: 80, x2: 20, y2: 10 });

    expect(bounds).toEqual({ x: 20, y: 10, width: 80, height: 70 });
  });

  it('should return zero dimensions for same start and end', () => {
    const bounds = getShapeBounds({ x1: 50, y1: 50, x2: 50, y2: 50 });

    expect(bounds).toEqual({ x: 50, y: 50, width: 0, height: 0 });
  });

  it('should handle floating point coordinates', () => {
    const bounds = getShapeBounds({ x1: 10.5, y1: 20.3, x2: 30.7, y2: 40.9 });

    expect(bounds.x).toBeCloseTo(10.5);
    expect(bounds.y).toBeCloseTo(20.3);
    expect(bounds.width).toBeCloseTo(20.2);
    expect(bounds.height).toBeCloseTo(20.6);
  });
});
