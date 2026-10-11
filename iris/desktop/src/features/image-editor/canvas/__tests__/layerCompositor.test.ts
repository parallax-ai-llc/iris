/**
 * compositeLayers: the compositor behind save, export, clipboard, PSD
 * composite, merge and the AI tools. It must follow the same rules as the
 * PSD exporter: layer masks (luminance, white = visible), hidden groups hide
 * their children, group opacity applies to the children, and every mask image
 * is fully loaded before it is drawn.
 *
 * The jsdom canvas mock does not rasterise images, so these tests give each
 * fake image its own pixels and let `drawImage` copy them (see `installImages`).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Layer } from '@/features/image-editor/stores/imageEditor.store';
import {
  applyLuminanceMask,
  compositeLayers,
  resolveRenderableLayers,
} from '../layerCompositor';

const W = 4;
const H = 2;

type Rgba = [number, number, number, number];

/** Pixels for each fake data URL. A function value is per pixel (x, y). */
const PIXELS: Record<string, Rgba | ((x: number, y: number) => Rgba)> = {};

interface FakeImage {
  src: string;
  width: number;
  height: number;
  loaded: boolean;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

const drawLog: { src: string; loaded: boolean }[] = [];
const OriginalImage = globalThis.Image;
let ctxProto: { drawImage: (...args: unknown[]) => void } | null = null;
let originalDrawImage: ((...args: unknown[]) => void) | null = null;

function installImages(loadDelayMs: number): void {
  class SlowImage implements FakeImage {
    width = W;
    height = H;
    loaded = false;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private _src = '';
    get src() {
      return this._src;
    }
    set src(value: string) {
      this._src = value;
      setTimeout(() => {
        this.loaded = true;
        this.onload?.();
      }, loadDelayMs);
    }
  }
  // @ts-expect-error test double
  globalThis.Image = SlowImage;

  const probe = document.createElement('canvas').getContext('2d') as unknown as {
    drawImage: (...args: unknown[]) => void;
  };
  ctxProto = Object.getPrototypeOf(probe);
  originalDrawImage = ctxProto!.drawImage;
  ctxProto!.drawImage = function (this: CanvasRenderingContext2D, image: unknown, dx = 0, dy = 0, ...rest: unknown[]) {
    if (image instanceof SlowImage) {
      drawLog.push({ src: image.src, loaded: image.loaded });
      const spec = PIXELS[image.src];
      if (!spec || !image.loaded) return; // an unloaded image draws nothing (browser behaviour)
      const data = new Uint8ClampedArray(W * H * 4);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const px = typeof spec === 'function' ? spec(x, y) : spec;
          data.set(px, (y * W + x) * 4);
        }
      }
      this.putImageData(new ImageData(data, W, H), dx as number, dy as number);
      return;
    }
    return originalDrawImage!.call(this, image, dx, dy, ...rest);
  };
}

function layer(id: string, extra: Partial<Layer> = {}): Layer {
  return {
    id,
    name: id,
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    imageData: `data:${id}`,
    x: 0,
    y: 0,
    width: W,
    height: H,
    ...extra,
  };
}

