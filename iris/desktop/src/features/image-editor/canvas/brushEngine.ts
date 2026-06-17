/**
 * Brush Engine
 * Handles brush rendering, stroke interpolation, and painting operations
 */

import type { BrushSettings } from '@/features/image-editor/stores/imageEditor.store';
import { createOffscreenCanvas, getCompositeOperation, hexToRgb } from './canvasEngine';

// ==================== Types ====================

export interface Point {
  x: number;
  y: number;
  pressure?: number;  // 0-1, for pressure-sensitive input
}

export interface BrushTip {
  canvas: HTMLCanvasElement;
  size: number;
  halfSize: number;
}

// ==================== Brush Tip Generation ====================

/**
 * Create a circular brush tip with the given settings
 * Uses radial gradient for softness (hardness)
 */
export function createBrushTip(settings: BrushSettings): BrushTip {
  const size = Math.max(1, Math.round(settings.size));
  const halfSize = size / 2;
  const { canvas, ctx } = createOffscreenCanvas(size, size);

  const { r, g, b } = hexToRgb(settings.color);

  // Create radial gradient for brush softness
  const gradient = ctx.createRadialGradient(
    halfSize,
    halfSize,
    0,
    halfSize,
    halfSize,
    halfSize
  );

  // Hardness controls the gradient falloff
  // 100% hardness = sharp edge, 0% hardness = very soft
  const hardness = settings.hardness / 100;
  const innerStop = hardness * 0.9;  // Inner solid area

  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
  gradient.addColorStop(innerStop, `rgba(${r}, ${g}, ${b}, 1)`);
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Apply bristle texture so brush visually differs from pencil.
  // Uses a deterministic pseudo-random noise modulated by radial distance
  // and radial bristle streaks to simulate paint brush hairs.
  if (size >= 3) {
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    // Simple seeded hash for deterministic per-tip noise
    const seed = (size * 9301 + 49297) % 233280;
    const rand = (i: number) => {
      const x = Math.sin(seed + i * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };
    const bristleCount = Math.max(12, Math.round(size * 0.8));
    const bristleAngles: number[] = [];
    const bristleStrength: number[] = [];
    for (let i = 0; i < bristleCount; i++) {
      bristleAngles.push(rand(i) * Math.PI * 2);
      bristleStrength.push(0.55 + rand(i + 500) * 0.45);
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const a = data[idx + 3];
        if (a === 0) continue;

        const dx = x - halfSize;
        const dy = y - halfSize;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const radial = Math.min(1, dist / halfSize);

        // Angle-based bristle streaks: find nearest bristle angle
        const angle = Math.atan2(dy, dx);
        let streak = 0;
        for (let i = 0; i < bristleCount; i++) {
          let d = Math.abs(angle - bristleAngles[i]);
          if (d > Math.PI) d = Math.PI * 2 - d;
          // narrow angular falloff
          const s = Math.max(0, 1 - d * bristleCount * 0.25) * bristleStrength[i];
          if (s > streak) streak = s;
        }
        // Per-pixel grain
        const grain = rand(x * 131 + y * 977) - 0.5;

        // Combine: streaks carve alpha near edges, grain adds subtle speckle.
        // Strength grows toward the edge so center stays opaque.
        const edgeWeight = Math.pow(radial, 1.4);
        const bristleCut = (1 - streak) * edgeWeight * 0.75;
        const grainCut = grain * 0.35 * edgeWeight;

        let mult = 1 - bristleCut + grainCut;
        if (mult < 0) mult = 0;
        else if (mult > 1.15) mult = 1.15;

        data[idx + 3] = Math.max(0, Math.min(255, a * mult));
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  return { canvas, size, halfSize };
}

/**
 * Create a pencil tip (1px hard edge)
 */
export function createPencilTip(color: string, size: number = 1): BrushTip {
  const actualSize = Math.max(1, Math.round(size));
  const halfSize = actualSize / 2;
  const { canvas, ctx } = createOffscreenCanvas(actualSize, actualSize);

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, actualSize, actualSize);

  return { canvas, size: actualSize, halfSize };
}

/**
 * Create an eraser tip (uses destination-out composite)
 */
export function createEraserTip(size: number, hardness: number): BrushTip {
  // Eraser uses white color, composite mode does the erasing
  return createBrushTip({
    size,
    hardness,
    opacity: 100,
    flow: 100,
    color: '#ffffff',
    blendMode: 'normal',
  });
}

// ==================== Point Interpolation ====================

/**
 * Calculate optimal spacing between brush dabs
 * Generally 25% of brush size for smooth strokes
 */
export function calculateSpacing(brushSize: number): number {
  return Math.max(1, brushSize * 0.25);
}

/**
 * Interpolate points between two positions for smooth strokes
 * Uses linear interpolation with spacing based on brush size
 */
export function interpolatePoints(
  p1: Point,
  p2: Point,
  spacing: number
): Point[] {
  const points: Point[] = [];
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < spacing) {
    return [p2];
  }

  const steps = Math.ceil(dist / spacing);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    points.push({
      x: p1.x + dx * t,
      y: p1.y + dy * t,
      pressure: p1.pressure !== undefined && p2.pressure !== undefined
        ? p1.pressure + (p2.pressure - p1.pressure) * t
        : undefined,
    });
  }

  return points;
}

/**
 * Catmull-Rom spline interpolation for smoother curves
 */
export function interpolatePointsCatmullRom(
  points: Point[],
  spacing: number,
  tension = 0.5
): Point[] {
  if (points.length < 2) return points;
  if (points.length === 2) return interpolatePoints(points[0], points[1], spacing);

  const result: Point[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    const steps = Math.max(1, Math.ceil(dist / spacing));

    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      const t2 = t * t;
      const t3 = t2 * t;

      const x = tension * (
        2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
      ) / 2;

      const y = tension * (
        2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
      ) / 2;

      result.push({ x, y });
    }
  }

  // Add final point
  result.push(points[points.length - 1]);

  return result;
}

// ==================== Brush Rendering ====================

/**
 * Render a single brush dab at the given position
 */
export function renderBrushDab(
  ctx: CanvasRenderingContext2D,
  brushTip: BrushTip,
  x: number,
  y: number,
  opacity: number = 100,
  pressure: number = 1
): void {
  const finalOpacity = (opacity / 100) * pressure;

  ctx.globalAlpha = finalOpacity;
  ctx.drawImage(
    brushTip.canvas,
    x - brushTip.halfSize,
    y - brushTip.halfSize
  );
  ctx.globalAlpha = 1;
}

/**
 * Render a complete brush stroke
 */
export function renderBrushStroke(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  brushTip: BrushTip,
  settings: BrushSettings,
  isEraser = false
): void {
  if (points.length === 0) return;

  // Save context state
  ctx.save();

  // Set composite operation
  if (isEraser) {
    ctx.globalCompositeOperation = 'destination-out';
  } else {
    ctx.globalCompositeOperation = getCompositeOperation(settings.blendMode);
  }

  // Calculate spacing
  const spacing = calculateSpacing(settings.size);

  // Render each point
  let lastPoint = points[0];
  renderBrushDab(ctx, brushTip, lastPoint.x, lastPoint.y, settings.opacity, lastPoint.pressure ?? 1);

  for (let i = 1; i < points.length; i++) {
    const currentPoint = points[i];
    const interpolated = interpolatePoints(lastPoint, currentPoint, spacing);

    for (const point of interpolated) {
      renderBrushDab(ctx, brushTip, point.x, point.y, settings.opacity, point.pressure ?? 1);
    }

    lastPoint = currentPoint;
  }

  // Restore context state
  ctx.restore();
}

