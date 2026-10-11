/**
 * Layer-structure actions record history (undo / redo / dirty stay in step),
 * Merge Down composites instead of deleting, and history entries restore the
 * document size (crop / Image Size / Canvas Size undo).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupImageEditorTestTab } from '@/test-utils/imageEditorHelpers';
import { useImageEditorStore, type Layer } from '@/features/image-editor/stores/imageEditor.store';

const compositeCalls: Layer[][] = [];
vi.mock('@/features/image-editor/canvas/layerCompositor', () => ({
  compositeLayers: vi.fn(async (layers: Layer[], w: number, h: number) => {
    compositeCalls.push(layers.map((l) => ({ ...l })));
    return { width: w, height: h, toDataURL: () => `data:image/png;base64,MERGED${compositeCalls.length}` };
  }),
}));

const IMG = 'data:image/png;base64,AAAA';
const s = () => useImageEditorStore.getState();
const labels = () => s().history.map((h) => h.label);
const names = () => s().layers.map((l) => l.name);

/** Open a document: one Background layer and the clean 'Open' baseline. */
function openDoc(width = 480, height = 320) {
  useImageEditorStore.setState({ canvasWidth: width, canvasHeight: height });
  const id = s().addLayer(IMG, 'Background', { history: false });
  s().updateLayer(id, { width, height });
  s().pushHistory('Open', '', false);
  return id;
}

/** Let the absorbable window of the previous structural push close. */
const nextTask = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  setupImageEditorTestTab();
  compositeCalls.length = 0;
});

describe('layer-structure history', () => {
  it('add / duplicate / delete each add one entry and undo walks back through them', async () => {
    openDoc();
    expect(s().isDirty).toBe(false);

    const added = s().addLayer('', 'New Layer');
    await nextTask();
    expect(labels()).toEqual(['Open', 'Layer Added']);
    expect(s().isDirty).toBe(true);

    s().duplicateLayer(added);
    await nextTask();
    expect(names()).toEqual(['Background', 'New Layer', 'New Layer (copy)']);

    s().removeLayer(added);
    await nextTask();
    expect(labels()).toEqual(['Open', 'Layer Added', 'Layer Duplicated', 'Layer Deleted']);
    expect(names()).toEqual(['Background', 'New Layer (copy)']);

    s().undo();
    expect(names()).toEqual(['Background', 'New Layer', 'New Layer (copy)']);
    s().undo();
    s().undo();
    expect(names()).toEqual(['Background']);
    expect(s().isDirty).toBe(false);
    // the active layer never points at a layer that undo removed
    expect(s().layers.some((l) => l.id === s().activeLayerId)).toBe(true);

    s().redo();
    expect(names()).toEqual(['Background', 'New Layer']);
  });

  it('reorder records the order and undo restores it', async () => {
    openDoc();
    const a = s().addLayer('', 'A');
    await nextTask();
    const b = s().addLayer('', 'B');
    await nextTask();
    s().reorderLayers(2, 1);
    expect(s().layers.map((l) => l.id).slice(1)).toEqual([b, a]);
    expect(labels().at(-1)).toBe('Layer Order');
    s().undo();
    expect(s().layers.map((l) => l.id).slice(1)).toEqual([a, b]);
  });

  it('reorder to the same index records nothing', () => {
    openDoc();
    s().reorderLayers(0, 0);
    expect(labels()).toEqual(['Open']);
  });

  it('{ history: false } records nothing', () => {
    openDoc();
    const id = s().addLayer('', 'Temp', { history: false });
    s().removeLayer(id, { history: false });
    expect(labels()).toEqual(['Open']);
  });

  it('an explicit push in the same task absorbs the structural entry (one step)', async () => {
    openDoc();
    s().addLayer(IMG, 'Text');
    s().pushHistory('Text', '');
    expect(labels()).toEqual(['Open', 'Text']);
    expect(s().history[1].layers?.map((l) => l.name)).toEqual(['Background', 'Text']);
    s().undo();
    expect(names()).toEqual(['Background']);

    // ...but not in a later task
    s().addLayer(IMG, 'Later');
    await nextTask();
    s().pushHistory('Brush Stroke', '');
    expect(labels()).toEqual(['Open', 'Layer Added', 'Brush Stroke']);
  });

  it('groups: new group, move to group and ungroup are undoable', async () => {
    openDoc();
    const layer = s().addLayer('', 'L');
    await nextTask();
    const group = s().createLayerGroup('G');
    s().moveLayerToGroup(layer, group);
    s().ungroupLayers(group);
    expect(labels().slice(-3)).toEqual(['New Group', 'Move to Group', 'Ungroup']);
    s().undo();
    expect(s().layers.find((l) => l.id === layer)?.parentId).toBe(group);
    s().undo();
    s().undo();
    expect(s().layers.some((l) => l.id === group)).toBe(false);
  });
});