function pixel(canvas: HTMLCanvasElement, x: number, y: number): Rgba {
  const d = canvas.getContext('2d')!.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

beforeEach(() => {
  drawLog.length = 0;
  for (const k of Object.keys(PIXELS)) delete PIXELS[k];
});

afterEach(() => {
  globalThis.Image = OriginalImage;
  if (ctxProto && originalDrawImage) ctxProto.drawImage = originalDrawImage;
});

describe('compositeLayers - masks', () => {
  it('waits for a slow mask image before drawing it (adjustment layer mask)', async () => {
    installImages(5);
    PIXELS['data:base'] = [200, 0, 0, 255];
    PIXELS['data:mask'] = [255, 255, 255, 255];
    const layers = [
      layer('base'),
      layer('adj', {
        type: 'adjustment',
        imageData: '',
        adjustmentValues: { brightness: 20 },
        mask: { data: 'data:mask', enabled: true, linked: true },
      }),
    ];

    await compositeLayers(layers, W, H);

    const maskDraws = drawLog.filter((d) => d.src === 'data:mask');
    expect(maskDraws.length).toBeGreaterThan(0);
    expect(maskDraws.every((d) => d.loaded)).toBe(true);
  });

  it('applies a raster layer mask: black hides, white shows', async () => {
    installImages(1);
    PIXELS['data:base'] = [200, 0, 0, 255];
    // left half white (visible), right half black (hidden)
    PIXELS['data:mask'] = (x) => (x < W / 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]);
    const layers = [layer('base', { mask: { data: 'data:mask', enabled: true, linked: true } })];

    const out = await compositeLayers(layers, W, H);

    expect(pixel(out, 0, 0)[3]).toBe(255);
    expect(pixel(out, W - 1, 0)[3]).toBe(0);
  });

  it('ignores a disabled mask and an empty (reveal-all) mask', async () => {
    installImages(1);
    PIXELS['data:base'] = [200, 0, 0, 255];
    PIXELS['data:mask'] = [0, 0, 0, 255];
    const disabled = await compositeLayers(
      [layer('base', { mask: { data: 'data:mask', enabled: false, linked: true } })],
      W,
      H,
    );
    expect(pixel(disabled, W - 1, 0)[3]).toBe(255);

    const empty = await compositeLayers([layer('base', { mask: { data: '', enabled: true, linked: true } })], W, H);
    expect(pixel(empty, W - 1, 0)[3]).toBe(255);
  });
});

describe('compositeLayers - groups', () => {
  it('a hidden group hides its (visible) children', async () => {
    installImages(1);
    PIXELS['data:child'] = [0, 200, 0, 255];
    const layers = [
      layer('group', { type: 'group', imageData: '', visible: false, children: ['child'] }),
      layer('child', { parentId: 'group' }),
    ];

    await compositeLayers(layers, W, H);

    expect(drawLog.some((d) => d.src === 'data:child')).toBe(false);
  });
});

describe('resolveRenderableLayers', () => {
  it('drops group layers, hides children of hidden groups (any depth) and multiplies group opacity', () => {
    const layers = [
      layer('outer', { type: 'group', imageData: '', opacity: 50 }),
      layer('inner', { type: 'group', imageData: '', parentId: 'outer', opacity: 50 }),
      layer('deep', { parentId: 'inner', opacity: 80 }),
      layer('hiddenGroup', { type: 'group', imageData: '', visible: false }),
      layer('underHidden', { parentId: 'hiddenGroup' }),
      layer('root', { opacity: 70 }),
    ];

    const out = resolveRenderableLayers(layers);

    expect(out.map((l) => l.id)).toEqual(['deep', 'underHidden', 'root']);
    expect(out.find((l) => l.id === 'deep')!.opacity).toBeCloseTo(20); // 80 * 0.5 * 0.5
    expect(out.find((l) => l.id === 'underHidden')!.visible).toBe(false);
    expect(out.find((l) => l.id === 'root')!.opacity).toBe(70);
    // inputs are not mutated
    expect(layers[2].opacity).toBe(80);
  });

  it('survives a parent cycle', () => {
    const layers = [
      layer('a', { type: 'group', imageData: '', parentId: 'b' }),
      layer('b', { type: 'group', imageData: '', parentId: 'a' }),
      layer('c', { parentId: 'a' }),
    ];
    expect(resolveRenderableLayers(layers).map((l) => l.id)).toEqual(['c']);
  });
});

describe('applyLuminanceMask', () => {
  it('scales alpha by the mask luminance', () => {
    const target = new ImageData(new Uint8ClampedArray([10, 20, 30, 255, 10, 20, 30, 200]), 2, 1);
    const mask = new ImageData(new Uint8ClampedArray([255, 255, 255, 255, 128, 128, 128, 255]), 2, 1);
    applyLuminanceMask(target, mask);
    expect(target.data[3]).toBe(255);
    expect(target.data[7]).toBe(100); // 200 * 128/255 ≈ 100
    expect([target.data[0], target.data[1], target.data[2]]).toEqual([10, 20, 30]);
  });

  it('treats a transparent mask pixel as hidden', () => {
    const target = new ImageData(new Uint8ClampedArray([10, 20, 30, 255]), 1, 1);
    const mask = new ImageData(new Uint8ClampedArray([255, 255, 255, 0]), 1, 1);
    applyLuminanceMask(target, mask);
    expect(target.data[3]).toBe(0);
  });
});
