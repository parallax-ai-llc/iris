/**
 * Image Editor Store Unit Tests — Phase 3-6 Features
 *
 * Phase 3: Quick Mask, Layer Comps, Fill Layers, Measure Tool, Transform Selection,
 *           Frames, Swatches, Color Picker, Crop Overlay, Object Select, Patch Area
 * Phase 4: Text enhancements, Custom Shapes, Path Operations, Export, Batch Processing,
 *           Conditional Actions
 * Phase 5: Smart Objects, Smart Filters, Linked Layers, Blend If
 * Phase 6: Brush Presets, Brush Dynamics, Symmetry, Clone Source, Notes, Artboards
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setupImageEditorTestTab } from '@/test-utils/imageEditorHelpers';
import { useImageEditorStore } from '../imageEditor.store';
import type {
  BlendIfSettings,
  BrushDynamics,
  SelectionData,
  PathPoint,
} from '../imageEditor.store';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Add a minimal layer and return its ID */
function addTestLayer(name = 'Test Layer'): string {
  const { addLayer } = useImageEditorStore.getState();
  return addLayer('data:image/png;base64,AAAA', name);
}

/** Add a path and return its ID */
function addTestPath(name = 'Test Path'): string {
  const { addPath } = useImageEditorStore.getState();
  return addPath(name);
}

/** Set a selection on the store */
function setTestSelection(): SelectionData {
  const sel: SelectionData = {
    maskDataUrl: 'data:image/png;base64,BBBB',
    bounds: { x: 10, y: 20, width: 100, height: 80 },
    feather: 0,
    isInverted: false,
  };
  useImageEditorStore.getState().setSelection(sel);
  return sel;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3
// ═══════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  setupImageEditorTestTab(); // fresh active tab per test (registry shim requires one)
});

describe('Phase 3: Quick Mask', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('toggleQuickMask enables quick mask and sets editMode to quickMask', () => {
    const store = useImageEditorStore.getState();
    expect(store.quickMaskEnabled).toBe(false);
    expect(store.editMode).toBe('move');

    useImageEditorStore.getState().toggleQuickMask();
    const after = useImageEditorStore.getState();
    expect(after.quickMaskEnabled).toBe(true);
    expect(after.editMode).toBe('quickMask');
  });

  it('toggleQuickMask disables quick mask and sets editMode to move', () => {
    useImageEditorStore.getState().toggleQuickMask(); // enable
    useImageEditorStore.getState().toggleQuickMask(); // disable

    const state = useImageEditorStore.getState();
    expect(state.quickMaskEnabled).toBe(false);
    expect(state.editMode).toBe('move');
  });

  it('setQuickMaskColor updates the overlay color', () => {
    useImageEditorStore.getState().setQuickMaskColor('#00ff00');
    expect(useImageEditorStore.getState().quickMaskColor).toBe('#00ff00');
  });

  it('setQuickMaskOpacity clamps to 0-100', () => {
    useImageEditorStore.getState().setQuickMaskOpacity(75);
    expect(useImageEditorStore.getState().quickMaskOpacity).toBe(75);

    useImageEditorStore.getState().setQuickMaskOpacity(-10);
    expect(useImageEditorStore.getState().quickMaskOpacity).toBe(0);

    useImageEditorStore.getState().setQuickMaskOpacity(200);
    expect(useImageEditorStore.getState().quickMaskOpacity).toBe(100);
  });
});

describe('Phase 3: Layer Comps', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('addLayerComp creates a comp from current layer states', () => {
    const layerId = addTestLayer('BG');
    useImageEditorStore.getState().updateLayer(layerId, { visible: true, x: 5, y: 10 });

    useImageEditorStore.getState().addLayerComp('Comp 1', 'First composition');

    const { layerComps, activeLayerCompId } = useImageEditorStore.getState();
    expect(layerComps).toHaveLength(1);
    expect(layerComps[0].name).toBe('Comp 1');
    expect(layerComps[0].description).toBe('First composition');
    expect(layerComps[0].layerVisibility[layerId]).toBe(true);
    expect(layerComps[0].layerPositions[layerId]).toEqual({ x: 5, y: 10 });
    expect(activeLayerCompId).toBe(layerComps[0].id);
  });

  it('addLayerComp uses empty string as default description', () => {
    addTestLayer();
    useImageEditorStore.getState().addLayerComp('No Desc');

    const { layerComps } = useImageEditorStore.getState();
    expect(layerComps[0].description).toBe('');
  });

  it('updateLayerComp refreshes an existing comp with current layer state', () => {
    const layerId = addTestLayer();
    useImageEditorStore.getState().addLayerComp('Comp A');
    const compId = useImageEditorStore.getState().layerComps[0].id;

    // Modify layer position
    useImageEditorStore.getState().updateLayer(layerId, { x: 50, y: 60 });
    useImageEditorStore.getState().updateLayerComp(compId);

    const updated = useImageEditorStore.getState().layerComps.find((c) => c.id === compId);
    expect(updated?.layerPositions[layerId]).toEqual({ x: 50, y: 60 });
  });

  it('applyLayerComp restores layer visibility and positions', () => {
    const layerId = addTestLayer();
    useImageEditorStore.getState().updateLayer(layerId, { visible: false, x: 0, y: 0 });
    useImageEditorStore.getState().addLayerComp('Snapshot');
    const compId = useImageEditorStore.getState().layerComps[0].id;

    // Change layer state
    useImageEditorStore.getState().updateLayer(layerId, { visible: true, x: 100, y: 200 });

    // Apply comp should restore
    useImageEditorStore.getState().applyLayerComp(compId);

    const layer = useImageEditorStore.getState().layers.find((l) => l.id === layerId);
    expect(layer?.visible).toBe(false);
    expect(layer?.x).toBe(0);
    expect(layer?.y).toBe(0);
    expect(useImageEditorStore.getState().activeLayerCompId).toBe(compId);
  });

  it('applyLayerComp does nothing for non-existent id', () => {
    addTestLayer();
    useImageEditorStore.getState().applyLayerComp('non-existent');
    // Should not throw, layers unchanged
    expect(useImageEditorStore.getState().layers).toHaveLength(1);
  });

  it('deleteLayerComp removes comp and clears activeLayerCompId if active', () => {
    addTestLayer();
    useImageEditorStore.getState().addLayerComp('Comp X');
    const compId = useImageEditorStore.getState().layerComps[0].id;

    useImageEditorStore.getState().deleteLayerComp(compId);
    expect(useImageEditorStore.getState().layerComps).toHaveLength(0);
    expect(useImageEditorStore.getState().activeLayerCompId).toBeNull();
  });

  it('deleteLayerComp preserves activeLayerCompId when deleting a non-active comp', () => {
    addTestLayer();
    useImageEditorStore.getState().addLayerComp('Comp 1');
    useImageEditorStore.getState().addLayerComp('Comp 2');
    const [comp1, comp2] = useImageEditorStore.getState().layerComps;
    // activeLayerCompId should be the last added (Comp 2)
    expect(useImageEditorStore.getState().activeLayerCompId).toBe(comp2.id);

    useImageEditorStore.getState().deleteLayerComp(comp1.id);
    expect(useImageEditorStore.getState().activeLayerCompId).toBe(comp2.id);
    expect(useImageEditorStore.getState().layerComps).toHaveLength(1);
  });
});

