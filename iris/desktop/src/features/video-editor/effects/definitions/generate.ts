/**
 * Generate — video effect definitions.
 *
 * Pure data consumed by the effects panel (renderer) and the FFmpeg export
 * pipeline (Electron main). Add a new effect by appending an entry here;
 * give transitions an `xfade` name so the export pipeline can render them.
 * Optional per-effect icons go in components/effectIcons.ts.
 */

import type { VideoEffectCategory } from '../types';

export const generateCategory: VideoEffectCategory = {
  key: 'generate',
  name: 'Generate',
  effects: [
    {
      id: 'grid-generate',
      name: 'Grid',
      type: 'filter',
      description: 'Grid overlay generator',
      defaultParams: { sizeX: 50, sizeY: 50, lineWidth: 1 },
    },
  ],
};
