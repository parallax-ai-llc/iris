/**
 * Image Editor Store
 * State management for Photoshop-style image editor
 *
 * NOTE: The store is now created per-tab via the factory in
 * `imageEditorFactory.ts`.  This file exports:
 *   - All types & defaults (unchanged)
 *   - `_createImageEditorSlice` — the (set,get,api)=>({...}) creator used by the factory
 *   - `useImageEditorStore` — a backward-compatible shim that delegates to the
 *     active tab's store via the registry so that imperative callers
 *     (`.getState()`, `.setState()`, `.subscribe()`) keep working without
 *     changing their import path.
 */

import type { StoreApi } from 'zustand';
import type { IrisAsset } from '@/shared/api/types';
import type { HistogramData } from '@/features/image-editor/canvas/histogram';
import { generateId } from '@/shared/lib/utils/id';
import type { BlendMode } from '@/types/blendMode';
import { compositeLayers } from '@/features/image-editor/canvas/layerCompositor';
import { useActionsStore } from '@/features/image-editor/stores/actions.store';
import { getActiveStore } from './imageEditorRegistry';

// ==================== Types ====================

export type EditMode =
  | 'none'
  | 'select'
  | 'move'
  | 'crop'
  | 'transform'
  | 'adjust'
  | 'filter'
  | 'selection'
  | 'drawing'
  | 'shape'
  | 'mask'
  | 'text'
  | 'layers'
  // AI modes
  | 'upscale'
  | 'bgRemove'
  | 'inpaint'
  | 'outpaint'
  | 'faceRestore'
  | 'colorize'
  | 'pen'
  // Phase 3 modes
  | 'quickMask'
  | 'freeTransform'
  | 'measure'
  // Phase 10 modes
  | 'perspectiveCrop'
  // Phase 19 Neural Filter modes
  | 'smartPortrait'
  | 'superZoom'
  | 'makeupTransfer'
  | 'photoRestoration'
  | 'landscapeMixer'
  // Phase 14/15 selection + import/export entry points triggered from the menu bar
  | 'export'
  | 'importSvg'
  | 'canvasSize'
  | 'imageSize'
  | 'selectSky'
  | 'selectFocusArea'
  | 'singleRowMarquee'
  | 'singleColumnMarquee'
  | 'reselect';

export type DrawTool =
  | 'brush' | 'pencil' | 'eraser' | 'gradient' | 'bucket' | 'clone' | 'eyedropper'
  | 'dodge' | 'burn' | 'sponge'
  | 'smudge' | 'blur-brush' | 'sharpen-brush'
  | 'healing' | 'spot-healing'
  | 'color-sampler' | 'count-tool' | 'color-replace'
  | 'pattern-stamp' | 'history-brush' | 'art-history-brush'
  | 'background-eraser' | 'magic-eraser'
  | 'red-eye-removal' | 'reflected-gradient';

export type DodgeBurnRange = 'shadows' | 'midtones' | 'highlights';
export type SpongeMode = 'saturate' | 'desaturate';
export type SelectionTool = 'rectangle' | 'ellipse' | 'lasso' | 'polygonal' | 'magicWand' | 'quickSelect' | 'colorRange' | 'magneticLasso';
export type TransformType = 'rotate' | 'flip-h' | 'flip-v' | 'scale' | 'skew' | 'perspective' | 'warp';

// Shape tools
export type ShapeTool = 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'polygon' | 'star' | 'custom';

// Phase 4: Custom Shape
export interface CustomShapeDefinition {
  id: string;
  name: string;
  category: string;
  pathData: string;  // SVG path d attribute
}

// Phase 4: Path Operations
export type PathOperation = 'unite' | 'subtract' | 'intersect' | 'exclude';

// Channel types
export type ColorChannelId = 'rgb' | 'red' | 'green' | 'blue';
export type RightPanelTab = 'layers' | 'channels' | 'paths';

export interface AlphaChannel {
  id: string;
  name: string;
  maskData: string;    // base64 grayscale image
  visible: boolean;
}

// Path types
export interface VectorPath {
  id: string;
  name: string;
  points: PathPoint[];
  closed: boolean;
  visible: boolean;
}

export interface PathPoint {
  x: number;
  y: number;
  handleIn: { x: number; y: number } | null;
  handleOut: { x: number; y: number } | null;
  type: 'smooth' | 'corner';
}

// Gradient types
export type GradientType = 'linear' | 'radial' | 'angular' | 'diamond' | 'reflected';

export type { BlendMode };

// Layer effect types
export type LayerEffectType = 'dropShadow' | 'innerShadow' | 'outerGlow' | 'innerGlow' | 'bevel' | 'stroke' | 'colorOverlay' | 'gradientOverlay' | 'patternOverlay' | 'satin';

export interface BrushSettings {
  size: number;
  hardness: number;
  opacity: number;
  flow: number;
  color: string;
  blendMode: BlendMode;
}

export interface DodgeBurnSettings {
  range: DodgeBurnRange;
  exposure: number; // 0-100
}

export interface LocalAdjustSettings {
  strength: number; // 0-100
}

export interface GradientColorStop {
  offset: number;  // 0 to 1
  color: string;
}

export interface GradientSettings {
  type: GradientType;
  colorStops: GradientColorStop[];
  angle: number;  // for linear gradient (0-360)
  reverse: boolean;
}

export interface ShapeSettings {
  fillColor: string;
  fillEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  strokeEnabled: boolean;
  cornerRadius: number;  // for rectangle
  sides: number;         // for polygon (3-12)
  innerRadius: number;   // for star (0-100%, ratio of outer radius)
}

export interface StrokeSettings {
  color: string;
  size: number;
  position: 'outside' | 'inside' | 'center';
  opacity: number;  // 0-100
  blendMode: BlendMode;
}

export interface ColorOverlaySettings {
  color: string;
  opacity: number;  // 0-100
  blendMode: BlendMode;
}

export interface GradientOverlaySettings {
  colors: string[];  // gradient color stops
  angle: number;     // 0-360
  opacity: number;   // 0-100
  blendMode: BlendMode;
  style: 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond';
  scale: number;     // 10-150
}

export interface PatternOverlaySettings {
  patternUrl: string;  // data URL or pattern identifier
  opacity: number;     // 0-100
  scale: number;       // 1-1000 %
  blendMode: BlendMode;
}

export interface SatinSettings {
  color: string;
  opacity: number;  // 0-100
  angle: number;    // 0-360
  distance: number;
  size: number;
  blendMode: BlendMode;
}

export type LayerEffectSettings = DropShadowSettings | GlowSettings | BevelSettings | StrokeSettings | ColorOverlaySettings | GradientOverlaySettings | PatternOverlaySettings | SatinSettings;

export interface LayerEffect {
  type: LayerEffectType;
  enabled: boolean;
  settings: LayerEffectSettings;
}

export interface DropShadowSettings {
  color: string;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  opacity: number;  // 0-100
}

export interface GlowSettings {
  color: string;
  size: number;
  opacity: number;  // 0-100
}

export interface BevelSettings {
  style: 'outer' | 'inner' | 'emboss';
  depth: number;
  size: number;
  softness: number;
  angle: number;
  highlightColor: string;
  shadowColor: string;
}

export interface LayerMask {
  data: string;      // base64 mask image (grayscale)
  enabled: boolean;
  linked: boolean;   // linked to layer position
}

export interface TextSettings {
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  alignment: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  // Phase 4: Paragraph text
  textType?: 'point' | 'paragraph';        // point = click, paragraph = area type
  paragraphWidth?: number;                   // area width for paragraph text
  paragraphHeight?: number;                  // area height for paragraph text
  justification?: 'left' | 'center' | 'right' | 'full';
  paragraphSpaceBefore?: number;             // spacing before paragraph (px)
  paragraphSpaceAfter?: number;              // spacing after paragraph (px)
  indent?: number;                           // first line indent (px)
  // Phase 4: Warp Text
  warpStyle?: WarpStyle;
  warpBend?: number;                         // -100 to 100
  warpHorizontalDistortion?: number;         // -100 to 100
  warpVerticalDistortion?: number;           // -100 to 100
  // Phase 4: Character panel extended
  tracking?: number;                         // -200 to 500
  baselineShift?: number;                    // px
  horizontalScale?: number;                  // 25-300 %
  verticalScale?: number;                    // 25-300 %
  textDecoration?: 'none' | 'underline' | 'strikethrough';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  // Phase 4: Type on Path
  pathId?: string;                           // VectorPath ID to follow
  pathOffset?: number;                       // offset along path (0-100%)
  pathAlignment?: 'ascender' | 'descender' | 'center' | 'baseline';
}

export type WarpStyle =
  | 'none' | 'arc' | 'arc-lower' | 'arc-upper'
  | 'arch' | 'bulge' | 'shell-lower' | 'shell-upper'
  | 'flag' | 'wave' | 'fish' | 'rise'
  | 'fisheye' | 'inflate' | 'squeeze' | 'twist';

export interface LevelsValues {
  inputBlack: number;    // 0-255
  inputWhite: number;    // 0-255
  gamma: number;         // 0.1-9.99 (midtone gamma)
  outputBlack: number;   // 0-255
  outputWhite: number;   // 0-255
}

export interface CurvePoint {
  x: number;  // 0-255 input
  y: number;  // 0-255 output
}

// curves[0] = composite (RGB), curves[1] = R, curves[2] = G, curves[3] = B
export type CurvesValues = CurvePoint[][];

export interface ColorBalanceTone {
  cyan: number;     // -100 to 100 (Cyan ↔ Red)
  magenta: number;  // -100 to 100 (Magenta ↔ Green)
  yellow: number;   // -100 to 100 (Yellow ↔ Blue)
}

export interface ColorBalanceValues {
  shadows: ColorBalanceTone;
  midtones: ColorBalanceTone;
  highlights: ColorBalanceTone;
  preserveLuminosity: boolean;
}

export type HueSatChannel = 'master' | 'reds' | 'yellows' | 'greens' | 'cyans' | 'blues' | 'magentas';

export interface HueSatTone {
  hue: number;        // -180 to 180
  saturation: number; // -100 to 100
  lightness: number;  // -100 to 100
}

export type HueSatChannelsValues = Record<HueSatChannel, HueSatTone>;

export interface AdjustmentValues {
  brightness: number;      // -100 to 100
  contrast: number;        // -100 to 100
  saturation: number;      // -100 to 100
  hue: number;             // 0 to 360
  exposure: number;        // -100 to 100
  gamma: number;           // 0.1 to 3.0
  temperature: number;     // -100 to 100
  tint: number;            // -100 to 100
  highlights: number;      // -100 to 100
  shadows: number;         // -100 to 100
  clarity: number;         // -100 to 100
  vibrance: number;        // -100 to 100
  levels: LevelsValues | null;
  curves: CurvesValues | null;
  colorBalance: ColorBalanceValues | null;
  hueSatChannels: HueSatChannelsValues | null;
}

export interface FilterPreset {
  id: string;
  name: string;
  thumbnail?: string;
  adjustments: Partial<AdjustmentValues>;
}

export interface CropData {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SelectionData {
  maskDataUrl: string;
  bounds: CropData | null;
  feather: number;
  isInverted: boolean;
}

export type AdjustmentLayerType =
  | 'brightness-contrast'
  | 'hue-saturation'
  | 'levels'
  | 'curves'
  | 'exposure'
  | 'color-balance'
  | 'threshold'
  | 'photo-filter'
  | 'black-and-white'
  | 'gradient-map'
  | 'selective-color'
  | 'channel-mixer'
  | 'vibrance'
  | 'posterize'
  | 'invert';

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  fillOpacity?: number;  // 0-100, affects layer content only (not effects). Default 100
  blendMode: BlendMode;
  imageData: string;  // base64 data URL
  x: number;
  y: number;
  width: number;
  height: number;
  // Layer type — default 'raster', 'group' for folder layers, 'adjustment' for non-destructive adjustments, 'fill' for solid/gradient/pattern
  type?: 'raster' | 'group' | 'adjustment' | 'fill';
  // Fill layer properties (type='fill')
  fillType?: 'solid' | 'gradient' | 'pattern';
  fillColor?: string;           // hex color for solid fill
  fillGradient?: { colors: string[]; angle: number; type: 'linear' | 'radial' };
  fillPattern?: { url: string; scale: number };
  // Adjustment layer properties (type='adjustment')
  adjustmentType?: AdjustmentLayerType;
  adjustmentValues?: Partial<AdjustmentValues>;
  // Group folder properties
  children?: string[];   // ordered child layer IDs (for type='group')
  isExpanded?: boolean;  // whether group is expanded in layers panel
  parentId?: string;     // parent group ID (undefined = root)
  // Advanced layer features
  mask?: LayerMask;
  clippingMask?: boolean;
  effects?: LayerEffect[];
  labelColor?: 'red' | 'blue' | 'green' | 'yellow' | 'orange' | 'purple' | 'pink' | null;
  // Phase 5: Smart Objects
  smartObject?: SmartObjectData;
  smartFilters?: SmartFilter[];
  // Phase 5: Linked Layers
  linkedGroupId?: string;         // layers with same linkedGroupId are linked
  // Phase 5: Advanced Blending (Blend If)
  blendIf?: BlendIfSettings;
}

export interface TextLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  settings: TextSettings;
}

export interface HistoryState {
  id: string;
  label: string;
  timestamp: number;
  imageData: string;  // base64 data URL of canvas state
  layers?: Layer[];
}

export interface UpscaleSettings {
  scale: 2 | 4;
  type: 'crisp' | 'creative';
}

// Phase 3 types

export interface LayerComp {
  id: string;
  name: string;
  description: string;
  layerVisibility: Record<string, boolean>;   // layerId → visible
  layerPositions: Record<string, { x: number; y: number }>;  // layerId → position
  layerStyles: Record<string, boolean>;       // layerId → effects enabled
  lastUpdated: number;
}

export interface MeasurePoint {
  x: number;
  y: number;
}

export interface MeasureLine {
  start: MeasurePoint;
  end: MeasurePoint;
  distance: number;
  angle: number;
}

export interface SwatchColor {
  id: string;
  name: string;
  color: string;
  group?: string;
}

export type ColorPickerMode = 'hsb' | 'rgb' | 'lab' | 'cmyk' | 'hex';

export interface FrameLayer {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  clipImageId?: string;  // layer ID clipped to this frame
}

// Phase 4 types

// Phase 5 types

export interface SmartObjectData {
  sourceUrl: string;         // original high-res source
  sourceType: 'embedded' | 'linked';
  linkedPath?: string;       // file path for linked smart objects
  lastModified: number;
  originalWidth: number;
  originalHeight: number;
}

export interface SmartFilter {
  id: string;
  filterType: string;        // filter function name
  params: Record<string, unknown>;
  enabled: boolean;
  blendMode: BlendMode;
  opacity: number;           // 0-100
}

export interface BlendIfSettings {
  thisLayer: { shadows: [number, number]; highlights: [number, number] };
  underlyingLayer: { shadows: [number, number]; highlights: [number, number] };
  channel: 'gray' | 'red' | 'green' | 'blue';
}

// Phase 11-B: History Snapshots
export interface HistorySnapshot {
  id: string;
  name: string;
  imageData: string;    // base64 data URL of canvas state
  layers: Layer[];       // layer state at snapshot time
  timestamp: number;
}

// Phase 6 types

export interface BrushPreset {
  id: string;
  name: string;
  category: string;
  settings: BrushSettings;
  tipImage?: string;           // data URL for custom brush tip
  dynamics?: BrushDynamics;
}

export interface BrushDynamics {
  sizeJitter: number;          // 0-100 random size variation
  angleJitter: number;         // 0-360 random angle variation
  scatterX: number;            // 0-1000 horizontal scatter
  scatterY: number;            // 0-1000 vertical scatter
  spacing: number;             // 1-500% spacing between stamps
  opacityJitter: number;       // 0-100 random opacity variation
  flowJitter: number;          // 0-100 random flow variation
  roundnessJitter: number;     // 0-100 random roundness variation
  minimumDiameter: number;     // 0-100% minimum size
  pressureSensitive: boolean;
}

export type SymmetryMode = 'none' | 'vertical' | 'horizontal' | 'dual' | 'radial-3' | 'radial-4' | 'radial-6' | 'radial-8' | 'mandala';

export interface CloneSourceSettings {
  offsetX: number;
  offsetY: number;
  angle: number;               // 0-360
  scale: number;               // 25-500%
  showOverlay: boolean;
  overlayOpacity: number;      // 0-100
}

export interface NoteAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
  author: string;
  color: string;
  createdAt: number;
  isCollapsed: boolean;
}

export interface Artboard {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor: string;
  layerIds: string[];
}

export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'tiff' | 'bmp' | 'svg' | 'pdf' | 'psd';

export interface ExportSettings {
  format: ExportFormat;
  quality: number;          // 0-100 (JPEG/WebP)
  scale: number;            // export scale factor (0.25-4)
  colorSpace: 'srgb' | 'adobe-rgb' | 'display-p3';
  metadata: boolean;        // include EXIF metadata
  transparency: boolean;    // preserve transparency (PNG/WebP)
  interlaced: boolean;      // progressive/interlaced
}

