/**
 * Stylize — video effect definitions.
 *
 * Pure data consumed by the effects panel (renderer) and the FFmpeg export
 * pipeline (Electron main). Add a new effect by appending an entry here;
 * give transitions an `xfade` name so the export pipeline can render them.
 * Optional per-effect icons go in components/effectIcons.ts.
 */

import type { VideoEffectCategory } from '../types';

export const stylizeCategory: VideoEffectCategory = {
  key: 'stylize',
  name: 'Stylize',
  effects: [
    {
      id: 'blur',
      name: 'Blur',
      type: 'filter',
      description: 'Gaussian blur',
      defaultParams: { radius: 5 },
      defaultIntensity: 5,
    },
    {
      id: 'sepia',
      name: 'Sepia',
      type: 'filter',
      description: 'Sepia tone effect',
      defaultParams: { intensity: 100 },
      defaultIntensity: 100,
    },
    {
      id: 'grayscale',
      name: 'Grayscale',
      type: 'filter',
      description: 'Convert to grayscale',
      defaultParams: { intensity: 100 },
      defaultIntensity: 100,
    },
    {
      id: 'invert',
      name: 'Invert',
      type: 'filter',
      description: 'Invert colors',
      defaultParams: { intensity: 100 },
      defaultIntensity: 100,
    },
    {
      id: 'vignette',
      name: 'Vignette',
      type: 'filter',
      description: 'Darken edges',
      defaultParams: { intensity: 50, radius: 50 },
      defaultIntensity: 50,
    },
    {
      id: 'mosaic',
      name: 'Mosaic',
      type: 'filter',
      description: 'Pixelate with adjustable block size',
      defaultParams: { blockSize: 10 },
    },
    {
      id: 'posterize',
      name: 'Posterize',
      type: 'filter',
      description: 'Reduce color levels',
      defaultParams: { levels: 4 },
    },
    {
      id: 'find-edges',
      name: 'Find Edges',
      type: 'filter',
      description: 'Edge detection effect',
      defaultParams: { intensity: 100 },
    },
    {
      id: 'noise',
      name: 'Noise / Grain',
      type: 'filter',
      description: 'Add film grain noise',
      defaultParams: { amount: 25, monochrome: true },
    },
    {
      id: 'alpha-glow',
      name: 'Alpha Glow',
      type: 'filter',
      description: 'Alpha channel glow effect',
      defaultParams: { glow: 25, brightness: 255 },
    },
    {
      id: 'emboss',
      name: 'Emboss',
      type: 'filter',
      description: 'Emboss / Color Emboss effect',
      defaultParams: { direction: 0, relief: 2, contrast: 50 },
    },
    {
      id: 'solarize',
      name: 'Solarize',
      type: 'filter',
      description: 'Solarize effect',
      defaultParams: { threshold: 128 },
    },
    {
      id: 'strobe-effect',
      name: 'Strobe',
      type: 'filter',
      description: 'Strobe effect with blending',
      defaultParams: { frequency: 5, blendMode: 'normal', duration: 0.05 },
    },
    {
      id: 'glow',
      name: 'Glow',
      type: 'filter',
      description: 'Soft glow effect',
      defaultParams: { radius: 10, intensity: 50, threshold: 128 },
    },
  ],
};
