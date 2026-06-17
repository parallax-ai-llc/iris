/**
 * selectionEngine — refineEdge & mask loading functions
 *
 * Tests the edge-refinement pipeline (expand → smooth → contrast → feather)
 * and the two mask-loading helpers (alpha channel vs red channel).
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  refineEdge,
  loadMaskAsSelection,
  loadSelectionMask,
} from '../selectionEngine';
import { createOffscreenCanvas } from '@/features/image-editor/canvas/canvasEngine';
import {
  createCenterMask,
  countSelectedPixels,
  countSoftPixels,
} from '@/test-utils/imageEditorHelpers';

// Mock createOffscreenCanvas so we can control getImageData return values.
// vitest.setup.ts sets canvas.getContext per-instance (not on prototype),
// so vi.spyOn(HTMLCanvasElement.prototype, 'getContext') cannot intercept it.
vi.mock('@/features/image-editor/canvas/canvasEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/image-editor/canvas/canvasEngine')>();
  return { ...actual, createOffscreenCanvas: vi.fn() };
});

// ==================== refineEdge ====================

describe('refineEdge', () => {
  const W = 20;
  const H = 20;
  let baseMask: Uint8ClampedArray;

  beforeEach(() => {
    // 10×10 white square in center of 20×20 canvas
    baseMask = createCenterMask(W, H, 10);
  });

  it('S1: no-op when all params are 0', () => {
    const result = refineEdge(baseMask, W, H, { radius: 0, smoothing: 0, feather: 0, contrast: 0 });
    const origSelected = countSelectedPixels(baseMask);
    const resultSelected = countSelectedPixels(result);
    expect(resultSelected).toBe(origSelected);
  });

  it('S2: radius > 0 expands the selection (more selected pixels)', () => {
    const before = countSelectedPixels(baseMask);
    const result = refineEdge(baseMask, W, H, { radius: 2, smoothing: 0, feather: 0, contrast: 0 });
    const after = countSelectedPixels(result);
    expect(after).toBeGreaterThan(before);
  });

  it('S3: smoothing > 0 creates soft/intermediate pixels on boundary', () => {
    // Start with hard-edge mask (only 0 or 255)
    const hardSoftBefore = countSoftPixels(baseMask);
    expect(hardSoftBefore).toBe(0);

    const result = refineEdge(baseMask, W, H, { radius: 0, smoothing: 4, feather: 0, contrast: 0 });
    const softAfter = countSoftPixels(result);
    // Smoothing blurs edges creating values between 0 and 255
    expect(softAfter).toBeGreaterThan(0);
  });

  it('S4: contrast > 0 pushes values toward 0 or 255 (reduces soft pixels)', () => {
    // First add some soft pixels via smoothing
    const smoothed = refineEdge(baseMask, W, H, { radius: 0, smoothing: 4, feather: 0, contrast: 0 });
    const softBefore = countSoftPixels(smoothed);
    expect(softBefore).toBeGreaterThan(0);

    // Now apply contrast to push them to extremes
    const contrasted = refineEdge(smoothed, W, H, { radius: 0, smoothing: 0, feather: 0, contrast: 80 });
    const softAfter = countSoftPixels(contrasted);
    expect(softAfter).toBeLessThan(softBefore);
  });

  it('S5: feather > 0 creates gradient on edges (soft pixels)', () => {
    const result = refineEdge(baseMask, W, H, { radius: 0, smoothing: 0, feather: 2, contrast: 0 });
    const softAfter = countSoftPixels(result);
    expect(softAfter).toBeGreaterThan(0);
  });

  it('S6: combined options complete without error', () => {
    expect(() => {
      refineEdge(baseMask, W, H, { radius: 2, smoothing: 3, feather: 2, contrast: 50 });
    }).not.toThrow();
  });

  it('S6b: output is same size as input mask', () => {
    const result = refineEdge(baseMask, W, H, { radius: 3, smoothing: 2, feather: 1, contrast: 30 });
    expect(result.length).toBe(baseMask.length);
  });

  it('S6c: all pixels remain in valid range [0, 255]', () => {
    const result = refineEdge(baseMask, W, H, { radius: 2, smoothing: 4, feather: 3, contrast: 60 });
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeGreaterThanOrEqual(0);
      expect(result[i]).toBeLessThanOrEqual(255);
    }
  });
});

// ==================== loadMaskAsSelection (alpha channel) ====================

describe('loadMaskAsSelection', () => {
  const W = 4;
  const H = 4;

  function setupAlphaMock(alphaValue: number) {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      data[i * 4] = 100;            // R
      data[i * 4 + 1] = 100;        // G
      data[i * 4 + 2] = 100;        // B
      data[i * 4 + 3] = alphaValue; // A — this is what loadMaskAsSelection reads
    }
    (createOffscreenCanvas as Mock).mockReturnValue({
      canvas: {},
      ctx: {
        drawImage: vi.fn(),
        getImageData: vi.fn().mockReturnValue({ data, width: W, height: H }),
      },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('S7a: alpha=255 → mask value 255', async () => {
    setupAlphaMock(255);
    const mask = await loadMaskAsSelection('data:image/png;base64,test', W, H);
    expect(mask[0]).toBe(255);
    expect(mask.length).toBe(W * H);
  });

  it('S7b: alpha=0 → mask value 0', async () => {
    setupAlphaMock(0);
    const mask = await loadMaskAsSelection('data:image/png;base64,test', W, H);
    expect(mask[0]).toBe(0);
  });

  it('S7c: alpha=128 → mask value 128', async () => {
    setupAlphaMock(128);
    const mask = await loadMaskAsSelection('data:image/png;base64,test', W, H);
    expect(mask[0]).toBe(128);
  });
});

// ==================== loadSelectionMask (red channel) ====================

describe('loadSelectionMask', () => {
  const W = 4;
  const H = 4;

  function setupRedMock(redValue: number) {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      data[i * 4] = redValue; // R — this is what loadSelectionMask reads
      data[i * 4 + 1] = 50;  // G
      data[i * 4 + 2] = 50;  // B
      data[i * 4 + 3] = 200; // A (deliberately different to confirm R channel, not A)
    }
    (createOffscreenCanvas as Mock).mockReturnValue({
      canvas: {},
      ctx: {
        drawImage: vi.fn(),
        getImageData: vi.fn().mockReturnValue({ data, width: W, height: H }),
      },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('S8a: R=255 → mask value 255', async () => {
    setupRedMock(255);
    const mask = await loadSelectionMask('data:image/png;base64,test', W, H);
    expect(mask[0]).toBe(255);
    expect(mask.length).toBe(W * H);
  });

  it('S8b: R=0 → mask value 0', async () => {
    setupRedMock(0);
    const mask = await loadSelectionMask('data:image/png;base64,test', W, H);
    expect(mask[0]).toBe(0);
  });

  it('S8c: reads R channel, not alpha', async () => {
    // R=200, A=100 → mask should be 200 (R), not 100 (A)
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      data[i * 4] = 200;     // R
      data[i * 4 + 1] = 50;  // G
      data[i * 4 + 2] = 50;  // B
      data[i * 4 + 3] = 100; // A
    }
    (createOffscreenCanvas as Mock).mockReturnValue({
      canvas: {},
      ctx: {
        drawImage: vi.fn(),
        getImageData: vi.fn().mockReturnValue({ data, width: W, height: H }),
      },
    });

    const mask = await loadSelectionMask('data:image/png;base64,test', W, H);
    expect(mask[0]).toBe(200); // R channel, not A
  });
});