export interface BatchProcessingTask {
  id: string;
  name: string;
  actionSetId: string;      // action set to apply
  sourceFiles: string[];     // file paths or URLs
  outputFolder: string;
  outputFormat: ExportFormat;
  outputQuality: number;
  status: 'pending' | 'running' | 'completed' | 'error';
  progress: number;          // 0-100
  processedCount: number;
  totalCount: number;
  errors: string[];
}

export interface ConditionalAction {
  id: string;
  condition: ConditionalActionCondition;
  thenActionId: string;      // action set to run if true
  elseActionId?: string;     // action set to run if false
}

export type ConditionalActionCondition =
  | { type: 'document-mode'; value: 'rgb' | 'cmyk' | 'grayscale' }
  | { type: 'document-profile'; value: string }
  | { type: 'layer-name-contains'; value: string }
  | { type: 'document-width-greater'; value: number }
  | { type: 'document-height-greater'; value: number }
  | { type: 'layer-is-type'; value: 'raster' | 'group' | 'adjustment' | 'fill' };

// ==================== Default Values ====================

export const DEFAULT_BRUSH_SETTINGS: BrushSettings = {
  size: 20,
  hardness: 100,
  opacity: 100,
  flow: 100,
  color: '#000000',
  blendMode: 'normal',
};

export const DEFAULT_TEXT_SETTINGS: TextSettings = {
  fontFamily: 'Arial',
  fontSize: 24,
  fontWeight: 'normal',
  fontStyle: 'normal',
  color: '#000000',
  alignment: 'left',
  lineHeight: 1.2,
  letterSpacing: 0,
};

export const DEFAULT_LEVELS: LevelsValues = {
  inputBlack: 0,
  inputWhite: 255,
  gamma: 1.0,
  outputBlack: 0,
  outputWhite: 255,
};

const NEUTRAL_COLOR_BALANCE_TONE: ColorBalanceTone = { cyan: 0, magenta: 0, yellow: 0 };
export const DEFAULT_COLOR_BALANCE: ColorBalanceValues = {
  shadows: { ...NEUTRAL_COLOR_BALANCE_TONE },
  midtones: { ...NEUTRAL_COLOR_BALANCE_TONE },
  highlights: { ...NEUTRAL_COLOR_BALANCE_TONE },
  preserveLuminosity: true,
};

const NEUTRAL_HUE_SAT_TONE: HueSatTone = { hue: 0, saturation: 0, lightness: 0 };
export const DEFAULT_HUE_SAT_CHANNELS: HueSatChannelsValues = {
  master: { ...NEUTRAL_HUE_SAT_TONE },
  reds: { ...NEUTRAL_HUE_SAT_TONE },
  yellows: { ...NEUTRAL_HUE_SAT_TONE },
  greens: { ...NEUTRAL_HUE_SAT_TONE },
  cyans: { ...NEUTRAL_HUE_SAT_TONE },
  blues: { ...NEUTRAL_HUE_SAT_TONE },
  magentas: { ...NEUTRAL_HUE_SAT_TONE },
};

export const DEFAULT_ADJUSTMENTS: AdjustmentValues = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  exposure: 0,
  gamma: 1.0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  clarity: 0,
  vibrance: 0,
  levels: null,
  curves: null,
  colorBalance: null,
  hueSatChannels: null,
};

export const DEFAULT_UPSCALE_SETTINGS: UpscaleSettings = {
  scale: 2,
  type: 'crisp',
};

export const DEFAULT_GRADIENT_SETTINGS: GradientSettings = {
  type: 'linear',
  colorStops: [
    { offset: 0, color: '#000000' },
    { offset: 1, color: '#ffffff' },
  ],
  angle: 0,
  reverse: false,
};

export const DEFAULT_SHAPE_SETTINGS: ShapeSettings = {
  fillColor: '#3b82f6',
  fillEnabled: true,
  strokeColor: '#1e40af',
  strokeWidth: 2,
  strokeEnabled: true,
  cornerRadius: 0,
  sides: 6,
  innerRadius: 50,
};

export const DEFAULT_DROP_SHADOW: DropShadowSettings = {
  color: '#000000',
  offsetX: 4,
  offsetY: 4,
  blur: 8,
  spread: 0,
  opacity: 50,
};

export const DEFAULT_GLOW: GlowSettings = {
  color: '#ffffff',
  size: 10,
  opacity: 75,
};

export const DEFAULT_BEVEL: BevelSettings = {
  style: 'outer',
  depth: 2,
  size: 5,
  softness: 0,
  angle: 135,
  highlightColor: '#ffffff',
  shadowColor: '#000000',
};

// ==================== Filter Presets ====================

export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'none', name: 'Original', adjustments: {} },
  { id: 'vivid', name: 'Vivid', adjustments: { saturation: 30, contrast: 15, vibrance: 20 } },
  { id: 'warm', name: 'Warm', adjustments: { temperature: 30, tint: 10 } },
  { id: 'cool', name: 'Cool', adjustments: { temperature: -30, tint: -10 } },
  { id: 'bw', name: 'B&W', adjustments: { saturation: -100 } },
  { id: 'sepia', name: 'Sepia', adjustments: { saturation: -80, temperature: 40, tint: 20 } },
  { id: 'dramatic', name: 'Dramatic', adjustments: { contrast: 40, clarity: 30, shadows: -20 } },
  { id: 'faded', name: 'Faded', adjustments: { contrast: -20, brightness: 10, saturation: -30 } },
  { id: 'vintage', name: 'Vintage', adjustments: { saturation: -20, temperature: 20, contrast: -15, brightness: 5 } },
  { id: 'cinematic', name: 'Cinematic', adjustments: { contrast: 20, temperature: -10, tint: 5, shadows: 10 } },
];

// ==================== Store State ====================

export interface ImageEditorState {
  // Editor state
  isEditorOpen: boolean;
  isCanvasReady: boolean;
  sourceAsset: IrisAsset | null;
  originalImageUrl: string | null;
  
  // Canvas state
  zoom: number;
  panOffset: { x: number; y: number };
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  isSpacePanning: boolean;
  navigationTool: 'none' | 'hand' | 'zoom';

  // Edit mode
  editMode: EditMode;
  previousMode: EditMode;

  // Tools
  activeTool: DrawTool;
  selectionTool: SelectionTool;
  shapeTool: ShapeTool;
  lastUsedToolPerGroup: Record<string, string>;
  brushSettings: BrushSettings;
  backgroundColor: string;  // Background color (Photoshop D/X shortcut)
  dodgeBurnSettings: DodgeBurnSettings;
  spongeMode: SpongeMode;
  localAdjustStrength: number;  // 0-100 (for smudge/blur/sharpen)
  textSettings: TextSettings;
  gradientSettings: GradientSettings;
  shapeSettings: ShapeSettings;
  
  // Adjustments
  adjustments: AdjustmentValues;
  activeFilterPreset: string;
  filterIntensity: number;
  
  // Selection
  selection: SelectionData | null;
  selectionMode: 'new' | 'add' | 'subtract' | 'intersect';
  selectionFeather: number;
  selectionAntiAlias: boolean;
  selectionTolerance: number;
  selectionContiguous: boolean;
  quickSelectBrushSize: number;
  quickSelectSampleAll: boolean;
  colorRangeColor: string | null;
  colorRangeTolerance: number;
  colorRangeFuzziness: number;

  // Crop
  cropData: CropData | null;
  cropAspectRatio: 'free' | '1:1' | '4:3' | '16:9' | '3:2' | '5:4' | '3:4' | '9:16' | '2:3';
  _cropApplyCallback: (() => void) | null;

  // Callbacks for apply actions
  _adjustmentsApplyCallback: (() => void) | null;
  _transformsApplyCallback: (() => void) | null;
  _filterApplyCallback: ((filterFn: (imageData: ImageData) => ImageData, label: string) => void) | null;

  // Warp transform
  isWarpMode: boolean;
  warpGrid: { x: number; y: number }[][] | null; // 3×3 grid in pixel coords

  // Layers
  layers: Layer[];
  activeLayerId: string | null;
  
  // Text layers
  textLayers: TextLayer[];
  activeTextLayerId: string | null;
  
  // History (Undo/Redo)
  history: HistoryState[];
  historyIndex: number;
  maxHistoryStates: number;
  
  // AI Processing
  isProcessing: boolean;
  processingProgress: number;
  processingMessage: string;
  upscaleSettings: UpscaleSettings;
  
  // Mask for AI modes (inpaint/outpaint)
  maskDataUrl: string | null;
  prompt: string;
  negativePrompt: string;
  
  // Document settings
  documentDpi: number;

  // Dirty tracking
  isDirty: boolean;

  // UI state
  showGrid: boolean;
  showRulers: boolean;
  showGuides: boolean;
  snapToGrid: boolean;
  gridSize: number;
  guides: { horizontal: number[]; vertical: number[] };

  // Panel visibility
  showLayersPanel: boolean;
  showHistoryPanel: boolean;
  showImageInfoPanel: boolean;
  showChannelsPanel: boolean;
  showPathsPanel: boolean;
  rightPanelTab: RightPanelTab;

  // Channels
  activeChannelId: ColorChannelId;
  channelVisibility: Record<ColorChannelId, boolean>;
  alphaChannels: AlphaChannel[];
  activeAlphaChannelId: string | null;

  // Paths
  paths: VectorPath[];
  activePathId: string | null;
  penToolMode: 'create' | 'edit';
  activePointIndex: number | null;
  isDraggingHandle: 'in' | 'out' | null;

  // Histogram
  showHistogramPanel: boolean;
  histogramData: HistogramData | null;

  // Color profile / CMYK preview
  colorProofing: boolean;        // View → Proof Colors (Ctrl+Y)
  gamutWarning: boolean;         // View → Gamut Warning (Ctrl+Shift+Y)
  colorProfile: string;          // active CMYK profile name

  // Phase 3: Quick Mask
  quickMaskEnabled: boolean;
  quickMaskColor: string;        // overlay color (default red)
  quickMaskOpacity: number;      // 0-100

  // Phase 3: Layer Comps
  layerComps: LayerComp[];
  activeLayerCompId: string | null;

  // Phase 3: Measure Tool
  measureLine: MeasureLine | null;

  // Phase 3: Swatches
  swatches: SwatchColor[];

  // Phase 3: Color Picker
  colorPickerMode: ColorPickerMode;

  // Phase 3: Frame Tool
  frames: FrameLayer[];
  activeFrameId: string | null;

  // Phase 3: Crop extended aspect ratios
  cropOverlay: 'none' | 'rule-of-thirds' | 'grid' | 'diagonal' | 'golden-ratio';

  // Phase 4: Custom Shapes
  customShapes: CustomShapeDefinition[];
  activeCustomShapeId: string | null;

  // Phase 4: Export settings
  exportSettings: ExportSettings;

  // Phase 4: Batch Processing
  batchTasks: BatchProcessingTask[];

  // Phase 4: Conditional Actions
  conditionalActions: ConditionalAction[];

  // Phase 5: Linked layers tracking
  linkedGroups: Record<string, string[]>;  // groupId → layerIds

  // Phase 6: Navigator / Views
  navigatorZoom: number;
  multipleViews: string[];                  // list of view IDs

  // Phase 6: Brush presets & dynamics
  brushPresets: BrushPreset[];
  activeBrushPresetId: string | null;
  brushDynamics: BrushDynamics | null;
  symmetryMode: SymmetryMode;

  // Phase 6: Clone Source
  cloneSource: CloneSourceSettings;

  // Phase 6: Notes
  notes: NoteAnnotation[];

  // Phase 6: Artboards
  artboards: Artboard[];
  activeArtboardId: string | null;

  // Phase 11-B: History Snapshots
  historySnapshots: HistorySnapshot[];

  // Phase 11-B: Smart Guides
  smartGuidesEnabled: boolean;

  // Active snap lines (transient, for overlay rendering during move)
  activeSnapLines: { orientation: 'h' | 'v'; position: number }[];

  // Canvas document dimensions (set on editor open, used for layer merging)
  canvasWidth: number;
  canvasHeight: number;
}

export interface ImageEditorActions {
  // Editor lifecycle
  openEditor: (asset: IrisAsset) => void;
  openEditorWithLayers: (asset: IrisAsset | null, layers: Layer[], compositeUrl: string, width: number, height: number, textLayers?: TextLayer[]) => void;
  closeEditor: () => void;
  resetEditor: () => void;
  setCanvasReady: (ready: boolean) => void;

  // Canvas controls
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  zoomTo100: () => void;
  setPanOffset: (offset: { x: number; y: number }) => void;
  setRotation: (rotation: number, markDirty?: boolean) => void;
  setFlipHorizontal: (flip: boolean) => void;
  setFlipVertical: (flip: boolean) => void;
  toggleFlipHorizontal: () => void;
  toggleFlipVertical: () => void;
  resetAllTransforms: () => void;
  setIsSpacePanning: (value: boolean) => void;
  setNavigationTool: (tool: 'none' | 'hand' | 'zoom') => void;

  // Mode & tools
  setEditMode: (mode: EditMode) => void;
  setActiveTool: (tool: DrawTool) => void;
  setSelectionTool: (tool: SelectionTool) => void;
  setShapeTool: (tool: ShapeTool) => void;
  setLastUsedToolForGroup: (groupId: string, toolId: string) => void;
  setBrushSettings: (settings: Partial<BrushSettings>) => void;
  setBackgroundColor: (color: string) => void;
  resetDefaultColors: () => void;
  swapColors: () => void;
  setDodgeBurnSettings: (settings: Partial<DodgeBurnSettings>) => void;
  setSpongeMode: (mode: SpongeMode) => void;
  setLocalAdjustStrength: (strength: number) => void;
  setTextSettings: (settings: Partial<TextSettings>) => void;
  setGradientSettings: (settings: Partial<GradientSettings>) => void;
  setShapeSettings: (settings: Partial<ShapeSettings>) => void;
  
  // Adjustments
  setAdjustment: (key: keyof AdjustmentValues, value: number) => void;
  setAdjustments: (adjustments: Partial<AdjustmentValues>) => void;
  resetAdjustments: () => void;
  applyFilterPreset: (presetId: string) => void;
  setFilterIntensity: (intensity: number) => void;
  applyAdjustments: () => void;
  registerAdjustmentsApplyCallback: (callback: (() => void) | null) => void;

  // Filter apply callback
  applyCanvasFilter: (filterFn: (imageData: ImageData) => ImageData, label?: string) => void;
  registerFilterApplyCallback: (callback: ((filterFn: (imageData: ImageData) => ImageData, label: string) => void) | null) => void;

  // Transform callbacks
  applyTransforms: () => void;
  registerTransformsApplyCallback: (callback: (() => void) | null) => void;

  // Warp transform
  enterWarpMode: () => void;
  exitWarpMode: () => void;
  updateWarpPoint: (row: number, col: number, x: number, y: number) => void;
  resetWarpGrid: () => void;
  applyWarp: () => Promise<void>;

  // Selection
  setSelection: (selection: SelectionData | null) => void;
  invertSelection: () => Promise<void>;
  clearSelection: () => void;
  setSelectionMode: (mode: 'new' | 'add' | 'subtract' | 'intersect') => void;
  setSelectionFeather: (feather: number) => void;
  setSelectionAntiAlias: (value: boolean) => void;
  setSelectionTolerance: (tolerance: number) => void;
  setSelectionContiguous: (value: boolean) => void;
  setQuickSelectBrushSize: (size: number) => void;
  setQuickSelectSampleAll: (value: boolean) => void;
  setColorRangeColor: (color: string | null) => void;
  setColorRangeTolerance: (value: number) => void;
  setColorRangeFuzziness: (value: number) => void;
  selectSubject: () => Promise<void>;
  selectLayerPixels: (layerId: string) => Promise<void>;
  refineEdge: (options: { radius: number; smoothing: number; feather: number; contrast: number }) => void;
  contentAwareFill: () => Promise<void>;

  // Crop
  setCropData: (data: CropData | null) => void;
  setCropAspectRatio: (ratio: 'free' | '1:1' | '4:3' | '16:9' | '3:2' | '5:4' | '3:4' | '9:16' | '2:3') => void;
  applyCrop: () => void;
  registerCropApplyCallback: (callback: (() => void) | null) => void;
  _cropApplyCallback: (() => void) | null;
  
  // Layers
  addLayer: (imageData: string, name?: string) => string;
  addLayerFromUrl: (imageUrl: string, name?: string) => Promise<string | null>;
  removeLayer: (layerId: string) => void;
  updateLayer: (layerId: string, updates: Partial<Layer>) => void;
  setActiveLayer: (layerId: string | null) => void;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
  duplicateLayer: (layerId: string) => string | null;
  mergeLayerDown: (layerId: string) => void;
  flattenLayers: () => Promise<void>;

  // Layer groups
  createLayerGroup: (name?: string) => string;
  moveLayerToGroup: (layerId: string, groupId: string | null) => void;
  toggleGroupExpansion: (groupId: string) => void;
  ungroupLayers: (groupId: string) => void;

  // Adjustment layers
  addAdjustmentLayer: (adjustmentType: AdjustmentLayerType, values?: Partial<AdjustmentValues>) => string;
  updateAdjustmentLayer: (layerId: string, values: Partial<AdjustmentValues>) => void;

