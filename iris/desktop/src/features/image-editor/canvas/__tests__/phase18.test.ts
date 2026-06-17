/**
 * Phase 18: SVG Path, Arrange Documents, JPEG Artifacts, Skin Smoothing,
 *           Color Transfer, Depth Blur, Style Transfer, Auto-Align
 */
import { describe, it, expect } from 'vitest';
import {
  parseSvgPath,
  arrangeDocuments,
  removeJpegArtifacts,
  skinSmoothing,
  colorTransfer,
  depthBlur,
  styleTransfer,
  autoAlignOffset,
} from '../adjustments';

function createTestImage(w: number, h: number, fill?: number[]): ImageData {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = fill ? fill[0] : 128;
    d[i + 1] = fill ? fill[1] : 128;
    d[i + 2] = fill ? fill[2] : 128;
    d[i + 3] = fill ? (fill[3] ?? 255) : 255;
  }
  return new ImageData(d, w, h);
}

function immutabilityCheck(fn: (img: ImageData) => unknown, name: string) {
  it(`${name}: does not modify input`, () => {
    const img = createTestImage(10, 10);
    const copy = new Uint8ClampedArray(img.data);
    fn(img);
    expect(img.data).toEqual(copy);
  });
}

// ==================== SVG Path Parsing ====================

describe('Phase 18: SVG Path Parsing', () => {
  it('parses M and L commands', () => {
    const segments = parseSvgPath('M 10 20 L 30 40');
    expect(segments.length).toBe(2);
    expect(segments[0]).toEqual({ command: 'M', x: 10, y: 20 });
    expect(segments[1]).toEqual({ command: 'L', x: 30, y: 40 });
  });

  it('parses C command (cubic Bézier)', () => {
    const segments = parseSvgPath('C 10,20 30,40 50,60');
    expect(segments.length).toBe(1);
    expect(segments[0].command).toBe('C');
    expect(segments[0].x).toBe(50);
    expect(segments[0].cp1x).toBe(10);
  });

  it('parses Q command (quadratic)', () => {
    const segments = parseSvgPath('Q 10,20 30,40');
    expect(segments.length).toBe(1);
    expect(segments[0].command).toBe('Q');
    expect(segments[0].x).toBe(30);
    expect(segments[0].cp1x).toBe(10);
  });

  it('parses Z command', () => {
    const segments = parseSvgPath('M 0 0 L 10 10 Z');
    expect(segments.length).toBe(3);
    expect(segments[2].command).toBe('Z');
  });

  it('handles empty path', () => {
    expect(parseSvgPath('').length).toBe(0);
  });
});

// ==================== Arrange Documents ====================

describe('Phase 18: Arrange Documents', () => {
  it('tile-horizontal splits width evenly', () => {
    const arr = arrangeDocuments(3, 900, 600, 'tile-horizontal');
    expect(arr.length).toBe(3);
    expect(arr[0].width).toBe(300);
    expect(arr[0].height).toBe(600);
    expect(arr[1].x).toBe(300);
  });

  it('tile-vertical splits height evenly', () => {
    const arr = arrangeDocuments(2, 800, 600, 'tile-vertical');
    expect(arr.length).toBe(2);
    expect(arr[0].height).toBe(300);
    expect(arr[1].y).toBe(300);
  });

  it('grid creates near-square layout', () => {
    const arr = arrangeDocuments(4, 800, 800, 'grid');
    expect(arr.length).toBe(4);
    expect(arr[0].width).toBe(400); // 2x2 grid
    expect(arr[0].height).toBe(400);
  });

  it('returns empty for count 0', () => {
    expect(arrangeDocuments(0, 800, 600).length).toBe(0);
  });
});

// ==================== JPEG Artifacts Removal ====================

describe('Phase 18: JPEG Artifacts Removal', () => {
  immutabilityCheck((img) => removeJpegArtifacts(img, 50), 'removeJpegArtifacts');

  it('preserves dimensions', () => {
    const r = removeJpegArtifacts(createTestImage(20, 20), 50);
    expect(r.width).toBe(20);
    expect(r.height).toBe(20);
  });

  it('smooths block boundary pixels', () => {
    const img = createTestImage(16, 16, [128, 128, 128, 255]);
    // Add artifact at block boundary (x=8)
    for (let y = 0; y < 16; y++) {
      const idx = (y * 16 + 7) * 4;
      img.data[idx] = 200;
    }
    const r = removeJpegArtifacts(img, 80);
    // The artifact should be smoothed (closer to 128)
    expect(r.data[(5 * 16 + 7) * 4]).toBeLessThan(200);
  });
});

