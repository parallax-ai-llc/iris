/**
 * Video Editor Types
 * Shared types for the editor store and components
 */

import type { IrisAsset } from '@/shared/api/types';
import type { SubtitleCue } from '@/shared/api/subtitle.api';
import type { TimelineData, ClipEffect, Keyframe, EditorTrackType, SubtitleAnimationKeyframe, TrackSend } from '@/types/videoProject.types';
import type { BlendMode } from '@/types/blendMode';

// ==================== Core Types ====================

/** Re-export EditorTrackType as TrackType for backwards compatibility */
export type TrackType = EditorTrackType;

export type { BlendMode };

export interface Position {
  x: number; // percentage from left (0-100)
  y: number; // percentage from top (0-100)
}

export interface Transform {
  scale: number;
  rotation: number;
  opacity: number;
  x: number;
  y: number;
}

export type SubtitleAnimation =
  | 'none'
  | 'highlight'    // Karaoke-style: current word changes color
  | 'typewriter'   // Characters appear one by one
  | 'bounce'       // Words bounce in from top
  | 'scale'        // Current word scales up
  | 'fade-word'    // Words fade in/out individually
  | 'slide-up'     // Text slides up into view
  | 'glow'         // Pulsing glow effect on text
  | 'wave';        // Wave motion across characters

export interface SubtitleStyle {
  fontSize: number;
  fontFamily: string;
  fontColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  position: Position;
  alignment: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  animation: SubtitleAnimation;
  animationColor: string; // Accent color for highlight/glow animations