  // Layer masks
  addLayerMask: (layerId: string, maskData?: string) => void;
  removeLayerMask: (layerId: string) => void;
  toggleLayerMask: (layerId: string) => void;
  updateLayerMask: (layerId: string, maskData: string) => void;

  // Layer effects
  addLayerEffect: (layerId: string, effect: LayerEffect) => void;
  removeLayerEffect: (layerId: string, effectType: LayerEffectType) => void;
  updateLayerEffect: (layerId: string, effectType: LayerEffectType, settings: Partial<LayerEffect['settings']>) => void;
  toggleLayerEffect: (layerId: string, effectType: LayerEffectType) => void;

  // Clipping mask
  toggleClippingMask: (layerId: string) => void;
  
  // Text layers
  addTextLayer: (text: string, x: number, y: number) => string;
  removeTextLayer: (layerId: string) => void;
  updateTextLayer: (layerId: string, updates: Partial<TextLayer>) => void;
  setActiveTextLayer: (layerId: string | null) => void;
  
  // History
  pushHistory: (label: string, imageData: string, markDirty?: boolean) => void;
  undo: () => void;
  redo: () => void;
  goToHistoryState: (index: number) => void;
  clearHistory: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  
  // AI Processing
  setProcessing: (isProcessing: boolean, message?: string) => void;
  setProcessingProgress: (progress: number) => void;
  setUpscaleSettings: (settings: Partial<UpscaleSettings>) => void;
  setMaskDataUrl: (maskDataUrl: string | null) => void;
  setPrompt: (prompt: string) => void;
  setNegativePrompt: (negativePrompt: string) => void;
  
  // Dirty tracking
  markDirty: () => void;
  clearDirty: () => void;

  // UI toggles
  toggleGrid: () => void;
  toggleRulers: () => void;
  toggleGuides: () => void;
  toggleSnapToGrid: () => void;
  setGridSize: (size: number) => void;
  addGuide: (orientation: 'horizontal' | 'vertical', position: number) => void;
  removeGuide: (orientation: 'horizontal' | 'vertical', index: number) => void;
  clearGuides: () => void;

  // Panel visibility
  toggleLayersPanel: () => void;
  toggleHistoryPanel: () => void;
  toggleImageInfoPanel: () => void;
  toggleChannelsPanel: () => void;
  togglePathsPanel: () => void;
  toggleHistogramPanel: () => void;
  setHistogramData: (data: HistogramData | null) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;

  // Channels
  setActiveChannel: (channelId: ColorChannelId) => void;
  toggleChannelVisibility: (channelId: ColorChannelId) => void;
  saveSelectionAsChannel: () => void;
  loadChannelAsSelection: (channelId: string) => void;
  deleteAlphaChannel: (channelId: string) => void;
  toggleAlphaChannelVisibility: (channelId: string) => void;

  // Paths
  addPath: (name?: string) => string;
  deletePath: (pathId: string) => void;
  setActivePath: (pathId: string | null) => void;
  updatePath: (pathId: string, updates: Partial<VectorPath>) => void;
  addPathPoint: (pathId: string, point: PathPoint) => void;
  fillPath: (pathId: string) => void;
  strokePath: (pathId: string) => void;
  loadPathAsSelection: (pathId: string) => void;
  setPenToolMode: (mode: 'create' | 'edit') => void;
  setActivePointIndex: (index: number | null) => void;
  updatePathPoint: (pathId: string, pointIndex: number, updates: Partial<PathPoint>) => void;
  insertPathPoint: (pathId: string, afterIndex: number, point: PathPoint) => void;
  removePathPoint: (pathId: string, pointIndex: number) => void;
  closePath: (pathId: string) => void;

  // Color profile / CMYK preview
  toggleColorProofing: () => void;
  toggleGamutWarning: () => void;
  setColorProfile: (profileName: string) => void;

  // Selection modify (Phase 1)
  expandSelectionBy: (amount: number) => void;
  contractSelectionBy: (amount: number) => void;
  smoothSelectionBy: (radius: number) => void;
  borderSelectionBy: (width: number) => void;
  growSelectionByColor: () => void;
  selectSimilar: () => void;

  // Layer operations (Phase 1)
  stampVisible: () => void;

  // Canvas/Image operations (Phase 1)
  resizeCanvas: (width: number, height: number, anchor: string) => void;
  resizeImage: (width: number, height: number, resampleMethod: string) => void;
  setDocumentDpi: (dpi: number) => void;
  documentDpi: number;

  // Phase 3: Quick Mask
  toggleQuickMask: () => void;
  setQuickMaskColor: (color: string) => void;
  setQuickMaskOpacity: (opacity: number) => void;

  // Phase 3: Layer Comps
  addLayerComp: (name: string, description?: string) => void;
  updateLayerComp: (id: string) => void;
  applyLayerComp: (id: string) => void;
  deleteLayerComp: (id: string) => void;

  // Phase 3: Fill Layers
  addFillLayer: (fillType: 'solid' | 'gradient' | 'pattern', options?: Partial<Layer>) => void;

  // Phase 3: Measure Tool
  setMeasureLine: (line: MeasureLine | null) => void;

  // Phase 3: Transform Selection
  transformSelection: (type: 'scale' | 'rotate' | 'move', values: Record<string, number>) => void;

  // Phase 3: Color Range (advanced)
  selectByColorRange: (color: string, fuzziness: number, range?: 'shadows' | 'midtones' | 'highlights' | 'all') => void;

  // Phase 3: Frame Tool
  addFrame: (x: number, y: number, width: number, height: number) => void;
  deleteFrame: (id: string) => void;
  setActiveFrame: (id: string | null) => void;
  clipLayerToFrame: (layerId: string, frameId: string) => void;

  // Phase 3: Swatches
  addSwatch: (name: string, color: string, group?: string) => void;
  deleteSwatch: (id: string) => void;
  loadSwatchPreset: (preset: 'default' | 'pastel' | 'web-safe' | 'pantone') => void;

  // Phase 3: Color Picker
  setColorPickerMode: (mode: ColorPickerMode) => void;

  // Phase 3: Crop overlay
  setCropOverlay: (overlay: 'none' | 'rule-of-thirds' | 'grid' | 'diagonal' | 'golden-ratio') => void;

  // Phase 3: Object Selection (AI-assisted)
  objectSelect: (bounds: CropData) => void;

  // Phase 3: Patch Tool
  patchArea: (sourceRect: CropData, targetRect: CropData) => void;

  // Phase 4: Text enhancements
  setTextType: (type: 'point' | 'paragraph') => void;
  setParagraphSize: (width: number, height: number) => void;
  setWarpStyle: (style: WarpStyle, bend?: number) => void;
  setTypeOnPath: (pathId: string | undefined) => void;

  // Phase 4: Custom Shapes
  addCustomShape: (shape: CustomShapeDefinition) => void;
  setActiveCustomShape: (id: string | null) => void;

  // Phase 4: Path Operations
  combinePaths: (pathIds: string[], operation: PathOperation) => void;

  // Phase 4: Export
  setExportSettings: (settings: Partial<ExportSettings>) => void;
  exportAs: (format: ExportFormat) => void;

  // Phase 4: SVG Import
  importSvg: (svgString: string) => void;

  // Phase 4: Batch Processing
  addBatchTask: (task: Omit<BatchProcessingTask, 'id' | 'status' | 'progress' | 'processedCount' | 'errors'>) => void;
  runBatchTask: (taskId: string) => void;
  cancelBatchTask: (taskId: string) => void;

  // Phase 4: Conditional Actions
  addConditionalAction: (action: Omit<ConditionalAction, 'id'>) => void;
  removeConditionalAction: (id: string) => void;

  // Phase 5: Smart Objects
  convertToSmartObject: (layerId: string) => void;
  rasterizeSmartObject: (layerId: string) => void;
  editSmartObjectSource: (layerId: string) => void;

  // Phase 5: Smart Filters
  addSmartFilter: (layerId: string, filterType: string, params: Record<string, unknown>) => void;
  removeSmartFilter: (layerId: string, filterId: string) => void;
  toggleSmartFilter: (layerId: string, filterId: string) => void;
  reorderSmartFilters: (layerId: string, fromIndex: number, toIndex: number) => void;

  // Phase 5: Linked Layers
  linkLayers: (layerIds: string[]) => void;
  unlinkLayers: (layerIds: string[]) => void;

  // Phase 5: Advanced Blending (Blend If)
  setBlendIf: (layerId: string, settings: BlendIfSettings | undefined) => void;

  // Phase 5: Content-Aware Move
  contentAwareMove: (sourceRect: CropData, targetX: number, targetY: number) => void;

  // Phase 6: Brush Presets
  addBrushPreset: (preset: Omit<BrushPreset, 'id'>) => void;
  deleteBrushPreset: (id: string) => void;
  applyBrushPreset: (id: string) => void;
  setBrushDynamics: (dynamics: BrushDynamics | null) => void;

  // Phase 6: Symmetry Painting
  setSymmetryMode: (mode: SymmetryMode) => void;

  // Phase 6: Clone Source
  setCloneSource: (settings: Partial<CloneSourceSettings>) => void;

  // Phase 6: Notes
  addNote: (x: number, y: number, text: string) => void;
  updateNote: (id: string, updates: Partial<NoteAnnotation>) => void;
  deleteNote: (id: string) => void;

  // Phase 6: Artboards
  addArtboard: (name: string, x: number, y: number, width: number, height: number) => void;
  deleteArtboard: (id: string) => void;
  setActiveArtboard: (id: string | null) => void;
  renameArtboard: (id: string, name: string) => void;

  // Phase 11-B: History Snapshots
  createHistorySnapshot: (name: string) => void;
  restoreHistorySnapshot: (id: string) => void;
  deleteHistorySnapshot: (id: string) => void;

