/**
 * Dirty tracking for the image editor store.
 *
 * `isDirty` is not a flag that features switch on by hand. It is derived on
 * every state change from three inputs:
 *
 *  1. history: the document differs from the saved/opened point when
 *     `historyIndex !== savedHistoryIndex` (so undoing back to the opened state
 *     makes the document clean again). `savedHistoryIndex === null` means the
 *     saved state is no longer reachable (trimmed or discarded by a new edit).
 *  2. render-time transforms (rotation / flips are not history entries; they
 *     are baked at save time), compared with the transform at the saved point.
 *  3. `hasUntrackedChanges`: legacy actions that change the document without a
 *     history entry. Sticky until the next save/open.
 *
 * Every `set` / `setState` goes through `resolveDirtyPatch`, which also keeps
 * the old call sites working:
 *  - a patch with `isDirty: false` records a saved point (open, save, close)
 *  - a patch with `isDirty: true` records an untracked change
 */

export interface SavedTransform {
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
}

export interface DirtyTrackingState extends SavedTransform {
  historyIndex: number;
  isDirty: boolean;
  /** History index of the saved/opened state; null when it is no longer in history. */
  savedHistoryIndex: number | null;
  /** Render-time transform at the saved/opened state. */
  savedTransform: SavedTransform;
  /** A change that has no history entry happened since the saved point. */
  hasUntrackedChanges: boolean;
}

export const CLEAN_TRANSFORM: SavedTransform = { rotation: 0, flipHorizontal: false, flipVertical: false };

export const INITIAL_DIRTY_STATE: Pick<
  DirtyTrackingState,
  'isDirty' | 'savedHistoryIndex' | 'savedTransform' | 'hasUntrackedChanges'
> = {
  isDirty: false,
  savedHistoryIndex: -1,
  savedTransform: CLEAN_TRANSFORM,
  hasUntrackedChanges: false,
};

type DirtyInputs = Pick<
  DirtyTrackingState,
  'historyIndex' | 'savedHistoryIndex' | 'savedTransform' | 'hasUntrackedChanges' | 'rotation' | 'flipHorizontal' | 'flipVertical'
>;

export function deriveIsDirty(s: DirtyInputs): boolean {
  if (s.hasUntrackedChanges) return true;
  if (s.savedHistoryIndex === null || s.savedHistoryIndex !== s.historyIndex) return true;
  const t = s.savedTransform;
  return s.rotation !== t.rotation || s.flipHorizontal !== t.flipHorizontal || s.flipVertical !== t.flipVertical;
}

/**
 * Where the saved index lands after `pushHistory` cut the redo branch at
 * `prevIndex` and dropped `removedFromFront` old entries (history limit).
 */
export function shiftSavedIndexOnPush(
  saved: number | null,
  prevIndex: number,
  removedFromFront: number,
): number | null {
  if (saved === null) return null;
  // The saved state was in the redo branch that the new entry discards.
  if (saved > prevIndex) return null;
  const shifted = saved - removedFromFront;
  // -1 only means "the empty history before the first entry"; once entries were
  // dropped from the front that state is gone too.
  if (shifted < -1 || (shifted === -1 && removedFromFront > 0)) return null;
  return shifted;
}

function pick<S extends DirtyTrackingState, K extends keyof S>(state: S, patch: Partial<S>, key: K): S[K] {
  return (key in patch ? patch[key] : state[key]) as S[K];
}

/** Add the derived `isDirty` (and the saved point / untracked flag it implies) to a patch. */
export function resolveDirtyPatch<S extends DirtyTrackingState>(state: S, patch: Partial<S>): Partial<S> {
  const out: Partial<S> = { ...patch };
  if (patch.isDirty === false) {
    out.savedHistoryIndex = pick(state, patch, 'historyIndex');
    out.savedTransform = {
      rotation: pick(state, patch, 'rotation'),
      flipHorizontal: pick(state, patch, 'flipHorizontal'),
      flipVertical: pick(state, patch, 'flipVertical'),
    };
    out.hasUntrackedChanges = false;
  } else if (patch.isDirty === true) {
    out.hasUntrackedChanges = true;
  }
  out.isDirty = deriveIsDirty({
    historyIndex: pick(state, out, 'historyIndex'),
    savedHistoryIndex: pick(state, out, 'savedHistoryIndex'),
    savedTransform: pick(state, out, 'savedTransform'),
    hasUntrackedChanges: pick(state, out, 'hasUntrackedChanges'),
    rotation: pick(state, out, 'rotation'),
    flipHorizontal: pick(state, out, 'flipHorizontal'),
    flipVertical: pick(state, out, 'flipVertical'),
  });
  return out;
}

type SetFn<S> = (partial: S | Partial<S> | ((state: S) => S | Partial<S>), replace?: boolean) => void;

/** Wrap a zustand `set` so every update carries the derived `isDirty`. */
export function createDirtyAwareSet<S extends DirtyTrackingState>(set: SetFn<S>): SetFn<S> {
  return (partial, replace) => {
    (set as (p: (state: S) => Partial<S>, r?: boolean) => void)((state: S) => {
      const patch = typeof partial === 'function' ? partial(state) : partial;
      return resolveDirtyPatch(state, patch as Partial<S>);
    }, replace);
  };
}
