/**
 * Adjust — video effect definitions.
 *
 * Pure data consumed by the effects panel (renderer) and the FFmpeg export
 * pipeline (Electron main). Add a new effect by appending an entry here;
 * give transitions an `xfade` name so the export pipeline can render them.
 * Optional per-effect icons go in components/effectIcons.ts.
 */

import type { VideoEffectCategory } from '../types';

export const adjustCategory: VideoEffectCategory = {
  key: 'adjust',
  name: 'Adjust',
  effects: [
    {
      id: 'auto-color',
      name: 'Auto Color',
      type: 'filter',
      description: 'Automatic color correction',
      defaultParams: {},
    },
    {
      id: 'auto-contrast',
      name: 'Auto Contrast',
      type: 'filter',
      description: 'Automatic contrast correction',
      defaultParams: {},
    },
    {
      id: 'auto-levels',
      name: 'Auto Levels',
      type: 'filter',
      description: 'Automatic level correction',
      defaultParams: {},
    },
    {
      id: 'levels',
      name: 'Levels',
      type: 'filter',
      description: 'Histogram-based input/output levels',
      defaultParams: { inputBlack: 0, inputWhite: 255, gamma: 1, outputBlack: 0, outputWhite: 255 },
    },
    {
      id: 'shadow-highlight',
      name: 'Shadow/Highlight',
      type: 'filter',
      description: 'Shadow and highlight recovery',
      defaultParams: { shadowAmount: 50, highlightAmount: 0 },
    },
    {
      id: 'proc-amp',
      name: 'ProcAmp',
      type: 'filter',
      description: 'Broadcast signal processing',
      defaultParams: { brightness: 0, contrast: 100, hue: 0, saturation: 100 },
    },
    {
      id: 'gamma-correction',
      name: 'Gamma Correction',
      type: 'filter',
      description: 'Gamma correction',
      defaultParams: { gamma: 1.0 },
    },
    {
      id: 'convolution-kernel',
      name: 'Convolution Kernel',
      type: 'filter',
      description: 'Custom 5x5 convolution matrix',
      defaultParams: { matrix: 'identity' },
    },
    {
      id: 'extract-effect',
      name: 'Extract',
      type: 'filter',
      description: 'Grayscale-based keying extraction',
      defaultParams: { blackPoint: 0, whitePoint: 255 },
    },
  ],
};
