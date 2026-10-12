/**
 * Selection > Inverse: one rule for every consumer.
 *
 * `invertSelection()` bakes the inversion into `selection.maskDataUrl`, so the
 * mask is always the real selected area and there is no separate "inverted"
 * flag that could flip it a second time. These tests make a
 * rectangle selection, invert it, and check that the AI result layer mask,
 * Expand, the Content-Aware Fill input mask and the filter / adjustment /
 * Delete region all use the INVERTED area.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSourceAsset, setupImageEditorTestTab } from '@/test-utils/imageEditorHelpers';
import type { ImageEditorStoreApi } from '@/features/image-editor/stores/imageEditorFactory';
import { applyAIResultLayer, selectionToLayerMask } from '@/features/image-editor/lib/aiResultLayer';
import { selectionMaskForRect } from '@/features/image-editor/canvas/layerSurface';
import { selectionToInpaintMask } from '@/features/image-editor/canvas/selectionEngine';

const W = 10;
const H = 10;

// A fake PNG codec: maskToDataUrl stores the mask under a new data URL and
// loadSelectionMask returns it, so tests read back exact mask values.
const codec = new Map<string, { mask: Uint8ClampedArray; width: number; height: number }>();
let seq = 0;

function encode(mask: Uint8ClampedArray, width: number, height: number): string {
  const url = `data:image/png;base64,FAKE${++seq}`;
  codec.set(url, { mask: new Uint8ClampedArray(mask), width, height });
  return url;
}

function decode(url: string | undefined, width = W, height = H): Uint8ClampedArray {
  const entry = url ? codec.get(url) : undefined;
  if (!entry) throw new Error(`not a mask produced by maskToDataUrl: ${String(url).slice(0, 40)}`);
  if (entry.width !== width || entry.height !== height) {
    throw new Error(`mask is ${entry.width}x${entry.height}, read as ${width}x${height}`);
  }
  return new Uint8ClampedArray(entry.mask);
}

vi.mock('@/features/image-editor/canvas/selectionEngine', async () => {
  const actual = await vi.importActual<typeof import('@/features/image-editor/canvas/selectionEngine')>(
    '@/features/image-editor/canvas/selectionEngine',
  );
  return {
    ...actual,
    loadSelectionMask: vi.fn(async (url: string, w: number, h: number) => decode(url, w, h)),
    maskToDataUrl: vi.fn((mask: Uint8ClampedArray, w: number, h: number) => encode(mask, w, h)),
    // Internal calls inside the real module bypass the mocks above, so this
    // records its arguments and decodes / re-encodes the mask unchanged.
    selectionToInpaintMask: vi.fn(async (url: string, w: number, h: number) => encode(decode(url, w, h), w, h)),
  };
});

let inpaintMaskSent: string | null = null;
vi.mock('@/shared/api/image.api', async () => {
  const actual = await vi.importActual<typeof import('@/shared/api/image.api')>('@/shared/api/image.api');
  return {
    ...actual,
    contentAwareFill: vi.fn(async (_assetId: string, mask: string) => {
      inpaintMaskSent = mask;
      return null;
    }),
    waitForEditResult: vi.fn(async () => null),
  };
});

vi.mock('@/features/image-editor/lib/aiSource', () => ({
  resolveAIInputAssetId: vi.fn(async () => 'asset-input'),
}));

/** A 4x4 selected square at (3,3) on the 10x10 document. */
function squareMask(): Uint8ClampedArray {
  const m = new Uint8ClampedArray(W * H);
  for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) m[y * W + x] = 255;
  return m;
}

const selected = (m: Uint8ClampedArray) => m.reduce((n, v) => n + (v > 127 ? 1 : 0), 0);
const isInverseOfSquare = (m: Uint8ClampedArray) => {
  const sq = squareMask();
  return m.every((v, i) => v === 255 - sq[i]);
};

let store: ImageEditorStoreApi;