  // Phase 11-B: Layer Align/Distribute
  alignLayers: (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom', layerIds: string[]) => void;
  distributeLayers: (distribution: 'horizontal' | 'vertical', layerIds: string[]) => void;

  // Phase 11-B: Smart Guides & Guide Layout
  toggleSmartGuides: () => void;
  createGuideLayout: (columns: number, rows: number, gutterWidth: number, gutterHeight: number) => void;
  setActiveSnapLines: (lines: { orientation: 'h' | 'v'; position: number }[]) => void;
}

// ==================== Initial State ====================

const initialState: ImageEditorState = {
  isEditorOpen: false,
  isCanvasReady: false,
  sourceAsset: null,
  originalImageUrl: null,
  
  zoom: 100,
  panOffset: { x: 0, y: 0 },
  rotation: 0,
  flipHorizontal: false,
  flipVertical: false,
  isSpacePanning: false,
  navigationTool: 'none' as const,

  editMode: 'move',
  previousMode: 'move',

  activeTool: 'brush',
  backgroundColor: '#ffffff',
  selectionTool: 'rectangle',
  shapeTool: 'rectangle',
  lastUsedToolPerGroup: {
    marquee: 'rectangle',
    lasso: 'lasso',
    wand: 'magicWand',
    eyedropper: 'eyedropper',
    healing: 'spot-healing',
    stamp: 'clone',
    brush: 'brush',
    eraser: 'eraser',
    gradient: 'gradient',
    blur: 'blur-brush',
    dodge: 'dodge',
  },
  brushSettings: { ...DEFAULT_BRUSH_SETTINGS },
  dodgeBurnSettings: { range: 'midtones', exposure: 50 },
  spongeMode: 'saturate',
  localAdjustStrength: 50,
  textSettings: { ...DEFAULT_TEXT_SETTINGS },
  gradientSettings: { ...DEFAULT_GRADIENT_SETTINGS },
  shapeSettings: { ...DEFAULT_SHAPE_SETTINGS },
  
  adjustments: { ...DEFAULT_ADJUSTMENTS },
  activeFilterPreset: 'none',
  filterIntensity: 100,

  selection: null,
  selectionMode: 'new' as const,
  selectionFeather: 0,
  selectionAntiAlias: true,
  selectionTolerance: 32,
  selectionContiguous: true,
  quickSelectBrushSize: 20,
  quickSelectSampleAll: false,
  colorRangeColor: null,
  colorRangeTolerance: 32,
  colorRangeFuzziness: 0,

  cropData: null,
  cropAspectRatio: 'free',
  _cropApplyCallback: null,
  _adjustmentsApplyCallback: null,
  _transformsApplyCallback: null,
  _filterApplyCallback: null,

  isWarpMode: false,
  warpGrid: null,

  layers: [],
  activeLayerId: null,
  
  textLayers: [],
  activeTextLayerId: null,
  
  history: [],
  historyIndex: -1,
  maxHistoryStates: 50,
  
  documentDpi: 72,

  isProcessing: false,
  processingProgress: 0,
  processingMessage: '',
  upscaleSettings: { ...DEFAULT_UPSCALE_SETTINGS },
  
  maskDataUrl: null,
  prompt: '',
  negativePrompt: '',
  
  isDirty: false,

  showGrid: false,
  showRulers: false,
  showGuides: false,
  snapToGrid: false,
  gridSize: 10,
  guides: { horizontal: [], vertical: [] },

  showLayersPanel: true,
  showHistoryPanel: true,
  showImageInfoPanel: false,
  showHistogramPanel: true,
  showChannelsPanel: true,
  showPathsPanel: true,
  histogramData: null,
  rightPanelTab: 'layers',

  activeChannelId: 'rgb',
  channelVisibility: { rgb: true, red: true, green: true, blue: true },
  alphaChannels: [],
  activeAlphaChannelId: null,

  paths: [],
  activePathId: null,
  penToolMode: 'create',
  activePointIndex: null,
  isDraggingHandle: null,

  colorProofing: false,
  gamutWarning: false,
  colorProfile: 'U.S. Web Coated (SWOP) v2',

  // Phase 3
  quickMaskEnabled: false,
  quickMaskColor: '#ff0000',
  quickMaskOpacity: 50,
  layerComps: [],
  activeLayerCompId: null,
  measureLine: null,
  swatches: [
    { id: 'sw-1', name: 'Black', color: '#000000' },
    { id: 'sw-2', name: 'White', color: '#ffffff' },
    { id: 'sw-3', name: 'Red', color: '#ff0000' },
    { id: 'sw-4', name: 'Green', color: '#00ff00' },
    { id: 'sw-5', name: 'Blue', color: '#0000ff' },
    { id: 'sw-6', name: 'Yellow', color: '#ffff00' },
    { id: 'sw-7', name: 'Cyan', color: '#00ffff' },
    { id: 'sw-8', name: 'Magenta', color: '#ff00ff' },
  ],
  colorPickerMode: 'hsb',
  frames: [],
  activeFrameId: null,
  cropOverlay: 'none',

  // Phase 4
  customShapes: [
    { id: 'cs-heart', name: 'Heart', category: 'Basic', pathData: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' },
    { id: 'cs-triangle', name: 'Triangle', category: 'Basic', pathData: 'M12 2 L22 22 L2 22 Z' },
    { id: 'cs-diamond', name: 'Diamond', category: 'Basic', pathData: 'M12 2 L22 12 L12 22 L2 12 Z' },
    { id: 'cs-cross', name: 'Cross', category: 'Basic', pathData: 'M8 2h8v6h6v8h-6v6H8v-6H2v-8h6z' },
    { id: 'cs-hexagon', name: 'Hexagon', category: 'Basic', pathData: 'M12 2 L21.66 7 L21.66 17 L12 22 L2.34 17 L2.34 7 Z' },
    { id: 'cs-chat', name: 'Chat Bubble', category: 'UI', pathData: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z' },
    { id: 'cs-arrow-r', name: 'Arrow Right', category: 'Arrows', pathData: 'M5 3v18l15-9z' },
    { id: 'cs-badge', name: 'Badge', category: 'Shapes', pathData: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
  ],
  activeCustomShapeId: null,
  exportSettings: {
    format: 'png',
    quality: 90,
    scale: 1,
    colorSpace: 'srgb',
    metadata: true,
    transparency: true,
    interlaced: false,
  },
  batchTasks: [],
  conditionalActions: [],

  // Phase 5
  linkedGroups: {},

  // Phase 6
  navigatorZoom: 100,
  multipleViews: [],
  brushPresets: [
    { id: 'bp-soft-round', name: 'Soft Round', category: 'General', settings: { size: 20, hardness: 0, opacity: 100, flow: 100, color: '#000000', blendMode: 'normal' } },
    { id: 'bp-hard-round', name: 'Hard Round', category: 'General', settings: { size: 20, hardness: 100, opacity: 100, flow: 100, color: '#000000', blendMode: 'normal' } },
    { id: 'bp-airbrush', name: 'Airbrush', category: 'General', settings: { size: 50, hardness: 0, opacity: 30, flow: 20, color: '#000000', blendMode: 'normal' } },
    { id: 'bp-chalk', name: 'Chalk', category: 'Dry Media', settings: { size: 30, hardness: 50, opacity: 80, flow: 60, color: '#000000', blendMode: 'normal' } },
    { id: 'bp-charcoal', name: 'Charcoal', category: 'Dry Media', settings: { size: 40, hardness: 30, opacity: 70, flow: 50, color: '#1a1a1a', blendMode: 'normal' } },
    { id: 'bp-watercolor', name: 'Watercolor', category: 'Wet Media', settings: { size: 60, hardness: 0, opacity: 40, flow: 30, color: '#000000', blendMode: 'multiply' } },
    { id: 'bp-ink', name: 'Ink', category: 'Wet Media', settings: { size: 5, hardness: 100, opacity: 100, flow: 100, color: '#000000', blendMode: 'normal' } },
    { id: 'bp-spatter', name: 'Spatter', category: 'Special', settings: { size: 25, hardness: 60, opacity: 90, flow: 80, color: '#000000', blendMode: 'normal' } },
  ],
  activeBrushPresetId: null,
  brushDynamics: null,
  symmetryMode: 'none',
  cloneSource: { offsetX: 0, offsetY: 0, angle: 0, scale: 100, showOverlay: false, overlayOpacity: 50 },
  notes: [],
  artboards: [],
  activeArtboardId: null,

  // Phase 11-B
  historySnapshots: [],
  smartGuidesEnabled: true,
  activeSnapLines: [],

  canvasWidth: 0,
  canvasHeight: 0,
};

// ==================== Slice Creator (used by factory) ====================

type SetState = StoreApi<ImageEditorState & ImageEditorActions>['setState'];
type GetState = StoreApi<ImageEditorState & ImageEditorActions>['getState'];

/**
 * The (set, get, api) => ({...}) body shared by every store instance.
 * Exported for `imageEditorFactory.ts` — not intended for direct consumption.
 */
export function _createImageEditorSlice(
  set: SetState,
  get: GetState,
  _api: StoreApi<ImageEditorState & ImageEditorActions>,
): ImageEditorState & ImageEditorActions {
  return {
    ...initialState,

    // ==================== Editor Lifecycle ====================

    openEditor: (asset) => {
      const imageUrl = asset.previewUrl || asset.publicUrl || asset.thumbnailUrl || '';
      set({
        isEditorOpen: true,
        isCanvasReady: false,
        sourceAsset: asset,
        originalImageUrl: imageUrl,
        editMode: 'move',
        zoom: 100,
        panOffset: { x: 0, y: 0 },
        rotation: 0,
        flipHorizontal: false,
        flipVertical: false,
        history: [],
        historyIndex: -1,
        layers: [],
        activeLayerId: null,
        textLayers: [],
        activeTextLayerId: null,
        adjustments: { ...DEFAULT_ADJUSTMENTS },
        activeFilterPreset: 'none',
        filterIntensity: 100,
        selection: null,
        cropData: null,
        maskDataUrl: null,
        prompt: '',
        negativePrompt: '',
        isDirty: false,
        canvasWidth: 0,  // Will be set by EditorCanvas on image load
        canvasHeight: 0,
      });
    },

    openEditorWithLayers: (asset, layers, compositeUrl, _width, _height, textLayers) => {
      // Create placeholder asset if none provided (local file open)
      const resolvedAsset = asset ?? {
        id: `local-${Date.now()}`,
        userId: '',
        name: 'Untitled',
        storagePath: '',
        currentVersion: 1,
        assetType: 'IMAGE' as const,
        mimeType: 'image/png',
        sizeBytes: 0,
        isPublic: false,
        previewUrl: compositeUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      set({
        isEditorOpen: true,
        isCanvasReady: false,
        sourceAsset: resolvedAsset,
        originalImageUrl: compositeUrl,
        editMode: 'move',
        zoom: 100,
        panOffset: { x: 0, y: 0 },
        rotation: 0,
        flipHorizontal: false,
        flipVertical: false,
        history: [],
        historyIndex: -1,
        layers,
        activeLayerId: layers.length > 0 ? layers[layers.length - 1].id : null,
        textLayers: textLayers || [],
        activeTextLayerId: null,
        adjustments: { ...DEFAULT_ADJUSTMENTS },
        activeFilterPreset: 'none',
        filterIntensity: 100,
        selection: null,
        cropData: null,
        maskDataUrl: null,
        prompt: '',
        negativePrompt: '',
        // Start clean - only mark dirty when actual changes are made
        isDirty: false,
        canvasWidth: _width,
        canvasHeight: _height,
      });
    },

    closeEditor: () => {
      set({
        isEditorOpen: false,
        sourceAsset: null,
        originalImageUrl: null,
        isDirty: false,
        isProcessing: false,
        processingProgress: 0,
        processingMessage: '',
        isCanvasReady: false,
      });
    },

    resetEditor: () => {
      set({ ...initialState });
    },

    setCanvasReady: (ready) => set({ isCanvasReady: ready }),

    // ==================== Canvas Controls ====================

    setZoom: (zoom) => {
      set({ zoom: Math.max(10, Math.min(400, zoom)) });
    },

    zoomIn: () => {
      const { zoom } = get();
      const newZoom = Math.min(400, zoom * 1.25);
      set({ zoom: newZoom });
    },

    zoomOut: () => {
      const { zoom } = get();
      const newZoom = Math.max(10, zoom / 1.25);
      set({ zoom: newZoom });
    },

    zoomToFit: () => {
      // This will be calculated based on container size
      set({ zoom: 100, panOffset: { x: 0, y: 0 } });
    },

    zoomTo100: () => {
      set({ zoom: 100, panOffset: { x: 0, y: 0 } });
    },

    setPanOffset: (offset) => {
      set({ panOffset: offset });
    },

    setRotation: (rotation, markDirty = true) => {
      set({ rotation: rotation % 360, isDirty: markDirty });
    },

    setFlipHorizontal: (flip) => {
      set({ flipHorizontal: flip });
    },

    setFlipVertical: (flip) => {
      set({ flipVertical: flip });
    },

    toggleFlipHorizontal: () => {
      set((state) => ({ flipHorizontal: !state.flipHorizontal, isDirty: true }));
    },

    toggleFlipVertical: () => {
      set((state) => ({ flipVertical: !state.flipVertical, isDirty: true }));
    },

    resetAllTransforms: () => {
      set({
        rotation: 0,
        flipHorizontal: false,
        flipVertical: false,
        cropData: null,
      });
    },

    setIsSpacePanning: (value: boolean) => {
      set({ isSpacePanning: value });
    },

    setNavigationTool: (tool) => {
      set({ navigationTool: tool });
    },

    // ==================== Mode & Tools ====================

    setEditMode: (mode) => {
      const { editMode, adjustments, activeFilterPreset, _adjustmentsApplyCallback } = get();

      // Auto-apply pending adjustments/filters when leaving adjust or filter mode
      if (editMode === 'adjust' || editMode === 'filter') {
        const hasModifiedAdjustments = Object.keys(DEFAULT_ADJUSTMENTS).some(
          (key) => adjustments[key as keyof AdjustmentValues] !== DEFAULT_ADJUSTMENTS[key as keyof AdjustmentValues]
        );
        if ((hasModifiedAdjustments || activeFilterPreset !== 'none') && _adjustmentsApplyCallback) {
          _adjustmentsApplyCallback();
        }
      }

      set({
        previousMode: editMode,
        editMode: mode,
      });
    },

    setActiveTool: (tool) => {
      set({ activeTool: tool });
    },

    setSelectionTool: (tool) => {
      set({ selectionTool: tool });
    },

    setShapeTool: (tool) => {
      set({ shapeTool: tool });
    },

    setLastUsedToolForGroup: (groupId, toolId) => {
      set((state) => ({
        lastUsedToolPerGroup: { ...state.lastUsedToolPerGroup, [groupId]: toolId },
      }));
    },

    setBrushSettings: (settings) => {
      set((state) => ({
        brushSettings: { ...state.brushSettings, ...settings },
      }));
    },

    setBackgroundColor: (color: string) => {
      set({ backgroundColor: color });
    },

    resetDefaultColors: () => {
      set((state) => ({
        brushSettings: { ...state.brushSettings, color: '#000000' },
        backgroundColor: '#ffffff',
      }));
    },

    swapColors: () => {
      set((state) => ({
        brushSettings: { ...state.brushSettings, color: state.backgroundColor },
        backgroundColor: state.brushSettings.color,
      }));
    },

    setDodgeBurnSettings: (settings) => {
      set((state) => ({
        dodgeBurnSettings: { ...state.dodgeBurnSettings, ...settings },
      }));
    },

    setSpongeMode: (mode) => {
      set({ spongeMode: mode });
    },

    setLocalAdjustStrength: (strength) => {
      set({ localAdjustStrength: strength });
    },

    setTextSettings: (settings) => {
      set((state) => ({
        textSettings: { ...state.textSettings, ...settings },
      }));
    },

    setGradientSettings: (settings) => {
      set((state) => ({
        gradientSettings: { ...state.gradientSettings, ...settings },
      }));
    },

    setShapeSettings: (settings) => {
      set((state) => ({
        shapeSettings: { ...state.shapeSettings, ...settings },
      }));
    },

    // ==================== Adjustments ====================

    setAdjustment: (key, value) => {
      set((state) => ({
        adjustments: { ...state.adjustments, [key]: value },
        activeFilterPreset: 'none',  // Clear preset when manually adjusting
        isDirty: true,
      }));
    },

    setAdjustments: (adjustments) => {
      set((state) => ({
        adjustments: { ...state.adjustments, ...adjustments },
      }));
    },

    resetAdjustments: () => {
      set({
        adjustments: { ...DEFAULT_ADJUSTMENTS },
        activeFilterPreset: 'none',
        filterIntensity: 100,
      });
    },

    applyFilterPreset: (presetId) => {
      const preset = FILTER_PRESETS.find((p) => p.id === presetId);
      if (preset) {
        set({
          adjustments: { ...DEFAULT_ADJUSTMENTS, ...preset.adjustments },
          activeFilterPreset: presetId,
          filterIntensity: 100,
        });
      }
    },

    setFilterIntensity: (intensity) => {
      const { activeFilterPreset } = get();
      const preset = FILTER_PRESETS.find((p) => p.id === activeFilterPreset);
      if (!preset || activeFilterPreset === 'none') {
        set({ filterIntensity: intensity });
        return;
      }

      const scaledAdjustments: Partial<AdjustmentValues> = {};
      Object.entries(preset.adjustments).forEach(([key, presetValue]) => {
        if (typeof presetValue === 'number') {
          const k = key as keyof AdjustmentValues;
          const base = DEFAULT_ADJUSTMENTS[k];
          if (typeof base !== 'number') return;
          const delta = presetValue - base;
          (scaledAdjustments as Record<string, number>)[k] = base + (delta * intensity / 100);
        }
      });

      set({
        filterIntensity: intensity,
        adjustments: { ...DEFAULT_ADJUSTMENTS, ...scaledAdjustments },
      });
    },

    applyAdjustments: () => {
      const { _adjustmentsApplyCallback } = get();
      if (_adjustmentsApplyCallback) {
        _adjustmentsApplyCallback();
      }
    },

    registerAdjustmentsApplyCallback: (callback) => {
      set({ _adjustmentsApplyCallback: callback });
    },

    applyCanvasFilter: (filterFn, label = 'Filter') => {
      const { _filterApplyCallback } = get();
      if (_filterApplyCallback) {
        _filterApplyCallback(filterFn, label);
      }
    },

    registerFilterApplyCallback: (callback) => {
      set({ _filterApplyCallback: callback });
    },

    applyTransforms: () => {
      const { _transformsApplyCallback } = get();
      if (_transformsApplyCallback) {
        _transformsApplyCallback();
      }
    },

    registerTransformsApplyCallback: (callback) => {
      set({ _transformsApplyCallback: callback });
    },

    // ==================== Warp ====================

    enterWarpMode: () => {
      const { layers, activeLayerId } = get();
      const activeLayer = layers.find(l => l.id === activeLayerId) || layers[0];
      if (!activeLayer) return;

      const W = activeLayer.width ?? 512;
      const H = activeLayer.height ?? 512;

      // Build default 3×3 flat grid
      const grid: { x: number; y: number }[][] = [];
      for (let r = 0; r < 3; r++) {
        const row: { x: number; y: number }[] = [];
        for (let c = 0; c < 3; c++) {
          row.push({ x: (c / 2) * W, y: (r / 2) * H });
        }
        grid.push(row);
      }
      set({ isWarpMode: true, warpGrid: grid });
    },

    exitWarpMode: () => {
      set({ isWarpMode: false, warpGrid: null });
    },

    updateWarpPoint: (row, col, x, y) => {
      const { warpGrid } = get();
      if (!warpGrid) return;
      const newGrid = warpGrid.map((r, ri) =>
        r.map((pt, ci) => (ri === row && ci === col ? { x, y } : pt))
      );
      set({ warpGrid: newGrid });
    },

    resetWarpGrid: () => {
      const { layers, activeLayerId } = get();
      const activeLayer = layers.find(l => l.id === activeLayerId) || layers[0];
      if (!activeLayer) return;
      const W = activeLayer.width ?? 512;
      const H = activeLayer.height ?? 512;
      const grid: { x: number; y: number }[][] = [];
      for (let r = 0; r < 3; r++) {
        const row: { x: number; y: number }[] = [];
        for (let c = 0; c < 3; c++) {
          row.push({ x: (c / 2) * W, y: (r / 2) * H });
        }
        grid.push(row);
      }
      set({ warpGrid: grid });
    },

    applyWarp: async () => {
      const { warpGrid, layers, activeLayerId, updateLayer } = get();
      if (!warpGrid) return;

      const activeLayer = layers.find(l => l.id === activeLayerId);
      if (!activeLayer?.imageData) return;

      const { applyWarpToCanvas } = await import('@/features/image-editor/canvas/canvasEngine');
      const { dataUrlToCanvas } = await import('@/features/image-editor/canvas/canvasEngine');

      const sourceCanvas = await dataUrlToCanvas(activeLayer.imageData);
      const warpedCanvas = applyWarpToCanvas(sourceCanvas, warpGrid);

      updateLayer(activeLayer.id, { imageData: warpedCanvas.toDataURL('image/png') });
      set({ isWarpMode: false, warpGrid: null });
    },

    // ==================== Selection ====================

    setSelection: (selection) => {
      set({ selection });
    },

    invertSelection: async () => {
      const { selection, layers } = get();
      if (!selection?.maskDataUrl) return;

      const { loadSelectionMask, maskToDataUrl, getSelectionBounds } = await import('@/features/image-editor/canvas/selectionEngine');

      const baseLayer = layers[0];
      const w = baseLayer?.width ?? 512;
      const h = baseLayer?.height ?? 512;

      const mask = await loadSelectionMask(selection.maskDataUrl, w, h);

      // Invert every pixel: 0→255, 255→0
      const inverted = new Uint8ClampedArray(mask.length);
      for (let i = 0; i < mask.length; i++) {
        inverted[i] = 255 - mask[i];
      }

      const bounds = getSelectionBounds(inverted, w, h);
      set({
        selection: {
          ...selection,
          maskDataUrl: maskToDataUrl(inverted, w, h),
          bounds,
          isInverted: !selection.isInverted,
        },
      });
    },

    clearSelection: () => {
      set({ selection: null });
    },

    setSelectionMode: (mode) => {
      set({ selectionMode: mode });
    },

    setSelectionFeather: (feather) => {
      set({ selectionFeather: Math.max(0, Math.min(50, feather)) });
    },

    setSelectionAntiAlias: (value: boolean) => {
      set({ selectionAntiAlias: value });
    },

    setSelectionTolerance: (tolerance) => {
      set({ selectionTolerance: Math.max(0, Math.min(255, tolerance)) });
    },

    setSelectionContiguous: (value: boolean) => {
      set({ selectionContiguous: value });
    },

    setQuickSelectBrushSize: (size) => {
      set({ quickSelectBrushSize: Math.max(1, Math.min(200, size)) });
    },

    setQuickSelectSampleAll: (value) => {
      set({ quickSelectSampleAll: value });
    },

    setColorRangeColor: (color) => {
      set({ colorRangeColor: color });
    },

    setColorRangeTolerance: (value) => {
      set({ colorRangeTolerance: Math.max(0, Math.min(255, value)) });
    },

    setColorRangeFuzziness: (value) => {
      set({ colorRangeFuzziness: Math.max(0, Math.min(100, value)) });
    },

    selectSubject: async () => {
      const { sourceAsset, layers, setProcessing, setProcessingProgress, setSelection, selectionFeather } = get();
      if (!sourceAsset?.id) throw new Error('No source image available for subject selection');

      setProcessing(true, 'Selecting subject...');
      try {
        const { removeBackground, getAssetStatus, uploadImage } = await import('@/shared/api/image.api');

        let assetId = sourceAsset.id;

        // Handle local assets: upload first
        if (assetId.startsWith('local-')) {
          const originalImageUrl = get().originalImageUrl;
          if (!originalImageUrl) throw new Error('No image available for subject selection');

          const response = await fetch(originalImageUrl);
          const blob = await response.blob();
          const file = new File([blob], `${sourceAsset.name || 'image'}.png`, { type: 'image/png' });

          const uploaded = await uploadImage(file, { storagePath: 'images', name: sourceAsset.name });
          if (!uploaded) throw new Error('Failed to upload image for subject selection');

          assetId = uploaded.id;
          set({ sourceAsset: uploaded });
        }

        const result = await removeBackground(assetId);
        if (!result) throw new Error('Failed to start subject selection');

        let attempts = 0;
        const maxAttempts = 60;
        while (attempts < maxAttempts) {
          const status = await getAssetStatus(result.id);
          if (!status) throw new Error('Failed to get status');

          if (status.status === 'READY') {
            const imageUrl = status.asset?.previewUrl || status.asset?.publicUrl;
            if (!imageUrl) throw new Error('No result image URL');

            // Determine canvas dimensions from layers
            const baseLayer = layers[0];
            const canvasW = baseLayer?.width ?? 512;
            const canvasH = baseLayer?.height ?? 512;

            const { loadMaskAsSelection, getSelectionBounds } = await import('@/features/image-editor/canvas/selectionEngine');
            const mask = await loadMaskAsSelection(imageUrl, canvasW, canvasH);
            const bounds = getSelectionBounds(mask, canvasW, canvasH);

            // Convert mask to data URL
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvasW;
            tempCanvas.height = canvasH;
            const tempCtx = tempCanvas.getContext('2d')!;
            const imgData = tempCtx.createImageData(canvasW, canvasH);
            for (let i = 0; i < mask.length; i++) {
              imgData.data[i * 4] = mask[i];
              imgData.data[i * 4 + 1] = mask[i];
              imgData.data[i * 4 + 2] = mask[i];
              imgData.data[i * 4 + 3] = 255;
            }
            tempCtx.putImageData(imgData, 0, 0);

            setSelection({
              maskDataUrl: tempCanvas.toDataURL('image/png'),
              bounds,
              feather: selectionFeather,
              isInverted: false,
            });
            setProcessing(false);
            return;
          }

          if (status.status === 'FAILED') {
            throw new Error(status.error || 'Subject selection failed');
          }

          setProcessingProgress(Math.min(90, (attempts / maxAttempts) * 100));
          await new Promise(resolve => setTimeout(resolve, 2000));
          attempts++;
        }
        throw new Error('Processing timeout');
      } catch (err) {
        console.error('selectSubject error:', err);
        setProcessing(false);
        throw err;
      }
    },

    selectLayerPixels: async (layerId) => {
      const { layers, setSelection, selectionFeather } = get();
      const layer = layers.find((l) => l.id === layerId);
      if (!layer || !layer.imageData || layer.type === 'group' || layer.type === 'adjustment') return;

      const baseLayer = layers[0];
      const canvasW = baseLayer?.width ?? 512;
      const canvasH = baseLayer?.height ?? 512;

      try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load layer image'));
          img.src = layer.imageData;
        });

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvasW;
        tempCanvas.height = canvasH;
        const tempCtx = tempCanvas.getContext('2d')!;
        tempCtx.drawImage(img, layer.x, layer.y, layer.width || img.width, layer.height || img.height);
        const pixelData = tempCtx.getImageData(0, 0, canvasW, canvasH);

        // Build mask: alpha > 0 → 255, else 0
        const mask = new Uint8ClampedArray(canvasW * canvasH);
        for (let i = 0; i < mask.length; i++) {
          mask[i] = pixelData.data[i * 4 + 3] > 0 ? 255 : 0;
        }

        const { getSelectionBounds } = await import('@/features/image-editor/canvas/selectionEngine');
        const bounds = getSelectionBounds(mask, canvasW, canvasH);

        // Convert mask to data URL
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = canvasW;
        maskCanvas.height = canvasH;
        const maskCtx = maskCanvas.getContext('2d')!;
        const imgData = maskCtx.createImageData(canvasW, canvasH);
        for (let i = 0; i < mask.length; i++) {
          imgData.data[i * 4] = mask[i];
          imgData.data[i * 4 + 1] = mask[i];
          imgData.data[i * 4 + 2] = mask[i];
          imgData.data[i * 4 + 3] = 255;
        }
        maskCtx.putImageData(imgData, 0, 0);

        setSelection({
          maskDataUrl: maskCanvas.toDataURL('image/png'),
          bounds,
          feather: selectionFeather,
          isInverted: false,
        });
      } catch (err) {
        console.error('selectLayerPixels error:', err);
      }
    },

    refineEdge: async (options) => {
      const { selection, layers } = get();
      if (!selection) return;

      const { refineEdge: refineEdgeFn, loadSelectionMask } = await import('@/features/image-editor/canvas/selectionEngine');

      const baseLayer = layers[0];
      const canvasW = baseLayer?.width ?? 512;
      const canvasH = baseLayer?.height ?? 512;

      // Convert existing selection maskDataUrl to a mask array
      const existingMask = await loadSelectionMask(selection.maskDataUrl, canvasW, canvasH);

      // Refine the mask
      const refinedMask = refineEdgeFn(existingMask, canvasW, canvasH, options);

      // Convert back to data URL
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvasW;
      tempCanvas.height = canvasH;
      const tempCtx = tempCanvas.getContext('2d')!;
      const imgData = tempCtx.createImageData(canvasW, canvasH);
      for (let i = 0; i < refinedMask.length; i++) {
        imgData.data[i * 4] = refinedMask[i];
        imgData.data[i * 4 + 1] = refinedMask[i];
        imgData.data[i * 4 + 2] = refinedMask[i];
        imgData.data[i * 4 + 3] = 255;
      }
      tempCtx.putImageData(imgData, 0, 0);

      set({
        selection: {
          ...selection,
          maskDataUrl: tempCanvas.toDataURL('image/png'),
          feather: options.feather,
        },
      });
    },

    contentAwareFill: async () => {
      const { selection, layers, sourceAsset } = get();
      if (!selection || !sourceAsset?.id) return;

      const baseLayer = layers[0];
      const canvasW = baseLayer?.width ?? 512;
      const canvasH = baseLayer?.height ?? 512;

      const { selectionToInpaintMask } = await import('@/features/image-editor/canvas/selectionEngine');
      const { contentAwareFill: contentAwareFillApi } = await import('@/shared/api/image.api');

      // Convert selection mask to inpaint mask format
      const inpaintMask = selectionToInpaintMask(
        selection.maskDataUrl,
        canvasW,
        canvasH,
        selection.isInverted
      );

      // Call API
      const result = await contentAwareFillApi(sourceAsset.id, inpaintMask);
      const imageUrl = result?.previewUrl || result?.publicUrl;
      if (imageUrl) {
        // Load the result image and apply to the active layer
        const activeLayer = layers.find(l => l.id === get().activeLayerId);
        if (activeLayer) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              const dataUrl = canvas.toDataURL('image/png');
              set((state) => ({
                layers: state.layers.map(l =>
                  l.id === activeLayer.id ? { ...l, imageData: dataUrl } : l
                ),
                selection: null, // Clear selection after fill
              }));
            }
          };
          img.src = imageUrl;
        }
      }
    },

