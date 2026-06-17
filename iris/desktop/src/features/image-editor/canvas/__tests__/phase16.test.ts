/**
 * Phase 16: 16-bit Depth, HDR Merge, Photomerge, Guide Layout,
 *           Mode Change, PDF Presentation, Variables, Droplet,
 *           History Branch, Reselect, Bird's Eye View, Remove Tool
 */
import { describe, it, expect } from 'vitest';
import {
  toFloat32,
  fromFloat32,
  hdrMerge,
  photomerge,
  conditionalModeChange,
  pdfPresentation,
  substituteVariables,
  generateGuideLayout,
  birdsEyeView,
  generateRemovalMask,
  createDropletConfig,
  createHistoryBranch,
  buildHistoryTree,
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

// ==================== 16-bit Depth ====================

describe('Phase 16: 16-bit Depth Conversion', () => {
  it('toFloat32 converts to 0-1 range', () => {
    const img = createTestImage(2, 2, [0, 128, 255, 255]);
    const f = toFloat32(img);
    expect(f.data[0]).toBeCloseTo(0, 5);
    expect(f.data[1]).toBeCloseTo(128 / 255, 3);
    expect(f.data[2]).toBeCloseTo(1, 5);
  });

  it('fromFloat32 converts back to 0-255', () => {
    const f = { data: new Float32Array([0, 0.5, 1, 1]), width: 1, height: 1 };
    const img = fromFloat32(f);
    expect(img.data[0]).toBe(0);
    expect(img.data[1]).toBe(128);
    expect(img.data[2]).toBe(255);
  });

  it('round-trip preserves values', () => {
    const img = createTestImage(3, 3, [100, 150, 200, 255]);
    const result = fromFloat32(toFloat32(img));
    expect(result.data[0]).toBe(100);
    expect(result.data[1]).toBe(150);
    expect(result.data[2]).toBe(200);
  });

  it('clamps out-of-range float values', () => {
    const f = { data: new Float32Array([-0.5, 1.5, 0.5, 1]), width: 1, height: 1 };
    const img = fromFloat32(f);
    expect(img.data[0]).toBe(0);
    expect(img.data[1]).toBe(255);
    expect(img.data[2]).toBe(128);
  });
});

// ==================== HDR Merge ====================

describe('Phase 16: HDR Merge', () => {
  immutabilityCheck((img) => hdrMerge([img, createTestImage(10, 10, [200, 200, 200, 255])]), 'hdrMerge');

  it('single image returns copy', () => {
    const img = createTestImage(5, 5, [100, 150, 200, 255]);
    const r = hdrMerge([img]);
    expect(r.data[0]).toBe(100);
    expect(r.data[1]).toBe(150);
  });

  it('merges multiple exposures', () => {
    const dark = createTestImage(10, 10, [30, 30, 30, 255]);
    const mid = createTestImage(10, 10, [128, 128, 128, 255]);
    const bright = createTestImage(10, 10, [220, 220, 220, 255]);
    const r = hdrMerge([dark, mid, bright]);
    expect(r.width).toBe(10);
    expect(r.height).toBe(10);
    // Result should be somewhere between darkest and brightest
    expect(r.data[0]).toBeGreaterThan(20);
    expect(r.data[0]).toBeLessThan(240);
  });

  it('preserves dimensions', () => {
    const r = hdrMerge([createTestImage(20, 15), createTestImage(20, 15)]);
    expect(r.width).toBe(20);
    expect(r.height).toBe(15);
  });
});

// ==================== Photomerge ====================

describe('Phase 16: Photomerge', () => {
  it('single image returns copy', () => {
    const img = createTestImage(10, 10, [100, 100, 100, 255]);
    const r = photomerge([img]);
    expect(r.width).toBe(10);
    expect(r.data[0]).toBe(100);
  });

  it('horizontal stitch increases width', () => {
    const a = createTestImage(20, 10, [255, 0, 0, 255]);
    const b = createTestImage(20, 10, [0, 0, 255, 255]);
    const r = photomerge([a, b], 'horizontal', 5);
    expect(r.width).toBe(35); // 20 + 20 - 5
    expect(r.height).toBe(10);
  });

  it('vertical stitch increases height', () => {
    const a = createTestImage(10, 20, [255, 0, 0, 255]);
    const b = createTestImage(10, 20, [0, 255, 0, 255]);
    const r = photomerge([a, b], 'vertical', 5);
    expect(r.width).toBe(10);
    expect(r.height).toBe(35); // 20 + 20 - 5
  });

  it('overlap region is blended', () => {
    const a = createTestImage(20, 5, [200, 200, 200, 255]);
    const b = createTestImage(20, 5, [50, 50, 50, 255]);
    const r = photomerge([a, b], 'horizontal', 10);
    // Middle of overlap should be blended (not pure 200 or 50)
    const overlapMidX = 20 - 5; // midpoint of overlap
    const idx = (0 * r.width + overlapMidX) * 4;
    expect(r.data[idx]).toBeGreaterThan(40);
    expect(r.data[idx]).toBeLessThan(210);
  });
});

// ==================== Conditional Mode Change ====================

describe('Phase 16: Conditional Mode Change', () => {
  immutabilityCheck((img) => conditionalModeChange(img, 'grayscale'), 'conditionalModeChange');

  it('grayscale converts to gray', () => {
    const img = createTestImage(5, 5, [255, 0, 0, 255]);
    const r = conditionalModeChange(img, 'grayscale');
    // Red pixel: 0.299*255 = ~76
    expect(r.data[0]).toBe(r.data[1]);
    expect(r.data[1]).toBe(r.data[2]);
    expect(r.data[0]).toBeGreaterThan(70);
    expect(r.data[0]).toBeLessThan(80);
  });

  it('rgb returns copy unchanged', () => {
    const img = createTestImage(3, 3, [100, 150, 200, 255]);
    const r = conditionalModeChange(img, 'rgb');
    expect(r.data[0]).toBe(100);
    expect(r.data[1]).toBe(150);
    expect(r.data[2]).toBe(200);
  });

  it('bitmap produces only 0/255', () => {
    const img = createTestImage(5, 5, [128, 128, 128, 255]);
    const r = conditionalModeChange(img, 'bitmap');
    for (let i = 0; i < r.data.length; i += 4) {
      expect(r.data[i] === 0 || r.data[i] === 255).toBe(true);
    }
  });
});

// ==================== PDF Presentation ====================

describe('Phase 16: PDF Presentation', () => {
  it('creates correct dimensions for grid', () => {
    const imgs = [createTestImage(20, 20), createTestImage(20, 20), createTestImage(20, 20)];
    const r = pdfPresentation(imgs, 2, 50, 40, 10);
    // 2 cols * 50 + 1 gap * 10 = 110
    expect(r.width).toBe(110);
    // 2 rows * 40 + 1 gap * 10 = 90
    expect(r.height).toBe(90);
  });

  it('single image fills one slot', () => {
    const img = createTestImage(10, 10, [200, 100, 50, 255]);
    const r = pdfPresentation([img], 1, 20, 20, 0);
    expect(r.width).toBe(20);
    expect(r.height).toBe(20);
  });

  it('background is white by default', () => {
    const imgs = [createTestImage(5, 5, [0, 0, 0, 255])];
    const r = pdfPresentation(imgs, 2, 10, 10, 5);
    // Check a pixel outside the image slot (in the gap area)
    const gapX = 15; // after first slot (10) + gap start
    const idx = (0 * r.width + gapX) * 4;
    expect(r.data[idx]).toBe(255); // white bg
  });
});

// ==================== Variables & Data-Driven ====================

describe('Phase 16: Variables & Data-Driven', () => {
  it('substitutes single variable', () => {
    expect(substituteVariables('Hello %%name%%!', { name: 'World' })).toBe('Hello World!');
  });

  it('substitutes multiple variables', () => {
    const result = substituteVariables('%%first%% %%last%%', { first: 'John', last: 'Doe' });
    expect(result).toBe('John Doe');
  });

  it('preserves unknown variables', () => {
    expect(substituteVariables('%%known%% %%unknown%%', { known: 'Yes' })).toBe('Yes %%unknown%%');
  });

  it('handles empty template', () => {
    expect(substituteVariables('', { a: 'b' })).toBe('');
  });
});

// ==================== New Guide Layout ====================

describe('Phase 16: New Guide Layout', () => {
  it('generates correct number of vertical guides for columns', () => {
    const r = generateGuideLayout(1000, 500, {
      columns: 3, rows: 0, gutterWidth: 20, gutterHeight: 0,
      marginTop: 0, marginBottom: 0, marginLeft: 50, marginRight: 50,
    });
    // 3 columns: left margin, col1 end, gutter end, col2 end, gutter end, col3 end
    expect(r.vertical.length).toBeGreaterThanOrEqual(4);
    expect(r.vertical[0]).toBe(50); // left margin
  });

  it('generates horizontal guides for rows', () => {
    const r = generateGuideLayout(500, 1000, {
      columns: 0, rows: 2, gutterWidth: 0, gutterHeight: 10,
      marginTop: 20, marginBottom: 20, marginLeft: 0, marginRight: 0,
    });
    expect(r.horizontal.length).toBeGreaterThanOrEqual(3);
    expect(r.horizontal[0]).toBe(20); // top margin
  });

  it('no columns or rows returns empty arrays', () => {
    const r = generateGuideLayout(100, 100, {
      columns: 0, rows: 0, gutterWidth: 0, gutterHeight: 0,
      marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
    });
    expect(r.vertical.length).toBe(0);
    expect(r.horizontal.length).toBe(0);
  });
});

// ==================== Bird's Eye View ====================

describe('Phase 16: Bird\'s Eye View', () => {
  it('calculates minimap dimensions', () => {
    const r = birdsEyeView(1000, 500, 800, 600, 2, 0, 0, 200);
    expect(r.minimapHeight).toBe(100); // 500/1000 * 200
  });

  it('zoom 1 with no pan fills minimap', () => {
    const r = birdsEyeView(1000, 500, 1000, 500, 1, 0, 0, 200);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.width).toBe(200);
    expect(r.height).toBe(100);
  });

  it('zoom 2 reduces viewport rect', () => {
    const r = birdsEyeView(1000, 500, 1000, 500, 2, 0, 0, 200);
    expect(r.width).toBe(100); // half of minimap width
    expect(r.height).toBe(50);
  });
});

