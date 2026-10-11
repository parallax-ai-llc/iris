/**
 * Video filter strings for ClipEffect[] type='filter'.
 *
 * The per-effect FFmpeg mappings live in two group modules (moved verbatim
 * from electron/ipc/export.ts); this dispatcher tries each group in turn.
 */

import type { ExportClip } from './types';
import { pushBasicEffectFilter } from './video-effect-filters-basic';
import { pushGradingEffectFilter } from './video-effect-filters-grading';

export function buildEffectFilters(effects: ExportClip['effects']): string[] {
  if (!effects) return [];
  const filters: string[] = [];
  for (const fx of effects) {
    if (!fx.enabled || fx.type !== 'filter') continue;
    const v = fx.filterIntensity ?? 50;
    if (pushBasicEffectFilter(fx, v, filters)) continue;
    if (pushGradingEffectFilter(fx, v, filters)) continue;
    // A filter definition without an FFmpeg mapping renders in the panel
    // and preview but would silently vanish from the export otherwise.
    console.warn(`[export] No FFmpeg mapping for filter effect '${fx.filterType}' — skipped`);
  }
  return filters;
}
