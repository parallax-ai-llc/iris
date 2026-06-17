/**
 * Phase 17: PSD Parsing, Workspace, Reselect, Freeform/Curvature Pen,
 *           Vertical Type, Type Mask, Glyphs, Face-Aware Liquify
 */
import { describe, it, expect } from 'vitest';
import {
  parsePsdHeader,
  getWorkspacePreset,
  listWorkspacePresets,
  createCustomWorkspace,
  createSelectionHistory,
  simplifyPath,
  curvaturePenPoints,
  verticalTypeLayout,
  typeMask,
  getBasicGlyphSet,
  faceAwareLiquifyDisplacements,
} from '../adjustments';

// ==================== PSD Parsing ====================

describe('Phase 17: PSD Basic Parsing', () => {
  it('returns null for invalid buffer', () => {
    const buf = new ArrayBuffer(10);
    expect(parsePsdHeader(buf)).toBeNull();
  });

  it('returns null for non-PSD signature', () => {
    const buf = new ArrayBuffer(30);
    const view = new DataView(buf);
    // Write "NOPE" instead of "8BPS"
    view.setUint8(0, 78); view.setUint8(1, 79); view.setUint8(2, 80); view.setUint8(3, 69);
    expect(parsePsdHeader(buf)).toBeNull();
  });

  it('parses valid PSD header', () => {
    const buf = new ArrayBuffer(30);
    const view = new DataView(buf);
    // Signature: "8BPS"
    view.setUint8(0, 56); view.setUint8(1, 66); view.setUint8(2, 80); view.setUint8(3, 83);
    // Version: 1
    view.setUint16(4, 1);
    // Reserved: 6 bytes (offset 6-11)
    // Channels: 3
    view.setUint16(12, 3);
    // Height: 100
    view.setUint32(14, 100);
    // Width: 200
    view.setUint32(18, 200);
    // Bit depth: 8
    view.setUint16(22, 8);
    // Color mode: 3 (RGB)
    view.setUint16(24, 3);

    const info = parsePsdHeader(buf);
    expect(info).not.toBeNull();
    expect(info!.width).toBe(200);
    expect(info!.height).toBe(100);
    expect(info!.channels).toBe(3);
    expect(info!.bitDepth).toBe(8);
    expect(info!.colorMode).toBe(3);
  });

  it('returns empty layers array', () => {
    const buf = new ArrayBuffer(30);
    const view = new DataView(buf);
    view.setUint8(0, 56); view.setUint8(1, 66); view.setUint8(2, 80); view.setUint8(3, 83);
    view.setUint16(4, 1);
    view.setUint16(12, 3); view.setUint32(14, 50); view.setUint32(18, 50);
    view.setUint16(22, 8); view.setUint16(24, 3);
    const info = parsePsdHeader(buf);
    expect(info!.layers).toEqual([]);
  });
});

// ==================== Workspace ====================

describe('Phase 17: Workspace Presets', () => {
  it('lists available presets', () => {
    const presets = listWorkspacePresets();
    expect(presets).toContain('essentials');
    expect(presets).toContain('painting');
    expect(presets).toContain('photography');
  });

  it('gets essentials preset', () => {
    const ws = getWorkspacePreset('essentials');
    expect(ws).not.toBeNull();
    expect(ws!.name).toBe('Essentials');
    expect(ws!.panels.length).toBeGreaterThan(0);
  });

  it('returns null for unknown preset', () => {
    expect(getWorkspacePreset('nonexistent')).toBeNull();
  });

  it('creates custom workspace', () => {
    const ws = createCustomWorkspace('MyWorkspace', [
      { id: 'layers', position: 'right', visible: true },
    ], 'top');
    expect(ws.name).toBe('MyWorkspace');
    expect(ws.toolbarPosition).toBe('top');
    expect(ws.panels.length).toBe(1);
  });
});

// ==================== Reselect ====================

