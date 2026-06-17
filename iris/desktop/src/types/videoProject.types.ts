// ===== Clip Types =====

export type ClipType = 'video' | 'audio' | 'image' | 'subtitle' | 'text' | 'adjustment' | 'compound' | 'music' | 'shape';

export interface Keyframe {
  time: number; // seconds from clip start
  property: 'opacity' | 'scale' | 'x' | 'y' | 'rotation' | 'volume' | 'blur' | 'brightness' | 'contrast' | 'speed';
  value: number;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bezier' | 'hold' | 'auto-bezier' | 'continuous-bezier';
  bezierPoints?: [number, number, number, number]; // control points for bezier
  // Spatial interpolation (#58)
  spatialInterpolation?: 'linear' | 'bezier';
  spatialBezierIn?: [number, number];  // incoming tangent [x, y]
  spatialBezierOut?: [number, number]; // outgoing tangent [x, y]
}

// Subtitle animation keyframe (#42)
export interface SubtitleAnimationKeyframe {
  time: number; // seconds from clip start
  property: 'fontSize' | 'x' | 'y' | 'opacity' | 'rotation' | 'scale';
  value: number;
  easing?: string;
}

export interface TimelineClip {
  id: string;
  type: ClipType;
  trackId: string;
  startTime: number; // seconds
  endTime: number; // seconds
  duration: number; // endTime - startTime
  
  // Media reference
  mediaId?: string; // reference to ProjectMedia
  sourceUrl?: string; // direct URL if no media pool reference
  
  // Trim
  inPoint: number; // trim start within source
  outPoint: number; // trim end within source
  
  // Transform
  opacity: number; // 0-1
  scale: number; // 1 = 100%
  x: number; // position offset
  y: number; // position offset
  rotation: number; // degrees
  
  // Text/Subtitle specific
  content?: string;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
  textAlign?: 'left' | 'center' | 'right';
  textPositionX?: number;
  textPositionY?: number;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  
  // Speed
  speed: number; // playback rate multiplier (0.1-10, default 1)

  // Audio specific
  volume: number; // 0-1
  fadeIn: number; // seconds
  fadeOut: number; // seconds
  
  // Effects & Keyframes
  effects: ClipEffect[];
  keyframes: Keyframe[];
  
  // Metadata
  name: string;
  locked: boolean;
}

// ===== Effect Types =====

export type EffectType = 'transition' | 'filter' | 'audio-effect';

export interface ClipEffect {
  id: string;
  type: EffectType;
  name: string;
  enabled: boolean;
  
  // Transition specific
  transitionType?: 'fade' | 'dissolve' | 'wipe' | 'slide' | 'zoom' | 'blur' | 'dip-to-black' | 'dip-to-white' | 'push' | 'film-dissolve' | 'iris' | 'clock-wipe' | 'gradient-wipe' | 'page-peel' | 'morph-cut'
    // Phase 2 Batch 4: Transitions Expansion
    | 'additive-dissolve' | 'non-additive-dissolve'
    | 'iris-box' | 'iris-cross' | 'iris-diamond' | 'iris-star' | 'iris-points'
    | 'page-turn' | 'center-peel'
    | 'band-slide' | 'center-merge' | 'center-split' | 'slash-slide' | 'split' | 'swap' | 'swirl' | 'whip-turn' | 'sliding-bands'
    | 'barn-doors' | 'pinwheel' | 'radial-wipe' | 'venetian-blinds'
    // Phase 3: Wipe Transitions
    | 'band-wipe' | 'checker-wipe' | 'checkerboard-wipe' | 'inset' | 'paint-splatter'
    | 'random-blocks' | 'random-wipe' | 'spiral-boxes' | 'wedge-wipe' | 'wipe-basic' | 'zig-zag-blocks' | 'linear-wipe-transition'
    // Phase 3: Slide & Zoom Transitions
    | 'multi-spin' | 'slide-basic'
    | 'cross-zoom' | 'zoom-basic'
    // Phase 9: VR/360 Immersive Transitions
    | 'vr-iris-wipe' | 'vr-chroma-leaks' | 'vr-mobius-zoom'
    | 'vr-light-leaks' | 'vr-light-rays' | 'vr-random-blocks' | 'vr-gradient-wipe';
  transitionDuration?: number;
  transitionPosition?: 'start' | 'end' | 'both';
  