    // ==================== Crop ====================

    setCropData: (data) => {
      set({ cropData: data });
    },

    setCropAspectRatio: (ratio) => {
      set({ cropAspectRatio: ratio });
    },

    applyCrop: () => {
      const { _cropApplyCallback } = get();
      if (_cropApplyCallback) {
        _cropApplyCallback();
      } else {
        // Fallback: just reset crop state
        set({ cropData: null, editMode: 'move' });
      }
    },

    registerCropApplyCallback: (callback) => {
      set({ _cropApplyCallback: callback });
    },

    // ==================== Layers ====================

    addLayer: (imageData, name) => {
      const { layers } = get();
      const id = generateId();
      const newLayer: Layer = {
        id,
        name: name || `Layer ${layers.length + 1}`,
        visible: true,
        locked: false,
        opacity: 100,
        fillOpacity: 100,
        blendMode: 'normal',
        imageData,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      };
      set({
        layers: [...layers, newLayer],
        activeLayerId: id,
      });
      // Asynchronously resolve image dimensions
      const img = new Image();
      img.onload = () => {
        const { updateLayer } = get();
        updateLayer(id, { width: img.width, height: img.height });
      };
      img.src = imageData;
      return id;
    },

    addLayerFromUrl: async (imageUrl, name) => {
      try {
        // Fetch the image and convert to data URL
        const response = await fetch(imageUrl);
        const blob = await response.blob();

        return new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;

            // Get image dimensions
            const img = new Image();
            img.onload = () => {
              const { layers } = get();
              const id = generateId();
              const newLayer: Layer = {
                id,
                name: name || `Layer ${layers.length + 1}`,
                visible: true,
                locked: false,
                opacity: 100,
                blendMode: 'normal',
                imageData: dataUrl,
                x: 0,
                y: 0,
                width: img.width,
                height: img.height,
              };
              set({
                layers: [...layers, newLayer],
                activeLayerId: id,
              });
              resolve(id);
            };
            img.onerror = () => resolve(null);
            img.src = dataUrl;
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        console.error('Failed to add layer from URL:', error);
        return null;
      }
    },

    removeLayer: (layerId) => {
      const { layers, activeLayerId } = get();
      const newLayers = layers.filter((l) => l.id !== layerId);
      set({
        layers: newLayers,
        activeLayerId: activeLayerId === layerId ? (newLayers[0]?.id || null) : activeLayerId,
      });
    },

    updateLayer: (layerId, updates) => {
      set((state) => ({
        layers: state.layers.map((l) =>
          l.id === layerId ? { ...l, ...updates } : l
        ),
      }));
    },

    setActiveLayer: (layerId) => {
      const { adjustments, activeFilterPreset, _adjustmentsApplyCallback } = get();

      // Auto-apply pending adjustments/filters to the current layer before switching
      const hasModifiedAdjustments = Object.keys(DEFAULT_ADJUSTMENTS).some(
        (key) => adjustments[key as keyof AdjustmentValues] !== DEFAULT_ADJUSTMENTS[key as keyof AdjustmentValues]
      );
      if ((hasModifiedAdjustments || activeFilterPreset !== 'none') && _adjustmentsApplyCallback) {
        _adjustmentsApplyCallback();
      }

      set({
        activeLayerId: layerId,
        adjustments: { ...DEFAULT_ADJUSTMENTS },
        activeFilterPreset: 'none',
        filterIntensity: 100,
      });
    },

    reorderLayers: (fromIndex, toIndex) => {
      const { layers } = get();
      const newLayers = [...layers];
      const [removed] = newLayers.splice(fromIndex, 1);
      newLayers.splice(toIndex, 0, removed);
      set({ layers: newLayers });
    },

    duplicateLayer: (layerId) => {
      const { layers } = get();
      const layer = layers.find((l) => l.id === layerId);
      if (!layer) return null;

      const id = generateId();
      const newLayer: Layer = {
        ...layer,
        id,
        name: `${layer.name} (copy)`,
      };

      const index = layers.findIndex((l) => l.id === layerId);
      const newLayers = [...layers];
      newLayers.splice(index + 1, 0, newLayer);

      set({ layers: newLayers, activeLayerId: id });
      return id;
    },

    mergeLayerDown: (layerId) => {
      const { layers } = get();
      const index = layers.findIndex((l) => l.id === layerId);
      if (index <= 0) return;

      // In a real implementation, this would merge imageData
      // For now, just remove the layer
      const newLayers = layers.filter((l) => l.id !== layerId);
      set({ layers: newLayers, activeLayerId: newLayers[index - 1]?.id || null });
    },

    flattenLayers: async () => {
      const { layers, canvasWidth: storeW, canvasHeight: storeH } = get();
      if (layers.length === 0) return;

      const canvasWidth = storeW > 0 ? storeW : Math.max(...layers.map((l) => l.x + l.width), 1);
      const canvasHeight = storeH > 0 ? storeH : Math.max(...layers.map((l) => l.y + l.height), 1);

      const composited = await compositeLayers(layers, canvasWidth, canvasHeight);
      const dataUrl = composited.toDataURL('image/png');

      const flatLayer: Layer = {
        id: generateId(),
        name: 'Flattened',
        visible: true,
        locked: false,
        opacity: 100,
        blendMode: 'normal',
        imageData: dataUrl,
        x: 0,
        y: 0,
        width: composited.width,
        height: composited.height,
      };

      set({ layers: [flatLayer], activeLayerId: flatLayer.id });
    },

    // ==================== Layer Groups ====================

    createLayerGroup: (name = 'Group') => {
      const id = generateId();
      const group: Layer = {
        id,
        name,
        visible: true,
        locked: false,
        opacity: 100,
        blendMode: 'normal',
        imageData: '',
        x: 0, y: 0, width: 0, height: 0,
        type: 'group',
        children: [],
        isExpanded: true,
      };
      set((state) => ({
        layers: [...state.layers, group],
        activeLayerId: id,
      }));
      return id;
    },

    moveLayerToGroup: (layerId, groupId) => {
      set((state) => {
        const layers = state.layers.map((l) => {
          // Remove from old parent
          if (l.type === 'group' && l.children?.includes(layerId)) {
            return { ...l, children: l.children.filter((c) => c !== layerId) };
          }
          // Add to new parent
          if (groupId && l.id === groupId && l.type === 'group') {
            return { ...l, children: [...(l.children || []), layerId] };
          }
          return l;
        });
        // Update parentId on the moved layer
        return {
          layers: layers.map((l) =>
            l.id === layerId ? { ...l, parentId: groupId ?? undefined } : l
          ),
        };
      });
    },

    toggleGroupExpansion: (groupId) => {
      set((state) => ({
        layers: state.layers.map((l) =>
          l.id === groupId && l.type === 'group'
            ? { ...l, isExpanded: !l.isExpanded }
            : l
        ),
      }));
    },

    ungroupLayers: (groupId) => {
      set((state) => {
        const group = state.layers.find((l) => l.id === groupId);
        if (!group || group.type !== 'group') return state;
        const layers = state.layers
          .map((l) => {
            if (l.parentId === groupId) return { ...l, parentId: undefined };
            return l;
          })
          .filter((l) => l.id !== groupId);
        return { layers, activeLayerId: state.activeLayerId === groupId ? null : state.activeLayerId };
      });
    },

    // ==================== Adjustment Layers ====================

    addAdjustmentLayer: (adjustmentType, values = {}) => {
      const id = generateId();
      const names: Record<string, string> = {
        'brightness-contrast': 'Brightness/Contrast',
        'hue-saturation': 'Hue/Saturation',
        'levels': 'Levels',
        'curves': 'Curves',
        'exposure': 'Exposure',
        'color-balance': 'Color Balance',
      };
      const adjLayer: Layer = {
        id,
        name: names[adjustmentType] ?? adjustmentType,
        visible: true,
        locked: false,
        opacity: 100,
        blendMode: 'normal',
        imageData: '',
        x: 0, y: 0, width: 0, height: 0,
        type: 'adjustment',
        adjustmentType,
        adjustmentValues: { ...DEFAULT_ADJUSTMENTS, ...values },
      };
      set((state) => ({
        layers: [...state.layers, adjLayer],
        activeLayerId: id,
      }));
      return id;
    },

    updateAdjustmentLayer: (layerId, values) => {
      set((state) => ({
        layers: state.layers.map(l =>
          l.id === layerId && l.type === 'adjustment'
            ? { ...l, adjustmentValues: { ...l.adjustmentValues, ...values } }
            : l
        ),
      }));
    },

    // ==================== Layer Masks ====================

    addLayerMask: (layerId, maskData) => {
      set((state) => ({
        layers: state.layers.map((l) =>
          l.id === layerId
            ? {
                ...l,
                mask: {
                  data: maskData || '',  // Empty string = reveal all (white mask)
                  enabled: true,
                  linked: true,
                },
              }
            : l
        ),
      }));
    },

    removeLayerMask: (layerId) => {
      set((state) => ({
        layers: state.layers.map((l) =>
          l.id === layerId ? { ...l, mask: undefined } : l
        ),
      }));
    },

    toggleLayerMask: (layerId) => {
      set((state) => ({
        layers: state.layers.map((l) =>
          l.id === layerId && l.mask
            ? { ...l, mask: { ...l.mask, enabled: !l.mask.enabled } }
            : l
        ),
      }));
    },

    updateLayerMask: (layerId, maskData) => {
      set((state) => ({
        layers: state.layers.map((l) =>
          l.id === layerId && l.mask
            ? { ...l, mask: { ...l.mask, data: maskData } }
            : l
        ),
      }));
    },

    // ==================== Layer Effects ====================

    addLayerEffect: (layerId, effect) => {
      set((state) => ({
        layers: state.layers.map((l) => {
          if (l.id !== layerId) return l;
          const effects = l.effects || [];
          // Replace existing effect of same type, or add new
          const existingIndex = effects.findIndex((e) => e.type === effect.type);
          if (existingIndex >= 0) {
            const newEffects = [...effects];
            newEffects[existingIndex] = effect;
            return { ...l, effects: newEffects };
          }
          return { ...l, effects: [...effects, effect] };
        }),
      }));
    },

    removeLayerEffect: (layerId, effectType) => {
      set((state) => ({
        layers: state.layers.map((l) =>
          l.id === layerId && l.effects
            ? { ...l, effects: l.effects.filter((e) => e.type !== effectType) }
            : l
        ),
      }));
    },

    updateLayerEffect: (layerId, effectType, settings) => {
      set((state) => ({
        layers: state.layers.map((l) => {
          if (l.id !== layerId || !l.effects) return l;
          return {
            ...l,
            effects: l.effects.map((e) =>
              e.type === effectType
                ? { ...e, settings: { ...e.settings, ...settings } as LayerEffect['settings'] }
                : e
            ),
          };
        }),
      }));
    },