/**
 * Render stroke with flow accumulation
 * Flow controls how quickly opacity builds up with overlapping dabs
 */
export function renderBrushStrokeWithFlow(
  targetCanvas: HTMLCanvasElement,
  points: Point[],
  settings: BrushSettings
): void {
  if (points.length === 0) return;

  // Create temporary canvas for the stroke
  const { canvas: strokeCanvas, ctx: strokeCtx } = createOffscreenCanvas(
    targetCanvas.width,
    targetCanvas.height
  );

  // Create brush tip
  const brushTip = createBrushTip({
    ...settings,
    opacity: settings.flow,  // Use flow for individual dabs
  });

  // Render stroke to temporary canvas
  const spacing = calculateSpacing(settings.size);
  let lastPoint = points[0];
  renderBrushDab(strokeCtx, brushTip, lastPoint.x, lastPoint.y, settings.flow);

  for (let i = 1; i < points.length; i++) {
    const currentPoint = points[i];
    const interpolated = interpolatePoints(lastPoint, currentPoint, spacing);

    for (const point of interpolated) {
      renderBrushDab(strokeCtx, brushTip, point.x, point.y, settings.flow, point.pressure ?? 1);
    }

    lastPoint = currentPoint;
  }

  // Composite stroke canvas to target with overall opacity and blend mode
  const targetCtx = targetCanvas.getContext('2d');
  if (!targetCtx) return;

  targetCtx.save();
  targetCtx.globalAlpha = settings.opacity / 100;
  targetCtx.globalCompositeOperation = getCompositeOperation(settings.blendMode);
  targetCtx.drawImage(strokeCanvas, 0, 0);
  targetCtx.restore();
}

// ==================== Pencil Tool ====================

/**
 * Render a pencil stroke (hard-edged, 1px base)
 */
export function renderPencilStroke(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  size: number = 1
): void {
  if (points.length === 0) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }

  ctx.stroke();
  ctx.restore();
}

// ==================== Eraser Tool ====================

/**
 * Render an eraser stroke
 */
export function renderEraserStroke(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  size: number,
  hardness: number
): void {
  if (points.length === 0) return;

  const eraserTip = createEraserTip(size, hardness);

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';

  const spacing = calculateSpacing(size);
  let lastPoint = points[0];
  renderBrushDab(ctx, eraserTip, lastPoint.x, lastPoint.y, 100);

  for (let i = 1; i < points.length; i++) {
    const currentPoint = points[i];
    const interpolated = interpolatePoints(lastPoint, currentPoint, spacing);

    for (const point of interpolated) {
      renderBrushDab(ctx, eraserTip, point.x, point.y, 100, point.pressure ?? 1);
    }

    lastPoint = currentPoint;
  }

  ctx.restore();
}

// ==================== Gradient Tool ====================

export interface GradientColorStop {
  offset: number;
  color: string;
}

/**
 * Create a linear gradient on canvas
 */
