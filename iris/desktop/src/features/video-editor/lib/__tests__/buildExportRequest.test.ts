/**
 * buildExportRequest — the request must carry everything the preview renders:
 * compound contents, keyframes, audio clip effects / pan / gain, track solo,
 * and the separated-audio flag. Assets are local paths, so no download/store
 * access happens.
 */

import { describe, it, expect } from 'vitest';
import { buildExportRequest } from '../buildExportRequest';
import { flattenCompoundClips, editableClipId } from '../flattenCompoundClips';
import { isTrackAudible, isEmbeddedAudioHandledExternally } from '../trackAudio';
import type {
  AudioClip, Clip, CompoundClip, SubtitleClip, Track, VideoClip,
} from '@/types/editor.types';

const A = 'C:/media/a.mp4';
const B = 'C:/media/b.mp4';
const T = 'C:/media/tone.wav';

function track(id: string, type: Track['type'], clips: Clip[], extra: Partial<Track> = {}): Track {
  return { id, type, name: id, locked: false, muted: false, solo: false, visible: true, volume: 1, height: 80, clips, ...extra };
}

function video(id: string, trackId: string, assetId: string, s: number, e: number, extra: Partial<VideoClip> = {}): VideoClip {
  return {
    id, trackId, type: 'video', name: id, assetId, startTime: s, endTime: e, sourceStartTime: 0, sourceEndTime: e - s,
    transform: { scale: 1, rotation: 0, opacity: 1, x: 0, y: 0 }, volume: 1, muted: false, speed: 1,
    blendMode: 'normal', effects: [], keyframes: [], ...extra,
  };
}

function audio(id: string, trackId: string, assetId: string, s: number, e: number, extra: Partial<AudioClip> = {}): AudioClip {
  return {
    id, trackId, type: 'audio', name: id, assetId, startTime: s, endTime: e, sourceStartTime: 0, sourceEndTime: e - s,
    volume: 1, muted: false, fadeIn: 0, fadeOut: 0, effects: [], keyframes: [], ...extra,
  };
}

const params = {
  duration: 4, width: 320, height: 240, frameRate: 30, format: 'mp4' as const, quality: 'high' as const,
  includeSubtitles: false, outputPath: '',
};

type ReqTrack = { id: string; type: string; muted: boolean; solo?: boolean; clips: Array<Record<string, unknown>> };

describe('buildExportRequest', () => {
  it('#3 passes keyframes re-based to the exported range', async () => {
    const kfs = [
      { time: 0, property: 'opacity' as const, value: 0 },
      { time: 2, property: 'opacity' as const, value: 1, easing: 'ease-in' as const },
    ];
    const req = await buildExportRequest({
      ...params,
      tracks: [track('v', 'video', [video('c', 'v', A, 0, 2, { keyframes: kfs })])],
      range: { start: 0.5, end: 2 },
    });
    const clip = (req.tracks as ReqTrack[])[0].clips[0];
    expect(clip.keyframes).toEqual([
      { time: -0.5, property: 'opacity', value: 0, easing: undefined, bezierPoints: undefined },
      { time: 1.5, property: 'opacity', value: 1, easing: 'ease-in', bezierPoints: undefined },
    ]);
  });

  it('#4 passes audio clip effects, pan, gain and volume keyframes', async () => {
    const req = await buildExportRequest({
      ...params,
      tracks: [track('a', 'audio', [audio('x', 'a', T, 0, 1, {
        pan: -0.3, gain: 4,
        effects: [{ id: 'e', name: 'EQ', type: 'audio-effect', enabled: true, audioEffectType: 'eq', audioParams: { low: 3 }, keyframes: [] }],
        keyframes: [{ time: 0, property: 'volume', value: 0.2 }],
      })])],
    });
    const clip = (req.tracks as ReqTrack[])[0].clips[0];
    expect(clip.pan).toBe(-0.3);
    expect(clip.gain).toBe(4);
    expect(clip.effects).toEqual([expect.objectContaining({ type: 'audio-effect', audioEffectType: 'eq', audioParams: { low: 3 } })]);
    expect(clip.keyframes).toEqual([expect.objectContaining({ property: 'volume', value: 0.2 })]);
  });

  it('#1/#2 sends solo and flags only the video clip whose asset sits on an audio track', async () => {
    const req = await buildExportRequest({
      ...params,
      tracks: [
        track('v', 'video', [video('c1', 'v', A, 0, 1), video('c2', 'v', B, 1, 2)], { muted: true }),
        track('a', 'audio', [audio('sep', 'a', A, 0, 1)], { solo: true, visible: false }),
      ],
    });
    const [v, a] = req.tracks as ReqTrack[];
    expect(v.muted).toBe(true); // still exported: mute is audio-only
    expect(v.clips.map((c) => c.audioHandledExternally)).toEqual([true, false]);
    expect(a.solo).toBe(true); // hidden audio tracks still play in the preview
  });

  it('#13 renders compound contents at timeline time with sources', async () => {
    const inner = video('in1', 'v', A, 1, 3, { sourceStartTime: 5, sourceEndTime: 7 });
    const innerAudio = audio('in2', 'a', T, 0, 2);
    const compound: CompoundClip = {
      id: 'cmp', trackId: 'v', type: 'compound', name: 'cmp',
      startTime: 10, endTime: 12, sourceStartTime: 0.5, sourceEndTime: 2.5,
      innerClips: [inner, innerAudio],
      innerTracks: [track('v', 'video', [inner]), track('a', 'audio', [innerAudio])],
    };
    const req = await buildExportRequest({ ...params, duration: 12, tracks: [track('v', 'video', [compound])] });
    const tracks = req.tracks as ReqTrack[];
    const host = tracks.find((t) => t.id === 'v')!;
    // inner [1,3) → timeline [10.5, 12.5) cut to the compound window [10, 12)
    expect(host.clips[0]).toEqual(expect.objectContaining({
      type: 'video', sourceUrl: A, startTime: 10.5, endTime: 12, sourceStartTime: 5, sourceEndTime: 6.5,
    }));
    const audioTrack = tracks.find((t) => t.type === 'audio')!;
    expect(audioTrack.clips[0]).toEqual(expect.objectContaining({ sourceUrl: T, startTime: 10, endTime: 11.5, sourceStartTime: 0.5 }));
  });
});

