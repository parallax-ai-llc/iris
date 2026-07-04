/**
 * Utility — video effect definitions.
 *
 * Pure data consumed by the effects panel (renderer) and the FFmpeg export
 * pipeline (Electron main). Add a new effect by appending an entry here;
 * give transitions an `xfade` name so the export pipeline can render them.
 * Optional per-effect icons go in components/effectIcons.ts.
 */

import type { VideoEffectCategory } from '../types';

export const utilityCategory: VideoEffectCategory = {
  key: 'utility',
  name: 'Utility',
  effects: [
    {
      id: 'crop-effect',
      name: 'Crop',
      type: 'filter',
      description: 'Crop (top/bottom/left/right %)',
      defaultParams: { top: 0, bottom: 0, left: 0, right: 0 },
    },
    {
      id: 'edge-feather',
      name: 'Edge Feather',
      type: 'filter',
      description: 'Edge feathering',
      defaultParams: { amount: 10 },
    },
  ],
};
