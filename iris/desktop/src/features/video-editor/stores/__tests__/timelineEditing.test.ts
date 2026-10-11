/**
 * Timeline editing correctness: multi-select drag, trim/slip/roll/rate-stretch,
 * linked clips, speed-aware source math, split (transitions + keyframes),
 * lock protection, paste, ripple delete, compound clips and history sync.
 * See stores/editor/{dragEdit,clipTiming,trackLocks,clipboard,compound,editHistory}.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEditorStore } from '../editor.store';
import type { AudioClip, Clip, DragState, VideoClip } from '../editor.store';
import type { ClipEffect, Keyframe } from '@/types/videoProject.types';
import type { IrisAsset } from '@/shared/api/types';

const store = () => useEditorStore.getState();

function asset(id: string, extra: Partial<IrisAsset> = {}): IrisAsset {
  const now = new Date().toISOString();
  return {
    id,
    userId: '',
    name: id,
    storagePath: '',
    currentVersion: 1,
    assetType: 'VIDEO',
    mimeType: 'video/mp4',
    sizeBytes: 0,
    isPublic: false,
    metadata: { duration: 8 },
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

function video(start: number, dur: number, extra: Partial<VideoClip> = {}): Omit<VideoClip, 'id' | 'trackId'> {
  return {
    type: 'video',
    assetId: 'asset-v',
    name: 'V',
    startTime: start,
    endTime: start + dur,
    sourceStartTime: 0,
    sourceEndTime: dur,
    sourceDuration: 20,
    transform: { scale: 1, rotation: 0, opacity: 1, x: 0, y: 0 },
    volume: 1,
    muted: false,
    speed: 1,
    blendMode: 'normal',
    effects: [],
    keyframes: [],
    ...extra,
  };
}

function audio(start: number, dur: number, extra: Partial<AudioClip> = {}): Omit<AudioClip, 'id' | 'trackId'> {
  return {
    type: 'audio',
    assetId: 'asset-a',
    name: 'A',
    startTime: start,
    endTime: start + dur,
    sourceStartTime: 0,
    sourceEndTime: dur,
    sourceDuration: 20,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    effects: [],
    keyframes: [],
    ...extra,
  };
}

const vTrack = () => store().tracks.find((t) => t.type === 'video')!.id;
const aTrack = () => store().tracks.find((t) => t.type === 'audio')!.id;
const get = (id: string): Clip => {
  for (const t of store().tracks) {
    const c = t.clips.find((x) => x.id === id);
    if (c) return c;
  }
  throw new Error(`clip ${id} not found`);
};
const find = (id: string): Clip | undefined => store().tracks.flatMap((t) => t.clips).find((c) => c.id === id);
const trackOf = (id: string) => store().tracks.find((t) => t.clips.some((c) => c.id === id))!.id;
const historyLen = () => store().history.length;

/** Video + linked audio pair. */
function addPair(start: number, dur: number, v: Partial<VideoClip> = {}, a: Partial<AudioClip> = {}) {
  const vc = store().addClip(vTrack(), video(start, dur, v));
  const ac = store().addClip(aTrack(), audio(start, dur, a));
  store().linkClips(vc.id, ac.id);
  return { v: vc.id, a: ac.id };
}

function drag(clipId: string, operation: DragState['operation'], startTime: number, extra: Partial<DragState> = {}) {
  const clip = get(clipId);
  const linked = clip.linkedClipId ? find(clip.linkedClipId) : undefined;
  store().startDrag({
    clipId,
    trackId: trackOf(clipId),
    operation,
    startX: 0,
    startTime,
    originalClip: { ...clip },
    linkedOriginalClip: linked ? { ...linked } : undefined,
    ...extra,
  });
}

function lock(trackId: string) {
  store().updateTrack(trackId, { locked: true });
}

beforeEach(() => {
  store().closeEditor();
  store().openEditor(asset('project-timeline'));
});

afterEach(() => {
  vi.useRealTimers();
  store().closeEditor();
});

// ── #6 multi-select drag ───────────────────────────────────────────

