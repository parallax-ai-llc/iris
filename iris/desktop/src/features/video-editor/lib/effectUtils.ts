/**
 * Shared utilities for video editor effects.
 *
 * Lives in the video-editor feature (its only consumers) and reads default
 * intensities from the effect registry, so a new filter's default is declared
 * once in its definition module.
 */

import type { ClipEffect } from '@/types/videoProject.types';
import type { VideoEffectDefinition } from '../effects/types';
import { getDefaultFilterIntensity } from '../effects/registry';

/**
 * Create a ClipEffect from an effect definition (panel item).
 * Used when applying effects via click or drag-drop.
 */
export function createClipEffectFromDefinition(effect: VideoEffectDefinition): ClipEffect {
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
    filterType: effect.type === 'filter' ? (effect.id as ClipEffect['filterType']) : undefined,
    filterIntensity: effect.type === 'filter'
      ? getDefaultFilterIntensity(effect.id)
      : undefined,
    transitionType: effect.type === 'transition' ? (transitionType as ClipEffect['transitionType']) : undefined,
    transitionDuration: effect.defaultParams?.duration ?? 0.5,
    transitionPosition,
    audioEffectType: effect.type === 'audio-effect' ? (effect.id as ClipEffect['audioEffectType']) : undefined,
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
