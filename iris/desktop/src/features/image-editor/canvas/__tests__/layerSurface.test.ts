/**
 * Stroke merge into a layer: the layer offset is applied once (#2), an empty
 * layer is a document-size layer (#11), and merges run one at a time (#13).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSerialQueue, documentSelectionMask, layerOwnCanvas, mergeStrokeIntoLayer, selectionMaskForRect } from '../layerSurface';

type DrawCall = { canvasWidth: number; source: unknown; dx: number; dy: number };

/** Record drawImage calls of every mock 2D context. */
function spyDrawImage() {
  const probe = document.createElement('canvas').getContext('2d')!;
  const proto = Object.getPrototypeOf(probe) as { drawImage: (...a: unknown[]) => void };
  const calls: DrawCall[] = [];
  const original = proto.drawImage;
  const spy = vi.spyOn(proto, 'drawImage').mockImplementation(function (this: CanvasRenderingContext2D, ...args: unknown[]) {
    calls.push({ canvasWidth: this.canvas.width, source: args[0], dx: args[1] as number, dy: args[2] as number });
    return original.apply(this, args);
  });
  return { calls, spy };
}

function docStroke(w = 200, h = 100) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

afterEach(() => vi.restoreAllMocks());

describe('mergeStrokeIntoLayer', () => {
  it('a moved layer keeps its position: layer and stroke are each offset once', async () => {
    const { calls } = spyDrawImage();
    const stroke = docStroke();
    const layer = { imageData: 'data:layer', x: 30, y: 40, width: 100, height: 100 };

    const merged = await mergeStrokeIntoLayer(layer, {
      stroke, docWidth: 200, docHeight: 100, erase: false, alpha: 1, selectionMask: null,
    });

    // Surface = union(layer 30,40 100x100, doc 200x100) = 0,0 200x140
    expect(merged?.rect).toEqual({ x: 0, y: 0, width: 200, height: 140 });
    const layerDraw = calls.find((c) => c.source !== stroke)!;
    expect([layerDraw.dx, layerDraw.dy]).toEqual([30, 40]);
    const strokeDraw = calls.find((c) => c.source === stroke)!;
    expect([strokeDraw.dx, strokeDraw.dy]).toEqual([-0, -0]);
  });

  it('a layer moved up-left: the surface starts at the layer, the stroke shifts by it', async () => {
    const { calls } = spyDrawImage();
    const stroke = docStroke();
    const merged = await mergeStrokeIntoLayer(
      { imageData: 'data:layer', x: -20, y: -10, width: 100, height: 100 },
      { stroke, docWidth: 200, docHeight: 100, erase: false, alpha: 1, selectionMask: null },
    );
    expect(merged?.rect).toEqual({ x: -20, y: -10, width: 220, height: 110 });
    const strokeDraw = calls.find((c) => c.source === stroke)!;
    expect([strokeDraw.dx, strokeDraw.dy]).toEqual([20, 10]);
  });

  it('an empty layer becomes a document-size layer at (0, 0)', async () => {
    const merged = await mergeStrokeIntoLayer(
      { imageData: '', x: 0, y: 0, width: 0, height: 0 },
      { stroke: docStroke(), docWidth: 200, docHeight: 100, erase: false, alpha: 0.5, selectionMask: null },
    );
    expect(merged?.rect).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(merged?.imageData).toMatch(/^data:image/);
  });
});

describe('layerOwnCanvas', () => {
  it('an empty layer is a transparent document-size canvas', async () => {
    const own = await layerOwnCanvas({ imageData: '', x: 5, y: 5, width: 0, height: 0 }, 320, 240);
    expect(own?.rect).toEqual({ x: 0, y: 0, width: 320, height: 240 });
    expect([own?.canvas.width, own?.canvas.height]).toEqual([320, 240]);
  });

  it('a layer keeps its position and pixel size', async () => {
    // Mock images decode as 100x100
    const own = await layerOwnCanvas({ imageData: 'data:x', x: 12, y: 7, width: 100, height: 100 }, 320, 240);
    expect(own?.rect).toEqual({ x: 12, y: 7, width: 100, height: 100 });
  });
});

describe('createSerialQueue', () => {
  it('a second task starts only after the first finished (reads its result)', async () => {
    const queue = createSerialQueue();
    let value = 'base';
    const seen: string[] = [];
    const slow = (tag: string) => async () => {
      const read = value; // read at task start
      seen.push(read);
      await new Promise((r) => setTimeout(r, 5));
      value = `${read}+${tag}`;
    };
    await Promise.all([queue.run(slow('a')), queue.run(slow('b')), queue.run(slow('c'))]);
    expect(seen).toEqual(['base', 'base+a', 'base+a+b']);
    expect(value).toBe('base+a+b+c');
  });

  it('a failing task does not block the next one', async () => {
    const queue = createSerialQueue();
    await expect(queue.run(async () => { throw new Error('x'); })).rejects.toThrow('x');
    await expect(queue.run(async () => 7)).resolves.toBe(7);
  });
});

describe('selection masks', () => {
  // The mock canvas reads back mid-grey (R = 128) for drawn images.
  it('the mask is already the effective selection: isInverted is not applied again', async () => {
    const plain = await documentSelectionMask({ maskDataUrl: 'data:mask' }, 0, 4, 2);
    const inverted = await documentSelectionMask({ maskDataUrl: 'data:mask', isInverted: true } as never, 0, 4, 2);
    expect(Array.from(plain!)).toEqual(Array(8).fill(128));
    expect(Array.from(inverted!)).toEqual(Array.from(plain!));
  });

  it('a layer-space mask is cut at the layer rect (outside the document = not selected)', async () => {
    const cut = await selectionMaskForRect({ maskDataUrl: 'data:mask' }, 0, 4, 2, { x: 2, y: 1, width: 3, height: 2 });
    expect(Array.from(cut!)).toEqual([128, 128, 0, 0, 0, 0]);
  });

  it('no selection, no mask', async () => {
    expect(await documentSelectionMask(null, 0, 4, 2)).toBeNull();
  });
});