describe('multi-select move drag', () => {
  it('moves other selected clips by the drag delta from their original positions (no accumulation)', () => {
    const a = store().addClip(vTrack(), video(0, 4));
    const b = store().addClip(vTrack(), video(10, 4));
    store().selectClipsInRange([a.id, b.id]);
    drag(a.id, 'move', 0);
    store().updateDrag(0, 1);
    store().updateDrag(0, 2);
    store().updateDrag(0, 3);
    expect(get(a.id).startTime).toBeCloseTo(3);
    expect(get(b.id).startTime).toBeCloseTo(13);
    expect(get(b.id).endTime).toBeCloseTo(17);
  });

  it('moves the linked audio of other selected clips and leaves clips on locked tracks', () => {
    const a = store().addClip(vTrack(), video(0, 4));
    const b = addPair(10, 4);
    const v2 = store().addTrack('video');
    const locked = store().addClip(v2.id, video(20, 2));
    lock(v2.id);
    store().selectClipsInRange([a.id, b.v, locked.id]);
    drag(a.id, 'move', 0);
    store().updateDrag(0, 2);
    store().updateDrag(0, 3);
    expect(get(b.v).startTime).toBeCloseTo(13);
    expect(get(b.a).startTime).toBeCloseTo(13);
    expect(get(locked.id).startTime).toBeCloseTo(20);
  });
});

// ── #7 drop on another track / cancel / no-op clicks ──────────────

describe('drag end and cancel', () => {
  it('a trim drag released over another track does not move the clip there', () => {
    const a = store().addClip(vTrack(), video(0, 4));
    const v2 = store().addTrack('video');
    drag(a.id, 'trim-end', 4);
    store().updateDrag(0, 3);
    store().endDrag(v2.id);
    expect(trackOf(a.id)).toBe(vTrack());
    expect(get(a.id).endTime).toBeCloseTo(3);
  });

  it('a move drag released over another track moves it there with one history entry', () => {
    const a = store().addClip(vTrack(), video(0, 4));
    const v2 = store().addTrack('video');
    const before = historyLen();
    drag(a.id, 'move', 0);
    store().updateDrag(0, 0);
    store().endDrag(v2.id);
    expect(trackOf(a.id)).toBe(v2.id);
    expect(historyLen()).toBe(before + 1);
  });

  it('moveClipToTrack refuses a locked target and records history', () => {
    const a = store().addClip(vTrack(), video(0, 4));
    const v2 = store().addTrack('video');
    const v3 = store().addTrack('video');
    lock(v3.id);
    store().moveClipToTrack(a.id, v3.id);
    expect(trackOf(a.id)).toBe(vTrack());
    const before = historyLen();
    store().moveClipToTrack(a.id, v2.id);
    expect(trackOf(a.id)).toBe(v2.id);
    expect(historyLen()).toBe(before + 1);
  });

  it('cancelDrag restores the linked clip and the other selected clips', () => {
    const p = addPair(0, 4);
    const b = store().addClip(vTrack(), video(10, 4));
    store().selectClipsInRange([p.v, b.id]);
    const before = historyLen();
    drag(p.v, 'move', 0);
    store().updateDrag(0, 2);
    store().cancelDrag();
    expect(get(p.v).startTime).toBe(0);
    expect(get(p.a).startTime).toBe(0);
    expect(get(b.id).startTime).toBe(10);
    expect(store().dragState).toBeNull();
    expect(historyLen()).toBe(before);
  });

  it('cancelDrag after a trim restores the linked clip too', () => {
    const p = addPair(0, 4);
    drag(p.v, 'trim-end', 4);
    store().updateDrag(0, 2);
    expect(get(p.a).endTime).toBeCloseTo(2);
    store().cancelDrag();
    expect(get(p.v).endTime).toBe(4);
    expect(get(p.a).endTime).toBe(4);
  });

  it('clicking a trim handle without moving leaves no history and no unsaved change', () => {
    const a = store().addClip(vTrack(), video(0, 4));
    store().markSaved();
    const before = historyLen();
    drag(a.id, 'trim-end', 4);
    store().endDrag();
    drag(a.id, 'trim-start', 0);
    store().updateDrag(0, 0);
    store().endDrag();
    expect(historyLen()).toBe(before);
    expect(store().hasUnsavedChanges()).toBe(false);
  });
});

// ── #8 history for effects and inspector edits ─────────────────────

const fx = (id: string, extra: Partial<ClipEffect> = {}): ClipEffect => ({
  id, type: 'filter', name: id, enabled: true, filterType: 'brightness', filterIntensity: 10, keyframes: [], ...extra,
});

