/**
 * Utility (Advanced) — video effect definitions.
 *
 * Pure data consumed by the effects panel (renderer) and the FFmpeg export
 * pipeline (Electron main). Add a new effect by appending an entry here;
 * give transitions an `xfade` name so the export pipeline can render them.
 * Optional per-effect icons go in components/effectIcons.ts.
 */

import type { VideoEffectCategory } from '../types';

export const utilityAdvancedCategory: VideoEffectCategory = {
  key: 'utilityAdvanced',
  name: 'Utility (Advanced)',
  effects: [
    {
      id: 'cineon-converter',
      name: 'Cineon Converter',
      type: 'filter',
      description: 'Cineon/DPX file conversion',
      defaultParams: { conversionType: 'linear-to-log' },
    },
    {
      id: 'sdr-conform',
      name: 'SDR Conform',
      type: 'filter',
      description: 'HDR to SDR conversion',
      defaultParams: { toneMapping: 'filmic', maxNits: 1000 },
    },
  ],
};