export function renderLinearGradient(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  colorStops: GradientColorStop[],
  width: number,
  height: number
): void {
  const gradient = ctx.createLinearGradient(x1, y1, x2, y2);

  for (const stop of colorStops) {
    gradient.addColorStop(stop.offset, stop.color);
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Create a radial gradient on canvas
 */
export function renderRadialGradient(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  colorStops: GradientColorStop[],
  width: number,
  height: number
): void {
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);

  for (const stop of colorStops) {
    gradient.addColorStop(stop.offset, stop.color);
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Create an angular (conic) gradient on canvas
 */
export function renderAngularGradient(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  startAngle: number,
  colorStops: GradientColorStop[],
  width: number,
  height: number
): void {
  // Conic gradient (requires modern browsers)
  const gradient = ctx.createConicGradient(startAngle, cx, cy);

  for (const stop of colorStops) {
    gradient.addColorStop(stop.offset, stop.color);
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Create a diamond gradient (implemented with radial and scaling)
 */
export function renderDiamondGradient(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  colorStops: GradientColorStop[],
  width: number,
  height: number
): void {
  ctx.save();

  // Diamond gradient is created by scaling a radial gradient
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.scale(1, 0.5);
  ctx.translate(-cx, -cy);

  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size);

  for (const stop of colorStops) {
    gradient.addColorStop(stop.offset, stop.color);
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(-width, -height, width * 3, height * 3);

  ctx.restore();
}

// ==================== Clone Stamp Tool ====================

/**
 * Clone stamp - copy pixels from source to destination
 */
export function renderCloneStamp(
  sourceCanvas: HTMLCanvasElement,
  targetCtx: CanvasRenderingContext2D,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  size: number,
  hardness: number,
  opacity: number
): void {
  const halfSize = size / 2;

  // Create brush tip mask
  const { canvas: maskCanvas, ctx: maskCtx } = createOffscreenCanvas(size, size);
  const gradient = maskCtx.createRadialGradient(halfSize, halfSize, 0, halfSize, halfSize, halfSize);
  const innerStop = (hardness / 100) * 0.9;
  gradient.addColorStop(0, 'white');
  gradient.addColorStop(innerStop, 'white');
  gradient.addColorStop(1, 'transparent');
  maskCtx.fillStyle = gradient;
  maskCtx.fillRect(0, 0, size, size);

  // Create temporary canvas for the cloned area
  const { canvas: cloneCanvas, ctx: cloneCtx } = createOffscreenCanvas(size, size);
  cloneCtx.drawImage(
    sourceCanvas,
    sourceX - halfSize,
    sourceY - halfSize,
    size,
    size,
    0,
    0,
    size,
    size
  );

  // Apply mask
  cloneCtx.globalCompositeOperation = 'destination-in';
  cloneCtx.drawImage(maskCanvas, 0, 0);

  // Draw to target
  targetCtx.save();
  targetCtx.globalAlpha = opacity / 100;
  targetCtx.drawImage(cloneCanvas, targetX - halfSize, targetY - halfSize);
  targetCtx.restore();
}

// ==================== Bucket Fill Tool ====================

// ==================== Dodge / Burn / Sponge Tools ====================

/** Convert RGB (0-255) to HSL (h:0-360, s:0-100, l:0-100) */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break;
    case gn: h = ((bn - rn) / d + 2) / 6; break;
    case bn: h = ((rn - gn) / d + 4) / 6; break;
  }
  return [h * 360, s * 100, l * 100];
}

/** Convert HSL (h:0-360, s:0-100, l:0-100) to RGB (0-255) */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hn = h / 360, sn = s / 100, ln = l / 100;
  if (sn === 0) {
    const v = Math.round(ln * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  return [
    Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hn) * 255),
    Math.round(hue2rgb(p, q, hn - 1 / 3) * 255),
  ];
}

/**
 * Build a radial brush mask (values 0-1) for a patch of `size × size`.
 * Hardness controls the hard-to-soft falloff.
 */
function createBrushMask(size: number, hardness: number): Float32Array {
  const clampedSize = Math.max(1, Math.ceil(size));
  const mask = new Float32Array(clampedSize * clampedSize);
  const half = clampedSize / 2;
  const hardnessRadius = (hardness / 100) * half * 0.9;

  for (let py = 0; py < clampedSize; py++) {
    for (let px = 0; px < clampedSize; px++) {
      const dist = Math.sqrt((px - half + 0.5) ** 2 + (py - half + 0.5) ** 2);
      let alpha: number;
      if (dist <= hardnessRadius) {
        alpha = 1;
      } else if (dist >= half) {
        alpha = 0;
      } else {
        alpha = 1 - (dist - hardnessRadius) / (half - hardnessRadius);
      }
      mask[py * clampedSize + px] = alpha;
    }
  }
  return mask;
}

/**
 * Apply Dodge or Burn at a brush position.
 * Reads from sourceCtx (the composited main canvas), modifies pixels,
 * and writes into strokeCtx (the accumulated stroke canvas).
 */
export function applyDodgeBurnAtPoint(
  sourceCtx: CanvasRenderingContext2D,
  strokeCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  hardness: number,
  mode: 'dodge' | 'burn',
  range: 'shadows' | 'midtones' | 'highlights',
  exposure: number
): void {
  const half = size / 2;
  const sx = Math.floor(x - half);
  const sy = Math.floor(y - half);
  const patchW = Math.ceil(size);
  const patchH = Math.ceil(size);

  const cw = sourceCtx.canvas.width;
  const ch = sourceCtx.canvas.height;

  const clampedX = Math.max(0, sx);
  const clampedY = Math.max(0, sy);
  const clampedW = Math.min(patchW - (clampedX - sx), cw - clampedX);
  const clampedH = Math.min(patchH - (clampedY - sy), ch - clampedY);
  if (clampedW <= 0 || clampedH <= 0) return;

  const src = sourceCtx.getImageData(clampedX, clampedY, clampedW, clampedH);
  // result starts fully transparent so pixels outside the brush mask don't
  // overwrite existing stroke content when composited.
  const result = new ImageData(clampedW, clampedH);
  // sourceUpdate accumulates in-place changes into the working source so that
  // subsequent dabs within the same stroke see progressive darkening/lightening.
  const sourceUpdate = new ImageData(new Uint8ClampedArray(src.data), clampedW, clampedH);
  const mask = createBrushMask(size, hardness);
  const factor = (exposure / 100) * 0.6; // max 60% per dab

  for (let py = 0; py < clampedH; py++) {
    for (let px = 0; px < clampedW; px++) {
      // Map patch coords back to full mask coords
      const maskPx = px + (clampedX - sx);
      const maskPy = py + (clampedY - sy);
      const maskIdx = Math.min(mask.length - 1, maskPy * Math.ceil(size) + maskPx);
      const alpha = mask[maskIdx] ?? 0;
      if (alpha <= 0) continue;

      const idx = (py * clampedW + px) * 4;
      const r = src.data[idx], g = src.data[idx + 1], b = src.data[idx + 2];
      const srcA = src.data[idx + 3];
      if (srcA === 0) continue;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // Tonal range weighting
      let rangeFactor: number;
      if (range === 'shadows') rangeFactor = Math.max(0, 1 - lum / 128);
      else if (range === 'highlights') rangeFactor = Math.max(0, (lum - 128) / 128);
      else rangeFactor = Math.max(0, 1 - Math.abs(lum - 128) / 128);

      const strength = alpha * factor * rangeFactor;

      let nr: number, ng: number, nb: number;
      if (mode === 'dodge') {
        nr = Math.min(255, r + (255 - r) * strength);
        ng = Math.min(255, g + (255 - g) * strength);
        nb = Math.min(255, b + (255 - b) * strength);
      } else {
        nr = Math.max(0, r - r * strength);
        ng = Math.max(0, g - g * strength);
        nb = Math.max(0, b - b * strength);
      }

      result.data[idx]     = nr;
      result.data[idx + 1] = ng;
      result.data[idx + 2] = nb;
      result.data[idx + 3] = srcA; // preserve source alpha, brush shape comes from temp canvas below

      sourceUpdate.data[idx]     = nr;
      sourceUpdate.data[idx + 1] = ng;
      sourceUpdate.data[idx + 2] = nb;
      sourceUpdate.data[idx + 3] = srcA;
    }
  }

  // Update the working source so the next dab in this stroke sees the change.
  sourceCtx.putImageData(sourceUpdate, clampedX, clampedY);

  // Composite the modified patch onto the stroke canvas via a temp canvas so
  // that only brushed (non-transparent) pixels affect the stroke — drawImage
  // with source-over respects alpha, unlike putImageData.
  const temp = document.createElement('canvas');
  temp.width = clampedW;
  temp.height = clampedH;
  const tempCtx = temp.getContext('2d');
  if (!tempCtx) return;
  tempCtx.putImageData(result, 0, 0);
  strokeCtx.drawImage(temp, clampedX, clampedY);
}

/**
 * Apply Sponge (saturate/desaturate) at a brush position.
 */
export function applySpongeAtPoint(
  sourceCtx: CanvasRenderingContext2D,
  strokeCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  hardness: number,
  mode: 'saturate' | 'desaturate',
  strength: number
): void {
  const half = size / 2;
  const sx = Math.floor(x - half);
  const sy = Math.floor(y - half);
  const patchW = Math.ceil(size);
  const patchH = Math.ceil(size);

  const cw = sourceCtx.canvas.width;
  const ch = sourceCtx.canvas.height;
  const clampedX = Math.max(0, sx);
  const clampedY = Math.max(0, sy);
  const clampedW = Math.min(patchW - (clampedX - sx), cw - clampedX);
  const clampedH = Math.min(patchH - (clampedY - sy), ch - clampedY);
  if (clampedW <= 0 || clampedH <= 0) return;

  const src = sourceCtx.getImageData(clampedX, clampedY, clampedW, clampedH);
  const result = new ImageData(new Uint8ClampedArray(src.data), clampedW, clampedH);
  const mask = createBrushMask(size, hardness);
  const factor = (strength / 100) * 0.5;

  for (let py = 0; py < clampedH; py++) {
    for (let px = 0; px < clampedW; px++) {
      const maskPx = px + (clampedX - sx);
      const maskPy = py + (clampedY - sy);
      const maskIdx = Math.min(mask.length - 1, maskPy * Math.ceil(size) + maskPx);
      const alpha = mask[maskIdx] ?? 0;
      if (alpha <= 0) continue;

      const idx = (py * clampedW + px) * 4;
      const r = src.data[idx], g = src.data[idx + 1], b = src.data[idx + 2];
      const [h, s, l] = rgbToHsl(r, g, b);

      const effectiveStrength = alpha * factor;
      const newS = mode === 'saturate'
        ? Math.min(100, s + (100 - s) * effectiveStrength)
        : Math.max(0, s - s * effectiveStrength);

      const [nr, ng, nb] = hslToRgb(h, newS, l);
      result.data[idx]     = nr;
      result.data[idx + 1] = ng;
      result.data[idx + 2] = nb;
      result.data[idx + 3] = 255;
    }
  }

  strokeCtx.putImageData(result, clampedX, clampedY);
}

/**
 * Apply local Blur at a brush position.
 * Reads from sourceCtx, applies a small gaussian blur, writes to strokeCtx.
 */
export function applyBlurBrushAtPoint(
  sourceCtx: CanvasRenderingContext2D,
  strokeCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  hardness: number,
  strength: number
): void {
  const half = size / 2;
  const blurRadius = Math.max(1, Math.round((strength / 100) * 5));
  const margin = blurRadius + 1;
  const sx = Math.floor(x - half) - margin;
  const sy = Math.floor(y - half) - margin;
  const patchW = Math.ceil(size) + margin * 2;
  const patchH = Math.ceil(size) + margin * 2;

  const cw = sourceCtx.canvas.width;
  const ch = sourceCtx.canvas.height;
  const clampedX = Math.max(0, sx);
  const clampedY = Math.max(0, sy);
  const clampedW = Math.min(patchW + (sx < 0 ? sx : 0), cw - clampedX);
  const clampedH = Math.min(patchH + (sy < 0 ? sy : 0), ch - clampedY);
  if (clampedW <= 0 || clampedH <= 0) return;

  const src = sourceCtx.getImageData(clampedX, clampedY, clampedW, clampedH);

  // Simple box blur approximation
  const blurred = new Uint8ClampedArray(src.data.length);
  const r2 = blurRadius;
  for (let py = 0; py < clampedH; py++) {
    for (let px = 0; px < clampedW; px++) {
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (let ky = -r2; ky <= r2; ky++) {
        for (let kx = -r2; kx <= r2; kx++) {
          const nx = Math.min(clampedW - 1, Math.max(0, px + kx));
          const ny = Math.min(clampedH - 1, Math.max(0, py + ky));
          const nidx = (ny * clampedW + nx) * 4;
          rSum += src.data[nidx]; gSum += src.data[nidx + 1]; bSum += src.data[nidx + 2];
          count++;
        }
      }
      const didx = (py * clampedW + px) * 4;
      blurred[didx]     = rSum / count;
      blurred[didx + 1] = gSum / count;
      blurred[didx + 2] = bSum / count;
      blurred[didx + 3] = src.data[didx + 3];
    }
  }

  // Now apply mask within the inner brush area
  const mask = createBrushMask(Math.ceil(size), hardness);
  const result = new ImageData(new Uint8ClampedArray(src.data), clampedW, clampedH);

  const innerOffX = clampedX - (Math.floor(x - half) - margin);
  const innerOffY = clampedY - (Math.floor(y - half) - margin);

  for (let py = 0; py < clampedH; py++) {
    for (let px = 0; px < clampedW; px++) {
      // Translate to brush-local coords
      const bx = px + (clampedX - sx) - margin;
      const by = py + (clampedY - sy) - margin;
      if (bx < 0 || by < 0 || bx >= Math.ceil(size) || by >= Math.ceil(size)) continue;
      const maskIdx = Math.min(mask.length - 1, by * Math.ceil(size) + bx);
      const alpha = (mask[maskIdx] ?? 0) * (strength / 100);
      if (alpha <= 0) continue;

      const idx = (py * clampedW + px) * 4;
      result.data[idx]     = src.data[idx]     * (1 - alpha) + blurred[idx]     * alpha;
      result.data[idx + 1] = src.data[idx + 1] * (1 - alpha) + blurred[idx + 1] * alpha;
      result.data[idx + 2] = src.data[idx + 2] * (1 - alpha) + blurred[idx + 2] * alpha;
      result.data[idx + 3] = 255;
    }
  }

  void innerOffX; void innerOffY; // suppress lint
  strokeCtx.putImageData(result, clampedX, clampedY);
}

/**
 * Apply local Sharpen at a brush position.
 * Uses unsharp mask approximation.
 */
export function applySharpenBrushAtPoint(
  sourceCtx: CanvasRenderingContext2D,
  strokeCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  hardness: number,
  strength: number
): void {
  const half = size / 2;
  const margin = 2;
  const sx = Math.floor(x - half) - margin;
  const sy = Math.floor(y - half) - margin;
  const patchW = Math.ceil(size) + margin * 2;
  const patchH = Math.ceil(size) + margin * 2;

  const cw = sourceCtx.canvas.width;
  const ch = sourceCtx.canvas.height;
  const clampedX = Math.max(0, sx);
  const clampedY = Math.max(0, sy);
  const clampedW = Math.min(patchW + (sx < 0 ? sx : 0), cw - clampedX);
  const clampedH = Math.min(patchH + (sy < 0 ? sy : 0), ch - clampedY);
  if (clampedW <= 0 || clampedH <= 0) return;

  const src = sourceCtx.getImageData(clampedX, clampedY, clampedW, clampedH);

  // Laplacian sharpening: result = original + (original - blur) * amount
  const sharpened = new Uint8ClampedArray(src.data.length);
  const amount = (strength / 100) * 1.5;
  for (let py = 0; py < clampedH; py++) {
    for (let px = 0; px < clampedW; px++) {
      const idx = (py * clampedW + px) * 4;
      // 3x3 blur kernel values
      let rBlur = 0, gBlur = 0, bBlur = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const nx = Math.min(clampedW - 1, Math.max(0, px + kx));
          const ny = Math.min(clampedH - 1, Math.max(0, py + ky));
          const nidx = (ny * clampedW + nx) * 4;
          rBlur += src.data[nidx]; gBlur += src.data[nidx + 1]; bBlur += src.data[nidx + 2];
        }
      }
      rBlur /= 9; gBlur /= 9; bBlur /= 9;
      sharpened[idx]     = Math.min(255, Math.max(0, src.data[idx]     + (src.data[idx]     - rBlur) * amount));
      sharpened[idx + 1] = Math.min(255, Math.max(0, src.data[idx + 1] + (src.data[idx + 1] - gBlur) * amount));
      sharpened[idx + 2] = Math.min(255, Math.max(0, src.data[idx + 2] + (src.data[idx + 2] - bBlur) * amount));
      sharpened[idx + 3] = src.data[idx + 3];
    }
  }

  const mask = createBrushMask(Math.ceil(size), hardness);
  const result = new ImageData(new Uint8ClampedArray(src.data), clampedW, clampedH);

  for (let py = 0; py < clampedH; py++) {
    for (let px = 0; px < clampedW; px++) {
      const bx = px + (clampedX - sx) - margin;
      const by = py + (clampedY - sy) - margin;
      if (bx < 0 || by < 0 || bx >= Math.ceil(size) || by >= Math.ceil(size)) continue;
      const maskIdx = Math.min(mask.length - 1, by * Math.ceil(size) + bx);
      const alpha = mask[maskIdx] ?? 0;
      if (alpha <= 0) continue;

      const idx = (py * clampedW + px) * 4;
      result.data[idx]     = src.data[idx]     * (1 - alpha) + sharpened[idx]     * alpha;
      result.data[idx + 1] = src.data[idx + 1] * (1 - alpha) + sharpened[idx + 1] * alpha;
      result.data[idx + 2] = src.data[idx + 2] * (1 - alpha) + sharpened[idx + 2] * alpha;
      result.data[idx + 3] = 255;
    }
  }

  strokeCtx.putImageData(result, clampedX, clampedY);
}