describe('history of effects and property edits', () => {
  it('effect add/toggle/remove survive undo -> redo', () => {
    const a = store().addClip(vTrack(), video(0, 4));
    store().addClipEffect(a.id, fx('e1'));
    store().undo();
    expect((get(a.id) as VideoClip).effects).toHaveLength(0);
    store().redo();
    expect((get(a.id) as VideoClip).effects).toHaveLength(1);
    store().toggleClipEffect(a.id, 'e1');
    store().undo();
    expect((get(a.id) as VideoClip).effects[0].enabled).toBe(true);
    store().redo();
    expect((get(a.id) as VideoClip).effects[0].enabled).toBe(false);
  });

  it('inspector property edits are undoable and redo keeps them', () => {
    const a = store().addClip(vTrack(), video(0, 4));
    store().updateClip(a.id, { volume: 0.3 });
    store().undo();
    expect((get(a.id) as VideoClip).volume).toBe(1);
    store().redo();
    expect((get(a.id) as VideoClip).volume).toBe(0.3);
  });

  it('continuous slider changes coalesce into one history entry', () => {
    vi.useFakeTimers();
    const a = store().addClip(vTrack(), video(0, 4));
    store().addClipEffect(a.id, fx('e1'));
    vi.advanceTimersByTime(2000);
    const before = historyLen();
    for (let i = 0; i < 10; i++) store().updateClipEffect(a.id, 'e1', { filterIntensity: i * 5 });
    vi.advanceTimersByTime(2000);
    expect(historyLen()).toBe(before + 1);
    store().undo();
    expect((get(a.id) as VideoClip).effects[0].filterIntensity).toBe(10);
  });

  it('a save right after an edit does not turn dirty when the coalesced entry lands', () => {
    vi.useFakeTimers();
    const a = store().addClip(vTrack(), video(0, 4));
    store().updateClip(a.id, { volume: 0.5 });
    store().markSaved(store().captureSavePoint());
    vi.advanceTimersByTime(2000);
    expect(store().hasUnsavedChanges()).toBe(false);
  });

  it('toggleClipsMute is one undoable step', () => {
    const p = addPair(0, 4);
    const before = historyLen();
    store().toggleClipsMute([p.v, p.a]);
    expect((get(p.v) as VideoClip).muted).toBe(true);
    expect((get(p.a) as AudioClip).muted).toBe(true);
    expect(historyLen()).toBe(before + 1);
    store().undo();
    expect((get(p.v) as VideoClip).muted).toBe(false);
  });
});

// ── #9 locked tracks ───────────────────────────────────────────────

describe('locked tracks', () => {
  it('blocks remove/split/duplicate/update/effects on a locked clip', () => {
    const a = store().addClip(vTrack(), video(0, 4));
    lock(vTrack());
    const before = historyLen();
    store().removeClip(a.id);
    store().splitClip(a.id, 2);
    expect(store().duplicateClip(a.id)).toBeNull();
    store().updateClip(a.id, { volume: 0.2 });
    store().addClipEffect(a.id, fx('e1'));
    store().setClipEdge(a.id, 'end', 2);
    expect(find(a.id)).toBeDefined();
    expect(store().tracks.find((t) => t.id === vTrack())!.clips).toHaveLength(1);
    expect((get(a.id) as VideoClip).volume).toBe(1);
    expect((get(a.id) as VideoClip).effects).toHaveLength(0);
    expect(get(a.id).endTime).toBe(4);
    expect(historyLen()).toBe(before);
  });

  it('removing a clip does not delete its linked clip on a locked track', () => {
    const p = addPair(0, 4);
    lock(vTrack());
    store().removeClip(p.a);
    expect(find(p.a)).toBeUndefined();
    expect(find(p.v)).toBeDefined();
    expect(get(p.v).linkedClipId).toBeUndefined();
  });

  it('split, duplicate and mute shortcuts skip locked clips', () => {
    const p = addPair(0, 4);
    lock(aTrack());
    store().splitClip(p.v, 2);
    expect(store().tracks.find((t) => t.id === aTrack())!.clips).toHaveLength(1);
    store().selectClipsInRange([p.v, p.a]);
    store().duplicateSelectedClips();
    expect(store().tracks.find((t) => t.id === aTrack())!.clips).toHaveLength(1);
    store().toggleClipsMute([p.a]);
    expect((get(p.a) as AudioClip).muted).toBe(false);
  });

  it('paste skips a locked target track and compound skips locked clips', () => {
    const a = store().addClip(vTrack(), video(0, 4));
    const b = store().addClip(vTrack(), video(4, 4));
    store().selectClipsInRange([a.id]);
    store().copyClips();
    lock(vTrack());
    const before = historyLen();
    store().pasteClips();
    expect(store().tracks.find((t) => t.id === vTrack())!.clips).toHaveLength(2);
    expect(historyLen()).toBe(before);
    store().selectClipsInRange([a.id, b.id]);
    store().createCompoundClip();
    expect(find(a.id)).toBeDefined();
    expect(find(b.id)).toBeDefined();
  });
});

