/**
 * Editor Store Unit Tests — Phase 5 Features
 *
 * Covers:
 *  - Compound Clips: createCompoundClip, expandCompoundClip
 *  - Multicam Editing: addMulticamSource, removeMulticamSource, setMulticamActiveAngle,
 *    addMulticamCut, removeMulticamCut, clearMulticamCuts, flattenMulticamToTimeline, toggleMulticam
 *  - Proxy Workflow: toggleProxyMode
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../editor.store';
import type { VideoClip, AudioClip, Track, EditorProject, CompoundClip } from '../editor.store';

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

function makeAudioClip(overrides: Partial<AudioClip> = {}): AudioClip {
  return {
    id: 'clip-a1',
    trackId: 'track-a1',
    startTime: 0,
    endTime: 10,
    sourceStartTime: 0,
    sourceEndTime: 10,
    name: 'Test Audio',
    type: 'audio',
    assetId: 'asset-2',
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    effects: [],
    keyframes: [],
    ...overrides,
  };
}

function makeTrack(type: 'video' | 'audio', clips: (VideoClip | AudioClip)[], id?: string): Track {
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
    // Multicam
    multicamEnabled: false,
    multicamSources: [],
    multicamActiveAngle: 0,
    multicamCuts: [],
    // Proxy
    proxyMode: false,
    proxyStatus: new Map(),
    proxyPaths: new Map(),
  });
});

// ─── Compound Clips ─────────────────────────────────────────────────────────

describe('Compound Clips', () => {
  const clipA = makeVideoClip({ id: 'clip-a', trackId: 'track-video-1', startTime: 0, endTime: 5 });
  const clipB = makeVideoClip({ id: 'clip-b', trackId: 'track-video-1', startTime: 5, endTime: 10 });
  const clipC = makeVideoClip({ id: 'clip-c', trackId: 'track-video-1', startTime: 10, endTime: 15 });

  function setupThreeClips() {
    const track = makeTrack('video', [clipA, clipB, clipC]);
    const project = makeProject([track]);
    useEditorStore.setState({ tracks: [track], project });
  }

  describe('createCompoundClip', () => {
    it('groups selected clips into a compound clip', () => {
      setupThreeClips();
      useEditorStore.getState().selectClipsInRange(['clip-a', 'clip-b']);

      useEditorStore.getState().createCompoundClip();

      const tracks = useEditorStore.getState().tracks;
      const allClips = tracks[0].clips;

      // Should have 2 clips: compound + unselected clip-c
      expect(allClips).toHaveLength(2);

      const compound = allClips.find((c) => c.type === 'compound') as CompoundClip;
      expect(compound).toBeDefined();
      expect(compound.startTime).toBe(0);
      expect(compound.endTime).toBe(10);
      expect(compound.name).toContain('2 clips');
      expect(compound.innerClips).toHaveLength(2);

      // Inner clips should have times relative to compound start (0)
      const innerA = compound.innerClips.find((c) => c.id === 'clip-a');
      expect(innerA?.startTime).toBe(0);
      expect(innerA?.endTime).toBe(5);
    });

    it('does not create compound with less than 2 selected clips', () => {
      setupThreeClips();
      useEditorStore.getState().selectClipsInRange(['clip-a']);

      useEditorStore.getState().createCompoundClip();

      // Nothing should change
      const clips = useEditorStore.getState().tracks[0].clips;
      expect(clips).toHaveLength(3);
      expect(clips.every((c) => c.type === 'video')).toBe(true);
    });

    it('sets selection to the new compound clip', () => {
      setupThreeClips();
      useEditorStore.getState().selectClipsInRange(['clip-a', 'clip-b', 'clip-c']);

      useEditorStore.getState().createCompoundClip();

      const selection = useEditorStore.getState().selection;
      expect(selection.clipIds).toHaveLength(1);

      const compound = useEditorStore.getState().tracks[0].clips.find((c) => c.type === 'compound');
      expect(selection.clipIds[0]).toBe(compound?.id);
    });

    it('creates inner tracks preserving track structure', () => {
      setupThreeClips();
      useEditorStore.getState().selectClipsInRange(['clip-a', 'clip-b']);

      useEditorStore.getState().createCompoundClip();

      const compound = useEditorStore.getState().tracks[0].clips.find((c) => c.type === 'compound') as CompoundClip;
      expect(compound.innerTracks).toHaveLength(1);
      expect(compound.innerTracks[0].clips).toHaveLength(2);
    });

    it('handles clips from multiple tracks', () => {
      const audioClip = makeAudioClip({ id: 'clip-audio', trackId: 'track-a1', startTime: 2, endTime: 8 });
      const videoTrack = makeTrack('video', [clipA, clipB]);
      const audioTrack = makeTrack('audio', [audioClip], 'track-a1');
      const project = makeProject([videoTrack, audioTrack]);
      useEditorStore.setState({ tracks: [videoTrack, audioTrack], project });

      useEditorStore.getState().selectClipsInRange(['clip-a', 'clip-audio']);
      useEditorStore.getState().createCompoundClip();

      const tracks = useEditorStore.getState().tracks;
      const compound = tracks[0].clips.find((c) => c.type === 'compound') as CompoundClip;

      expect(compound).toBeDefined();
      expect(compound.innerClips).toHaveLength(2);
      expect(compound.innerTracks).toHaveLength(2);
      expect(compound.startTime).toBe(0);
      expect(compound.endTime).toBe(8);
    });
  });

  describe('expandCompoundClip', () => {
    it('expands compound clip back into individual clips', () => {
      setupThreeClips();
      useEditorStore.getState().selectClipsInRange(['clip-a', 'clip-b']);
      useEditorStore.getState().createCompoundClip();

      const compound = useEditorStore.getState().tracks[0].clips.find((c) => c.type === 'compound')!;

      useEditorStore.getState().expandCompoundClip(compound.id);

      const tracks = useEditorStore.getState().tracks;
      const clips = tracks[0].clips;

      // Should have 3 clips again (clip-a, clip-b restored + clip-c never left)
      expect(clips).toHaveLength(3);
      expect(clips.every((c) => c.type === 'video')).toBe(true);
    });

    it('restores original time positions', () => {
      setupThreeClips();
      useEditorStore.getState().selectClipsInRange(['clip-a', 'clip-b']);
      useEditorStore.getState().createCompoundClip();

      const compound = useEditorStore.getState().tracks[0].clips.find((c) => c.type === 'compound')!;
      useEditorStore.getState().expandCompoundClip(compound.id);

      const clips = useEditorStore.getState().tracks[0].clips;
      const restoredA = clips.find((c) => c.id === 'clip-a');
      const restoredB = clips.find((c) => c.id === 'clip-b');

      expect(restoredA?.startTime).toBe(0);
      expect(restoredA?.endTime).toBe(5);
      expect(restoredB?.startTime).toBe(5);
      expect(restoredB?.endTime).toBe(10);
    });

    it('is a no-op for non-compound clips', () => {
      setupThreeClips();

      useEditorStore.getState().expandCompoundClip('clip-a');

      const clips = useEditorStore.getState().tracks[0].clips;
      expect(clips).toHaveLength(3);
    });

    it('is a no-op for non-existent clip IDs', () => {
      setupThreeClips();

      useEditorStore.getState().expandCompoundClip('nonexistent');

      const clips = useEditorStore.getState().tracks[0].clips;
      expect(clips).toHaveLength(3);
    });

    it('selects all restored clips after expand', () => {
      setupThreeClips();
      useEditorStore.getState().selectClipsInRange(['clip-a', 'clip-b']);
      useEditorStore.getState().createCompoundClip();

      const compound = useEditorStore.getState().tracks[0].clips.find((c) => c.type === 'compound')!;
      useEditorStore.getState().expandCompoundClip(compound.id);

      const selection = useEditorStore.getState().selection;
      expect(selection.clipIds).toContain('clip-a');
      expect(selection.clipIds).toContain('clip-b');
    });
  });
});

// ─── Multicam Editing ───────────────────────────────────────────────────────

describe('Multicam Editing', () => {
  describe('toggleMulticam', () => {
    it('toggles multicamEnabled state', () => {
      expect(useEditorStore.getState().multicamEnabled).toBe(false);

      useEditorStore.getState().toggleMulticam();
      expect(useEditorStore.getState().multicamEnabled).toBe(true);

      useEditorStore.getState().toggleMulticam();
      expect(useEditorStore.getState().multicamEnabled).toBe(false);
    });
  });

  describe('addMulticamSource', () => {
    it('adds a source with generated ID', () => {
      const source = useEditorStore.getState().addMulticamSource({
        assetId: 'asset-cam1',
        name: 'Camera 1',
        syncOffset: 0,
        duration: 30,
      });

      expect(source.id).toBeTruthy();
      expect(source.id).toMatch(/^mc-/);
      expect(source.assetId).toBe('asset-cam1');
      expect(source.name).toBe('Camera 1');

      const sources = useEditorStore.getState().multicamSources;
      expect(sources).toHaveLength(1);
      expect(sources[0].id).toBe(source.id);
    });

    it('adds multiple sources', () => {
      useEditorStore.getState().addMulticamSource({
        assetId: 'asset-cam1',
        name: 'Camera 1',
        syncOffset: 0,
        duration: 30,
      });
      useEditorStore.getState().addMulticamSource({
        assetId: 'asset-cam2',
        name: 'Camera 2',
        syncOffset: -0.5,
        duration: 30,
      });

      expect(useEditorStore.getState().multicamSources).toHaveLength(2);
    });

    it('preserves syncOffset and thumbnailUrl', () => {
      const source = useEditorStore.getState().addMulticamSource({
        assetId: 'asset-cam1',
        name: 'Camera 1',
        syncOffset: -1.5,
        duration: 30,
        thumbnailUrl: 'http://example.com/thumb.jpg',
      });

      expect(source.syncOffset).toBe(-1.5);
      expect(source.thumbnailUrl).toBe('http://example.com/thumb.jpg');
    });
  });

  describe('removeMulticamSource', () => {
    it('removes a source by ID', () => {
      const source = useEditorStore.getState().addMulticamSource({
        assetId: 'asset-cam1',
        name: 'Camera 1',
        syncOffset: 0,
        duration: 30,
      });

      useEditorStore.getState().removeMulticamSource(source.id);

      expect(useEditorStore.getState().multicamSources).toHaveLength(0);
    });

    it('is a no-op for non-existent source ID', () => {
      useEditorStore.getState().addMulticamSource({
        assetId: 'asset-cam1',
        name: 'Camera 1',
        syncOffset: 0,
        duration: 30,
      });

      useEditorStore.getState().removeMulticamSource('nonexistent');

      expect(useEditorStore.getState().multicamSources).toHaveLength(1);
    });
  });

  describe('setMulticamActiveAngle', () => {
    it('sets the active angle index', () => {
      useEditorStore.getState().setMulticamActiveAngle(2);
      expect(useEditorStore.getState().multicamActiveAngle).toBe(2);
    });
  });

  describe('addMulticamCut', () => {
    it('adds a cut at the specified time and angle', () => {
      useEditorStore.getState().addMulticamCut(5.0, 1);

      const cuts = useEditorStore.getState().multicamCuts;
      expect(cuts).toHaveLength(1);
      expect(cuts[0]).toEqual({ time: 5.0, angleIndex: 1 });
    });

    it('sorts cuts by time', () => {
      useEditorStore.getState().addMulticamCut(10.0, 2);
      useEditorStore.getState().addMulticamCut(3.0, 0);
      useEditorStore.getState().addMulticamCut(7.0, 1);

      const cuts = useEditorStore.getState().multicamCuts;
      expect(cuts).toHaveLength(3);
      expect(cuts[0].time).toBe(3.0);
      expect(cuts[1].time).toBe(7.0);
      expect(cuts[2].time).toBe(10.0);
    });

    it('replaces cuts at the same time (within 0.01s tolerance)', () => {
      useEditorStore.getState().addMulticamCut(5.0, 0);
      useEditorStore.getState().addMulticamCut(5.005, 1); // within 0.01s

      const cuts = useEditorStore.getState().multicamCuts;
      expect(cuts).toHaveLength(1);
      expect(cuts[0].angleIndex).toBe(1);
    });
  });

  describe('removeMulticamCut', () => {
    it('removes a cut at the specified time', () => {
      useEditorStore.getState().addMulticamCut(5.0, 0);
      useEditorStore.getState().addMulticamCut(10.0, 1);

      useEditorStore.getState().removeMulticamCut(5.0);

      const cuts = useEditorStore.getState().multicamCuts;
      expect(cuts).toHaveLength(1);
      expect(cuts[0].time).toBe(10.0);
    });

    it('removes within 0.01s tolerance', () => {
      useEditorStore.getState().addMulticamCut(5.0, 0);

      useEditorStore.getState().removeMulticamCut(5.005);

      expect(useEditorStore.getState().multicamCuts).toHaveLength(0);
    });
  });

  describe('clearMulticamCuts', () => {
    it('removes all cuts', () => {
      useEditorStore.getState().addMulticamCut(1.0, 0);
      useEditorStore.getState().addMulticamCut(5.0, 1);
      useEditorStore.getState().addMulticamCut(10.0, 2);

      useEditorStore.getState().clearMulticamCuts();

      expect(useEditorStore.getState().multicamCuts).toHaveLength(0);
    });
  });

  describe('flattenMulticamToTimeline', () => {
    function setupMulticam() {
      const videoTrack = makeTrack('video', [
        makeVideoClip({ id: 'existing', startTime: 0, endTime: 20 }),
      ]);
      const project = makeProject([videoTrack]);
      useEditorStore.setState({ tracks: [videoTrack], project, duration: 30 });

      useEditorStore.getState().addMulticamSource({
        assetId: 'asset-cam1',
        name: 'Camera 1',
        syncOffset: 0,
        duration: 30,
      });
      useEditorStore.getState().addMulticamSource({
        assetId: 'asset-cam2',
        name: 'Camera 2',
        syncOffset: -0.5,
        duration: 30,
      });
    }

    it('creates clips from cuts, replacing video track contents', () => {
      setupMulticam();

      useEditorStore.getState().addMulticamCut(0, 0);   // Camera 1 from 0s
      useEditorStore.getState().addMulticamCut(10, 1);  // Camera 2 from 10s
      useEditorStore.getState().addMulticamCut(20, 0);  // Camera 1 from 20s

      useEditorStore.getState().flattenMulticamToTimeline();

      const clips = useEditorStore.getState().tracks[0].clips;
      expect(clips).toHaveLength(3);

      // First clip: Camera 1, 0-10s
      expect(clips[0].startTime).toBe(0);
      expect(clips[0].endTime).toBe(10);
      expect((clips[0] as VideoClip).assetId).toBe('asset-cam1');

      // Second clip: Camera 2, 10-20s
      expect(clips[1].startTime).toBe(10);
      expect(clips[1].endTime).toBe(20);
      expect((clips[1] as VideoClip).assetId).toBe('asset-cam2');

      // Third clip: Camera 1, 20-30s (duration)
      expect(clips[2].startTime).toBe(20);
      expect(clips[2].endTime).toBe(30);
      expect((clips[2] as VideoClip).assetId).toBe('asset-cam1');
    });

    it('applies syncOffset to source start/end times', () => {
      setupMulticam();

      useEditorStore.getState().addMulticamCut(5, 1); // Camera 2 (syncOffset = -0.5)

      useEditorStore.getState().flattenMulticamToTimeline();

      const clip = useEditorStore.getState().tracks[0].clips[0] as VideoClip;
      expect(clip.sourceStartTime).toBe(5 + (-0.5)); // 4.5
      expect(clip.sourceEndTime).toBe(30 + (-0.5));  // 29.5
    });

    it('uses first source for entire duration when no cuts exist', () => {
      setupMulticam();
      // No cuts added

      useEditorStore.getState().flattenMulticamToTimeline();

      const clips = useEditorStore.getState().tracks[0].clips;
      expect(clips).toHaveLength(1);
      expect(clips[0].startTime).toBe(0);
      expect(clips[0].endTime).toBe(30);
      expect((clips[0] as VideoClip).assetId).toBe('asset-cam1');
    });

    it('disables multicam mode after flattening', () => {
      setupMulticam();
      useEditorStore.getState().toggleMulticam(); // enable
      expect(useEditorStore.getState().multicamEnabled).toBe(true);

      useEditorStore.getState().addMulticamCut(0, 0);
      useEditorStore.getState().flattenMulticamToTimeline();

      expect(useEditorStore.getState().multicamEnabled).toBe(false);
    });

    it('is a no-op when no multicam sources exist', () => {
      const videoTrack = makeTrack('video', [
        makeVideoClip({ id: 'existing', startTime: 0, endTime: 20 }),
      ]);
      useEditorStore.setState({ tracks: [videoTrack], duration: 30 });

      useEditorStore.getState().flattenMulticamToTimeline();

      // Original clip should remain
      const clips = useEditorStore.getState().tracks[0].clips;
      expect(clips).toHaveLength(1);
      expect(clips[0].id).toBe('existing');
    });

    it('is a no-op when no video track exists', () => {
      const audioTrack = makeTrack('audio', [makeAudioClip()], 'track-a1');
      useEditorStore.setState({ tracks: [audioTrack], duration: 30 });

      useEditorStore.getState().addMulticamSource({
        assetId: 'asset-cam1',
        name: 'Camera 1',
        syncOffset: 0,
        duration: 30,
      });

      useEditorStore.getState().flattenMulticamToTimeline();

      // Audio track should be untouched
      expect(useEditorStore.getState().tracks[0].clips).toHaveLength(1);
    });

    it('skips cuts with invalid angle index', () => {
      setupMulticam(); // only 2 sources (index 0 and 1)

      useEditorStore.getState().addMulticamCut(0, 0);
      useEditorStore.getState().addMulticamCut(10, 5); // invalid index
      useEditorStore.getState().addMulticamCut(20, 1);

      useEditorStore.getState().flattenMulticamToTimeline();

      const clips = useEditorStore.getState().tracks[0].clips;
      // The cut at index 5 should be skipped (no source), so we get 2 clips
      expect(clips).toHaveLength(2);
    });
  });
});

// ─── Nested Sequence (Enter/Exit Compound Clip) ────────────────────────────

describe('Nested Sequence Editing', () => {
  const clipA = makeVideoClip({ id: 'clip-a', trackId: 'track-video-1', startTime: 0, endTime: 5 });
  const clipB = makeVideoClip({ id: 'clip-b', trackId: 'track-video-1', startTime: 5, endTime: 10 });
  const clipC = makeVideoClip({ id: 'clip-c', trackId: 'track-video-1', startTime: 10, endTime: 15 });

  function setupCompound() {
    const track = makeTrack('video', [clipA, clipB, clipC]);
    const project = makeProject([track]);
    useEditorStore.setState({ tracks: [track], project, compoundEditStack: [] });
    // Select A+B and create compound
    useEditorStore.getState().selectClipsInRange(['clip-a', 'clip-b']);
    useEditorStore.getState().createCompoundClip();
    return useEditorStore.getState().tracks[0].clips.find((c) => c.type === 'compound')!;
  }

  describe('enterCompoundClip', () => {
    it('replaces timeline tracks with inner tracks', () => {
      const compound = setupCompound();

      useEditorStore.getState().enterCompoundClip(compound.id);

      const tracks = useEditorStore.getState().tracks;
      // Should show inner tracks (1 video track with 2 clips)
      expect(tracks).toHaveLength(1);
      expect(tracks[0].clips).toHaveLength(2);
      expect(tracks[0].clips[0].id).toBe('clip-a');
      expect(tracks[0].clips[1].id).toBe('clip-b');
    });

    it('pushes to compoundEditStack', () => {
      const compound = setupCompound();

      useEditorStore.getState().enterCompoundClip(compound.id);

      const stack = useEditorStore.getState().compoundEditStack;
      expect(stack).toHaveLength(1);
      expect(stack[0].clipId).toBe(compound.id);
      expect(stack[0].parentTracks).toHaveLength(1); // original video track
    });

    it('clears selection on enter', () => {
      const compound = setupCompound();
      useEditorStore.getState().selectClip(compound.id);

      useEditorStore.getState().enterCompoundClip(compound.id);

      expect(useEditorStore.getState().selection.clipIds).toEqual([]);
      expect(useEditorStore.getState().selectedClip).toBeNull();
    });

    it('is a no-op for non-compound clips', () => {
      setupCompound();

      useEditorStore.getState().enterCompoundClip('clip-c');

      expect(useEditorStore.getState().compoundEditStack).toHaveLength(0);
    });

    it('is a no-op for non-existent clip IDs', () => {
      setupCompound();

      useEditorStore.getState().enterCompoundClip('nonexistent');

      expect(useEditorStore.getState().compoundEditStack).toHaveLength(0);
    });
  });

  describe('exitCompoundClip', () => {
    it('restores parent tracks', () => {
      const compound = setupCompound();
      useEditorStore.getState().enterCompoundClip(compound.id);

      useEditorStore.getState().exitCompoundClip();

      const tracks = useEditorStore.getState().tracks;
      expect(tracks).toHaveLength(1);
      // Should have compound clip + clip-c
      expect(tracks[0].clips).toHaveLength(2);
      expect(tracks[0].clips.some((c) => c.type === 'compound')).toBe(true);
      expect(tracks[0].clips.some((c) => c.id === 'clip-c')).toBe(true);
    });

    it('empties compoundEditStack', () => {
      const compound = setupCompound();
      useEditorStore.getState().enterCompoundClip(compound.id);

      useEditorStore.getState().exitCompoundClip();

      expect(useEditorStore.getState().compoundEditStack).toHaveLength(0);
    });

    it('is a no-op when not inside a compound', () => {
      setupCompound();

      useEditorStore.getState().exitCompoundClip();

      // Nothing should change
      expect(useEditorStore.getState().compoundEditStack).toHaveLength(0);
    });

    it('preserves edits made inside the compound', () => {
      const compound = setupCompound();
      useEditorStore.getState().enterCompoundClip(compound.id);

      // Modify an inner clip's timing
      const innerClips = useEditorStore.getState().tracks[0].clips;
      const modifiedClip = { ...innerClips[0], endTime: 3 }; // shorten clip-a
      useEditorStore.setState({
        tracks: useEditorStore.getState().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === 'clip-a' ? modifiedClip : c)),
        })),
      });

      useEditorStore.getState().exitCompoundClip();

      // The compound clip should have updated inner clips
      const restoredCompound = useEditorStore.getState().tracks[0].clips.find(
        (c) => c.type === 'compound'
      ) as CompoundClip;
      expect(restoredCompound).toBeDefined();
      const innerA = restoredCompound.innerClips.find((c) => c.id === 'clip-a');
      expect(innerA?.endTime).toBe(3);
    });
  });
});

// ─── Proxy Workflow ─────────────────────────────────────────────────────────

describe('Proxy Workflow', () => {
  describe('toggleProxyMode', () => {
    it('toggles proxy mode on and off', () => {
      expect(useEditorStore.getState().proxyMode).toBe(false);

      useEditorStore.getState().toggleProxyMode();
      expect(useEditorStore.getState().proxyMode).toBe(true);

      useEditorStore.getState().toggleProxyMode();
      expect(useEditorStore.getState().proxyMode).toBe(false);
    });
  });

  describe('proxyStatus and proxyPath', () => {
    it('sets and tracks proxy status per asset', () => {
      useEditorStore.getState().setProxyStatus('asset-1', 'generating');
      expect(useEditorStore.getState().proxyStatus.get('asset-1')).toBe('generating');

      useEditorStore.getState().setProxyStatus('asset-1', 'ready');
      expect(useEditorStore.getState().proxyStatus.get('asset-1')).toBe('ready');
    });

    it('sets proxy file path', () => {
      useEditorStore.getState().setProxyPath('asset-1', '/tmp/proxy_asset-1.mp4');
      expect(useEditorStore.getState().proxyPaths.get('asset-1')).toBe('/tmp/proxy_asset-1.mp4');
    });
  });
});
