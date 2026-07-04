/**
 * History utilities (branches, tree, selection history)
 *
 * Part of the image-editor adjustments library (see ./index.ts barrel),
 * extracted from the former monolithic adjustments.ts.
 */

export interface HistoryBranch {
  id: string;
  parentId: string | null;
  snapshotIndex: number;
  label: string;
  timestamp: number;
  children: string[];
}

/**
 * Create a new history branch node for non-linear history.
 */
export function createHistoryBranch(
  id: string,
  parentId: string | null,
  snapshotIndex: number,
  label: string
): HistoryBranch {
  return { id, parentId, snapshotIndex, label, timestamp: Date.now(), children: [] };
}

/**
 * Build a history tree from flat branch array.
 * Returns a map of id → branch with children populated.
 */
export function buildHistoryTree(branches: HistoryBranch[]): Map<string, HistoryBranch> {
  const map = new Map<string, HistoryBranch>();
  for (const b of branches) map.set(b.id, { ...b, children: [] });
  for (const b of branches) {
    if (b.parentId && map.has(b.parentId)) {
      map.get(b.parentId)!.children.push(b.id);
    }
  }
  return map;
}

/**
 * Store and restore previous selection masks.
 * Returns a closure that manages selection history.
 */
export function createSelectionHistory(maxSize = 10) {
  const history: Uint8ClampedArray[] = [];

  return {
    push(mask: Uint8ClampedArray) {
      history.push(new Uint8ClampedArray(mask));
      if (history.length > maxSize) history.shift();
    },
    reselect(): Uint8ClampedArray | null {
      return history.length > 0 ? new Uint8ClampedArray(history[history.length - 1]) : null;
    },
    size() { return history.length; },
    clear() { history.length = 0; },
  };
}
