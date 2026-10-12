/**
 * Subtitle animation — one definition for the preview and the export.
 *
 * The preview (components/SubtitleOverlay.tsx) renders the segments below as
 * spans; the export rasterises the same segments per output frame
 * (lib/renderSubtitlePng.ts → frame sequence → FFmpeg overlay), so both show
 * the same words, colours, offsets and opacities at the same instant.
 *
 *   subtitleAnimationFrame(...)  animation preset (style.animation) at progress
 *                                p = (time − start) / duration, clamped to 0..1
 *   subtitleKeyframeState(...)   animationKeyframes (x / y in % of the frame,
 *                                opacity 0..1, scale ×, rotation °, fontSize px)
 *                                at clip time t, interpolated like every other
 *                                keyframe (shared keyframeEasing.ts)
 *
 * Offsets are in project pixels. The preview animates state changes with CSS
 * transitions (SubtitleOverlay PRESET_TRANSITIONS); subtitleAnimationFrameAt
 * replays the ones triggered by a word switching state (highlight, scale,
 * bounce) with the same durations and timing functions, so the exported
 * frames move the way the preview does.
 */

import {
  cubicBezier, interpolateKeyframeValue, type EasedKeyframe,
} from '../../../shared/lib/utils/keyframeEasing';

export interface SubtitleSegment {
  text: string;
  /** Whitespace run between words (rendered as-is, never animated). */
  space: boolean;
  color: string;
  opacity: number;
  /** Vertical offset in px (positive = down). */
  translateY: number;
  /** Uniform scale about the segment's centre (inline-block in the preview). */
  scale: number;
}

export interface SubtitleAnimationFrame {
  segments: SubtitleSegment[];
  /** Whole-text offset / opacity (slide-up). */
  blockTranslateY: number;
  blockOpacity: number;
  /** Glow text-shadow radius in px (glow preset), or 0. */
  glow: number;
}

const seg = (text: string, color: string, extra: Partial<SubtitleSegment> = {}): SubtitleSegment => ({
  text, space: false, color, opacity: 1, translateY: 0, scale: 1, ...extra,
});

/** Same preset maths as the preview has always used (SubtitleOverlay). */
export function subtitleAnimationFrame(
  text: string,
  animation: string | undefined,
  progress: number,
  fontColor: string,
  animationColor: string,
): SubtitleAnimationFrame {
  const frame: SubtitleAnimationFrame = { segments: [], blockTranslateY: 0, blockOpacity: 1, glow: 0 };
  const words = text.split(/(\s+)/);
  const wordCount = words.filter((w) => w.trim()).length;
  const perWord = (fn: (word: string, wordIdx: number) => SubtitleSegment) => {
    let wordIdx = 0;
    frame.segments = words.map((word) => {
      if (!word.trim()) return seg(word, fontColor, { space: true });
      return fn(word, wordIdx++);
    });
  };

  switch (animation) {
    case 'highlight': {
      const active = Math.floor(progress * wordCount);
      perWord((w, i) => seg(w, i <= active ? animationColor : fontColor));
      break;
    }
    case 'typewriter': {
      const visible = Math.floor(progress * text.length);
      frame.segments = [seg(text.slice(0, visible), fontColor), seg(text.slice(visible), fontColor, { opacity: 0 })];
      break;
    }
    case 'bounce': {
      perWord((w, i) => {
        const wp = progress * wordCount - i;
        const show = wp > 0;
        return seg(w, fontColor, { translateY: show ? Math.max(0, (1 - wp) * -20) : -30, opacity: show ? 1 : 0 });
      });
      break;
    }
    case 'scale': {
      const active = Math.floor(progress * wordCount);
      perWord((w, i) => seg(w, i === active ? animationColor : fontColor, { scale: i === active ? 1.3 : 1 }));
      break;
    }
    case 'fade-word': {
      perWord((w, i) => seg(w, fontColor, { opacity: Math.min(1, Math.max(0, progress * wordCount - i)) }));
      break;
    }
    case 'slide-up': {
      frame.segments = [seg(text, fontColor)];
      frame.blockTranslateY = Math.max(0, (1 - progress * 3) * 30);
      frame.blockOpacity = Math.min(1, progress * 4);
      break;
    }
    case 'glow': {
      frame.segments = [seg(text, fontColor)];
      frame.glow = 4 + Math.sin(progress * Math.PI * 6) * 4;
      break;
    }
    case 'wave': {
      frame.segments = text.split('').map((ch, i) =>
        seg(ch, fontColor, { translateY: Math.sin(progress * 8 - i * 0.3) * 3 }));
      break;
    }
    default:
      frame.segments = [seg(text, fontColor)];
  }
  return frame;
}

