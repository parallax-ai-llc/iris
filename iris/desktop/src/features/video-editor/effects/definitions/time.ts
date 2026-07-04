/**
 * Time — video effect definitions.
 *
 * Pure data consumed by the effects panel (renderer) and the FFmpeg export
 * pipeline (Electron main). Add a new effect by appending an entry here;
 * give transitions an `xfade` name so the export pipeline can render them.
 * Optional per-effect icons go in components/effectIcons.ts.
 */

import type { VideoEffectCategory } from '../types';

export const timeCategory: VideoEffectCategory = {
  key: 'time',
  name: 'Time',
  effects: [
    {
      id: 'posterize-time',
      name: 'Posterize Time',
      type: 'filter',
      description: 'Reduce frame rate for stop-motion effect',
      defaultParams: { frameRate: 12 },
    },
  ],
};
