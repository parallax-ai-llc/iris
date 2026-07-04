/**
 * Transform Effects — video effect definitions.
 *
 * Pure data consumed by the effects panel (renderer) and the FFmpeg export
 * pipeline (Electron main). Add a new effect by appending an entry here;
 * give transitions an `xfade` name so the export pipeline can render them.
 * Optional per-effect icons go in components/effectIcons.ts.
 */

import type { VideoEffectCategory } from '../types';

export const transformEffectsCategory: VideoEffectCategory = {
  key: 'transformEffects',
  name: 'Transform Effects',
  effects: [
    {
      id: 'horizontal-flip',
      name: 'Horizontal Flip',
      type: 'filter',
      description: 'Flip horizontally',
      defaultParams: {},
    },
    {
      id: 'vertical-flip',
      name: 'Vertical Flip',
      type: 'filter',
      description: 'Flip vertically',
      defaultParams: {},
    },
    {
      id: 'flicker-removal',
      name: 'Flicker Removal',
      type: 'filter',
      description: 'Remove flicker artifacts',
      defaultParams: { strength: 50 },
    },
    {
      id: 'replicate',
      name: 'Replicate',
      type: 'filter',
      description: 'Tile replicate effect',
      defaultParams: { count: 4 },
    },
  ],
};