describe('Phase 3: Fill Layers', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('addFillLayer creates a solid fill layer', () => {
    useImageEditorStore.getState().addFillLayer('solid', { fillColor: '#ff0000' });

    const { layers, activeLayerId, isDirty } = useImageEditorStore.getState();
    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe('fill');
    expect(layers[0].fillType).toBe('solid');
    expect(layers[0].fillColor).toBe('#ff0000');
    expect(layers[0].name).toBe('Solid Fill');
    expect(activeLayerId).toBe(layers[0].id);
    expect(isDirty).toBe(true);
  });

  it('addFillLayer creates a gradient fill layer with defaults', () => {
    useImageEditorStore.getState().addFillLayer('gradient');

    const layer = useImageEditorStore.getState().layers[0];
    expect(layer.fillType).toBe('gradient');
    expect(layer.fillGradient).toEqual({ colors: ['#000000', '#ffffff'], angle: 0, type: 'linear' });
    expect(layer.name).toBe('Gradient Fill');
  });

  it('addFillLayer creates a pattern fill layer with defaults', () => {
    useImageEditorStore.getState().addFillLayer('pattern');

    const layer = useImageEditorStore.getState().layers[0];
    expect(layer.fillType).toBe('pattern');
    expect(layer.fillPattern).toEqual({ url: '', scale: 100 });
    expect(layer.name).toBe('Pattern Fill');
  });

  it('addFillLayer inserts at the top of the layer stack', () => {
    addTestLayer('Bottom');
    useImageEditorStore.getState().addFillLayer('solid');

    const { layers } = useImageEditorStore.getState();
    expect(layers).toHaveLength(2);
    expect(layers[0].type).toBe('fill');
    expect(layers[1].name).toBe('Bottom');
  });
});

describe('Phase 3: Measure Tool', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('setMeasureLine stores a measure line', () => {
    const line = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, distance: 100, angle: 0 };
    useImageEditorStore.getState().setMeasureLine(line);

    expect(useImageEditorStore.getState().measureLine).toEqual(line);
  });

  it('setMeasureLine can clear the measure line with null', () => {
    useImageEditorStore.getState().setMeasureLine({ start: { x: 0, y: 0 }, end: { x: 50, y: 50 }, distance: 70.7, angle: 45 });
    useImageEditorStore.getState().setMeasureLine(null);

    expect(useImageEditorStore.getState().measureLine).toBeNull();
  });
});

describe('Phase 3: Transform Selection', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('transformSelection move shifts bounds by dx/dy', () => {
    setTestSelection();

    useImageEditorStore.getState().transformSelection('move', { dx: 15, dy: -5 });

    const bounds = useImageEditorStore.getState().selection?.bounds;
    expect(bounds?.x).toBe(25);
    expect(bounds?.y).toBe(15);
  });

  it('transformSelection scale multiplies width/height', () => {
    setTestSelection();

    useImageEditorStore.getState().transformSelection('scale', { scaleX: 2, scaleY: 0.5 });

    const bounds = useImageEditorStore.getState().selection?.bounds;
    expect(bounds?.width).toBe(200);
    expect(bounds?.height).toBe(40);
  });

  it('transformSelection does nothing when no selection exists', () => {
    useImageEditorStore.getState().transformSelection('move', { dx: 10, dy: 10 });
    expect(useImageEditorStore.getState().selection).toBeNull();
  });

  it('transformSelection does nothing when selection has no bounds', () => {
    useImageEditorStore.getState().setSelection({
      maskDataUrl: '',
      bounds: null,
      feather: 0,
      isInverted: false,
    });
    useImageEditorStore.getState().transformSelection('move', { dx: 10, dy: 10 });
    expect(useImageEditorStore.getState().selection?.bounds).toBeNull();
  });
});

