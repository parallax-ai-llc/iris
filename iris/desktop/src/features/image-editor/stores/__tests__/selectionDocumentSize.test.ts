/**
 * Selection masks are document size.
 *
 * The bottom layer is not the document: it can be smaller than the canvas or
 * moved. Refine Edge, Select Subject, Select Layer Pixels and Load Path as
 * Selection must read and write the selection mask at the document size
 * (`documentSize(layers, canvasWidth, canvasHeight)`), like invertSelection.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSourceAsset, setupImageEditorTestTab } from '@/test-utils/imageEditorHelpers';
import type { ImageEditorStoreApi } from '@/features/image-editor/stores/imageEditorFactory';
import { loadMaskAsSelection, loadSelectionMask, refineEdge } from '@/features/image-editor/canvas/selectionEngine';

const W = 10;
const H = 8;

// A fake PNG codec: maskToDataUrl stores the mask under a new data URL and
// loadSelectionMask returns it, so tests read back the exact mask size.
const codec = new Map<string, { mask: Uint8ClampedArray; width: number; height: number }>();
let seq = 0;

function encode(mask: Uint8ClampedArray, width: number, height: number): string {
  const url = `data:image/png;base64,FAKE${++seq}`;
  codec.set(url, { mask: new Uint8ClampedArray(mask), width, height });
  return url;
}

function sizeOf(url: string | undefined): [number, number] {
  const entry = url ? codec.get(url) : undefined;
  if (!entry) throw new Error(`not a mask produced by maskToDataUrl: ${String(url).slice(0, 40)}`);
  return [entry.width, entry.height];
}

vi.mock('@/features/image-editor/canvas/selectionEngine', async () => {
  const actual = await vi.importActual<typeof import('@/features/image-editor/canvas/selectionEngine')>(
    '@/features/image-editor/canvas/selectionEngine',
  );
  return {
    ...actual,
    loadSelectionMask: vi.fn(async (url: string, w: number, h: number) => {
      const entry = codec.get(url);
      if (!entry || entry.width !== w || entry.height !== h) {
        throw new Error(`mask ${entry?.width}x${entry?.height} read as ${w}x${h}`);
      }
      return new Uint8ClampedArray(entry.mask);
    }),
    maskToDataUrl: vi.fn((mask: Uint8ClampedArray, w: number, h: number) => encode(mask, w, h)),
    loadMaskAsSelection: vi.fn(async (_url: string, w: number, h: number) => new Uint8ClampedArray(w * h).fill(255)),
    refineEdge: vi.fn((mask: Uint8ClampedArray) => new Uint8ClampedArray(mask)),
  };
});

vi.mock('@/shared/api/image.api', () => ({
  removeBackground: vi.fn(async () => ({ id: 'job-1' })),
  getAssetStatus: vi.fn(async () => ({ status: 'READY', asset: { previewUrl: 'https://example.com/nobg.png' } })),
  uploadImage: vi.fn(),
}));

// The edited document no longer matches the source asset, so the AI input is
// the uploaded composite (same resolver as the other AI tools).
vi.mock('@/features/image-editor/lib/aiSource', () => ({
  resolveAIInputAssetId: vi.fn(async () => 'composite-1'),
}));

/** A 4x4 selected square at (3,2) on the 10x8 document. */
function squareMask(): Uint8ClampedArray {
  const m = new Uint8ClampedArray(W * H);
  for (let y = 2; y < 6; y++) for (let x = 3; x < 7; x++) m[y * W + x] = 255;
  return m;
}

// The bottom layer is smaller than the document and moved.
const smallBottom = {
  id: 'bg', name: 'bg', visible: true, locked: false, opacity: 100, blendMode: 'normal' as const,
  imageData: 'data:bg', x: 2, y: 1, width: 4, height: 3,
};

let store: ImageEditorStoreApi;

beforeEach(() => {
  codec.clear();
  vi.clearAllMocks();
  store = setupImageEditorTestTab();
  store.setState({
    canvasWidth: W,
    canvasHeight: H,
    sourceAsset: mockSourceAsset,
    activeLayerId: 'bg',
    layers: [smallBottom],
    selection: { maskDataUrl: encode(squareMask(), W, H), bounds: { x: 3, y: 2, width: 4, height: 4 }, feather: 0 },
  });
});

const refine = (o: { radius: number; smoothing: number; feather: number; contrast: number }) =>
  (store.getState().refineEdge as unknown as (opts: typeof o) => Promise<void>)(o);

describe('refineEdge', () => {
  const opts = { radius: 1, smoothing: 0, feather: 2, contrast: 0 };

  it('reads, refines and stores the mask at document size', async () => {
    await refine(opts);
    expect(vi.mocked(loadSelectionMask).mock.calls[0].slice(1)).toEqual([W, H]);
    expect(vi.mocked(refineEdge).mock.calls[0].slice(1, 3)).toEqual([W, H]);
    const sel = store.getState().selection!;
    expect(sizeOf(sel.maskDataUrl)).toEqual([W, H]);
    expect(sel.feather).toBe(2);
    expect(sel.bounds).toEqual({ x: 3, y: 2, width: 4, height: 4 });
  });

  it('drops the result when the selection changed while the mask loaded', async () => {
    const pending = refine(opts);
    const replaced = { maskDataUrl: encode(new Uint8ClampedArray(W * H), W, H), bounds: { x: 0, y: 0, width: 0, height: 0 }, feather: 0 };
    store.setState({ selection: replaced });
    await pending;
    expect(store.getState().selection).toBe(replaced);
  });
});

describe('other actions that build a selection mask', () => {
  it('selectSubject builds the mask at document size', async () => {
    await store.getState().selectSubject();
    // background removal runs on the current document, not the pre-edit original
    const { removeBackground } = await import('@/shared/api/image.api');
    expect(vi.mocked(removeBackground)).toHaveBeenCalledWith('composite-1');
    expect(vi.mocked(loadMaskAsSelection).mock.calls[0].slice(1)).toEqual([W, H]);
    expect(sizeOf(store.getState().selection!.maskDataUrl)).toEqual([W, H]);
  });

  it('selectLayerPixels builds the mask at document size', async () => {
    store.setState({ selection: null });
    await store.getState().selectLayerPixels('bg');
    expect(sizeOf(store.getState().selection!.maskDataUrl)).toEqual([W, H]);
  });

  it('loadPathAsSelection rasterizes the path on a document-size canvas', () => {
    const sizes: Array<[number, number]> = [];
    const create = document.createElement.bind(document);
    const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string, o?: ElementCreationOptions) => {
      const el = create(tag, o);
      if (tag.toLowerCase() === 'canvas') {
        const canvas = el as HTMLCanvasElement;
        const toDataURL = canvas.toDataURL.bind(canvas);
        canvas.toDataURL = (...args: Parameters<HTMLCanvasElement['toDataURL']>) => {
          sizes.push([canvas.width, canvas.height]);
          return toDataURL(...args);
        };
      }
      return el;
    }) as typeof document.createElement);
    try {
      store.setState({
        paths: [{ id: 'p1', name: 'Path 1', closed: true, points: [{ x: 1, y: 1 }, { x: 8, y: 1 }, { x: 8, y: 6 }] }] as never,
      });
      store.getState().loadPathAsSelection('p1');
    } finally {
      spy.mockRestore();
    }
    expect(sizes).toEqual([[W, H]]);
    expect(store.getState().selection).not.toBeNull();
  });
});
