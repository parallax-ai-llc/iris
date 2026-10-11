/**
 * Audio / music track clips → delayed, processed streams mixed with the base
 * track's embedded audio.
 *
 * Per clip, in the same order as the preview's Web Audio graph
 * (components/AudioPlayer.tsx: source → gain(volume·fade·gainDb) → effects →
 * StereoPanner): volume (keyframes replace the clip volume) → gain dB → fades →
 * audio effects → stereo pan, then padded/cut to the clip's timeline slot and
 * delayed to its start sample.
 */

import type { ExportClip, ExportTrack } from './types';
import {
  AUDIO_NORMALIZE, EXPORT_SAMPLE_RATE, buildAudioEffectFilters, clipVolumeFilter,
  samplesFor, stereoPanFilter,
} from './audio-filters';
import { type GraphContext, takeAudioSrc } from './graph-context';
import { num } from './keyframe-expr';
// Shared with the preview — relative path only.
import { dbToLinear } from '../../../src/features/video-editor/lib/audioPan';

export interface ExternalAudioClip {
  clip: ExportClip;
  track: ExportTrack;
}

function buildClipChain(item: ExternalAudioClip): string[] {
  const { clip, track } = item;
  const slot = Math.max(0, clip.endTime - clip.startTime);
  const srcStart = clip.sourceStartTime;
  const f: string[] = [
    `atrim=start=${num(srcStart)}:end=${num(srcStart + Math.max(0.001, slot))}`,
    'asetpts=PTS-STARTPTS',
    AUDIO_NORMALIZE,
  ];
  const volume = clipVolumeFilter(track.volume ?? 1, clip.volume ?? 1, clip.keyframes);
  if (volume) f.push(volume);
  // Clip gain (dB) — same dB→linear conversion as the preview GainNode.
  const gain = dbToLinear(clip.gain);
  if (gain !== 1) f.push(`volume=${num(gain)}`);
  if (clip.fadeIn && clip.fadeIn > 0) f.push(`afade=t=in:st=0:d=${num(clip.fadeIn)}`);
  if (clip.fadeOut && clip.fadeOut > 0) {
    f.push(`afade=t=out:st=${Math.max(0, slot - clip.fadeOut).toFixed(4)}:d=${num(clip.fadeOut)}`);
  }
  f.push(...buildAudioEffectFilters(clip.effects));
  // Effects may change the layout (pan/downmix effects) — renormalise before panning.
  f.push(AUDIO_NORMALIZE);
  const pan = stereoPanFilter(clip.pan);
  if (pan) f.push(pan);
  // Exactly the timeline slot, then delay to the clip's start (sample-exact).
  f.push('apad', `atrim=end_sample=${samplesFor(slot)}`, 'asetpts=PTS-STARTPTS');
  const delay = Math.round(clip.startTime * EXPORT_SAMPLE_RATE);
  if (delay > 0) f.push(`adelay=${delay}S|${delay}S`);
  return f;
}

/**
 * Append chains for every external audio clip and mix them with `baseAudio`.
 * Returns the final audio label (with brackets) or null when there is no audio.
 */
export function mixExternalAudio(
  ctx: GraphContext,
  items: ExternalAudioClip[],
  baseAudioLabel: string | null,
): string | null {
  const toMix: string[] = [];
  if (baseAudioLabel) toMix.push(`[${baseAudioLabel}]`);

  items.forEach((item, i) => {
    const inputIdx = ctx.inputMap.get(item.clip.sourceUrl);
    if (inputIdx === undefined) return;
    const label = `extaudio${i}`;
    ctx.filterParts.push(`[${takeAudioSrc(ctx, inputIdx)}]${buildClipChain(item).join(',')}[${label}]`);
    toMix.push(`[${label}]`);
  });

  if (toMix.length === 0) return null;
  if (toMix.length === 1) return toMix[0];
  ctx.filterParts.push(
    `${toMix.join('')}amix=inputs=${toMix.length}:duration=longest:normalize=0[finalaudio]`,
  );
  return '[finalaudio]';
}