describe('Phase 3: Frame Tool', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('addFrame creates a frame and sets it as active', () => {
    useImageEditorStore.getState().addFrame(10, 20, 200, 150);

    const { frames, activeFrameId, isDirty } = useImageEditorStore.getState();
    expect(frames).toHaveLength(1);
    expect(frames[0].x).toBe(10);
    expect(frames[0].y).toBe(20);
    expect(frames[0].width).toBe(200);
    expect(frames[0].height).toBe(150);
    expect(frames[0].name).toBe('Frame 1');
    expect(activeFrameId).toBe(frames[0].id);
    expect(isDirty).toBe(true);
  });

  it('addFrame increments frame name', () => {
    useImageEditorStore.getState().addFrame(0, 0, 100, 100);
    useImageEditorStore.getState().addFrame(0, 0, 200, 200);

    const { frames } = useImageEditorStore.getState();
    expect(frames[1].name).toBe('Frame 2');
  });

  it('deleteFrame removes frame and clears activeFrameId if deleted frame was active', () => {
    useImageEditorStore.getState().addFrame(0, 0, 100, 100);
    const frameId = useImageEditorStore.getState().frames[0].id;

    useImageEditorStore.getState().deleteFrame(frameId);
    expect(useImageEditorStore.getState().frames).toHaveLength(0);
    expect(useImageEditorStore.getState().activeFrameId).toBeNull();
  });

  it('deleteFrame preserves activeFrameId when deleting a non-active frame', () => {
    useImageEditorStore.getState().addFrame(0, 0, 100, 100);
    useImageEditorStore.getState().addFrame(0, 0, 200, 200);
    const [frame1, frame2] = useImageEditorStore.getState().frames;
    // Active is frame2 (last added)
    expect(useImageEditorStore.getState().activeFrameId).toBe(frame2.id);

    useImageEditorStore.getState().deleteFrame(frame1.id);
    expect(useImageEditorStore.getState().activeFrameId).toBe(frame2.id);
  });

  it('setActiveFrame changes the active frame', () => {
    useImageEditorStore.getState().addFrame(0, 0, 100, 100);
    const frameId = useImageEditorStore.getState().frames[0].id;

    useImageEditorStore.getState().setActiveFrame(null);
    expect(useImageEditorStore.getState().activeFrameId).toBeNull();

    useImageEditorStore.getState().setActiveFrame(frameId);
    expect(useImageEditorStore.getState().activeFrameId).toBe(frameId);
  });
});

describe('Phase 3: Swatches', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('addSwatch appends a new swatch', () => {
    const initialCount = useImageEditorStore.getState().swatches.length;
    useImageEditorStore.getState().addSwatch('Custom Pink', '#ff69b4', 'Custom');

    const { swatches } = useImageEditorStore.getState();
    expect(swatches).toHaveLength(initialCount + 1);
    const last = swatches[swatches.length - 1];
    expect(last.name).toBe('Custom Pink');
    expect(last.color).toBe('#ff69b4');
    expect(last.group).toBe('Custom');
  });

  it('addSwatch works without group', () => {
    useImageEditorStore.getState().addSwatch('No Group', '#aabbcc');
    const last = useImageEditorStore.getState().swatches.at(-1);
    expect(last?.group).toBeUndefined();
  });

  it('deleteSwatch removes the swatch by id', () => {
    const initialSwatches = useImageEditorStore.getState().swatches;
    const targetId = initialSwatches[0].id;

    useImageEditorStore.getState().deleteSwatch(targetId);
    const after = useImageEditorStore.getState().swatches;
    expect(after).toHaveLength(initialSwatches.length - 1);
    expect(after.find((s) => s.id === targetId)).toBeUndefined();
  });

  it('loadSwatchPreset replaces swatches with pastel preset', () => {
    useImageEditorStore.getState().loadSwatchPreset('pastel');
    const { swatches } = useImageEditorStore.getState();
    expect(swatches[0].name).toBe('Rose');
    expect(swatches).toHaveLength(8);
  });

  it('loadSwatchPreset replaces swatches with web-safe preset', () => {
    useImageEditorStore.getState().loadSwatchPreset('web-safe');
    const { swatches } = useImageEditorStore.getState();
    expect(swatches).toHaveLength(16);
    expect(swatches[0].name).toBe('Black');
  });

  it('loadSwatchPreset replaces swatches with pantone preset', () => {
    useImageEditorStore.getState().loadSwatchPreset('pantone');
    const { swatches } = useImageEditorStore.getState();
    expect(swatches).toHaveLength(8);
    expect(swatches[0].name).toBe('Living Coral');
  });

  it('loadSwatchPreset falls back to default for unknown preset', () => {
    // @ts-expect-error testing unknown preset
    useImageEditorStore.getState().loadSwatchPreset('unknown');
    const { swatches } = useImageEditorStore.getState();
    expect(swatches[0].name).toBe('Black');
    expect(swatches).toHaveLength(8);
  });
});

describe('Phase 3: Color Picker & Crop Overlay', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('setColorPickerMode updates the mode', () => {
    useImageEditorStore.getState().setColorPickerMode('rgb');
    expect(useImageEditorStore.getState().colorPickerMode).toBe('rgb');

    useImageEditorStore.getState().setColorPickerMode('cmyk');
    expect(useImageEditorStore.getState().colorPickerMode).toBe('cmyk');
  });

  it('setCropOverlay updates the crop overlay', () => {
    useImageEditorStore.getState().setCropOverlay('golden-ratio');
    expect(useImageEditorStore.getState().cropOverlay).toBe('golden-ratio');

    useImageEditorStore.getState().setCropOverlay('none');
    expect(useImageEditorStore.getState().cropOverlay).toBe('none');
  });
});

