/**
 * Video effect registry.
 *
 * Composes the per-category definition modules into ordered lists and lookup
 * tables. Consumed by the effects panel (renderer) and, through XFADE_MAP /
 * getDefaultFilterIntensity, by the FFmpeg export pipeline (Electron main).
 * Adding an effect never requires touching this file unless a whole new
 * category module is introduced.
 */

import type { VideoEffectCategory, VideoEffectDefinition } from './types';
import { transitionsCategory } from './definitions/transitions';
import { colorCorrectionCategory } from './definitions/color-correction';
import { stylizeCategory } from './definitions/stylize';
import { sharpenBlurCategory } from './definitions/sharpen-blur';
import { generateCategory } from './definitions/generate';
import { distortCategory } from './definitions/distort';
import { perspectiveCategory } from './definitions/perspective';
import { keyingCategory } from './definitions/keying';
import { timeCategory } from './definitions/time';
import { utilityCategory } from './definitions/utility';
import { transitionStyleCategory } from './definitions/transition-style';
import { transformEffectsCategory } from './definitions/transform-effects';
import { audioCategory } from './definitions/audio';
import { adjustCategory } from './definitions/adjust';
import { colorCorrectionAdvancedCategory } from './definitions/color-correction-advanced';
import { channelCategory } from './definitions/channel';
import { noiseGrainCategory } from './definitions/noise-grain';
import { stylizeAdvancedCategory } from './definitions/stylize-advanced';
import { utilityAdvancedCategory } from './definitions/utility-advanced';
import { vrImmersiveCategory } from './definitions/vr-immersive';

/** Panel display order. */
export const EFFECT_CATEGORY_DEFINITIONS: VideoEffectCategory[] = [
  transitionsCategory,
  colorCorrectionCategory,
  stylizeCategory,
  sharpenBlurCategory,
  generateCategory,
  distortCategory,
  perspectiveCategory,
  keyingCategory,
  timeCategory,
  utilityCategory,
  transitionStyleCategory,
  transformEffectsCategory,
  audioCategory,
  adjustCategory,
  colorCorrectionAdvancedCategory,
  channelCategory,
  noiseGrainCategory,
  stylizeAdvancedCategory,
  utilityAdvancedCategory,
  vrImmersiveCategory,
];

export const ALL_VIDEO_EFFECTS: VideoEffectDefinition[] =
  EFFECT_CATEGORY_DEFINITIONS.flatMap((c) => c.effects);

const EFFECTS_BY_ID = new Map(ALL_VIDEO_EFFECTS.map((e) => [e.id, e]));

/**
 * transitionType values that reach the export pipeline but are not panel
 * definition ids (legacy/persisted aliases). Kept for project compatibility.
 */
const XFADE_ALIASES: Record<string, string> = {
  'blur': 'hblur',
  'iris': 'circlecrop',
  'linear-wipe': 'wipeleft',
};

/** transitionType → FFmpeg xfade name (definition `xfade` fields + aliases). */
export const XFADE_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = { ...XFADE_ALIASES };
  for (const e of ALL_VIDEO_EFFECTS) {
    if (e.xfade) map[e.id] = e.xfade;
  }
  return map;
})();

/** Default filter intensity applied when a filter effect is inserted. */
export function getDefaultFilterIntensity(id: string): number {
  return EFFECTS_BY_ID.get(id)?.defaultIntensity ?? 50;
}
