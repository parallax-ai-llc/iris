/**
 * Color Correction (Advanced) — video effect definitions.
 *
 * Pure data consumed by the effects panel (renderer) and the FFmpeg export
 * pipeline (Electron main). Add a new effect by appending an entry here;
 * give transitions an `xfade` name so the export pipeline can render them.
 * Optional per-effect icons go in components/effectIcons.ts.
 */

import type { VideoEffectCategory } from '../types';

export const colorCorrectionAdvancedCategory: VideoEffectCategory = {
  key: 'colorCorrectionAdvanced',
  name: 'Color Correction (Advanced)',
  effects: [
    {
      id: 'asc-cdl',
      name: 'ASC CDL',
      type: 'filter',
      description: 'ASC CDL standard color correction (Slope/Offset/Power)',
      defaultParams: { slopeR: 1, slopeG: 1, slopeB: 1, offsetR: 0, offsetG: 0, offsetB: 0, powerR: 1, powerG: 1, powerB: 1, saturation: 1 },
    },
    {
      id: 'brightness-contrast',
      name: 'Brightness & Contrast',
      type: 'filter',
      description: 'Simple brightness and contrast adjustment',
      defaultParams: { brightness: 0, contrast: 0, useLegacy: false },
    },
    {
      id: 'change-color',
      name: 'Change Color',
      type: 'filter',
      description: 'Change specific color range',
      defaultParams: { hueShift: 0, saturation: 0, lightness: 0, matchSoftness: 50 },
    },
    {
      id: 'change-to-color',
      name: 'Change to Color',
      type: 'filter',
      description: 'HSL-based color mapping to target',
      defaultParams: { fromHue: 0, toHue: 120, tolerance: 30 },
    },
    {
      id: 'color-balance-hls',
      name: 'Color Balance (HLS)',
      type: 'filter',
      description: 'HLS color balance adjustment',
      defaultParams: { hue: 0, lightness: 0, saturation: 0 },
    },
    {
      id: 'equalize',
      name: 'Equalize',
      type: 'filter',
      description: 'Histogram equalization',
      defaultParams: { amount: 100 },
    },
    {
      id: 'fast-color-corrector',
      name: 'Fast Color Corrector',
      type: 'filter',
      description: 'Quick color correction with wheel',
      defaultParams: { balance: 0, saturation: 100 },
    },
    {
      id: 'luma-corrector',
      name: 'Luma Corrector',
      type: 'filter',
      description: 'Luminance-based correction',
      defaultParams: { shadows: 0, midtones: 0, highlights: 0 },
    },
    {
      id: 'luma-curve',
      name: 'Luma Curve',
      type: 'filter',
      description: 'Luminance curve adjustment',
      defaultParams: {},
    },
    {
      id: 'rgb-color-corrector',
      name: 'RGB Color Corrector',
      type: 'filter',
      description: 'Individual RGB channel correction',
      defaultParams: { redGain: 1, greenGain: 1, blueGain: 1 },
    },
    {
      id: 'rgb-curves',
      name: 'RGB Curves',
      type: 'filter',
      description: 'RGB curve adjustment',
      defaultParams: {},
    },
    {
      id: 'three-way-color-corrector',
      name: 'Three-Way Color Corrector',
      type: 'filter',
      description: 'Shadows/Midtones/Highlights 3-way correction',
      defaultParams: { shadowAngle: 0, midtoneAngle: 0, highlightAngle: 0 },
    },
    {
      id: 'video-limiter',
      name: 'Video Limiter',
      type: 'filter',
      description: 'Broadcast-safe level limiter',
      defaultParams: { reductionAxis: 'smart', minSignal: 7.5, maxSignal: 100 },
    },
  ],
};