describe('Phase 3: Object Select & Patch Area', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('objectSelect creates a rectangular selection from bounds', () => {
    const bounds = { x: 10, y: 20, width: 50, height: 60 };
    useImageEditorStore.getState().objectSelect(bounds);

    const { selection, editMode } = useImageEditorStore.getState();
    expect(selection?.bounds).toEqual(bounds);
    expect(selection?.feather).toBe(0);
    expect(selection?.isInverted).toBe(false);
    expect(editMode).toBe('selection');
  });

  it('patchArea marks document as dirty', () => {
    const src = { x: 0, y: 0, width: 50, height: 50 };
    const tgt = { x: 100, y: 100, width: 50, height: 50 };
    useImageEditorStore.getState().patchArea(src, tgt);

    expect(useImageEditorStore.getState().isDirty).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 4
// ═══════════════════════════════════════════════════════════════════════════

describe('Phase 4: Text Enhancements', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('setTextType updates textSettings.textType', () => {
    useImageEditorStore.getState().setTextType('paragraph');
    expect(useImageEditorStore.getState().textSettings.textType).toBe('paragraph');

    useImageEditorStore.getState().setTextType('point');
    expect(useImageEditorStore.getState().textSettings.textType).toBe('point');
  });

  it('setParagraphSize sets dimensions and forces textType to paragraph', () => {
    useImageEditorStore.getState().setParagraphSize(300, 200);
    const { textSettings } = useImageEditorStore.getState();
    expect(textSettings.paragraphWidth).toBe(300);
    expect(textSettings.paragraphHeight).toBe(200);
    expect(textSettings.textType).toBe('paragraph');
  });

  it('setWarpStyle sets warp style and bend', () => {
    useImageEditorStore.getState().setWarpStyle('arc', 75);
    const { textSettings } = useImageEditorStore.getState();
    expect(textSettings.warpStyle).toBe('arc');
    expect(textSettings.warpBend).toBe(75);
  });

  it('setWarpStyle uses default bend of 50', () => {
    useImageEditorStore.getState().setWarpStyle('wave');
    expect(useImageEditorStore.getState().textSettings.warpBend).toBe(50);
  });

  it('setTypeOnPath sets pathId and resets offset/alignment', () => {
    const pathId = addTestPath();
    useImageEditorStore.getState().setTypeOnPath(pathId);

    const { textSettings } = useImageEditorStore.getState();
    expect(textSettings.pathId).toBe(pathId);
    expect(textSettings.pathOffset).toBe(0);
    expect(textSettings.pathAlignment).toBe('baseline');
  });

  it('setTypeOnPath clears pathId with undefined', () => {
    useImageEditorStore.getState().setTypeOnPath('some-path');
    useImageEditorStore.getState().setTypeOnPath(undefined);
    expect(useImageEditorStore.getState().textSettings.pathId).toBeUndefined();
  });
});

describe('Phase 4: Custom Shapes', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('addCustomShape appends a new shape definition', () => {
    const initialCount = useImageEditorStore.getState().customShapes.length;
    const shape = { id: 'cs-test', name: 'Test Shape', category: 'Custom', pathData: 'M0 0 L10 10' };
    useImageEditorStore.getState().addCustomShape(shape);

    const { customShapes } = useImageEditorStore.getState();
    expect(customShapes).toHaveLength(initialCount + 1);
    expect(customShapes.at(-1)?.id).toBe('cs-test');
  });

  it('setActiveCustomShape sets the id and switches shapeTool to custom', () => {
    useImageEditorStore.getState().setActiveCustomShape('cs-heart');
    const state = useImageEditorStore.getState();
    expect(state.activeCustomShapeId).toBe('cs-heart');
    expect(state.shapeTool).toBe('custom');
  });

  it('setActiveCustomShape with null resets shapeTool to rectangle', () => {
    useImageEditorStore.getState().setActiveCustomShape('cs-heart');
    useImageEditorStore.getState().setActiveCustomShape(null);
    const state = useImageEditorStore.getState();
    expect(state.activeCustomShapeId).toBeNull();
    expect(state.shapeTool).toBe('rectangle');
  });
});

describe('Phase 4: Path Operations', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('combinePaths merges points of selected paths into the first', () => {
    const pathId1 = addTestPath('Path 1');
    const pathId2 = addTestPath('Path 2');

    const point1: PathPoint = { x: 0, y: 0, handleIn: null, handleOut: null, type: 'corner' };
    const point2: PathPoint = { x: 10, y: 10, handleIn: null, handleOut: null, type: 'corner' };
    useImageEditorStore.getState().addPathPoint(pathId1, point1);
    useImageEditorStore.getState().addPathPoint(pathId2, point2);

    useImageEditorStore.getState().combinePaths([pathId1, pathId2], 'unite');

    const { paths, activePathId, isDirty } = useImageEditorStore.getState();
    // Should have merged into one path
    expect(paths).toHaveLength(1);
    expect(paths[0].id).toBe(pathId1);
    expect(paths[0].points).toHaveLength(2);
    expect(activePathId).toBe(pathId1);
    expect(isDirty).toBe(true);
  });

  it('combinePaths does nothing with fewer than 2 path IDs', () => {
    const pathId = addTestPath();
    useImageEditorStore.getState().combinePaths([pathId], 'unite');
    expect(useImageEditorStore.getState().paths).toHaveLength(1);
  });
});

describe('Phase 4: Export Settings', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('setExportSettings merges partial settings', () => {
    useImageEditorStore.getState().setExportSettings({ format: 'jpeg', quality: 80 });
    const { exportSettings } = useImageEditorStore.getState();
    expect(exportSettings.format).toBe('jpeg');
    expect(exportSettings.quality).toBe(80);
    // Unchanged defaults
    expect(exportSettings.scale).toBe(1);
    expect(exportSettings.transparency).toBe(true);
  });

  it('exportAs does not throw', () => {
    expect(() => {
      useImageEditorStore.getState().exportAs('png');
    }).not.toThrow();
  });
});