describe('flattenCompoundClips', () => {
  it('flattens nested compounds and keeps ids unique', () => {
    const leaf = video('leaf', 'v', A, 0, 1);
    const innerCmp: CompoundClip = {
      id: 'inner', trackId: 'v', type: 'compound', name: 'i', startTime: 0, endTime: 1,
      sourceStartTime: 0, sourceEndTime: 1, innerClips: [leaf], innerTracks: [track('v', 'video', [leaf])],
    };
    const outer: CompoundClip = {
      id: 'outer', trackId: 'v', type: 'compound', name: 'o', startTime: 5, endTime: 6,
      sourceStartTime: 0, sourceEndTime: 1, innerClips: [innerCmp], innerTracks: [track('v', 'video', [innerCmp])],
    };
    const out = flattenCompoundClips([track('v', 'video', [outer])]);
    expect(out).toHaveLength(1);
    expect(out[0].clips).toEqual([expect.objectContaining({ id: 'outer/inner/leaf', trackId: 'v', startTime: 5, endTime: 6 })]);
    expect(editableClipId(out[0].clips[0].id)).toBe('outer');
  });

  it('returns the same array when there is nothing to flatten', () => {
    const tracks = [track('v', 'video', [video('c', 'v', A, 0, 1)])];
    expect(flattenCompoundClips(tracks)).toBe(tracks);
  });
});

describe('trackAudio rules', () => {
  it('mute and solo gate audio only for audio-producing tracks', () => {
    const v = { type: 'video', muted: false, solo: false };
    const a = { type: 'audio', muted: false, solo: true };
    const adj = { type: 'adjustment', muted: false, solo: false };
    expect(isTrackAudible(v, [v, a, adj])).toBe(false);
    expect(isTrackAudible(a, [v, a, adj])).toBe(true);
    expect(isTrackAudible({ ...v, muted: true }, [v])).toBe(false);
    expect(isEmbeddedAudioHandledExternally('x', [{ type: 'music', clips: [{ assetId: 'x' }] }])).toBe(true);
    expect(isEmbeddedAudioHandledExternally('x', [{ type: 'video', clips: [{ assetId: 'x' }] }])).toBe(false);
  });
});

describe('buildExportRequest — speed curves and subtitle keyframes', () => {
  it('trims a speed-curve clip through ∫speed and re-bases its time remapping', async () => {
    // speed 1 → 2 over [0, 2]: S(t) = t + t²/4 → a 0.5 s head trim starts at S(0.5) = 0.5625.
    const keyframes = [
      { time: 0, property: 'speed' as const, value: 1 },
      { time: 2, property: 'speed' as const, value: 2 },
    ];
    const req = await buildExportRequest({
      ...params,
      tracks: [track('v', 'video', [video('c', 'v', A, 0, 2, { keyframes, sourceEndTime: 3 })])],
      range: { start: 0.5, end: 1.5 },
    });
    const clip = (req.tracks as ReqTrack[])[0].clips[0];
    expect(clip.sourceStartTime).toBeCloseTo(0.5625, 9);
    expect(clip.sourceEndTime).toBeCloseTo(1.5 + 1.5 ** 2 / 4, 9);

    const remap = await buildExportRequest({
      ...params,
      tracks: [track('v', 'video', [video('c', 'v', A, 0, 2, {
        timeRemappingKeyframes: [{ time: 0, speed: 0.5 }, { time: 1, speed: 2 }],
      })])],
      range: { start: 0.5, end: 2 },
    });
    expect((remap.tracks as ReqTrack[])[0].clips[0].timeRemappingKeyframes).toEqual([
      { time: -0.5, speed: 0.5 }, { time: 0.5, speed: 2 },
    ]);
  });

  it('passes subtitle animationKeyframes re-based to the range', async () => {
    const sub: SubtitleClip = {
      id: 's', trackId: 's', type: 'subtitle', name: 's', text: 'hi', startTime: 0, endTime: 2,
      sourceStartTime: 0, sourceEndTime: 2,
      style: { animation: 'none' } as SubtitleClip['style'],
      animationKeyframes: [{ time: 1, property: 'x', value: 10 }],
    };
    const req = await buildExportRequest({
      ...params, tracks: [track('s', 'subtitle', [sub])], range: { start: 0.5, end: 2 },
    });
    expect((req.tracks as ReqTrack[])[0].clips[0].animationKeyframes).toEqual([
      { time: 0.5, property: 'x', value: 10 },
    ]);
  });
});
