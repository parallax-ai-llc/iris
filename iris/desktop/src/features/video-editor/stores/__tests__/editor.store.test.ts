/**
 * Editor Store Unit Tests — Phase 1 Features
 *
 * Covers:
 *  - addClipKeyframe / updateClipKeyframe / removeClipKeyframe
 *  - addClipEffect / removeClipEffect / updateClipEffect / toggleClipEffect
 *  - AudioClip fadeIn / fadeOut via updateClip
 *  - updateClipKeyframe sorts by time + respects out-of-bounds index
 *  - selectedClip is kept in sync with track mutations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../editor.store';
import type { VideoClip, AudioClip, Track } from '../editor.store';
import type { Keyframe, ClipEffect } from '@/types/videoProject.types';

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

function makeTrack(type: 'video' | 'audio', clips: (VideoClip | AudioClip)[]): Track {
  return {
    id: `track-${type}-1`,
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

function makeEffect(id = 'eff-1'): ClipEffect {
  return {
    id,
    type: 'filter',
    name: 'Brightness',
    enabled: true,
    filterType: 'brightness',
    filterParams: { value: 20 },
    keyframes: [],
  };
}

function makeKeyframe(time: number, property: Keyframe['property'] = 'opacity', value = 1): Keyframe {
  return { time, property, value, easing: 'linear' };
}

// ─── reset store before each test ───────────────────────────────────────────

beforeEach(() => {
  useEditorStore.setState({
    tracks: [],
    selectedClip: null,
    history: [],
    historyIndex: -1,
    project: null,
  });
});

// ─── Keyframe actions ────────────────────────────────────────────────────────

describe('Keyframe Actions', () => {
  describe('addClipKeyframe', () => {
    it('appends a keyframe to a VideoClip', () => {
      const clip = makeVideoClip();
      const track = makeTrack('video', [clip]);
      useEditorStore.setState({ tracks: [track] });

      const kf = makeKeyframe(2, 'opacity', 0.5);
      useEditorStore.getState().addClipKeyframe(clip.id, kf);

      const stored = useEditorStore.getState().tracks[0].clips[0] as VideoClip;
      expect(stored.keyframes).toHaveLength(1);
      expect(stored.keyframes[0]).toMatchObject(kf);
    });

    it('appends a keyframe to an AudioClip', () => {
      const clip = makeAudioClip();
      const track = makeTrack('audio', [clip]);
      useEditorStore.setState({ tracks: [track] });

      const kf = makeKeyframe(1, 'volume', 0.8);
      useEditorStore.getState().addClipKeyframe(clip.id, kf);

      const stored = useEditorStore.getState().tracks[0].clips[0] as AudioClip;
      expect(stored.keyframes).toHaveLength(1);
      expect(stored.keyframes[0].value).toBe(0.8);
    });

    it('accumulates multiple keyframes', () => {
      const clip = makeVideoClip();
      useEditorStore.setState({ tracks: [makeTrack('video', [clip])] });

      useEditorStore.getState().addClipKeyframe(clip.id, makeKeyframe(1, 'scale', 1.2));
      useEditorStore.getState().addClipKeyframe(clip.id, makeKeyframe(3, 'scale', 1.5));

      const stored = useEditorStore.getState().tracks[0].clips[0] as VideoClip;
      expect(stored.keyframes).toHaveLength(2);
    });

    it('also updates selectedClip when it is the same clip', () => {
      const clip = makeVideoClip();
      useEditorStore.setState({ tracks: [makeTrack('video', [clip])], selectedClip: clip });

      useEditorStore.getState().addClipKeyframe(clip.id, makeKeyframe(1));

      const sel = useEditorStore.getState().selectedClip as VideoClip;
      expect(sel?.keyframes).toHaveLength(1);
    });

    it('does not modify clips without a keyframes field (SubtitleClip)', () => {
      const subtitleClip = {
        id: 'clip-sub',
        trackId: 'track-s',
        startTime: 0,
        endTime: 5,
        sourceStartTime: 0,
        sourceEndTime: 5,
        name: 'Sub',
        type: 'subtitle' as const,
        text: 'Hello',
        cueId: undefined,
        style: {
          fontSize: 16, fontFamily: 'Arial', fontColor: '#fff',
          backgroundColor: '#000', backgroundOpacity: 70,
          position: { x: 50, y: 90 },
          alignment: 'center' as const,
          verticalAlign: 'bottom' as const,
          animation: 'none' as const,
          animationColor: '#FFD700',
        },
      };
      const track: Track = {
        id: 'track-s', type: 'subtitle', name: 'Sub', locked: false,
        muted: false, solo: false, visible: true, volume: 1, height: 40, clips: [subtitleClip],
      };
      useEditorStore.setState({ tracks: [track] });

      // Should not throw and subtitle clip is unchanged
      expect(() => {
        useEditorStore.getState().addClipKeyframe('clip-sub', makeKeyframe(1));
      }).not.toThrow();

      const stored = useEditorStore.getState().tracks[0].clips[0];
      expect('keyframes' in stored).toBe(false);
    });
  });

  describe('updateClipKeyframe', () => {
    it('updates value of an existing keyframe by index', () => {
      const clip = makeVideoClip({ keyframes: [makeKeyframe(1, 'opacity', 0.5)] });
      useEditorStore.setState({ tracks: [makeTrack('video', [clip])] });

      useEditorStore.getState().updateClipKeyframe(clip.id, 0, { value: 0.9 });

      const stored = useEditorStore.getState().tracks[0].clips[0] as VideoClip;
      expect(stored.keyframes[0].value).toBe(0.9);
    });

    it('updates easing of an existing keyframe', () => {
      const clip = makeVideoClip({ keyframes: [makeKeyframe(2, 'scale', 1)] });
      useEditorStore.setState({ tracks: [makeTrack('video', [clip])] });

      useEditorStore.getState().updateClipKeyframe(clip.id, 0, { easing: 'ease-in-out' });

      const stored = useEditorStore.getState().tracks[0].clips[0] as VideoClip;
      expect(stored.keyframes[0].easing).toBe('ease-in-out');
    });

    it('re-sorts keyframes by time after updating time', () => {
      const clip = makeVideoClip({
        keyframes: [
          makeKeyframe(1, 'opacity', 0),
          makeKeyframe(3, 'opacity', 1),
        ],
      });
      useEditorStore.setState({ tracks: [makeTrack('video', [clip])] });

      // Move the first keyframe (t=1) to t=5 — it should end up after t=3
      useEditorStore.getState().updateClipKeyframe(clip.id, 0, { time: 5 });

      const stored = useEditorStore.getState().tracks[0].clips[0] as VideoClip;
      expect(stored.keyframes[0].time).toBe(3);
      expect(stored.keyframes[1].time).toBe(5);
    });

    it('ignores out-of-bounds index gracefully', () => {
      const clip = makeVideoClip({ keyframes: [makeKeyframe(1)] });
      useEditorStore.setState({ tracks: [makeTrack('video', [clip])] });

      expect(() => {
        useEditorStore.getState().updateClipKeyframe(clip.id, 99, { value: 0.5 });
      }).not.toThrow();

      const stored = useEditorStore.getState().tracks[0].clips[0] as VideoClip;
      expect(stored.keyframes).toHaveLength(1); // unchanged
    });

    it('also updates selectedClip when it is the same clip', () => {
      const clip = makeVideoClip({ keyframes: [makeKeyframe(1, 'scale', 1)] });
      useEditorStore.setState({ tracks: [makeTrack('video', [clip])], selectedClip: clip });

      useEditorStore.getState().updateClipKeyframe(clip.id, 0, { value: 2 });

      const sel = useEditorStore.getState().selectedClip as VideoClip;
      expect(sel?.keyframes[0].value).toBe(2);
    });
  });

  describe('removeClipKeyframe', () => {
    it('removes a keyframe by index', () => {
      const clip = makeVideoClip({
        keyframes: [makeKeyframe(1), makeKeyframe(3), makeKeyframe(5)],
      });
      useEditorStore.setState({ tracks: [makeTrack('video', [clip])] });

      useEditorStore.getState().removeClipKeyframe(clip.id, 1); // remove t=3

      const stored = useEditorStore.getState().tracks[0].clips[0] as VideoClip;
      expect(stored.keyframes).toHaveLength(2);
      expect(stored.keyframes.map((k) => k.time)).toEqual([1, 5]);
    });

    it('removes the only keyframe leaving empty array', () => {
      const clip = makeVideoClip({ keyframes: [makeKeyframe(2)] });
      useEditorStore.setState({ tracks: [makeTrack('video', [clip])] });

      useEditorStore.getState().removeClipKeyframe(clip.id, 0);

      const stored = useEditorStore.getState().tracks[0].clips[0] as VideoClip;
      expect(stored.keyframes).toHaveLength(0);
    });

    it('is a no-op for an out-of-bounds index', () => {
      const clip = makeVideoClip({ keyframes: [makeKeyframe(1)] });
      useEditorStore.setState({ tracks: [makeTrack('video', [clip])] });

      expect(() => {
        useEditorStore.getState().removeClipKeyframe(clip.id, 99);
      }).not.toThrow();

      const stored = useEditorStore.getState().tracks[0].clips[0] as VideoClip;
      expect(stored.keyframes).toHaveLength(1);
    });

    it('also updates selectedClip when it is the same clip', () => {
      const kf0 = makeKeyframe(1);
      const kf1 = makeKeyframe(2);
      const clip = makeVideoClip({ keyframes: [kf0, kf1] });
      useEditorStore.setState({ tracks: [makeTrack('video', [clip])], selectedClip: clip });

      useEditorStore.getState().removeClipKeyframe(clip.id, 0);

      const sel = useEditorStore.getState().selectedClip as VideoClip;
      expect(sel?.keyframes).toHaveLength(1);
    });
  });
});

// ─── Effect actions ──────────────────────────────────────────────────────────

describe('Effect Actions', () => {
  describe('addClipEffect', () => {
    it('adds an effect to a VideoClip', () => {
      const clip = makeVideoClip();
      useEditorStore.setState({ tracks: [makeTrack('video', [clip])] });

      const eff = makeEffect();
      useEditorStore.getState().addClipEffect(clip.id, eff);

      const stored = useEditorStore.getState().tracks[0].clips[0] as VideoClip;
      expect(stored.effects).toHaveLength(1);
      expect(stored.effects[0].id).toBe('eff-1');
    });

    it('accumulates multiple effects', () => {
      const clip = makeVideoClip();
      useEditorStore.setState({ tracks: [makeTrack('video', [clip])] });

      useEditorStore.getState().addClipEffect(clip.id, makeEffect('eff-1'));
      useEditorStore.getState().addClipEffect(clip.id, makeEffect('eff-2'));

      const stored = useEditorStore.getState().tracks[0].clips[0] as VideoClip;
      expect(stored.effects).toHaveLength(2);
    });

    it('also updates selectedClip', () => {
      const clip = makeVideoClip();
      useEditorStore.setState({ tracks: [makeTrack('video', [clip])], selectedClip: clip });

      useEditorStore.getState().addClipEffect(clip.id, makeEffect());

      const sel = useEditorStore.getState().selectedClip as VideoClip;
      expect(sel?.effects).toHaveLength(1);
    });
  });

  describe('removeClipEffect', () => {
    it('removes an effect by id', () => {
      const clip = makeVideoClip({ effects: [makeEffect('eff-1'), makeEffect('eff-2')] });
      useEditorStore.setState({ tracks: [makeTrack('video', [clip])] });

      useEditorStore.getState().removeClipEffect(clip.id, 'eff-1');

      const stored = useEditorStore.getState().tracks[0].clips[0] as VideoClip;
      expect(stored.effects).toHaveLength(1);
      expect(stored.effects[0].id).toBe('eff-2');
    });

    it('is a no-op for an unknown effect id', () => {
      const clip = makeVideoClip({ effects: [makeEffect('eff-1')] });
      useEditorStore.setState({ tracks: [makeTrack('video', [clip])] });

      expect(() => {
        useEditorStore.getState().removeClipEffect(clip.id, 'nonexistent');
      }).not.toThrow();

      const stored = useEditorStore.getState().tracks[0].clips[0] as VideoClip;
      expect(stored.effects).toHaveLength(1);
    });
  });

  describe('updateClipEffect', () => {
    it('updates effect params by id', () => {
      const eff = makeEffect();
      const clip = makeVideoClip({ effects: [eff] });
      useEditorStore.setState({ tracks: [makeTrack('video', [clip])] });

      useEditorStore.getState().updateClipEffect(clip.id, 'eff-1', {
        filterParams: { value: 80 },
      } as Partial<ClipEffect>);

      const stored = useEditorStore.getState().tracks[0].clips[0] as VideoClip;
      expect((stored.effects[0] as ClipEffect).filterParams?.value).toBe(80);
    });

    it('does not mutate other effects', () => {
      const clip = makeVideoClip({ effects: [makeEffect('eff-1'), makeEffect('eff-2')] });
      useEditorStore.setState({ tracks: [makeTrack('video', [clip])] });

      useEditorStore.getState().updateClipEffect(clip.id, 'eff-1', { name: 'Updated' });

      const stored = useEditorStore.getState().tracks[0].clips[0] as VideoClip;
      expect(stored.effects[0].name).toBe('Updated');
      expect(stored.effects[1].name).toBe('Brightness'); // unchanged
    });
  });

  describe('toggleClipEffect', () => {
    it('toggles enabled from true to false', () => {
      const eff = { ...makeEffect(), enabled: true };
      const clip = makeVideoClip({ effects: [eff] });
      useEditorStore.setState({ tracks: [makeTrack('video', [clip])] });

      useEditorStore.getState().toggleClipEffect(clip.id, 'eff-1');

      const stored = useEditorStore.getState().tracks[0].clips[0] as VideoClip;
      expect(stored.effects[0].enabled).toBe(false);
    });

    it('toggles enabled from false to true', () => {
      const eff = { ...makeEffect(), enabled: false };
      const clip = makeVideoClip({ effects: [eff] });
      useEditorStore.setState({ tracks: [makeTrack('video', [clip])] });

      useEditorStore.getState().toggleClipEffect(clip.id, 'eff-1');

      const stored = useEditorStore.getState().tracks[0].clips[0] as VideoClip;
      expect(stored.effects[0].enabled).toBe(true);
    });
  });
});

// ─── AudioClip fade fields ────────────────────────────────────────────────────

describe('AudioClip Fade via updateClip', () => {
  it('sets fadeIn on an AudioClip', () => {
    const clip = makeAudioClip();
    useEditorStore.setState({ tracks: [makeTrack('audio', [clip])] });

    useEditorStore.getState().updateClip(clip.id, { fadeIn: 1.5 } as Partial<AudioClip>);

    const stored = useEditorStore.getState().tracks[0].clips[0] as AudioClip;
    expect(stored.fadeIn).toBe(1.5);
  });

  it('sets fadeOut on an AudioClip', () => {
    const clip = makeAudioClip();
    useEditorStore.setState({ tracks: [makeTrack('audio', [clip])] });

    useEditorStore.getState().updateClip(clip.id, { fadeOut: 2.0 } as Partial<AudioClip>);

    const stored = useEditorStore.getState().tracks[0].clips[0] as AudioClip;
    expect(stored.fadeOut).toBe(2.0);
  });

  it('updates both fadeIn and fadeOut simultaneously', () => {
    const clip = makeAudioClip();
    useEditorStore.setState({ tracks: [makeTrack('audio', [clip])] });

    useEditorStore.getState().updateClip(clip.id, { fadeIn: 0.5, fadeOut: 1.0 } as Partial<AudioClip>);

    const stored = useEditorStore.getState().tracks[0].clips[0] as AudioClip;
    expect(stored.fadeIn).toBe(0.5);
    expect(stored.fadeOut).toBe(1.0);
  });

  it('defaults fadeIn and fadeOut to 0 on a fresh AudioClip', () => {
    const clip = makeAudioClip();
    useEditorStore.setState({ tracks: [makeTrack('audio', [clip])] });

    const stored = useEditorStore.getState().tracks[0].clips[0] as AudioClip;
    expect(stored.fadeIn).toBe(0);
    expect(stored.fadeOut).toBe(0);
  });
});

// ─── Inspector Tab ────────────────────────────────────────────────────────────

describe('setInspectorTab', () => {
  it('switches to keyframes tab', () => {
    useEditorStore.getState().setInspectorTab('keyframes');
    expect(useEditorStore.getState().inspectorTab).toBe('keyframes');
  });

  it('switches back to properties tab', () => {
    useEditorStore.getState().setInspectorTab('keyframes');
    useEditorStore.getState().setInspectorTab('properties');
    expect(useEditorStore.getState().inspectorTab).toBe('properties');
  });

  it('switches to effects tab', () => {
    useEditorStore.getState().setInspectorTab('effects');
    expect(useEditorStore.getState().inspectorTab).toBe('effects');
  });
});

// ─── Playback: seek clamping ──────────────────────────────────────────────────

describe('seek', () => {
  beforeEach(() => {
    // seek는 클립 기준으로 duration을 재계산하므로 0~60초 클립을 깔아둔다
    const clip = makeVideoClip({ startTime: 0, endTime: 60, sourceEndTime: 60 });
    useEditorStore.setState({ tracks: [makeTrack('video', [clip])], duration: 60 });
  });

  it('seeks to a valid time', () => {
    useEditorStore.getState().seek(30);
    expect(useEditorStore.getState().currentTime).toBe(30);
  });

  it('clamps to 0 when seeking below 0', () => {
    useEditorStore.getState().seek(-5);
    expect(useEditorStore.getState().currentTime).toBe(0);
  });

  it('clamps to duration when seeking beyond duration', () => {
    useEditorStore.getState().seek(200);
    expect(useEditorStore.getState().currentTime).toBe(60);
  });
});

// ─── Detach embedded audio when a paired audio clip is removed ────────────────
// Regression: deleting a video's extracted audio clip must silence the surviving
// video (set audioExtracted) so the <video> element stops playing embedded audio.

describe('audioExtracted on paired-audio removal', () => {
  // Video + audio sharing the same source asset, NOT linked (mirrors the
  // unlink-then-delete / reloaded-project case where linkedClipId is absent).
  function makePair() {
    const videoClip = makeVideoClip({ id: 'v', assetId: 'shared-asset' });
    const audioClip = makeAudioClip({ id: 'a', assetId: 'shared-asset' });
    useEditorStore.setState({
      tracks: [makeTrack('video', [videoClip]), makeTrack('audio', [audioClip])],
    });
  }

  it('removeClip on the audio clip flags the surviving video as audioExtracted', () => {
    makePair();
    useEditorStore.getState().removeClip('a');

    const tracks = useEditorStore.getState().tracks;
    const video = tracks.flatMap((t) => t.clips).find((c) => c.id === 'v') as VideoClip;
    expect(video).toBeDefined();
    expect(video.audioExtracted).toBe(true);
  });

  it('deleteSelected on the audio clip flags the surviving video as audioExtracted', () => {
    makePair();
    useEditorStore.setState({ selection: { clipIds: ['a'], trackIds: [] } });
    useEditorStore.getState().deleteSelected();

    const tracks = useEditorStore.getState().tracks;
    const video = tracks.flatMap((t) => t.clips).find((c) => c.id === 'v') as VideoClip;
    expect(video).toBeDefined();
    expect(video.audioExtracted).toBe(true);
  });

  it('does not flag a video whose source differs from the removed audio', () => {
    const videoClip = makeVideoClip({ id: 'v', assetId: 'video-asset' });
    const audioClip = makeAudioClip({ id: 'a', assetId: 'other-asset' });
    useEditorStore.setState({
      tracks: [makeTrack('video', [videoClip]), makeTrack('audio', [audioClip])],
    });
    useEditorStore.getState().removeClip('a');

    const video = useEditorStore.getState().tracks.flatMap((t) => t.clips).find((c) => c.id === 'v') as VideoClip;
    expect(video.audioExtracted).toBeFalsy();
  });
});

// ─── Clip move drag anchors the LEFT EDGE to the cursor (drop x) ──────────────

describe('move drag left-edge anchoring', () => {
  it('places the clip left edge at the cursor time, ignoring the grab offset', () => {
    const clip = makeVideoClip({ id: 'v', startTime: 10, endTime: 20 });
    useEditorStore.setState({
      tracks: [makeTrack('video', [clip])],
      snapToGrid: false,
      selection: { clipIds: ['v'], trackIds: [] },
      currentTime: 0,
      markers: [],
    });

    // Grab the MIDDLE of the clip (t=15), then drag so the cursor is at t=30.
    useEditorStore.getState().startDrag({
      clipId: 'v',
      trackId: clip.trackId,
      operation: 'move',
      startX: 0,
      startTime: 15,
      originalClip: { ...clip },
    });
    useEditorStore.getState().updateDrag(0, 30);

    const moved = useEditorStore.getState().tracks.flatMap((t) => t.clips).find((c) => c.id === 'v') as VideoClip;
    // Left edge follows the cursor (30), NOT cursor minus grab offset (30 - 5 = 25).
    expect(moved.startTime).toBeCloseTo(30, 5);
    expect(moved.endTime).toBeCloseTo(40, 5);
  });
});

// ─── z-order (track order) ───────────────────────────────────────────────────

describe('moveClipZOrder', () => {
  function videoTrack(id: string, clips: VideoClip[]): Track {
    return { id, type: 'video', name: id, locked: false, muted: false, solo: false, visible: true, volume: 1, height: 80, clips };
  }

  it("'up' swaps the clip's track with the video track above (lower index)", () => {
    const top = makeVideoClip({ id: 'top', trackId: 't-top' });
    const bottom = makeVideoClip({ id: 'bottom', trackId: 't-bottom' });
    useEditorStore.setState({
      tracks: [videoTrack('t-top', [top]), videoTrack('t-bottom', [bottom])],
    });

    useEditorStore.getState().moveClipZOrder('bottom', 'up');

    const ids = useEditorStore.getState().tracks.map((t) => t.id);
    expect(ids).toEqual(['t-bottom', 't-top']);
  });

  it("'down' swaps the clip's track with the video track below", () => {
    const top = makeVideoClip({ id: 'top', trackId: 't-top' });
    const bottom = makeVideoClip({ id: 'bottom', trackId: 't-bottom' });
    useEditorStore.setState({
      tracks: [videoTrack('t-top', [top]), videoTrack('t-bottom', [bottom])],
    });

    useEditorStore.getState().moveClipZOrder('top', 'down');

    const ids = useEditorStore.getState().tracks.map((t) => t.id);
    expect(ids).toEqual(['t-bottom', 't-top']);
  });

  it('is a no-op at the top of the video stack', () => {
    const top = makeVideoClip({ id: 'top', trackId: 't-top' });
    const bottom = makeVideoClip({ id: 'bottom', trackId: 't-bottom' });
    useEditorStore.setState({
      tracks: [videoTrack('t-top', [top]), videoTrack('t-bottom', [bottom])],
    });

    useEditorStore.getState().moveClipZOrder('top', 'up');

    expect(useEditorStore.getState().tracks.map((t) => t.id)).toEqual(['t-top', 't-bottom']);
  });

  it('skips non-video tracks when finding the adjacent layer', () => {
    const top = makeVideoClip({ id: 'top', trackId: 't-top' });
    const bottom = makeVideoClip({ id: 'bottom', trackId: 't-bottom' });
    const audio = makeAudioClip({ id: 'a', trackId: 't-audio' });
    useEditorStore.setState({
      tracks: [
        videoTrack('t-top', [top]),
        { id: 't-audio', type: 'audio', name: 'audio', locked: false, muted: false, solo: false, visible: true, volume: 1, height: 60, clips: [audio] },
        videoTrack('t-bottom', [bottom]),
      ],
    });

    useEditorStore.getState().moveClipZOrder('bottom', 'up');

    // Bottom video swaps with the top video; the audio track stays put.
    const ids = useEditorStore.getState().tracks.map((t) => t.id);
    expect(ids).toEqual(['t-bottom', 't-audio', 't-top']);
  });
});
