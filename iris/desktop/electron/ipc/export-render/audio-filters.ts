/**
 * Audio filter builders for the export.
 *
 * buildAudioEffectFilters / buildTransitionAudioFilters were moved verbatim
 * from electron/ipc/export.ts. The helpers below them (sample-format
 * normalisation, atempo chaining, stereo pan, volume keyframes) are shared by
 * the base-track concat and the audio/music track mix.
 */

import type { ExportClip, ExportKeyframe } from './types';
import { keyframeExpr, num } from './keyframe-expr';
// Shared with the renderer's StereoPannerNode — relative path only.
import { stereoPannerMatrix, clampPan } from '../../../src/features/video-editor/lib/audioPan';

/** Every audio segment is normalised to this before concat / amix. */
export const EXPORT_SAMPLE_RATE = 48000;
export const AUDIO_NORMALIZE = `aformat=sample_fmts=fltp:sample_rates=${EXPORT_SAMPLE_RATE}:channel_layouts=stereo`;

/** Audio filter strings for ClipEffect[] type='audio-effect' */
export function buildAudioEffectFilters(effects: ExportClip['effects']): string[] {
  if (!effects) return [];
  const filters: string[] = [];
  for (const fx of effects) {
    if (!fx.enabled || fx.type !== 'audio-effect') continue;
    if (fx.audioEffectType === 'eq' || fx.audioEffectType === 'equalizer') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      if (p.low) filters.push(`equalizer=f=320:t=h:w=200:g=${p.low}`);
      if (p.mid) filters.push(`equalizer=f=1000:t=q:w=0.5:g=${p.mid}`);
      if (p.high) filters.push(`equalizer=f=3200:t=h:w=200:g=${p.high}`);
    } else if (fx.audioEffectType === 'compressor') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      filters.push(
        `acompressor=threshold=${p.threshold ?? -24}dB:ratio=${p.ratio ?? 4}` +
        `:attack=${((p.attack ?? 5) / 1000).toFixed(4)}:release=${((p.release ?? 50) / 1000).toFixed(4)}`
      );
    } else if (fx.audioEffectType === 'reverb' || fx.audioEffectType === 'studio-reverb' || fx.audioEffectType === 'convolution-reverb') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const delay = Math.round(p.delay ?? 300);
      const decay = Math.min(0.9, (p.wetLevel ?? 40) / 100);
      filters.push(`aecho=0.8:${(1 - decay).toFixed(2)}:${delay}|${delay * 1.5}|${delay * 2}:${decay}|${decay * 0.6}|${decay * 0.3}`);
    } else if (fx.audioEffectType === 'delay' || fx.audioEffectType === 'analog-delay') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const delayMs = Math.round(p.delay ?? 500);
      const feedback = Math.min(0.9, (p.feedback ?? 30) / 100);
      filters.push(`aecho=0.6:${(1 - feedback).toFixed(2)}:${delayMs}:${feedback.toFixed(2)}`);
    } else if (fx.audioEffectType === 'chorus') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const depth = Math.max(0.1, (p.depth ?? 40) / 100);
      const rate = Math.max(0.1, (p.rate ?? 1.5));
      filters.push(`chorus=0.5:0.9:${Math.round(p.delay ?? 50)}|${Math.round((p.delay ?? 50) * 1.3)}:${depth.toFixed(2)}|${(depth * 0.8).toFixed(2)}:${rate.toFixed(2)}|${(rate * 0.7).toFixed(2)}:s`);
    } else if (fx.audioEffectType === 'flanger') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      filters.push(`flanger=delay=${p.delay ?? 0}:depth=${p.depth ?? 2}:regen=${p.feedback ?? 0}:width=71:speed=${p.rate ?? 0.5}:phase=25:interp=linear`);
    } else if (fx.audioEffectType === 'phaser') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      filters.push(`aphaser=in_gain=0.4:out_gain=0.74:delay=${p.delay ?? 3}:decay=${p.decay ?? 0.4}:speed=${p.rate ?? 0.5}:type=t`);
    } else if (fx.audioEffectType === 'amplify') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const gain = p.gain ?? 0;
      if (gain !== 0) filters.push(`volume=${gain}dB`);
    } else if (fx.audioEffectType === 'hard-limiter') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const limitDb = p.limit ?? -0.1;
      const limitLin = Math.pow(10, limitDb / 20);
      filters.push(`alimiter=limit=${limitLin.toFixed(4)}:attack=5:release=50:level=disabled`);
    } else if (fx.audioEffectType === 'dynamics' || fx.audioEffectType === 'tube-compressor' || fx.audioEffectType === 'single-band-compressor' || fx.audioEffectType === 'multiband-compressor') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const knee = fx.audioEffectType === 'tube-compressor' ? ':knee=6' : '';
      filters.push(
        `acompressor=threshold=${p.threshold ?? -24}dB:ratio=${p.ratio ?? 4}${knee}` +
        `:attack=${((p.attack ?? 5) / 1000).toFixed(4)}:release=${((p.release ?? 50) / 1000).toFixed(4)}`
      );
    } else if (fx.audioEffectType === 'bass') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const gain = p.gain ?? 0;
      if (gain !== 0) filters.push(`bass=gain=${gain}:frequency=${p.frequency ?? 100}:width_type=h:width=200`);
    } else if (fx.audioEffectType === 'treble') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const gain = p.gain ?? 0;
      if (gain !== 0) filters.push(`treble=gain=${gain}:frequency=${p.frequency ?? 3000}:width_type=h:width=2000`);
    } else if (fx.audioEffectType === 'notch-filter') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      filters.push(`bandreject=frequency=${p.frequency ?? 1000}:width_type=q:width=${p.q ?? 10}`);
    } else if (fx.audioEffectType === 'denoise' || fx.audioEffectType === 'noise-reduction' || fx.audioEffectType === 'adaptive-noise-reduction') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const strength = (p.strength ?? 50) / 100;
      const nf = Math.round(-10 - strength * 30);
      const nt = fx.audioEffectType === 'adaptive-noise-reduction' ? ':nt=w' : '';
      filters.push(`afftdn=nf=${nf}${nt}`);
    } else if (fx.audioEffectType === 'dehummer') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      filters.push(`bandreject=frequency=${p.frequency ?? 50}:width_type=o:width=1`);
    } else if (fx.audioEffectType === 'de-esser') {
      filters.push(`equalizer=f=7500:t=o:w=1:g=-6`);
    } else if (fx.audioEffectType === 'stereo-expander') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      filters.push(`extrastereo=m=${Math.max(0, (p.amount ?? 50) / 25)}`);
    } else if (fx.audioEffectType === 'swap-channels') {
      filters.push(`pan=stereo|c0=c1|c1=c0`);
    } else if (fx.audioEffectType === 'fill-left-right') {
      filters.push(`pan=stereo|c0=c0+c1|c1=c0+c1`);
    } else if (fx.audioEffectType === 'invert-audio') {
      filters.push(`aeval='-val(0):-val(1)'`);
    } else if (fx.audioEffectType === 'balance') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const bal = Math.max(-1, Math.min(1, (p.balance ?? 0) / 100));
      const leftVol = Math.max(0, 1 - bal).toFixed(4);
      const rightVol = Math.max(0, 1 + bal).toFixed(4);
      filters.push(`pan=stereo|c0=${leftVol}*c0|c1=${rightVol}*c1`);
    } else if (fx.audioEffectType === 'graphic-eq') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const bands: [number, string][] = [[63,'band0'],[125,'band1'],[250,'band2'],[500,'band3'],[1000,'band4'],[2000,'band5'],[4000,'band6'],[8000,'band7'],[16000,'band8']];
      for (const [freq, key] of bands) {
        const gain = p[key] ?? 0;
        if (gain !== 0) filters.push(`equalizer=f=${freq}:t=o:w=1:g=${gain}`);
      }
    } else if (fx.audioEffectType === 'parametric-eq') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      for (let band = 1; band <= 4; band++) {
        const freq = p[`freq${band}`];
        const gain = p[`gain${band}`];
        const q = p[`q${band}`] ?? 1.0;
        if (freq && gain && gain !== 0) filters.push(`equalizer=f=${freq}:t=q:w=${q}:g=${gain}`);
      }
    } else if (fx.audioEffectType === 'vocal-enhancer') {
      filters.push(`equalizer=f=3000:t=o:w=1:g=3,equalizer=f=10000:t=h:w=3000:g=2`);
    } else if (fx.audioEffectType === 'fft-filter') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      if (p.lowCut) filters.push(`highpass=f=${p.lowCut}`);
      if (p.highCut) filters.push(`lowpass=f=${p.highCut}`);
    } else if (fx.audioEffectType === 'downmixer') {
      filters.push(`pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1`);
    } else if (fx.audioEffectType === 'gain') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const gainDb = p.gain ?? 0;
      if (gainDb !== 0) filters.push(`volume=${gainDb}dB`);
    } else if (fx.audioEffectType === 'scientific-filter') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      if (p.frequency) {
        filters.push(`highpass=f=${p.frequency}`);
      }
    }
  }
  return filters;
}
/** Audio fade/transition filter strings */
export function buildTransitionAudioFilters(effects: ExportClip['effects'], clipDuration: number): string[] {
  if (!effects) return [];
  const filters: string[] = [];
  for (const fx of effects) {
    if (!fx.enabled || fx.type !== 'transition') continue;
    const dur = fx.transitionDuration ?? 0.5;
    const pos = fx.transitionPosition ?? 'start';
    const fadeOutStart = Math.max(0, clipDuration - dur).toFixed(4);
    if (
      fx.transitionType === 'fade' || fx.transitionType === 'dissolve' ||
      fx.transitionType === 'dip-to-black' || fx.transitionType === 'dip-to-white'
    ) {
      if (pos === 'start' || pos === 'both') filters.push(`afade=t=in:st=0:d=${dur}`);
      if (pos === 'end' || pos === 'both') filters.push(`afade=t=out:st=${fadeOutStart}:d=${dur}`);
    }
  }
  return filters;
}