describe('mergeLayerDown', () => {
  it('composites the upper layer onto the lower one and keeps the lower identity', async () => {
    const bg = openDoc();
    s().updateLayer(bg, { opacity: 80 });
    const top = s().addLayer(IMG, 'Paint');
    s().updateLayer(top, { opacity: 50, blendMode: 'multiply' });
    await nextTask();

    await s().mergeLayerDown(top);

    // compositor got the lower layer as an opaque normal base and the upper as-is
    expect(compositeCalls).toHaveLength(1);
    const [base, upper] = compositeCalls[0];
    expect(base.id).toBe(bg);
    expect(base.opacity).toBe(100);
    expect(base.blendMode).toBe('normal');
    expect(upper.id).toBe(top);
    expect(upper.opacity).toBe(50);
    expect(upper.blendMode).toBe('multiply');

    const { layers, activeLayerId } = s();
    expect(layers).toHaveLength(1);
    expect(layers[0].id).toBe(bg);
    expect(layers[0].name).toBe('Background');
    expect(layers[0].opacity).toBe(80);
    expect(layers[0].imageData).toBe('data:image/png;base64,MERGED1');
    expect([layers[0].width, layers[0].height]).toEqual([480, 320]);
    expect(activeLayerId).toBe(bg);
    expect(labels().at(-1)).toBe('Merge Down');

    s().undo();
    expect(names()).toEqual(['Background', 'Paint']);
    expect(s().layers[0].imageData).toBe(IMG);
  });

  it('does nothing for the bottom layer or a locked lower layer', async () => {
    const bg = openDoc();
    await s().mergeLayerDown(bg);
    const top = s().addLayer(IMG, 'Paint');
    s().updateLayer(bg, { locked: true });
    await s().mergeLayerDown(top);
    expect(compositeCalls).toHaveLength(0);
    expect(s().layers).toHaveLength(2);
  });
});

describe('flatten', () => {
  it('flattens through the compositor with one undoable entry', async () => {
    openDoc();
    s().addLayer(IMG, 'Paint');
    await nextTask();
    await s().flattenLayers();
    expect(names()).toEqual(['Flattened']);
    expect(labels().at(-1)).toBe('Flatten Image');
    s().undo();
    expect(names()).toEqual(['Background', 'Paint']);
  });
});

describe('document size in history', () => {
  it('undo / redo / history click restore the canvas size (crop-like change)', () => {
    openDoc(480, 320);
    useImageEditorStore.setState({ canvasWidth: 200, canvasHeight: 200 });
    s().pushHistory('Crop', '');

    s().undo();
    expect([s().canvasWidth, s().canvasHeight]).toEqual([480, 320]);
    s().redo();
    expect([s().canvasWidth, s().canvasHeight]).toEqual([200, 200]);
    s().goToHistoryState(0);
    expect([s().canvasWidth, s().canvasHeight]).toEqual([480, 320]);
  });

  it('Canvas Size is undoable', () => {
    openDoc(480, 320);
    s().resizeCanvas(600, 400, 'center');
    expect([s().canvasWidth, s().canvasHeight]).toEqual([600, 400]);
    s().undo();
    expect([s().canvasWidth, s().canvasHeight]).toEqual([480, 320]);
    expect(s().layers[0].x).toBe(0);
  });

  it('Image Size is undoable', async () => {
    openDoc(480, 320);
    s().resizeImage(240, 160, 'bilinear');
    await vi.waitFor(() => expect(s().canvasWidth).toBe(240));
    s().undo();
    expect([s().canvasWidth, s().canvasHeight]).toEqual([480, 320]);
  });
});
