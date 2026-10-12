/**
 * Subtitle animation for the burned-ASS fallback (ass-subtitles.ts).
 *
 * The renderer normally rasterises animated subtitles per frame (pixel-exact).
 * When only ASS is available, the same values (src/features/video-editor/lib/
 * subtitleAnimation.ts) are expressed with ASS override tags:
 *
 *   animationKeyframes  the clip is split at every keyframe time (and into
 *                       ≤ 0.2 s pieces when a segment is eased); each event
 *                       animates linearly with \move (x / y), \t(\fscx\fscy)
 *                       (scale), \t(\frz) (rotation, ASS is counter-clockwise),
 *                       \t(\fs) (font size) and \t(\1a\3a\4a) (opacity)
 *   presets             per-word / per-character inline tags with \t steps:
 *                       highlight (\1c), typewriter (\1a), fade-word (\1a
 *                       ramp), scale (\fscx\fscy + \1c), slide-up (\move +
 *                       \1a fade)
 *
 * Not expressible in ASS (rendered static): bounce, wave, glow, and the box
 * staying put while slide-up moves only the text.
 */

// Shared with the preview — relative path only.
import {
  subtitleKeyframeState, type SubtitleKeyframeLike, type SubtitleKeyframeState,
} from '../../../src/features/video-editor/lib/subtitleAnimation';

/** Eased keyframe segments are split into pieces of at most this length. */
const MAX_EASED_PIECE = 0.2;

export interface AssAnimSub {
  startTime: number;
  endTime: number;
  text: string;
  animationKeyframes?: SubtitleKeyframeLike[];
  animation?: string;
  fontColor: string;
  animationColor: string;
  /** Base position in % of the frame. */
  position: { x: number; y: number };
  fontSize: number;
  /** Base alphas (0 = opaque … 255 = transparent) of fill / outline / box. */
  alpha1: number;
  alpha3: number;
  alpha4: number;
}

export interface AssEventPiece {
  /** Clip-relative seconds. */
  start: number;
  end: number;
  /** Override tags for position / transform / opacity animation. */
  tags: string;
}

const hex2 = (a: number) => Math.round(Math.max(0, Math.min(255, a))).toString(16).padStart(2, '0').toUpperCase();
const ms = (s: number) => Math.max(0, Math.round(s * 1000));
const r2 = (n: number) => Number(n.toFixed(2));

export function hexToAssColor(hex: string): string {
  const h = hex.replace('#', '').padEnd(6, '0');
  return `&H${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`.toUpperCase();
}

/** Alpha tags for an opacity multiplier on top of the base alphas. */
function alphaTags(sub: AssAnimSub, opacity: number): string {
  const o = Math.max(0, Math.min(1, opacity));
  const a = (base: number) => hex2(255 - (255 - base) * o);
  return `\\1a&H${a(sub.alpha1)}&\\3a&H${a(sub.alpha3)}&\\4a&H${a(sub.alpha4)}&`;
}

/** Split the clip into linearly animated pieces for its animationKeyframes. */
export function keyframePieces(sub: AssAnimSub, W: number, H: number): AssEventPiece[] {
  const dur = sub.endTime - sub.startTime;
  const kfs = sub.animationKeyframes ?? [];
  const stateAt = (t: number): Required<SubtitleKeyframeState> => {
    const s = subtitleKeyframeState(kfs, t);
    return {
      x: s.x ?? sub.position.x, y: s.y ?? sub.position.y, opacity: s.opacity ?? 1,
      scale: s.scale ?? 1, rotation: s.rotation ?? 0, fontSize: s.fontSize ?? sub.fontSize,
    };
  };
  const cuts = new Set<number>([0, dur]);
  for (const k of kfs) if (k.time > 0 && k.time < dur) cuts.add(k.time);
  const sorted = Array.from(cuts).sort((a, b) => a - b);
  const eased = kfs.some((k) => k.easing && k.easing !== 'linear');
  const bounds: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const n = eased ? Math.max(1, Math.ceil((b - a) / MAX_EASED_PIECE)) : 1;
    for (let j = 0; j < n; j++) bounds.push(a + ((b - a) * j) / n);
  }
  bounds.push(dur);

  const pieces: AssEventPiece[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i];
    const b = bounds[i + 1];
    if (b - a < 0.005) continue;
    const s0 = stateAt(a);
    const s1 = stateAt(b);
    const px = (s: { x: number; y: number }) => [r2((s.x / 100) * W), r2((s.y / 100) * H)];
    const [x0, y0] = px(s0);
    const [x1, y1] = px(s1);
    let tags = x0 === x1 && y0 === y1 ? `\\pos(${x0},${y0})` : `\\move(${x0},${y0},${x1},${y1})`;
    const to: string[] = [];
    tags += `\\fscx${r2(s0.scale * 100)}\\fscy${r2(s0.scale * 100)}`;
    if (s1.scale !== s0.scale) to.push(`\\fscx${r2(s1.scale * 100)}\\fscy${r2(s1.scale * 100)}`);
    if (s0.rotation !== 0 || s1.rotation !== 0) {
      tags += `\\frz${r2(-s0.rotation)}`;
      if (s1.rotation !== s0.rotation) to.push(`\\frz${r2(-s1.rotation)}`);
    }
    tags += `\\fs${r2(s0.fontSize)}`;
    if (s1.fontSize !== s0.fontSize) to.push(`\\fs${r2(s1.fontSize)}`);
    tags += alphaTags(sub, s0.opacity);
    if (s1.opacity !== s0.opacity) to.push(alphaTags(sub, s1.opacity));
    if (to.length > 0) tags += `\\t(${to.join('')})`;
    pieces.push({ start: a, end: b, tags });
  }
  return pieces;
}

