/**
 * Channel — video effect definitions.
 *
 * Pure data consumed by the effects panel (renderer) and the FFmpeg export
 * pipeline (Electron main). Add a new effect by appending an entry here;
 * give transitions an `xfade` name so the export pipeline can render them.
 * Optional per-effect icons go in components/effectIcons.ts.
 */

import type { VideoEffectCategory } from '../types';

export const channelCategory: VideoEffectCategory = {
  key: 'channel',
  name: 'Channel',
  effects: [
    {
      id: 'arithmetic',
      name: 'Arithmetic',
      type: 'filter',
      description: 'Per-channel math operations (Add/Subtract/Multiply)',
      defaultParams: { operator: 'add', redValue: 0, greenValue: 0, blueValue: 0 },
    },
    {
      id: 'calculations',
      name: 'Calculations',
      type: 'filter',
      description: 'Inter-channel math operations',
      defaultParams: { sourceChannel: 'red', targetChannel: 'green', operator: 'add' },
    },
    {
      id: 'solid-composite',
      name: 'Solid Composite',
      type: 'filter',
      description: 'Solid color composite overlay',
      defaultParams: { color: '#000000', opacity: 50, blendMode: 'normal' },
    },
    {
      id: 'black-and-white',
      name: 'Black & White',
      type: 'filter',
      description: 'Advanced B&W conversion with channel weights',
      defaultParams: { red: 40, green: 40, blue: 20 },
    },
    {
      id: 'color-balance-rgb',
      name: 'Color Balance (RGB)',
      type: 'filter',
      description: 'RGB color balance',
      defaultParams: { redBalance: 0, greenBalance: 0, blueBalance: 0 },
    },
  ],
};
