/**
 * Noise & Grain — video effect definitions.
 *
 * Pure data consumed by the effects panel (renderer) and the FFmpeg export
 * pipeline (Electron main). Add a new effect by appending an entry here;
 * give transitions an `xfade` name so the export pipeline can render them.
 * Optional per-effect icons go in components/effectIcons.ts.
 */

import type { VideoEffectCategory } from '../types';

export const noiseGrainCategory: VideoEffectCategory = {
  key: 'noiseGrain',
  name: 'Noise & Grain',
  effects: [
    {
      id: 'dust-and-scratches',
      name: 'Dust & Scratches',
      type: 'filter',
      description: 'Remove dust and scratch artifacts',
      defaultParams: { radius: 1, threshold: 6 },
    },
    {
      id: 'median',
      name: 'Median',
      type: 'filter',
      description: 'Median noise reduction',
      defaultParams: { radius: 2 },
    },
    {
      id: 'noise-hls',
      name: 'Noise HLS',
      type: 'filter',
      description: 'HLS channel-specific noise',
      defaultParams: { hueNoise: 0, lightnessNoise: 0, saturationNoise: 0 },
    },
    {
      id: 'noise-alpha',
      name: 'Noise Alpha',
      type: 'filter',
      description: 'Alpha channel noise',
      defaultParams: { amount: 50, type: 'uniform' },
    },
    {
      id: 'reduce-interlace-flicker',
      name: 'Reduce Interlace Flicker',
      type: 'filter',
      description: 'Reduce interlace flicker artifacts',
      defaultParams: { softness: 50 },
    },
  ],
};