/**
 * Apply Smudge at a brush position.
 * Smears pixels in the direction of movement by blending
 * a sampled patch from a slightly-offset source.
 */
export function applySmudgeAtPoint(
  sourceCtx: CanvasRenderingContext2D,
  strokeCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  prevX: number,
  prevY: number,
  size: number,
  hardness: number,
  strength: number
): void {
  const half = size / 2;
  const smearFactor = (strength / 100) * 0.8;

  // Sample source pixels from slightly behind the current position
  const sampleX = prevX;
  const sampleY = prevY;

  const sx = Math.floor(x - half);
  const sy = Math.floor(y - half);
  const patchW = Math.ceil(size);
  const patchH = Math.ceil(size);

  const cw = sourceCtx.canvas.width;
  const ch = sourceCtx.canvas.height;
  const clampedX = Math.max(0, sx);
  const clampedY = Math.max(0, sy);
  const clampedW = Math.min(patchW - (clampedX - sx), cw - clampedX);
  const clampedH = Math.min(patchH - (clampedY - sy), ch - clampedY);
  if (clampedW <= 0 || clampedH <= 0) return;

  // Destination pixels (current position)
  const dst = sourceCtx.getImageData(clampedX, clampedY, clampedW, clampedH);

  // Source pixels (sampled from previous position)
  const sampleSx = Math.max(0, Math.floor(sampleX - half));
  const sampleSy = Math.max(0, Math.floor(sampleY - half));
  const sampleW = Math.min(patchW, cw - sampleSx);
  const sampleH = Math.min(patchH, ch - sampleSy);
  const sample = sampleW > 0 && sampleH > 0
    ? sourceCtx.getImageData(sampleSx, sampleSy, sampleW, sampleH)
    : null;

  const mask = createBrushMask(patchW, hardness);
  const result = new ImageData(new Uint8ClampedArray(dst.data), clampedW, clampedH);

  for (let py = 0; py < clampedH; py++) {
    for (let px = 0; px < clampedW; px++) {
      const maskPx = px + (clampedX - sx);
      const maskPy = py + (clampedY - sy);
      const maskIdx = Math.min(mask.length - 1, maskPy * patchW + maskPx);
      const alpha = (mask[maskIdx] ?? 0) * smearFactor;
      if (alpha <= 0) continue;

      const idx = (py * clampedW + px) * 4;

      // Sample from the previous position
      let sr = dst.data[idx], sg = dst.data[idx + 1], sb = dst.data[idx + 2];
      if (sample) {
        const samplePx = Math.min(sampleW - 1, Math.max(0, maskPx));
        const samplePy = Math.min(sampleH - 1, Math.max(0, maskPy));
        const sampleIdx = (samplePy * sampleW + samplePx) * 4;
        sr = sample.data[sampleIdx];
        sg = sample.data[sampleIdx + 1];
        sb = sample.data[sampleIdx + 2];
      }

      result.data[idx]     = dst.data[idx]     * (1 - alpha) + sr * alpha;
      result.data[idx + 1] = dst.data[idx + 1] * (1 - alpha) + sg * alpha;
      result.data[idx + 2] = dst.data[idx + 2] * (1 - alpha) + sb * alpha;
      result.data[idx + 3] = 255;
    }
  }

  strokeCtx.putImageData(result, clampedX, clampedY);
}