  // Filter specific
  filterType?: 'blur' | 'brightness' | 'contrast' | 'saturation' | 'hue' | 'sepia' | 'grayscale' | 'invert' | 'vignette' | 'color-correction' | 'chroma-key' | 'track-matte-key' | 'luma-key' | 'mosaic' | 'directional-blur' | 'unsharp-mask' | 'posterize' | 'find-edges' | 'noise' | 'lens-distortion' | 'corner-pin' | 'warp-stabilizer'
    // Phase 2 Batch 1: Adjust & Color Correction
    | 'auto-color' | 'auto-contrast' | 'auto-levels' | 'levels' | 'shadow-highlight' | 'proc-amp' | 'gamma-correction'
    | 'color-pass' | 'color-replace' | 'leave-color' | 'tint' | 'channel-mixer'
    // Phase 2 Batch 3: Distort, Perspective, Stylize
    | 'mirror' | 'offset' | 'spherize' | 'magnify' | 'twirl' | 'wave-warp' | 'turbulent-displace' | 'transform-effect'
    | 'basic-3d' | 'bevel-alpha' | 'drop-shadow'
    | 'alpha-glow' | 'brush-strokes' | 'emboss' | 'solarize'
    // Phase 2 Batch 2: Blur/Sharpen & Generate
    | 'camera-blur' | 'channel-blur' | 'compound-blur' | 'sharpen' | 'gaussian-blur'
    | 'four-color-gradient' | 'lens-flare' | 'grid-generate' | 'ramp' | 'circle-generate' | 'checkerboard' | 'cell-pattern' | 'lightning' | 'write-on'
    // Phase 2 Batch 6: Keying, Time, Utility
    | 'color-key' | 'difference-matte' | 'non-red-key' | 'image-matte-key' | 'remove-matte'
    | 'echo' | 'posterize-time' | 'time-displacement'
    | 'crop-effect' | 'edge-feather'
    // Phase 2 Batch 8: Transition-style & Transform
    | 'block-dissolve' | 'linear-wipe' | 'venetian-blinds-effect' | 'strobe-light' | 'threshold'
    | 'horizontal-flip' | 'vertical-flip' | 'flicker-removal' | 'auto-reframe' | 'replicate'
    // Phase 3 Batch 1: Color Correction
    | 'asc-cdl' | 'brightness-contrast' | 'change-color' | 'change-to-color' | 'color-balance-hls'
    | 'equalize' | 'fast-color-corrector' | 'luma-corrector' | 'luma-curve'
    | 'rgb-color-corrector' | 'rgb-curves' | 'three-way-color-corrector' | 'video-limiter'
    // Phase 3 Batch 2: Channel, Image Control, Adjust, Utility
    | 'arithmetic' | 'blend-effect' | 'calculations' | 'set-matte' | 'solid-composite'
    | 'black-and-white' | 'color-balance-rgb'
    | 'convolution-kernel' | 'extract-effect' | 'lighting-effects'
    | 'cineon-converter' | 'sdr-conform'
    // Phase 3 Batch 3: Noise, Stylize, Perspective, Generate
    | 'dust-and-scratches' | 'median' | 'noise-hls' | 'noise-alpha'
    | 'color-emboss' | 'roughen-edges'
    | 'bevel-edges'
    | 'ellipse-generate' | 'paint-bucket'
    | 'reduce-interlace-flicker'
    // Phase 5: Final coverage
    | 'ultra-key' | 'gradient-wipe-effect'
    // Phase 7A: Blur effects
    | 'radial-blur' | 'zoom-blur' | 'bilateral-blur' | 'anti-alias-blur'
    | 'cc-radial-blur' | 'cc-vector-blur'
    // Phase 7A: Distort effects
    | 'motion-tile' | 'polar-coordinates' | 'ripple-distort'
    | 'cc-bend-it' | 'cc-flo-motion' | 'cc-griddler' | 'cc-kaleida'
    | 'cc-lens' | 'cc-page-turn' | 'cc-power-pin' | 'cc-slant'
    | 'cc-smear' | 'cc-split' | 'cc-split-2' | 'cc-tiler'
    // Phase 7A: Stylize effects
    | 'texturize' | 'strobe-effect' | 'glow' | 'scatter'
    // Phase 9: VR/360 Immersive Filters
    | 'vr-projection' | 'vr-rotate-sphere' | 'vr-de-noise'
    | 'vr-chromatic-aberrations' | 'vr-color-gradients' | 'vr-digital-glitch'
    | 'vr-fractal-noise' | 'vr-glow' | 'vr-sharpen' | 'vr-blur';
  filterIntensity?: number; // 0-100
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filterParams?: Record<string, any>;

