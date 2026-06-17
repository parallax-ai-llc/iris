/**
 * Keyframe property metadata — used by KeyframeEditor and EditorInspector.
 *
 * Split from `KeyframeEditor.tsx` so the editor component file satisfies
 * `react-refresh/only-export-components`.
 */

import { Eye, Maximize2, Move, RotateCw, Volume2, Droplets, Sun, Contrast, Gauge } from 'lucide-react';
import type { Keyframe } from '@/types/videoProject.types';

export const KEYFRAME_PROPERTIES: {
  id: Keyframe['property'];
  name: string;
  icon: typeof Eye;
  category: 'transform' | 'audio' | 'filter';
  min: number;
  max: number;
  step: number;
  unit: string;
  defaultValue: number;
}[] = [
  { id: 'opacity', name: 'Opacity', icon: Eye, category: 'transform', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 1 },
  { id: 'scale', name: 'Scale', icon: Maximize2, category: 'transform', min: 0, max: 3, step: 0.01, unit: 'x', defaultValue: 1 },
  { id: 'x', name: 'Position X', icon: Move, category: 'transform', min: -1000, max: 1000, step: 1, unit: 'px', defaultValue: 0 },
  { id: 'y', name: 'Position Y', icon: Move, category: 'transform', min: -1000, max: 1000, step: 1, unit: 'px', defaultValue: 0 },
  { id: 'rotation', name: 'Rotation', icon: RotateCw, category: 'transform', min: -360, max: 360, step: 1, unit: '°', defaultValue: 0 },
  { id: 'volume', name: 'Volume', icon: Volume2, category: 'audio', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 1 },
  { id: 'blur', name: 'Blur', icon: Droplets, category: 'filter', min: 0, max: 50, step: 0.5, unit: 'px', defaultValue: 0 },
  { id: 'brightness', name: 'Brightness', icon: Sun, category: 'filter', min: 0, max: 2, step: 0.01, unit: '', defaultValue: 1 },
  { id: 'contrast', name: 'Contrast', icon: Contrast, category: 'filter', min: 0, max: 2, step: 0.01, unit: '', defaultValue: 1 },
  { id: 'speed', name: 'Speed', icon: Gauge, category: 'transform', min: 0.1, max: 10, step: 0.1, unit: 'x', defaultValue: 1 },
];