beforeEach(() => {
  codec.clear();
  inpaintMaskSent = null;
  vi.mocked(selectionToInpaintMask).mockClear();
  store = setupImageEditorTestTab();
  store.setState({
    canvasWidth: W,
    canvasHeight: H,
    sourceAsset: mockSourceAsset,
    activeLayerId: 'bg',
    layers: [
      { id: 'bg', name: 'bg', visible: true, locked: false, opacity: 100, blendMode: 'normal', imageData: 'data:bg', x: 0, y: 0, width: W, height: H },
    ],
    selection: { maskDataUrl: encode(squareMask(), W, H), bounds: { x: 3, y: 3, width: 4, height: 4 }, feather: 0 },
  });
});

async function invert() {
  await store.getState().invertSelection();
  const sel = store.getState().selection!;
  expect(isInverseOfSquare(decode(sel.maskDataUrl))).toBe(true);
  return sel;
}

describe('invertSelection', () => {
  it('bakes the inversion into the mask', async () => {
    const sel = await invert();
    expect(sel).not.toHaveProperty('isInverted');
    expect(sel.bounds).toEqual({ x: 0, y: 0, width: W, height: H });
  });

  it('inverting twice gives the original selection back', async () => {
    await invert();
    await store.getState().invertSelection();
    const sel = store.getState().selection!;
    expect(Array.from(decode(sel.maskDataUrl))).toEqual(Array.from(squareMask()));
    expect(sel.bounds).toEqual({ x: 3, y: 3, width: 4, height: 4 });
  });

  it('works at document size even when the bottom layer is smaller and moved', async () => {
    store.setState({
      layers: [
        { id: 'bg', name: 'bg', visible: true, locked: false, opacity: 100, blendMode: 'normal', imageData: 'data:bg', x: 2, y: 2, width: 4, height: 4 },
      ],
    });
    await invert();
  });
});

describe('consumers of an inverted selection use the inverted area', () => {
  it('AI result layer mask', async () => {
    await invert();
    const mask = await selectionToLayerMask(store.getState().selection!, W, H);
    expect(isInverseOfSquare(decode(mask))).toBe(true);

    const id = await applyAIResultLayer(
      store,
      'https://example.com/result.png',
      { name: 'Relight', historyLabel: 'Relight', opacity: 100, maskToSelection: true },
      { renderUrlToSize: async () => 'data:image/png;base64,RESULT', selectionToLayerMask },
    );
    const layer = store.getState().layers.find((l) => l.id === id)!;
    expect(isInverseOfSquare(decode(layer.mask?.data))).toBe(true);
  });

  it('Expand grows the inverted area', async () => {
    await invert();
    await store.getState().expandSelectionBy(1);
    const sel = store.getState().selection!;
    // everything but the square, grown by 1 = everything but the inner 2x2
    expect(selected(decode(sel.maskDataUrl))).toBe(W * H - 4);
  });

  it('Contract shrinks the inverted area', async () => {
    await invert();
    await store.getState().contractSelectionBy(1);
    const m = decode(store.getState().selection!.maskDataUrl);
    expect(m[5 * W + 5]).toBe(0); // the old square stays unselected
    expect(m[2 * W + 2]).toBe(0); // and the ring next to it is no longer selected
    expect(m[1 * W + 1]).toBe(255); // inside the inverted area, away from the image edge
  });

  it('Content-Aware Fill fills the inverted area', async () => {
    const sel = await invert();
    await store.getState().contentAwareFill();
    // the baked mask as it is: nothing flips it back
    expect(vi.mocked(selectionToInpaintMask).mock.calls).toEqual([[sel.maskDataUrl, W, H]]);
    expect(inpaintMaskSent).not.toBeNull();
    expect(isInverseOfSquare(decode(inpaintMaskSent!))).toBe(true);
  });

  it('filter / adjustment / Delete region', async () => {
    await invert();
    const region = await selectionMaskForRect(store.getState().selection, 0, W, H, { x: 0, y: 0, width: W, height: H });
    expect(isInverseOfSquare(region!)).toBe(true);
  });
});