    toggleLayerEffect: (layerId, effectType) => {
      set((state) => ({
        layers: state.layers.map((l) => {
          if (l.id !== layerId || !l.effects) return l;
          return {
            ...l,
            effects: l.effects.map((e) =>
              e.type === effectType ? { ...e, enabled: !e.enabled } : e
            ),
          };
        }),
      }));
    },

    // ==================== Clipping Mask ====================

    toggleClippingMask: (layerId) => {
      set((state) => ({
        layers: state.layers.map((l) =>
          l.id === layerId ? { ...l, clippingMask: !l.clippingMask } : l
        ),
      }));
    },

    // ==================== Text Layers ====================

    addTextLayer: (text, x, y) => {
      const { textLayers, textSettings } = get();
      const id = generateId();
      const newTextLayer: TextLayer = {
        id,
        text,
        x,
        y,
        settings: { ...textSettings },
      };
      set({
        textLayers: [...textLayers, newTextLayer],
        activeTextLayerId: id,
      });
      return id;
    },

    removeTextLayer: (layerId) => {
      const { textLayers, activeTextLayerId } = get();
      const newLayers = textLayers.filter((l) => l.id !== layerId);
      set({
        textLayers: newLayers,
        activeTextLayerId: activeTextLayerId === layerId ? null : activeTextLayerId,
      });
    },

    updateTextLayer: (layerId, updates) => {
      set((state) => ({
        textLayers: state.textLayers.map((l) =>
          l.id === layerId ? { ...l, ...updates } : l
        ),
      }));
    },

    setActiveTextLayer: (layerId) => {
      set({ activeTextLayerId: layerId });
    },

    // ==================== History ====================

    pushHistory: (label, imageData, markDirty = true) => {
      // Auto-record to actions store if recording
      try {
        const actionsState = useActionsStore.getState();
        if (actionsState.isRecording) {
          // Map history labels to action step types
          const labelToType: Record<string, string> = {
            'Crop': 'crop:apply',
            'Adjustments': 'adjust:apply',
            'Transform': 'transform:rotate',
            'Flip Horizontal': 'transform:flip-h',
            'Flip Vertical': 'transform:flip-v',
            'Brush Stroke': 'draw:brush-stroke',
            'Fill': 'draw:fill',
            'Layer Added': 'layer:add',
            'Layer Deleted': 'layer:delete',
            'Layer Duplicated': 'layer:duplicate',
            'Merge Down': 'layer:merge-down',
            'Filter': 'filter:apply',
            'Content-Aware Fill': 'selection:content-aware-fill',
          };
          const actionType = labelToType[label] || 'adjust:apply';
          actionsState.recordStep(actionType as Parameters<typeof actionsState.recordStep>[0], { label });
        }
      } catch { /* actions store not available */ }

      const { history, historyIndex, maxHistoryStates, layers } = get();

      const newState: HistoryState = {
        id: generateId(),
        label,
        timestamp: Date.now(),
        imageData,
        // Save layers snapshot for proper undo/redo
        layers: layers.map(l => ({ ...l })),
      };

      // Remove any future states if we're in the middle of history
      const newHistory = [...history.slice(0, historyIndex + 1), newState];

      // Limit history size
      const trimmedHistory = newHistory.slice(-maxHistoryStates);

      set({
        history: trimmedHistory,
        historyIndex: trimmedHistory.length - 1,
        isDirty: markDirty,
      });
    },

    undo: () => {
      const { historyIndex, history } = get();
      if (historyIndex > 0) {
        const targetState = history[historyIndex - 1];
        const updates: Partial<ImageEditorState> = { historyIndex: historyIndex - 1 };
        if (targetState.layers) {
          updates.layers = targetState.layers.map(l => ({ ...l }));
        }
        set(updates);
      }
    },

    redo: () => {
      const { history, historyIndex } = get();
      if (historyIndex < history.length - 1) {
        const targetState = history[historyIndex + 1];
        const updates: Partial<ImageEditorState> = { historyIndex: historyIndex + 1 };
        if (targetState.layers) {
          updates.layers = targetState.layers.map(l => ({ ...l }));
        }
        set(updates);
      }
    },

    goToHistoryState: (index) => {
      const { history } = get();
      if (index >= 0 && index < history.length) {
        const targetState = history[index];
        const updates: Partial<ImageEditorState> = { historyIndex: index };
        if (targetState.layers) {
          updates.layers = targetState.layers.map(l => ({ ...l }));
        }
        set(updates);
      }
    },

    clearHistory: () => {
      set({ history: [], historyIndex: -1 });
    },

    canUndo: () => {
      const { historyIndex } = get();
      return historyIndex > 0;
    },

    canRedo: () => {
      const { history, historyIndex } = get();
      return historyIndex < history.length - 1;
    },

    // ==================== AI Processing ====================

    setProcessing: (isProcessing, message = '') => {
      set({
        isProcessing,
        processingMessage: message,
        processingProgress: isProcessing ? 0 : 100,
      });
    },

    setProcessingProgress: (progress) => {
      set({ processingProgress: progress });
    },

    setUpscaleSettings: (settings) => {
      set((state) => ({
        upscaleSettings: { ...state.upscaleSettings, ...settings },
      }));
    },

    setMaskDataUrl: (maskDataUrl) => {
      set({ maskDataUrl });
    },

    setPrompt: (prompt) => {
      set({ prompt });
    },

    setNegativePrompt: (negativePrompt) => {
      set({ negativePrompt });
    },

    // ==================== Dirty Tracking ====================

    markDirty: () => {
      set({ isDirty: true });
    },

    clearDirty: () => {
      set({ isDirty: false });
    },

    // ==================== UI Toggles ====================

    toggleGrid: () => {
      set((state) => ({ showGrid: !state.showGrid }));
    },

    toggleRulers: () => {
      set((state) => ({ showRulers: !state.showRulers }));
    },

    toggleGuides: () => {
      set((state) => {
        const next = !state.showGuides;
        // Turning guides on also reveals rulers so the user can drag to create guides
        return { showGuides: next, showRulers: next ? true : state.showRulers };
      });
    },

    toggleSnapToGrid: () => {
      set((state) => ({ snapToGrid: !state.snapToGrid }));
    },

    setGridSize: (size) => {
      set({ gridSize: Math.max(1, Math.min(100, size)) });
    },

    addGuide: (orientation, position) => {
      set((state) => {
        const guides = { ...state.guides };
        if (orientation === 'horizontal') {
          guides.horizontal = [...guides.horizontal, position];
        } else {
          guides.vertical = [...guides.vertical, position];
        }
        // Adding a guide implies the user wants to see guides
        return { guides, showGuides: true };
      });
    },

    removeGuide: (orientation, index) => {
      set((state) => {
        const guides = { ...state.guides };
        if (orientation === 'horizontal') {
          guides.horizontal = guides.horizontal.filter((_, i) => i !== index);
        } else {
          guides.vertical = guides.vertical.filter((_, i) => i !== index);
        }
        return { guides };
      });
    },

    clearGuides: () => {
      set({ guides: { horizontal: [], vertical: [] } });
    },

    // Panel visibility
    toggleLayersPanel: () => {
      set((state) => ({ showLayersPanel: !state.showLayersPanel }));
    },

    toggleHistoryPanel: () => {
      set((state) => ({ showHistoryPanel: !state.showHistoryPanel }));
    },

    toggleImageInfoPanel: () => {
      set((state) => ({ showImageInfoPanel: !state.showImageInfoPanel }));
    },

    toggleChannelsPanel: () => {
      set((state) => ({ showChannelsPanel: !state.showChannelsPanel }));
    },

    togglePathsPanel: () => {
      set((state) => ({ showPathsPanel: !state.showPathsPanel }));
    },

    toggleHistogramPanel: () => {
      set((state) => ({ showHistogramPanel: !state.showHistogramPanel }));
    },

    setHistogramData: (data) => {
      set({ histogramData: data });
    },

    setRightPanelTab: (tab) => {
      set({ rightPanelTab: tab });
    },

    // ==================== Channels ====================

    setActiveChannel: (channelId) => {
      if (channelId === 'rgb') {
        // Selecting RGB composite restores all channel visibility (Photoshop behavior)
        set({
          activeChannelId: 'rgb',
          activeAlphaChannelId: null,
          channelVisibility: { rgb: true, red: true, green: true, blue: true },
        });
      } else {
        // Selecting a single channel: show only that channel, hide others
        set({
          activeChannelId: channelId,
          activeAlphaChannelId: null,
          channelVisibility: {
            rgb: false,
            red: channelId === 'red',
            green: channelId === 'green',
            blue: channelId === 'blue',
          },
        });
      }
    },

    toggleChannelVisibility: (channelId) => {
      set((state) => {
        if (channelId === 'rgb') {
          // Toggling RGB = toggle all channels at once
          const allVisible = state.channelVisibility.red && state.channelVisibility.green && state.channelVisibility.blue;
          const newVis = !allVisible;
          return {
            channelVisibility: { rgb: newVis, red: newVis, green: newVis, blue: newVis },
            // If turning all back on, switch to RGB composite view
            ...(newVis ? { activeChannelId: 'rgb' as ColorChannelId } : {}),
          };
        }

        const newVisibility = {
          ...state.channelVisibility,
          [channelId]: !state.channelVisibility[channelId],
        };

        // Update RGB visibility to reflect whether all individual channels are visible
        newVisibility.rgb = newVisibility.red && newVisibility.green && newVisibility.blue;

        // Determine the active channel based on new visibility
        let newActiveChannelId = state.activeChannelId;
        const visibleChannels = (['red', 'green', 'blue'] as const).filter(c => newVisibility[c]);

        if (visibleChannels.length === 3) {
          // All channels visible → switch to RGB view
          newActiveChannelId = 'rgb';
        } else if (visibleChannels.length === 1) {
          // Only one channel visible → activate that channel
          newActiveChannelId = visibleChannels[0];
        } else if (visibleChannels.length > 0 && !newVisibility[state.activeChannelId as 'red' | 'green' | 'blue']
          && state.activeChannelId !== 'rgb') {
          // Current active channel was hidden → switch to first visible
          newActiveChannelId = visibleChannels[0];
        }

        return {
          channelVisibility: newVisibility,
          activeChannelId: newActiveChannelId,
        };
      });
    },

    saveSelectionAsChannel: () => {
      const { selection, alphaChannels } = get();
      if (!selection?.maskDataUrl) return;

      const id = generateId();
      const name = `Alpha ${alphaChannels.length + 1}`;
      const newChannel: AlphaChannel = {
        id,
        name,
        maskData: selection.maskDataUrl,
        visible: true,
      };
      set({ alphaChannels: [...alphaChannels, newChannel] });
    },

