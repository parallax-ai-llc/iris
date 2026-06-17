/**
 * EffectsPanel - Effects and transitions panel for video editor
 * Browse and apply video effects, transitions, and audio effects
 *
 * Features:
 * - Categorized effect library
 * - Drag to clip support
 * - Effect preview
 * - Search functionality
 */

import { memo, useState, useCallback, useMemo } from 'react';
import {
  Sparkles,
  Blend,
  Wand2,
  Volume2,
  Search,
  X,
  ChevronRight,
  ChevronDown,
  Sun,
  Contrast,
  Droplets,
  CircleDot,
  Waves,
  Zap,
  Palette,
  Eye,
  ArrowRightLeft,
  Maximize2,
  Move,
  RotateCcw,
  Grid3x3,
  ScanLine,
  Layers,
  Film,
  MoveRight,
  SlidersHorizontal,
  ChartScatter,
  CircleDashed,
  Clock,
  Circle,
  FilterX,
  BarChart2,
  // Phase 2 Batch 1: Adjust & Color Correction
  Sliders,
  BarChart3,
  SunDim,
  Monitor,
  Pipette,
  SwatchBook,
  Paintbrush,
  // Phase 2 Batch 3: Distort, Perspective, Stylize
  Box,
  CloudFog,
  Mountain,
  SunMedium,
  // Phase 2 Batch 5: Audio Effects
  ShieldAlert,
  Cylinder,
  Activity,
  ArrowDownCircle,
  ArrowUpCircle,
  Filter,
  ShieldCheck,
  VolumeX,
  Building2,
  Mic,
  // Phase 3: New categories
  Hash,
  Eraser,
  Radio,
  Shuffle,
  Square,
  Triangle,
  Crosshair,
  Gauge,
  Clapperboard,
  // Phase 9: VR/360
  Globe,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { EffectType } from '@/types/videoProject.types';

interface EffectsPanelProps {
  className?: string;
  selectedClipType?: string;
  appliedEffects?: Map<string, string>;
  onEffectDragStart?: (effect: EffectDefinition) => void;
  onEffectApply?: (effect: EffectDefinition) => void;
  onEffectRemove?: (instanceId: string) => void;
}

// Effect definition
export interface EffectDefinition {
  id: string;
  name: string;
  type: EffectType;
  category: string;
  icon: typeof Sparkles;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultParams: Record<string, any>;
}

// Effect categories
const EFFECT_CATEGORIES = {
  transitions: {
    name: 'Transitions',
    icon: ArrowRightLeft,
    effects: [
      {
        id: 'fade',
        name: 'Fade',
        type: 'transition' as EffectType,
        category: 'transitions',
        icon: Eye,
        description: 'Smooth fade in/out',
        defaultParams: { duration: 0.5 },
      },
      {
        id: 'dissolve',
        name: 'Dissolve',
        type: 'transition' as EffectType,
        category: 'transitions',
        icon: Blend,
        description: 'Cross dissolve between clips',
        defaultParams: { duration: 0.5 },
      },
      {
        id: 'wipe',
        name: 'Wipe',
        type: 'transition' as EffectType,
        category: 'transitions',
        icon: ArrowRightLeft,
        description: 'Wipe transition',
        defaultParams: { duration: 0.5, direction: 0 },
      },
      {
        id: 'slide',
        name: 'Slide',
        type: 'transition' as EffectType,
        category: 'transitions',
        icon: Move,
        description: 'Slide in/out',
        defaultParams: { duration: 0.5, direction: 0 },
      },
      {
        id: 'zoom',
        name: 'Zoom',
        type: 'transition' as EffectType,
        category: 'transitions',
        icon: Maximize2,
        description: 'Zoom transition',
        defaultParams: { duration: 0.5, scale: 1.2 },
      },
      {
        id: 'blur-transition',
        name: 'Blur',
        type: 'transition' as EffectType,
        category: 'transitions',
        icon: Droplets,
        description: 'Blur transition',
        defaultParams: { duration: 0.5, intensity: 20 },
      },
      {
        id: 'dip-to-black',
        name: 'Dip to Black',
        type: 'transition' as EffectType,
        category: 'transitions',
        icon: CircleDot,
        description: 'Dip through black',
        defaultParams: { duration: 0.5 },
      },
      {
        id: 'dip-to-white',
        name: 'Dip to White',
        type: 'transition' as EffectType,
        category: 'transitions',
        icon: Sun,
        description: 'Dip through white',
        defaultParams: { duration: 0.5 },
      },
      {
        id: 'push',
        name: 'Push',
        type: 'transition' as EffectType,
        category: 'transitions',
        icon: MoveRight,
        description: 'Push clip in a direction',
        defaultParams: { duration: 0.5, direction: 'left' },
      },
      {
        id: 'film-dissolve',
        name: 'Film Dissolve',
        type: 'transition' as EffectType,
        category: 'transitions',
        icon: Film,
        description: 'Film gamma cross dissolve',
        defaultParams: { duration: 0.5 },
      },
      {
        id: 'tr-iris',
        name: 'Iris',
        type: 'transition' as EffectType,
        category: 'transitions',
        icon: CircleDashed,
        description: 'Circular iris wipe transition',
        defaultParams: { duration: 0.5, transitionType: 'iris' },
      },
      {
        id: 'tr-clock-wipe',
        name: 'Clock Wipe',
        type: 'transition' as EffectType,
        category: 'transitions',
        icon: Clock,
        description: 'Radial clock wipe transition',
        defaultParams: { duration: 0.5, transitionType: 'clock-wipe' },
      },
      {
        id: 'tr-gradient-wipe',
        name: 'Gradient Wipe',
        type: 'transition' as EffectType,
        category: 'transitions',
        icon: SlidersHorizontal,
        description: 'Soft edge gradient wipe transition',
        defaultParams: { duration: 0.5, transitionType: 'gradient-wipe' },
      },
      // Phase 2 Batch 4: Transitions Expansion (22)
      { id: 'additive-dissolve', name: 'Additive Dissolve', type: 'transition' as EffectType, category: 'transitions', icon: Blend, description: 'Brightness-additive dissolve', defaultParams: { duration: 0.5 } },
      { id: 'non-additive-dissolve', name: 'Non-Additive Dissolve', type: 'transition' as EffectType, category: 'transitions', icon: Blend, description: 'Non-additive dissolve', defaultParams: { duration: 0.5 } },
      { id: 'iris-box', name: 'Iris Box', type: 'transition' as EffectType, category: 'transitions', icon: CircleDashed, description: 'Box iris wipe', defaultParams: { duration: 0.5 } },
      { id: 'iris-cross', name: 'Iris Cross', type: 'transition' as EffectType, category: 'transitions', icon: CircleDashed, description: 'Cross iris wipe', defaultParams: { duration: 0.5 } },
      { id: 'iris-diamond', name: 'Iris Diamond', type: 'transition' as EffectType, category: 'transitions', icon: CircleDashed, description: 'Diamond iris wipe', defaultParams: { duration: 0.5 } },
      { id: 'iris-star', name: 'Iris Star', type: 'transition' as EffectType, category: 'transitions', icon: CircleDashed, description: 'Star iris wipe', defaultParams: { duration: 0.5 } },
      { id: 'iris-points', name: 'Iris Points', type: 'transition' as EffectType, category: 'transitions', icon: CircleDashed, description: 'Polygon iris wipe', defaultParams: { duration: 0.5 } },
      { id: 'band-slide', name: 'Band Slide', type: 'transition' as EffectType, category: 'transitions', icon: ArrowRightLeft, description: 'Band slide transition', defaultParams: { duration: 0.5 } },
      { id: 'center-merge', name: 'Center Merge', type: 'transition' as EffectType, category: 'transitions', icon: ArrowRightLeft, description: 'Center merge transition', defaultParams: { duration: 0.5 } },
      { id: 'center-split', name: 'Center Split', type: 'transition' as EffectType, category: 'transitions', icon: ArrowRightLeft, description: 'Center split transition', defaultParams: { duration: 0.5 } },
      { id: 'slash-slide', name: 'Slash Slide', type: 'transition' as EffectType, category: 'transitions', icon: ArrowRightLeft, description: 'Diagonal slash slide', defaultParams: { duration: 0.5 } },
      { id: 'split', name: 'Split', type: 'transition' as EffectType, category: 'transitions', icon: ArrowRightLeft, description: 'Split transition', defaultParams: { duration: 0.5 } },
      { id: 'swap', name: 'Swap', type: 'transition' as EffectType, category: 'transitions', icon: ArrowRightLeft, description: 'Swap transition', defaultParams: { duration: 0.5 } },
      { id: 'swirl', name: 'Swirl', type: 'transition' as EffectType, category: 'transitions', icon: RotateCcw, description: 'Swirl slide transition', defaultParams: { duration: 0.5 } },
      { id: 'whip-turn', name: 'Whip Turn', type: 'transition' as EffectType, category: 'transitions', icon: RotateCcw, description: 'Fast whip turn', defaultParams: { duration: 0.5 } },
      { id: 'sliding-bands', name: 'Sliding Bands', type: 'transition' as EffectType, category: 'transitions', icon: ArrowRightLeft, description: 'Sliding bands transition', defaultParams: { duration: 0.5 } },
      { id: 'barn-doors', name: 'Barn Doors', type: 'transition' as EffectType, category: 'transitions', icon: ArrowRightLeft, description: 'Barn doors opening wipe', defaultParams: { duration: 0.5 } },
      { id: 'pinwheel', name: 'Pinwheel', type: 'transition' as EffectType, category: 'transitions', icon: RotateCcw, description: 'Pinwheel wipe', defaultParams: { duration: 0.5 } },
      { id: 'radial-wipe', name: 'Radial Wipe', type: 'transition' as EffectType, category: 'transitions', icon: Clock, description: 'Radial wipe transition', defaultParams: { duration: 0.5 } },
      { id: 'venetian-blinds', name: 'Venetian Blinds', type: 'transition' as EffectType, category: 'transitions', icon: ArrowRightLeft, description: 'Venetian blinds wipe', defaultParams: { duration: 0.5 } },
      // Phase 3: Wipe Transitions (12)
      { id: 'band-wipe', name: 'Band Wipe', type: 'transition' as EffectType, category: 'transitions', icon: ArrowRightLeft, description: 'Band wipe transition', defaultParams: { duration: 0.5 } },
      { id: 'checker-wipe', name: 'Checker Wipe', type: 'transition' as EffectType, category: 'transitions', icon: Grid3x3, description: 'Checker pattern wipe', defaultParams: { duration: 0.5 } },
      { id: 'checkerboard-wipe', name: 'Checkerboard Wipe', type: 'transition' as EffectType, category: 'transitions', icon: Grid3x3, description: 'Checkerboard wipe transition', defaultParams: { duration: 0.5 } },
      { id: 'inset', name: 'Inset', type: 'transition' as EffectType, category: 'transitions', icon: Square, description: 'Inset transition', defaultParams: { duration: 0.5 } },
      { id: 'random-blocks', name: 'Random Blocks', type: 'transition' as EffectType, category: 'transitions', icon: Grid3x3, description: 'Random blocks dissolve', defaultParams: { duration: 0.5 } },
      { id: 'random-wipe', name: 'Random Wipe', type: 'transition' as EffectType, category: 'transitions', icon: Shuffle, description: 'Random pattern wipe', defaultParams: { duration: 0.5 } },
      { id: 'wedge-wipe', name: 'Wedge Wipe', type: 'transition' as EffectType, category: 'transitions', icon: Triangle, description: 'Wedge-shaped wipe', defaultParams: { duration: 0.5 } },
      { id: 'wipe-basic', name: 'Wipe', type: 'transition' as EffectType, category: 'transitions', icon: ArrowRightLeft, description: 'Basic wipe transition', defaultParams: { duration: 0.5 } },
      { id: 'linear-wipe-transition', name: 'Linear Wipe', type: 'transition' as EffectType, category: 'transitions', icon: ArrowRightLeft, description: 'Linear wipe transition', defaultParams: { duration: 0.5, angle: 0 } },
      // Phase 3: Slide & Zoom Transitions (4)
      { id: 'multi-spin', name: 'Multi-Spin', type: 'transition' as EffectType, category: 'transitions', icon: RotateCcw, description: 'Multi-spin rotation transition', defaultParams: { duration: 0.5 } },
      { id: 'slide-basic', name: 'Slide', type: 'transition' as EffectType, category: 'transitions', icon: ArrowRightLeft, description: 'Basic slide transition', defaultParams: { duration: 0.5 } },
      { id: 'cross-zoom', name: 'Cross Zoom', type: 'transition' as EffectType, category: 'transitions', icon: Maximize2, description: 'Cross zoom transition', defaultParams: { duration: 0.5 } },
      { id: 'zoom-basic', name: 'Zoom', type: 'transition' as EffectType, category: 'transitions', icon: Maximize2, description: 'Basic zoom transition', defaultParams: { duration: 0.5 } },
    ],
  },
  colorCorrection: {
    name: 'Color Correction',
    icon: Palette,
    effects: [
      {
        id: 'brightness',
        name: 'Brightness',
        type: 'filter' as EffectType,
        category: 'colorCorrection',
        icon: Sun,
        description: 'Adjust brightness',
        defaultParams: { value: 0 },
      },
      {
        id: 'contrast',
        name: 'Contrast',
        type: 'filter' as EffectType,
        category: 'colorCorrection',
        icon: Contrast,
        description: 'Adjust contrast',
        defaultParams: { value: 0 },
      },
      {
        id: 'saturation',
        name: 'Saturation',
        type: 'filter' as EffectType,
        category: 'colorCorrection',
        icon: Droplets,
        description: 'Adjust color saturation',
        defaultParams: { value: 0 },
      },
      {
        id: 'hue',
        name: 'Hue Shift',
        type: 'filter' as EffectType,
        category: 'colorCorrection',
        icon: Palette,
        description: 'Shift colors',
        defaultParams: { value: 0 },
      },
      // Phase 2: Color Correction expansion
      {
        id: 'color-pass',
        name: 'Color Pass',
        type: 'filter' as EffectType,
        category: 'colorCorrection',
        icon: Pipette,
        description: 'Retain one color, desaturate the rest',
        defaultParams: { hue: 0, range: 30 },
      },
      {
        id: 'color-replace',
        name: 'Color Replace',
        type: 'filter' as EffectType,
        category: 'colorCorrection',
        icon: SwatchBook,
        description: 'Replace a target color with another',
        defaultParams: { targetHue: 0, replaceHue: 120, replaceRange: 30 },
      },
      {
        id: 'leave-color',
        name: 'Leave Color',
        type: 'filter' as EffectType,
        category: 'colorCorrection',
        icon: Pipette,
        description: 'Keep selected color, convert rest to grayscale',
        defaultParams: { hue: 0, tolerance: 25 },
      },
      {
        id: 'tint',
        name: 'Tint',
        type: 'filter' as EffectType,
        category: 'colorCorrection',
        icon: Paintbrush,
        description: 'Map image tones between two colors',
        defaultParams: { amount: 100 },
      },
      {
        id: 'channel-mixer',
        name: 'Channel Mixer',
        type: 'filter' as EffectType,
        category: 'colorCorrection',
        icon: Blend,
        description: 'Remap RGB channels with cross-channel mixing',
        defaultParams: { rr: 100, rg: 0, rb: 0, gr: 0, gg: 100, gb: 0, br: 0, bg: 0, bb: 100 },
      },
    ],
  },
  stylize: {
    name: 'Stylize',
    icon: Wand2,
    effects: [
      {
        id: 'blur',
        name: 'Blur',
        type: 'filter' as EffectType,
        category: 'stylize',
        icon: Droplets,
        description: 'Gaussian blur',
        defaultParams: { radius: 5 },
      },
      {
        id: 'sepia',
        name: 'Sepia',
        type: 'filter' as EffectType,
        category: 'stylize',
        icon: Palette,
        description: 'Sepia tone effect',
        defaultParams: { intensity: 100 },
      },
      {
        id: 'grayscale',
        name: 'Grayscale',
        type: 'filter' as EffectType,
        category: 'stylize',
        icon: CircleDot,
        description: 'Convert to grayscale',
        defaultParams: { intensity: 100 },
      },
      {
        id: 'invert',
        name: 'Invert',
        type: 'filter' as EffectType,
        category: 'stylize',
        icon: RotateCcw,
        description: 'Invert colors',
        defaultParams: { intensity: 100 },
      },
      {
        id: 'vignette',
        name: 'Vignette',
        type: 'filter' as EffectType,
        category: 'stylize',
        icon: CircleDot,
        description: 'Darken edges',
        defaultParams: { intensity: 50, radius: 50 },
      },
      {
        id: 'mosaic',
        name: 'Mosaic',
        type: 'filter' as EffectType,
        category: 'stylize',
        icon: Grid3x3,
        description: 'Pixelate with adjustable block size',
        defaultParams: { blockSize: 10 },
      },
      {
        id: 'posterize',
        name: 'Posterize',
        type: 'filter' as EffectType,
        category: 'stylize',
        icon: Layers,
        description: 'Reduce color levels',
        defaultParams: { levels: 4 },
      },
      {
        id: 'find-edges',
        name: 'Find Edges',
        type: 'filter' as EffectType,
        category: 'stylize',
        icon: ScanLine,
        description: 'Edge detection effect',
        defaultParams: { intensity: 100 },
      },
      {
        id: 'noise',
        name: 'Noise / Grain',
        type: 'filter' as EffectType,
        category: 'stylize',
        icon: ChartScatter,
        description: 'Add film grain noise',
        defaultParams: { amount: 25, monochrome: true },
      },
      // Phase 2: Stylize expansion
      {
        id: 'alpha-glow',
        name: 'Alpha Glow',
        type: 'filter' as EffectType,
        category: 'stylize',
        icon: Sun,
        description: 'Alpha channel glow effect',
        defaultParams: { glow: 25, brightness: 255 },
      },
      {
        id: 'emboss',
        name: 'Emboss',
        type: 'filter' as EffectType,
        category: 'stylize',
        icon: Mountain,
        description: 'Emboss / Color Emboss effect',
        defaultParams: { direction: 0, relief: 2, contrast: 50 },
      },
      {
        id: 'solarize',
        name: 'Solarize',
        type: 'filter' as EffectType,
        category: 'stylize',
        icon: SunMedium,
        description: 'Solarize effect',
        defaultParams: { threshold: 128 },
      },
      // Phase 7A: Stylize effects
      { id: 'strobe-effect', name: 'Strobe', type: 'filter' as EffectType, category: 'stylize', icon: Zap, description: 'Strobe effect with blending', defaultParams: { frequency: 5, blendMode: 'normal', duration: 0.05 } },
      { id: 'glow', name: 'Glow', type: 'filter' as EffectType, category: 'stylize', icon: Sun, description: 'Soft glow effect', defaultParams: { radius: 10, intensity: 50, threshold: 128 } },
    ],
  },
  sharpenBlur: {
    name: 'Sharpen & Blur',
    icon: Droplets,
    effects: [
      {
        id: 'directional-blur',
        name: 'Directional Blur',
        type: 'filter' as EffectType,
        category: 'sharpenBlur',
        icon: MoveRight,
        description: 'Directional motion blur',
        defaultParams: { angle: 0, distance: 10 },
      },
      {
        id: 'unsharp-mask',
        name: 'Unsharp Mask',
        type: 'filter' as EffectType,
        category: 'sharpenBlur',
        icon: SlidersHorizontal,
        description: 'Sharpen image details',
        defaultParams: { amount: 50, radius: 1, threshold: 0 },
      },
      // Phase 2 Batch 2: Blur/Sharpen expansion
      {
        id: 'camera-blur',
        name: 'Camera Blur',
        type: 'filter' as EffectType,
        category: 'sharpenBlur',
        icon: CircleDot,
        description: 'Camera defocus simulation',
        defaultParams: { radius: 10 },
      },
      {
        id: 'channel-blur',
        name: 'Channel Blur',
        type: 'filter' as EffectType,
        category: 'sharpenBlur',
        icon: Layers,
        description: 'Per-channel R/G/B/A blur',
        defaultParams: { redBlur: 0, greenBlur: 0, blueBlur: 0 },
      },
      {
        id: 'compound-blur',
        name: 'Compound Blur',
        type: 'filter' as EffectType,
        category: 'sharpenBlur',
        icon: Blend,
        description: 'Control layer based blur map',
        defaultParams: { maxBlur: 10 },
      },
      {
        id: 'sharpen',
        name: 'Sharpen',
        type: 'filter' as EffectType,
        category: 'sharpenBlur',
        icon: Contrast,
        description: 'Overall image sharpening',
        defaultParams: { sharpness: 50 },
      },
      {
        id: 'gaussian-blur',
        name: 'Gaussian Blur',
        type: 'filter' as EffectType,
        category: 'sharpenBlur',
        icon: Droplets,
        description: 'Gaussian blur filter',
        defaultParams: { radius: 5 },
      },
      // Phase 7A: Blur effects
      { id: 'zoom-blur', name: 'Zoom Blur', type: 'filter' as EffectType, category: 'sharpenBlur', icon: Maximize2, description: 'Zoom/focus blur effect', defaultParams: { amount: 20, centerX: 50, centerY: 50 } },
      { id: 'anti-alias-blur', name: 'Anti-Alias Blur', type: 'filter' as EffectType, category: 'sharpenBlur', icon: Droplets, description: 'Anti-aliasing smoothing blur', defaultParams: { strength: 50 } },
    ],
  },
  // Phase 2 Batch 2: Generate category
  generate: {
    name: 'Generate',
    icon: Sparkles,
    effects: [
      {
        id: 'grid-generate',
        name: 'Grid',
        type: 'filter' as EffectType,
        category: 'generate',
        icon: Grid3x3,
        description: 'Grid overlay generator',
        defaultParams: { sizeX: 50, sizeY: 50, lineWidth: 1 },
      },
    ],
  },
  distort: {
    name: 'Distort',
    icon: Circle,
    effects: [
      {
        id: 'lens-distortion',
        name: 'Lens Distortion',
        type: 'filter' as EffectType,
        category: 'distort',
        icon: Circle,
        description: 'Barrel/pincushion lens distortion correction',
        defaultParams: { distortion: 0, curvature: 0 },
      },
      {
        id: 'corner-pin',
        name: 'Corner Pin',
        type: 'filter' as EffectType,
        category: 'distort',
        icon: Maximize2,
        description: '4-corner pin for perspective distortion',
        defaultParams: {
          topLeftX: 0,
          topLeftY: 0,
          topRightX: 100,
          topRightY: 0,
          bottomLeftX: 0,
          bottomLeftY: 100,
          bottomRightX: 100,
          bottomRightY: 100,
        },
      },
      // Phase 2: Distort expansion
      {
        id: 'mirror',
        name: 'Mirror',
        type: 'filter' as EffectType,
        category: 'distort',
        icon: ArrowRightLeft,
        description: 'Mirror reflection effect',
        defaultParams: { axis: 0 },
      },
      {
        id: 'offset',
        name: 'Offset',
        type: 'filter' as EffectType,
        category: 'distort',
        icon: Move,
        description: 'Image offset with wrapping',
        defaultParams: { x: 0, y: 0 },
      },
      {
        id: 'wave-warp',
        name: 'Wave Warp',
        type: 'filter' as EffectType,
        category: 'distort',
        icon: Waves,
        description: 'Wave warp distortion',
        defaultParams: { height: 20, width: 100, speed: 1 },
      },
      {
        id: 'transform-effect',
        name: 'Transform',
        type: 'filter' as EffectType,
        category: 'distort',
        icon: Move,
        description: '2D transform effect (separate from clip transform)',
        defaultParams: { x: 0, y: 0, scaleX: 100, scaleY: 100, rotation: 0, skew: 0 },
      },
      // Phase 7A: Distort effects
      { id: 'motion-tile', name: 'Motion Tile', type: 'filter' as EffectType, category: 'distort', icon: Grid3x3, description: 'Tile and repeat with motion', defaultParams: { tileWidth: 100, tileHeight: 100, mirrorEdges: true } },
      { id: 'ripple-distort', name: 'Ripple', type: 'filter' as EffectType, category: 'distort', icon: Waves, description: 'Ripple distortion effect', defaultParams: { radius: 50, waveWidth: 20, waveHeight: 10, waveSpeed: 1 } },
    ],
  },
  // Phase 2: Perspective category
  perspective: {
    name: 'Perspective',
    icon: Box,
    effects: [
      {
        id: 'basic-3d',
        name: 'Basic 3D',
        type: 'filter' as EffectType,
        category: 'perspective',
        icon: Box,
        description: '3D tilt/swivel effect',
        defaultParams: { tilt: 0, swivel: 0, distance: 0 },
      },
      {
        id: 'drop-shadow',
        name: 'Drop Shadow',
        type: 'filter' as EffectType,
        category: 'perspective',
        icon: CloudFog,
        description: 'Drop shadow effect',
        defaultParams: { distance: 5, direction: 135, softness: 5, opacity: 50 },
      },
    ],
  },
  keying: {
    name: 'Keying',
    icon: Layers,
    effects: [
      {
        id: 'luma-key',
        name: 'Luma Key',
        type: 'filter' as EffectType,
        category: 'keying',
        icon: Sun,
        description: 'Key out pixels based on luminance (brightness)',
        defaultParams: {
          filterType: 'luma-key',
          threshold: 50,
          tolerance: 20,
          softness: 10,
        },
      },
      // Phase 2 Batch 6: Keying expansion
      { id: 'color-key', name: 'Color Key', type: 'filter' as EffectType, category: 'keying', icon: Palette, description: 'Simple color keying', defaultParams: { color: '#00ff00', tolerance: 30 } },
      { id: 'non-red-key', name: 'Non Red Key', type: 'filter' as EffectType, category: 'keying', icon: Eye, description: 'Non-red channel keying', defaultParams: { threshold: 30 } },
      // Phase 5: Ultra Key
      { id: 'ultra-key', name: 'Ultra Key', type: 'filter' as EffectType, category: 'keying', icon: Eye, description: 'Advanced chroma key (green/blue screen) with spill suppression', defaultParams: { keyColor: '#00ff00', tolerance: 50, pedestal: 10, spillSuppression: 50 } },
    ],
  },
  // Phase 2 Batch 6: Time effects
  time: {
    name: 'Time',
    icon: Clock,
    effects: [
      { id: 'posterize-time', name: 'Posterize Time', type: 'filter' as EffectType, category: 'time', icon: Clock, description: 'Reduce frame rate for stop-motion effect', defaultParams: { frameRate: 12 } },
    ],
  },
  // Phase 2 Batch 6: Utility
  utility: {
    name: 'Utility',
    icon: Wand2,
    effects: [
      { id: 'crop-effect', name: 'Crop', type: 'filter' as EffectType, category: 'utility', icon: Maximize2, description: 'Crop (top/bottom/left/right %)', defaultParams: { top: 0, bottom: 0, left: 0, right: 0 } },
      { id: 'edge-feather', name: 'Edge Feather', type: 'filter' as EffectType, category: 'utility', icon: Droplets, description: 'Edge feathering', defaultParams: { amount: 10 } },
    ],
  },
  // Phase 2 Batch 8: Transition-style effects
  transitionStyle: {
    name: 'Transition-Style',
    icon: ArrowRightLeft,
    effects: [
      { id: 'block-dissolve', name: 'Block Dissolve', type: 'filter' as EffectType, category: 'transitionStyle', icon: Grid3x3, description: 'Block dissolve effect', defaultParams: { blockWidth: 10, blockHeight: 10 } },
      { id: 'linear-wipe', name: 'Linear Wipe', type: 'filter' as EffectType, category: 'transitionStyle', icon: ArrowRightLeft, description: 'Linear wipe effect', defaultParams: { angle: 0, feather: 10 } },
      { id: 'venetian-blinds-effect', name: 'Venetian Blinds', type: 'filter' as EffectType, category: 'transitionStyle', icon: ArrowRightLeft, description: 'Venetian blinds effect', defaultParams: { width: 50, angle: 0 } },
      { id: 'strobe-light', name: 'Strobe Light', type: 'filter' as EffectType, category: 'transitionStyle', icon: Zap, description: 'Strobe/flash effect', defaultParams: { frequency: 5, duration: 0.05 } },
      { id: 'threshold', name: 'Threshold', type: 'filter' as EffectType, category: 'transitionStyle', icon: Contrast, description: 'Threshold B&W conversion', defaultParams: { level: 128 } },
      // Phase 5: Gradient Wipe effect
      { id: 'gradient-wipe-effect', name: 'Gradient Wipe', type: 'filter' as EffectType, category: 'transitionStyle', icon: SlidersHorizontal, description: 'Gradient-based wipe effect', defaultParams: { softness: 50, angle: 0 } },
    ],
  },
  // Phase 2 Batch 8: Transform effects
  transformEffects: {
    name: 'Transform Effects',
    icon: Move,
    effects: [
      { id: 'horizontal-flip', name: 'Horizontal Flip', type: 'filter' as EffectType, category: 'transformEffects', icon: ArrowRightLeft, description: 'Flip horizontally', defaultParams: {} },
      { id: 'vertical-flip', name: 'Vertical Flip', type: 'filter' as EffectType, category: 'transformEffects', icon: ArrowRightLeft, description: 'Flip vertically', defaultParams: {} },
      { id: 'flicker-removal', name: 'Flicker Removal', type: 'filter' as EffectType, category: 'transformEffects', icon: Wand2, description: 'Remove flicker artifacts', defaultParams: { strength: 50 } },
      { id: 'replicate', name: 'Replicate', type: 'filter' as EffectType, category: 'transformEffects', icon: Grid3x3, description: 'Tile replicate effect', defaultParams: { count: 4 } },
    ],
  },
  audio: {
    name: 'Audio Effects',
    icon: Volume2,
    effects: [
      {
        id: 'gain',
        name: 'Gain',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: Volume2,
        description: 'Adjust volume',
        defaultParams: { gain: 0 },
      },
      {
        id: 'equalizer',
        name: 'Equalizer',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: Waves,
        description: 'Frequency equalizer',
        defaultParams: { low: 0, mid: 0, high: 0 },
      },
      {
        id: 'compressor',
        name: 'Compressor',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: Zap,
        description: 'Dynamic range compression',
        defaultParams: { threshold: -20, ratio: 4 },
      },
      {
        id: 'reverb',
        name: 'Reverb',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: Waves,
        description: 'Add reverb effect',
        defaultParams: { decay: 2, wet: 30 },
      },
      {
        id: 'noise-reduction',
        name: 'Noise Reduction',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: Wand2,
        description: 'Reduce background noise',
        defaultParams: { reduction: 50 },
      },
      {
        id: 'de-esser',
        name: 'DeEsser',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: FilterX,
        description: 'Remove harsh sibilance (s/sh sounds)',
        defaultParams: { frequency: 6000, threshold: -20, reduction: 10 },
      },
      {
        id: 'parametric-eq',
        name: 'Parametric EQ',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: BarChart2,
        description: 'Professional 5-band parametric equalizer',
        defaultParams: {
          band1Frequency: 80,   band1Gain: 0, band1Q: 0.7,
          band2Frequency: 250,  band2Gain: 0, band2Q: 1.0,
          band3Frequency: 1000, band3Gain: 0, band3Q: 1.0,
          band4Frequency: 4000, band4Gain: 0, band4Q: 1.0,
          band5Frequency: 12000, band5Gain: 0, band5Q: 0.7,
        },
      },
      {
        id: 'multiband-compressor',
        name: 'Multiband Compressor',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: BarChart2,
        description: 'Multi-band dynamic range compression',
        defaultParams: { bands: 3, lowFreq: 200, highFreq: 2000 },
      },
      {
        id: 'convolution-reverb',
        name: 'Convolution Reverb',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: Waves,
        description: 'Impulse-response based reverb',
        defaultParams: { impulse: 'hall', wet: 30, dry: 100 },
      },
      {
        id: 'chorus',
        name: 'Chorus',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: Waves,
        description: 'Chorus modulation effect',
        defaultParams: { rate: 1.5, depth: 50, mix: 50 },
      },
      {
        id: 'flanger',
        name: 'Flanger',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: Waves,
        description: 'Flanger modulation effect',
        defaultParams: { rate: 0.5, depth: 80, feedback: 50, mix: 50 },
      },
      {
        id: 'phaser',
        name: 'Phaser',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: Waves,
        description: 'Phaser modulation effect',
        defaultParams: { rate: 0.3, depth: 60, stages: 4, mix: 50 },
      },
      // Phase 2: Audio Effects expansion
      {
        id: 'amplify',
        name: 'Amplify',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: Volume2,
        description: 'Volume amplification',
        defaultParams: { gain: 0 },
      },
      {
        id: 'hard-limiter',
        name: 'Hard Limiter',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: ShieldAlert,
        description: 'Hard limiter to prevent clipping',
        defaultParams: { ceiling: -0.1, release: 10 },
      },
      {
        id: 'tube-compressor',
        name: 'Tube-modeled Compressor',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: Cylinder,
        description: 'Warm tube-style compression',
        defaultParams: { threshold: -20, ratio: 4, drive: 3 },
      },
      {
        id: 'dynamics',
        name: 'Dynamics',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: Activity,
        description: 'Dynamics processing (gate/expander/compressor)',
        defaultParams: { gate: -60, attack: 5, release: 50 },
      },
      {
        id: 'analog-delay',
        name: 'Analog Delay',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: Clock,
        description: 'Warm analog-style delay',
        defaultParams: { delayTime: 250, feedback: 30, mix: 40 },
      },
      {
        id: 'bass',
        name: 'Bass',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: ArrowDownCircle,
        description: 'Low frequency boost/cut',
        defaultParams: { gain: 0, frequency: 200 },
      },
      {
        id: 'treble',
        name: 'Treble',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: ArrowUpCircle,
        description: 'High frequency boost/cut',
        defaultParams: { gain: 0, frequency: 4000 },
      },
      {
        id: 'graphic-eq',
        name: 'Graphic Equalizer',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: BarChart3,
        description: '10/20/30 band graphic equalizer',
        defaultParams: { bands: 10 },
      },
      {
        id: 'notch-filter',
        name: 'Notch Filter',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: Filter,
        description: 'Remove specific frequency (hum/buzz)',
        defaultParams: { frequency: 60, q: 10, gain: -60 },
      },
      {
        id: 'adaptive-noise-reduction',
        name: 'Adaptive Noise Reduction',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: ShieldCheck,
        description: 'Adaptive noise floor detection and reduction',
        defaultParams: { reduction: 50, sensitivity: 50 },
      },
      {
        id: 'dehummer',
        name: 'DeHummer',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: Zap,
        description: 'Remove 50/60Hz hum noise',
        defaultParams: { frequency: 60, harmonics: 5, reduction: 40 },
      },
      {
        id: 'denoise',
        name: 'DeNoise',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: VolumeX,
        description: 'Noise removal',
        defaultParams: { reduction: 50 },
      },
      {
        id: 'studio-reverb',
        name: 'Studio Reverb',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: Building2,
        description: 'Studio reverb simulation',
        defaultParams: { roomSize: 50, decay: 2, wet: 30, predelay: 20 },
      },
      {
        id: 'vocal-enhancer',
        name: 'Vocal Enhancer',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: Mic,
        description: 'Vocal clarity and presence enhancement',
        defaultParams: { presence: 50, clarity: 50, warmth: 30 },
      },
      {
        id: 'stereo-expander',
        name: 'Stereo Expander',
        type: 'audio-effect' as EffectType,
        category: 'audio',
        icon: Maximize2,
        description: 'Widen stereo image',
        defaultParams: { width: 50 },
      },
      // Phase 3: Audio Effects Expansion (10)
      { id: 'fft-filter', name: 'FFT Filter', type: 'audio-effect' as EffectType, category: 'audio', icon: BarChart2, description: 'FFT-based frequency filter', defaultParams: { type: 'lowpass', frequency: 1000, q: 1 } },
      { id: 'scientific-filter', name: 'Scientific Filter', type: 'audio-effect' as EffectType, category: 'audio', icon: Gauge, description: 'Scientific audio filter (Butterworth/Bessel/Chebyshev)', defaultParams: { filterType: 'butterworth', order: 2, frequency: 1000 } },
      { id: 'swap-channels', name: 'Swap Channels', type: 'audio-effect' as EffectType, category: 'audio', icon: Shuffle, description: 'Swap left/right audio channels', defaultParams: {} },
      { id: 'fill-left-right', name: 'Fill Left/Right', type: 'audio-effect' as EffectType, category: 'audio', icon: Radio, description: 'Fill mono to both channels', defaultParams: { fillWith: 'left' } },
      { id: 'invert-audio', name: 'Invert', type: 'audio-effect' as EffectType, category: 'audio', icon: Shuffle, description: 'Invert audio phase', defaultParams: { invertLeft: true, invertRight: true } },
      { id: 'downmixer', name: 'Downmixer', type: 'audio-effect' as EffectType, category: 'audio', icon: ArrowDownCircle, description: 'Downmix surround to stereo/mono', defaultParams: { output: 'stereo' } },
      { id: 'balance', name: 'Balance', type: 'audio-effect' as EffectType, category: 'audio', icon: SlidersHorizontal, description: 'Left/right balance control', defaultParams: { balance: 0 } },
    ],
  },
  // Phase 2: Adjust category
  adjust: {
    name: 'Adjust',
    icon: Sliders,
    effects: [
      {
        id: 'auto-color',
        name: 'Auto Color',
        type: 'filter' as EffectType,
        category: 'adjust',
        icon: Wand2,
        description: 'Automatic color correction',
        defaultParams: {},
      },
      {
        id: 'auto-contrast',
        name: 'Auto Contrast',
        type: 'filter' as EffectType,
        category: 'adjust',
        icon: Contrast,
        description: 'Automatic contrast correction',
        defaultParams: {},
      },
      {
        id: 'auto-levels',
        name: 'Auto Levels',
        type: 'filter' as EffectType,
        category: 'adjust',
        icon: BarChart3,
        description: 'Automatic level correction',
        defaultParams: {},
      },
      {
        id: 'levels',
        name: 'Levels',
        type: 'filter' as EffectType,
        category: 'adjust',
        icon: BarChart3,
        description: 'Histogram-based input/output levels',
        defaultParams: { inputBlack: 0, inputWhite: 255, gamma: 1, outputBlack: 0, outputWhite: 255 },
      },
      {
        id: 'shadow-highlight',
        name: 'Shadow/Highlight',
        type: 'filter' as EffectType,
        category: 'adjust',
        icon: Sun,
        description: 'Shadow and highlight recovery',
        defaultParams: { shadowAmount: 50, highlightAmount: 0 },
      },
      {
        id: 'proc-amp',
        name: 'ProcAmp',
        type: 'filter' as EffectType,
        category: 'adjust',
        icon: Monitor,
        description: 'Broadcast signal processing',
        defaultParams: { brightness: 0, contrast: 100, hue: 0, saturation: 100 },
      },
      {
        id: 'gamma-correction',
        name: 'Gamma Correction',
        type: 'filter' as EffectType,
        category: 'adjust',
        icon: SunDim,
        description: 'Gamma correction',
        defaultParams: { gamma: 1.0 },
      },
      // Phase 3: Additional Adjust effects
      { id: 'convolution-kernel', name: 'Convolution Kernel', type: 'filter' as EffectType, category: 'adjust', icon: Grid3x3, description: 'Custom 5x5 convolution matrix', defaultParams: { matrix: 'identity' } },
      { id: 'extract-effect', name: 'Extract', type: 'filter' as EffectType, category: 'adjust', icon: Eraser, description: 'Grayscale-based keying extraction', defaultParams: { blackPoint: 0, whitePoint: 255 } },
    ],
  },
  // Phase 3: Color Correction Advanced
  colorCorrectionAdvanced: {
    name: 'Color Correction (Advanced)',
    icon: Palette,
    effects: [
      { id: 'asc-cdl', name: 'ASC CDL', type: 'filter' as EffectType, category: 'colorCorrectionAdvanced', icon: Clapperboard, description: 'ASC CDL standard color correction (Slope/Offset/Power)', defaultParams: { slopeR: 1, slopeG: 1, slopeB: 1, offsetR: 0, offsetG: 0, offsetB: 0, powerR: 1, powerG: 1, powerB: 1, saturation: 1 } },
      { id: 'brightness-contrast', name: 'Brightness & Contrast', type: 'filter' as EffectType, category: 'colorCorrectionAdvanced', icon: Sun, description: 'Simple brightness and contrast adjustment', defaultParams: { brightness: 0, contrast: 0, useLegacy: false } },
      { id: 'change-color', name: 'Change Color', type: 'filter' as EffectType, category: 'colorCorrectionAdvanced', icon: Pipette, description: 'Change specific color range', defaultParams: { hueShift: 0, saturation: 0, lightness: 0, matchSoftness: 50 } },
      { id: 'change-to-color', name: 'Change to Color', type: 'filter' as EffectType, category: 'colorCorrectionAdvanced', icon: Pipette, description: 'HSL-based color mapping to target', defaultParams: { fromHue: 0, toHue: 120, tolerance: 30 } },
      { id: 'color-balance-hls', name: 'Color Balance (HLS)', type: 'filter' as EffectType, category: 'colorCorrectionAdvanced', icon: Palette, description: 'HLS color balance adjustment', defaultParams: { hue: 0, lightness: 0, saturation: 0 } },
      { id: 'equalize', name: 'Equalize', type: 'filter' as EffectType, category: 'colorCorrectionAdvanced', icon: BarChart3, description: 'Histogram equalization', defaultParams: { amount: 100 } },
      { id: 'fast-color-corrector', name: 'Fast Color Corrector', type: 'filter' as EffectType, category: 'colorCorrectionAdvanced', icon: Gauge, description: 'Quick color correction with wheel', defaultParams: { balance: 0, saturation: 100 } },
      { id: 'luma-corrector', name: 'Luma Corrector', type: 'filter' as EffectType, category: 'colorCorrectionAdvanced', icon: Contrast, description: 'Luminance-based correction', defaultParams: { shadows: 0, midtones: 0, highlights: 0 } },
      { id: 'luma-curve', name: 'Luma Curve', type: 'filter' as EffectType, category: 'colorCorrectionAdvanced', icon: ChartScatter, description: 'Luminance curve adjustment', defaultParams: {} },
      { id: 'rgb-color-corrector', name: 'RGB Color Corrector', type: 'filter' as EffectType, category: 'colorCorrectionAdvanced', icon: Palette, description: 'Individual RGB channel correction', defaultParams: { redGain: 1, greenGain: 1, blueGain: 1 } },
      { id: 'rgb-curves', name: 'RGB Curves', type: 'filter' as EffectType, category: 'colorCorrectionAdvanced', icon: ChartScatter, description: 'RGB curve adjustment', defaultParams: {} },
      { id: 'three-way-color-corrector', name: 'Three-Way Color Corrector', type: 'filter' as EffectType, category: 'colorCorrectionAdvanced', icon: Palette, description: 'Shadows/Midtones/Highlights 3-way correction', defaultParams: { shadowAngle: 0, midtoneAngle: 0, highlightAngle: 0 } },
      { id: 'video-limiter', name: 'Video Limiter', type: 'filter' as EffectType, category: 'colorCorrectionAdvanced', icon: ShieldAlert, description: 'Broadcast-safe level limiter', defaultParams: { reductionAxis: 'smart', minSignal: 7.5, maxSignal: 100 } },
    ],
  },
  // Phase 3: Channel effects
  channel: {
    name: 'Channel',
    icon: Layers,
    effects: [
      { id: 'arithmetic', name: 'Arithmetic', type: 'filter' as EffectType, category: 'channel', icon: Hash, description: 'Per-channel math operations (Add/Subtract/Multiply)', defaultParams: { operator: 'add', redValue: 0, greenValue: 0, blueValue: 0 } },
      { id: 'calculations', name: 'Calculations', type: 'filter' as EffectType, category: 'channel', icon: Hash, description: 'Inter-channel math operations', defaultParams: { sourceChannel: 'red', targetChannel: 'green', operator: 'add' } },
      { id: 'solid-composite', name: 'Solid Composite', type: 'filter' as EffectType, category: 'channel', icon: Square, description: 'Solid color composite overlay', defaultParams: { color: '#000000', opacity: 50, blendMode: 'normal' } },
      { id: 'black-and-white', name: 'Black & White', type: 'filter' as EffectType, category: 'channel', icon: Contrast, description: 'Advanced B&W conversion with channel weights', defaultParams: { red: 40, green: 40, blue: 20 } },
      { id: 'color-balance-rgb', name: 'Color Balance (RGB)', type: 'filter' as EffectType, category: 'channel', icon: Palette, description: 'RGB color balance', defaultParams: { redBalance: 0, greenBalance: 0, blueBalance: 0 } },
    ],
  },
  // Phase 3: Noise & Grain
  noiseGrain: {
    name: 'Noise & Grain',
    icon: Sparkles,
    effects: [
      { id: 'dust-and-scratches', name: 'Dust & Scratches', type: 'filter' as EffectType, category: 'noiseGrain', icon: Eraser, description: 'Remove dust and scratch artifacts', defaultParams: { radius: 1, threshold: 6 } },
      { id: 'median', name: 'Median', type: 'filter' as EffectType, category: 'noiseGrain', icon: Sparkles, description: 'Median noise reduction', defaultParams: { radius: 2 } },
      { id: 'noise-hls', name: 'Noise HLS', type: 'filter' as EffectType, category: 'noiseGrain', icon: Sparkles, description: 'HLS channel-specific noise', defaultParams: { hueNoise: 0, lightnessNoise: 0, saturationNoise: 0 } },
      { id: 'noise-alpha', name: 'Noise Alpha', type: 'filter' as EffectType, category: 'noiseGrain', icon: Sparkles, description: 'Alpha channel noise', defaultParams: { amount: 50, type: 'uniform' } },
      { id: 'reduce-interlace-flicker', name: 'Reduce Interlace Flicker', type: 'filter' as EffectType, category: 'noiseGrain', icon: ScanLine, description: 'Reduce interlace flicker artifacts', defaultParams: { softness: 50 } },
    ],
  },
  // Phase 3: Additional Stylize
  stylizeAdvanced: {
    name: 'Stylize (Advanced)',
    icon: Wand2,
    effects: [
      { id: 'color-emboss', name: 'Color Emboss', type: 'filter' as EffectType, category: 'stylizeAdvanced', icon: Mountain, description: 'Color emboss effect', defaultParams: { direction: 135, relief: 2, contrast: 100 } },
    ],
  },
  // Phase 3: Utility (Advanced)
  utilityAdvanced: {
    name: 'Utility (Advanced)',
    icon: Wand2,
    effects: [
      { id: 'cineon-converter', name: 'Cineon Converter', type: 'filter' as EffectType, category: 'utilityAdvanced', icon: Film, description: 'Cineon/DPX file conversion', defaultParams: { conversionType: 'linear-to-log' } },
      { id: 'sdr-conform', name: 'SDR Conform', type: 'filter' as EffectType, category: 'utilityAdvanced', icon: Monitor, description: 'HDR to SDR conversion', defaultParams: { toneMapping: 'filmic', maxNits: 1000 } },
    ],
  },
  // Phase 9: VR/360 Immersive
  vrImmersive: {
    name: 'VR/360 Immersive',
    icon: Globe,
    effects: [
      // VR Filters
      { id: 'vr-projection', name: 'VR Projection', type: 'filter' as EffectType, category: 'vrImmersive', icon: Globe, description: 'Change VR projection type (equirect/cubemap)', defaultParams: { projection: 'equirectangular', fov: 90 } },
      { id: 'vr-rotate-sphere', name: 'VR Rotate Sphere', type: 'filter' as EffectType, category: 'vrImmersive', icon: RotateCcw, description: 'Rotate 360 sphere orientation', defaultParams: { pan: 0, tilt: 0, roll: 0 } },
      { id: 'vr-de-noise', name: 'VR De-Noise', type: 'filter' as EffectType, category: 'vrImmersive', icon: Eraser, description: 'Noise reduction optimized for VR seams', defaultParams: { strength: 50, preserveDetail: 70 } },
      { id: 'vr-color-gradients', name: 'VR Color Gradients', type: 'filter' as EffectType, category: 'vrImmersive', icon: Palette, description: 'Apply color gradients to 360 sphere', defaultParams: { startColor: '#000000', endColor: '#ffffff', angle: 0 } },
      { id: 'vr-glow', name: 'VR Glow', type: 'filter' as EffectType, category: 'vrImmersive', icon: SunMedium, description: 'Glow effect for 360 content', defaultParams: { radius: 10, intensity: 50, threshold: 60 } },
      { id: 'vr-sharpen', name: 'VR Sharpen', type: 'filter' as EffectType, category: 'vrImmersive', icon: Crosshair, description: 'Sharpen optimized for VR seams', defaultParams: { amount: 50, radius: 1.0 } },
      { id: 'vr-blur', name: 'VR Blur', type: 'filter' as EffectType, category: 'vrImmersive', icon: Droplets, description: 'Blur effect for 360 video', defaultParams: { radius: 10, quality: 'high' } },
    ],
  },
};

// Effect item component
const EffectItem = memo(function EffectItem({
  effect,
  onDragStart,
  onApply,
}: {
  effect: EffectDefinition;
  onDragStart?: (effect: EffectDefinition) => void;
  onApply?: (effect: EffectDefinition) => void;
}) {
  const Icon = effect.icon;

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('application/effect', JSON.stringify(effect));
      e.dataTransfer.effectAllowed = 'copy';
      onDragStart?.(effect);
    },
    [effect, onDragStart]
  );

  const handleDoubleClick = useCallback(() => {
    onApply?.(effect);
  }, [effect, onApply]);

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDoubleClick={handleDoubleClick}
      className={cn(
        'flex items-center gap-3 p-2 rounded-lg cursor-grab',
        'bg-zinc-800/50 hover:bg-zinc-800 border border-transparent hover:border-zinc-700',
        'transition-all group'
      )}
    >
      <div className="w-8 h-8 rounded bg-zinc-700 flex items-center justify-center flex-shrink-0 group-hover:bg-zinc-600 transition-colors">
        <Icon className="w-4 h-4 text-zinc-300" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{effect.name}</p>
        <p className="text-[10px] text-zinc-500 truncate">{effect.description}</p>
      </div>
    </div>
  );
});