  // Audio effect specific
  audioEffectType?: 'eq' | 'compressor' | 'reverb' | 'delay' | 'noise-reduction' | 'de-esser' | 'parametric-eq' | 'multiband-compressor' | 'convolution-reverb' | 'chorus' | 'flanger' | 'phaser'
    // Phase 2 Batch 5: Audio Effects Expansion
    | 'amplify' | 'hard-limiter' | 'tube-compressor' | 'dynamics'
    | 'analog-delay'
    | 'bass' | 'treble' | 'graphic-eq' | 'notch-filter'
    | 'adaptive-noise-reduction' | 'dehummer' | 'denoise'
    | 'studio-reverb'
    | 'vocal-enhancer' | 'stereo-expander'
    // Phase 3: Audio Effects Expansion
    | 'fft-filter' | 'scientific-filter' | 'automatic-click-remover'
    | 'swap-channels' | 'fill-left-right' | 'invert-audio'
    | 'loudness-radar' | 'downmixer' | 'balance' | 'surround-reverb'
    // Phase 5: Additional compressor types
    | 'single-band-compressor';
  audioParams?: Record<string, number | string | number[]>;
  
  // Keyframeable parameters
  keyframes: Keyframe[];
}

// ===== Track Types =====

export type TrackType = 'video' | 'audio' | 'subtitle' | 'adjustment';

/** Editor extends TrackType with 'music' and 'adjustment' which map on persistence */
export type EditorTrackType = TrackType | 'music' | 'adjustment';

export interface TimelineTrack {
  id: string;
  type: TrackType;
  name: string;
  locked: boolean;
  muted: boolean;
  visible: boolean;
  height: number; // UI height in pixels
  clips: TimelineClip[];
  /** Track sends for submix routing (#76) */
  sends?: TrackSend[];
}

// Track Send for submix routing (#76)
export interface TrackSend {
  targetTrackId: string;
  level: number; // 0-1 send level
}

// ===== Timeline Data =====

export interface TimelineSettings {
  backgroundColor: string;
  defaultTransitionDuration: number;
  audioFadeDefault: number;
}

export interface TimelineMarker {
  id: string;
  time: number;
  label?: string;
  color?: string;
  type?: 'standard' | 'chapter' | 'comment' | 'segmentation' | 'web-link' | 'in-out' | 'flash-cue';
  url?: string;
  endTime?: number;
  comment?: string;
}

export interface TimelineData {
  version: number;
  settings: TimelineSettings;
  tracks: TimelineTrack[];
  markers?: TimelineMarker[];
}

// ===== Project Media (Media Pool) =====

export type MediaType = 'video' | 'audio' | 'image';

export type ProxyStatus = 'none' | 'generating' | 'ready' | 'error';

export interface ProjectMedia {
  id: string;
  projectId: string;
  mediaType: MediaType;
  externalId: string | null; // reference to external asset (e.g., Video, Asset)
  fileUrl: string | null;
  name: string;
  thumbnailUrl: string | null;
  duration: number | null; // seconds
  width: number | null;
  height: number | null;
  fileSize: number | null; // bytes
  // Proxy workflow fields (synced with server)
  proxyStatus?: ProxyStatus | null;
  proxyPath?: string | null;       // local absolute path
  proxyGeneratedAt?: string | null;
  proxyError?: string | null;
  originalHash?: string | null;
  addedAt: string;
}

// ===== Video Project =====

export type ProjectStatus = 'draft' | 'editing' | 'rendering' | 'completed' | 'archived';

export interface VideoProject {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  width: number;
  height: number;
  frameRate: number;
  timelineData: TimelineData;
  duration: number; // seconds
  thumbnailUrl: string | null;
  status: ProjectStatus;
  lastExportedAt: string | null;
  exportedVideoId: string | null;
  createdAt: string;
  updatedAt: string;
  mediaPool: ProjectMedia[];
}

export interface VideoProjectListItem {
  id: string;
  name: string;
  description: string | null;
  width: number;
  height: number;
  duration: number;
  thumbnailUrl: string | null;
  status: ProjectStatus;
  mediaCount: number;
  createdAt: string;
  updatedAt: string;
}

// ===== API Input Types =====

export interface CreateVideoProjectInput {
  name: string;
  description?: string;
  width?: number;
  height?: number;
  frameRate?: number;
}