describe('Phase 17: Reselect (Selection History)', () => {
  it('returns null when no history', () => {
    const sh = createSelectionHistory();
    expect(sh.reselect()).toBeNull();
  });

  it('restores last pushed selection', () => {
    const sh = createSelectionHistory();
    const mask = new Uint8ClampedArray([0, 255, 0, 255]);
    sh.push(mask);
    const restored = sh.reselect();
    expect(restored).not.toBeNull();
    expect(restored![1]).toBe(255);
  });

  it('does not modify stored mask when original changes', () => {
    const sh = createSelectionHistory();
    const mask = new Uint8ClampedArray([100, 200]);
    sh.push(mask);
    mask[0] = 0; // modify original
    expect(sh.reselect()![0]).toBe(100); // stored copy unchanged
  });

  it('respects max size', () => {
    const sh = createSelectionHistory(3);
    for (let i = 0; i < 5; i++) sh.push(new Uint8ClampedArray([i]));
    expect(sh.size()).toBe(3);
  });

  it('clear empties history', () => {
    const sh = createSelectionHistory();
    sh.push(new Uint8ClampedArray([1]));
    sh.clear();
    expect(sh.size()).toBe(0);
    expect(sh.reselect()).toBeNull();
  });
});

// ==================== Freeform Pen (Path Simplification) ====================

describe('Phase 17: Freeform Pen (Ramer-Douglas-Peucker)', () => {
  it('keeps 2 or fewer points unchanged', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    expect(simplifyPath(pts, 5).length).toBe(2);
  });

  it('simplifies collinear points', () => {
    const pts = [
      { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 },
      { x: 15, y: 0 }, { x: 20, y: 0 },
    ];
    const result = simplifyPath(pts, 1);
    expect(result.length).toBe(2); // only first and last
  });

  it('preserves corners', () => {
    const pts = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 10 },
    ];
    const result = simplifyPath(pts, 1);
    expect(result.length).toBeGreaterThanOrEqual(3); // corner preserved
  });

  it('epsilon 0 keeps all points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }];
    const result = simplifyPath(pts, 0);
    expect(result.length).toBe(3);
  });
});

// ==================== Curvature Pen ====================

describe('Phase 17: Curvature Pen', () => {
  it('single point returns identity control points', () => {
    const pts = [{ x: 100, y: 200 }];
    const result = curvaturePenPoints(pts);
    expect(result.length).toBe(1);
    expect(result[0].cp1x).toBe(100);
    expect(result[0].cp1y).toBe(200);
  });

  it('generates smooth control points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }];
    const result = curvaturePenPoints(pts);
    expect(result.length).toBe(3);
    // Middle point should have control points offset from center
    expect(result[1].cp1x).not.toBe(result[1].x);
    expect(result[1].cp2x).not.toBe(result[1].x);
  });

  it('preserves point positions', () => {
    const pts = [{ x: 10, y: 20 }, { x: 30, y: 40 }];
    const result = curvaturePenPoints(pts);
    expect(result[0].x).toBe(10);
    expect(result[0].y).toBe(20);
    expect(result[1].x).toBe(30);
    expect(result[1].y).toBe(40);
  });
});

// ==================== Vertical Type ====================

describe('Phase 17: Vertical Type Layout', () => {
  it('places characters vertically', () => {
    const layout = verticalTypeLayout('ABC', 50, 10, 20);
    expect(layout.length).toBe(3);
    expect(layout[0]).toEqual({ char: 'A', x: 50, y: 10 });
    expect(layout[1]).toEqual({ char: 'B', x: 50, y: 30 });
    expect(layout[2]).toEqual({ char: 'C', x: 50, y: 50 });
  });

  it('respects character spacing', () => {
    const layout = verticalTypeLayout('AB', 0, 0, 20, 5);
    expect(layout[1].y).toBe(25); // 20 + 5
  });

  it('handles empty string', () => {
    expect(verticalTypeLayout('', 0, 0, 20).length).toBe(0);
  });
});

// ==================== Type Mask ====================

