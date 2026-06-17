/**
 * Image Editor Store Unit Tests — Phase 7-19 Features
 *
 * Phase 7-10:  Filter gallery, extended filter/draw tools (store-level state)
 * Phase 11-B:  History Snapshots, Layer Align/Distribute, Smart Guides, Guide Layout
 * Phase 12-13: Render filters, advanced features (store-level state)
 * Phase 14-19: Extended state coverage for actions not yet tested
 *
 * Focus: Store actions that exist in imageEditor.store.ts but are NOT covered
 * by the existing test files (store.test.ts, phase3-6.test.ts, selectSubject.test.ts).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupImageEditorTestTab } from '@/test-utils/imageEditorHelpers';

// invertSelection은 maskDataUrl을 이미지로 로드해 픽셀을 반전한다 — jsdom은
// Image 로딩이 안 되므로 로드/직렬화 함수만 mock하고 나머지는 실제 구현 사용.
vi.mock('@/features/image-editor/canvas/selectionEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/image-editor/canvas/selectionEngine')>();
  return {
    ...actual,
    loadSelectionMask: vi.fn(async (_url: string, w: number, h: number) =>
      new Uint8ClampedArray(w * h).fill(255),
    ),
    maskToDataUrl: vi.fn(() => 'data:image/png;base64,MOCKMASK'),
  };
});
import { useImageEditorStore } from '../imageEditor.store';
import type {
  Layer,
  SelectionData,
  DropShadowSettings,
  GlowSettings,
} from '../imageEditor.store';
import type { IrisAsset } from '@/shared/api/types';
import type { HistogramData } from '@/features/image-editor/canvas/histogram';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const IMG = 'data:image/png;base64,AAAA';

function resetStore() {
  useImageEditorStore.getState().resetEditor();
}

function addLayer(name = 'Layer', opts: Partial<Layer> = {}): string {
  const id = useImageEditorStore.getState().addLayer(IMG, name);
  if (Object.keys(opts).length > 0) {
    useImageEditorStore.getState().updateLayer(id, opts);
  }
  return id;
}

function pushTestHistory(label = 'Test', data = IMG) {
  useImageEditorStore.getState().pushHistory(label, data);
}

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

// ═════════════════════════════════════════════════════════════════════════════
// Phase 11-B: History Snapshots
// ═════════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  setupImageEditorTestTab(); // fresh active tab per test (registry shim requires one)
});

describe('Phase 11-B: History Snapshots', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('createHistorySnapshot', () => {
    it('should create a snapshot from current history state', () => {
      addLayer('BG');
      pushTestHistory('Initial', IMG);

      useImageEditorStore.getState().createHistorySnapshot('Snapshot 1');

      const { historySnapshots } = useImageEditorStore.getState();
      expect(historySnapshots).toHaveLength(1);
      expect(historySnapshots[0].name).toBe('Snapshot 1');
      expect(historySnapshots[0].imageData).toBe(IMG);
      expect(historySnapshots[0].layers).toHaveLength(1);
      expect(historySnapshots[0].timestamp).toBeGreaterThan(0);
    });

    it('should not create a snapshot when no history exists', () => {
      useImageEditorStore.getState().createHistorySnapshot('Empty');

      const { historySnapshots } = useImageEditorStore.getState();
      expect(historySnapshots).toHaveLength(0);
    });

    it('should create multiple snapshots independently', () => {
      addLayer('BG');
      pushTestHistory('State A', 'data:a');
      useImageEditorStore.getState().createHistorySnapshot('Snap A');

      pushTestHistory('State B', 'data:b');
      useImageEditorStore.getState().createHistorySnapshot('Snap B');

      const { historySnapshots } = useImageEditorStore.getState();
      expect(historySnapshots).toHaveLength(2);
      expect(historySnapshots[0].name).toBe('Snap A');
      expect(historySnapshots[1].name).toBe('Snap B');
      expect(historySnapshots[0].imageData).toBe('data:a');
      expect(historySnapshots[1].imageData).toBe('data:b');
    });

    it('should capture layers at snapshot time', () => {
      const id1 = addLayer('Layer A');
      useImageEditorStore.getState().updateLayer(id1, { x: 10, y: 20 });
      pushTestHistory('With layers', IMG);

      useImageEditorStore.getState().createHistorySnapshot('Snap');

      const snap = useImageEditorStore.getState().historySnapshots[0];
      expect(snap.layers).toHaveLength(1);
      expect(snap.layers[0].name).toBe('Layer A');
    });
  });

  describe('restoreHistorySnapshot', () => {
    it('should restore layers from snapshot', () => {
      const id1 = addLayer('Original');
      pushTestHistory('Original', IMG);
      useImageEditorStore.getState().createHistorySnapshot('Before Edit');

      // Change the layer
      useImageEditorStore.getState().updateLayer(id1, { name: 'Modified' });
      pushTestHistory('Modified', 'data:modified');

      // Restore
      const snapId = useImageEditorStore.getState().historySnapshots[0].id;
      useImageEditorStore.getState().restoreHistorySnapshot(snapId);

      const { layers } = useImageEditorStore.getState();
      expect(layers[0].name).toBe('Original');
    });

    it('should push a new history entry after restore', () => {
      addLayer('BG');
      pushTestHistory('Initial', IMG);
      useImageEditorStore.getState().createHistorySnapshot('Snap');

      const historyLenBefore = useImageEditorStore.getState().history.length;

      const snapId = useImageEditorStore.getState().historySnapshots[0].id;
      useImageEditorStore.getState().restoreHistorySnapshot(snapId);

      const historyLenAfter = useImageEditorStore.getState().history.length;
      expect(historyLenAfter).toBe(historyLenBefore + 1);

      const lastHistory = useImageEditorStore.getState().history[useImageEditorStore.getState().historyIndex];
      expect(lastHistory.label).toContain('Restore Snapshot');
    });

    it('should do nothing for non-existent snapshot ID', () => {
      addLayer('BG');
      pushTestHistory('Init', IMG);
      const layersBefore = useImageEditorStore.getState().layers;

      useImageEditorStore.getState().restoreHistorySnapshot('non-existent-id');

      expect(useImageEditorStore.getState().layers).toEqual(layersBefore);
    });
  });

  describe('deleteHistorySnapshot', () => {
    it('should delete a snapshot by ID', () => {
      addLayer('BG');
      pushTestHistory('Init', IMG);
      useImageEditorStore.getState().createHistorySnapshot('To Delete');
      useImageEditorStore.getState().createHistorySnapshot('To Keep');

      const toDeleteId = useImageEditorStore.getState().historySnapshots[0].id;
      useImageEditorStore.getState().deleteHistorySnapshot(toDeleteId);

      const { historySnapshots } = useImageEditorStore.getState();
      expect(historySnapshots).toHaveLength(1);
      expect(historySnapshots[0].name).toBe('To Keep');
    });

    it('should do nothing for non-existent ID', () => {
      addLayer('BG');
      pushTestHistory('Init', IMG);
      useImageEditorStore.getState().createHistorySnapshot('Keep');

      useImageEditorStore.getState().deleteHistorySnapshot('fake-id');

      expect(useImageEditorStore.getState().historySnapshots).toHaveLength(1);
    });

    it('should handle deleting all snapshots', () => {
      addLayer('BG');
      pushTestHistory('Init', IMG);
      useImageEditorStore.getState().createHistorySnapshot('Only');

      const snapId = useImageEditorStore.getState().historySnapshots[0].id;
      useImageEditorStore.getState().deleteHistorySnapshot(snapId);

      expect(useImageEditorStore.getState().historySnapshots).toHaveLength(0);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Phase 11-B: Layer Align/Distribute
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase 11-B: Layer Align/Distribute', () => {
  let id1: string, id2: string, id3: string;

  beforeEach(() => {
    resetStore();
    id1 = addLayer('A', { x: 0, y: 0, width: 100, height: 100 });
    id2 = addLayer('B', { x: 200, y: 200, width: 100, height: 100 });
    id3 = addLayer('C', { x: 400, y: 400, width: 100, height: 100 });
  });

  describe('alignLayers', () => {
    it('should align left — all layers x = 0 (min x)', () => {
      useImageEditorStore.getState().alignLayers('left', [id1, id2, id3]);

      const layers = useImageEditorStore.getState().layers;
      layers.forEach((l) => {
        expect(l.x).toBe(0);
      });
    });

    it('should align right — all layers right edge = max right', () => {
      useImageEditorStore.getState().alignLayers('right', [id1, id2, id3]);

      const layers = useImageEditorStore.getState().layers;
      // maxX = 400 + 100 = 500, so each layer.x = 500 - layer.width = 400
      layers.forEach((l) => {
        expect(l.x).toBe(400);
      });
    });

    it('should align top — all layers y = 0 (min y)', () => {
      useImageEditorStore.getState().alignLayers('top', [id1, id2, id3]);

      const layers = useImageEditorStore.getState().layers;
      layers.forEach((l) => {
        expect(l.y).toBe(0);
      });
    });

    it('should align bottom — all layers bottom edge = max bottom', () => {
      useImageEditorStore.getState().alignLayers('bottom', [id1, id2, id3]);

      const layers = useImageEditorStore.getState().layers;
      // maxY = 400 + 100 = 500, so each layer.y = 500 - 100 = 400
      layers.forEach((l) => {
        expect(l.y).toBe(400);
      });
    });

    it('should align center horizontally', () => {
      useImageEditorStore.getState().alignLayers('center', [id1, id2, id3]);

      const layers = useImageEditorStore.getState().layers;
      // center = 0 + (500 - 0) / 2 = 250. Each x = 250 - width/2 = 200
      layers.forEach((l) => {
        expect(l.x).toBe(200);
      });
    });

    it('should align middle vertically', () => {
      useImageEditorStore.getState().alignLayers('middle', [id1, id2, id3]);

      const layers = useImageEditorStore.getState().layers;
      // middle = 0 + (500 - 0) / 2 = 250. Each y = 250 - height/2 = 200
      layers.forEach((l) => {
        expect(l.y).toBe(200);
      });
    });

    it('should mark state as dirty after alignment', () => {
      useImageEditorStore.setState({ isDirty: false });
      useImageEditorStore.getState().alignLayers('left', [id1, id2]);

      expect(useImageEditorStore.getState().isDirty).toBe(true);
    });

    it('should ignore when fewer than 2 layer IDs provided', () => {
      const beforeLayers = useImageEditorStore.getState().layers.map((l) => ({ ...l }));
      useImageEditorStore.setState({ isDirty: false });

      useImageEditorStore.getState().alignLayers('left', [id1]);

      const afterLayers = useImageEditorStore.getState().layers;
      expect(afterLayers[0].x).toBe(beforeLayers[0].x);
      expect(useImageEditorStore.getState().isDirty).toBe(false);
    });

    it('should not affect layers outside the provided IDs', () => {
      useImageEditorStore.getState().alignLayers('left', [id2, id3]);

      const layerA = useImageEditorStore.getState().layers.find((l) => l.id === id1);
      expect(layerA!.x).toBe(0); // unchanged
    });
  });

  describe('distributeLayers', () => {
    it('should distribute horizontally — evenly space centers', () => {
      useImageEditorStore.getState().distributeLayers('horizontal', [id1, id2, id3]);

      const layers = useImageEditorStore.getState().layers;
      const sorted = [...layers].sort((a, b) => a.x - b.x);

      // Layer A center = 50, Layer C center = 450 → step = 200
      // Layer B center should be 250 → x = 200
      expect(sorted[0].x).toBe(0);   // A unchanged (first)
      expect(sorted[1].x).toBe(200); // B repositioned
      expect(sorted[2].x).toBe(400); // C unchanged (last)
    });

    it('should distribute vertically — evenly space centers', () => {
      useImageEditorStore.getState().distributeLayers('vertical', [id1, id2, id3]);

      const layers = useImageEditorStore.getState().layers;
      const sorted = [...layers].sort((a, b) => a.y - b.y);

      expect(sorted[0].y).toBe(0);
      expect(sorted[1].y).toBe(200);
      expect(sorted[2].y).toBe(400);
    });

    it('should mark state as dirty', () => {
      useImageEditorStore.setState({ isDirty: false });
      useImageEditorStore.getState().distributeLayers('horizontal', [id1, id2, id3]);

      expect(useImageEditorStore.getState().isDirty).toBe(true);
    });

    it('should require at least 3 layers', () => {
      useImageEditorStore.setState({ isDirty: false });
      useImageEditorStore.getState().distributeLayers('horizontal', [id1, id2]);

      // No change — still false
      expect(useImageEditorStore.getState().isDirty).toBe(false);
    });

    it('should not affect layers outside the provided IDs', () => {
      const id4 = addLayer('D', { x: 600, y: 600, width: 100, height: 100 });
      useImageEditorStore.getState().distributeLayers('horizontal', [id1, id2, id3]);

      const layerD = useImageEditorStore.getState().layers.find((l) => l.id === id4);
      expect(layerD!.x).toBe(600); // unchanged
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Phase 11-B: Smart Guides
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase 11-B: Smart Guides', () => {
  beforeEach(() => {
    resetStore();
  });

  it('should have smart guides enabled by default', () => {
    expect(useImageEditorStore.getState().smartGuidesEnabled).toBe(true);
  });

  it('toggleSmartGuides disables then re-enables', () => {
    useImageEditorStore.getState().toggleSmartGuides();
    expect(useImageEditorStore.getState().smartGuidesEnabled).toBe(false);

    useImageEditorStore.getState().toggleSmartGuides();
    expect(useImageEditorStore.getState().smartGuidesEnabled).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Phase 11-B: Guide Layout
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase 11-B: createGuideLayout', () => {
  beforeEach(() => {
    resetStore();
  });

  it('should create column guides for a 3-column layout with no gutter', () => {
    addLayer('Canvas', { x: 0, y: 0, width: 300, height: 300 });

    useImageEditorStore.getState().createGuideLayout(3, 1, 0, 0);

    const { guides, showGuides } = useImageEditorStore.getState();
    expect(showGuides).toBe(true);
    // 3 columns of 100px → guides at x=100, x=200
    expect(guides.vertical).toEqual([100, 200]);
    // 1 row → no horizontal guides
    expect(guides.horizontal).toEqual([]);
  });

  it('should create row guides for a 2-row layout with no gutter', () => {
    addLayer('Canvas', { x: 0, y: 0, width: 400, height: 600 });

    useImageEditorStore.getState().createGuideLayout(1, 2, 0, 0);

    const { guides } = useImageEditorStore.getState();
    // 2 rows of 300px → guide at y=300
    expect(guides.horizontal).toEqual([300]);
    expect(guides.vertical).toEqual([]);
  });

  it('should create guides with gutters', () => {
    addLayer('Canvas', { x: 0, y: 0, width: 320, height: 200 });

    // 2 columns with 20px gutter: columnWidth = (320 - 20) / 2 = 150
    useImageEditorStore.getState().createGuideLayout(2, 1, 20, 0);

    const { guides } = useImageEditorStore.getState();
    // Column guides: gutterLeft=150, gutterRight=170
    expect(guides.vertical).toEqual([150, 170]);
  });

  it('should not create guides when no layers exist', () => {
    useImageEditorStore.getState().createGuideLayout(3, 3, 10, 10);

    const { guides } = useImageEditorStore.getState();
    expect(guides.horizontal).toEqual([]);
    expect(guides.vertical).toEqual([]);
  });

  it('should enable showGuides after creating layout', () => {
    addLayer('Canvas', { x: 0, y: 0, width: 100, height: 100 });
    useImageEditorStore.setState({ showGuides: false });

    useImageEditorStore.getState().createGuideLayout(2, 2, 0, 0);

    expect(useImageEditorStore.getState().showGuides).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Extended History State Coverage (branching, goToHistoryState)
// ═════════════════════════════════════════════════════════════════════════════

describe('History: advanced branching and navigation', () => {
  beforeEach(() => {
    resetStore();
    addLayer('BG');
  });

  it('pushHistory truncates future states when in middle of history', () => {
    pushTestHistory('State 1', 'data:1');
    pushTestHistory('State 2', 'data:2');
    pushTestHistory('State 3', 'data:3');

    // Go back to state 1
    useImageEditorStore.getState().goToHistoryState(0);
    expect(useImageEditorStore.getState().historyIndex).toBe(0);

    // Push new state — should truncate states 2 and 3
    pushTestHistory('State 4', 'data:4');

    const { history, historyIndex } = useImageEditorStore.getState();
    expect(history).toHaveLength(2); // State 1 + State 4
    expect(historyIndex).toBe(1);
    expect(history[1].label).toBe('State 4');
  });

  it('goToHistoryState restores layers from target state', () => {
    pushTestHistory('State A', 'data:a');
    const layersAtA = useImageEditorStore.getState().layers.map((l) => l.name);

    addLayer('New Layer');
    pushTestHistory('State B', 'data:b');

    useImageEditorStore.getState().goToHistoryState(0);

    const { layers } = useImageEditorStore.getState();
    expect(layers.map((l) => l.name)).toEqual(layersAtA);
  });

  it('goToHistoryState does nothing for out-of-range index', () => {
    pushTestHistory('State 1', 'data:1');
    const indexBefore = useImageEditorStore.getState().historyIndex;

    useImageEditorStore.getState().goToHistoryState(-1);
    expect(useImageEditorStore.getState().historyIndex).toBe(indexBefore);

    useImageEditorStore.getState().goToHistoryState(999);
    expect(useImageEditorStore.getState().historyIndex).toBe(indexBefore);
  });

  it('undo restores previous layers', () => {
    pushTestHistory('State 1', 'data:1');
    addLayer('Extra');
    pushTestHistory('State 2', 'data:2');

    useImageEditorStore.getState().undo();

    expect(useImageEditorStore.getState().historyIndex).toBe(0);
  });

  it('redo moves forward in history', () => {
    pushTestHistory('State 1', 'data:1');
    pushTestHistory('State 2', 'data:2');
    useImageEditorStore.getState().undo();

    useImageEditorStore.getState().redo();

    expect(useImageEditorStore.getState().historyIndex).toBe(1);
  });

  it('canUndo returns false at beginning', () => {
    pushTestHistory('State 1', 'data:1');
    expect(useImageEditorStore.getState().canUndo()).toBe(false);
  });

  it('canUndo returns true when historyIndex > 0', () => {
    pushTestHistory('State 1', 'data:1');
    pushTestHistory('State 2', 'data:2');
    expect(useImageEditorStore.getState().canUndo()).toBe(true);
  });

  it('canRedo returns false at end of history', () => {
    pushTestHistory('State 1', 'data:1');
    expect(useImageEditorStore.getState().canRedo()).toBe(false);
  });

  it('canRedo returns true after undo', () => {
    pushTestHistory('State 1', 'data:1');
    pushTestHistory('State 2', 'data:2');
    useImageEditorStore.getState().undo();
    expect(useImageEditorStore.getState().canRedo()).toBe(true);
  });

  it('clearHistory resets history array and index', () => {
    pushTestHistory('State 1', 'data:1');
    pushTestHistory('State 2', 'data:2');

    useImageEditorStore.getState().clearHistory();

    const { history, historyIndex } = useImageEditorStore.getState();
    expect(history).toHaveLength(0);
    expect(historyIndex).toBe(-1);
  });

  it('pushHistory limits history to maxHistoryStates', () => {
    useImageEditorStore.setState({ maxHistoryStates: 5 });

    for (let i = 0; i < 10; i++) {
      pushTestHistory(`State ${i}`, `data:${i}`);
    }

    const { history } = useImageEditorStore.getState();
    expect(history.length).toBeLessThanOrEqual(5);
    // Last entry should be "State 9"
    expect(history[history.length - 1].label).toBe('State 9');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Canvas Controls — zoom clamping and edge cases
// ═════════════════════════════════════════════════════════════════════════════

describe('Canvas Controls: zoom', () => {
  beforeEach(() => {
    resetStore();
  });

  it('setZoom clamps to minimum 10', () => {
    useImageEditorStore.getState().setZoom(1);
    expect(useImageEditorStore.getState().zoom).toBe(10);
  });

  it('setZoom clamps to maximum 400', () => {
    useImageEditorStore.getState().setZoom(1000);
    expect(useImageEditorStore.getState().zoom).toBe(400);
  });

  it('zoomIn multiplies by 1.25', () => {
    useImageEditorStore.setState({ zoom: 100 });
    useImageEditorStore.getState().zoomIn();
    expect(useImageEditorStore.getState().zoom).toBe(125);
  });

  it('zoomIn does not exceed 400', () => {
    useImageEditorStore.setState({ zoom: 380 });
    useImageEditorStore.getState().zoomIn();
    expect(useImageEditorStore.getState().zoom).toBe(400);
  });

  it('zoomOut divides by 1.25', () => {
    useImageEditorStore.setState({ zoom: 100 });
    useImageEditorStore.getState().zoomOut();
    expect(useImageEditorStore.getState().zoom).toBe(80);
  });

  it('zoomOut does not go below 10', () => {
    useImageEditorStore.setState({ zoom: 12 });
    useImageEditorStore.getState().zoomOut();
    expect(useImageEditorStore.getState().zoom).toBe(10);
  });

  it('zoomToFit resets zoom to 100 and panOffset to origin', () => {
    useImageEditorStore.setState({ zoom: 250, panOffset: { x: 100, y: 50 } });
    useImageEditorStore.getState().zoomToFit();
    expect(useImageEditorStore.getState().zoom).toBe(100);
    expect(useImageEditorStore.getState().panOffset).toEqual({ x: 0, y: 0 });
  });

  it('zoomTo100 resets zoom to 100', () => {
    useImageEditorStore.setState({ zoom: 50 });
    useImageEditorStore.getState().zoomTo100();
    expect(useImageEditorStore.getState().zoom).toBe(100);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Mode & Tools — coverage for setEditMode, setActiveTool, etc.
// ═════════════════════════════════════════════════════════════════════════════

describe('Mode & Tool State', () => {
  beforeEach(() => {
    resetStore();
  });

  it('setEditMode stores previousMode', () => {
    useImageEditorStore.getState().setEditMode('drawing');
    expect(useImageEditorStore.getState().editMode).toBe('drawing');
    expect(useImageEditorStore.getState().previousMode).toBe('move'); // initial was 'move'

    useImageEditorStore.getState().setEditMode('adjust');
    expect(useImageEditorStore.getState().previousMode).toBe('drawing');
  });

  it('setActiveTool updates the drawing tool', () => {
    useImageEditorStore.getState().setActiveTool('clone');
    expect(useImageEditorStore.getState().activeTool).toBe('clone');
  });

  it('setSelectionTool updates selection tool', () => {
    useImageEditorStore.getState().setSelectionTool('magneticLasso');
    expect(useImageEditorStore.getState().selectionTool).toBe('magneticLasso');
  });

  it('setShapeTool updates shape tool', () => {
    useImageEditorStore.getState().setShapeTool('star');
    expect(useImageEditorStore.getState().shapeTool).toBe('star');
  });

  it('setSpongeMode sets sponge mode', () => {
    useImageEditorStore.getState().setSpongeMode('desaturate');
    expect(useImageEditorStore.getState().spongeMode).toBe('desaturate');
  });

  it('setLocalAdjustStrength updates strength', () => {
    useImageEditorStore.getState().setLocalAdjustStrength(75);
    expect(useImageEditorStore.getState().localAdjustStrength).toBe(75);
  });

  it('setDodgeBurnSettings updates partially', () => {
    useImageEditorStore.getState().setDodgeBurnSettings({ exposure: 80 });
    const { dodgeBurnSettings } = useImageEditorStore.getState();
    expect(dodgeBurnSettings.exposure).toBe(80);
    expect(dodgeBurnSettings.range).toBe('midtones'); // unchanged
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Brush Settings & Gradient/Shape Settings
// ═════════════════════════════════════════════════════════════════════════════

describe('Settings: Brush, Gradient, Shape', () => {
  beforeEach(() => {
    resetStore();
  });

  it('setBrushSettings merges partial settings', () => {
    useImageEditorStore.getState().setBrushSettings({ size: 50, hardness: 75 });
    const bs = useImageEditorStore.getState().brushSettings;
    expect(bs.size).toBe(50);
    expect(bs.hardness).toBe(75);
    expect(bs.color).toBe('#000000'); // default preserved
  });

  it('setGradientSettings merges partial settings', () => {
    useImageEditorStore.getState().setGradientSettings({ type: 'radial', angle: 45 });
    const gs = useImageEditorStore.getState().gradientSettings;
    expect(gs.type).toBe('radial');
    expect(gs.angle).toBe(45);
    expect(gs.reverse).toBe(false); // default preserved
  });

  it('setShapeSettings merges partial settings', () => {
    useImageEditorStore.getState().setShapeSettings({ sides: 8, cornerRadius: 10 });
    const ss = useImageEditorStore.getState().shapeSettings;
    expect(ss.sides).toBe(8);
    expect(ss.cornerRadius).toBe(10);
    expect(ss.fillColor).toBe('#3b82f6'); // default preserved
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Text Settings — Phase 4 extensions (warp, paragraph, type-on-path)
// ═════════════════════════════════════════════════════════════════════════════

describe('Text Settings: Phase 4 Extensions', () => {
  beforeEach(() => {
    resetStore();
  });

  it('setTextType changes text type to paragraph', () => {
    useImageEditorStore.getState().setTextType('paragraph');
    expect(useImageEditorStore.getState().textSettings.textType).toBe('paragraph');
  });

  it('setTextType changes text type to point', () => {
    useImageEditorStore.getState().setTextType('point');
    expect(useImageEditorStore.getState().textSettings.textType).toBe('point');
  });

  it('setParagraphSize sets width, height, and textType', () => {
    useImageEditorStore.getState().setParagraphSize(200, 300);
    const ts = useImageEditorStore.getState().textSettings;
    expect(ts.paragraphWidth).toBe(200);
    expect(ts.paragraphHeight).toBe(300);
    expect(ts.textType).toBe('paragraph');
  });

  it('setWarpStyle sets warp style and bend', () => {
    useImageEditorStore.getState().setWarpStyle('wave', 75);
    const ts = useImageEditorStore.getState().textSettings;
    expect(ts.warpStyle).toBe('wave');
    expect(ts.warpBend).toBe(75);
  });

  it('setWarpStyle uses default bend of 50', () => {
    useImageEditorStore.getState().setWarpStyle('arc');
    expect(useImageEditorStore.getState().textSettings.warpBend).toBe(50);
  });

  it('setTypeOnPath sets pathId and defaults', () => {
    useImageEditorStore.getState().setTypeOnPath('path-123');
    const ts = useImageEditorStore.getState().textSettings;
    expect(ts.pathId).toBe('path-123');
    expect(ts.pathOffset).toBe(0);
    expect(ts.pathAlignment).toBe('baseline');
  });

  it('setTypeOnPath clears pathId with undefined', () => {
    useImageEditorStore.getState().setTypeOnPath('path-123');
    useImageEditorStore.getState().setTypeOnPath(undefined);
    expect(useImageEditorStore.getState().textSettings.pathId).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Warp Transform State
// ═════════════════════════════════════════════════════════════════════════════

describe('Warp Transform State', () => {
  beforeEach(() => {
    resetStore();
  });

  it('enterWarpMode initializes 3x3 grid for active layer', () => {
    addLayer('Source', { width: 200, height: 100 });

    useImageEditorStore.getState().enterWarpMode();

    const { isWarpMode, warpGrid } = useImageEditorStore.getState();
    expect(isWarpMode).toBe(true);
    expect(warpGrid).not.toBeNull();
    expect(warpGrid).toHaveLength(3);
    expect(warpGrid![0]).toHaveLength(3);

    // Check corners
    expect(warpGrid![0][0]).toEqual({ x: 0, y: 0 });
    expect(warpGrid![0][2]).toEqual({ x: 200, y: 0 });
    expect(warpGrid![2][0]).toEqual({ x: 0, y: 100 });
    expect(warpGrid![2][2]).toEqual({ x: 200, y: 100 });
  });

  it('enterWarpMode does nothing when no layers exist', () => {
    useImageEditorStore.getState().enterWarpMode();
    expect(useImageEditorStore.getState().isWarpMode).toBe(false);
  });

  it('exitWarpMode clears warp state', () => {
    addLayer('Source', { width: 200, height: 100 });
    useImageEditorStore.getState().enterWarpMode();
    useImageEditorStore.getState().exitWarpMode();

    expect(useImageEditorStore.getState().isWarpMode).toBe(false);
    expect(useImageEditorStore.getState().warpGrid).toBeNull();
  });

  it('updateWarpPoint modifies a single grid point', () => {
    addLayer('Source', { width: 200, height: 200 });
    useImageEditorStore.getState().enterWarpMode();

    useImageEditorStore.getState().updateWarpPoint(1, 1, 120, 130);

    const { warpGrid } = useImageEditorStore.getState();
    expect(warpGrid![1][1]).toEqual({ x: 120, y: 130 });
    // Other points unchanged
    expect(warpGrid![0][0]).toEqual({ x: 0, y: 0 });
  });

  it('updateWarpPoint does nothing when warpGrid is null', () => {
    useImageEditorStore.getState().updateWarpPoint(0, 0, 50, 50);
    expect(useImageEditorStore.getState().warpGrid).toBeNull();
  });

  it('resetWarpGrid restores default grid positions', () => {
    addLayer('Source', { width: 300, height: 300 });
    useImageEditorStore.getState().enterWarpMode();
    useImageEditorStore.getState().updateWarpPoint(1, 1, 999, 999);

    useImageEditorStore.getState().resetWarpGrid();

    const { warpGrid } = useImageEditorStore.getState();
    expect(warpGrid![1][1]).toEqual({ x: 150, y: 150 }); // center of 300x300
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Selection State — invertSelection, clearSelection, edge cases
// ═════════════════════════════════════════════════════════════════════════════

describe('Selection State: additional coverage', () => {
  beforeEach(() => {
    resetStore();
  });

  it('invertSelection toggles isInverted', async () => {
    setTestSelection();
    await useImageEditorStore.getState().invertSelection();
    expect(useImageEditorStore.getState().selection!.isInverted).toBe(true);

    await useImageEditorStore.getState().invertSelection();
    expect(useImageEditorStore.getState().selection!.isInverted).toBe(false);
  });

  it('invertSelection does nothing when no selection', () => {
    useImageEditorStore.getState().invertSelection();
    expect(useImageEditorStore.getState().selection).toBeNull();
  });

  it('clearSelection sets selection to null', () => {
    setTestSelection();
    useImageEditorStore.getState().clearSelection();
    expect(useImageEditorStore.getState().selection).toBeNull();
  });

  it('setSelectionAntiAlias toggles anti-alias', () => {
    expect(useImageEditorStore.getState().selectionAntiAlias).toBe(true);
    useImageEditorStore.getState().setSelectionAntiAlias(false);
    expect(useImageEditorStore.getState().selectionAntiAlias).toBe(false);
  });

  it('setQuickSelectBrushSize clamps 1-200', () => {
    useImageEditorStore.getState().setQuickSelectBrushSize(0);
    expect(useImageEditorStore.getState().quickSelectBrushSize).toBe(1);

    useImageEditorStore.getState().setQuickSelectBrushSize(300);
    expect(useImageEditorStore.getState().quickSelectBrushSize).toBe(200);

    useImageEditorStore.getState().setQuickSelectBrushSize(50);
    expect(useImageEditorStore.getState().quickSelectBrushSize).toBe(50);
  });

  it('setQuickSelectSampleAll sets boolean', () => {
    useImageEditorStore.getState().setQuickSelectSampleAll(true);
    expect(useImageEditorStore.getState().quickSelectSampleAll).toBe(true);
  });

  it('setColorRangeColor sets color', () => {
    useImageEditorStore.getState().setColorRangeColor('#ff0000');
    expect(useImageEditorStore.getState().colorRangeColor).toBe('#ff0000');
  });

  it('setColorRangeTolerance clamps 0-255', () => {
    useImageEditorStore.getState().setColorRangeTolerance(-10);
    expect(useImageEditorStore.getState().colorRangeTolerance).toBe(0);

    useImageEditorStore.getState().setColorRangeTolerance(300);
    expect(useImageEditorStore.getState().colorRangeTolerance).toBe(255);
  });

  it('setColorRangeFuzziness clamps 0-100', () => {
    useImageEditorStore.getState().setColorRangeFuzziness(-10);
    expect(useImageEditorStore.getState().colorRangeFuzziness).toBe(0);

    useImageEditorStore.getState().setColorRangeFuzziness(200);
    expect(useImageEditorStore.getState().colorRangeFuzziness).toBe(100);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Crop State
// ═════════════════════════════════════════════════════════════════════════════

describe('Crop State', () => {
  beforeEach(() => {
    resetStore();
  });

  it('setCropData sets crop data', () => {
    useImageEditorStore.getState().setCropData({ x: 10, y: 20, width: 100, height: 80 });
    expect(useImageEditorStore.getState().cropData).toEqual({ x: 10, y: 20, width: 100, height: 80 });
  });

  it('setCropData clears with null', () => {
    useImageEditorStore.getState().setCropData({ x: 0, y: 0, width: 50, height: 50 });
    useImageEditorStore.getState().setCropData(null);
    expect(useImageEditorStore.getState().cropData).toBeNull();
  });

  it('setCropAspectRatio updates ratio', () => {
    useImageEditorStore.getState().setCropAspectRatio('16:9');
    expect(useImageEditorStore.getState().cropAspectRatio).toBe('16:9');
  });

  it('applyCrop resets when no callback registered', () => {
    useImageEditorStore.getState().setCropData({ x: 0, y: 0, width: 50, height: 50 });
    useImageEditorStore.getState().applyCrop();
    expect(useImageEditorStore.getState().cropData).toBeNull();
    expect(useImageEditorStore.getState().editMode).toBe('move');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// UI Toggles
// ═════════════════════════════════════════════════════════════════════════════

describe('UI Toggles', () => {
  beforeEach(() => {
    resetStore();
  });

  it('toggleGrid toggles showGrid', () => {
    expect(useImageEditorStore.getState().showGrid).toBe(false);
    useImageEditorStore.getState().toggleGrid();
    expect(useImageEditorStore.getState().showGrid).toBe(true);
  });

  it('toggleRulers toggles showRulers', () => {
    useImageEditorStore.getState().toggleRulers();
    expect(useImageEditorStore.getState().showRulers).toBe(true);
  });

  it('toggleGuides toggles showGuides', () => {
    useImageEditorStore.getState().toggleGuides();
    expect(useImageEditorStore.getState().showGuides).toBe(true);
  });

  it('toggleSnapToGrid toggles snapToGrid', () => {
    useImageEditorStore.getState().toggleSnapToGrid();
    expect(useImageEditorStore.getState().snapToGrid).toBe(true);
  });

  it('setGridSize clamps 1-100', () => {
    useImageEditorStore.getState().setGridSize(0);
    expect(useImageEditorStore.getState().gridSize).toBe(1);

    useImageEditorStore.getState().setGridSize(200);
    expect(useImageEditorStore.getState().gridSize).toBe(100);

    useImageEditorStore.getState().setGridSize(25);
    expect(useImageEditorStore.getState().gridSize).toBe(25);
  });

  it('addGuide adds horizontal and vertical guides', () => {
    useImageEditorStore.getState().addGuide('horizontal', 100);
    useImageEditorStore.getState().addGuide('vertical', 200);

    const { guides } = useImageEditorStore.getState();
    expect(guides.horizontal).toEqual([100]);
    expect(guides.vertical).toEqual([200]);
  });

  it('removeGuide removes by index', () => {
    useImageEditorStore.getState().addGuide('horizontal', 100);
    useImageEditorStore.getState().addGuide('horizontal', 200);
    useImageEditorStore.getState().removeGuide('horizontal', 0);

    expect(useImageEditorStore.getState().guides.horizontal).toEqual([200]);
  });

  it('clearGuides removes all guides', () => {
    useImageEditorStore.getState().addGuide('horizontal', 100);
    useImageEditorStore.getState().addGuide('vertical', 200);
    useImageEditorStore.getState().clearGuides();

    const { guides } = useImageEditorStore.getState();
    expect(guides.horizontal).toEqual([]);
    expect(guides.vertical).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Panel Visibility & Right Panel Tab
// ═════════════════════════════════════════════════════════════════════════════

describe('Panel Visibility', () => {
  beforeEach(() => {
    resetStore();
  });

  it('toggleLayersPanel', () => {
    const initial = useImageEditorStore.getState().showLayersPanel;
    useImageEditorStore.getState().toggleLayersPanel();
    expect(useImageEditorStore.getState().showLayersPanel).toBe(!initial);
  });

  it('toggleHistoryPanel', () => {
    const initial = useImageEditorStore.getState().showHistoryPanel;
    useImageEditorStore.getState().toggleHistoryPanel();
    expect(useImageEditorStore.getState().showHistoryPanel).toBe(!initial);
  });

  it('toggleImageInfoPanel', () => {
    useImageEditorStore.getState().toggleImageInfoPanel();
    expect(useImageEditorStore.getState().showImageInfoPanel).toBe(true);
  });

  it('toggleChannelsPanel', () => {
    const initial = useImageEditorStore.getState().showChannelsPanel;
    useImageEditorStore.getState().toggleChannelsPanel();
    expect(useImageEditorStore.getState().showChannelsPanel).toBe(!initial);
  });

  it('togglePathsPanel', () => {
    const initial = useImageEditorStore.getState().showPathsPanel;
    useImageEditorStore.getState().togglePathsPanel();
    expect(useImageEditorStore.getState().showPathsPanel).toBe(!initial);
  });

  it('toggleHistogramPanel', () => {
    const initial = useImageEditorStore.getState().showHistogramPanel;
    useImageEditorStore.getState().toggleHistogramPanel();
    expect(useImageEditorStore.getState().showHistogramPanel).toBe(!initial);
  });

  it('setHistogramData sets data', () => {
    const data: HistogramData = {
      r: new Array<number>(256).fill(0),
      g: new Array<number>(256).fill(0),
      b: new Array<number>(256).fill(0),
      l: new Array<number>(256).fill(0),
    };
    useImageEditorStore.getState().setHistogramData(data);
    expect(useImageEditorStore.getState().histogramData).toBe(data);
  });

  it('setRightPanelTab changes tab', () => {
    useImageEditorStore.getState().setRightPanelTab('channels');
    expect(useImageEditorStore.getState().rightPanelTab).toBe('channels');

    useImageEditorStore.getState().setRightPanelTab('paths');
    expect(useImageEditorStore.getState().rightPanelTab).toBe('paths');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Channels — additional coverage
// ═════════════════════════════════════════════════════════════════════════════

describe('Channels: additional coverage', () => {
  beforeEach(() => {
    resetStore();
  });

  it('setActiveChannel updates active channel and clears alpha selection', () => {
    useImageEditorStore.setState({ activeAlphaChannelId: 'some-alpha' });
    useImageEditorStore.getState().setActiveChannel('red');

    expect(useImageEditorStore.getState().activeChannelId).toBe('red');
    expect(useImageEditorStore.getState().activeAlphaChannelId).toBeNull();
  });

  it('toggleChannelVisibility toggles individual channel', () => {
    expect(useImageEditorStore.getState().channelVisibility.red).toBe(true);
    useImageEditorStore.getState().toggleChannelVisibility('red');
    expect(useImageEditorStore.getState().channelVisibility.red).toBe(false);
  });

  it('saveSelectionAsChannel creates alpha channel from selection', () => {
    setTestSelection();
    useImageEditorStore.getState().saveSelectionAsChannel();

    const { alphaChannels } = useImageEditorStore.getState();
    expect(alphaChannels).toHaveLength(1);
    expect(alphaChannels[0].name).toBe('Alpha 1');
    expect(alphaChannels[0].visible).toBe(true);
  });

  it('saveSelectionAsChannel does nothing without selection', () => {
    useImageEditorStore.getState().saveSelectionAsChannel();
    expect(useImageEditorStore.getState().alphaChannels).toHaveLength(0);
  });

  it('deleteAlphaChannel removes channel', () => {
    setTestSelection();
    useImageEditorStore.getState().saveSelectionAsChannel();
    const channelId = useImageEditorStore.getState().alphaChannels[0].id;

    useImageEditorStore.getState().deleteAlphaChannel(channelId);
    expect(useImageEditorStore.getState().alphaChannels).toHaveLength(0);
  });

  it('toggleAlphaChannelVisibility toggles visibility', () => {
    setTestSelection();
    useImageEditorStore.getState().saveSelectionAsChannel();
    const channelId = useImageEditorStore.getState().alphaChannels[0].id;

    useImageEditorStore.getState().toggleAlphaChannelVisibility(channelId);
    expect(useImageEditorStore.getState().alphaChannels[0].visible).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Paths — advanced operations
// ═════════════════════════════════════════════════════════════════════════════

describe('Paths: advanced operations', () => {
  beforeEach(() => {
    resetStore();
  });

  it('setPenToolMode sets mode and clears active point', () => {
    useImageEditorStore.setState({ activePointIndex: 3, isDraggingHandle: 'in' });
    useImageEditorStore.getState().setPenToolMode('edit');

    expect(useImageEditorStore.getState().penToolMode).toBe('edit');
    expect(useImageEditorStore.getState().activePointIndex).toBeNull();
    expect(useImageEditorStore.getState().isDraggingHandle).toBeNull();
  });

  it('setActivePointIndex sets index', () => {
    useImageEditorStore.getState().setActivePointIndex(5);
    expect(useImageEditorStore.getState().activePointIndex).toBe(5);
  });

  it('updatePathPoint updates a specific point', () => {
    const pathId = useImageEditorStore.getState().addPath('Test');
    useImageEditorStore.getState().addPathPoint(pathId, {
      x: 10, y: 20, handleIn: null, handleOut: null, type: 'corner',
    });

    useImageEditorStore.getState().updatePathPoint(pathId, 0, { x: 50, y: 60 });

    const path = useImageEditorStore.getState().paths.find((p) => p.id === pathId);
    expect(path!.points[0].x).toBe(50);
    expect(path!.points[0].y).toBe(60);
  });

  it('insertPathPoint inserts after given index', () => {
    const pathId = useImageEditorStore.getState().addPath('Test');
    useImageEditorStore.getState().addPathPoint(pathId, {
      x: 0, y: 0, handleIn: null, handleOut: null, type: 'corner',
    });
    useImageEditorStore.getState().addPathPoint(pathId, {
      x: 100, y: 100, handleIn: null, handleOut: null, type: 'corner',
    });

    useImageEditorStore.getState().insertPathPoint(pathId, 0, {
      x: 50, y: 50, handleIn: null, handleOut: null, type: 'smooth',
    });

    const path = useImageEditorStore.getState().paths.find((p) => p.id === pathId);
    expect(path!.points).toHaveLength(3);
    expect(path!.points[1].x).toBe(50);
  });

  it('removePathPoint removes by index', () => {
    const pathId = useImageEditorStore.getState().addPath('Test');
    useImageEditorStore.getState().addPathPoint(pathId, { x: 0, y: 0, handleIn: null, handleOut: null, type: 'corner' });
    useImageEditorStore.getState().addPathPoint(pathId, { x: 50, y: 50, handleIn: null, handleOut: null, type: 'corner' });

    useImageEditorStore.getState().removePathPoint(pathId, 0);

    const path = useImageEditorStore.getState().paths.find((p) => p.id === pathId);
    expect(path!.points).toHaveLength(1);
    expect(path!.points[0].x).toBe(50);
  });

  it('closePath sets path to closed and switches to edit mode', () => {
    const pathId = useImageEditorStore.getState().addPath('Test');
    useImageEditorStore.getState().closePath(pathId);

    const path = useImageEditorStore.getState().paths.find((p) => p.id === pathId);
    expect(path!.closed).toBe(true);
    expect(useImageEditorStore.getState().penToolMode).toBe('edit');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Color Profile / CMYK Preview
// ═════════════════════════════════════════════════════════════════════════════

describe('Color Profile / CMYK Preview', () => {
  beforeEach(() => {
    resetStore();
  });

  it('toggleColorProofing toggles proofing state', () => {
    expect(useImageEditorStore.getState().colorProofing).toBe(false);
    useImageEditorStore.getState().toggleColorProofing();
    expect(useImageEditorStore.getState().colorProofing).toBe(true);
  });

  it('toggleGamutWarning toggles gamut warning', () => {
    expect(useImageEditorStore.getState().gamutWarning).toBe(false);
    useImageEditorStore.getState().toggleGamutWarning();
    expect(useImageEditorStore.getState().gamutWarning).toBe(true);
  });

  it('setColorProfile sets profile name', () => {
    useImageEditorStore.getState().setColorProfile('Japan Color 2001 Coated');
    expect(useImageEditorStore.getState().colorProfile).toBe('Japan Color 2001 Coated');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Selection Modify (Phase 1) and Document Operations
// ═════════════════════════════════════════════════════════════════════════════

describe('Selection Modify actions', () => {
  beforeEach(() => {
    resetStore();
  });

  it('expandSelectionBy marks dirty and preserves selection when selection exists', () => {
    const originalSel = setTestSelection();
    const boundsBefore = { ...originalSel.bounds };
    useImageEditorStore.setState({ isDirty: false });
    useImageEditorStore.getState().expandSelectionBy(5);
    const state = useImageEditorStore.getState();
    expect(state.isDirty).toBe(true);
    // Selection should still exist after expand operation
    expect(state.selection).not.toBeNull();
    expect(state.selection!.maskDataUrl).toBeTruthy();
    // NOTE: The store action delegates actual mask pixel manipulation to the canvas
    // component. At the store level we can only verify the selection is preserved
    // and dirty flag is set. The bounds remain unchanged because the store stub
    // does not perform pixel-level expansion — that happens in the canvas layer.
    expect(state.selection!.bounds).toEqual(boundsBefore);
  });

  it('expandSelectionBy does nothing without selection', () => {
    useImageEditorStore.setState({ isDirty: false });
    useImageEditorStore.getState().expandSelectionBy(5);
    const state = useImageEditorStore.getState();
    expect(state.isDirty).toBe(false);
    expect(state.selection).toBeNull();
  });

  it('contractSelectionBy marks dirty and preserves selection when selection exists', () => {
    const originalSel = setTestSelection();
    const boundsBefore = { ...originalSel.bounds };
    useImageEditorStore.setState({ isDirty: false });
    useImageEditorStore.getState().contractSelectionBy(3);
    const state = useImageEditorStore.getState();
    expect(state.isDirty).toBe(true);
    expect(state.selection).not.toBeNull();
    expect(state.selection!.maskDataUrl).toBeTruthy();
    // Store stub: bounds unchanged; canvas component handles pixel contraction
    expect(state.selection!.bounds).toEqual(boundsBefore);
  });

  it('smoothSelectionBy marks dirty and preserves selection when selection exists', () => {
    setTestSelection();
    useImageEditorStore.setState({ isDirty: false });
    useImageEditorStore.getState().smoothSelectionBy(2);
    const state = useImageEditorStore.getState();
    expect(state.isDirty).toBe(true);
    expect(state.selection).not.toBeNull();
    expect(state.selection!.maskDataUrl).toBeTruthy();
  });

  it('borderSelectionBy marks dirty and preserves selection when selection exists', () => {
    setTestSelection();
    useImageEditorStore.setState({ isDirty: false });
    useImageEditorStore.getState().borderSelectionBy(3);
    const state = useImageEditorStore.getState();
    expect(state.isDirty).toBe(true);
    expect(state.selection).not.toBeNull();
    expect(state.selection!.bounds).toBeDefined();
  });

  it('growSelectionByColor marks dirty and preserves selection when selection exists', () => {
    setTestSelection();
    useImageEditorStore.setState({ isDirty: false });
    useImageEditorStore.getState().growSelectionByColor();
    const state = useImageEditorStore.getState();
    expect(state.isDirty).toBe(true);
    expect(state.selection).not.toBeNull();
    expect(state.selection!.maskDataUrl).toBeTruthy();
  });

  it('selectSimilar marks dirty and preserves selection when selection exists', () => {
    setTestSelection();
    useImageEditorStore.setState({ isDirty: false });
    useImageEditorStore.getState().selectSimilar();
    const state = useImageEditorStore.getState();
    expect(state.isDirty).toBe(true);
    expect(state.selection).not.toBeNull();
    expect(state.selection!.maskDataUrl).toBeTruthy();
  });
});

describe('Document Operations', () => {
  beforeEach(() => {
    resetStore();
  });

  it('setDocumentDpi sets DPI and marks dirty', () => {
    useImageEditorStore.setState({ isDirty: false });
    useImageEditorStore.getState().setDocumentDpi(300);
    expect(useImageEditorStore.getState().documentDpi).toBe(300);
    expect(useImageEditorStore.getState().isDirty).toBe(true);
  });

  it('resizeCanvas marks dirty', () => {
    // Add a layer so we have baseline dimensions to compare against
    addLayer('BG', { width: 400, height: 300 });
    useImageEditorStore.setState({ isDirty: false });
    useImageEditorStore.getState().resizeCanvas(800, 600, 'center');
    const state = useImageEditorStore.getState();
    expect(state.isDirty).toBe(true);
    // NOTE: The store stub only sets isDirty. Actual layer/canvas dimension
    // changes are handled by the canvas component. We verify layers are preserved.
    expect(state.layers.length).toBeGreaterThanOrEqual(1);
  });

  it('resizeImage marks dirty', async () => {
    addLayer('BG', { width: 400, height: 300 });
    useImageEditorStore.setState({ isDirty: false });
    useImageEditorStore.getState().resizeImage(1024, 768, 'bicubic');
    // resizeImage는 레이어 리샘플링을 비동기로 수행한 뒤 isDirty를 set한다
    await vi.waitFor(() => {
      expect(useImageEditorStore.getState().isDirty).toBe(true);
    });
    const state = useImageEditorStore.getState();
    expect(state.isDirty).toBe(true);
    // NOTE: The store stub only sets isDirty. Actual dimension mutation
    // is delegated to the canvas rendering layer.
    expect(state.layers.length).toBeGreaterThanOrEqual(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Stamp Visible
// ═════════════════════════════════════════════════════════════════════════════

describe('stampVisible', () => {
  beforeEach(() => {
    resetStore();
  });

  it('adds a new "Stamped Visible" layer at the top', () => {
    addLayer('BG', { width: 100, height: 100 });

    useImageEditorStore.getState().stampVisible();

    const { layers, activeLayerId } = useImageEditorStore.getState();
    expect(layers).toHaveLength(2);
    expect(layers[0].name).toBe('Stamped Visible');
    expect(layers[0].width).toBe(100);
    expect(activeLayerId).toBe(layers[0].id);
  });

  it('does nothing when no layers exist', () => {
    useImageEditorStore.getState().stampVisible();
    expect(useImageEditorStore.getState().layers).toHaveLength(0);
  });

  it('marks dirty after stamp', () => {
    addLayer('BG');
    useImageEditorStore.setState({ isDirty: false });
    useImageEditorStore.getState().stampVisible();
    expect(useImageEditorStore.getState().isDirty).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AI Processing State
// ═════════════════════════════════════════════════════════════════════════════

describe('AI Processing State', () => {
  beforeEach(() => {
    resetStore();
  });

  it('setUpscaleSettings merges partial settings', () => {
    useImageEditorStore.getState().setUpscaleSettings({ scale: 4 });
    const us = useImageEditorStore.getState().upscaleSettings;
    expect(us.scale).toBe(4);
    expect(us.type).toBe('crisp'); // default preserved
  });

  it('setMaskDataUrl sets mask', () => {
    useImageEditorStore.getState().setMaskDataUrl('data:mask');
    expect(useImageEditorStore.getState().maskDataUrl).toBe('data:mask');
  });

  it('setMaskDataUrl clears mask with null', () => {
    useImageEditorStore.getState().setMaskDataUrl('data:mask');
    useImageEditorStore.getState().setMaskDataUrl(null);
    expect(useImageEditorStore.getState().maskDataUrl).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Editor Lifecycle
// ═════════════════════════════════════════════════════════════════════════════

describe('Editor Lifecycle', () => {
  beforeEach(() => {
    resetStore();
  });

  it('openEditor sets up editor state from asset', () => {
    const asset = {
      id: 'asset-1',
      name: 'test.png',
      previewUrl: 'http://example.com/preview.png',
      publicUrl: 'http://example.com/public.png',
      thumbnailUrl: 'http://example.com/thumb.png',
    } as unknown as IrisAsset;

    useImageEditorStore.getState().openEditor(asset);

    const s = useImageEditorStore.getState();
    expect(s.isEditorOpen).toBe(true);
    expect(s.sourceAsset).toBe(asset);
    expect(s.originalImageUrl).toBe('http://example.com/preview.png');
    expect(s.isDirty).toBe(false);
    expect(s.editMode).toBe('move');
  });

  it('closeEditor resets editor open state', () => {
    useImageEditorStore.setState({ isEditorOpen: true, isDirty: true });
    useImageEditorStore.getState().closeEditor();

    expect(useImageEditorStore.getState().isEditorOpen).toBe(false);
    expect(useImageEditorStore.getState().isDirty).toBe(false);
    expect(useImageEditorStore.getState().sourceAsset).toBeNull();
  });

  it('resetEditor restores all state to initial', () => {
    useImageEditorStore.setState({
      zoom: 200,
      rotation: 45,
      isDirty: true,
      showGrid: true,
    });

    useImageEditorStore.getState().resetEditor();

    const s = useImageEditorStore.getState();
    expect(s.zoom).toBe(100);
    expect(s.rotation).toBe(0);
    expect(s.isDirty).toBe(false);
    expect(s.showGrid).toBe(false);
  });

  it('openEditorWithLayers sets layers and active layer', () => {
    const layers: Layer[] = [
      {
        id: 'l1', name: 'BG', visible: true, locked: false, opacity: 100,
        blendMode: 'normal', imageData: IMG, x: 0, y: 0, width: 100, height: 100,
      },
      {
        id: 'l2', name: 'Top', visible: true, locked: false, opacity: 100,
        blendMode: 'normal', imageData: IMG, x: 0, y: 0, width: 100, height: 100,
      },
    ];

    useImageEditorStore.getState().openEditorWithLayers(null, layers, 'data:composite', 100, 100);

    const s = useImageEditorStore.getState();
    expect(s.isEditorOpen).toBe(true);
    expect(s.layers).toHaveLength(2);
    expect(s.activeLayerId).toBe('l2'); // last layer
    expect(s.originalImageUrl).toBe('data:composite');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Layer Groups — additional coverage
// ═════════════════════════════════════════════════════════════════════════════

describe('Layer Groups: additional coverage', () => {
  beforeEach(() => {
    resetStore();
  });

  it('createLayerGroup creates a group layer', () => {
    const groupId = useImageEditorStore.getState().createLayerGroup('My Group');

    const group = useImageEditorStore.getState().layers.find((l) => l.id === groupId);
    expect(group).toBeDefined();
    expect(group!.type).toBe('group');
    expect(group!.name).toBe('My Group');
    expect(group!.isExpanded).toBe(true);
    expect(group!.children).toEqual([]);
    expect(useImageEditorStore.getState().activeLayerId).toBe(groupId);
  });

  it('moveLayerToGroup adds layer to group children', () => {
    const layerId = addLayer('Child');
    const groupId = useImageEditorStore.getState().createLayerGroup('Group');

    useImageEditorStore.getState().moveLayerToGroup(layerId, groupId);

    const group = useImageEditorStore.getState().layers.find((l) => l.id === groupId);
    const layer = useImageEditorStore.getState().layers.find((l) => l.id === layerId);
    expect(group!.children).toContain(layerId);
    expect(layer!.parentId).toBe(groupId);
  });

  it('moveLayerToGroup with null removes from parent', () => {
    const layerId = addLayer('Child');
    const groupId = useImageEditorStore.getState().createLayerGroup('Group');
    useImageEditorStore.getState().moveLayerToGroup(layerId, groupId);

    useImageEditorStore.getState().moveLayerToGroup(layerId, null);

    const group = useImageEditorStore.getState().layers.find((l) => l.id === groupId);
    const layer = useImageEditorStore.getState().layers.find((l) => l.id === layerId);
    expect(group!.children).not.toContain(layerId);
    expect(layer!.parentId).toBeUndefined();
  });

  it('toggleGroupExpansion toggles isExpanded', () => {
    const groupId = useImageEditorStore.getState().createLayerGroup('Group');

    useImageEditorStore.getState().toggleGroupExpansion(groupId);
    expect(useImageEditorStore.getState().layers.find((l) => l.id === groupId)!.isExpanded).toBe(false);

    useImageEditorStore.getState().toggleGroupExpansion(groupId);
    expect(useImageEditorStore.getState().layers.find((l) => l.id === groupId)!.isExpanded).toBe(true);
  });

  it('ungroupLayers removes group and frees children', () => {
    const layerId = addLayer('Child');
    const groupId = useImageEditorStore.getState().createLayerGroup('Group');
    useImageEditorStore.getState().moveLayerToGroup(layerId, groupId);

    useImageEditorStore.getState().ungroupLayers(groupId);

    const layers = useImageEditorStore.getState().layers;
    expect(layers.find((l) => l.id === groupId)).toBeUndefined();
    expect(layers.find((l) => l.id === layerId)!.parentId).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Adjustment Layers
// ═════════════════════════════════════════════════════════════════════════════

describe('Adjustment Layers', () => {
  beforeEach(() => {
    resetStore();
  });

  it('addAdjustmentLayer creates adjustment layer with correct type', () => {
    const id = useImageEditorStore.getState().addAdjustmentLayer('levels', { brightness: 10 });

    const layer = useImageEditorStore.getState().layers.find((l) => l.id === id);
    expect(layer).toBeDefined();
    expect(layer!.type).toBe('adjustment');
    expect(layer!.adjustmentType).toBe('levels');
    expect(layer!.adjustmentValues?.brightness).toBe(10);
    expect(layer!.name).toBe('Levels');
  });

  it('updateAdjustmentLayer updates values on adjustment layer only', () => {
    const adjId = useImageEditorStore.getState().addAdjustmentLayer('curves');
    const rasterId = addLayer('Raster');

    useImageEditorStore.getState().updateAdjustmentLayer(adjId, { contrast: 50 });
    useImageEditorStore.getState().updateAdjustmentLayer(rasterId, { contrast: 50 }); // should not affect raster

    const adjLayer = useImageEditorStore.getState().layers.find((l) => l.id === adjId);
    const rasterLayer = useImageEditorStore.getState().layers.find((l) => l.id === rasterId);
    expect(adjLayer!.adjustmentValues?.contrast).toBe(50);
    expect(rasterLayer!.adjustmentValues).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Layer Masks
// ═════════════════════════════════════════════════════════════════════════════

describe('Layer Masks', () => {
  let layerId: string;

  beforeEach(() => {
    resetStore();
    layerId = addLayer('Test');
  });

  it('addLayerMask adds a mask to a layer', () => {
    useImageEditorStore.getState().addLayerMask(layerId, 'data:mask');
    const layer = useImageEditorStore.getState().layers.find((l) => l.id === layerId);
    expect(layer!.mask).toBeDefined();
    expect(layer!.mask!.data).toBe('data:mask');
    expect(layer!.mask!.enabled).toBe(true);
    expect(layer!.mask!.linked).toBe(true);
  });

  it('removeLayerMask removes mask', () => {
    useImageEditorStore.getState().addLayerMask(layerId);
    useImageEditorStore.getState().removeLayerMask(layerId);
    const layer = useImageEditorStore.getState().layers.find((l) => l.id === layerId);
    expect(layer!.mask).toBeUndefined();
  });

  it('toggleLayerMask toggles enabled state', () => {
    useImageEditorStore.getState().addLayerMask(layerId);
    useImageEditorStore.getState().toggleLayerMask(layerId);
    expect(useImageEditorStore.getState().layers.find((l) => l.id === layerId)!.mask!.enabled).toBe(false);
  });

  it('updateLayerMask updates mask data', () => {
    useImageEditorStore.getState().addLayerMask(layerId, 'old');
    useImageEditorStore.getState().updateLayerMask(layerId, 'new');
    expect(useImageEditorStore.getState().layers.find((l) => l.id === layerId)!.mask!.data).toBe('new');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Layer Effects — additional coverage
// ═════════════════════════════════════════════════════════════════════════════

describe('Layer Effects', () => {
  let layerId: string;

  beforeEach(() => {
    resetStore();
    layerId = addLayer('Test');
  });

  it('addLayerEffect adds a new effect', () => {
    useImageEditorStore.getState().addLayerEffect(layerId, {
      type: 'dropShadow',
      enabled: true,
      settings: { color: '#000', offsetX: 4, offsetY: 4, blur: 8, spread: 0, opacity: 50 },
    });

    const layer = useImageEditorStore.getState().layers.find((l) => l.id === layerId);
    expect(layer!.effects).toHaveLength(1);
    expect(layer!.effects![0].type).toBe('dropShadow');
  });

  it('addLayerEffect replaces existing effect of same type', () => {
    useImageEditorStore.getState().addLayerEffect(layerId, {
      type: 'dropShadow', enabled: true,
      settings: { color: '#000', offsetX: 4, offsetY: 4, blur: 8, spread: 0, opacity: 50 },
    });
    useImageEditorStore.getState().addLayerEffect(layerId, {
      type: 'dropShadow', enabled: true,
      settings: { color: '#ff0000', offsetX: 2, offsetY: 2, blur: 4, spread: 0, opacity: 75 },
    });

    const layer = useImageEditorStore.getState().layers.find((l) => l.id === layerId);
    expect(layer!.effects).toHaveLength(1);
    expect((layer!.effects![0].settings as DropShadowSettings).color).toBe('#ff0000');
  });

  it('removeLayerEffect removes by type', () => {
    useImageEditorStore.getState().addLayerEffect(layerId, {
      type: 'dropShadow', enabled: true,
      settings: { color: '#000', offsetX: 4, offsetY: 4, blur: 8, spread: 0, opacity: 50 },
    });
    useImageEditorStore.getState().removeLayerEffect(layerId, 'dropShadow');

    const layer = useImageEditorStore.getState().layers.find((l) => l.id === layerId);
    expect(layer!.effects).toHaveLength(0);
  });

  it('toggleLayerEffect toggles enabled state', () => {
    useImageEditorStore.getState().addLayerEffect(layerId, {
      type: 'outerGlow', enabled: true,
      settings: { color: '#fff', size: 10, opacity: 75 },
    });
    useImageEditorStore.getState().toggleLayerEffect(layerId, 'outerGlow');

    const layer = useImageEditorStore.getState().layers.find((l) => l.id === layerId);
    expect(layer!.effects![0].enabled).toBe(false);
  });

  it('updateLayerEffect merges settings', () => {
    useImageEditorStore.getState().addLayerEffect(layerId, {
      type: 'outerGlow', enabled: true,
      settings: { color: '#fff', size: 10, opacity: 75 },
    });
    useImageEditorStore.getState().updateLayerEffect(layerId, 'outerGlow', { size: 20 } as Partial<GlowSettings>);

    const layer = useImageEditorStore.getState().layers.find((l) => l.id === layerId);
    expect((layer!.effects![0].settings as GlowSettings).size).toBe(20);
    expect((layer!.effects![0].settings as GlowSettings).color).toBe('#fff'); // preserved
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Clipping Mask
// ═════════════════════════════════════════════════════════════════════════════

describe('Clipping Mask', () => {
  beforeEach(() => {
    resetStore();
  });

  it('toggleClippingMask toggles clipping mask on layer', () => {
    const id = addLayer('Test');
    useImageEditorStore.getState().toggleClippingMask(id);
    expect(useImageEditorStore.getState().layers.find((l) => l.id === id)!.clippingMask).toBe(true);

    useImageEditorStore.getState().toggleClippingMask(id);
    expect(useImageEditorStore.getState().layers.find((l) => l.id === id)!.clippingMask).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Text Layers
// ═════════════════════════════════════════════════════════════════════════════

describe('Text Layers', () => {
  beforeEach(() => {
    resetStore();
  });

  it('addTextLayer creates text layer with current settings', () => {
    const id = useImageEditorStore.getState().addTextLayer('Hello', 50, 60);
    const tl = useImageEditorStore.getState().textLayers.find((l) => l.id === id);
    expect(tl).toBeDefined();
    expect(tl!.text).toBe('Hello');
    expect(tl!.x).toBe(50);
    expect(tl!.y).toBe(60);
    expect(useImageEditorStore.getState().activeTextLayerId).toBe(id);
  });

  it('removeTextLayer removes and clears activeTextLayerId', () => {
    const id = useImageEditorStore.getState().addTextLayer('Test', 0, 0);
    useImageEditorStore.getState().removeTextLayer(id);
    expect(useImageEditorStore.getState().textLayers).toHaveLength(0);
    expect(useImageEditorStore.getState().activeTextLayerId).toBeNull();
  });

  it('updateTextLayer updates text layer properties', () => {
    const id = useImageEditorStore.getState().addTextLayer('Original', 0, 0);
    useImageEditorStore.getState().updateTextLayer(id, { text: 'Updated', x: 100 });
    const tl = useImageEditorStore.getState().textLayers.find((l) => l.id === id);
    expect(tl!.text).toBe('Updated');
    expect(tl!.x).toBe(100);
  });

  it('setActiveTextLayer sets active text layer', () => {
    const id = useImageEditorStore.getState().addTextLayer('Test', 0, 0);
    useImageEditorStore.getState().setActiveTextLayer(null);
    expect(useImageEditorStore.getState().activeTextLayerId).toBeNull();

    useImageEditorStore.getState().setActiveTextLayer(id);
    expect(useImageEditorStore.getState().activeTextLayerId).toBe(id);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Transform Selection (Phase 3)
// ═════════════════════════════════════════════════════════════════════════════

describe('Transform Selection', () => {
  beforeEach(() => {
    resetStore();
  });

  it('transformSelection move adjusts bounds position', () => {
    setTestSelection();
    useImageEditorStore.getState().transformSelection('move', { dx: 10, dy: 5 });
    const bounds = useImageEditorStore.getState().selection!.bounds!;
    expect(bounds.x).toBe(20); // 10 + 10
    expect(bounds.y).toBe(25); // 20 + 5
  });

  it('transformSelection scale adjusts bounds size', () => {
    setTestSelection();
    useImageEditorStore.getState().transformSelection('scale', { scaleX: 2, scaleY: 0.5 });
    const bounds = useImageEditorStore.getState().selection!.bounds!;
    expect(bounds.width).toBe(200);
    expect(bounds.height).toBe(40);
  });

  it('transformSelection does nothing without selection', () => {
    useImageEditorStore.getState().transformSelection('move', { dx: 10, dy: 10 });
    expect(useImageEditorStore.getState().selection).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Content-Aware Move (Phase 5)
// ═════════════════════════════════════════════════════════════════════════════

describe('Content-Aware Move', () => {
  beforeEach(() => {
    resetStore();
  });

  it('contentAwareMove marks dirty', () => {
    useImageEditorStore.setState({ isDirty: false });
    useImageEditorStore.getState().contentAwareMove(
      { x: 0, y: 0, width: 50, height: 50 }, 100, 100,
    );
    expect(useImageEditorStore.getState().isDirty).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SVG Import
// ═════════════════════════════════════════════════════════════════════════════

describe('SVG Import', () => {
  beforeEach(() => {
    resetStore();
  });

  it('importSvg marks dirty', () => {
    useImageEditorStore.setState({ isDirty: false });
    useImageEditorStore.getState().importSvg('<svg></svg>');
    expect(useImageEditorStore.getState().isDirty).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Export Settings
// ═════════════════════════════════════════════════════════════════════════════

describe('Export Settings', () => {
  beforeEach(() => {
    resetStore();
  });

  it('setExportSettings merges partial settings', () => {
    useImageEditorStore.getState().setExportSettings({ format: 'jpeg', quality: 80 });
    const es = useImageEditorStore.getState().exportSettings;
    expect(es.format).toBe('jpeg');
    expect(es.quality).toBe(80);
    expect(es.scale).toBe(1); // default
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Combine Paths (Phase 4)
// ═════════════════════════════════════════════════════════════════════════════

describe('Combine Paths', () => {
  beforeEach(() => {
    resetStore();
  });

  it('combinePaths merges points of selected paths', () => {
    const p1 = useImageEditorStore.getState().addPath('Path A');
    const p2 = useImageEditorStore.getState().addPath('Path B');
    useImageEditorStore.getState().addPathPoint(p1, { x: 0, y: 0, handleIn: null, handleOut: null, type: 'corner' });
    useImageEditorStore.getState().addPathPoint(p2, { x: 100, y: 100, handleIn: null, handleOut: null, type: 'corner' });

    useImageEditorStore.getState().combinePaths([p1, p2], 'unite');

    const { paths } = useImageEditorStore.getState();
    expect(paths).toHaveLength(1);
    expect(paths[0].points).toHaveLength(2);
  });

  it('combinePaths does nothing with fewer than 2 paths', () => {
    const p1 = useImageEditorStore.getState().addPath('Only');
    useImageEditorStore.getState().combinePaths([p1], 'unite');
    expect(useImageEditorStore.getState().paths).toHaveLength(1);
  });
});
