/**
 * Stylize (Advanced) — video effect definitions.
 *
 * Pure data consumed by the effects panel (renderer) and the FFmpeg export
 * pipeline (Electron main). Add a new effect by appending an entry here;
 * give transitions an `xfade` name so the export pipeline can render them.
 * Optional per-effect icons go in components/effectIcons.ts.
 */

import type { VideoEffectCategory } from '../types';

export const stylizeAdvancedCategory: VideoEffectCategory = {
  key: 'stylizeAdvanced',
  name: 'Stylize (Advanced)',
  effects: [
    {
      id: 'color-emboss',
      name: 'Color Emboss',
      type: 'filter',
      description: 'Color emboss effect',
      defaultParams: { direction: 135, relief: 2, contrast: 100 },
    },
  ],
};