  // Advanced text styling (#40)
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  stroke?: { color: string; width: number }; // text outline/stroke
  dropShadow?: { color: string; offsetX: number; offsetY: number; blur: number }; // text shadow
  letterSpacing?: number; // kerning (-5 to 20px)
  lineHeight?: number; // leading (0.8 to 3.0 multiplier)
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

// ==================== Clip Types ====================

export type ClipLabel = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'none';

export interface BaseClip {
  id: string;
  trackId: string;
  startTime: number; // position on timeline (seconds)
  endTime: number;
  sourceStartTime: number; // start offset in source media
  sourceEndTime: number;
  sourceDuration?: number; // total duration of original media (seconds)
  name: string;
  linkedClipId?: string; // paired clip ID (e.g. video ↔ audio)
  label?: ClipLabel; // color label for clip organization
  note?: string;     // user comment/note on clip
}

export interface VideoClip extends BaseClip {
  type: 'video';
  assetId: string;
  thumbnailUrl?: string;
  transform: Transform;
  mediaType?: 'video' | 'image';
  volume: number;
  muted: boolean;
  speed: number;
  pan?: number;   // stereo pan: -1 (Left) ~ 0 (Center) ~ 1 (Right)
  gain?: number;  // audio gain in dB: -∞ ~ +12, default 0
  blendMode: BlendMode;
  effects: ClipEffect[];
  keyframes: Keyframe[];
  timeRemappingKeyframes?: TimeRemappingKeyframe[];
  frameBlending?: 'none' | 'frame-sampling' | 'frame-blending' | 'optical-flow';
  masks?: ObjectMask[];
}

export interface AudioClip extends BaseClip {
  type: 'audio';
  assetId: string;
  volume: number;
  muted: boolean;
  fadeIn: number;  // seconds
  fadeOut: number; // seconds
  pan?: number;     // stereo pan: -1 (Left) ~ 0 (Center) ~ 1 (Right)
  gain?: number;    // audio gain in dB: -∞ ~ +12, default 0
  waveformData?: number[];
  effects: ClipEffect[];
  keyframes: Keyframe[];
  channelMapping?: 'stereo' | 'mono-left' | 'mono-right' | 'dual-mono' | 'swap';
  essentialSoundType?: EssentialSoundType; // Essential Sound Panel categorization
}

export interface SubtitleClip extends BaseClip {
  type: 'subtitle';
  text: string;
  cueId?: string; // reference to original SubtitleCue
  style: SubtitleStyle;
  animationKeyframes?: SubtitleAnimationKeyframe[];
}

export interface MusicClip extends BaseClip {
  type: 'music';
  assetId: string;
  name: string;
  volume: number;
  fadeIn: number; // seconds
  fadeOut: number;
  waveformData?: number[];
}

export interface AdjustmentClip extends BaseClip {
  type: 'adjustment';
  opacity: number; // 0-1: overall blend intensity of effects applied below
  effects: ClipEffect[];
  keyframes: Keyframe[];
}

export interface CompoundClip extends BaseClip {
  type: 'compound';
  innerClips: Clip[];
  innerTracks: Track[];
  thumbnailUrl?: string;
}

export interface ShapeClip extends BaseClip {
  type: 'shape';
  shapeType: 'rectangle' | 'ellipse' | 'polygon' | 'line';
  fill: string; // fill color
  fillOpacity: number; // 0-1
  strokeColor: string;
  strokeWidth: number;
  cornerRadius?: number; // for rectangle
  sides?: number; // for polygon (3-12)
  transform: Transform;
}

export type Clip = VideoClip | AudioClip | SubtitleClip | MusicClip | AdjustmentClip | CompoundClip | ShapeClip;

/** Distributive Omit that preserves union members (unlike built-in Omit) */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

// ==================== Track Types ====================

export interface Track {
  id: string;
  type: TrackType;
  name: string;
  locked: boolean;
  muted: boolean;
  solo: boolean;
  visible: boolean;
  volume: number; // track-level volume 0-1
  pan?: number;    // track-level stereo pan: -1 (Left) ~ 0 (Center) ~ 1 (Right)
  height: number; // track height in pixels
  clips: Clip[];
  sends?: TrackSend[];
}

export interface EditorProject {
  id: string;
  name: string;
  assetId: string; // main video asset
  duration: number;
  tracks: Track[];
  createdAt: string;
  updatedAt: string;
}

// ==================== Drag & Selection Types ====================

export type DragOperation = 'move' | 'trim-start' | 'trim-end' | 'roll-start' | 'roll-end' | 'slip' | 'slide' | 'rate-stretch' | 'split';

export interface DragState {
  clipId: string;
  trackId: string;
  operation: DragOperation;
  startX: number;
  startTime: number;
  originalClip: Clip;
  linkedOriginalClip?: Clip; // original state of linked clip at drag start
  adjacentClipId?: string; // for roll edit: the neighboring clip
  adjacentOriginalClip?: Clip; // original state of adjacent clip
}

export interface Selection {
  clipIds: string[];
  trackIds: string[];
}

// ==================== Marker Type ====================

export interface Marker {
  id: string;
  time: number;      // seconds on timeline
  label?: string;
  color?: string;    // hex color, default '#f59e0b'
  type?: 'standard' | 'chapter' | 'comment' | 'segmentation' | 'web-link' | 'in-out' | 'flash-cue'; // marker category
  url?: string;      // for 'web-link' markers
  endTime?: number;  // for 'in-out' range markers
  comment?: string;  // free-form note attached to the marker
}

// ==================== Multicam Types ====================

export interface MulticamSource {
  id: string;
  assetId: string;
  name: string;
  thumbnailUrl?: string;
  syncOffset: number; // offset in seconds relative to master (0 = master)
  duration: number;
}

export interface MulticamCut {
  time: number; // timeline time of angle switch
  angleIndex: number; // which source angle to show
}

// ==================== Time Remapping Types ====================

export interface TimeRemappingKeyframe {
  time: number;
  speed: number;
}

// ==================== Media Bin Types ====================

export interface MediaBin {
  id: string;
  name: string;
  parentId: string | null;
  color?: string;
}

// ==================== Workspace Preset Types ====================

export interface WorkspacePreset {
  id: string;
  name: string;
  layout: Record<string, boolean>;
}

// ==================== Team/Collaboration Types ====================

export type TeamMemberRole = 'owner' | 'editor' | 'viewer';

export interface TeamMember {
  id: string;
  name: string;
  role: TeamMemberRole;
}

export interface TeamProject {
  projectId: string;
  members: TeamMember[];
  isShared: boolean;
}

export interface FrameIoComment {
  id: string;
  time: number;
  text: string;
  author: string;
  resolved: boolean;
}

// ==================== Productions (Multi-Project) Types ====================

export interface ProductionProject {
  id: string;
  name: string;
  projectIds: string[];
}

// ==================== Playback & Performance Types ====================

export type GpuAccelerationMode = 'cuda' | 'opencl' | 'metal' | 'software';

export interface TransmitConfig {
  enabled: boolean;
  device: string;
  outputFormat: string;
}

// ==================== Object Mask Types ====================

export interface ObjectMaskTrackingFrame {
  time: number;
  path: string;
}

export interface ObjectMask {
  id: string;
  type: 'object' | 'person' | 'custom';
  trackingData?: ObjectMaskTrackingFrame[];
  feathering: number;
  invert: boolean;
}

// ==================== Essential Sound Types ====================

export type EssentialSoundType = 'dialogue' | 'music' | 'sfx' | 'ambience';

// ==================== Closed Caption Types ====================

export type ClosedCaptionStandard = 'cea-608' | 'cea-708' | 'open';

export interface CaptionDurationRules {
  minDuration: number; // seconds
  maxDuration: number; // seconds
  minGap: number;      // minimum gap between captions in seconds
}

// ==================== Text-Based Editing Types ====================

export interface TranscriptSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  clipId: string;
  confidence: number;
}

// ==================== Motion Graphics Template Types ====================

export interface MogrtEditableProperty {
  name: string;
  type: 'text' | 'color' | 'number' | 'image';
  defaultValue: string | number;
}

export interface MotionGraphicsTemplate {
  id: string;
  name: string;
  category: string;
  thumbnailUrl?: string;
  editableProperties: MogrtEditableProperty[];
}

// ==================== Text & Graphics Advanced Types ====================

export interface TextStyle {
  fontFamily: string;
  fontWeight: 'normal' | 'bold' | 'light' | 'black';
  fontSize: number;
  fillType: 'solid' | 'linear-gradient' | 'radial-gradient';
  fillColor: string;
  fillGradient?: { stops: { color: string; position: number }[]; angle: number };
  strokes: { color: string; width: number }[]; // multiple strokes support
  shadow?: { color: string; offsetX: number; offsetY: number; blur: number; opacity: number };
  background?: { color: string; opacity: number; paddingX: number; paddingY: number; cornerRadius: number };
  kerning: number;     // letter spacing (-100 to 200)
  leading: number;     // line height (0.5 to 4.0)
  tracking: number;    // tracking (-200 to 500)
  tabStops: number[];  // tab stop positions in pixels
  verticalText: boolean;
  textPath?: { type: 'line' | 'circle' | 'bezier'; pathData: string };
  baselineShift: number;
}