export interface UpdateVideoProjectInput {
  name?: string;
  description?: string | null;
  width?: number;
  height?: number;
  frameRate?: number;
}

export interface SaveTimelineInput {
  timelineData: TimelineData;
  duration?: number;
  thumbnail?: string; // Base64 encoded image (data:image/jpeg;base64,...)
}

export interface AddMediaInput {
  mediaType: MediaType;
  name: string;
  externalId?: string;
  fileUrl?: string;
  thumbnailUrl?: string | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  fileSize?: number | null;
}

// ===== API Response Types =====

export interface VideoProjectsListResponse {
  projects: VideoProjectListItem[];
  total: number;
}

// ===== Editor State Types =====

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number; // seconds
  playbackRate: number; // 0.25, 0.5, 1, 1.5, 2
}

export interface SelectionState {
  selectedClipIds: string[];
  selectedTrackId: string | null;
  selectedEffectId: string | null;
  selectedKeyframeIndices: number[]; // indices within selected clip's keyframes
}

export interface TimelineViewState {
  zoom: number; // pixels per second
  scrollX: number; // horizontal scroll position
  scrollY: number; // vertical scroll position
  snapEnabled: boolean;
  magneticSnapEnabled: boolean;
}

export interface EditorPanelState {
  mediaPanelOpen: boolean;
  effectsPanelOpen: boolean;
  propertiesPanelOpen: boolean;
  keyframePanelOpen: boolean;
}

// ===== Export Types =====

export type ExportFormat = 'mp4' | 'webm' | 'mov' | 'gif' | 'image-sequence' | 'mxf' | 'avi' | 'wav' | 'aac' | 'flac' | 'mp3' | 'prores' | 'dnxhd-mxf';
export type CaptionFormat = 'srt' | 'vtt' | 'scc' | 'mcc' | 'stl' | 'dfxp';
export type ImageSequenceFormat = 'png' | 'jpeg' | 'tiff' | 'dpx' | 'openexr';
export type PlatformPreset = 'youtube-4k' | 'youtube-1080p' | 'youtube-720p' | 'vimeo-4k' | 'vimeo-1080p' | 'facebook-1080p' | 'facebook-720p' | 'instagram-1080p' | 'instagram-square' | 'instagram-portrait' | 'tiktok-1080p' | 'twitter-720p' | 'broadcast-hd' | 'broadcast-uhd';

export interface ExportOptions {
  format: ExportFormat;
  quality: 'low' | 'medium' | 'high' | 'ultra';
  frameRate: 24 | 30 | 60;
  width: number;
  height: number;
  includeSubtitles: boolean;
  subtitleFormat?: 'burned' | 'srt' | 'vtt';
  captionFormat?: CaptionFormat;
  platform?: string;
  platformPreset?: PlatformPreset;
  codec?: 'h264' | 'h265' | 'prores' | 'vp9' | 'dnxhd' | 'dnxhr' | 'mpeg-2';
  proResProfile?: '422' | '422-hq' | '422-lt' | '422-proxy' | '4444';
  imageSequenceFormat?: ImageSequenceFormat;
  audioCodec?: 'aac' | 'wav' | 'flac' | 'mp3' | 'pcm';
  audioBitrate?: 128 | 192 | 256 | 320;
  audioSampleRate?: 44100 | 48000 | 96000;
  // Phase 8: Advanced export options
  bitrate?: number; // custom bitrate in kbps
  twoPass?: boolean; // two-pass encoding
  deinterlace?: boolean;
  fieldOrder?: 'progressive' | 'upper-first' | 'lower-first';
  colorSpace?: 'rec709' | 'rec2020' | 'p3';
  hdr?: boolean;
  loudnessStandard?: 'ebu-r128' | 'atsc-a85' | 'none';
  // Phase 9: Broadcast export options
  hdrNits?: number; // peak brightness in nits (1000, 4000, 10000)
  hdrTransferFunction?: 'pq' | 'hlg';
  mxfOperationalPattern?: 'op1a' | 'op-atom';
  deinterlaceMethod?: 'blend' | 'interpolate' | 'adaptive';
}

export interface ExportProgress {
  status: 'preparing' | 'downloading' | 'rendering' | 'uploading' | 'completed' | 'failed';
  progress: number;
  message: string;
  outputAssetId?: string;
  error?: string;
}

export interface ExportDownloadInfo {
  assetId: string;
  downloadUrl: string;
  format: string;
  size?: number;
}
