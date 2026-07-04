/**
 * Distort — video effect definitions.
 *
 * Pure data consumed by the effects panel (renderer) and the FFmpeg export
 * pipeline (Electron main). Add a new effect by appending an entry here;
 * give transitions an `xfade` name so the export pipeline can render them.
 * Optional per-effect icons go in components/effectIcons.ts.
 */

import type { VideoEffectCategory } from '../types';

export const distortCategory: VideoEffectCategory = {
  key: 'distort',
  name: 'Distort',
  effects: [
    {
      id: 'lens-distortion',
      name: 'Lens Distortion',
      type: 'filter',
      description: 'Barrel/pincushion lens distortion correction',
      defaultParams: { distortion: 0, curvature: 0 },
    },
    {
      id: 'corner-pin',
      name: 'Corner Pin',
      type: 'filter',
      description: '4-corner pin for perspective distortion',
      defaultParams: { topLeftX: 0, topLeftY: 0, topRightX: 100, topRightY: 0, bottomLeftX: 0, bottomLeftY: 100, bottomRightX: 100, bottomRightY: 100, },
    },
    {
      id: 'mirror',
      name: 'Mirror',
      type: 'filter',
      description: 'Mirror reflection effect',
      defaultParams: { axis: 0 },
    },
    {
      id: 'offset',
      name: 'Offset',
      type: 'filter',
      description: 'Image offset with wrapping',
      defaultParams: { x: 0, y: 0 },
    },
    {
      id: 'wave-warp',
      name: 'Wave Warp',
      type: 'filter',
      description: 'Wave warp distortion',
      defaultParams: { height: 20, width: 100, speed: 1 },
    },
    {
      id: 'transform-effect',
      name: 'Transform',
      type: 'filter',
      description: '2D transform effect (separate from clip transform)',
      defaultParams: { x: 0, y: 0, scaleX: 100, scaleY: 100, rotation: 0, skew: 0 },
    },
    {
      id: 'motion-tile',
      name: 'Motion Tile',
      type: 'filter',
      description: 'Tile and repeat with motion',
      defaultParams: { tileWidth: 100, tileHeight: 100, mirrorEdges: true },
    },
    {
      id: 'ripple-distort',
      name: 'Ripple',
      type: 'filter',
      description: 'Ripple distortion effect',
      defaultParams: { radius: 50, waveWidth: 20, waveHeight: 10, waveSpeed: 1 },
    },
  ],
};
