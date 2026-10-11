/**
 * Gradient tool (G): colour stops and the rendered gradient of one drag.
 *
 * Like Photoshop, the gradient runs from the foreground to the background
 * colour until the user picks custom stops in the options bar
 * (`colorSource: 'custom'`). `reverse` swaps the ends.
 */

import {
  renderAngularGradient,
  renderDiamondGradient,
  renderLinearGradient,
  renderRadialGradient,
  type GradientColorStop,
  type Point,
} from '@/features/image-editor/canvas/brushEngine';
import { createOffscreenCanvas } from '@/features/image-editor/canvas/canvasEngine';
import type { GradientSettings } from '@/features/image-editor/stores/imageEditor.store';

/** The stops the next gradient drag uses. */
export function resolveGradientStops(
  settings: Pick<GradientSettings, 'colorStops' | 'reverse' | 'colorSource'>,
  foreground: string,
  background: string,
): GradientColorStop[] {
  const custom = settings.colorSource === 'custom' && settings.colorStops.length >= 2;
  const stops = custom
    ? settings.colorStops.map((s) => ({ ...s }))
    : [
        { offset: 0, color: foreground },
        { offset: 1, color: background },
      ];
  if (!settings.reverse) return stops;
  return stops.map((s) => ({ offset: 1 - s.offset, color: s.color })).sort((a, b) => a.offset - b.offset);
}

/**
 * Render the gradient of a drag from `start` to `end` on a document-sized,
 * transparent canvas (the stroke that is committed to the active layer).
 */
export function renderGradientDrag(
  settings: GradientSettings,
  foreground: string,
  background: string,
  start: Point,
  end: Point,
  width: number,
  height: number,
): HTMLCanvasElement {
  const { canvas, ctx } = createOffscreenCanvas(width, height, true);
  const stops = resolveGradientStops(settings, foreground, background);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  switch (settings.type) {
    case 'radial':
      renderRadialGradient(ctx, start.x, start.y, distance, stops, width, height);
      break;
    case 'angular':
      renderAngularGradient(ctx, start.x, start.y, Math.atan2(dy, dx), stops, width, height);
      break;
    case 'diamond':
      renderDiamondGradient(ctx, start.x, start.y, distance, stops, width, height);
      break;
    default:
      // 'linear' and 'reflected' (no dedicated renderer yet)
      renderLinearGradient(ctx, start.x, start.y, end.x, end.y, stops, width, height);
  }
  return canvas;
}