export interface AlignDistribute {
  alignH: 'left' | 'center' | 'right';
  alignV: 'top' | 'middle' | 'bottom';
  distributeH: boolean;
  distributeV: boolean;
  alignToFrame: boolean; // align relative to frame vs selection
}

export interface ResponsiveDesignPin {
  clipId: string;
  pinToEdges: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  anchorPoint: { x: number; y: number }; // 0-1 relative
  maintainScale: boolean;
}

export interface MasterTextStyle {
  id: string;
  name: string;
  style: Partial<TextStyle>;
  isDefault: boolean;
}

export type PenPathPoint = {
  x: number;
  y: number;
  handleIn?: { x: number; y: number };
  handleOut?: { x: number; y: number };
};

export interface VectorPath {
  id: string;
  points: PenPathPoint[];
  closed: boolean;
  strokeColor: string;
  strokeWidth: number;
  fillColor?: string;
}

// ==================== Workspace Advanced Types ====================

export interface PanelLayout {
  id: string;
  name: string;
  panels: PanelConfig[];
}

export interface PanelConfig {
  panelId: string;
  panelType: 'source-monitor' | 'program-monitor' | 'timeline' | 'project' | 'effect-controls'
    | 'effects' | 'essential-graphics' | 'essential-sound' | 'audio-mixer' | 'audio-clip-mixer'
    | 'lumetri-color' | 'lumetri-scopes' | 'metadata' | 'history' | 'info' | 'markers'
    | 'captions' | 'media-browser' | 'text-editor';
  visible: boolean;
  docked: boolean;
  position: { x: number; y: number; width: number; height: number };
}

export interface ReferenceMonitor {
  enabled: boolean;
  sourceClipId: string | null;
  displayMode: 'composite' | 'alpha' | 'all-scopes';
}

// ==================== Default Values ====================

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontSize: 40,
  fontFamily: 'Arial',
  fontColor: '#FFFFFF',
  backgroundColor: '#000000',
  backgroundOpacity: 0.7,
  position: { x: 50, y: 85 },
  alignment: 'center',
  verticalAlign: 'bottom',
  animation: 'none',
  animationColor: '#FFD700',
  fontWeight: 'normal',
  fontStyle: 'normal',
  stroke: undefined,
  dropShadow: undefined,
  letterSpacing: 0,
  lineHeight: 1.2,
  textTransform: 'none',
};

export const DEFAULT_TRANSFORM: Transform = {
  scale: 1,
  rotation: 0,
  opacity: 1,
  x: 0,
  y: 0,
};

// ==================== Guide Types ====================

export interface Guide {
  id: string;
  position: number; // percentage 0-100
  orientation: 'horizontal' | 'vertical';
  color: string;
}

// ==================== Dynamic Link Types ====================

export interface DynamicLinkProject {
  id: string;
  name: string;
  externalAppId: string; // 'after-effects' | 'photoshop' | 'audition'
  linkedCompIds: string[];
  lastSyncTime: string;
  autoSync: boolean;
}

// ==================== Store State & Actions ====================

export interface EditorState {
  // Project
  project: EditorProject | null;
  asset: IrisAsset | null;
  isEditorOpen: boolean;
  clientProcessingInProgress: boolean;
  videoUrl: string;

  // Playback
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackRate: number;
  volume: number;
  isMuted: boolean;

  // Timeline
  pixelsPerSecond: number;
  scrollLeft: number;
  tracks: Track[];
  markers: Marker[];

  // Selection
  selection: Selection;
  selectedClip: Clip | null;

  // Drag state
  dragState: DragState | null;
  dragHoverTrackId: string | null;
  snapTarget: number | null;

  // History (undo/redo)
  history: EditorProject[];
  historyIndex: number;
  historyLabels: string[];

  // In/Out points
  inPoint: number | null;
  outPoint: number | null;

  // Track targeting
  targetVideoTrackId: string | null;
  targetAudioTrackId: string | null;

  // Proxy workflow
  proxyMode: boolean;
  proxyStatus: Map<string, 'pending' | 'generating' | 'ready' | 'error'>;
  proxyPaths: Map<string, string>;

  // Local asset file storage
  assetPaths: Map<string, string>;
  assetDownloadStatus: Map<string, 'pending' | 'downloading' | 'ready' | 'error'>;

  // Multicam
  multicamEnabled: boolean;
  multicamSources: MulticamSource[];
  multicamActiveAngle: number;
  multicamCuts: MulticamCut[];

  // Compound clip editing
  compoundEditStack: { clipId: string; parentTracks: Track[] }[];

  // UI State
  inspectorTab: 'properties' | 'effects' | 'keyframes' | 'subtitles';
  showWaveforms: boolean;
  snapToGrid: boolean;
  gridSize: number;
  frameRate: number;
  playbackResolution: 1 | 0.5 | 0.25; // preview render scale: Full, 1/2, 1/4

  // Clip Groups (groupId → clipId[])
  clipGroups: Map<string, string[]>;

  // Clipboard
  keyframeClipboard: Keyframe[];
  attributeClipboard: { effects: ClipEffect[]; keyframes: Keyframe[]; transform?: Transform } | null;
  clipClipboard: { clips: Clip[]; trackIds: string[] } | null;

  // Comparison view (before/after color grading preview)
  comparisonMode: boolean;
  comparisonSplit: number; // 0-1, position of split line (0.5 = center)

