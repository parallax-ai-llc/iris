import { describe, it, expect } from 'vitest';
import { DEFAULT_TEXT_SETTINGS, type Layer, type TextLayer } from '@/features/image-editor/stores/imageEditor.store';
import { findTextLayerAt, isSameText, textLayersForExport } from '../textLayerEdit';

function layer(id: string, x: number, y: number, w: number, h: number, extra: Partial<Layer> = {}): Layer {
  return {
    id, name: id, visible: true, locked: false, opacity: 100, blendMode: 'normal',
    imageData: '', x, y, width: w, height: h, ...extra,
  };
}
const text = (content: string) => ({ content, settings: { ...DEFAULT_TEXT_SETTINGS } });

describe('findTextLayerAt', () => {
  it('returns the topmost text layer under the point', () => {
    const layers = [
      layer('bg', 0, 0, 500, 500),
      layer('t1', 10, 10, 100, 40, { text: text('a') }),
      layer('t2', 50, 20, 100, 40, { text: text('b') }),
    ];
    expect(findTextLayerAt(layers, 60, 30)?.id).toBe('t2');
    expect(findTextLayerAt(layers, 20, 20)?.id).toBe('t1');
  });

  it('ignores raster layers, hidden and locked text layers and points outside', () => {
    const layers = [
      layer('raster', 0, 0, 100, 100),
      layer('hidden', 0, 0, 100, 100, { text: text('a'), visible: false }),
      layer('locked', 0, 0, 100, 100, { text: text('a'), locked: true }),
      layer('far', 300, 300, 10, 10, { text: text('a') }),
    ];
    expect(findTextLayerAt(layers, 50, 50)).toBeNull();
  });
});

describe('isSameText', () => {
  it('same content and recorded style is unchanged; extra tool keys are ignored', () => {
    const before = text('Hello');
    expect(isSameText(before, 'Hello', { ...DEFAULT_TEXT_SETTINGS, pathOffset: 3 } as typeof DEFAULT_TEXT_SETTINGS)).toBe(true);
    expect(isSameText(before, 'Hello!', DEFAULT_TEXT_SETTINGS)).toBe(false);
    expect(isSameText(before, 'Hello', { ...DEFAULT_TEXT_SETTINGS, fontSize: 99 })).toBe(false);
  });
});

describe('textLayersForExport', () => {
  it('uses the layer text data and keeps legacy entries only for layers without it', () => {
    const layers = [layer('t1', 5, 6, 10, 10, { text: text('new') }), layer('legacy', 0, 0, 10, 10)];
    const legacy: TextLayer[] = [
      { id: 't1', text: 'stale', x: 0, y: 0, settings: { ...DEFAULT_TEXT_SETTINGS } },
      { id: 'legacy', text: 'old', x: 0, y: 0, settings: { ...DEFAULT_TEXT_SETTINGS } },
    ];
    const out = textLayersForExport(layers, legacy);
    expect(out.map((t) => [t.id, t.text])).toEqual([['t1', 'new'], ['legacy', 'old']]);
    expect(out[0]).toMatchObject({ x: 5, y: 6 });
  });
});
