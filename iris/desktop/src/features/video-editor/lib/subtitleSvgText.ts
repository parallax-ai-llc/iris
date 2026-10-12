/**
 * SVG text body for one animated subtitle frame (export rasteriser).
 *
 * Takes the wrapped lines that renderSubtitlePng.ts laid out and the
 * per-word / per-character values of lib/subtitleAnimation.ts, and emits:
 *   - one <tspan x dy> per line (same layout as a static subtitle), with child
 *     tspans carrying colour, fill/stroke opacity and vertical offsets (dy) —
 *     inline values like the preview's spans, so the line layout is unchanged;
 *   - "pop" texts for words scaled about their centre (the preview's
 *     inline-block scale(1.3)), drawn on top while the in-line copy is hidden.
 */

import type { SubtitleAnimationFrame } from './subtitleAnimation';

export interface AnimatedTextLayout {
  lines: string[];
  textX: number;
  firstBaselineY: number;
  lineHeightPx: number;
  anchor: 'start' | 'middle' | 'end';
  fontSize: number;
  fontColor: string;
  hasStroke: boolean;
  /** Rendered width of a string (letter-spacing included). */
  measure: (s: string) => number;
  /** Font / stroke / filter attributes of the main <text> (no fill), reused by pop texts. */
  textAttrs: string;
}

const f2 = (n: number) => n.toFixed(2);

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Child tspans + pop texts, or null when the segments do not line up with the
 * wrapped lines (caller falls back to the static body).
 */
export function buildAnimatedTextBody(
  displayText: string,
  frame: SubtitleAnimationFrame,
  layout: AnimatedTextLayout,
): { tspans: string; pops: string } | null {
  // Segment index of every character of displayText.
  const segOf: number[] = [];
  frame.segments.forEach((s, i) => { for (let c = 0; c < s.text.length; c++) segOf.push(i); });
  if (segOf.length !== displayText.length) return null;

  const { lines, textX, firstBaselineY, lineHeightPx, anchor, fontSize, measure } = layout;
  const out: string[] = [];
  const pops: string[] = [];
  let p = 0;
  let shift = 0; // accumulated dy inside the current line

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (displayText.slice(p, p + line.length) !== line) return null;
    const lineDy = li === 0 ? -shift : lineHeightPx - shift;
    shift = 0;
    const baseline = firstBaselineY + li * lineHeightPx;
    const lineW = measure(line);
    const lineStart = anchor === 'middle' ? textX - lineW / 2 : anchor === 'end' ? textX - lineW : textX;

    // Group consecutive characters of the same segment; whitespace joins the
    // current group (it has no visible paint either way).
    const groups: Array<{ seg: number; start: number; text: string }> = [];
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      const si = segOf[p + c];
      const last = groups[groups.length - 1];
      if (last && (last.seg === si || /\s/.test(ch))) last.text += ch;
      else groups.push({ seg: si, start: c, text: ch });
    }

    const children = groups.map((g) => {
      const s = frame.segments[g.seg];
      const attrs: string[] = [];
      if (s.translateY !== shift) {
        attrs.push(`dy="${f2(s.translateY - shift)}"`);
        shift = s.translateY;
      }
      if (s.color !== layout.fontColor) attrs.push(`fill="${escapeXml(s.color)}"`);
      const hidden = s.scale !== 1;
      const opacity = hidden ? 0 : Math.max(0, Math.min(1, s.opacity));
      if (opacity !== 1) {
        attrs.push(`fill-opacity="${Number(opacity.toFixed(3))}"`);
        if (layout.hasStroke) attrs.push(`stroke-opacity="${Number(opacity.toFixed(3))}"`);
      }
      if (hidden) {
        const word = g.text.trimEnd();
        const cx = lineStart + measure(line.slice(0, g.start)) + measure(word) / 2;
        const y = baseline + s.translateY;
        const cy = y - fontSize * 0.35;
        const fill = ` fill="${escapeXml(s.color)}"`;
        const op = s.opacity !== 1 ? ` opacity="${Number(s.opacity.toFixed(3))}"` : '';
        pops.push(
          `  <text x="${f2(cx)}" y="${f2(y)}" text-anchor="middle"${layout.textAttrs}${fill}${op}` +
          ` transform="translate(${f2(cx)} ${f2(cy)}) scale(${s.scale}) translate(${f2(-cx)} ${f2(-cy)})">` +
          `${escapeXml(word)}</text>`,
        );
      }
      return `<tspan${attrs.length ? ' ' + attrs.join(' ') : ''}>${escapeXml(g.text)}</tspan>`;
    });

    out.push(`    <tspan x="${f2(textX)}" dy="${f2(lineDy)}">${children.join('')}</tspan>`);
    p += line.length + 1; // the wrap consumed one space
  }
  return { tspans: out.join('\n'), pops: pops.join('\n') };
}