  // Overlays
  showSafeMargins: boolean;
  showGridOverlay: boolean;

  // Scopes & render bar
  showWaveformScope: boolean;
  showVectorscope: boolean;
  showRenderBar: boolean;

  // Graph editor
  showGraphEditor: boolean;
  graphEditorProperty: string | null;

  // Media bins
  mediaBins: MediaBin[];

  // Source monitor
  sourceMonitorClipId: string | null;
  sourceMonitorInPoint: number | null;
  sourceMonitorOutPoint: number | null;

  // Workspace presets
  workspacePresets: WorkspacePreset[];
  activeWorkspacePreset: string | null;

  // Marker list
  showMarkerList: boolean;

  // Team/Collaboration
  teamProject: TeamProject | null;
  frameIoConnected: boolean;
  frameIoComments: FrameIoComment[];
  projectLocked: boolean;
  lockedBy: string | null;

  // Text-based editing
  transcript: TranscriptSegment[];
  showTextEditor: boolean;

  // Essential Graphics
  showEssentialGraphics: boolean;

  // MOGRT
  mogrtTemplates: MotionGraphicsTemplate[];

  // Phase 4: Text & Graphics Advanced
  masterTextStyles: MasterTextStyle[];
  responsiveDesignPins: ResponsiveDesignPin[];
  vectorPaths: VectorPath[];
  activePenTool: boolean;

  // Phase 4: Workspace Advanced
  panelLayout: PanelLayout | null;
  panelVisibility: Map<string, boolean>;
  referenceMonitor: ReferenceMonitor;
  fullScreenPreview: boolean;
  dualMonitorEnabled: boolean;

  // Phase 4: Multicam Advanced
  multicamAudioFollowVideo: boolean;
  multicamMixedAudioSources: boolean;

  // Phase 5: Closed Captions & Caption Rules
  captionStandard: ClosedCaptionStandard;
  captionDurationRules: CaptionDurationRules;

  // Phase 5: Essential Sound type mapping (clipId → EssentialSoundType)
  essentialSoundMap: Map<string, EssentialSoundType>;

  // Phase 5: Markers — sequence markers separate from clip markers
  sequenceMarkers: Marker[];

  // Phase 5: Productions (multi-project management)
  productions: ProductionProject[];

  // Phase 5: Shared Projects (local network sharing)
  sharedProjectMode: boolean;

  // Phase 5: Playback & Performance
  gpuAccelerationMode: GpuAccelerationMode;
  hardwareDecoding: boolean;
  smartRendering: boolean;
  transmitConfig: TransmitConfig;

  // Phase 7: Trimming
  razorToolActive: boolean;

  // Phase 7: Workspace
  guidesEnabled: boolean;
  guides: Guide[];
  programmMonitorOverlay: 'none' | 'safe-margins' | 'grid' | 'crosshair';

  // Phase 7: Performance
  previewRenderQuality: 'full' | 'half' | 'quarter' | 'eighth';
  parallelProcessing: boolean;
  renderCache: Map<string, string>; // clipId → cached render path

  // Phase 8: Titles
  textToolActive: boolean;
  textToolMode: 'point' | 'area' | 'path';
  rollingCrawlSettings: { speed: number; direction: 'up' | 'down' | 'left' | 'right' };

  // Phase 8: Scopes
  activeScope: 'waveform' | 'vectorscope' | 'histogram' | 'parade' | null;
  scopeOverlay: boolean;

  // Phase 8: Sequence Settings
  sequenceSettings: {
    editingMode: 'custom' | 'dv-ntsc' | 'dv-pal' | 'hdv' | 'avchd' | 'red' | 'arri';
    timebase: number;
    pixelAspectRatio: number;
    fieldDominance: 'progressive' | 'upper' | 'lower';
    audioChannels: 'mono' | 'stereo' | '5.1' | '7.1';
    sampleRate: 44100 | 48000 | 96000;
  };

  // Phase 8: Nesting & Linking
  linkedSelectionEnabled: boolean;

  // Phase 8: Timeline Tools
  activeTimelineTool: 'selection' | 'track-select-forward' | 'track-select-backward' | 'ripple-edit' | 'rolling-edit' | 'rate-stretch' | 'razor' | 'slip' | 'slide' | 'pen' | 'hand' | 'zoom';

  // Phase 9: VR/360
  vrMode: boolean;
  vrProjectionType: 'equirectangular' | 'cubemap' | 'fisheye' | 'flat';
  vrFieldOfView: number; // degrees, default 90

  // Phase 9: Dynamic Link
  dynamicLinkProjects: DynamicLinkProject[];
  dynamicLinkAutoUpdate: boolean;

  // Phase 9: Advanced Trimming
  threePointEditMode: boolean;
  fourPointEditMode: boolean;
  trimMonitorEnabled: boolean;

  // Phase 9: Advanced Color Grading
  inputLutPath: string | null;
  faceDetectionEnabled: boolean;
  hslSecondaryDenoise: number; // 0-100
  hslSecondaryBlur: number; // 0-100
  hslSecondaryRefine: { smooth: number; chatter: number; contrast: number };

  // Phase 9: Advanced Keying
  ultraKeySettings: {
    matteGeneration: { transparency: number; highlight: number; shadow: number; tolerance: number; pedestal: number };
    matteCleanup: { choke: number; soften: number; contrast: number; midPoint: number };
    spillSuppression: { desaturate: number; range: number; spillAmount: number; luma: number };
  };