describe('Phase 4: Batch Processing', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('addBatchTask creates a pending task with generated id', () => {
    useImageEditorStore.getState().addBatchTask({
      name: 'Resize All',
      actionSetId: 'action-1',
      sourceFiles: ['/img/a.png', '/img/b.png'],
      outputFolder: '/out',
      outputFormat: 'jpeg',
      outputQuality: 85,
      totalCount: 2,
    });

    const { batchTasks } = useImageEditorStore.getState();
    expect(batchTasks).toHaveLength(1);
    expect(batchTasks[0].name).toBe('Resize All');
    expect(batchTasks[0].status).toBe('pending');
    expect(batchTasks[0].progress).toBe(0);
    expect(batchTasks[0].processedCount).toBe(0);
    expect(batchTasks[0].errors).toEqual([]);
    expect(batchTasks[0].id).toBeTruthy();
  });

  it('runBatchTask sets task status to running', () => {
    useImageEditorStore.getState().addBatchTask({
      name: 'Task',
      actionSetId: 'a',
      sourceFiles: [],
      outputFolder: '/out',
      outputFormat: 'png',
      outputQuality: 100,
      totalCount: 0,
    });
    const taskId = useImageEditorStore.getState().batchTasks[0].id;

    useImageEditorStore.getState().runBatchTask(taskId);
    expect(useImageEditorStore.getState().batchTasks[0].status).toBe('running');
  });

  it('cancelBatchTask sets task status to error with cancellation message', () => {
    useImageEditorStore.getState().addBatchTask({
      name: 'Task',
      actionSetId: 'a',
      sourceFiles: [],
      outputFolder: '/out',
      outputFormat: 'png',
      outputQuality: 100,
      totalCount: 0,
    });
    const taskId = useImageEditorStore.getState().batchTasks[0].id;

    useImageEditorStore.getState().cancelBatchTask(taskId);
    const task = useImageEditorStore.getState().batchTasks[0];
    expect(task.status).toBe('error');
    expect(task.errors).toContain('Cancelled by user');
  });
});

describe('Phase 4: Conditional Actions', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('addConditionalAction adds an action with generated id', () => {
    useImageEditorStore.getState().addConditionalAction({
      condition: { type: 'document-mode', value: 'rgb' },
      thenActionId: 'action-1',
      elseActionId: 'action-2',
    });

    const { conditionalActions } = useImageEditorStore.getState();
    expect(conditionalActions).toHaveLength(1);
    expect(conditionalActions[0].condition.type).toBe('document-mode');
    expect(conditionalActions[0].thenActionId).toBe('action-1');
    expect(conditionalActions[0].elseActionId).toBe('action-2');
    expect(conditionalActions[0].id).toBeTruthy();
  });

  it('removeConditionalAction removes the action by id', () => {
    useImageEditorStore.getState().addConditionalAction({
      condition: { type: 'layer-name-contains', value: 'bg' },
      thenActionId: 'act-1',
    });
    const actionId = useImageEditorStore.getState().conditionalActions[0].id;

    useImageEditorStore.getState().removeConditionalAction(actionId);
    expect(useImageEditorStore.getState().conditionalActions).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 5
// ═══════════════════════════════════════════════════════════════════════════

describe('Phase 5: Smart Objects', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('convertToSmartObject adds smartObject data to a layer', () => {
    const layerId = addTestLayer();
    useImageEditorStore.getState().updateLayer(layerId, { width: 800, height: 600 });

    useImageEditorStore.getState().convertToSmartObject(layerId);

    const layer = useImageEditorStore.getState().layers.find((l) => l.id === layerId);
    expect(layer?.smartObject).toBeDefined();
    expect(layer?.smartObject?.sourceType).toBe('embedded');
    expect(layer?.smartObject?.originalWidth).toBe(800);
    expect(layer?.smartObject?.originalHeight).toBe(600);
    expect(layer?.smartFilters).toEqual([]);
    expect(useImageEditorStore.getState().isDirty).toBe(true);
  });

  it('rasterizeSmartObject removes smartObject and smartFilters', () => {
    const layerId = addTestLayer();
    useImageEditorStore.getState().convertToSmartObject(layerId);
    useImageEditorStore.getState().addSmartFilter(layerId, 'blur', { radius: 5 });

    useImageEditorStore.getState().rasterizeSmartObject(layerId);

    const layer = useImageEditorStore.getState().layers.find((l) => l.id === layerId);
    expect(layer?.smartObject).toBeUndefined();
    expect(layer?.smartFilters).toBeUndefined();
  });
});

describe('Phase 5: Smart Filters', () => {
  let layerId: string;

  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
    layerId = addTestLayer();
    useImageEditorStore.getState().convertToSmartObject(layerId);
  });

  it('addSmartFilter appends a filter to a smart object layer', () => {
    useImageEditorStore.getState().addSmartFilter(layerId, 'gaussianBlur', { radius: 10 });

    const layer = useImageEditorStore.getState().layers.find((l) => l.id === layerId);
    expect(layer?.smartFilters).toHaveLength(1);
    expect(layer?.smartFilters?.[0].filterType).toBe('gaussianBlur');
    expect(layer?.smartFilters?.[0].enabled).toBe(true);
    expect(layer?.smartFilters?.[0].blendMode).toBe('normal');
    expect(layer?.smartFilters?.[0].opacity).toBe(100);
  });

  it('addSmartFilter does nothing on a non-smart-object layer', () => {
    const regularLayerId = addTestLayer('Regular');
    useImageEditorStore.getState().addSmartFilter(regularLayerId, 'blur', { radius: 5 });

    const layer = useImageEditorStore.getState().layers.find((l) => l.id === regularLayerId);
    expect(layer?.smartFilters).toBeUndefined();
  });

  it('removeSmartFilter removes a specific filter', () => {
    useImageEditorStore.getState().addSmartFilter(layerId, 'blur', { radius: 5 });
    useImageEditorStore.getState().addSmartFilter(layerId, 'sharpen', { amount: 50 });

    const filterId = useImageEditorStore.getState().layers.find((l) => l.id === layerId)!.smartFilters![0].id;
    useImageEditorStore.getState().removeSmartFilter(layerId, filterId);

    const layer = useImageEditorStore.getState().layers.find((l) => l.id === layerId);
    expect(layer?.smartFilters).toHaveLength(1);
    expect(layer?.smartFilters?.[0].filterType).toBe('sharpen');
  });

  it('toggleSmartFilter toggles the enabled state', () => {
    useImageEditorStore.getState().addSmartFilter(layerId, 'blur', { radius: 5 });
    const filterId = useImageEditorStore.getState().layers.find((l) => l.id === layerId)!.smartFilters![0].id;

    useImageEditorStore.getState().toggleSmartFilter(layerId, filterId);
    let filter = useImageEditorStore.getState().layers.find((l) => l.id === layerId)?.smartFilters?.[0];
    expect(filter?.enabled).toBe(false);

    useImageEditorStore.getState().toggleSmartFilter(layerId, filterId);
    filter = useImageEditorStore.getState().layers.find((l) => l.id === layerId)?.smartFilters?.[0];
    expect(filter?.enabled).toBe(true);
  });

  it('reorderSmartFilters moves a filter from one index to another', () => {
    useImageEditorStore.getState().addSmartFilter(layerId, 'blur', {});
    useImageEditorStore.getState().addSmartFilter(layerId, 'sharpen', {});
    useImageEditorStore.getState().addSmartFilter(layerId, 'noise', {});

    // Move filter at index 0 to index 2
    useImageEditorStore.getState().reorderSmartFilters(layerId, 0, 2);

    const filters = useImageEditorStore.getState().layers.find((l) => l.id === layerId)?.smartFilters;
    expect(filters?.[0].filterType).toBe('sharpen');
    expect(filters?.[1].filterType).toBe('noise');
    expect(filters?.[2].filterType).toBe('blur');
  });
});

