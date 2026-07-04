/**
 * Perspective — video effect definitions.
 *
 * Pure data consumed by the effects panel (renderer) and the FFmpeg export
 * pipeline (Electron main). Add a new effect by appending an entry here;
 * give transitions an `xfade` name so the export pipeline can render them.
 * Optional per-effect icons go in components/effectIcons.ts.
 */

import type { VideoEffectCategory } from '../types';

export const perspectiveCategory: VideoEffectCategory = {
  key: 'perspective',
  name: 'Perspective',
  effects: [
    {
      id: 'basic-3d',
      name: 'Basic 3D',
      type: 'filter',
      description: '3D tilt/swivel effect',
      defaultParams: { tilt: 0, swivel: 0, distance: 0 },
    },
    {
      id: 'drop-shadow',
      name: 'Drop Shadow',
      type: 'filter',
      description: 'Drop shadow effect',
      defaultParams: { distance: 5, direction: 135, softness: 5, opacity: 50 },
    },
  ],
};