    loadChannelAsSelection: (channelId) => {
      const { alphaChannels, selectionFeather } = get();
      const channel = alphaChannels.find((c) => c.id === channelId);
      if (!channel) return;

      // Load the channel mask as a selection
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Build mask from red channel
        const mask = new Uint8ClampedArray(canvas.width * canvas.height);
        for (let i = 0; i < mask.length; i++) {
          mask[i] = imageData.data[i * 4]; // R channel
        }

        // Compute bounds
        let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            if (mask[y * canvas.width + x] > 0) {
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
            }
          }
        }

        const bounds = minX <= maxX
          ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
          : { x: 0, y: 0, width: 0, height: 0 };

        get().setSelection({
          maskDataUrl: channel.maskData,
          bounds,
          feather: selectionFeather,
          isInverted: false,
        });
      };
      img.src = channel.maskData;
    },

    deleteAlphaChannel: (channelId) => {
      set((state) => ({
        alphaChannels: state.alphaChannels.filter((c) => c.id !== channelId),
        activeAlphaChannelId: state.activeAlphaChannelId === channelId ? null : state.activeAlphaChannelId,
      }));
    },

    toggleAlphaChannelVisibility: (channelId) => {
      set((state) => ({
        alphaChannels: state.alphaChannels.map((c) =>
          c.id === channelId ? { ...c, visible: !c.visible } : c
        ),
      }));
    },

    // ==================== Paths ====================

    addPath: (name) => {
      const id = generateId();
      const { paths } = get();
      const newPath: VectorPath = {
        id,
        name: name || `Path ${paths.length + 1}`,
        points: [],
        closed: false,
        visible: true,
      };
      set({ paths: [...paths, newPath], activePathId: id });
      return id;
    },

    deletePath: (pathId) => {
      set((state) => ({
        paths: state.paths.filter((p) => p.id !== pathId),
        activePathId: state.activePathId === pathId ? null : state.activePathId,
      }));
    },

    setActivePath: (pathId) => {
      set({ activePathId: pathId });
    },

    updatePath: (pathId, updates) => {
      set((state) => ({
        paths: state.paths.map((p) =>
          p.id === pathId ? { ...p, ...updates } : p
        ),
      }));
    },

    addPathPoint: (pathId, point) => {
      set((state) => ({
        paths: state.paths.map((p) =>
          p.id === pathId ? { ...p, points: [...p.points, point] } : p
        ),
      }));
    },

    fillPath: (pathId) => {
      const { paths, layers, activeLayerId, brushSettings } = get();
      const path = paths.find((p) => p.id === pathId);
      const layer = layers.find((l) => l.id === activeLayerId);
      if (!path || !layer || path.points.length < 2) return;

      // Rasterize path fill onto active layer
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);

        ctx.fillStyle = brushSettings.color;
        ctx.beginPath();
        path.points.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else {
            const prev = path.points[i - 1];
            if (prev.handleOut && pt.handleIn) {
              ctx.bezierCurveTo(prev.handleOut.x, prev.handleOut.y, pt.handleIn.x, pt.handleIn.y, pt.x, pt.y);
            } else {
              ctx.lineTo(pt.x, pt.y);
            }
          }
        });
        if (path.closed) ctx.closePath();
        ctx.fill();

        get().updateLayer(activeLayerId!, { imageData: canvas.toDataURL('image/png') });
      };
      img.src = layer.imageData;
    },

    strokePath: (pathId) => {
      const { paths, layers, activeLayerId, brushSettings } = get();
      const path = paths.find((p) => p.id === pathId);
      const layer = layers.find((l) => l.id === activeLayerId);
      if (!path || !layer || path.points.length < 2) return;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);

        ctx.strokeStyle = brushSettings.color;
        ctx.lineWidth = brushSettings.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        path.points.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else {
            const prev = path.points[i - 1];
            if (prev.handleOut && pt.handleIn) {
              ctx.bezierCurveTo(prev.handleOut.x, prev.handleOut.y, pt.handleIn.x, pt.handleIn.y, pt.x, pt.y);
            } else {
              ctx.lineTo(pt.x, pt.y);
            }
          }
        });
        if (path.closed) ctx.closePath();
        ctx.stroke();

        get().updateLayer(activeLayerId!, { imageData: canvas.toDataURL('image/png') });
      };
      img.src = layer.imageData;
    },

    loadPathAsSelection: (pathId) => {
      const { paths, layers, selectionFeather } = get();
      const path = paths.find((p) => p.id === pathId);
      if (!path || path.points.length < 2) return;

      const baseLayer = layers[0];
      const w = baseLayer?.width || 512;
      const h = baseLayer?.height || 512;

      // Rasterize path to selection mask
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = 'white';
      ctx.beginPath();
      path.points.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else {
          const prev = path.points[i - 1];
          if (prev.handleOut && pt.handleIn) {
            ctx.bezierCurveTo(prev.handleOut.x, prev.handleOut.y, pt.handleIn.x, pt.handleIn.y, pt.x, pt.y);
          } else {
            ctx.lineTo(pt.x, pt.y);
          }
        }
      });
      if (path.closed) ctx.closePath();
      ctx.fill();

      const imageData = ctx.getImageData(0, 0, w, h);
      let minX = w, minY = h, maxX = 0, maxY = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (imageData.data[(y * w + x) * 4 + 3] > 0) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }

      const bounds = minX <= maxX
        ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
        : { x: 0, y: 0, width: 0, height: 0 };

      // Use mask-based rendering (not rectangle)
      set({ selectionTool: 'lasso' });

      get().setSelection({
        maskDataUrl: canvas.toDataURL('image/png'),
        bounds,
        feather: selectionFeather,
        isInverted: false,
      });

      // Clear the path and switch to select mode (Photoshop behavior)
      set({
        paths: get().paths.filter((p) => p.id !== pathId),
        activePathId: null,
        activePointIndex: null,
        editMode: 'select',
      });
    },

    setPenToolMode: (mode) => {
      set({ penToolMode: mode, activePointIndex: null, isDraggingHandle: null });
    },

    setActivePointIndex: (index) => {
      set({ activePointIndex: index });
    },

    updatePathPoint: (pathId, pointIndex, updates) => {
      set((state) => ({
        paths: state.paths.map(p =>
          p.id === pathId
            ? {
                ...p,
                points: p.points.map((pt, i) =>
                  i === pointIndex ? { ...pt, ...updates } : pt
                ),
              }
            : p
        ),
      }));
    },

    insertPathPoint: (pathId, afterIndex, point) => {
      set((state) => ({
        paths: state.paths.map(p =>
          p.id === pathId
            ? {
                ...p,
                points: [
                  ...p.points.slice(0, afterIndex + 1),
                  point,
                  ...p.points.slice(afterIndex + 1),
                ],
              }
            : p
        ),
      }));
    },

    removePathPoint: (pathId, pointIndex) => {
      set((state) => ({
        paths: state.paths.map(p =>
          p.id === pathId
            ? { ...p, points: p.points.filter((_, i) => i !== pointIndex) }
            : p
        ),
      }));
    },

    closePath: (pathId) => {
      set((state) => ({
        paths: state.paths.map(p =>
          p.id === pathId ? { ...p, closed: true } : p
        ),
        penToolMode: 'edit',
      }));
    },

    // ==================== Color Profile / CMYK Preview ====================

    toggleColorProofing: () => {
      set((state) => ({ colorProofing: !state.colorProofing }));
    },

    toggleGamutWarning: () => {
      set((state) => ({ gamutWarning: !state.gamutWarning }));
    },

    setColorProfile: (profileName) => {
      set({ colorProfile: profileName });
    },

    // ==================== Selection Modify (Phase 1) ====================

    expandSelectionBy: (_amount) => {
      const state = get();
      if (!state.selection?.maskDataUrl) return;
      // Delegate to canvas component via callback pattern
      // The actual mask manipulation happens in the canvas component
      // which has access to the pixel data
      set({ isDirty: true });
    },

    contractSelectionBy: (_amount) => {
      const state = get();
      if (!state.selection?.maskDataUrl) return;
      set({ isDirty: true });
    },

    smoothSelectionBy: (_radius) => {
      const state = get();
      if (!state.selection?.maskDataUrl) return;
      set({ isDirty: true });
    },

    borderSelectionBy: (_width) => {
      const state = get();
      if (!state.selection?.maskDataUrl) return;
      set({ isDirty: true });
    },

    growSelectionByColor: () => {
      const state = get();
      if (!state.selection?.maskDataUrl) return;
      set({ isDirty: true });
    },

    selectSimilar: () => {
      const state = get();
      if (!state.selection?.maskDataUrl) return;
      set({ isDirty: true });
    },

    // ==================== Stamp Visible (Phase 1) ====================

    stampVisible: () => {
      const state = get();
      if (state.layers.length === 0) return;

      // Create a composite of all visible layers as a new layer
      // This is done by the canvas component — we just add a new layer placeholder
      const newLayer: Layer = {
        id: `layer-${Date.now()}`,
        name: 'Stamped Visible',
        visible: true,
        locked: false,
        opacity: 100,
        fillOpacity: 100,
        blendMode: 'normal',
        imageData: '', // Will be filled by canvas component
        x: 0,
        y: 0,
        width: state.layers[0]?.width || 0,
        height: state.layers[0]?.height || 0,
        type: 'raster',
      };

      set((s) => ({
        layers: [newLayer, ...s.layers],
        activeLayerId: newLayer.id,
        isDirty: true,
      }));
    },

    // ==================== Canvas / Image Operations (Phase 1) ====================

    resizeCanvas: (width, height, anchor) => {
      const { layers, canvasWidth, canvasHeight } = get();
      if (width < 1 || height < 1) return;
      const oldW = canvasWidth > 0 ? canvasWidth : Math.max(...layers.map(l => (l.x ?? 0) + (l.width || 0)), 1);
      const oldH = canvasHeight > 0 ? canvasHeight : Math.max(...layers.map(l => (l.y ?? 0) + (l.height || 0)), 1);

      // Determine offset to add to existing layer positions based on anchor.
      // anchor strings: 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right'
      const dx = anchor.includes('left')
        ? 0
        : anchor.includes('right')
        ? width - oldW
        : Math.round((width - oldW) / 2);
      const dy = anchor.includes('top')
        ? 0
        : anchor.includes('bottom')
        ? height - oldH
        : Math.round((height - oldH) / 2);

      const newLayers = layers.map((l) => ({
        ...l,
        x: (l.x ?? 0) + dx,
        y: (l.y ?? 0) + dy,
      }));

      set({
        layers: newLayers,
        canvasWidth: width,
        canvasHeight: height,
        isDirty: true,
      });

      get().pushHistory('Canvas Size', '');
    },

    resizeImage: (width, height, resampleMethod) => {
      const { layers, canvasWidth, canvasHeight } = get();
      if (width < 1 || height < 1) return;
      const oldW = canvasWidth > 0 ? canvasWidth : Math.max(...layers.map(l => (l.x ?? 0) + (l.width || 0)), 1);
      const oldH = canvasHeight > 0 ? canvasHeight : Math.max(...layers.map(l => (l.y ?? 0) + (l.height || 0)), 1);

      const sx = width / oldW;
      const sy = height / oldH;

      const smoothingQuality: ImageSmoothingQuality =
        resampleMethod === 'nearest' ? 'low' :
        resampleMethod === 'bilinear' ? 'medium' :
        'high';

      const resampleLayer = (imageData: string, targetW: number, targetH: number): Promise<string> =>
        new Promise((resolve) => {
          if (!imageData) {
            resolve(imageData);
            return;
          }
          const img = new Image();
          img.onload = () => {
            const tw = Math.max(1, Math.round(targetW));
            const th = Math.max(1, Math.round(targetH));
            const c = document.createElement('canvas');
            c.width = tw;
            c.height = th;
            const ctx = c.getContext('2d');
            if (!ctx) {
              resolve(imageData);
              return;
            }
            if (resampleMethod === 'nearest') {
              ctx.imageSmoothingEnabled = false;
            } else {
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = smoothingQuality;
            }
            ctx.drawImage(img, 0, 0, tw, th);
            resolve(c.toDataURL());
          };
          img.onerror = () => resolve(imageData);
          img.src = imageData;
        });

      (async () => {
        const updated = await Promise.all(
          layers.map(async (l) => {
            const newW = Math.max(1, Math.round((l.width || 0) * sx));
            const newH = Math.max(1, Math.round((l.height || 0) * sy));
            const newX = Math.round((l.x ?? 0) * sx);
            const newY = Math.round((l.y ?? 0) * sy);
            const newImageData = l.imageData ? await resampleLayer(l.imageData, newW, newH) : l.imageData;
            return { ...l, imageData: newImageData, x: newX, y: newY, width: newW, height: newH };
          }),
        );

        set({
          layers: updated,
          canvasWidth: width,
          canvasHeight: height,
          isDirty: true,
        });

        get().pushHistory('Image Size', '');
      })();
    },

    setDocumentDpi: (dpi) => {
      set({ documentDpi: dpi, isDirty: true });
    },

    // ==================== Phase 3 Actions ====================

    // Quick Mask
    toggleQuickMask: () => {
      const { quickMaskEnabled } = get();
      set({
        quickMaskEnabled: !quickMaskEnabled,
        editMode: !quickMaskEnabled ? 'quickMask' : 'move',
      });
    },
    setQuickMaskColor: (color) => {
      set({ quickMaskColor: color });
    },
    setQuickMaskOpacity: (opacity) => {
      set({ quickMaskOpacity: Math.max(0, Math.min(100, opacity)) });
    },

    // Layer Comps
    addLayerComp: (name, description = '') => {
      const { layers, layerComps } = get();
      const visibility: Record<string, boolean> = {};
      const positions: Record<string, { x: number; y: number }> = {};
      const styles: Record<string, boolean> = {};
      layers.forEach((l) => {
        visibility[l.id] = l.visible;
        positions[l.id] = { x: l.x, y: l.y };
        styles[l.id] = (l.effects?.length ?? 0) > 0;
      });
      const comp: LayerComp = {
        id: generateId(),
        name,
        description,
        layerVisibility: visibility,
        layerPositions: positions,
        layerStyles: styles,
        lastUpdated: Date.now(),
      };
      set({ layerComps: [...layerComps, comp], activeLayerCompId: comp.id });
    },
    updateLayerComp: (id) => {
      const { layers, layerComps } = get();
      set({
        layerComps: layerComps.map((c) => {
          if (c.id !== id) return c;
          const visibility: Record<string, boolean> = {};
          const positions: Record<string, { x: number; y: number }> = {};
          const styles: Record<string, boolean> = {};
          layers.forEach((l) => {
            visibility[l.id] = l.visible;
            positions[l.id] = { x: l.x, y: l.y };
            styles[l.id] = (l.effects?.length ?? 0) > 0;
          });
          return { ...c, layerVisibility: visibility, layerPositions: positions, layerStyles: styles, lastUpdated: Date.now() };
        }),
      });
    },
    applyLayerComp: (id) => {
      const { layerComps, layers } = get();
      const comp = layerComps.find((c) => c.id === id);
      if (!comp) return;
      set({
        layers: layers.map((l) => ({
          ...l,
          visible: comp.layerVisibility[l.id] ?? l.visible,
          x: comp.layerPositions[l.id]?.x ?? l.x,
          y: comp.layerPositions[l.id]?.y ?? l.y,
        })),
        activeLayerCompId: id,
      });
    },
    deleteLayerComp: (id) => {
      const { layerComps, activeLayerCompId } = get();
      set({
        layerComps: layerComps.filter((c) => c.id !== id),
        activeLayerCompId: activeLayerCompId === id ? null : activeLayerCompId,
      });
    },

    // Fill Layers
    addFillLayer: (fillType, options = {}) => {
      const { layers } = get();
      const newLayer: Layer = {
        id: generateId(),
        name: `${fillType.charAt(0).toUpperCase() + fillType.slice(1)} Fill`,
        visible: true,
        locked: false,
        opacity: 100,
        fillOpacity: 100,
        blendMode: 'normal',
        imageData: '',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        type: 'fill',
        fillType,
        fillColor: fillType === 'solid' ? (options.fillColor ?? '#ffffff') : undefined,
        fillGradient: fillType === 'gradient' ? (options.fillGradient ?? { colors: ['#000000', '#ffffff'], angle: 0, type: 'linear' }) : undefined,
        fillPattern: fillType === 'pattern' ? (options.fillPattern ?? { url: '', scale: 100 }) : undefined,
        ...options,
      };
      set({ layers: [newLayer, ...layers], activeLayerId: newLayer.id, isDirty: true });
    },

    // Measure Tool
    setMeasureLine: (line) => {
      set({ measureLine: line });
    },

    // Transform Selection
    transformSelection: (type, values) => {
      const { selection } = get();
      if (!selection || !selection.bounds) return;
      const b = { ...selection.bounds };
      if (type === 'move') {
        b.x += values.dx ?? 0;
        b.y += values.dy ?? 0;
      } else if (type === 'scale') {
        b.width = Math.round(b.width * (values.scaleX ?? 1));
        b.height = Math.round(b.height * (values.scaleY ?? 1));
      }
      set({ selection: { ...selection, bounds: b } });
    },

    // Color Range (advanced)
    selectByColorRange: (color, fuzziness, _range = 'all') => {
      set({
        colorRangeColor: color,
        colorRangeFuzziness: fuzziness,
        selectionTool: 'colorRange',
        editMode: 'selection',
      });
    },

    // Frame Tool
    addFrame: (x, y, width, height) => {
      const { frames } = get();
      const frame: FrameLayer = { id: generateId(), name: `Frame ${frames.length + 1}`, x, y, width, height };
      set({ frames: [...frames, frame], activeFrameId: frame.id, isDirty: true });
    },
    deleteFrame: (id) => {
      const { frames, activeFrameId } = get();
      set({
        frames: frames.filter((f) => f.id !== id),
        activeFrameId: activeFrameId === id ? null : activeFrameId,
        isDirty: true,
      });
    },
    setActiveFrame: (id) => {
      set({ activeFrameId: id });
    },
    clipLayerToFrame: (layerId, _frameId) => {
      const { layers } = get();
      set({
        layers: layers.map((l) => l.id === layerId ? { ...l, clippingMask: true } : l),
        isDirty: true,
      });
    },

    // Swatches
    addSwatch: (name, color, group) => {
      const { swatches } = get();
      set({ swatches: [...swatches, { id: generateId(), name, color, group }] });
    },
    deleteSwatch: (id) => {
      const { swatches } = get();
      set({ swatches: swatches.filter((s) => s.id !== id) });
    },
    loadSwatchPreset: (preset) => {
      const presets: Record<string, SwatchColor[]> = {
        default: [
          { id: 'sw-1', name: 'Black', color: '#000000' },
          { id: 'sw-2', name: 'White', color: '#ffffff' },
          { id: 'sw-3', name: 'Red', color: '#ff0000' },
          { id: 'sw-4', name: 'Green', color: '#00ff00' },
          { id: 'sw-5', name: 'Blue', color: '#0000ff' },
          { id: 'sw-6', name: 'Yellow', color: '#ffff00' },
          { id: 'sw-7', name: 'Cyan', color: '#00ffff' },
          { id: 'sw-8', name: 'Magenta', color: '#ff00ff' },
        ],
        pastel: [
          { id: 'sp-1', name: 'Rose', color: '#FFB6C1' },
          { id: 'sp-2', name: 'Peach', color: '#FFDAB9' },
          { id: 'sp-3', name: 'Lavender', color: '#E6E6FA' },
          { id: 'sp-4', name: 'Mint', color: '#98FB98' },
          { id: 'sp-5', name: 'Sky', color: '#87CEEB' },
          { id: 'sp-6', name: 'Lemon', color: '#FFFACD' },
          { id: 'sp-7', name: 'Lilac', color: '#DDA0DD' },
          { id: 'sp-8', name: 'Coral', color: '#FFA07A' },
        ],
        'web-safe': [
          { id: 'swb-1', name: 'Black', color: '#000000' },
          { id: 'swb-2', name: 'White', color: '#ffffff' },
          { id: 'swb-3', name: 'Red', color: '#ff0000' },
          { id: 'swb-4', name: 'Lime', color: '#00ff00' },
          { id: 'swb-5', name: 'Blue', color: '#0000ff' },
          { id: 'swb-6', name: 'Yellow', color: '#ffff00' },
          { id: 'swb-7', name: 'Aqua', color: '#00ffff' },
          { id: 'swb-8', name: 'Fuchsia', color: '#ff00ff' },
          { id: 'swb-9', name: 'Silver', color: '#c0c0c0' },
          { id: 'swb-10', name: 'Gray', color: '#808080' },
          { id: 'swb-11', name: 'Maroon', color: '#800000' },
          { id: 'swb-12', name: 'Olive', color: '#808000' },
          { id: 'swb-13', name: 'Navy', color: '#000080' },
          { id: 'swb-14', name: 'Teal', color: '#008080' },
          { id: 'swb-15', name: 'Orange', color: '#FFA500' },
          { id: 'swb-16', name: 'Purple', color: '#800080' },
        ],
        pantone: [
          { id: 'spt-1', name: 'Living Coral', color: '#FF6F61' },
          { id: 'spt-2', name: 'Ultra Violet', color: '#6B5B95' },
          { id: 'spt-3', name: 'Greenery', color: '#88B04B' },
          { id: 'spt-4', name: 'Serenity', color: '#92A8D1' },
          { id: 'spt-5', name: 'Rose Quartz', color: '#F7CAC9' },
          { id: 'spt-6', name: 'Marsala', color: '#955251' },
          { id: 'spt-7', name: 'Classic Blue', color: '#0F4C81' },
          { id: 'spt-8', name: 'Illuminating', color: '#F5DF4D' },
        ],
      };
      set({ swatches: presets[preset] ?? presets.default });
    },

    // Color Picker
    setColorPickerMode: (mode) => {
      set({ colorPickerMode: mode });
    },

    // Crop overlay
    setCropOverlay: (overlay) => {
      set({ cropOverlay: overlay });
    },

    // Object Selection (AI-assisted) - stub for AI API integration
    objectSelect: (bounds) => {
      // In production, this would call an AI segmentation API
      // For now, create a rectangular selection from the provided bounds
      set({
        selection: {
          maskDataUrl: '',
          bounds,
          feather: 0,
          isInverted: false,
        },
        editMode: 'selection',
      });
    },

    // Patch Tool - stub for content-aware fill
    patchArea: (_sourceRect, _targetRect) => {
      // In production, this would perform content-aware patch
      set({ isDirty: true });
    },

    // ==================== Phase 4 Actions ====================

    // Text enhancements
    setTextType: (type) => {
      set((state) => ({
        textSettings: { ...state.textSettings, textType: type },
      }));
    },
    setParagraphSize: (width, height) => {
      set((state) => ({
        textSettings: { ...state.textSettings, paragraphWidth: width, paragraphHeight: height, textType: 'paragraph' },
      }));
    },
    setWarpStyle: (style, bend = 50) => {
      set((state) => ({
        textSettings: { ...state.textSettings, warpStyle: style, warpBend: bend },
      }));
    },
    setTypeOnPath: (pathId) => {
      set((state) => ({
        textSettings: { ...state.textSettings, pathId, pathOffset: 0, pathAlignment: 'baseline' },
      }));
    },

    // Custom Shapes
    addCustomShape: (shape) => {
      const { customShapes } = get();
      set({ customShapes: [...customShapes, shape] });
    },
    setActiveCustomShape: (id) => {
      set({ activeCustomShapeId: id, shapeTool: id ? 'custom' : 'rectangle' });
    },

    // Path Operations
    combinePaths: (pathIds, _operation) => {
      const { paths } = get();
      if (pathIds.length < 2) return;
      const selectedPaths = paths.filter((p) => pathIds.includes(p.id));
      if (selectedPaths.length < 2) return;
      // Combine all points into first path (simplified — real implementation would use boolean path ops)
      const combined = { ...selectedPaths[0], points: selectedPaths.flatMap((p) => p.points) };
      set({
        paths: [combined, ...paths.filter((p) => !pathIds.includes(p.id))],
        activePathId: combined.id,
        isDirty: true,
      });
    },

    // Export
    setExportSettings: (settings) => {
      set((state) => ({
        exportSettings: { ...state.exportSettings, ...settings },
      }));
    },
    exportAs: (_format) => {
      // In production, this would trigger the export dialog/pipeline
      // The actual export logic is in lib/psd/exportPsd.ts and canvas export functions
    },

    // SVG Import
    importSvg: (_svgString) => {
      // In production, parse SVG and create vector layers
      // For now, mark as dirty to acknowledge the intent
      set({ isDirty: true });
    },

    // Batch Processing
    addBatchTask: (task) => {
      const { batchTasks } = get();
      const newTask: BatchProcessingTask = {
        ...task,
        id: generateId(),
        status: 'pending',
        progress: 0,
        processedCount: 0,
        errors: [],
      };
      set({ batchTasks: [...batchTasks, newTask] });
    },
    runBatchTask: (taskId) => {
      const { batchTasks } = get();
      set({
        batchTasks: batchTasks.map((t) =>
          t.id === taskId ? { ...t, status: 'running' as const, progress: 0 } : t
        ),
      });
    },
    cancelBatchTask: (taskId) => {
      const { batchTasks } = get();
      set({
        batchTasks: batchTasks.map((t) =>
          t.id === taskId ? { ...t, status: 'error' as const, errors: [...t.errors, 'Cancelled by user'] } : t
        ),
      });
    },

    // Conditional Actions
    addConditionalAction: (action) => {
      const { conditionalActions } = get();
      set({ conditionalActions: [...conditionalActions, { ...action, id: generateId() }] });
    },
    removeConditionalAction: (id) => {
      const { conditionalActions } = get();
      set({ conditionalActions: conditionalActions.filter((a) => a.id !== id) });
    },

    // ==================== Phase 5 Actions ====================

    // Smart Objects
    convertToSmartObject: (layerId) => {
      const { layers } = get();
      set({
        layers: layers.map((l) => {
          if (l.id !== layerId) return l;
          return {
            ...l,
            smartObject: {
              sourceUrl: l.imageData,
              sourceType: 'embedded' as const,
              lastModified: Date.now(),
              originalWidth: l.width,
              originalHeight: l.height,
            },
            smartFilters: [],
          };
        }),
        isDirty: true,
      });
    },
    rasterizeSmartObject: (layerId) => {
      const { layers } = get();
      set({
        layers: layers.map((l) => {
          if (l.id !== layerId) return l;
          const { smartObject: _so, smartFilters: _sf, ...rest } = l;
          return { ...rest, smartObject: undefined, smartFilters: undefined };
        }),
        isDirty: true,
      });
    },
    editSmartObjectSource: (layerId) => {
      // In production, this would open the smart object source in a new editor tab
      const { layers } = get();
      const layer = layers.find((l) => l.id === layerId);
      if (!layer?.smartObject) return;
      // Stub: just mark as editing
      set({ activeLayerId: layerId });
    },

    // Smart Filters
    addSmartFilter: (layerId, filterType, params) => {
      const { layers } = get();
      set({
        layers: layers.map((l) => {
          if (l.id !== layerId || !l.smartObject) return l;
          const filter: SmartFilter = {
            id: generateId(),
            filterType,
            params,
            enabled: true,
            blendMode: 'normal',
            opacity: 100,
          };
          return { ...l, smartFilters: [...(l.smartFilters ?? []), filter] };
        }),
        isDirty: true,
      });
    },
    removeSmartFilter: (layerId, filterId) => {
      const { layers } = get();
      set({
        layers: layers.map((l) => {
          if (l.id !== layerId) return l;
          return { ...l, smartFilters: (l.smartFilters ?? []).filter((f) => f.id !== filterId) };
        }),
        isDirty: true,
      });
    },
    toggleSmartFilter: (layerId, filterId) => {
      const { layers } = get();
      set({
        layers: layers.map((l) => {
          if (l.id !== layerId) return l;
          return {
            ...l,
            smartFilters: (l.smartFilters ?? []).map((f) =>
              f.id === filterId ? { ...f, enabled: !f.enabled } : f
            ),
          };
        }),
        isDirty: true,
      });
    },
    reorderSmartFilters: (layerId, fromIndex, toIndex) => {
      const { layers } = get();
      set({
        layers: layers.map((l) => {
          if (l.id !== layerId) return l;
          const filters = [...(l.smartFilters ?? [])];
          const [moved] = filters.splice(fromIndex, 1);
          if (moved) filters.splice(toIndex, 0, moved);
          return { ...l, smartFilters: filters };
        }),
        isDirty: true,
      });
    },

    // Linked Layers
    linkLayers: (layerIds) => {
      if (layerIds.length < 2) return;
      const groupId = generateId();
      const { layers, linkedGroups } = get();
      set({
        layers: layers.map((l) =>
          layerIds.includes(l.id) ? { ...l, linkedGroupId: groupId } : l
        ),
        linkedGroups: { ...linkedGroups, [groupId]: layerIds },
        isDirty: true,
      });
    },
    unlinkLayers: (layerIds) => {
      const { layers, linkedGroups } = get();
      const newLinkedGroups = { ...linkedGroups };
      const updatedLayers = layers.map((l) => {
        if (!layerIds.includes(l.id)) return l;
        if (l.linkedGroupId && newLinkedGroups[l.linkedGroupId]) {
          newLinkedGroups[l.linkedGroupId] = newLinkedGroups[l.linkedGroupId].filter((id) => id !== l.id);
          if (newLinkedGroups[l.linkedGroupId].length < 2) {
            delete newLinkedGroups[l.linkedGroupId];
          }
        }
        return { ...l, linkedGroupId: undefined };
      });
      set({ layers: updatedLayers, linkedGroups: newLinkedGroups, isDirty: true });
    },

    // Advanced Blending (Blend If)
    setBlendIf: (layerId, settings) => {
      const { layers } = get();
      set({
        layers: layers.map((l) =>
          l.id === layerId ? { ...l, blendIf: settings } : l
        ),
        isDirty: true,
      });
    },

    // Content-Aware Move
    contentAwareMove: (_sourceRect, _targetX, _targetY) => {
      // In production, this would call an AI API for content-aware fill/move
      set({ isDirty: true });
    },

    // ==================== Phase 6 Actions ====================

    // Brush Presets
    addBrushPreset: (preset) => {
      const { brushPresets } = get();
      set({ brushPresets: [...brushPresets, { ...preset, id: generateId() }] });
    },
    deleteBrushPreset: (id) => {
      const { brushPresets, activeBrushPresetId } = get();
      set({
        brushPresets: brushPresets.filter((p) => p.id !== id),
        activeBrushPresetId: activeBrushPresetId === id ? null : activeBrushPresetId,
      });
    },
    applyBrushPreset: (id) => {
      const { brushPresets } = get();
      const preset = brushPresets.find((p) => p.id === id);
      if (!preset) return;
      set({
        brushSettings: { ...preset.settings },
        brushDynamics: preset.dynamics ?? null,
        activeBrushPresetId: id,
      });
    },
    setBrushDynamics: (dynamics) => {
      set({ brushDynamics: dynamics });
    },

    // Symmetry Painting
    setSymmetryMode: (mode) => {
      set({ symmetryMode: mode });
    },

    // Clone Source
    setCloneSource: (settings) => {
      set((state) => ({
        cloneSource: { ...state.cloneSource, ...settings },
      }));
    },

    // Notes
    addNote: (x, y, text) => {
      const { notes } = get();
      const note: NoteAnnotation = {
        id: generateId(),
        x, y, text,
        author: 'User',
        color: '#ffff00',
        createdAt: Date.now(),
        isCollapsed: false,
      };
      set({ notes: [...notes, note] });
    },
    updateNote: (id, updates) => {
      const { notes } = get();
      set({ notes: notes.map((n) => n.id === id ? { ...n, ...updates } : n) });
    },
    deleteNote: (id) => {
      const { notes } = get();
      set({ notes: notes.filter((n) => n.id !== id) });
    },

    // Artboards
    addArtboard: (name, x, y, width, height) => {
      const { artboards } = get();
      const artboard: Artboard = {
        id: generateId(),
        name,
        x, y, width, height,
        backgroundColor: '#ffffff',
        layerIds: [],
      };
      set({ artboards: [...artboards, artboard], activeArtboardId: artboard.id });
    },
    deleteArtboard: (id) => {
      const { artboards, activeArtboardId } = get();
      set({
        artboards: artboards.filter((a) => a.id !== id),
        activeArtboardId: activeArtboardId === id ? null : activeArtboardId,
      });
    },
    setActiveArtboard: (id) => {
      set({ activeArtboardId: id });
    },
    renameArtboard: (id, name) => {
      const { artboards } = get();
      set({ artboards: artboards.map((a) => a.id === id ? { ...a, name } : a) });
    },

    // ==================== Phase 11-B: History Snapshots ====================

    createHistorySnapshot: (name) => {
      const { history, historyIndex, historySnapshots, layers } = get();
      const currentHistory = history[historyIndex];
      if (!currentHistory) return;

      const snapshot: HistorySnapshot = {
        id: generateId(),
        name,
        imageData: currentHistory.imageData,
        layers: layers.map((l) => ({ ...l })),
        timestamp: Date.now(),
      };

      set({ historySnapshots: [...historySnapshots, snapshot] });
    },

    restoreHistorySnapshot: (id) => {
      const { historySnapshots } = get();
      const snapshot = historySnapshots.find((s) => s.id === id);
      if (!snapshot) return;

      // Restore layers and push a new history entry for the restoration
      const restoredLayers = snapshot.layers.map((l) => ({ ...l }));
      set({ layers: restoredLayers });

      // Push as a new history state so undo can reverse the restore
      get().pushHistory(`Restore Snapshot: ${snapshot.name}`, snapshot.imageData);
    },

    deleteHistorySnapshot: (id) => {
      const { historySnapshots } = get();
      set({ historySnapshots: historySnapshots.filter((s) => s.id !== id) });
    },

    // ==================== Phase 11-B: Layer Align/Distribute ====================

    alignLayers: (alignment, layerIds) => {
      const { layers } = get();
      if (layerIds.length < 2) return;

      const targetLayers = layers.filter((l) => layerIds.includes(l.id));
      if (targetLayers.length < 2) return;

      // Calculate bounding box of all target layers
      const bounds = {
        minX: Math.min(...targetLayers.map((l) => l.x)),
        minY: Math.min(...targetLayers.map((l) => l.y)),
        maxX: Math.max(...targetLayers.map((l) => l.x + l.width)),
        maxY: Math.max(...targetLayers.map((l) => l.y + l.height)),
      };

      const updatedLayers = layers.map((layer) => {
        if (!layerIds.includes(layer.id)) return layer;

        const updated = { ...layer };

        switch (alignment) {
          case 'left':
            updated.x = bounds.minX;
            break;
          case 'center':
            updated.x = bounds.minX + (bounds.maxX - bounds.minX) / 2 - layer.width / 2;
            break;
          case 'right':
            updated.x = bounds.maxX - layer.width;
            break;
          case 'top':
            updated.y = bounds.minY;
            break;
          case 'middle':
            updated.y = bounds.minY + (bounds.maxY - bounds.minY) / 2 - layer.height / 2;
            break;
          case 'bottom':
            updated.y = bounds.maxY - layer.height;
            break;
        }

        return updated;
      });

      set({ layers: updatedLayers, isDirty: true });
    },

    distributeLayers: (distribution, layerIds) => {
      const { layers } = get();
      if (layerIds.length < 3) return;

      const targetLayers = layers
        .filter((l) => layerIds.includes(l.id))
        .sort((a, b) => distribution === 'horizontal' ? a.x - b.x : a.y - b.y);

      if (targetLayers.length < 3) return;

      const first = targetLayers[0];
      const last = targetLayers[targetLayers.length - 1];

      if (distribution === 'horizontal') {
        // Distribute horizontally: evenly space centers between first and last
        const firstCenter = first.x + first.width / 2;
        const lastCenter = last.x + last.width / 2;
        const totalSpan = lastCenter - firstCenter;
        const step = totalSpan / (targetLayers.length - 1);

        const positionMap = new Map<string, number>();
        targetLayers.forEach((layer, i) => {
          const newCenterX = firstCenter + step * i;
          positionMap.set(layer.id, newCenterX - layer.width / 2);
        });

        const updatedLayers = layers.map((layer) => {
          const newX = positionMap.get(layer.id);
          if (newX === undefined) return layer;
          return { ...layer, x: newX };
        });

        set({ layers: updatedLayers, isDirty: true });
      } else {
        // Distribute vertically: evenly space centers between first and last
        const firstCenter = first.y + first.height / 2;
        const lastCenter = last.y + last.height / 2;
        const totalSpan = lastCenter - firstCenter;
        const step = totalSpan / (targetLayers.length - 1);

        const positionMap = new Map<string, number>();
        targetLayers.forEach((layer, i) => {
          const newCenterY = firstCenter + step * i;
          positionMap.set(layer.id, newCenterY - layer.height / 2);
        });

        const updatedLayers = layers.map((layer) => {
          const newY = positionMap.get(layer.id);
          if (newY === undefined) return layer;
          return { ...layer, y: newY };
        });

        set({ layers: updatedLayers, isDirty: true });
      }
    },

    // ==================== Phase 11-B: Smart Guides & Guide Layout ====================

    toggleSmartGuides: () => {
      set((state) => ({ smartGuidesEnabled: !state.smartGuidesEnabled }));
    },

    setActiveSnapLines: (lines) => {
      set({ activeSnapLines: lines });
    },

    createGuideLayout: (columns, rows, gutterWidth, gutterHeight) => {
      const { layers } = get();
      if (layers.length === 0) return;

      // Calculate canvas dimensions from layers bounding box
      const canvasWidth = Math.max(...layers.map((l) => l.x + l.width));
      const canvasHeight = Math.max(...layers.map((l) => l.y + l.height));

      if (canvasWidth <= 0 || canvasHeight <= 0) return;

      const newHorizontal: number[] = [];
      const newVertical: number[] = [];

      // Calculate column guides
      if (columns > 0) {
        const totalGutterWidth = gutterWidth * (columns - 1);
        const columnWidth = (canvasWidth - totalGutterWidth) / columns;

        for (let i = 1; i < columns; i++) {
          // Left edge of gutter
          const gutterLeft = i * columnWidth + (i - 1) * gutterWidth;
          newVertical.push(gutterLeft);
          // Right edge of gutter (if gutter > 0)
          if (gutterWidth > 0) {
            newVertical.push(gutterLeft + gutterWidth);
          }
        }
      }

      // Calculate row guides
      if (rows > 0) {
        const totalGutterHeight = gutterHeight * (rows - 1);
        const rowHeight = (canvasHeight - totalGutterHeight) / rows;

        for (let i = 1; i < rows; i++) {
          // Top edge of gutter
          const gutterTop = i * rowHeight + (i - 1) * gutterHeight;
          newHorizontal.push(gutterTop);
          // Bottom edge of gutter (if gutter > 0)
          if (gutterHeight > 0) {
            newHorizontal.push(gutterTop + gutterHeight);
          }
        }
      }

      set({
        guides: {
          horizontal: newHorizontal,
          vertical: newVertical,
        },
        showGuides: true,
      });
    },
  };
}