// ==================== Healing Brush Tools ====================

/**
 * Healing Brush: copy pixels from sourceX/Y offset but blend their
 * luminance/color values with the texture of the destination area.
 *
 * The blend creates a seamless patch by:
 * 1. Sampling source pixels (from Alt+click point)
 * 2. Computing the luminance difference between source and destination
 * 3. Shifting the source colour to match destination luminance/colour tone
 *
 * This is a simplified (non-Poisson) healing that works well enough
 * for most practical retouching.
 */
export function applyHealingAtPoint(
  sourceCtx: CanvasRenderingContext2D,
  strokeCtx: CanvasRenderingContext2D,
  targetX: number,
  targetY: number,
  sourceOffsetX: number, // source = target + offset
  sourceOffsetY: number,
  size: number,
  hardness: number,
  opacity: number
): void {
  const half = size / 2;
  const patchW = Math.ceil(size);
  const patchH = Math.ceil(size);

  const cw = sourceCtx.canvas.width;
  const ch = sourceCtx.canvas.height;

  const destSx = Math.floor(targetX - half);
  const destSy = Math.floor(targetY - half);
  const clampedDX = Math.max(0, destSx);
  const clampedDY = Math.max(0, destSy);
  const clampedDW = Math.min(patchW - (clampedDX - destSx), cw - clampedDX);
  const clampedDH = Math.min(patchH - (clampedDY - destSy), ch - clampedDY);
  if (clampedDW <= 0 || clampedDH <= 0) return;

  // Destination (target area that will be healed)
  const dest = sourceCtx.getImageData(clampedDX, clampedDY, clampedDW, clampedDH);

  // Source (patch to copy texture from)
  const srcX = targetX + sourceOffsetX;
  const srcY = targetY + sourceOffsetY;
  const srcSx = Math.floor(srcX - half);
  const srcSy = Math.floor(srcY - half);
  const clampedSX = Math.max(0, srcSx);
  const clampedSY = Math.max(0, srcSy);
  const clampedSW = Math.min(patchW - (clampedSX - srcSx), cw - clampedSX);
  const clampedSH = Math.min(patchH - (clampedSY - srcSy), ch - clampedSY);
  if (clampedSW <= 0 || clampedSH <= 0) return;
  const src = sourceCtx.getImageData(clampedSX, clampedSY, clampedSW, clampedSH);

  const mask = createBrushMask(patchW, hardness);
  const result = new ImageData(new Uint8ClampedArray(dest.data), clampedDW, clampedDH);

  // Compute mean luminance of source and destination patches for colour matching
  let srcLumMean = 0, dstLumMean = 0, count = 0;
  for (let py = 0; py < clampedDH; py++) {
    for (let px = 0; px < clampedDW; px++) {
      const di = (py * clampedDW + px) * 4;
      dstLumMean += 0.299 * dest.data[di] + 0.587 * dest.data[di + 1] + 0.114 * dest.data[di + 2];

      const spx = Math.min(clampedSW - 1, px + (clampedDX - destSx) - (clampedSX - srcSx));
      const spy = Math.min(clampedSH - 1, py + (clampedDY - destSy) - (clampedSY - srcSy));
      if (spx >= 0 && spy >= 0) {
        const si = (spy * clampedSW + spx) * 4;
        srcLumMean += 0.299 * src.data[si] + 0.587 * src.data[si + 1] + 0.114 * src.data[si + 2];
        count++;
      }
    }
  }
  if (count > 0) { srcLumMean /= count; dstLumMean /= count; }
  const lumShift = dstLumMean - srcLumMean;

  for (let py = 0; py < clampedDH; py++) {
    for (let px = 0; px < clampedDW; px++) {
      const maskPx = px + (clampedDX - destSx);
      const maskPy = py + (clampedDY - destSy);
      const maskIdx = Math.min(mask.length - 1, maskPy * patchW + maskPx);
      const alpha = (mask[maskIdx] ?? 0) * (opacity / 100);
      if (alpha <= 0) continue;

      const di = (py * clampedDW + px) * 4;

      // Map to source patch position
      const spx = Math.min(clampedSW - 1, Math.max(0, maskPx - (clampedSX - srcSx)));
      const spy = Math.min(clampedSH - 1, Math.max(0, maskPy - (clampedSY - srcSy)));
      const si = (spy * clampedSW + spx) * 4;

      // Healed colour = source texture + luminance/colour shift toward destination
      const hr = Math.min(255, Math.max(0, src.data[si]     + lumShift));
      const hg = Math.min(255, Math.max(0, src.data[si + 1] + lumShift));
      const hb = Math.min(255, Math.max(0, src.data[si + 2] + lumShift));

      result.data[di]     = dest.data[di]     * (1 - alpha) + hr * alpha;
      result.data[di + 1] = dest.data[di + 1] * (1 - alpha) + hg * alpha;
      result.data[di + 2] = dest.data[di + 2] * (1 - alpha) + hb * alpha;
      result.data[di + 3] = 255;
    }
  }

  strokeCtx.putImageData(result, clampedDX, clampedDY);
}