// Category section component
const CategorySection = memo(function CategorySection({
  category,
  effects,
  isExpanded,
  onToggle,
  onEffectDragStart,
  onEffectApply,
}: {
  category: { name: string; icon: typeof Sparkles };
  effects: EffectDefinition[];
  isExpanded: boolean;
  onToggle: () => void;
  onEffectDragStart?: (effect: EffectDefinition) => void;
  onEffectApply?: (effect: EffectDefinition) => void;
}) {
  const Icon = category.icon;

  return (
    <div className="border-b border-zinc-800 last:border-b-0">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-zinc-800/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-zinc-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-zinc-500" />
        )}
        <Icon className="w-4 h-4 text-zinc-400" />
        <span className="text-sm text-white">{category.name}</span>
        <span className="ml-auto text-xs text-zinc-500">{effects.length}</span>
      </button>
      {isExpanded && (
        <div className="px-3 pb-2 space-y-1">
          {effects.map((effect) => (
            <EffectItem
              key={effect.id}
              effect={effect}
              onDragStart={onEffectDragStart}
              onApply={onEffectApply}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// Main EffectsPanel component
export const EffectsPanel = memo(function EffectsPanel({
  className,
  selectedClipType: _selectedClipType,
  appliedEffects: _appliedEffects,
  onEffectDragStart,
  onEffectApply,
  onEffectRemove: _onEffectRemove,
}: EffectsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['transitions', 'colorCorrection'])
  );

  // Toggle category expansion
  const toggleCategory = useCallback((categoryKey: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryKey)) {
        next.delete(categoryKey);
      } else {
        next.add(categoryKey);
      }
      return next;
    });
  }, []);

  // Filter effects by search
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) {
      return EFFECT_CATEGORIES as Record<string, { name: string; icon: typeof Sparkles; effects: EffectDefinition[] }>;
    }

    const query = searchQuery.toLowerCase();
    const result: Record<string, { name: string; icon: typeof Sparkles; effects: EffectDefinition[] }> = {};

    for (const [key, category] of Object.entries(EFFECT_CATEGORIES)) {
      const filteredEffects = category.effects.filter(
        (effect) =>
          effect.name.toLowerCase().includes(query) ||
          effect.description.toLowerCase().includes(query)
      );

      if (filteredEffects.length > 0) {
        result[key] = {
          ...category,
          effects: filteredEffects as EffectDefinition[],
        };
      }
    }

    return result;
  }, [searchQuery]);

  const hasResults = Object.keys(filteredCategories).length > 0;

  return (
    <div className={cn('flex flex-col h-full bg-zinc-900', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-zinc-400" />
          <h3 className="text-sm font-medium text-white">Effects</h3>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-zinc-800">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search effects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/30"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Effects list */}
      <div className="flex-1 overflow-auto">
        {!hasResults ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <Sparkles className="w-12 h-12 text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-400 mb-1">No effects found</p>
            <p className="text-xs text-zinc-500">Try a different search term</p>
          </div>
        ) : (
          Object.entries(filteredCategories).map(([key, category]) => (
            <CategorySection
              key={key}
              category={category}
              effects={category.effects as EffectDefinition[]}
              isExpanded={expandedCategories.has(key) || !!searchQuery}
              onToggle={() => toggleCategory(key)}
              onEffectDragStart={onEffectDragStart}
              onEffectApply={onEffectApply}
            />
          ))
        )}
      </div>

      {/* Usage hint */}
      <div className="px-3 py-2 border-t border-zinc-800 bg-zinc-800/50">
        <p className="text-[10px] text-zinc-500 text-center">
          Drag effects to clips or double-click to apply
        </p>
      </div>
    </div>
  );
});

// Export effect categories for external use
export { EFFECT_CATEGORIES };

export default EffectsPanel;