describe('Phase 5: Linked Layers', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('linkLayers assigns the same linkedGroupId to all specified layers', () => {
    const id1 = addTestLayer('L1');
    const id2 = addTestLayer('L2');
    const id3 = addTestLayer('L3');

    useImageEditorStore.getState().linkLayers([id1, id2]);

    const layers = useImageEditorStore.getState().layers;
    const l1 = layers.find((l) => l.id === id1);
    const l2 = layers.find((l) => l.id === id2);
    const l3 = layers.find((l) => l.id === id3);

    expect(l1?.linkedGroupId).toBeTruthy();
    expect(l1?.linkedGroupId).toBe(l2?.linkedGroupId);
    expect(l3?.linkedGroupId).toBeUndefined();
    expect(useImageEditorStore.getState().isDirty).toBe(true);

    // Check linkedGroups record
    const groupId = l1!.linkedGroupId!;
    expect(useImageEditorStore.getState().linkedGroups[groupId]).toEqual([id1, id2]);
  });

  it('linkLayers does nothing with fewer than 2 layer IDs', () => {
    const id = addTestLayer();
    useImageEditorStore.getState().linkLayers([id]);

    const layer = useImageEditorStore.getState().layers.find((l) => l.id === id);
    expect(layer?.linkedGroupId).toBeUndefined();
  });

  it('unlinkLayers removes linkedGroupId from specified layers', () => {
    const id1 = addTestLayer('L1');
    const id2 = addTestLayer('L2');

    useImageEditorStore.getState().linkLayers([id1, id2]);
    const groupId = useImageEditorStore.getState().layers.find((l) => l.id === id1)!.linkedGroupId!;

    useImageEditorStore.getState().unlinkLayers([id1]);

    const l1 = useImageEditorStore.getState().layers.find((l) => l.id === id1);
    expect(l1?.linkedGroupId).toBeUndefined();
    // With only 1 remaining in the group record, the group entry is deleted
    expect(useImageEditorStore.getState().linkedGroups[groupId]).toBeUndefined();
    // Note: the remaining layer (l2) still retains its linkedGroupId on the layer object;
    // only the linkedGroups record is cleaned up.
    const l2 = useImageEditorStore.getState().layers.find((l) => l.id === id2);
    expect(l2?.linkedGroupId).toBe(groupId);
  });

  it('unlinkLayers keeps group when 2+ layers remain', () => {
    const id1 = addTestLayer('L1');
    const id2 = addTestLayer('L2');
    const id3 = addTestLayer('L3');

    useImageEditorStore.getState().linkLayers([id1, id2, id3]);
    const groupId = useImageEditorStore.getState().layers.find((l) => l.id === id1)!.linkedGroupId!;

    useImageEditorStore.getState().unlinkLayers([id1]);

    expect(useImageEditorStore.getState().linkedGroups[groupId]).toEqual([id2, id3]);
  });
});

