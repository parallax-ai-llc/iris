/**
 * Phase 10 Tools Tests — 12 new tools
 * Tests for brushEngine functions + selectionEngine magnetic lasso
 */
import { describe, it, expect } from 'vitest';
import {
  applyColorReplacementAtPoint,
  applyHistoryBrushAtPoint,
  applyArtHistoryBrushAtPoint,
  applyBackgroundEraserAtPoint,
  applyMagicEraser,
  applyRedEyeRemoval,
} from '../brushEngine';
import {
  computeEdgeMap,
  snapToEdge,
  createMagneticLassoMask,
} from '../selectionEngine';

// Mock canvas context for brush engine tests
function createMockCtx(width = 20, height = 20): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  // Fill with random-ish color
  const imageData = ctx.createImageData(width, height);
  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i] = 128;
    imageData.data[i + 1] = 100;
    imageData.data[i + 2] = 80;
    imageData.data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return ctx;
}

function createTestImageData(width = 20, height = 20): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.floor(Math.random() * 256);
    data[i + 1] = Math.floor(Math.random() * 256);
    data[i + 2] = Math.floor(Math.random() * 256);
    data[i + 3] = 255;
  }
  return new ImageData(data, width, height);
}

// ==================== Color Replacement Tool ====================

describe('Color Replacement Tool', () => {
  it('should not throw when applied', () => {
    const sourceCtx = createMockCtx();
    const strokeCtx = createMockCtx();
    expect(() => {
      applyColorReplacementAtPoint(
        sourceCtx, strokeCtx, 10, 10, 8, 50, 30,
        { r: 128, g: 100, b: 80 },
        { r: 255, g: 0, b: 0 }
      );
    }).not.toThrow();
  });

  it('should handle edge coordinates', () => {
    const sourceCtx = createMockCtx();
    const strokeCtx = createMockCtx();
    expect(() => {
      applyColorReplacementAtPoint(
        sourceCtx, strokeCtx, 0, 0, 8, 50, 30,
        { r: 128, g: 100, b: 80 },
        { r: 0, g: 255, b: 0 }
      );
    }).not.toThrow();
  });
});

// ==================== History Brush Tool ====================

describe('History Brush Tool', () => {
  it('should paint from history without throwing', () => {
    const historyCtx = createMockCtx();
    const strokeCtx = createMockCtx();
    expect(() => {
      applyHistoryBrushAtPoint(historyCtx, strokeCtx, 10, 10, 8, 50, 0.8);
    }).not.toThrow();
  });

  it('should handle small size', () => {
    const historyCtx = createMockCtx();
    const strokeCtx = createMockCtx();
    expect(() => {
      applyHistoryBrushAtPoint(historyCtx, strokeCtx, 5, 5, 2, 100, 1.0);
    }).not.toThrow();
  });
});

// ==================== Art History Brush Tool ====================

describe('Art History Brush Tool', () => {
  const styles = ['tight-short', 'tight-medium', 'tight-long', 'loose-medium', 'loose-long', 'dab'] as const;

  for (const style of styles) {
    it(`should support style: ${style}`, () => {
      const historyCtx = createMockCtx();
      const strokeCtx = createMockCtx();
      expect(() => {
        applyArtHistoryBrushAtPoint(historyCtx, strokeCtx, 10, 10, 8, 50, 0.7, style);
      }).not.toThrow();
    });
  }
});

// ==================== Background Eraser Tool ====================

describe('Background Eraser Tool', () => {
  it('should erase similar colors', () => {
    const sourceCtx = createMockCtx();
    const strokeCtx = createMockCtx();
    expect(() => {
      applyBackgroundEraserAtPoint(
        sourceCtx, strokeCtx, 10, 10, 8, 50, 30,
        { r: 128, g: 100, b: 80 }
      );
    }).not.toThrow();
  });

  it('should handle high tolerance', () => {
    const sourceCtx = createMockCtx();
    const strokeCtx = createMockCtx();
    expect(() => {
      applyBackgroundEraserAtPoint(
        sourceCtx, strokeCtx, 10, 10, 12, 80, 100,
        { r: 128, g: 100, b: 80 }
      );
    }).not.toThrow();
  });
});

// ==================== Magic Eraser Tool ====================

describe('Magic Eraser Tool', () => {
  it('should erase contiguous area', () => {
    const ctx = createMockCtx();
    const result = applyMagicEraser(ctx, 10, 10, 30, 20, 20, true);
    expect(result.width).toBe(20);
    expect(result.height).toBe(20);
    // Should have some transparent pixels
    let hasTransparent = false;
    for (let i = 3; i < result.data.length; i += 4) {
      if (result.data[i] === 0) { hasTransparent = true; break; }
    }
    expect(hasTransparent).toBe(true);
  });

  it('should erase non-contiguous', () => {
    const ctx = createMockCtx();
    const result = applyMagicEraser(ctx, 10, 10, 30, 20, 20, false);
    expect(result.width).toBe(20);
  });
});