  // Phase 9: Surround Sound
  surroundFormat: 'stereo' | '5.1' | '7.1' | 'atmos';
  surroundPannerMode: 'balance' | 'joystick';
  audioChannelLinking: Map<string, string[]>; // trackId -> linked trackIds
  loudnessAnalysis: { integrated: number; shortTerm: number; momentary: number; truePeak: number } | null;

  // Phase 9: Broadcast
  autoProxyOnImport: boolean;
  proxyPreset: 'h264-1024' | 'h264-512' | 'prores-proxy' | 'custom';
  projectEncrypted: boolean;
  closedCaptionDisplay: boolean;
}

export interface EditorActions {
  // Project
  openEditor: (asset: IrisAsset) => void;
  setVideoUrl: (url: string) => void;
  closeEditor: () => void;
  setClientProcessing: (inProgress: boolean) => void;
  initializeProject: (asset: IrisAsset, subtitleCues?: SubtitleCue[], durationOverride?: number) => void;
  saveProject: () => Promise<void>;
  loadFromTimelineData: (timelineData: TimelineData, duration: number) => void;

  // Playback
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setDuration: (duration: number) => void;
  setCurrentTime: (time: number) => void;

  // Timeline
  setZoom: (pixelsPerSecond: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitToView: (containerWidth: number) => void;
  setScrollLeft: (scrollLeft: number) => void;

  // Tracks
  addTrack: (type: TrackType, name?: string) => Track;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Track>) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  setTrackVolume: (trackId: string, volume: number) => void;
  toggleTrackLock: (trackId: string) => void;
  toggleTrackVisibility: (trackId: string) => void;
  reorderTracks: (fromIndex: number, toIndex: number) => void;

  // Clips
  addClip: (trackId: string, clip: DistributiveOmit<Clip, 'id' | 'trackId'> & { id?: string; trackId?: string }) => Clip;
  addAdjustmentLayer: (trackId: string, startTime: number, duration: number) => AdjustmentClip;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  moveClipToTrack: (clipId: string, targetTrackId: string) => void;
  moveClip: (clipId: string, newTrackId: string, newStartTime: number) => void;
  splitClip: (clipId: string, splitTime: number) => void;
  duplicateClip: (clipId: string) => Clip | null;
  linkClips: (clipIdA: string, clipIdB: string) => void;
  unlinkClip: (clipId: string) => void;

  // Selection
  selectClip: (clipId: string, addToSelection?: boolean | { shift?: boolean; ctrl?: boolean }) => void;
  selectClipsInRange: (clipIds: string[]) => void;
  selectTrack: (trackId: string, addToSelection?: boolean) => void;
  clearSelection: () => void;
  selectAll: () => void;
  deleteSelected: () => void;
  rippleDelete: () => void;
  duplicateSelectedClips: () => void;
  moveSelectedClips: (deltaTime: number, deltaTrackIndex?: number) => void;

  // Drag
  startDrag: (dragState: DragState) => void;
  updateDrag: (currentX: number, currentTime: number) => void;
  endDrag: () => void;
  cancelDrag: () => void;
  setDragHoverTrackId: (trackId: string | null) => void;

  // Subtitles
  addSubtitleClip: (text: string, startTime: number, endTime: number, style?: Partial<SubtitleStyle>) => SubtitleClip;
  updateSubtitleStyle: (clipId: string, style: Partial<SubtitleStyle>) => void;
  importSubtitleCues: (cues: SubtitleCue[]) => void;

  // Effects
  addClipEffect: (clipId: string, effect: ClipEffect) => void;
  removeClipEffect: (clipId: string, effectId: string) => void;
  updateClipEffect: (clipId: string, effectId: string, params: Partial<ClipEffect>) => void;
  toggleClipEffect: (clipId: string, effectId: string) => void;

  // Keyframes
  addClipKeyframe: (clipId: string, keyframe: Keyframe) => void;
  updateClipKeyframe: (clipId: string, keyframeIndex: number, updates: Partial<Keyframe>) => void;
  removeClipKeyframe: (clipId: string, keyframeIndex: number) => void;

  // Waveform
  setClipWaveformData: (clipId: string, data: number[]) => void;

  // Markers
  addMarker: (timeOrObj: number | { time: number; label?: string; color?: string }, label?: string, color?: string) => Marker;
  removeMarker: (markerId: string) => void;
  updateMarker: (markerId: string, updates: Partial<Omit<Marker, 'id'>>) => void;
  addChapterMarker: (time: number, label: string) => Marker;

  // Match Frame
  matchFrame: () => { clipId: string; sourceTime: number } | null;

  // Playback Resolution
  setPlaybackResolution: (resolution: 1 | 0.5 | 0.25) => void;

  // History
  undo: () => void;
  redo: () => void;
  pushHistory: (label?: string) => void;
  jumpToHistory: (index: number) => void;
  clearHistory: () => void;

  // Gap Management
  removeAllGaps: () => void;
  removeGapAtTime: (trackId: string, time: number) => void;

  // Compound Clips
  createCompoundClip: () => void;
  nestClips: () => void;
  expandCompoundClip: (clipId: string) => void;
  enterCompoundClip: (clipId: string) => void;
  exitCompoundClip: () => void;

  // Clip Alignment
  alignClips: (mode: 'start' | 'end' | 'distribute') => void;