// ==================== Backward-Compatible Shim ====================
//
// Many files import `useImageEditorStore` and call `.getState()`, `.setState()`,
// or `.subscribe()` outside React render (in callbacks, event handlers, utility
// functions).  The shim delegates these imperative calls to the active tab's
// store via the registry, so those 78+ call-sites continue to work without any
// import-path changes.
//
// Inside React components that are rendered within <ImageEditorStoreProvider>,
// prefer importing `useImageEditorStore` from `imageEditorContext.tsx` via the
// re-export below — but the shim also works as a React hook when there is an
// active store in the registry.

import { useStore } from 'zustand';

type FullState = ImageEditorState & ImageEditorActions;

function _useImageEditorStoreHook(): FullState;
function _useImageEditorStoreHook<T>(selector: (s: FullState) => T): T;
function _useImageEditorStoreHook<T>(selector?: (s: FullState) => T): FullState | T {
  const store = getActiveStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, react-hooks/rules-of-hooks
  return useStore(store, selector as any);
}

/**
 * Backward-compatible `useImageEditorStore`.
 *
 * - As a React hook: `useImageEditorStore()` or `useImageEditorStore(selector)`
 * - Imperatively: `useImageEditorStore.getState()`, `.setState()`, `.subscribe()`
 */
export const useImageEditorStore = Object.assign(_useImageEditorStoreHook, {
  getState: () => getActiveStore().getState(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setState: (partial: any, replace?: any) =>
    getActiveStore().setState(partial, replace),
  subscribe: (listener: (state: FullState, prev: FullState) => void) =>
    getActiveStore().subscribe(listener),
});

export default useImageEditorStore;