/**
 * Spot Healing Brush: automatically samples surrounding pixels to
 * patch the target area. Uses average of a ring around the brush
 * as the source texture.
 */
export function applySpotHealingAtPoint(
  sourceCtx: CanvasRenderingContext2D,
  strokeCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  hardness: number,
  opacity: number
): void {
  const half = size / 2;
  const sampleMargin = Math.ceil(size * 0.5); // sample ring outside brush
  const patchW = Math.ceil(size);
  const patchH = Math.ceil(size);

  const cw = sourceCtx.canvas.width;
  const ch = sourceCtx.canvas.height;

  const sx = Math.floor(x - half);
  const sy = Math.floor(y - half);
  const clampedX = Math.max(0, sx);
  const clampedY = Math.max(0, sy);
  const clampedW = Math.min(patchW - (clampedX - sx), cw - clampedX);
  const clampedH = Math.min(patchH - (clampedY - sy), ch - clampedY);
  if (clampedW <= 0 || clampedH <= 0) return;

  const dest = sourceCtx.getImageData(clampedX, clampedY, clampedW, clampedH);

  // Sample surrounding ring for average colour/texture
  const outerSx = Math.max(0, sx - sampleMargin);
  const outerSy = Math.max(0, sy - sampleMargin);
  const outerW = Math.min(patchW + sampleMargin * 2, cw - outerSx);
  const outerH = Math.min(patchH + sampleMargin * 2, ch - outerSy);
  const outer = outerW > 0 && outerH > 0
    ? sourceCtx.getImageData(outerSx, outerSy, outerW, outerH)
    : null;

  const mask = createBrushMask(patchW, hardness);
  const result = new ImageData(new Uint8ClampedArray(dest.data), clampedW, clampedH);

  // Compute mean of surrounding ring
  let rMean = 0, gMean = 0, bMean = 0, ringCount = 0;
  if (outer) {
    // Use the outer border pixels of the outer patch as the sample ring
    for (let py = 0; py < outerH; py++) {
      for (let px = 0; px < outerW; px++) {
        // Only consider pixels outside the inner brush area
        const innerX = px - sampleMargin + (clampedX - outerSx);
        const innerY = py - sampleMargin + (clampedY - outerSy);
        if (innerX >= 0 && innerX < clampedW && innerY >= 0 && innerY < clampedH) continue;

        const oi = (py * outerW + px) * 4;
        rMean += outer.data[oi]; gMean += outer.data[oi + 1]; bMean += outer.data[oi + 2];
        ringCount++;
      }
    }
    if (ringCount > 0) { rMean /= ringCount; gMean /= ringCount; bMean /= ringCount; }
  } else {
    // fallback: grey
    rMean = gMean = bMean = 128;
  }

  for (let py = 0; py < clampedH; py++) {
    for (let px = 0; px < clampedW; px++) {
      const maskPx = px + (clampedX - sx);
      const maskPy = py + (clampedY - sy);
      const maskIdx = Math.min(mask.length - 1, maskPy * patchW + maskPx);
      const alpha = (mask[maskIdx] ?? 0) * (opacity / 100);
      if (alpha <= 0) continue;

      const di = (py * clampedW + px) * 4;

      // Add subtle texture variation to avoid flat colour
      const texNoise = (Math.random() - 0.5) * 8;
      result.data[di]     = Math.min(255, Math.max(0, dest.data[di]     * (1 - alpha) + (rMean + texNoise) * alpha));
      result.data[di + 1] = Math.min(255, Math.max(0, dest.data[di + 1] * (1 - alpha) + (gMean + texNoise) * alpha));
      result.data[di + 2] = Math.min(255, Math.max(0, dest.data[di + 2] * (1 - alpha) + (bMean + texNoise) * alpha));
      result.data[di + 3] = 255;
    }
  }

  strokeCtx.putImageData(result, clampedX, clampedY);
}

// ==================== Color Replacement Tool ====================

/**
 * Replace colors similar to the sampled color with the foreground color,
 * preserving luminosity of the original pixel.
 */
export function applyColorReplacementAtPoint(
  sourceCtx: CanvasRenderingContext2D,
  strokeCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  hardness: number,
  tolerance: number,
  targetColor: { r: number; g: number; b: number },
  replaceColor: { r: number; g: number; b: number }
): void {
  const half = Math.ceil(size / 2);
  const clampedX = Math.max(0, Math.floor(x - half));
  const clampedY = Math.max(0, Math.floor(y - half));
  const w = Math.min(size, sourceCtx.canvas.width - clampedX);
  const h = Math.min(size, sourceCtx.canvas.height - clampedY);
  if (w <= 0 || h <= 0) return;

  const source = sourceCtx.getImageData(clampedX, clampedY, w, h);
  const result = new ImageData(w, h);
  const mask = createBrushMask(size, hardness);
  const cx = x - clampedX;
  const cy = y - clampedY;
  const tol3 = tolerance * 3;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const dx = px - cx, dy = py - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maskIdx = Math.floor(py / h * size) * size + Math.floor(px / w * size);
      const alpha = dist <= half ? (mask[maskIdx] || 0) : 0;

      const sr = source.data[i], sg = source.data[i + 1], sb = source.data[i + 2];
      const colorDiff = Math.abs(sr - targetColor.r) + Math.abs(sg - targetColor.g) + Math.abs(sb - targetColor.b);

      if (colorDiff <= tol3 && alpha > 0) {
        const lum = 0.299 * sr + 0.587 * sg + 0.114 * sb;
        const repLum = 0.299 * replaceColor.r + 0.587 * replaceColor.g + 0.114 * replaceColor.b;
        const ratio = repLum > 0 ? lum / repLum : 1;
        result.data[i] = Math.min(255, replaceColor.r * ratio * alpha + sr * (1 - alpha));
        result.data[i + 1] = Math.min(255, replaceColor.g * ratio * alpha + sg * (1 - alpha));
        result.data[i + 2] = Math.min(255, replaceColor.b * ratio * alpha + sb * (1 - alpha));
      } else {
        result.data[i] = sr; result.data[i + 1] = sg; result.data[i + 2] = sb;
      }
      result.data[i + 3] = source.data[i + 3];
    }
  }
  strokeCtx.putImageData(result, clampedX, clampedY);
}

