/**
 * Sharpen & Blur — video effect definitions.
 *
 * Pure data consumed by the effects panel (renderer) and the FFmpeg export
 * pipeline (Electron main). Add a new effect by appending an entry here;
 * give transitions an `xfade` name so the export pipeline can render them.
 * Optional per-effect icons go in components/effectIcons.ts.
 */

import type { VideoEffectCategory } from '../types';

export const sharpenBlurCategory: VideoEffectCategory = {
  key: 'sharpenBlur',
  name: 'Sharpen & Blur',
  effects: [
    {
      id: 'directional-blur',
      name: 'Directional Blur',
      type: 'filter',
      description: 'Directional motion blur',
      defaultParams: { angle: 0, distance: 10 },
    },
    {
      id: 'unsharp-mask',
      name: 'Unsharp Mask',
      type: 'filter',
      description: 'Sharpen image details',
      defaultParams: { amount: 50, radius: 1, threshold: 0 },
    },
    {
      id: 'camera-blur',
      name: 'Camera Blur',
      type: 'filter',
      description: 'Camera defocus simulation',
      defaultParams: { radius: 10 },
    },
    {
      id: 'channel-blur',
      name: 'Channel Blur',
      type: 'filter',
      description: 'Per-channel R/G/B/A blur',
      defaultParams: { redBlur: 0, greenBlur: 0, blueBlur: 0 },
    },
    {
      id: 'compound-blur',
      name: 'Compound Blur',
      type: 'filter',
      description: 'Control layer based blur map',
      defaultParams: { maxBlur: 10 },
    },
    {
      id: 'sharpen',
      name: 'Sharpen',
      type: 'filter',
      description: 'Overall image sharpening',
      defaultParams: { sharpness: 50 },
    },
    {
      id: 'gaussian-blur',
      name: 'Gaussian Blur',
      type: 'filter',
      description: 'Gaussian blur filter',
      defaultParams: { radius: 5 },
    },
    {
      id: 'zoom-blur',
      name: 'Zoom Blur',
      type: 'filter',
      description: 'Zoom/focus blur effect',
      defaultParams: { amount: 20, centerX: 50, centerY: 50 },
    },
    {
      id: 'anti-alias-blur',
      name: 'Anti-Alias Blur',
      type: 'filter',
      description: 'Anti-aliasing smoothing blur',
      defaultParams: { strength: 50 },
    },
  ],
};
