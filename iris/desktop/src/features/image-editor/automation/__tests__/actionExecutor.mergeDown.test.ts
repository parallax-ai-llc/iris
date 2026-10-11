/**
 * Replaying a recorded "Merge Down" step merges the active layer into the one
 * below; it used to call flattenLayers() and collapse every layer.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupImageEditorTestTab } from '@/test-utils/imageEditorHelpers';
import { useImageEditorStore, type Layer } from '@/features/image-editor/stores/imageEditor.store';
import { executeActionStep } from '../actionExecutor';
import { createActionStep } from '../actionTypes';

vi.mock('@/features/image-editor/canvas/layerCompositor', () => ({
  compositeLayers: vi.fn(async (_layers: Layer[], w: number, h: number) => ({
    width: w,
    height: h,
    toDataURL: () => 'data:image/png;base64,MERGED',
  })),
}));

const IMG = 'data:image/png;base64,AAAA';
const s = () => useImageEditorStore.getState();

beforeEach(() => {
  setupImageEditorTestTab();
});

describe('layer:merge-down replay', () => {
  it('merges only the active layer into the one below (3 layers -> 2, not 1)', async () => {
    useImageEditorStore.setState({ canvasWidth: 100, canvasHeight: 100 });
    const bg = s().addLayer(IMG, 'Background', { history: false });
    const middle = s().addLayer(IMG, 'Middle', { history: false });
    const top = s().addLayer(IMG, 'Top', { history: false });
    s().setActiveLayer(top);

    await executeActionStep(createActionStep('layer:merge-down'));

    expect(s().layers.map((l) => l.id)).toEqual([bg, middle]);
  });

  it('uses an explicit layerId when the step carries one', async () => {
    useImageEditorStore.setState({ canvasWidth: 100, canvasHeight: 100 });
    const bg = s().addLayer(IMG, 'Background', { history: false });
    const middle = s().addLayer(IMG, 'Middle', { history: false });
    const top = s().addLayer(IMG, 'Top', { history: false });
    s().setActiveLayer(top);

    await executeActionStep(createActionStep('layer:merge-down', { layerId: middle }));

    expect(s().layers.map((l) => l.id)).toEqual([bg, top]);
  });
});