  // In/Out Points
  setInPoint: (time: number | null) => void;
  setOutPoint: (time: number | null) => void;
  clearInOutPoints: () => void;

  // Track targeting
  setTargetVideoTrack: (trackId: string | null) => void;
  setTargetAudioTrack: (trackId: string | null) => void;

  // Proxy workflow
  toggleProxyMode: () => void;
  generateProxy: (assetId: string, sourceUrl: string) => Promise<void>;
  setProxyStatus: (assetId: string, status: 'pending' | 'generating' | 'ready' | 'error') => void;
  setProxyPath: (assetId: string, path: string) => void;
  generateAllProxies: (assetUrlMap: Map<string, string>) => Promise<void>;

  // Local asset storage
  setAssetPath: (assetId: string, localPath: string) => void;
  downloadAsset: (assetId: string) => Promise<string | null>;
  downloadAllAssets: () => Promise<void>;
  getLocalFilePath: (assetId: string) => string | null;

  // Multicam
  toggleMulticam: () => void;
  addMulticamSource: (source: Omit<MulticamSource, 'id'>) => MulticamSource;
  removeMulticamSource: (sourceId: string) => void;
  setMulticamActiveAngle: (angleIndex: number) => void;
  addMulticamCut: (time: number, angleIndex: number) => void;
  removeMulticamCut: (time: number) => void;
  clearMulticamCuts: () => void;
  flattenMulticamToTimeline: () => void;

  // UI
  setInspectorTab: (tab: 'properties' | 'effects' | 'keyframes' | 'subtitles') => void;
  toggleWaveforms: () => void;
  toggleSnapToGrid: () => void;
  setGridSize: (size: number) => void;
  setFrameRate: (fps: number) => void;

  // Track Pan
  setTrackPan: (trackId: string, pan: number) => void;

  // Audio Pan / Gain
  setClipPan: (clipId: string, pan: number) => void;
  setClipGain: (clipId: string, gain: number) => void;
  normalizeClipAudio: (clipId: string, targetDb?: number) => void;

  // Clip Groups
  groupClips: () => void;
  ungroupClips: (groupId: string) => void;

  // Copy/Paste Keyframes
  copyKeyframes: (clipId: string) => void;
  pasteKeyframes: (clipId: string) => void;

  // Insert / Overwrite Edit
  insertEdit: (trackId: string, clip: DistributiveOmit<Clip, 'id' | 'trackId'>, time: number) => Clip;
  overwriteEdit: (trackId: string, clip: DistributiveOmit<Clip, 'id' | 'trackId'>, time: number) => Clip;

  // Paste Attributes
  copyAttributes: (clipId: string) => void;
  pasteAttributes: (clipId: string) => void;

  // Freeze Frame & Replace
  freezeFrame: (clipId: string, time: number) => void;
  replaceClip: (clipId: string, newAssetId: string, newName: string, newThumbnailUrl?: string) => void;

  // Clip Metadata
  setClipLabel: (clipId: string, label: ClipLabel) => void;
  setClipNote: (clipId: string, note: string) => void;

  // Comparison view
  toggleComparisonMode: () => void;
  setComparisonSplit: (position: number) => void;

  // Overlays
  toggleSafeMargins: () => void;
  toggleGridOverlay: () => void;

  // Scopes & render bar
  toggleWaveformScope: () => void;
  toggleVectorscope: () => void;
  toggleRenderBar: () => void;

  // Time effects
  setTimeRemapping: (clipId: string, keyframes: TimeRemappingKeyframe[]) => void;
  setFrameBlending: (clipId: string, mode: VideoClip['frameBlending']) => void;

  // Audio
  setChannelMapping: (clipId: string, mapping: AudioClip['channelMapping']) => void;
  addTrackSend: (trackId: string, targetTrackId: string, level: number) => void;
  removeTrackSend: (trackId: string, targetTrackId: string) => void;
  autoDuck: (musicTrackId: string, dialogueTrackId: string, options?: { duckLevel?: number; fadeTime?: number; threshold?: number }) => void;

  // Graph editor
  toggleGraphEditor: () => void;
  setGraphEditorProperty: (property: string | null) => void;

  // Subtitle keyframes
  addSubtitleKeyframe: (clipId: string, keyframe: SubtitleAnimationKeyframe) => void;
  removeSubtitleKeyframe: (clipId: string, index: number) => void;

  // Media bins
  createBin: (name: string, parentId?: string | null) => MediaBin;
  deleteBin: (binId: string) => void;
  renameBin: (binId: string, name: string) => void;

  // Source monitor
  openSourceMonitor: (clipId: string) => void;
  closeSourceMonitor: () => void;
  setSourceMonitorInPoint: (time: number) => void;
  setSourceMonitorOutPoint: (time: number) => void;

  // Workspace presets
  saveWorkspacePreset: (name: string) => WorkspacePreset;
  loadWorkspacePreset: (id: string) => void;
  deleteWorkspacePreset: (id: string) => void;

  // Marker list
  toggleMarkerList: () => void;
  sortMarkers: (by: 'time' | 'label' | 'type') => void;
  exportMarkersCSV: () => string;

  // Clip markers
  addClipMarker: (clipId: string, time: number, label?: string, color?: string) => void;
  removeClipMarker: (clipId: string, markerId: string) => void;

  // Collaboration
  lockProject: () => void;
  unlockProject: () => void;