// ── #10 paste ──────────────────────────────────────────────────────

describe('paste', () => {
  it('pastes a linked pair as one step, selects the pasted clips and keeps the link', () => {
    const p = addPair(0, 4);
    store().selectClipsInRange([p.v]);
    store().copyClips();
    useEditorStore.setState({ currentTime: 10 });
    const before = historyLen();
    store().pasteClips();
    expect(historyLen()).toBe(before + 1);
    const ids = store().selection.clipIds;
    expect(ids).toHaveLength(2);
    const pv = get(ids.find((id) => get(id).type === 'video')!);
    const pa = get(ids.find((id) => get(id).type === 'audio')!);
    expect(pv.startTime).toBeCloseTo(10);
    expect(pa.startTime).toBeCloseTo(10);
    expect(pv.linkedClipId).toBe(pa.id);
    expect(pa.linkedClipId).toBe(pv.id);
    expect(store().selectedClip?.id).toBe(ids[0]);
    store().undo();
    expect(find(pv.id)).toBeUndefined();
    expect(find(pa.id)).toBeUndefined();
  });

  it('overwrites what is under the pasted range instead of overlapping it', () => {
    const a = store().addClip(vTrack(), video(0, 4));
    const b = store().addClip(vTrack(), video(10, 6));
    store().selectClipsInRange([a.id]);
    store().copyClips();
    useEditorStore.setState({ currentTime: 8 });
    store().pasteClips();
    const clips = store().tracks.find((t) => t.id === vTrack())!.clips;
    const sorted = [...clips].sort((x, y) => x.startTime - y.startTime);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].startTime).toBeGreaterThanOrEqual(sorted[i - 1].endTime - 1e-6);
    }
    expect(get(b.id).startTime).toBeCloseTo(12);
    expect(get(b.id).sourceStartTime).toBeCloseTo(2);
  });
});

// ── #11 linked clips stay in sync ──────────────────────────────────

describe('linked clips', () => {
  it('the neighbour snap at drag end moves the linked clip too', () => {
    const p = addPair(0, 4);
    store().addClip(vTrack(), video(5, 4));
    drag(p.v, 'move', 0);
    store().updateDrag(0, 1.5);
    store().endDrag();
    expect(get(p.v).startTime).toBeCloseTo(1);
    expect(get(p.a).startTime).toBeCloseTo(1);
  });

  it('slip shifts the linked clip source as well', () => {
    const p = addPair(0, 4, { sourceStartTime: 2, sourceEndTime: 6 }, { sourceStartTime: 2, sourceEndTime: 6 });
    drag(p.v, 'slip', 1);
    store().updateDrag(0, 2);
    store().endDrag();
    expect(get(p.v).sourceStartTime).toBeCloseTo(3);
    expect(get(p.a).sourceStartTime).toBeCloseTo(3);
    expect(get(p.a).sourceEndTime).toBeCloseTo(7);
  });

  it('rate stretch changes the linked clip and stops at the next clip', () => {
    const p = addPair(0, 4);
    store().addClip(aTrack(), audio(6, 2));
    drag(p.v, 'rate-stretch', 4);
    store().updateDrag(0, 8);
    store().endDrag();
    expect(get(p.v).endTime).toBeCloseTo(6);
    expect(get(p.a).endTime).toBeCloseTo(6);
    expect((get(p.v) as VideoClip).speed).toBeCloseTo(4 / 6);
    expect((get(p.a) as AudioClip & { speed?: number }).speed).toBeCloseTo(4 / 6);
  });

  it('inspector speed changes apply to the linked clip without overlapping the next clip', () => {
    const p = addPair(0, 4);
    store().addClip(vTrack(), video(6, 2));
    store().setClipSpeed(p.v, 0.5);
    expect(get(p.v).endTime).toBeCloseTo(6);
    expect(get(p.a).endTime).toBeCloseTo(6);
    store().setClipSpeed(p.v, 2);
    expect(get(p.v).endTime).toBeCloseTo(2);
    expect(get(p.a).endTime).toBeCloseTo(2);
  });

  it('ripple delete removes the linked clip and closes only the deleted range', () => {
    store().addClip(vTrack(), video(1, 4));
    const b = addPair(5, 4);
    const c = addPair(12, 2);
    store().selectClipsInRange([b.v]);
    store().rippleDelete();
    expect(find(b.v)).toBeUndefined();
    expect(find(b.a)).toBeUndefined();
    const vClips = [...store().tracks.find((t) => t.id === vTrack())!.clips].sort((x, y) => x.startTime - y.startTime);
    expect(vClips[0].startTime).toBeCloseTo(1); // front gap kept
    expect(get(c.v).startTime).toBeCloseTo(8); // 12 - 4
    expect(get(c.a).startTime).toBeCloseTo(8);
  });
});

