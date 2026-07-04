/**
 * VR/360 Immersive — video effect definitions.
 *
 * Pure data consumed by the effects panel (renderer) and the FFmpeg export
 * pipeline (Electron main). Add a new effect by appending an entry here;
 * give transitions an `xfade` name so the export pipeline can render them.
 * Optional per-effect icons go in components/effectIcons.ts.
 */

import type { VideoEffectCategory } from '../types';

export const vrImmersiveCategory: VideoEffectCategory = {
  key: 'vrImmersive',
  name: 'VR/360 Immersive',
  effects: [
    {
      id: 'vr-projection',
      name: 'VR Projection',
      type: 'filter',
      description: 'Change VR projection type (equirect/cubemap)',
      defaultParams: { projection: 'equirectangular', fov: 90 },
    },
    {
      id: 'vr-rotate-sphere',
      name: 'VR Rotate Sphere',
      type: 'filter',
      description: 'Rotate 360 sphere orientation',
      defaultParams: { pan: 0, tilt: 0, roll: 0 },
    },
    {
      id: 'vr-de-noise',
      name: 'VR De-Noise',
      type: 'filter',
      description: 'Noise reduction optimized for VR seams',
      defaultParams: { strength: 50, preserveDetail: 70 },
    },
    {
      id: 'vr-color-gradients',
      name: 'VR Color Gradients',
      type: 'filter',
      description: 'Apply color gradients to 360 sphere',
      defaultParams: { startColor: '#000000', endColor: '#ffffff', angle: 0 },
    },
    {
      id: 'vr-glow',
      name: 'VR Glow',
      type: 'filter',
      description: 'Glow effect for 360 content',
      defaultParams: { radius: 10, intensity: 50, threshold: 60 },
    },
    {
      id: 'vr-sharpen',
      name: 'VR Sharpen',
      type: 'filter',
      description: 'Sharpen optimized for VR seams',
      defaultParams: { amount: 50, radius: 1.0 },
    },
    {
      id: 'vr-blur',
      name: 'VR Blur',
      type: 'filter',
      description: 'Blur effect for 360 video',
      defaultParams: { radius: 10, quality: 'high' },
    },
  ],
};