  // AI
  detectSceneEdits: (clipId: string) => Promise<number[]>;
  aiAudioRemix: (clipId: string, targetDuration: number) => Promise<void>;

  // Text-based editing
  setTranscript: (segments: TranscriptSegment[]) => void;
  toggleTextEditor: () => void;
  deleteTranscriptSegment: (segmentId: string) => void;
  editTranscriptSegment: (segmentId: string, newText: string) => void;

  // Generative extend
  generativeExtend: (clipId: string, direction: 'start' | 'end', durationSeconds: number) => Promise<void>;

  // Essential Graphics
  toggleEssentialGraphics: () => void;

  // MOGRT
  applyMogrt: (templateId: string, trackId: string, startTime: number) => void;

  // Phase 4: Text & Graphics Advanced
  createMasterTextStyle: (name: string, style: Partial<TextStyle>) => MasterTextStyle;
  updateMasterTextStyle: (id: string, style: Partial<TextStyle>) => void;
  deleteMasterTextStyle: (id: string) => void;
  applyMasterTextStyle: (clipId: string, styleId: string) => void;
  addResponsiveDesignPin: (pin: Omit<ResponsiveDesignPin, 'clipId'> & { clipId: string }) => void;
  removeResponsiveDesignPin: (clipId: string) => void;
  alignSelectedClips: (align: AlignDistribute) => void;
  distributeSelectedClips: (axis: 'horizontal' | 'vertical') => void;
  togglePenTool: () => void;
  addVectorPath: (path: Omit<VectorPath, 'id'>) => VectorPath;
  updateVectorPath: (pathId: string, updates: Partial<VectorPath>) => void;
  deleteVectorPath: (pathId: string) => void;
  setTextFillGradient: (clipId: string, gradient: TextStyle['fillGradient']) => void;
  setTextVertical: (clipId: string, vertical: boolean) => void;
  setTextTabStops: (clipId: string, tabStops: number[]) => void;

  // Phase 4: Workspace Advanced
  savePanelLayout: (name: string) => PanelLayout;
  loadPanelLayout: (layoutId: string) => void;
  setPanelVisibility: (panelType: string, visible: boolean) => void;
  toggleReferenceMonitor: () => void;
  setReferenceMonitorSource: (clipId: string | null) => void;
  toggleFullScreenPreview: () => void;
  toggleDualMonitor: () => void;
  resetPanelLayout: () => void;

  // Phase 4: Multicam Advanced
  toggleMulticamAudioFollowVideo: () => void;
  toggleMulticamMixedAudioSources: () => void;
  flattenMulticam: () => void;

  // Phase 5: Markers — navigation and new types
  goToPreviousMarker: () => void;
  goToNextMarker: () => void;
  addSequenceMarker: (time: number, label?: string, color?: string) => Marker;
  removeSequenceMarker: (markerId: string) => void;

  // Phase 5: Productions (multi-project management)
  createProduction: (name: string) => ProductionProject;
  addProjectToProduction: (productionId: string, projectId: string) => void;

  // Phase 5: Shared Projects
  toggleSharedProjectMode: () => void;

  // Phase 5: Export to Frame.io
  exportToFrameIo: (options: { projectId: string; format: string }) => Promise<void>;

  // Phase 5: Playback & Performance
  setGpuAcceleration: (mode: GpuAccelerationMode) => void;
  toggleHardwareDecoding: () => void;
  toggleSmartRendering: () => void;
  setTransmitConfig: (config: Partial<TransmitConfig>) => void;

  // Phase 5: Import format support
  relinkMedia: (mediaId: string, newPath: string) => void;
  consolidateProject: () => Promise<void>;

  // Phase 5: Audio — Speech Enhancement
  enhanceSpeech: (clipId: string) => Promise<void>;

  // Phase 5: Essential Sound Panel
  setEssentialSoundType: (clipId: string, type: EssentialSoundType) => void;
  autoTagAudio: (clipId: string) => Promise<EssentialSoundType>;

  // Phase 5: Caption Translation
  translateCaptions: (targetLanguage: string) => Promise<void>;

  // Phase 5: Closed Captions
  setCaptionStandard: (standard: ClosedCaptionStandard) => void;

  // Phase 5: Caption Duration Rules
  setCaptionDurationRules: (rules: CaptionDurationRules) => void;

  // Phase 5: Filler Word Detection
  detectFillerWords: (clipId: string) => Promise<{ time: number; word: string }[]>;

  // Phase 5: AI — Content-Aware Fill
  contentAwareFill: (clipId: string, maskId: string) => Promise<void>;

  // Phase 7: Trimming
  toggleRazorTool: () => void;
  razorCutAtPlayhead: () => void;

  // Phase 7: Workspace
  toggleGuides: () => void;
  addGuide: (orientationOrObj: string | { time?: number; position?: number; orientation?: string; label?: string; color?: string }, position?: number) => Guide;
  removeGuide: (guideId: string) => void;
  setProgramMonitorOverlay: (overlay: 'none' | 'safe-margins' | 'grid' | 'crosshair') => void;

  // Phase 7: Performance
  setPreviewRenderQuality: (quality: 'full' | 'half' | 'quarter' | 'eighth') => void;
  toggleParallelProcessing: () => void;
  clearRenderCache: () => void;

  // Phase 8: Audio — Auto-Duck Settings
  autoDuckSettings: (clipId: string, settings: { sensitivity: number; duckAmount: number; fadeSpeed: number }) => void;