describe('Phase 5: Blend If', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('setBlendIf assigns blendIf settings to a layer', () => {
    const layerId = addTestLayer();
    const settings: BlendIfSettings = {
      thisLayer: { shadows: [0, 20], highlights: [235, 255] },
      underlyingLayer: { shadows: [0, 10], highlights: [245, 255] },
      channel: 'gray',
    };

    useImageEditorStore.getState().setBlendIf(layerId, settings);

    const layer = useImageEditorStore.getState().layers.find((l) => l.id === layerId);
    expect(layer?.blendIf).toEqual(settings);
    expect(useImageEditorStore.getState().isDirty).toBe(true);
  });

  it('setBlendIf can clear blendIf with undefined', () => {
    const layerId = addTestLayer();
    const settings: BlendIfSettings = {
      thisLayer: { shadows: [0, 20], highlights: [235, 255] },
      underlyingLayer: { shadows: [0, 10], highlights: [245, 255] },
      channel: 'gray',
    };

    useImageEditorStore.getState().setBlendIf(layerId, settings);
    useImageEditorStore.getState().setBlendIf(layerId, undefined);

    const layer = useImageEditorStore.getState().layers.find((l) => l.id === layerId);
    expect(layer?.blendIf).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 6
// ═══════════════════════════════════════════════════════════════════════════

describe('Phase 6: Brush Presets', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('addBrushPreset appends a new preset with generated id', () => {
    const initialCount = useImageEditorStore.getState().brushPresets.length;
    useImageEditorStore.getState().addBrushPreset({
      name: 'Custom Brush',
      category: 'Custom',
      settings: { size: 30, hardness: 50, opacity: 100, flow: 100, color: '#ff0000', blendMode: 'normal' },
    });

    const { brushPresets } = useImageEditorStore.getState();
    expect(brushPresets).toHaveLength(initialCount + 1);
    const added = brushPresets.at(-1)!;
    expect(added.name).toBe('Custom Brush');
    expect(added.id).toBeTruthy();
  });

  it('deleteBrushPreset removes preset and clears activeBrushPresetId if active', () => {
    // Use the first default preset
    const presetId = useImageEditorStore.getState().brushPresets[0].id;
    useImageEditorStore.getState().applyBrushPreset(presetId);
    expect(useImageEditorStore.getState().activeBrushPresetId).toBe(presetId);

    useImageEditorStore.getState().deleteBrushPreset(presetId);
    expect(useImageEditorStore.getState().brushPresets.find((p) => p.id === presetId)).toBeUndefined();
    expect(useImageEditorStore.getState().activeBrushPresetId).toBeNull();
  });

  it('deleteBrushPreset preserves activeBrushPresetId when deleting non-active', () => {
    const presets = useImageEditorStore.getState().brushPresets;
    useImageEditorStore.getState().applyBrushPreset(presets[0].id);
    useImageEditorStore.getState().deleteBrushPreset(presets[1].id);
    expect(useImageEditorStore.getState().activeBrushPresetId).toBe(presets[0].id);
  });

  it('applyBrushPreset applies settings and dynamics from the preset', () => {
    const dynamics: BrushDynamics = {
      sizeJitter: 50,
      angleJitter: 30,
      scatterX: 100,
      scatterY: 100,
      spacing: 25,
      opacityJitter: 10,
      flowJitter: 10,
      roundnessJitter: 0,
      minimumDiameter: 10,
      pressureSensitive: true,
    };
    useImageEditorStore.getState().addBrushPreset({
      name: 'Dynamic Brush',
      category: 'Custom',
      settings: { size: 40, hardness: 80, opacity: 90, flow: 85, color: '#0000ff', blendMode: 'multiply' },
      dynamics,
    });
    const presetId = useImageEditorStore.getState().brushPresets.at(-1)!.id;

    useImageEditorStore.getState().applyBrushPreset(presetId);

    const { brushSettings, brushDynamics, activeBrushPresetId } = useImageEditorStore.getState();
    expect(brushSettings.size).toBe(40);
    expect(brushSettings.hardness).toBe(80);
    expect(brushSettings.blendMode).toBe('multiply');
    expect(brushDynamics).toEqual(dynamics);
    expect(activeBrushPresetId).toBe(presetId);
  });

  it('applyBrushPreset does nothing for non-existent preset id', () => {
    const before = useImageEditorStore.getState().brushSettings;
    useImageEditorStore.getState().applyBrushPreset('non-existent');
    expect(useImageEditorStore.getState().brushSettings).toEqual(before);
  });

  it('applyBrushPreset sets dynamics to null when preset has no dynamics', () => {
    // Set some dynamics first
    useImageEditorStore.getState().setBrushDynamics({
      sizeJitter: 50, angleJitter: 0, scatterX: 0, scatterY: 0,
      spacing: 25, opacityJitter: 0, flowJitter: 0, roundnessJitter: 0,
      minimumDiameter: 0, pressureSensitive: false,
    });

    const presetId = useImageEditorStore.getState().brushPresets[0].id;
    useImageEditorStore.getState().applyBrushPreset(presetId);
    expect(useImageEditorStore.getState().brushDynamics).toBeNull();
  });
});

describe('Phase 6: Brush Dynamics & Symmetry', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('setBrushDynamics sets dynamics configuration', () => {
    const dynamics: BrushDynamics = {
      sizeJitter: 25,
      angleJitter: 180,
      scatterX: 200,
      scatterY: 150,
      spacing: 50,
      opacityJitter: 20,
      flowJitter: 15,
      roundnessJitter: 10,
      minimumDiameter: 5,
      pressureSensitive: true,
    };
    useImageEditorStore.getState().setBrushDynamics(dynamics);
    expect(useImageEditorStore.getState().brushDynamics).toEqual(dynamics);
  });

  it('setBrushDynamics can be set to null', () => {
    useImageEditorStore.getState().setBrushDynamics({
      sizeJitter: 50, angleJitter: 0, scatterX: 0, scatterY: 0,
      spacing: 25, opacityJitter: 0, flowJitter: 0, roundnessJitter: 0,
      minimumDiameter: 0, pressureSensitive: false,
    });
    useImageEditorStore.getState().setBrushDynamics(null);
    expect(useImageEditorStore.getState().brushDynamics).toBeNull();
  });

  it('setSymmetryMode updates the symmetry mode', () => {
    useImageEditorStore.getState().setSymmetryMode('vertical');
    expect(useImageEditorStore.getState().symmetryMode).toBe('vertical');

    useImageEditorStore.getState().setSymmetryMode('radial-6');
    expect(useImageEditorStore.getState().symmetryMode).toBe('radial-6');

    useImageEditorStore.getState().setSymmetryMode('none');
    expect(useImageEditorStore.getState().symmetryMode).toBe('none');
  });
});

describe('Phase 6: Clone Source', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('setCloneSource merges partial settings', () => {
    useImageEditorStore.getState().setCloneSource({ offsetX: 50, offsetY: 30 });

    const { cloneSource } = useImageEditorStore.getState();
    expect(cloneSource.offsetX).toBe(50);
    expect(cloneSource.offsetY).toBe(30);
    // Unchanged defaults
    expect(cloneSource.angle).toBe(0);
    expect(cloneSource.scale).toBe(100);
    expect(cloneSource.showOverlay).toBe(false);
  });

  it('setCloneSource updates overlay settings', () => {
    useImageEditorStore.getState().setCloneSource({ showOverlay: true, overlayOpacity: 80 });

    const { cloneSource } = useImageEditorStore.getState();
    expect(cloneSource.showOverlay).toBe(true);
    expect(cloneSource.overlayOpacity).toBe(80);
  });
});