/**
 * atempo for any speed. A single atempo instance only accepts 0.5–100 on
 * FFmpeg ≥ 4.3 (0.5–2 before), so chain 0.5/2.0 steps to stay within range.
 */
export function atempoChain(speed: number): string[] {
  if (!(speed > 0) || Math.abs(speed - 1) < 1e-9) return [];
  const out: string[] = [];
  let rest = speed;
  while (rest > 2) { out.push('atempo=2'); rest /= 2; }
  while (rest < 0.5) { out.push('atempo=0.5'); rest /= 0.5; }
  if (Math.abs(rest - 1) > 1e-9) out.push(`atempo=${num(rest)}`);
  return out;
}

/** Exact sample count for `seconds` at the export sample rate. */
export function samplesFor(seconds: number): number {
  return Math.max(1, Math.round(seconds * EXPORT_SAMPLE_RATE));
}

/**
 * Stereo pan with the same channel matrix as the preview's StereoPannerNode
 * (see src/features/video-editor/lib/audioPan.ts). Input must already be stereo.
 */
export function stereoPanFilter(pan: number | undefined): string | null {
  if (clampPan(pan) === 0) return null;
  const m = stereoPannerMatrix(pan);
  const term = (k: number, ch: string) => (k === 0 ? '' : `${k.toFixed(6)}*${ch}`);
  const join = (a: string, b: string) => [a, b].filter(Boolean).join('+') || '0*c0';
  const c0 = join(term(m.lFromL, 'c0'), term(m.lFromR, 'c1'));
  const c1 = join(term(m.rFromL, 'c0'), term(m.rFromR, 'c1'));
  return `pan=stereo|c0=${c0}|c1=${c1}`;
}

/**
 * Clip volume × track volume, following volume keyframes when present (the
 * keyframe value replaces the clip volume, exactly like the preview).
 * Time `t` must be seconds from the clip's timeline start.
 */
export function clipVolumeFilter(
  trackVolume: number,
  clipVolume: number,
  keyframes: ExportKeyframe[] | undefined,
): string | null {
  const kf = keyframeExpr(keyframes, 'volume', 't');
  if (kf !== null) {
    return `volume='${num(trackVolume)}*max(0,${kf})':eval=frame`;
  }
  const total = trackVolume * clipVolume;
  return Math.abs(total - 1) < 1e-9 ? null : `volume=${num(total)}`;
}