// ==================== Pattern Stamp Tool ====================

/**
 * Stamp a repeating pattern onto the canvas, tiled from the pattern image.
 */
export function renderPatternStamp(
  patternCanvas: HTMLCanvasElement,
  targetCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  hardness: number,
  opacity: number,
  scale: number = 100
): void {
  const half = Math.ceil(size / 2);
  const patternCtx = patternCanvas.getContext('2d', { willReadFrequently: true });
  if (!patternCtx) return;

  const pw = patternCanvas.width;
  const ph = patternCanvas.height;
  const patternData = patternCtx.getImageData(0, 0, pw, ph);
  const scaleFactor = scale / 100;

  const clampedX = Math.max(0, Math.floor(x - half));
  const clampedY = Math.max(0, Math.floor(y - half));
  const w = Math.min(size, targetCtx.canvas.width - clampedX);
  const h = Math.min(size, targetCtx.canvas.height - clampedY);
  if (w <= 0 || h <= 0) return;

  const dest = targetCtx.getImageData(clampedX, clampedY, w, h);
  const result = new ImageData(w, h);
  const mask = createBrushMask(size, hardness);

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const di = (py * w + px) * 4;
      const dx = px - (x - clampedX), dy = py - (y - clampedY);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maskIdx = Math.floor(py / h * size) * size + Math.floor(px / w * size);
      const alpha = dist <= half ? (mask[maskIdx] || 0) * opacity : 0;

      const patX = Math.floor(((clampedX + px) / scaleFactor) % pw + pw) % pw;
      const patY = Math.floor(((clampedY + py) / scaleFactor) % ph + ph) % ph;
      const pi = (patY * pw + patX) * 4;

      result.data[di] = Math.min(255, patternData.data[pi] * alpha + dest.data[di] * (1 - alpha));
      result.data[di + 1] = Math.min(255, patternData.data[pi + 1] * alpha + dest.data[di + 1] * (1 - alpha));
      result.data[di + 2] = Math.min(255, patternData.data[pi + 2] * alpha + dest.data[di + 2] * (1 - alpha));
      result.data[di + 3] = 255;
    }
  }
  targetCtx.putImageData(result, clampedX, clampedY);
}

// ==================== History Brush Tool ====================

/**
 * Paint from a history snapshot state, restoring pixels from a previous version.
 */
export function applyHistoryBrushAtPoint(
  historyCtx: CanvasRenderingContext2D,
  strokeCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  hardness: number,
  opacity: number
): void {
  const half = Math.ceil(size / 2);
  const clampedX = Math.max(0, Math.floor(x - half));
  const clampedY = Math.max(0, Math.floor(y - half));
  const w = Math.min(size, strokeCtx.canvas.width - clampedX);
  const h = Math.min(size, strokeCtx.canvas.height - clampedY);
  if (w <= 0 || h <= 0) return;

  const history = historyCtx.getImageData(clampedX, clampedY, w, h);
  const dest = strokeCtx.getImageData(clampedX, clampedY, w, h);
  const result = new ImageData(w, h);
  const mask = createBrushMask(size, hardness);

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const dx = px - (x - clampedX), dy = py - (y - clampedY);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maskIdx = Math.floor(py / h * size) * size + Math.floor(px / w * size);
      const alpha = dist <= half ? (mask[maskIdx] || 0) * opacity : 0;

      result.data[i] = history.data[i] * alpha + dest.data[i] * (1 - alpha);
      result.data[i + 1] = history.data[i + 1] * alpha + dest.data[i + 1] * (1 - alpha);
      result.data[i + 2] = history.data[i + 2] * alpha + dest.data[i + 2] * (1 - alpha);
      result.data[i + 3] = 255;
    }
  }
  strokeCtx.putImageData(result, clampedX, clampedY);
}

// ==================== Art History Brush Tool ====================

/**
 * Paint stylized strokes from a history snapshot, creating impressionistic effects.
 */
export function applyArtHistoryBrushAtPoint(
  historyCtx: CanvasRenderingContext2D,
  strokeCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  _hardness: number,
  opacity: number,
  style: 'tight-short' | 'tight-medium' | 'tight-long' | 'loose-medium' | 'loose-long' | 'dab' = 'tight-short'
): void {
  const half = Math.ceil(size / 2);
  const clampedX = Math.max(0, Math.floor(x - half));
  const clampedY = Math.max(0, Math.floor(y - half));
  const w = Math.min(size, strokeCtx.canvas.width - clampedX);
  const h = Math.min(size, strokeCtx.canvas.height - clampedY);
  if (w <= 0 || h <= 0) return;

  const history = historyCtx.getImageData(clampedX, clampedY, w, h);
  const dest = strokeCtx.getImageData(clampedX, clampedY, w, h);
  const result = new ImageData(new Uint8ClampedArray(dest.data), w, h);

  const strokeLen = style.includes('short') ? 2 : style.includes('medium') ? 5 : 10;
  const jitter = style.includes('loose') ? 0.5 : style.includes('dab') ? 0.8 : 0.15;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const dx = px - (x - clampedX), dy = py - (y - clampedY);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > half) continue;

      const jx = Math.max(0, Math.min(w - 1, Math.floor(px + (Math.random() - 0.5) * strokeLen * jitter)));
      const jy = Math.max(0, Math.min(h - 1, Math.floor(py + (Math.random() - 0.5) * strokeLen * jitter)));

      const si = (jy * w + jx) * 4;
      const di = (py * w + px) * 4;
      const falloff = 1 - dist / half;
      const alpha = falloff * opacity * (1 - jitter * 0.5);

      result.data[di] = history.data[si] * alpha + dest.data[di] * (1 - alpha);
      result.data[di + 1] = history.data[si + 1] * alpha + dest.data[di + 1] * (1 - alpha);
      result.data[di + 2] = history.data[si + 2] * alpha + dest.data[di + 2] * (1 - alpha);
      result.data[di + 3] = 255;
    }
  }
  strokeCtx.putImageData(result, clampedX, clampedY);
}

// ==================== Background Eraser Tool ====================

/**
 * Erase pixels similar to the sampled background color, setting them to transparent.
 */