describe('Phase 6: Notes', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('addNote creates a note annotation', () => {
    useImageEditorStore.getState().addNote(100, 200, 'Fix this area');

    const { notes } = useImageEditorStore.getState();
    expect(notes).toHaveLength(1);
    expect(notes[0].x).toBe(100);
    expect(notes[0].y).toBe(200);
    expect(notes[0].text).toBe('Fix this area');
    expect(notes[0].author).toBe('User');
    expect(notes[0].color).toBe('#ffff00');
    expect(notes[0].isCollapsed).toBe(false);
    expect(notes[0].id).toBeTruthy();
    expect(notes[0].createdAt).toBeGreaterThan(0);
  });

  it('updateNote modifies specific fields', () => {
    useImageEditorStore.getState().addNote(0, 0, 'Original');
    const noteId = useImageEditorStore.getState().notes[0].id;

    useImageEditorStore.getState().updateNote(noteId, { text: 'Updated', isCollapsed: true, color: '#00ff00' });

    const note = useImageEditorStore.getState().notes[0];
    expect(note.text).toBe('Updated');
    expect(note.isCollapsed).toBe(true);
    expect(note.color).toBe('#00ff00');
    // Unchanged
    expect(note.x).toBe(0);
  });

  it('deleteNote removes the note', () => {
    useImageEditorStore.getState().addNote(0, 0, 'Note 1');
    useImageEditorStore.getState().addNote(10, 10, 'Note 2');
    const noteId = useImageEditorStore.getState().notes[0].id;

    useImageEditorStore.getState().deleteNote(noteId);
    expect(useImageEditorStore.getState().notes).toHaveLength(1);
    expect(useImageEditorStore.getState().notes[0].text).toBe('Note 2');
  });
});

describe('Phase 6: Artboards', () => {
  beforeEach(() => {
    useImageEditorStore.getState().resetEditor();
  });

  it('addArtboard creates an artboard and sets it as active', () => {
    useImageEditorStore.getState().addArtboard('Mobile', 0, 0, 375, 812);

    const { artboards, activeArtboardId } = useImageEditorStore.getState();
    expect(artboards).toHaveLength(1);
    expect(artboards[0].name).toBe('Mobile');
    expect(artboards[0].x).toBe(0);
    expect(artboards[0].y).toBe(0);
    expect(artboards[0].width).toBe(375);
    expect(artboards[0].height).toBe(812);
    expect(artboards[0].backgroundColor).toBe('#ffffff');
    expect(artboards[0].layerIds).toEqual([]);
    expect(activeArtboardId).toBe(artboards[0].id);
  });

  it('deleteArtboard removes the artboard and clears activeArtboardId if active', () => {
    useImageEditorStore.getState().addArtboard('Desktop', 0, 0, 1920, 1080);
    const artboardId = useImageEditorStore.getState().artboards[0].id;

    useImageEditorStore.getState().deleteArtboard(artboardId);
    expect(useImageEditorStore.getState().artboards).toHaveLength(0);
    expect(useImageEditorStore.getState().activeArtboardId).toBeNull();
  });

  it('deleteArtboard preserves activeArtboardId when deleting a non-active artboard', () => {
    useImageEditorStore.getState().addArtboard('A1', 0, 0, 100, 100);
    useImageEditorStore.getState().addArtboard('A2', 200, 0, 100, 100);
    const [a1, a2] = useImageEditorStore.getState().artboards;
    // Active should be a2 (last added)
    expect(useImageEditorStore.getState().activeArtboardId).toBe(a2.id);

    useImageEditorStore.getState().deleteArtboard(a1.id);
    expect(useImageEditorStore.getState().activeArtboardId).toBe(a2.id);
  });

  it('renameArtboard updates the name', () => {
    useImageEditorStore.getState().addArtboard('Old Name', 0, 0, 100, 100);
    const artboardId = useImageEditorStore.getState().artboards[0].id;

    useImageEditorStore.getState().renameArtboard(artboardId, 'New Name');
    expect(useImageEditorStore.getState().artboards[0].name).toBe('New Name');
  });

  it('setActiveArtboard changes the active artboard', () => {
    useImageEditorStore.getState().addArtboard('Board', 0, 0, 100, 100);
    const artboardId = useImageEditorStore.getState().artboards[0].id;

    useImageEditorStore.getState().setActiveArtboard(null);
    expect(useImageEditorStore.getState().activeArtboardId).toBeNull();

    useImageEditorStore.getState().setActiveArtboard(artboardId);
    expect(useImageEditorStore.getState().activeArtboardId).toBe(artboardId);
  });
});
