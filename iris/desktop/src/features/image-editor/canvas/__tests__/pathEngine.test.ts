/**
 * Path Engine Tests
 *
 * Tests path operations from the image editor store:
 *   - addPath, deletePath, setActivePath, updatePath
 *   - addPathPoint, updatePathPoint, insertPathPoint, removePathPoint
 *   - closePath, fillPath, strokePath
 *   - combinePaths (unite/subtract/intersect/exclude)
 *   - loadPathAsSelection
 *   - Point types (smooth/corner)
 *   - setPenToolMode, setActivePointIndex
 *
 * Path logic lives in imageEditor.store.ts since there is no separate pathEngine.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setupImageEditorTestTab } from '@/test-utils/imageEditorHelpers';
import { useImageEditorStore, type PathPoint, type VectorPath } from '@/features/image-editor/stores/imageEditor.store';

// ==================== Helpers ====================

function getStore() {
  return useImageEditorStore.getState();
}

function cornerPoint(x: number, y: number): PathPoint {
  return { x, y, handleIn: null, handleOut: null, type: 'corner' };
}

function smoothPoint(
  x: number,
  y: number,
  hInX: number,
  hInY: number,
  hOutX: number,
  hOutY: number,
): PathPoint {
  return {
    x,
    y,
    handleIn: { x: hInX, y: hInY },
    handleOut: { x: hOutX, y: hOutY },
    type: 'smooth',
  };
}

function createPathWith(name: string, points: PathPoint[]): string {
  const id = getStore().addPath(name);
  for (const pt of points) {
    getStore().addPathPoint(id, pt);
  }
  return id;
}

function getPath(id: string): VectorPath | undefined {
  return getStore().paths.find((p) => p.id === id);
}

// ==================== Tests ====================

beforeEach(() => {
  setupImageEditorTestTab(); // fresh active tab per test (registry shim requires one)
});

describe('Path: addPath', () => {
  beforeEach(() => getStore().resetEditor());

  it('creates a path and returns its id', () => {
    const id = getStore().addPath('Test Path');
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('creates a path with the given name', () => {
    const id = getStore().addPath('My Path');
    const path = getPath(id);
    expect(path).toBeDefined();
    expect(path!.name).toBe('My Path');
  });

  it('creates a path with empty points and open state', () => {
    const id = getStore().addPath();
    const path = getPath(id);
    expect(path!.points).toEqual([]);
    expect(path!.closed).toBe(false);
    expect(path!.visible).toBe(true);
  });

  it('sets the new path as active', () => {
    const id = getStore().addPath();
    expect(getStore().activePathId).toBe(id);
  });

  it('can create multiple paths', () => {
    getStore().addPath('A');
    getStore().addPath('B');
    getStore().addPath('C');
    expect(getStore().paths.length).toBe(3);
  });
});

describe('Path: deletePath', () => {
  beforeEach(() => getStore().resetEditor());

  it('removes the path from the list', () => {
    const id = getStore().addPath('Delete Me');
    expect(getStore().paths.length).toBe(1);
    getStore().deletePath(id);
    expect(getStore().paths.length).toBe(0);
  });

  it('clears activePathId if deleted path was active', () => {
    const id = getStore().addPath();
    expect(getStore().activePathId).toBe(id);
    getStore().deletePath(id);
    expect(getStore().activePathId).toBeNull();
  });

  it('does not clear activePathId when deleting a different path', () => {
    const id1 = getStore().addPath('A');
    const id2 = getStore().addPath('B');
    // id2 is now active
    expect(getStore().activePathId).toBe(id2);
    getStore().deletePath(id1);
    expect(getStore().activePathId).toBe(id2);
    expect(getStore().paths.length).toBe(1);
  });

  it('no-op for non-existent path id', () => {
    getStore().addPath();
    const countBefore = getStore().paths.length;
    getStore().deletePath('nonexistent-id');
    expect(getStore().paths.length).toBe(countBefore);
  });
});

describe('Path: setActivePath', () => {
  beforeEach(() => getStore().resetEditor());

  it('sets the active path id', () => {
    const id = getStore().addPath();
    getStore().setActivePath(null);
    expect(getStore().activePathId).toBeNull();
    getStore().setActivePath(id);
    expect(getStore().activePathId).toBe(id);
  });
});

describe('Path: updatePath', () => {
  beforeEach(() => getStore().resetEditor());

  it('updates path name', () => {
    const id = getStore().addPath('Original');
    getStore().updatePath(id, { name: 'Renamed' });
    expect(getPath(id)!.name).toBe('Renamed');
  });

  it('updates path visibility', () => {
    const id = getStore().addPath();
    expect(getPath(id)!.visible).toBe(true);
    getStore().updatePath(id, { visible: false });
    expect(getPath(id)!.visible).toBe(false);
  });

  it('does not affect other paths', () => {
    const id1 = getStore().addPath('A');
    const id2 = getStore().addPath('B');
    getStore().updatePath(id1, { name: 'Updated A' });
    expect(getPath(id1)!.name).toBe('Updated A');
    expect(getPath(id2)!.name).toBe('B');
  });
});

describe('Path: addPathPoint', () => {
  beforeEach(() => getStore().resetEditor());

  it('appends a point to the path', () => {
    const id = getStore().addPath();
    getStore().addPathPoint(id, cornerPoint(10, 20));
    expect(getPath(id)!.points.length).toBe(1);
    expect(getPath(id)!.points[0]).toEqual(cornerPoint(10, 20));
  });

  it('appends multiple points in order', () => {
    const id = getStore().addPath();
    getStore().addPathPoint(id, cornerPoint(0, 0));
    getStore().addPathPoint(id, cornerPoint(10, 10));
    getStore().addPathPoint(id, cornerPoint(20, 0));
    const points = getPath(id)!.points;
    expect(points.length).toBe(3);
    expect(points[0].x).toBe(0);
    expect(points[1].x).toBe(10);
    expect(points[2].x).toBe(20);
  });

  it('handles smooth points with handles', () => {
    const id = getStore().addPath();
    const pt = smoothPoint(50, 50, 40, 50, 60, 50);
    getStore().addPathPoint(id, pt);
    const stored = getPath(id)!.points[0];
    expect(stored.type).toBe('smooth');
    expect(stored.handleIn).toEqual({ x: 40, y: 50 });
    expect(stored.handleOut).toEqual({ x: 60, y: 50 });
  });

  it('does not affect other paths', () => {
    const id1 = getStore().addPath();
    const id2 = getStore().addPath();
    getStore().addPathPoint(id1, cornerPoint(1, 1));
    expect(getPath(id1)!.points.length).toBe(1);
    expect(getPath(id2)!.points.length).toBe(0);
  });
});

describe('Path: updatePathPoint', () => {
  beforeEach(() => getStore().resetEditor());

  it('updates position of a point', () => {
    const id = createPathWith('P', [cornerPoint(0, 0), cornerPoint(10, 10)]);
    getStore().updatePathPoint(id, 0, { x: 5, y: 5 });
    expect(getPath(id)!.points[0].x).toBe(5);
    expect(getPath(id)!.points[0].y).toBe(5);
  });

  it('updates handle of a point', () => {
    const id = createPathWith('P', [cornerPoint(10, 10)]);
    getStore().updatePathPoint(id, 0, {
      handleOut: { x: 20, y: 10 },
      type: 'smooth',
    });
    const pt = getPath(id)!.points[0];
    expect(pt.handleOut).toEqual({ x: 20, y: 10 });
    expect(pt.type).toBe('smooth');
  });

  it('does not affect other points', () => {
    const id = createPathWith('P', [cornerPoint(0, 0), cornerPoint(10, 10), cornerPoint(20, 20)]);
    getStore().updatePathPoint(id, 1, { x: 99, y: 99 });
    expect(getPath(id)!.points[0]).toEqual(cornerPoint(0, 0));
    expect(getPath(id)!.points[1].x).toBe(99);
    expect(getPath(id)!.points[2]).toEqual(cornerPoint(20, 20));
  });

  it('partial update preserves other fields', () => {
    const id = createPathWith('P', [smoothPoint(10, 10, 5, 10, 15, 10)]);
    getStore().updatePathPoint(id, 0, { x: 20 });
    const pt = getPath(id)!.points[0];
    expect(pt.x).toBe(20);
    expect(pt.y).toBe(10); // unchanged
    expect(pt.handleIn).toEqual({ x: 5, y: 10 }); // unchanged
    expect(pt.type).toBe('smooth'); // unchanged
  });
});

describe('Path: insertPathPoint', () => {
  beforeEach(() => getStore().resetEditor());

  it('inserts a point after the specified index', () => {
    const id = createPathWith('P', [cornerPoint(0, 0), cornerPoint(20, 20)]);
    getStore().insertPathPoint(id, 0, cornerPoint(10, 10));
    const points = getPath(id)!.points;
    expect(points.length).toBe(3);
    expect(points[0].x).toBe(0);
    expect(points[1].x).toBe(10);
    expect(points[2].x).toBe(20);
  });

  it('insert at end', () => {
    const id = createPathWith('P', [cornerPoint(0, 0), cornerPoint(10, 10)]);
    getStore().insertPathPoint(id, 1, cornerPoint(20, 20));
    expect(getPath(id)!.points.length).toBe(3);
    expect(getPath(id)!.points[2].x).toBe(20);
  });

  it('insert at beginning (afterIndex = -1 uses slice(0, 0))', () => {
    // afterIndex = -1 means insert before index 0
    // slice(0, 0) = [], so point goes at start
    // Actually afterIndex+1 = 0, so slice(0, 0) = [] concat [newPt] concat rest
    const id = createPathWith('P', [cornerPoint(10, 10)]);
    getStore().insertPathPoint(id, -1, cornerPoint(0, 0));
    expect(getPath(id)!.points[0].x).toBe(0);
    expect(getPath(id)!.points[1].x).toBe(10);
  });
});

describe('Path: removePathPoint', () => {
  beforeEach(() => getStore().resetEditor());

  it('removes the point at the specified index', () => {
    const id = createPathWith('P', [cornerPoint(0, 0), cornerPoint(10, 10), cornerPoint(20, 20)]);
    getStore().removePathPoint(id, 1);
    const points = getPath(id)!.points;
    expect(points.length).toBe(2);
    expect(points[0].x).toBe(0);
    expect(points[1].x).toBe(20);
  });

  it('removes first point', () => {
    const id = createPathWith('P', [cornerPoint(0, 0), cornerPoint(10, 10)]);
    getStore().removePathPoint(id, 0);
    expect(getPath(id)!.points.length).toBe(1);
    expect(getPath(id)!.points[0].x).toBe(10);
  });

  it('removes last point', () => {
    const id = createPathWith('P', [cornerPoint(0, 0), cornerPoint(10, 10)]);
    getStore().removePathPoint(id, 1);
    expect(getPath(id)!.points.length).toBe(1);
    expect(getPath(id)!.points[0].x).toBe(0);
  });

  it('can remove all points', () => {
    const id = createPathWith('P', [cornerPoint(5, 5)]);
    getStore().removePathPoint(id, 0);
    expect(getPath(id)!.points.length).toBe(0);
  });
});

describe('Path: closePath', () => {
  beforeEach(() => getStore().resetEditor());

  it('sets closed to true', () => {
    const id = createPathWith('P', [cornerPoint(0, 0), cornerPoint(10, 0), cornerPoint(10, 10)]);
    expect(getPath(id)!.closed).toBe(false);
    getStore().closePath(id);
    expect(getPath(id)!.closed).toBe(true);
  });

  it('switches pen tool mode to edit', () => {
    const id = createPathWith('P', [cornerPoint(0, 0), cornerPoint(10, 10)]);
    getStore().setPenToolMode('create');
    getStore().closePath(id);
    expect(getStore().penToolMode).toBe('edit');
  });
});

describe('Path: fillPath', () => {
  beforeEach(() => getStore().resetEditor());

  it('does not throw with valid path and active layer', () => {
    // Set up an active layer so fillPath has a target
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const layerId = getStore().addLayer(canvas.toDataURL(), 'Base');
    getStore().setActiveLayer(layerId);

    const id = createPathWith('P', [cornerPoint(0, 0), cornerPoint(50, 0), cornerPoint(50, 50)]);
    expect(() => getStore().fillPath(id)).not.toThrow();
    // fillPath sets isDirty via async Image.onload, but at minimum it should not error
  });

  it('does not throw with single-point path (no-op)', () => {
    const id = createPathWith('P', [cornerPoint(5, 5)]);
    expect(() => getStore().fillPath(id)).not.toThrow();
  });

  it('does not throw with empty path', () => {
    const id = getStore().addPath('Empty');
    expect(() => getStore().fillPath(id)).not.toThrow();
  });

  it('is a no-op without an active layer', () => {
    const id = createPathWith('P', [cornerPoint(0, 0), cornerPoint(50, 0), cornerPoint(50, 50)]);
    const dirtyBefore = getStore().isDirty;
    getStore().fillPath(id);
    // Without a layer, fillPath returns early — isDirty should not change
    expect(getStore().isDirty).toBe(dirtyBefore);
  });
});

describe('Path: strokePath', () => {
  beforeEach(() => getStore().resetEditor());

  it('does not throw with valid path and active layer', () => {
    // Set up an active layer so strokePath has a target
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const layerId = getStore().addLayer(canvas.toDataURL(), 'Base');
    getStore().setActiveLayer(layerId);

    const id = createPathWith('P', [cornerPoint(0, 0), cornerPoint(100, 100)]);
    expect(() => getStore().strokePath(id)).not.toThrow();
  });

  it('does not throw with single-point path (no-op)', () => {
    const id = createPathWith('P', [cornerPoint(5, 5)]);
    expect(() => getStore().strokePath(id)).not.toThrow();
  });

  it('is a no-op without an active layer', () => {
    const id = createPathWith('P', [cornerPoint(0, 0), cornerPoint(100, 100)]);
    const dirtyBefore = getStore().isDirty;
    getStore().strokePath(id);
    expect(getStore().isDirty).toBe(dirtyBefore);
  });
});

describe('Path: loadPathAsSelection', () => {
  beforeEach(() => getStore().resetEditor());

  it('sets selection in store for a valid closed path', () => {
    const id = createPathWith('P', [
      cornerPoint(10, 10), cornerPoint(50, 10), cornerPoint(50, 50), cornerPoint(10, 50),
    ]);
    getStore().closePath(id);
    expect(getStore().selection).toBeNull();

    getStore().loadPathAsSelection(id);

    // After loading, selection should be set (non-null)
    expect(getStore().selection).not.toBeNull();
    expect(getStore().selection!.bounds).toBeDefined();
  });

  it('is a no-op for path with < 2 points (selection stays null)', () => {
    const id = createPathWith('P', [cornerPoint(5, 5)]);
    expect(getStore().selection).toBeNull();
    getStore().loadPathAsSelection(id);
    // Path with < 2 points returns early, so selection remains null
    expect(getStore().selection).toBeNull();
  });
});

describe('Path: combinePaths', () => {
  beforeEach(() => getStore().resetEditor());

  it('unite merges points from multiple paths', () => {
    const id1 = createPathWith('A', [cornerPoint(0, 0), cornerPoint(10, 10)]);
    const id2 = createPathWith('B', [cornerPoint(20, 20), cornerPoint(30, 30)]);

    getStore().combinePaths([id1, id2], 'unite');

    const { paths } = getStore();
    expect(paths.length).toBe(1);
    expect(paths[0].points.length).toBe(4);
  });

  // The source code uses `_operation` (parameter is ignored) — subtract/intersect/exclude
  // all behave identically to unite (concatenating points). These are marked as todo until
  // proper boolean path operations are implemented.
  it.todo('subtract operation removes overlapping geometry from first path');

  it.todo('intersect operation keeps only overlapping geometry');

  it.todo('exclude operation keeps non-overlapping geometry from both paths');

  it('does nothing with fewer than 2 path IDs', () => {
    const id = createPathWith('A', [cornerPoint(0, 0)]);
    getStore().combinePaths([id], 'unite');
    expect(getStore().paths.length).toBe(1);
  });

  it('sets isDirty after combining', () => {
    const id1 = createPathWith('A', [cornerPoint(0, 0)]);
    const id2 = createPathWith('B', [cornerPoint(5, 5)]);
    getStore().combinePaths([id1, id2], 'unite');
    expect(getStore().isDirty).toBe(true);
  });

  it('sets the first path as active after combining', () => {
    const id1 = createPathWith('A', [cornerPoint(0, 0)]);
    const id2 = createPathWith('B', [cornerPoint(5, 5)]);
    getStore().combinePaths([id1, id2], 'unite');
    expect(getStore().activePathId).toBe(id1);
  });
});

describe('Path: setPenToolMode', () => {
  beforeEach(() => getStore().resetEditor());

  it('sets create mode', () => {
    getStore().setPenToolMode('create');
    expect(getStore().penToolMode).toBe('create');
  });

  it('sets edit mode', () => {
    getStore().setPenToolMode('edit');
    expect(getStore().penToolMode).toBe('edit');
  });

  it('clears active point index when changing mode', () => {
    createPathWith('P', [cornerPoint(0, 0)]);
    getStore().setActivePointIndex(0);
    expect(getStore().activePointIndex).toBe(0);
    getStore().setPenToolMode('create');
    expect(getStore().activePointIndex).toBeNull();
  });
});

describe('Path: setActivePointIndex', () => {
  beforeEach(() => getStore().resetEditor());

  it('sets the active point index', () => {
    getStore().setActivePointIndex(3);
    expect(getStore().activePointIndex).toBe(3);
  });

  it('can be set to null', () => {
    getStore().setActivePointIndex(5);
    getStore().setActivePointIndex(null);
    expect(getStore().activePointIndex).toBeNull();
  });
});

describe('Path: point types', () => {
  beforeEach(() => getStore().resetEditor());

  it('corner point has no handles', () => {
    const id = createPathWith('P', [cornerPoint(10, 10)]);
    const pt = getPath(id)!.points[0];
    expect(pt.type).toBe('corner');
    expect(pt.handleIn).toBeNull();
    expect(pt.handleOut).toBeNull();
  });

  it('smooth point has both handles', () => {
    const id = createPathWith('P', [smoothPoint(50, 50, 40, 50, 60, 50)]);
    const pt = getPath(id)!.points[0];
    expect(pt.type).toBe('smooth');
    expect(pt.handleIn).toEqual({ x: 40, y: 50 });
    expect(pt.handleOut).toEqual({ x: 60, y: 50 });
  });

  it('convert corner to smooth by updating with handles', () => {
    const id = createPathWith('P', [cornerPoint(10, 10)]);
    getStore().updatePathPoint(id, 0, {
      type: 'smooth',
      handleIn: { x: 5, y: 10 },
      handleOut: { x: 15, y: 10 },
    });
    const pt = getPath(id)!.points[0];
    expect(pt.type).toBe('smooth');
    expect(pt.handleIn).toEqual({ x: 5, y: 10 });
    expect(pt.handleOut).toEqual({ x: 15, y: 10 });
  });

  it('convert smooth to corner by updating type and clearing handles', () => {
    const id = createPathWith('P', [smoothPoint(10, 10, 5, 10, 15, 10)]);
    getStore().updatePathPoint(id, 0, {
      type: 'corner',
      handleIn: null,
      handleOut: null,
    });
    const pt = getPath(id)!.points[0];
    expect(pt.type).toBe('corner');
    expect(pt.handleIn).toBeNull();
    expect(pt.handleOut).toBeNull();
  });
});

describe('Path: complex path construction', () => {
  beforeEach(() => getStore().resetEditor());

  it('builds a bezier triangle with smooth points', () => {
    const id = getStore().addPath('Bezier Triangle');
    getStore().addPathPoint(id, smoothPoint(50, 10, 30, 10, 70, 10));
    getStore().addPathPoint(id, smoothPoint(90, 80, 90, 60, 90, 100));
    getStore().addPathPoint(id, smoothPoint(10, 80, 10, 100, 10, 60));
    getStore().closePath(id);

    const path = getPath(id)!;
    expect(path.points.length).toBe(3);
    expect(path.closed).toBe(true);
    expect(path.points.every((p) => p.type === 'smooth')).toBe(true);
  });

  it('mixed corner and smooth points', () => {
    const id = getStore().addPath('Mixed');
    getStore().addPathPoint(id, cornerPoint(0, 0));
    getStore().addPathPoint(id, smoothPoint(50, 0, 30, -20, 70, 20));
    getStore().addPathPoint(id, cornerPoint(100, 0));

    const points = getPath(id)!.points;
    expect(points[0].type).toBe('corner');
    expect(points[1].type).toBe('smooth');
    expect(points[2].type).toBe('corner');
  });

  it('inserting a point between two existing points', () => {
    const id = createPathWith('P', [cornerPoint(0, 0), cornerPoint(100, 100)]);
    getStore().insertPathPoint(id, 0, smoothPoint(50, 50, 30, 50, 70, 50));

    const points = getPath(id)!.points;
    expect(points.length).toBe(3);
    expect(points[1].type).toBe('smooth');
    expect(points[1].x).toBe(50);
  });
});