// ==================== Skin Smoothing ====================

describe('Phase 18: Skin Smoothing', () => {
  immutabilityCheck((img) => skinSmoothing(img, 50), 'skinSmoothing');

  it('preserves dimensions', () => {
    const r = skinSmoothing(createTestImage(20, 20), 50);
    expect(r.width).toBe(20);
    expect(r.height).toBe(20);
  });

  it('does not affect non-skin colors', () => {
    const img = createTestImage(10, 10, [0, 0, 255, 255]); // blue
    const r = skinSmoothing(img, 80);
    expect(r.data[0]).toBe(0); // unchanged
    expect(r.data[2]).toBe(255); // unchanged
  });
});

// ==================== Color Transfer ====================

describe('Phase 18: Color Transfer', () => {
  immutabilityCheck(
    (img) => colorTransfer(img, createTestImage(10, 10, [200, 50, 50, 255])),
    'colorTransfer'
  );

  it('shifts color towards reference', () => {
    const target = createTestImage(10, 10, [100, 100, 100, 255]);
    const ref = createTestImage(10, 10, [200, 50, 50, 255]);
    const r = colorTransfer(target, ref);
    // Red channel should increase (ref is redder)
    expect(r.data[0]).toBe(200); // with uniform images, mean matches exactly
  });

  it('preserves dimensions', () => {
    const r = colorTransfer(createTestImage(15, 15), createTestImage(10, 10));
    expect(r.width).toBe(15);
    expect(r.height).toBe(15);
  });
});

// ==================== Depth Blur ====================

describe('Phase 18: Depth Blur', () => {
  immutabilityCheck((img) => depthBlur(img, 3), 'depthBlur');

  it('preserves dimensions', () => {
    const r = depthBlur(createTestImage(20, 20), 3);
    expect(r.width).toBe(20);
    expect(r.height).toBe(20);
  });

  it('focus point pixels stay sharper', () => {
    // Create image with two regions: bright (lum ~1.0) and dark (lum ~0.0)
    const img = createTestImage(20, 20, [0, 0, 0, 255]);
    // Make top half bright
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 20; x++) {
        const i = (y * 20 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      }
    }
    const r = depthBlur(img, 3, 1.0); // focus on bright pixels
    // Bright pixel should be preserved (near 255)
    expect(r.data[0]).toBeGreaterThan(200);
  });
});

// ==================== Style Transfer ====================

describe('Phase 18: Style Transfer', () => {
  immutabilityCheck(
    (img) => styleTransfer(img, createTestImage(10, 10, [200, 100, 50, 255])),
    'styleTransfer'
  );

  it('preserves dimensions', () => {
    const r = styleTransfer(createTestImage(15, 15), createTestImage(10, 10));
    expect(r.width).toBe(15);
    expect(r.height).toBe(15);
  });

  it('histogram matches towards style', () => {
    const content = createTestImage(10, 10, [100, 100, 100, 255]);
    const style = createTestImage(10, 10, [200, 50, 150, 255]);
    const r = styleTransfer(content, style);
    // With uniform images, output should match style exactly
    expect(r.data[0]).toBe(200);
    expect(r.data[1]).toBe(50);
    expect(r.data[2]).toBe(150);
  });
});

// ==================== Auto-Align ====================

describe('Phase 18: Auto-Align Offset', () => {
  it('returns zero offset for identical non-uniform images', () => {
    const img = createTestImage(20, 20, [50, 50, 50, 255]);
    // Add a distinct feature
    for (let y = 5; y < 15; y++) {
      for (let x = 5; x < 15; x++) {
        const i = (y * 20 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 200;
      }
    }
    const { dx, dy } = autoAlignOffset(img, img, 5);
    expect(dx).toBe(0);
    expect(dy).toBe(0);
  });

  it('returns valid offset object', () => {
    const img1 = createTestImage(30, 30, [100, 100, 100, 255]);
    const img2 = createTestImage(30, 30, [120, 120, 120, 255]);
    const result = autoAlignOffset(img1, img2, 5);
    expect(typeof result.dx).toBe('number');
    expect(typeof result.dy).toBe('number');
  });
});