// ── #5 speed-aware source math ─────────────────────────────────────

describe('speed-aware split / trim / roll', () => {
  const fast = { speed: 2, sourceStartTime: 0, sourceEndTime: 8 };

  it('split uses timeline time x speed', () => {
    const a = store().addClip(vTrack(), video(0, 4, fast));
    store().splitClip(a.id, 1);
    const pieces = store().tracks.find((t) => t.id === vTrack())!.clips;
    const second = pieces.find((c) => c.id !== a.id)!;
    expect(get(a.id).sourceEndTime).toBeCloseTo(2);
    expect(second.sourceStartTime).toBeCloseTo(2);
    expect(second.sourceEndTime).toBeCloseTo(8);
  });

  it('trim-start and trim-end drags use timeline time x speed', () => {
    const a = store().addClip(vTrack(), video(0, 4, fast));
    drag(a.id, 'trim-start', 0);
    store().updateDrag(0, 1);
    store().endDrag();
    expect(get(a.id).sourceStartTime).toBeCloseTo(2);
    drag(a.id, 'trim-end', 4);
    store().updateDrag(0, 3);
    store().endDrag();
    expect(get(a.id).sourceEndTime).toBeCloseTo(6);
  });

  it('inspector Start/End edits use timeline time x speed', () => {
    const a = store().addClip(vTrack(), video(0, 4, fast));
    store().setClipEdge(a.id, 'start', 1);
    expect(get(a.id).sourceStartTime).toBeCloseTo(2);
    store().setClipEdge(a.id, 'end', 3);
    expect(get(a.id).sourceEndTime).toBeCloseTo(6);
  });

  it('roll edit uses each clip speed', () => {
    const a = store().addClip(vTrack(), video(0, 4, { ...fast, sourceDuration: 20 }));
    const b = store().addClip(vTrack(), video(4, 4, { speed: 1, sourceStartTime: 4, sourceEndTime: 8 }));
    drag(a.id, 'roll-end', 4, { adjacentClipId: b.id, adjacentOriginalClip: { ...get(b.id) } });
    store().updateDrag(0, 5);
    store().endDrag();
    expect(get(a.id).sourceEndTime).toBeCloseTo(10);
    expect(get(b.id).sourceStartTime).toBeCloseTo(5);
  });
});

// ── #14 split: transitions and keyframes ───────────────────────────