export function applyBackgroundEraserAtPoint(
  sourceCtx: CanvasRenderingContext2D,
  strokeCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  hardness: number,
  tolerance: number,
  sampleColor: { r: number; g: number; b: number }
): void {
  const half = Math.ceil(size / 2);
  const clampedX = Math.max(0, Math.floor(x - half));
  const clampedY = Math.max(0, Math.floor(y - half));
  const w = Math.min(size, sourceCtx.canvas.width - clampedX);
  const h = Math.min(size, sourceCtx.canvas.height - clampedY);
  if (w <= 0 || h <= 0) return;

  const source = sourceCtx.getImageData(clampedX, clampedY, w, h);
  const result = new ImageData(w, h);
  const mask = createBrushMask(size, hardness);
  const tol3 = tolerance * 3;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const dx = px - (x - clampedX), dy = py - (y - clampedY);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maskIdx = Math.floor(py / h * size) * size + Math.floor(px / w * size);
      const brushAlpha = dist <= half ? (mask[maskIdx] || 0) : 0;

      const sr = source.data[i], sg = source.data[i + 1], sb = source.data[i + 2];
      const colorDiff = Math.abs(sr - sampleColor.r) + Math.abs(sg - sampleColor.g) + Math.abs(sb - sampleColor.b);

      if (colorDiff <= tol3 && brushAlpha > 0.1) {
        const eraseFactor = Math.min(1, (1 - colorDiff / tol3) * brushAlpha);
        result.data[i] = sr; result.data[i + 1] = sg; result.data[i + 2] = sb;
        result.data[i + 3] = Math.max(0, source.data[i + 3] * (1 - eraseFactor));
      } else {
        result.data[i] = sr; result.data[i + 1] = sg; result.data[i + 2] = sb;
        result.data[i + 3] = source.data[i + 3];
      }
    }
  }
  strokeCtx.putImageData(result, clampedX, clampedY);
}

// ==================== Magic Eraser Tool ====================

/**
 * Erase contiguous pixels similar to the clicked pixel (flood-fill based erase).
 */
export function applyMagicEraser(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tolerance: number,
  width: number,
  height: number,
  contiguous: boolean = true
): ImageData {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const startIdx = (Math.floor(y) * width + Math.floor(x)) * 4;
  const startR = data[startIdx], startG = data[startIdx + 1], startB = data[startIdx + 2];

  if (contiguous) {
    const visited = new Uint8Array(width * height);
    const stack: number[] = [Math.floor(x), Math.floor(y)];

    while (stack.length > 0) {
      const py = stack.pop()!;
      const px = stack.pop()!;
      if (px < 0 || px >= width || py < 0 || py >= height) continue;
      const pidx = py * width + px;
      if (visited[pidx]) continue;
      const idx = pidx * 4;
      if (Math.abs(data[idx] - startR) + Math.abs(data[idx + 1] - startG) + Math.abs(data[idx + 2] - startB) > tolerance * 3) continue;
      visited[pidx] = 1;
      data[idx + 3] = 0;
      stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
    }
  } else {
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - startR) + Math.abs(data[i + 1] - startG) + Math.abs(data[i + 2] - startB) <= tolerance * 3) {
        data[i + 3] = 0;
      }
    }
  }
  return imageData;
}

// ==================== Red Eye Removal Tool ====================

/**
 * Detect and remove red-eye effect in the clicked area.
 */
export function applyRedEyeRemoval(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  darken: number = 50
): void {
  const half = Math.ceil(size / 2);
  const clampedX = Math.max(0, Math.floor(x - half));
  const clampedY = Math.max(0, Math.floor(y - half));
  const w = Math.min(size, ctx.canvas.width - clampedX);
  const h = Math.min(size, ctx.canvas.height - clampedY);
  if (w <= 0 || h <= 0) return;

  const imageData = ctx.getImageData(clampedX, clampedY, w, h);
  const data = imageData.data;
  const darkenFactor = darken / 100;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const dx = px - w / 2, dy = py - h / 2;
      if (dx * dx + dy * dy > half * half) continue;

      const i = (py * w + px) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];

      const isRed = r > 80 && r > g * 1.5 && r > b * 1.5;
      if (isRed) {
        const avg = (g + b) / 2;
        data[i] = avg * (1 - darkenFactor);
        data[i + 1] = g * (1 - darkenFactor * 0.2);
        data[i + 2] = b * (1 - darkenFactor * 0.2);
      }
    }
  }
  ctx.putImageData(imageData, clampedX, clampedY);
}

// ==================== Reflected Gradient ====================

/**
 * Render a reflected gradient (mirrors the gradient on both sides of the start point).
 */
export function renderReflectedGradient(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color1: string,
  color2: string,
  opacity: number = 1
): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);

  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;

  const ux = dx / len, uy = dy / len;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x - x1, py = y - y1;
      const proj = px * ux + py * uy;
      const t = Math.min(1, Math.abs(proj) / len);

      const i = (y * width + x) * 4;
      const r = c1.r + (c2.r - c1.r) * t;
      const g = c1.g + (c2.g - c1.g) * t;
      const b = c1.b + (c2.b - c1.b) * t;

      data[i] = data[i] * (1 - opacity) + r * opacity;
      data[i + 1] = data[i + 1] * (1 - opacity) + g * opacity;
      data[i + 2] = data[i + 2] * (1 - opacity) + b * opacity;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

// ==================== Bucket Fill Tool ====================

/**
 * Flood fill implementation (uses separate floodFill.ts for the algorithm)
 */
export function renderBucketFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fillColor: string,
  tolerance: number,
  width: number,
  height: number
): ImageData {
  const imageData = ctx.getImageData(0, 0, width, height);
  const { r: fillR, g: fillG, b: fillB } = hexToRgb(fillColor);

  const startIdx = (Math.floor(y) * width + Math.floor(x)) * 4;
  const startR = imageData.data[startIdx];
  const startG = imageData.data[startIdx + 1];
  const startB = imageData.data[startIdx + 2];
  const startA = imageData.data[startIdx + 3];

  // If clicking on the same color, do nothing
  if (
    Math.abs(startR - fillR) < tolerance &&
    Math.abs(startG - fillG) < tolerance &&
    Math.abs(startB - fillB) < tolerance
  ) {
    return imageData;
  }

  const visited = new Uint8Array(width * height);
  const stack: number[] = [Math.floor(x), Math.floor(y)];

  const matchesStart = (idx: number) => {
    return (
      Math.abs(imageData.data[idx] - startR) <= tolerance &&
      Math.abs(imageData.data[idx + 1] - startG) <= tolerance &&
      Math.abs(imageData.data[idx + 2] - startB) <= tolerance &&
      Math.abs(imageData.data[idx + 3] - startA) <= tolerance
    );
  };

  while (stack.length > 0) {
    const py = stack.pop()!;
    const px = stack.pop()!;

    if (px < 0 || px >= width || py < 0 || py >= height) continue;

    const pixelIdx = py * width + px;
    if (visited[pixelIdx]) continue;

    const idx = pixelIdx * 4;
    if (!matchesStart(idx)) continue;

    visited[pixelIdx] = 1;

    imageData.data[idx] = fillR;
    imageData.data[idx + 1] = fillG;
    imageData.data[idx + 2] = fillB;
    imageData.data[idx + 3] = 255;

    stack.push(px + 1, py);
    stack.push(px - 1, py);
    stack.push(px, py + 1);
    stack.push(px, py - 1);
  }

  return imageData;
}