// ==================== Remove Tool ====================

describe('Phase 16: Remove Tool', () => {
  it('generates circular mask', () => {
    const mask = generateRemovalMask(20, 20, 10, 10, 5);
    expect(mask.length).toBe(400);
    // Center should be 255
    expect(mask[10 * 20 + 10]).toBe(255);
    // Far corner should be 0
    expect(mask[0]).toBe(0);
  });

  it('respects radius', () => {
    const mask = generateRemovalMask(20, 20, 10, 10, 3);
    let count = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i] > 0) count++;
    // Should have roughly pi*r^2 pixels (around 28)
    expect(count).toBeGreaterThan(15);
    expect(count).toBeLessThan(50);
  });

  it('edge of mask has soft falloff', () => {
    const mask = generateRemovalMask(30, 30, 15, 15, 10);
    // Pixel at 80% radius should be 255
    expect(mask[15 * 30 + 15]).toBe(255);
    // Very edge pixels should be < 255
    const edgeVal = mask[15 * 30 + 24]; // ~9px from center in x
    expect(edgeVal).toBeLessThan(255);
  });
});

// ==================== Droplet Config ====================

describe('Phase 16: Droplet Configuration', () => {
  it('creates config with defaults', () => {
    const config = createDropletConfig('my-droplet', 'Default Actions', 'Resize');
    expect(config.name).toBe('my-droplet');
    expect(config.destination).toBe('same');
    expect(config.errorHandling).toBe('stop');
  });

  it('allows overriding options', () => {
    const config = createDropletConfig('export', 'Export', 'Save PNG', {
      destination: 'folder',
      destinationFolder: '/output',
      fileNaming: 'serial',
      errorHandling: 'log',
    });
    expect(config.destination).toBe('folder');
    expect(config.destinationFolder).toBe('/output');
    expect(config.fileNaming).toBe('serial');
  });
});

// ==================== Non-linear History ====================

describe('Phase 16: Non-linear History', () => {
  it('creates branch node', () => {
    const b = createHistoryBranch('b1', null, 0, 'Initial');
    expect(b.id).toBe('b1');
    expect(b.parentId).toBeNull();
    expect(b.children).toEqual([]);
    expect(typeof b.timestamp).toBe('number');
  });

  it('builds tree with parent-child links', () => {
    const branches = [
      createHistoryBranch('root', null, 0, 'Start'),
      createHistoryBranch('a', 'root', 1, 'Branch A'),
      createHistoryBranch('b', 'root', 1, 'Branch B'),
      createHistoryBranch('c', 'a', 2, 'Sub-branch'),
    ];
    const tree = buildHistoryTree(branches);
    expect(tree.get('root')!.children).toContain('a');
    expect(tree.get('root')!.children).toContain('b');
    expect(tree.get('a')!.children).toContain('c');
    expect(tree.get('c')!.children.length).toBe(0);
  });

  it('handles empty array', () => {
    const tree = buildHistoryTree([]);
    expect(tree.size).toBe(0);
  });
});