describe('split transitions and keyframes', () => {
  const kf = (time: number, value: number): Keyframe => ({ time, property: 'opacity', value });

  it('first piece keeps start transitions, second keeps end transitions', () => {
    const a = store().addClip(vTrack(), video(0, 4, {
      effects: [
        fx('in', { type: 'transition', transitionType: 'fade', transitionPosition: 'start' }),
        fx('out', { type: 'transition', transitionType: 'fade', transitionPosition: 'end' }),
        fx('both', { type: 'transition', transitionType: 'dissolve', transitionPosition: 'both' }),
        fx('f'),
      ],
    }));
    store().splitClip(a.id, 2);
    const first = get(a.id) as VideoClip;
    const second = store().tracks.find((t) => t.id === vTrack())!.clips.find((c) => c.id !== a.id) as VideoClip;
    const desc = (c: VideoClip) => c.effects.map((e) => `${e.id}:${e.type === 'transition' ? e.transitionPosition : '-'}`).sort();
    expect(desc(first)).toEqual(['both:start', 'f:-', 'in:start']);
    expect(desc(second)).toEqual(['both:end', 'f:-', 'out:end']);
  });

  it('second piece keyframes are rebased on the split point with interpolated boundaries', () => {
    const a = store().addClip(vTrack(), video(0, 4, { keyframes: [kf(0, 0), kf(4, 1)] }));
    store().splitClip(a.id, 1);
    const first = get(a.id) as VideoClip;
    const second = store().tracks.find((t) => t.id === vTrack())!.clips.find((c) => c.id !== a.id) as VideoClip;
    expect(first.keyframes.map((k) => [k.time, k.value])).toEqual([[0, 0], [1, 0.25]]);
    expect(second.keyframes.map((k) => [k.time, +k.value.toFixed(4)])).toEqual([[0, 0.25], [3, 1]]);
  });

  it('trim-start shifts keyframes with the new clip start', () => {
    const a = store().addClip(vTrack(), video(0, 4, { keyframes: [kf(0, 0), kf(4, 1)] }));
    drag(a.id, 'trim-start', 0);
    store().updateDrag(0, 1);
    store().endDrag();
    const c = get(a.id) as VideoClip;
    expect(c.keyframes.map((k) => [k.time, +k.value.toFixed(4)])).toEqual([[0, 0.25], [3, 1]]);
  });
});

// ── #15 history jumps, labels, background audio patch ──────────────

describe('history sync and background updates', () => {
  it('undo clears a selection of clips that no longer exist and updates duration', () => {
    store().addClip(vTrack(), video(0, 4));
    const b = store().addClip(vTrack(), video(4, 6));
    store().selectClip(b.id);
    expect(store().duration).toBeCloseTo(10);
    store().undo();
    expect(store().selectedClip).toBeNull();
    expect(store().selection.clipIds).toEqual([]);
    expect(store().duration).toBeCloseTo(4);
  });

  it('redo refreshes the selected clip object', () => {
    const a = store().addClip(vTrack(), video(0, 4));
    store().selectClip(a.id);
    store().splitClip(a.id, 2);
    store().undo();
    expect(store().selectedClip?.endTime).toBe(4);
    store().redo();
    expect(store().selectedClip?.endTime).toBe(2);
  });

  it('initializeProject resets the history labels with the history', () => {
    store().addClip(vTrack(), video(0, 4));
    store().addClip(vTrack(), video(4, 4));
    store().initializeProject(asset('project-again'));
    expect(store().history).toHaveLength(1);
    expect(store().historyLabels).toHaveLength(1);
  });

  it('a late audio separation result is ignored after the project changed', async () => {
    let resolve!: (v: { success: boolean; outputPath?: string }) => void;
    const separate = vi.fn(() => new Promise<{ success: boolean; outputPath?: string }>((r) => { resolve = r; }));
    (window as unknown as { electronAPI: unknown }).electronAPI = { audioExtract: { separate } };
    try {
      store().closeEditor();
      store().openEditor(asset('file:///C:/videos/first.mp4'));
      expect(separate).toHaveBeenCalledTimes(1);
      const first = resolve;
      store().closeEditor();
      // Second project: separation never resolves.
      store().openEditor(asset('file:///C:/videos/second.mp4'));
      first({ success: true, outputPath: 'C:/videos/audio_first.m4a' });
      await Promise.resolve();
      await Promise.resolve();
      expect((get('clip-audio-main') as AudioClip).assetId).toBe('file:///C:/videos/second.mp4');
    } finally {
      delete (window as unknown as { electronAPI?: unknown }).electronAPI;
    }
  });
});

// ── #13 compound clips ─────────────────────────────────────────────

describe('compound clips', () => {
  it('does not merge clips of different track types into one track', () => {
    const p = addPair(0, 4);
    const b = store().addClip(vTrack(), video(4, 4));
    store().selectClipsInRange([p.v, p.a, b.id]);
    store().createCompoundClip();
    const vt = store().tracks.find((t) => t.id === vTrack())!;
    const at = store().tracks.find((t) => t.id === aTrack())!;
    expect(vt.clips.every((c) => c.type === 'compound')).toBe(true);
    for (const c of vt.clips) {
      if (c.type === 'compound') expect(c.innerClips.every((ic) => ic.type === 'video')).toBe(true);
    }
    expect(at.clips).toHaveLength(1);
    const ac = at.clips[0];
    expect(ac.type === 'audio' || (ac.type === 'compound' && ac.innerClips.every((ic) => ic.type === 'audio'))).toBe(true);
  });
});
