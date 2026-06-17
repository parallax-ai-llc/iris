/**
 * Editor Store Unit Tests — Phase 4 Features
 *
 * Covers:
 *  - Multi-clip Selection (Phase 4a): selectClip, selectClipsInRange, clearSelection, deleteSelected, duplicateSelectedClips
 *  - History (Phase 4b): pushHistory, undo, redo, jumpToHistory, clearHistory, history limit
 *  - Adjustment Layers (Phase 4c): addAdjustmentLayer with auto-track creation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../editor.store';
import type { VideoClip, AudioClip, Track, EditorProject, AdjustmentClip } from '../editor.store';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeVideoClip(overrides: Partial<VideoClip> = {}): VideoClip {
  return {
    id: 'clip-v1',
    trackId: 'track-v1',
    startTime: 0,
    endTime: 10,
    sourceStartTime: 0,
    sourceEndTime: 10,
    name: 'Test Video',
    type: 'video',
    assetId: 'asset-1',
    transform: { scale: 1, rotation: 0, opacity: 1, x: 0, y: 0 },
    volume: 1,
    muted: false,
    speed: 1,
    blendMode: 'normal',
    effects: [],
    keyframes: [],
    ...overrides,
  };
}


function makeTrack(type: 'video' | 'audio' | 'adjustment', clips: VideoClip[] | AudioClip[] | AdjustmentClip[], id?: string): Track {
  return {
    id: id || `track-${type}-1`,
    type,
    name: type,
    locked: false,
    muted: false,
    solo: false,
    visible: true,
    volume: 1,
    height: 80,
    clips,
  };
}

function makeProject(tracks: Track[] = []): EditorProject {
  return {
    id: 'project-1',
    name: 'Test Project',
    assetId: 'asset-main',
    duration: 60,
    tracks,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ─── reset store before each test ───────────────────────────────────────────

beforeEach(() => {
  useEditorStore.setState({
    tracks: [],
    selectedClip: null,
    selection: { clipIds: [], trackIds: [] },
    history: [],
    historyIndex: -1,
    historyLabels: [],
    project: null,
    duration: 60,
  });
});

// ─── Multi-clip Selection (Phase 4a) ────────────────────────────────────────

describe('Multi-clip Selection', () => {
  const clipA = makeVideoClip({ id: 'clip-a', trackId: 'track-v1', startTime: 0, endTime: 5 });
  const clipB = makeVideoClip({ id: 'clip-b', trackId: 'track-v1', startTime: 5, endTime: 10 });
  const clipC = makeVideoClip({ id: 'clip-c', trackId: 'track-v1', startTime: 10, endTime: 15 });

  function setupThreeClips() {
    const track = makeTrack('video', [clipA, clipB, clipC]);
    useEditorStore.setState({ tracks: [track] });
  }

  describe('selectClip', () => {
    it('single click selects one clip and deselects others', () => {
      setupThreeClips();

      // Select clip A first
      useEditorStore.getState().selectClip('clip-a');
      expect(useEditorStore.getState().selection.clipIds).toEqual(['clip-a']);
      expect(useEditorStore.getState().selectedClip?.id).toBe('clip-a');

      // Select clip B — clip A should be deselected
      useEditorStore.getState().selectClip('clip-b');
      expect(useEditorStore.getState().selection.clipIds).toEqual(['clip-b']);
      expect(useEditorStore.getState().selectedClip?.id).toBe('clip-b');
    });

    it('shift adds to selection', () => {
      setupThreeClips();

      useEditorStore.getState().selectClip('clip-a');
      useEditorStore.getState().selectClip('clip-b', { shift: true });

      const sel = useEditorStore.getState().selection;
      expect(sel.clipIds).toContain('clip-a');
      expect(sel.clipIds).toContain('clip-b');
      expect(sel.clipIds).toHaveLength(2);
    });

    it('ctrl toggles selection (add then remove)', () => {
      setupThreeClips();

      // Select A, then ctrl-add B
      useEditorStore.getState().selectClip('clip-a');
      useEditorStore.getState().selectClip('clip-b', { ctrl: true });
      expect(useEditorStore.getState().selection.clipIds).toContain('clip-a');
      expect(useEditorStore.getState().selection.clipIds).toContain('clip-b');

      // Ctrl-click B again to toggle it off
      useEditorStore.getState().selectClip('clip-b', { ctrl: true });
      expect(useEditorStore.getState().selection.clipIds).not.toContain('clip-b');
      expect(useEditorStore.getState().selection.clipIds).toContain('clip-a');
    });
  });

  describe('selectClipsInRange', () => {
    it('selects multiple clips by IDs', () => {
      setupThreeClips();

      useEditorStore.getState().selectClipsInRange(['clip-a', 'clip-b', 'clip-c']);

      const sel = useEditorStore.getState().selection;
      expect(sel.clipIds).toEqual(['clip-a', 'clip-b', 'clip-c']);
      expect(useEditorStore.getState().selectedClip?.id).toBe('clip-a');
    });

    it('passing empty array deselects all', () => {
      setupThreeClips();
      useEditorStore.getState().selectClip('clip-a');

      useEditorStore.getState().selectClipsInRange([]);

      expect(useEditorStore.getState().selection.clipIds).toEqual([]);
      expect(useEditorStore.getState().selectedClip).toBeNull();
    });
  });

  describe('clearSelection', () => {
    it('deselects all clips', () => {
      setupThreeClips();
      useEditorStore.getState().selectClipsInRange(['clip-a', 'clip-b']);

      useEditorStore.getState().clearSelection();

      expect(useEditorStore.getState().selection.clipIds).toEqual([]);
      expect(useEditorStore.getState().selection.trackIds).toEqual([]);
      expect(useEditorStore.getState().selectedClip).toBeNull();
    });
  });

  describe('deleteSelected', () => {
    it('removes all selected clips from tracks', () => {
      setupThreeClips();
      // Need a project for pushHistory (called internally by deleteSelected)
      useEditorStore.setState({ project: makeProject() });

      useEditorStore.getState().selectClipsInRange(['clip-a', 'clip-c']);
      useEditorStore.getState().deleteSelected();

      const remaining = useEditorStore.getState().tracks[0].clips;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('clip-b');

      // Selection should be cleared
      expect(useEditorStore.getState().selection.clipIds).toEqual([]);
      expect(useEditorStore.getState().selectedClip).toBeNull();
    });

    it('is a no-op if nothing is selected', () => {
      setupThreeClips();
      useEditorStore.setState({ project: makeProject() });

      useEditorStore.getState().deleteSelected();

      expect(useEditorStore.getState().tracks[0].clips).toHaveLength(3);
    });
  });

  describe('duplicateSelectedClips', () => {
    it('creates copies with time offset', () => {
      setupThreeClips();
      useEditorStore.setState({ project: makeProject() });

      useEditorStore.getState().selectClipsInRange(['clip-a']);
      useEditorStore.getState().duplicateSelectedClips();

      const clips = useEditorStore.getState().tracks[0].clips;
      expect(clips).toHaveLength(4); // 3 originals + 1 copy

      // Find the duplicated clip (not one of the original IDs)
      const dupClip = clips.find((c) => !['clip-a', 'clip-b', 'clip-c'].includes(c.id));
      expect(dupClip).toBeDefined();
      expect(dupClip!.name).toContain('(copy)');
      // Duplicated clip should start after the original ends, with 0.5s offset
      expect(dupClip!.startTime).toBe(clipA.endTime + 0.5);
      const originalDuration = clipA.endTime - clipA.startTime;
      expect(dupClip!.endTime - dupClip!.startTime).toBe(originalDuration);
    });

    it('duplicates multiple selected clips', () => {
      setupThreeClips();
      useEditorStore.setState({ project: makeProject() });

      useEditorStore.getState().selectClipsInRange(['clip-a', 'clip-b']);
      useEditorStore.getState().duplicateSelectedClips();

      const clips = useEditorStore.getState().tracks[0].clips;
      expect(clips).toHaveLength(5); // 3 originals + 2 copies
    });
  });

  describe('moveSelectedClips', () => {
    it('moves selected clips by deltaTime', () => {
      setupThreeClips();

      useEditorStore.getState().selectClipsInRange(['clip-a', 'clip-b']);
      useEditorStore.getState().moveSelectedClips(2);

      const clips = useEditorStore.getState().tracks[0].clips;
      const movedA = clips.find((c) => c.id === 'clip-a')!;
      const movedB = clips.find((c) => c.id === 'clip-b')!;
      const unmovedC = clips.find((c) => c.id === 'clip-c')!;

      expect(movedA.startTime).toBe(2);
      expect(movedA.endTime).toBe(7);
      expect(movedB.startTime).toBe(7);
      expect(movedB.endTime).toBe(12);
      // Clip C should be unchanged
      expect(unmovedC.startTime).toBe(10);
      expect(unmovedC.endTime).toBe(15);
    });

    it('clamps startTime to 0 when moving left', () => {
      setupThreeClips();

      useEditorStore.getState().selectClipsInRange(['clip-a']);
      useEditorStore.getState().moveSelectedClips(-5);

      const clips = useEditorStore.getState().tracks[0].clips;
      const movedA = clips.find((c) => c.id === 'clip-a')!;
      expect(movedA.startTime).toBe(0);
    });
  });
});

// ─── History (Phase 4b) ─────────────────────────────────────────────────────

describe('History', () => {
  function setupWithProject() {
    const clip = makeVideoClip();
    const track = makeTrack('video', [clip]);
    const project = makeProject([track]);
    useEditorStore.setState({
      tracks: [track],
      project,
    });
  }

  describe('pushHistory', () => {
    it('adds entry to history stack with label', () => {
      setupWithProject();

      useEditorStore.getState().pushHistory('Add clip');

      const state = useEditorStore.getState();
      expect(state.history).toHaveLength(1);
      expect(state.historyLabels).toEqual(['Add clip']);
      expect(state.historyIndex).toBe(0);
    });

    it('uses default label "Edit" when none provided', () => {
      setupWithProject();

      useEditorStore.getState().pushHistory();

      expect(useEditorStore.getState().historyLabels).toEqual(['Edit']);
    });

    it('trims redo states when pushing new history after undo', () => {
      setupWithProject();

      // Push three states
      useEditorStore.getState().pushHistory('Step 1');
      useEditorStore.getState().pushHistory('Step 2');
      useEditorStore.getState().pushHistory('Step 3');
      expect(useEditorStore.getState().history).toHaveLength(3);

      // Undo once (back to Step 2)
      useEditorStore.getState().undo();
      expect(useEditorStore.getState().historyIndex).toBe(1);

      // Push new state — Step 3 should be trimmed
      useEditorStore.getState().pushHistory('Step 4');
      expect(useEditorStore.getState().history).toHaveLength(3);
      expect(useEditorStore.getState().historyLabels).toEqual(['Step 1', 'Step 2', 'Step 4']);
    });
  });

  describe('undo', () => {
    it('restores previous state', () => {
      setupWithProject();

      // Push initial state
      useEditorStore.getState().pushHistory('Initial');

      // Modify tracks and push again
      const newClip = makeVideoClip({ id: 'clip-v2', startTime: 10, endTime: 20 });
      const tracks = useEditorStore.getState().tracks;
      useEditorStore.setState({
        tracks: tracks.map((t) => ({ ...t, clips: [...t.clips, newClip] })),
      });
      useEditorStore.getState().pushHistory('Add second clip');

      expect(useEditorStore.getState().history).toHaveLength(2);
      expect(useEditorStore.getState().historyIndex).toBe(1);

      // Undo — should restore to the Initial state (index 0)
      useEditorStore.getState().undo();

      expect(useEditorStore.getState().historyIndex).toBe(0);
      // Tracks should be restored from the history entry
      expect(useEditorStore.getState().tracks[0].clips).toHaveLength(1);
    });

    it('is a no-op when at beginning of history', () => {
      setupWithProject();
      useEditorStore.getState().pushHistory('Only entry');

      // historyIndex is 0, undo should not go below 0
      useEditorStore.getState().undo();
      expect(useEditorStore.getState().historyIndex).toBe(0);
    });
  });

  describe('redo', () => {
    it('restores next state', () => {
      setupWithProject();

      useEditorStore.getState().pushHistory('State A');
      useEditorStore.getState().pushHistory('State B');

      // Undo, then redo
      useEditorStore.getState().undo();
      expect(useEditorStore.getState().historyIndex).toBe(0);

      useEditorStore.getState().redo();
      expect(useEditorStore.getState().historyIndex).toBe(1);
    });

    it('is a no-op when at end of history', () => {
      setupWithProject();
      useEditorStore.getState().pushHistory('Only entry');

      useEditorStore.getState().redo();
      expect(useEditorStore.getState().historyIndex).toBe(0);
    });
  });

  describe('jumpToHistory', () => {
    it('jumps to arbitrary history index', () => {
      setupWithProject();

      useEditorStore.getState().pushHistory('Step 1');
      useEditorStore.getState().pushHistory('Step 2');
      useEditorStore.getState().pushHistory('Step 3');

      useEditorStore.getState().jumpToHistory(0);
      expect(useEditorStore.getState().historyIndex).toBe(0);

      useEditorStore.getState().jumpToHistory(2);
      expect(useEditorStore.getState().historyIndex).toBe(2);
    });

    it('ignores out-of-range indices', () => {
      setupWithProject();
      useEditorStore.getState().pushHistory('Step 1');

      useEditorStore.getState().jumpToHistory(-1);
      expect(useEditorStore.getState().historyIndex).toBe(0);

      useEditorStore.getState().jumpToHistory(99);
      expect(useEditorStore.getState().historyIndex).toBe(0);
    });
  });

  describe('clearHistory', () => {
    it('resets history stack completely', () => {
      setupWithProject();

      useEditorStore.getState().pushHistory('Step 1');
      useEditorStore.getState().pushHistory('Step 2');

      useEditorStore.getState().clearHistory();

      const state = useEditorStore.getState();
      expect(state.history).toEqual([]);
      expect(state.historyIndex).toBe(-1);
      expect(state.historyLabels).toEqual([]);
    });
  });

  describe('history limit', () => {
    it('drops oldest entries when exceeding 50', () => {
      setupWithProject();

      // Push 55 history entries
      for (let i = 0; i < 55; i++) {
        useEditorStore.getState().pushHistory(`Step ${i}`);
      }

      const state = useEditorStore.getState();
      expect(state.history).toHaveLength(50);
      expect(state.historyLabels).toHaveLength(50);
      // The oldest 5 should have been dropped
      expect(state.historyLabels[0]).toBe('Step 5');
      expect(state.historyLabels[49]).toBe('Step 54');
      expect(state.historyIndex).toBe(49);
    });
  });
});

// ─── Adjustment Layers (Phase 4c) ───────────────────────────────────────────

describe('Adjustment Layers', () => {
  function setupWithProject() {
    const videoTrack = makeTrack('video', [makeVideoClip()]);
    const project = makeProject([videoTrack]);
    useEditorStore.setState({
      tracks: [videoTrack],
      project,
    });
  }

  it('creates adjustment clip on correct track', () => {
    setupWithProject();

    // Create an adjustment track first
    const adjTrack = useEditorStore.getState().addTrack('adjustment');
    const adjClip = useEditorStore.getState().addAdjustmentLayer(adjTrack.id, 2, 5);

    expect(adjClip.type).toBe('adjustment');
    expect(adjClip.startTime).toBe(2);
    expect(adjClip.endTime).toBe(7);
    expect(adjClip.trackId).toBe(adjTrack.id);

    // Verify it is on the correct track in state
    const tracks = useEditorStore.getState().tracks;
    const storedTrack = tracks.find((t) => t.id === adjTrack.id);
    expect(storedTrack?.clips).toHaveLength(1);
    expect(storedTrack?.clips[0].id).toBe(adjClip.id);
  });

  it('adjustment clip has correct type and default effects', () => {
    setupWithProject();

    const adjTrack = useEditorStore.getState().addTrack('adjustment');
    const adjClip = useEditorStore.getState().addAdjustmentLayer(adjTrack.id, 0, 10);

    expect(adjClip.type).toBe('adjustment');
    expect(adjClip.opacity).toBe(1);
    expect(adjClip.effects).toHaveLength(1);
    expect(adjClip.effects[0].name).toBe('Brightness');
    expect(adjClip.effects[0].enabled).toBe(true);
    expect(adjClip.effects[0].type).toBe('filter');
    expect(adjClip.keyframes).toEqual([]);
  });

  it('auto-creates adjustment track if given track is not adjustment type', () => {
    setupWithProject();

    // Pass a video track ID — should auto-create an adjustment track
    const videoTrackId = useEditorStore.getState().tracks[0].id;
    const adjClip = useEditorStore.getState().addAdjustmentLayer(videoTrackId, 0, 5);

    // Should have created a new adjustment track
    const tracks = useEditorStore.getState().tracks;
    const adjTrack = tracks.find((t) => t.type === 'adjustment');
    expect(adjTrack).toBeDefined();
    expect(adjClip.trackId).toBe(adjTrack!.id);
    expect(adjTrack!.clips).toHaveLength(1);

    // Original video track should be unaffected
    const origVideoTrack = tracks.find((t) => t.id === videoTrackId);
    expect(origVideoTrack?.clips).toHaveLength(1); // still just the original video clip
  });

  it('auto-creates adjustment track if trackId does not exist', () => {
    setupWithProject();

    const adjClip = useEditorStore.getState().addAdjustmentLayer('nonexistent-track', 0, 5);

    const tracks = useEditorStore.getState().tracks;
    const adjTrack = tracks.find((t) => t.type === 'adjustment');
    expect(adjTrack).toBeDefined();
    expect(adjClip.trackId).toBe(adjTrack!.id);
  });
});
