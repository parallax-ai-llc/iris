/**
 * Keying — video effect definitions.
 *
 * Pure data consumed by the effects panel (renderer) and the FFmpeg export
 * pipeline (Electron main). Add a new effect by appending an entry here;
 * give transitions an `xfade` name so the export pipeline can render them.
 * Optional per-effect icons go in components/effectIcons.ts.
 */

import type { VideoEffectCategory } from '../types';

export const keyingCategory: VideoEffectCategory = {
  key: 'keying',
  name: 'Keying',
  effects: [
    {
      id: 'luma-key',
      name: 'Luma Key',
      type: 'filter',
      description: 'Key out pixels based on luminance (brightness)',
      defaultParams: { filterType: 'luma-key', threshold: 50, tolerance: 20, softness: 10, },
    },
    {
      id: 'color-key',
      name: 'Color Key',
      type: 'filter',
      description: 'Simple color keying',
      defaultParams: { color: '#00ff00', tolerance: 30 },
    },
    {
      id: 'non-red-key',
      name: 'Non Red Key',
      type: 'filter',
      description: 'Non-red channel keying',
      defaultParams: { threshold: 30 },
    },
    {
      id: 'ultra-key',
      name: 'Ultra Key',
      type: 'filter',
      description: 'Advanced chroma key (green/blue screen) with spill suppression',
      defaultParams: { keyColor: '#00ff00', tolerance: 50, pedestal: 10, spillSuppression: 50 },
    },
  ],
};