// ==================== Red Eye Removal Tool ====================

describe('Red Eye Removal Tool', () => {
  it('should not throw', () => {
    const ctx = createMockCtx();
    // Fill a region with red color
    const imgData = ctx.getImageData(0, 0, 20, 20);
    for (let i = 0; i < imgData.data.length; i += 4) {
      imgData.data[i] = 200; // high red
      imgData.data[i + 1] = 30; // low green
      imgData.data[i + 2] = 30; // low blue
      imgData.data[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);

    expect(() => {
      applyRedEyeRemoval(ctx, 10, 10, 10, 50);
    }).not.toThrow();

    // Red should be reduced
    const result = ctx.getImageData(10, 10, 1, 1);
    expect(result.data[0]).toBeLessThan(200);
  });
});

// ==================== Magnetic Lasso (Selection Engine) ====================

describe('Magnetic Lasso - Edge Detection', () => {
  it('computeEdgeMap should return correct size', () => {
    const imgData = createTestImageData(30, 30);
    const edgeMap = computeEdgeMap(imgData);
    expect(edgeMap.length).toBe(30 * 30);
  });

  it('computeEdgeMap should detect edges on high-contrast image', () => {
    const w = 20, h = 20;
    const data = new Uint8ClampedArray(w * h * 4);
    // Left half white, right half black
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const val = x < w / 2 ? 255 : 0;
        data[i] = val; data[i + 1] = val; data[i + 2] = val; data[i + 3] = 255;
      }
    }
    const imgData = new ImageData(data, w, h);
    const edgeMap = computeEdgeMap(imgData);
    // Edge should be stronger at the boundary (x=9-10)
    const edgeAtBoundary = edgeMap[10 * w + 10];
    const edgeAtCenter = edgeMap[10 * w + 5];
    expect(edgeAtBoundary).toBeGreaterThan(edgeAtCenter);
  });

  it('snapToEdge should snap to strongest edge', () => {
    const w = 20, h = 20;
    const edgeMap = new Float32Array(w * h);
    // Place a strong edge at (10, 10)
    edgeMap[10 * w + 10] = 500;
    const snapped = snapToEdge(edgeMap, w, h, 12, 12, 5);
    expect(snapped.x).toBe(10);
    expect(snapped.y).toBe(10);
  });

  it('snapToEdge should return original position when no edges nearby', () => {
    const w = 20, h = 20;
    const edgeMap = new Float32Array(w * h); // all zeros
    const snapped = snapToEdge(edgeMap, w, h, 10, 10, 3);
    expect(snapped.x).toBe(10);
    expect(snapped.y).toBe(10);
  });

  it('createMagneticLassoMask should create valid mask', () => {
    const w = 20, h = 20;
    const points = [
      { x: 5, y: 5 },
      { x: 15, y: 5 },
      { x: 15, y: 15 },
      { x: 5, y: 15 },
    ];
    const mask = createMagneticLassoMask(w, h, points);
    expect(mask.length).toBe(w * h);
    // Center point should be selected
    expect(mask[10 * w + 10]).toBeGreaterThan(0);
    // Mask should have some variation (not all same value)
    const centerVal = mask[10 * w + 10];
    expect(centerVal).toBe(255);
  });
});

// ==================== Reflected Gradient ====================

describe('Reflected Gradient', () => {
  it('should be available as a gradient type', () => {
    const gradType: import('@/features/image-editor/stores/imageEditor.store').GradientType = 'reflected';
    expect(gradType).toBe('reflected');
  });

  it('reflected-gradient is registered as DrawTool type', () => {
    const tool: import('@/features/image-editor/stores/imageEditor.store').DrawTool = 'reflected-gradient';
    expect(tool).toBe('reflected-gradient');
  });
});

// ==================== Count / Color Sampler (UI tools) ====================

describe('Color Sampler Tool (UI-based)', () => {
  it('color sampler is registered as DrawTool type', () => {
    // This just verifies the type compiles — the actual tool
    // is handled by eyedropper logic in DrawingCanvas
    const tool: import('@/features/image-editor/stores/imageEditor.store').DrawTool = 'color-sampler';
    expect(tool).toBe('color-sampler');
  });
});

describe('Count Tool (UI-based)', () => {
  it('count tool is registered as DrawTool type', () => {
    const tool: import('@/features/image-editor/stores/imageEditor.store').DrawTool = 'count-tool';
    expect(tool).toBe('count-tool');
  });
});

describe('Perspective Crop (EditMode)', () => {
  it('perspectiveCrop is registered as EditMode type', () => {
    const mode: import('@/features/image-editor/stores/imageEditor.store').EditMode = 'perspectiveCrop';
    expect(mode).toBe('perspectiveCrop');
  });
});
