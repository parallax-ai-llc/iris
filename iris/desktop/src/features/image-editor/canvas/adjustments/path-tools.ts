/**
 * Path utilities (simplify, curvature pen, SVG path parsing)
 *
 * Part of the image-editor adjustments library (see ./index.ts barrel),
 * extracted from the former monolithic adjustments.ts.
 */

/**
 * Simplify a freehand path using Ramer-Douglas-Peucker algorithm.
 * Reduces points while preserving shape within epsilon tolerance.
 */
export function simplifyPath(
  points: Array<{ x: number; y: number }>,
  epsilon: number
): Array<{ x: number; y: number }> {
  if (points.length <= 2) return [...points];

  // Find point with max distance from line between first and last
  const first = points[0];
  const last = points[points.length - 1];
  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const dist = pointToLineDistance(points[i], first, last);
    if (dist > maxDist) { maxDist = dist; maxIdx = i; }
  }

  if (maxDist > epsilon) {
    const left = simplifyPath(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyPath(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

function pointToLineDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const projX = a.x + t * dx, projY = a.y + t * dy;
  return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2);
}

/**
 * Convert click points to smooth cubic Bézier control points.
 * Curvature Pen creates smooth curves through each clicked point.
 */
export function curvaturePenPoints(
  points: Array<{ x: number; y: number }>
): Array<{ x: number; y: number; cp1x: number; cp1y: number; cp2x: number; cp2y: number }> {
  if (points.length < 2) return points.map(p => ({ ...p, cp1x: p.x, cp1y: p.y, cp2x: p.x, cp2y: p.y }));

  const result: Array<{ x: number; y: number; cp1x: number; cp1y: number; cp2x: number; cp2y: number }> = [];
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(0, i - 1)];
    const curr = points[i];
    const next = points[Math.min(n - 1, i + 1)];

    // Tangent direction: average of prev→curr and curr→next
    const dx = (next.x - prev.x) / 4;
    const dy = (next.y - prev.y) / 4;

    result.push({
      x: curr.x, y: curr.y,
      cp1x: curr.x - dx, cp1y: curr.y - dy,
      cp2x: curr.x + dx, cp2y: curr.y + dy,
    });
  }
  return result;
}

export interface SvgPathSegment {
  command: string; // M, L, C, Q, Z, etc.
  x: number;
  y: number;
  cp1x?: number;
  cp1y?: number;
  cp2x?: number;
  cp2y?: number;
}

/**
 * Parse an SVG path d-attribute string into path segments.
 * Supports M, L, C, Q, Z commands (absolute).
 */
export function parseSvgPath(d: string): SvgPathSegment[] {
  const segments: SvgPathSegment[] = [];
  const re = /([MLCQZ])\s*([\d.,\s-]*)/gi;
  let match;
  while ((match = re.exec(d)) !== null) {
    const cmd = match[1].toUpperCase();
    const nums = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    switch (cmd) {
      case 'M':
      case 'L':
        if (nums.length >= 2) segments.push({ command: cmd, x: nums[0], y: nums[1] });
        break;
      case 'C':
        if (nums.length >= 6) segments.push({ command: cmd, x: nums[4], y: nums[5], cp1x: nums[0], cp1y: nums[1], cp2x: nums[2], cp2y: nums[3] });
        break;
      case 'Q':
        if (nums.length >= 4) segments.push({ command: cmd, x: nums[2], y: nums[3], cp1x: nums[0], cp1y: nums[1] });
        break;
      case 'Z':
        segments.push({ command: 'Z', x: 0, y: 0 });
        break;
    }
  }
  return segments;
}
