/**
 * Color Correction — video effect definitions.
 *
 * Pure data consumed by the effects panel (renderer) and the FFmpeg export
 * pipeline (Electron main). Add a new effect by appending an entry here;
 * give transitions an `xfade` name so the export pipeline can render them.
 * Optional per-effect icons go in components/effectIcons.ts.
 */

import type { VideoEffectCategory } from '../types';

export const colorCorrectionCategory: VideoEffectCategory = {
  key: 'colorCorrection',
  name: 'Color Correction',
  effects: [
    {
      id: 'brightness',
      name: 'Brightness',
      type: 'filter',
      description: 'Adjust brightness',
      defaultParams: { value: 0 },
      defaultIntensity: 20,
    },
    {
      id: 'contrast',
      name: 'Contrast',
      type: 'filter',
      description: 'Adjust contrast',
      defaultParams: { value: 0 },
      defaultIntensity: 20,
    },
    {
      id: 'saturation',
      name: 'Saturation',
      type: 'filter',
      description: 'Adjust color saturation',
      defaultParams: { value: 0 },
      defaultIntensity: 30,
    },
    {
      id: 'hue',
      name: 'Hue Shift',
      type: 'filter',
      description: 'Shift colors',
      defaultParams: { value: 0 },
      defaultIntensity: 30,
    },
    {
      id: 'color-pass',
      name: 'Color Pass',
      type: 'filter',
      description: 'Retain one color, desaturate the rest',
      defaultParams: { hue: 0, range: 30 },
    },
    {
      id: 'color-replace',
      name: 'Color Replace',
      type: 'filter',
      description: 'Replace a target color with another',
      defaultParams: { targetHue: 0, replaceHue: 120, replaceRange: 30 },
    },
    {
      id: 'leave-color',
      name: 'Leave Color',
      type: 'filter',
      description: 'Keep selected color, convert rest to grayscale',
      defaultParams: { hue: 0, tolerance: 25 },
    },
    {
      id: 'tint',
      name: 'Tint',
      type: 'filter',
      description: 'Map image tones between two colors',
      defaultParams: { amount: 100 },
    },
    {
      id: 'channel-mixer',
      name: 'Channel Mixer',
      type: 'filter',
      description: 'Remap RGB channels with cross-channel mixing',
      defaultParams: { rr: 100, rg: 0, rb: 0, gr: 0, gg: 100, gb: 0, br: 0, bg: 0, bb: 100 },
    },
  ],
};