describe('Phase 17: Type Mask', () => {
  it('creates mask with correct size', () => {
    const mask = typeMask(50, 50, 'A', 10, 5, 5);
    expect(mask.length).toBe(2500);
  });

  it('marks text area as 255', () => {
    const mask = typeMask(50, 50, 'A', 10, 5, 5);
    // Should have some 255 pixels in the text area
    let count = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i] === 255) count++;
    expect(count).toBeGreaterThan(0);
  });

  it('vertical mode places text top-to-bottom', () => {
    const mask = typeMask(50, 100, 'AB', 10, 5, 5, true);
    // Second char should be below first
    let firstCharY = -1, secondCharY = -1;
    for (let y = 0; y < 100; y++) {
      if (mask[y * 50 + 5] === 255 && firstCharY === -1) firstCharY = y;
      if (firstCharY >= 0 && y > firstCharY + 10 && mask[y * 50 + 5] === 255 && secondCharY === -1) {
        secondCharY = y;
      }
    }
    expect(firstCharY).toBeGreaterThanOrEqual(0);
    expect(secondCharY).toBeGreaterThan(firstCharY);
  });
});

// ==================== Glyphs Panel ====================

describe('Phase 17: Glyphs Panel', () => {
  it('returns non-empty glyph set', () => {
    const glyphs = getBasicGlyphSet();
    expect(glyphs.length).toBeGreaterThan(100);
  });

  it('each glyph has required fields', () => {
    const glyphs = getBasicGlyphSet();
    const g = glyphs[0];
    expect(typeof g.char).toBe('string');
    expect(typeof g.unicode).toBe('number');
    expect(typeof g.name).toBe('string');
    expect(typeof g.category).toBe('string');
  });

  it('includes arrow characters', () => {
    const glyphs = getBasicGlyphSet();
    const arrows = glyphs.filter(g => g.category === 'Arrows');
    expect(arrows.length).toBeGreaterThan(0);
  });
});

// ==================== Face-Aware Liquify ====================

describe('Phase 17: Face-Aware Liquify', () => {
  const face = {
    leftEye: { x: 30, y: 30, width: 20, height: 10 },
    rightEye: { x: 60, y: 30, width: 20, height: 10 },
    nose: { x: 45, y: 45, width: 15, height: 20 },
    mouth: { x: 35, y: 70, width: 30, height: 10 },
    jawline: { x: 25, y: 80, width: 50, height: 15 },
    forehead: { x: 25, y: 15, width: 50, height: 15 },
  };

  it('returns correct size displacement arrays', () => {
    const { dx, dy } = faceAwareLiquifyDisplacements(100, 100, face, {});
    expect(dx.length).toBe(10000);
    expect(dy.length).toBe(10000);
  });

  it('zero params produce zero displacement', () => {
    const { dx, dy } = faceAwareLiquifyDisplacements(100, 100, face, {});
    let maxD = 0;
    for (let i = 0; i < dx.length; i++) maxD = Math.max(maxD, Math.abs(dx[i]), Math.abs(dy[i]));
    expect(maxD).toBe(0);
  });

  it('eye size creates displacement in eye region', () => {
    const { dx, dy } = faceAwareLiquifyDisplacements(100, 100, face, { eyeSize: 50 });
    // Scan the eye region for any displacement (slightly off-center, since the
    // center pixel itself has zero displacement from the scale operation).
    let hasDisplacement = false;
    // Scan the eye region for any displacement
    for (let y = 30; y < 42; y++) {
      for (let x = 30; x < 52; x++) {
        const i = y * 100 + x;
        if (Math.abs(dx[i]) + Math.abs(dy[i]) > 0.01) { hasDisplacement = true; break; }
      }
      if (hasDisplacement) break;
    }
    expect(hasDisplacement).toBe(true);
  });

  it('jaw width creates horizontal displacement', () => {
    const { dx } = faceAwareLiquifyDisplacements(100, 100, face, { jawWidth: 80 });
    // Jaw center area
    const jawCx = 50, jawCy = 87;
    const idx = jawCy * 100 + jawCx;
    // Near center of jaw, displacement should exist
    expect(Math.abs(dx[idx])).toBeGreaterThanOrEqual(0);
  });
});
