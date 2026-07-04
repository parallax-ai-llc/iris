/**
 * Transition-Style — video effect definitions.
 *
 * Pure data consumed by the effects panel (renderer) and the FFmpeg export
 * pipeline (Electron main). Add a new effect by appending an entry here;
 * give transitions an `xfade` name so the export pipeline can render them.
 * Optional per-effect icons go in components/effectIcons.ts.
 */

import type { VideoEffectCategory } from '../types';

export const transitionStyleCategory: VideoEffectCategory = {
  key: 'transitionStyle',
  name: 'Transition-Style',
  effects: [
    {
      id: 'block-dissolve',
      name: 'Block Dissolve',
      type: 'filter',
      description: 'Block dissolve effect',
      defaultParams: { blockWidth: 10, blockHeight: 10 },
    },
    {
      id: 'linear-wipe',
      name: 'Linear Wipe',
      type: 'filter',
      description: 'Linear wipe effect',
      defaultParams: { angle: 0, feather: 10 },
    },
    {
      id: 'venetian-blinds-effect',
      name: 'Venetian Blinds',
      type: 'filter',
      description: 'Venetian blinds effect',
      defaultParams: { width: 50, angle: 0 },
    },
    {
      id: 'strobe-light',
      name: 'Strobe Light',
      type: 'filter',
      description: 'Strobe/flash effect',
      defaultParams: { frequency: 5, duration: 0.05 },
    },
    {
      id: 'threshold',
      name: 'Threshold',
      type: 'filter',
      description: 'Threshold B&W conversion',
      defaultParams: { level: 128 },
    },
    {
      id: 'gradient-wipe-effect',
      name: 'Gradient Wipe',
      type: 'filter',
      description: 'Gradient-based wipe effect',
      defaultParams: { softness: 50, angle: 0 },
    },
  ],
};