  // Phase 8: Titles & Graphics
  toggleTextTool: () => void;
  setTextToolMode: (mode: 'point' | 'area' | 'path') => void;
  createRollingCrawl: (text: string, settings?: { speed?: number; direction?: 'up' | 'down' | 'left' | 'right' }) => void;

  // Phase 8: Collaboration
  removeProjectFromProduction: (productionId: string, projectId: string) => void;

  // Phase 8: Performance
  preRenderTimeline: (startTime: number, endTime: number) => Promise<void>;

  // Phase 8: Scopes
  setActiveScope: (scope: 'waveform' | 'vectorscope' | 'histogram' | 'parade' | null) => void;
  toggleScopeOverlay: () => void;

  // Phase 8: Sequence Settings
  updateSequenceSettings: (settings: Partial<EditorState['sequenceSettings']>) => void;
  createSequenceFromClip: (clipId: string) => void;

  // Phase 8: Nesting & Linking
  unnestClip: (clipId: string) => void;
  toggleLinkedSelection: () => void;

  // Phase 8: Timeline Tools
  setActiveTimelineTool: (tool: EditorState['activeTimelineTool']) => void;
  addEditAtPlayhead: () => void;
  liftSelection: () => void;
  extractSelection: () => void;

  // Phase 8: Audio Mixing
  setTrackOutputAssignment: (trackId: string, output: string) => void;
  togglePreFaderListen: (trackId: string) => void;
  toggleRecordArm: (trackId: string) => void;

  // Phase 8: Source Monitor
  loadClipInSourceMonitor: (clipId: string) => void;

  // Phase 8: Clipboard
  copyClips: () => void;
  pasteClips: () => void;

  // Phase 8: Match Frame & Navigation
  goToClipStart: () => void;
  goToClipEnd: () => void;
  goToTimelineStart: () => void;

  // Phase 9: VR/360
  toggleVrMode: () => void;
  setVrProjectionType: (type: 'equirectangular' | 'cubemap' | 'fisheye' | 'flat') => void;
  setVrFieldOfView: (fov: number) => void;

  // Phase 9: Dynamic Link
  linkExternalProject: (appId: string, projectPath: string) => DynamicLinkProject;
  unlinkExternalProject: (linkId: string) => void;
  importLinkedComposition: (linkId: string, compId: string) => Promise<void>;
  updateLinkedComposition: (linkId: string, compId: string) => Promise<void>;
  breakDynamicLink: (clipId: string) => void;
  toggleDynamicLinkAutoUpdate: () => void;

  // Phase 9: Advanced Trimming
  toggleThreePointEdit: () => void;
  toggleFourPointEdit: () => void;
  toggleTrimMonitor: () => void;
  performThreePointEdit: (sourceIn: number, sourceOut: number, targetIn: number) => void;
  performFourPointEdit: (sourceIn: number, sourceOut: number, targetIn: number, targetOut: number) => void;

  // Phase 9: Advanced Color Grading
  setInputLut: (path: string | null) => void;
  toggleFaceDetection: () => void;
  detectFaceRegions: (clipId: string) => Promise<{ x: number; y: number; width: number; height: number }[]>;
  matchColorToReference: (sourceClipId: string, referenceClipId: string) => Promise<void>;
  setHslSecondaryDenoise: (value: number) => void;
  setHslSecondaryBlur: (value: number) => void;
  setHslSecondaryRefine: (refine: { smooth?: number; chatter?: number; contrast?: number }) => void;

  // Phase 9: Advanced Keying
  setUltraKeyMatteGeneration: (params: Partial<{ transparency: number; highlight: number; shadow: number; tolerance: number; pedestal: number }>) => void;
  setUltraKeyMatteCleanup: (params: Partial<{ choke: number; soften: number; contrast: number; midPoint: number }>) => void;
  setUltraKeySpillSuppression: (params: Partial<{ desaturate: number; range: number; spillAmount: number; luma: number }>) => void;

  // Phase 9: Surround Sound
  setSurroundFormat: (format: 'stereo' | '5.1' | '7.1' | 'atmos') => void;
  setSurroundPannerMode: (mode: 'balance' | 'joystick') => void;
  linkAudioChannels: (trackIds: string[]) => void;
  unlinkAudioChannels: (trackId: string) => void;
  analyzeLoudness: (clipId: string) => Promise<{ integrated: number; shortTerm: number; momentary: number; truePeak: number }>;

  // Phase 9: Broadcast
  toggleAutoProxyOnImport: () => void;
  setProxyPreset: (preset: 'h264-1024' | 'h264-512' | 'prores-proxy' | 'custom') => void;
  toggleProjectEncryption: () => void;
  toggleClosedCaptionDisplay: () => void;
}

// ==================== Type Guards ====================

/** Type guard: clip has effects and keyframes (VideoClip, AudioClip, or AdjustmentClip) */
export function hasEffects(clip: Clip): clip is VideoClip | AudioClip | AdjustmentClip {
  return clip.type === 'video' || clip.type === 'audio' || clip.type === 'adjustment';
}

/** Type guard: clip has speed property (VideoClip only) */
export function hasSpeed(clip: Clip): clip is VideoClip {
  return clip.type === 'video';
}

/** Type guard: clip has volume property */
export function hasVolume(clip: Clip): clip is VideoClip | AudioClip | MusicClip {
  return clip.type === 'video' || clip.type === 'audio' || clip.type === 'music';
}