export type SubtitleKeyframeProperty = 'fontSize' | 'x' | 'y' | 'opacity' | 'rotation' | 'scale';

export interface SubtitleKeyframeLike {
  time: number;
  property: string;
  value: number;
  easing?: string;
}

export interface SubtitleKeyframeState {
  x?: number;
  y?: number;
  opacity?: number;
  scale?: number;
  rotation?: number;
  fontSize?: number;
}

const KF_PROPS: SubtitleKeyframeProperty[] = ['x', 'y', 'opacity', 'scale', 'rotation', 'fontSize'];

/** Keyframed values at clip time t (only the animated properties are set). */
export function subtitleKeyframeState(
  keyframes: readonly SubtitleKeyframeLike[] | undefined,
  t: number,
): SubtitleKeyframeState {
  const state: SubtitleKeyframeState = {};
  if (!keyframes || keyframes.length === 0) return state;
  for (const prop of KF_PROPS) {
    const kfs: EasedKeyframe[] = keyframes
      .filter((k) => k.property === prop && Number.isFinite(k.time) && Number.isFinite(k.value))
      .sort((a, b) => a.time - b.time);
    const v = interpolateKeyframeValue(kfs, t);
    if (v !== undefined) state[prop] = v;
  }
  return state;
}

export function isSubtitleAnimated(clip: {
  style?: { animation?: string };
  animationKeyframes?: readonly unknown[];
}): boolean {
  return (!!clip.style?.animation && clip.style.animation !== 'none') ||
    (clip.animationKeyframes?.length ?? 0) > 0;
}

/** Preset progress at clip time t, as the preview computes it. */
export function subtitleProgress(t: number, duration: number): number {
  return duration > 0 ? Math.max(0, Math.min(1, t / duration)) : 0;
}

// ==================== CSS transitions (export) ====================

/** CSS timing functions used by the preview's subtitle transitions. */
const CSS_EASE: [number, number, number, number] = [0.25, 0.1, 0.25, 1];
const BOUNCE_EASE: [number, number, number, number] = [0.34, 1.56, 0.64, 1];

function eased(curve: [number, number, number, number], t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return cubicBezier(t, curve[0], curve[1], curve[2], curve[3]);
}

function mixHex(a: string, b: string, k: number): string {
  const parse = (h: string) => {
    const x = h.replace('#', '').padEnd(6, '0');
    return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) || 0);
  };
  const ca = parse(a);
  const cb = parse(b);
  return '#' + ca.map((v, i) => Math.round(v + (cb[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

/**
 * The preset at clip time t, including the preview's CSS transitions for the
 * word state changes. A word switches state at i·d (d = duration / words);
 * the state a word mounts with (clip start) is not transitioned.
 */
export function subtitleAnimationFrameAt(
  text: string,
  animation: string | undefined,
  t: number,
  duration: number,
  fontColor: string,
  animationColor: string,
): SubtitleAnimationFrame {
  const frame = subtitleAnimationFrame(text, animation, subtitleProgress(t, duration), fontColor, animationColor);
  if (animation !== 'highlight' && animation !== 'scale' && animation !== 'bounce') return frame;
  const words = frame.segments.filter((x) => !x.space);
  if (words.length === 0 || duration <= 0) return frame;
  const d = duration / words.length;
  /** Progress (0..1, eased) of a transition started at `at` lasting `len`. */
  const since = (at: number, len: number, curve: [number, number, number, number]) =>
    at <= 0 || t < at ? null : eased(curve, (t - at) / len);

  words.forEach((w, i) => {
    if (animation === 'highlight') {
      const k = since(i * d, 0.15, CSS_EASE);
      if (k !== null && k < 1) w.color = mixHex(fontColor, animationColor, k);
    } else if (animation === 'scale') {
      const kOn = since(i * d, 0.2, CSS_EASE);
      const kOff = since((i + 1) * d, 0.2, CSS_EASE);
      if (kOff !== null) {
        w.scale = 1.3 - 0.3 * kOff;
        w.color = mixHex(animationColor, fontColor, kOff);
      } else if (kOn !== null) {
        w.scale = 1 + 0.3 * kOn;
        w.color = mixHex(fontColor, animationColor, kOn);
      }
    } else {
      // bounce: shown once p·words > i → move from −30 px toward the target
      // offset with the overshooting curve (0.3 s) and fade in (0.2 s).
      const kY = since(i * d, 0.3, BOUNCE_EASE);
      const kO = since(i * d, 0.2, CSS_EASE);
      if (kY !== null) w.translateY = -30 + (w.translateY + 30) * kY;
      if (kO !== null) w.opacity = kO;
    }
  });
  return frame;
}
