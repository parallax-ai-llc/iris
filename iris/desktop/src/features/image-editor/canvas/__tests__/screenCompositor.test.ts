/**
 * #8 Screen compositing follows the saved-document rules: layers inside a
 * hidden group are not drawn, a raster layer mask is applied, layer effects
 * are drawn.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { compositeScreenLayers } from '../screenCompositor';
import * as layerEffects from '../layerEffects';
import type { Layer } from '@/features/image-editor/stores/imageEditor.store';

function layer(over: Partial<Layer>): Layer {
  return {
    id: 'l', name: 'L', visible: true, locked: false, opacity: 100, blendMode: 'normal',
    imageData: '', x: 0, y: 0, width: 10, height: 10, ...over,
  };
}

/** Fake decoded images, tagged by their source. */
const fakeImage = (src: string) => ({ src, width: 10, height: 10, naturalWidth: 10, naturalHeight: 10 }) as unknown as HTMLImageElement;
const loadImage = vi.fn(async (src: string) => fakeImage(src));

function screen(w = 40, h = 30) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Sources (by src tag) drawn by any mock 2D context. */
function spyDrawnSources() {
  const proto = Object.getPrototypeOf(document.createElement('canvas').getContext('2d')!) as { drawImage: (...a: unknown[]) => void };
  const drawn: string[] = [];
  const original = proto.drawImage;
  vi.spyOn(proto, 'drawImage').mockImplementation(function (this: CanvasRenderingContext2D, ...args: unknown[]) {
    const src = (args[0] as { src?: string }).src;
    if (src) drawn.push(src);
    return original.apply(this, args);
  });
  return drawn;
}

afterEach(() => vi.restoreAllMocks());

describe('compositeScreenLayers', () => {
  it('skips layers inside a hidden group', async () => {
    const drawn = spyDrawnSources();
    const layers = [
      layer({ id: 'bg', imageData: 'data:bg' }),
      layer({ id: 'g', type: 'group', visible: false, children: ['in'] }),
      layer({ id: 'in', imageData: 'data:inside', parentId: 'g' }),
    ];
    await compositeScreenLayers(screen(), layers, { activeLayerId: null, activeLayerFilter: 'none', loadImage });
    expect(drawn).toContain('data:bg');
    expect(drawn).not.toContain('data:inside');
  });

  it('draws a visible group child', async () => {
    const drawn = spyDrawnSources();
    const layers = [
      layer({ id: 'g', type: 'group', children: ['in'] }),
      layer({ id: 'in', imageData: 'data:inside', parentId: 'g' }),
    ];
    await compositeScreenLayers(screen(), layers, { activeLayerId: null, activeLayerFilter: 'none', loadImage });
    expect(drawn).toContain('data:inside');
  });

  it('applies an enabled raster layer mask (mask image drawn, pixels multiplied)', async () => {
    const drawn = spyDrawnSources();
    const layers = [
      layer({ id: 'm', imageData: 'data:masked', mask: { data: 'data:mask', enabled: true, linked: true } }),
    ];
    await compositeScreenLayers(screen(), layers, { activeLayerId: null, activeLayerFilter: 'none', loadImage });
    expect(drawn).toContain('data:mask');
    expect(loadImage).toHaveBeenCalledWith('data:mask');
  });

  it('ignores a disabled mask', async () => {
    const drawn = spyDrawnSources();
    const layers = [
      layer({ id: 'm', imageData: 'data:masked', mask: { data: 'data:mask', enabled: false, linked: true } }),
    ];
    await compositeScreenLayers(screen(), layers, { activeLayerId: null, activeLayerFilter: 'none', loadImage });
    expect(drawn).not.toContain('data:mask');
  });

  it('draws enabled layer effects', async () => {
    const effects = vi.spyOn(layerEffects, 'applyLayerEffects');
    const layers = [
      layer({
        id: 'fx',
        imageData: 'data:fx',
        effects: [{ type: 'dropShadow', enabled: true, settings: { color: '#000000', offsetX: 2, offsetY: 2, blur: 0, spread: 0, opacity: 50 } } as never],
      }),
      layer({ id: 'off', imageData: 'data:off', effects: [{ type: 'dropShadow', enabled: false, settings: {} } as never] }),
    ];
    await compositeScreenLayers(screen(), layers, { activeLayerId: null, activeLayerFilter: 'none', loadImage });
    expect(effects).toHaveBeenCalledTimes(1);
  });
});
