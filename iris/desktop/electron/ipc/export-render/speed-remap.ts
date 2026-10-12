/**
 * Speed keyframes / time remapping → FFmpeg filters for one base-clip segment.
 *
 * The timeline → source mapping comes from the same helper the preview uses
 * (src/features/video-editor/lib/timeRemap.ts: sourceOffset = ∫speed). The
 * segment reads the source span [sourceOffset(lead), sourceOffset(lead + dur)]
 * and re-times it:
 *
 *   video  setpts with a piecewise-linear inverse map (source → timeline),
 *          sampled at ≤ 1/8 s and at every keyframe time. The downstream
 *          fps / tpad / trim stages then cut the exact slot length as for a
 *          constant speed (frame sampling, like the preview's <video>).
 *   audio  asendcmd switching atempo's tempo at the same sample points to the
 *          average speed of each piece (pitch preserved, like the preview's
 *          playbackRate). Rates below 0.5× use a chain of equal atempo stages.
 *          The segment is then padded / cut to its exact sample count.
 *
 * Commands target filter INSTANCES (atempo@<tag>…) — a class-name target would
 * reach every atempo in the whole graph.
 */

import type { ExportClip } from './types';
import { num } from './keyframe-expr';
// Shared with the preview — relative path only.
import { buildTimeMap, type TimeMap } from '../../../src/features/video-editor/lib/timeRemap';

/** Longest piece of the piecewise-linear approximation (timeline seconds). */
const MAX_PIECE = 1 / 8;
/** Piece budget per segment (keeps the filter_complex argument short). */
const MAX_PIECES = 64;

export function clipTimeMap(clip: ExportClip): TimeMap {
  return buildTimeMap(clip);
}

interface Piece {
  /** Segment-relative timeline seconds. */
  t0: number;
  t1: number;
  /** Source seconds relative to the segment's trim start. */
  s0: number;
  s1: number;
}

/** Sample points of [lead, lead + span] on the timeline (uniform ∪ keyframes). */
function pieces(map: TimeMap, lead: number, span: number): Piece[] {
  const n = Math.min(MAX_PIECES, Math.max(4, Math.ceil(span / MAX_PIECE)));
  const times = new Set<number>();
  for (let i = 0; i <= n; i++) times.add(lead + (span * i) / n);
  for (const b of map.breakpoints) if (b > lead && b < lead + span) times.add(b);
  const sorted = Array.from(times).sort((a, b) => a - b);
  const base = map.sourceOffsetAt(lead);
  const out: Piece[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (b - a < 1e-9) continue;
    out.push({
      t0: a - lead, t1: b - lead,
      s0: map.sourceOffsetAt(a) - base, s1: map.sourceOffsetAt(b) - base,
    });
  }
  return out;
}

/** Balanced if-tree: timeline seconds for source seconds T (piecewise linear). */
function inverseExpr(ps: Piece[], lo = 0, hi = ps.length - 1): string {
  if (lo === hi) {
    const p = ps[lo];
    const k = (p.t1 - p.t0) / (p.s1 - p.s0);
    return `${num(p.t0)}+(T-${num(p.s0)})*${num(k)}`;
  }
  const mid = Math.floor((lo + hi) / 2);
  return `if(lt(T,${num(ps[mid].s1)}),${inverseExpr(ps, lo, mid)},${inverseExpr(ps, mid + 1, hi)})`;
}

/**
 * setpts filter that re-times a trimmed source span (pts from 0 = trim start)
 * onto the segment's timeline (pts from 0 = segment start).
 * `span` is the timeline length to cover (slot + margin).
 *
 * The downstream `fps` filter rounds to the nearest output tick; shifting by
 * just under half a frame turns that into "the last source frame at or before
 * the tick" — what the preview's <video> shows at currentTime.
 */
export function remapVideoFilter(map: TimeMap, lead: number, span: number, fps: number): string {
  const ps = pieces(map, lead, span);
  return `setpts='(${inverseExpr(ps)}+${num(0.49 / fps)})/TB'`;
}

/** atempo stages needed so every stage stays ≥ 0.5 (FFmpeg's lower bound). */
function stagesFor(minTempo: number): number {
  return minTempo >= 0.5 ? 1 : Math.ceil(Math.log(minTempo) / Math.log(0.5));
}

/**
 * asendcmd + atempo stages that play the trimmed source span (pts from 0 =
 * trim start) at the curve's speed. `tag` must be unique in the graph.
 */
export function remapAudioFilters(map: TimeMap, lead: number, span: number, tag: string): string[] {
  const ps = pieces(map, lead, span);
  const tempos = ps.map((p) => (p.s1 - p.s0) / (p.t1 - p.t0));
  const stages = stagesFor(Math.min(...tempos));
  const stageTempo = (v: number) => num(Math.pow(v, 1 / stages));
  const names = Array.from({ length: stages }, (_, i) => `atempo@${tag}_${i}`);

  const cmds: string[] = [];
  for (let i = 1; i < ps.length; i++) {
    if (Math.abs(tempos[i] - tempos[i - 1]) < 1e-6) continue;
    cmds.push(`${num(ps[i].s0)} ${names.map((n) => `${n} tempo ${stageTempo(tempos[i])}`).join(',')}`);
  }
  const filters: string[] = [];
  if (cmds.length > 0) filters.push(`asendcmd=c='${cmds.join(';')}'`);
  for (const n of names) filters.push(`${n}=tempo=${stageTempo(tempos[0])}`);
  return filters;
}
