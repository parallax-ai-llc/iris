/**
 * Shared utilities for video editor effects
 */

import type { ClipEffect } from '@/types/videoProject.types';
import type { EffectDefinition } from '@/features/video-editor/components/EffectsPanel';

const FILTER_DEFAULTS: Record<string, number> = {
  brightness: 20,
  contrast: 20,
  saturation: 30,
  hue: 30,
  blur: 5,
  sepia: 100,
  grayscale: 100,
  invert: 100,
  vignette: 50,
};

/**
 * Create a ClipEffect from an EffectDefinition (panel item).
 * Used when applying effects via click or drag-drop.
 */
export function createClipEffectFromDefinition(effect: EffectDefinition): ClipEffect {
  // For transitions like fade-in/fade-out, extract the base transition type
  let transitionType = effect.type === 'transition' ? effect.id : undefined;
  const transitionPosition = effect.defaultParams?.transitionPosition as 'start' | 'end' | 'both' | undefined;

  // fade-in / fade-out share transitionType 'fade'
  if (transitionType === 'fade-in' || transitionType === 'fade-out') {
    transitionType = 'fade';
  }

  return {
    id: `fx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    type: effect.type,
    name: effect.name,
    enabled: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filterType: effect.type === 'filter' ? (effect.id as any) : undefined,
    filterIntensity: effect.type === 'filter'
      ? (FILTER_DEFAULTS[effect.id] ?? 50)
      : undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transitionType: effect.type === 'transition' ? (transitionType as any) : undefined,
    transitionDuration: effect.defaultParams?.duration ?? 0.5,
    transitionPosition,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    audioEffectType: effect.type === 'audio-effect' ? (effect.id as any) : undefined,
    audioParams: effect.type === 'audio-effect' ? effect.defaultParams : undefined,
    keyframes: [],
  };
}

/**
 * Derive the effect definition ID from a ClipEffect instance.
 * Maps back: fade + position:'start' → 'fade-in', fade + position:'end' → 'fade-out'
 */
export function getEffectDefId(e: ClipEffect): string {
  if (e.transitionType === 'fade' && e.transitionPosition === 'start') return 'fade-in';
  if (e.transitionType === 'fade' && e.transitionPosition === 'end') return 'fade-out';
  return e.filterType || e.transitionType || e.audioEffectType || e.id;
}