/** A step change at clip time `at`: initial tag if already past, else \t at that instant. */
function step(at: number, evStart: number, evEnd: number, before: string, after: string): string {
  if (at <= evStart) return after;
  if (at >= evEnd) return before;
  const t = ms(at - evStart);
  return `${before}\\t(${t},${t},${after})`;
}

/**
 * Event text with inline preset tags for the piece [evStart, evEnd) of the
 * clip (clip-relative seconds). `escape` turns plain text into ASS text.
 */
export function presetText(
  sub: AssAnimSub,
  evStart: number,
  evEnd: number,
  escape: (s: string) => string,
): { text: string; head: string } {
  const dur = sub.endTime - sub.startTime;
  const text = sub.text;
  const anim = sub.animation ?? 'none';
  if (dur <= 0 || anim === 'none') return { text: escape(text), head: '' };
  const fc = hexToAssColor(sub.fontColor);
  const ac = hexToAssColor(sub.animationColor);
  const a1 = `&H${hex2(sub.alpha1)}&`;
  const hidden = '&HFF&';
  const words = text.split(/(\s+)/);
  const wc = words.filter((w) => w.trim()).length;
  const d = wc > 0 ? dur / wc : dur;

  const perWord = (fn: (w: string, i: number) => string) => {
    let i = 0;
    return words.map((w) => (w.trim() ? fn(w, i++) : escape(w))).join('');
  };

  switch (anim) {
    case 'highlight':
      return {
        head: '',
        text: perWord((w, i) => `{${step(i * d, evStart, evEnd, `\\1c${fc}`, `\\1c${ac}`)}}${escape(w)}`),
      };
    case 'typewriter': {
      const n = text.length;
      return {
        head: '',
        text: text.split('').map((ch, i) =>
          `{${step(((i + 1) * dur) / n, evStart, evEnd, `\\1a${hidden}`, `\\1a${a1}`)}}${escape(ch)}`).join(''),
      };
    }
    case 'fade-word':
      return {
        head: '',
        text: perWord((w, i) => {
          const t0 = i * d;
          const t1 = (i + 1) * d;
          const p0 = Math.min(1, Math.max(0, (evStart - t0) / d));
          const startAlpha = `&H${hex2(255 - (255 - sub.alpha1) * p0)}&`;
          const ramp = t1 > evStart && t0 < evEnd
            ? `\\t(${ms(Math.max(0, t0 - evStart))},${ms(t1 - evStart)},\\1a${a1})`
            : '';
          return `{\\1a${startAlpha}${ramp}}${escape(w)}`;
        }),
      };
    case 'scale':
      return {
        head: '',
        text: perWord((w, i) => {
          const on = `\\fscx130\\fscy130\\1c${ac}`;
          const off = `\\fscx100\\fscy100\\1c${fc}`;
          const t0 = i * d;
          const t1 = (i + 1) * d;
          let tags = evStart >= t0 && evStart < t1 ? on : off;
          if (t0 > evStart && t0 < evEnd) tags += `\\t(${ms(t0 - evStart)},${ms(t0 - evStart)},${on})`;
          if (t1 > evStart && t1 < evEnd) tags += `\\t(${ms(t1 - evStart)},${ms(t1 - evStart)},${off})`;
          return `{${tags}}${escape(w)}`;
        }),
      };
    case 'slide-up': {
      // Opacity min(1, 4p): fill fades in over the first quarter.
      const fadeEnd = dur / 4;
      const p0 = Math.min(1, (4 * evStart) / dur);
      const head = evStart < fadeEnd
        ? `\\1a&H${hex2(255 - (255 - sub.alpha1) * p0)}&\\t(0,${ms(fadeEnd - evStart)},\\1a${a1})`
        : '';
      return { head, text: escape(text) };
    }
    default:
      return { text: escape(text), head: '' };
  }
}

/** slide-up: \move from 30 px below over the first third (only without x / y keyframes). */
export function slideUpMove(sub: AssAnimSub, W: number, H: number): string | null {
  if (sub.animation !== 'slide-up') return null;
  if ((sub.animationKeyframes ?? []).some((k) => k.property === 'x' || k.property === 'y')) return null;
  const x = r2((sub.position.x / 100) * W);
  const y = r2((sub.position.y / 100) * H);
  const dur = sub.endTime - sub.startTime;
  return `\\move(${x},${r2(y + 30)},${x},${y},0,${ms(dur / 3)})`;
}
