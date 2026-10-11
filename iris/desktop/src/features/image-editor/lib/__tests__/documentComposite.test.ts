/**
 * renderDocumentForOutput: what save, export, clipboard and the PSD composite
 * write. It must come from the layers (never from the on-screen canvas, which
 * carries display-only effects such as Gamut Warning, Proof Colors and the
 * single-channel view) and bake the view rotation / flip in.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Layer } from '@/features/image-editor/stores/imageEditor.store';

const compositeLayers = vi.fn(async (_layers: Layer[], w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
});
vi.mock('@/features/image-editor/canvas/layerCompositor', () => ({
  compositeLayers: (...args: Parameters<typeof compositeLayers>) => compositeLayers(...args),
}));

import { bakeViewTransform, renderDocumentForOutput } from '../documentComposite';

const BG: Layer = {
  id: 'bg',
  name: 'Background',
  visible: true,
  locked: false,
  opacity: 100,
  blendMode: 'normal',
  imageData: 'data:bg',
  x: 0,
  y: 0,
  width: 300,
  height: 200,
};

function displayCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 300;
  c.height = 200;
  return c;
}

const base = {
  layers: [BG],
  canvasWidth: 300,
  canvasHeight: 200,
  rotation: 0,
  flipHorizontal: false,
  flipVertical: false,
};

beforeEach(() => {
  compositeLayers.mockClear();
});

describe('renderDocumentForOutput', () => {
  it('re-composites the layers at the document size instead of returning the display canvas', async () => {
    const display = displayCanvas();
    const out = await renderDocumentForOutput(
      // display-only flags must not matter: they are not part of the input at all
      { ...base, gamutWarning: true, colorProofing: true, activeChannelId: 'red' } as typeof base,
      display,
    );

    expect(compositeLayers).toHaveBeenCalledWith([BG], 300, 200);
    expect(out).not.toBe(display);
    expect(out?.width).toBe(300);
    expect(out?.height).toBe(200);
  });

  it('falls back to the display canvas only when the document has no layers', async () => {
    const display = displayCanvas();
    const out = await renderDocumentForOutput({ ...base, layers: [] }, display);
    expect(compositeLayers).not.toHaveBeenCalled();
    expect(out).toBe(display);
  });

  it('bakes a 90 degree rotation (swapped size)', async () => {
    const out = await renderDocumentForOutput({ ...base, rotation: 90 }, null);
    expect(out?.width).toBe(200);
    expect(out?.height).toBe(300);
  });

  it('uses the layer extent when the store has no document size yet', async () => {
    await renderDocumentForOutput({ ...base, canvasWidth: 0, canvasHeight: 0 }, null);
    expect(compositeLayers).toHaveBeenCalledWith([BG], 300, 200);
  });
});

describe('bakeViewTransform', () => {
  it('returns the same canvas when there is nothing to bake', () => {
    const c = displayCanvas();
    expect(bakeViewTransform(c, 0, false, false)).toBe(c);
  });

  it('returns a new canvas for a flip', () => {
    const c = displayCanvas();
    const out = bakeViewTransform(c, 0, true, false);
    expect(out).not.toBe(c);
    expect([out.width, out.height]).toEqual([300, 200]);
  });
});
