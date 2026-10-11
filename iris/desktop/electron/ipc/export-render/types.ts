/**
 * Export request types shared by the FFmpeg arg builders.
 *
 * The renderer builds this shape in
 * src/features/video-editor/lib/buildExportRequest.ts and sends it over the
 * `export:start` IPC channel. Keep both sides in sync.
 */

export interface SubtitleOverlayEntry {
  /** Base64 PNG data URL from the renderer (set by ExportModal before IPC call). */
  pngDataUrl?: string;
  /** Resolved temp file path written by the export handler. */
  pngPath?: string;
  /** Timeline-relative start time (seconds). */
  startTime: number;
  /** Timeline-relative end time (seconds). */
  endTime: number;
}

export interface ExportRequest {
  outputPath: string;
  format: 'mp4' | 'webm' | 'mov' | 'gif';
  quality: 'low' | 'medium' | 'high' | 'ultra';
  frameRate: number;
  width: number;
  height: number;
  duration: number;
  tracks: ExportTrack[];
  includeSubtitles: boolean;
  subtitleFormat?: 'burned' | 'srt' | 'vtt';
  codec?: 'h264' | 'h265' | 'prores' | 'vp9';
  proResProfile?: '422' | '422-hq' | '422-lt' | '422-proxy' | '4444';
  authToken?: string;
  /**
   * Pre-rasterized subtitle PNG overlays from the renderer.
   * When present, these are composited via FFmpeg overlay instead of the ASS burned path,
   * producing pixel-accurate output that matches the editor preview exactly.
   */
  subtitleOverlays?: SubtitleOverlayEntry[];
}

export interface ExportTrack {
  id: string;
  type: 'video' | 'audio' | 'subtitle' | 'music' | 'adjustment';
  /** Audio mute. Video pixels of a muted video track still render (preview rule). */
  muted: boolean;
  /** Audio solo — same rule as the preview (see lib/trackAudio.ts). */
  solo?: boolean;
  volume: number;
  clips: ExportClip[];
}

export interface ExportEffect {
  type: string;
  enabled: boolean;
  filterType?: string;
  filterIntensity?: number;
  filterParams?: Record<string, any>;
  transitionType?: string;
  transitionPosition?: 'start' | 'end' | 'both';
  transitionDuration?: number;
  audioEffectType?: string;
  audioParams?: Record<string, any>;
}

/** Same shape as the editor's Keyframe (src/types/videoProject.types.ts). */
export interface ExportKeyframe {
  /** Seconds from the clip's timeline start. */
  time: number;
  property: string;
  value: number;
  easing?: string;
  bezierPoints?: [number, number, number, number];
}

export interface ExportClip {
  id: string;
  type: string;
  mediaType?: string; // 'image' for still-image clips (VideoClip with mediaType === 'image')
  startTime: number;
  endTime: number;
  sourceStartTime: number;
  sourceEndTime: number;
  sourceUrl: string;
  // Video specific
  volume?: number;
  muted?: boolean;
  speed?: number;
  /**
   * True when an audio/music track carries a clip of the same asset — the
   * preview then plays the sound only from that clip, so the export must drop
   * this video clip's embedded audio too (see lib/trackAudio.ts).
   */
  audioHandledExternally?: boolean;
  /** Natural pixel dimensions of the source image (stored in VideoClip.sourceWidth/Height).
   *  Required so image overlays render at their natural size rather than the full frame. */
  sourceWidth?: number;
  sourceHeight?: number;
  /** CSS/canvas blend mode for overlay compositing. Only 'normal' is currently applied
   *  (mapped to plain overlay filter). Other modes are accepted but fall back to normal. */
  blendMode?: string;
  /** The track that owns this clip. Populated by the ExportRequest builder so the
   *  compositor can determine the base vs overlay tracks without re-scanning. */
  trackId?: string;
  transform?: {
    scale: number;
    rotation: number;
    opacity: number;
    x: number;
    y: number;
  };
  effects?: ExportEffect[];
  /** Property keyframes (opacity / scale / x / y / rotation / volume / brightness / contrast). */
  keyframes?: ExportKeyframe[];
  // Subtitle specific
  text?: string;
  /** Full SubtitleStyle passed through from the editor. The width/height/paddingX/paddingY
   *  fields are used by buildAssContent for lower-third positioning. */
  style?: {
    fontSize: number;
    fontFamily: string;
    fontColor: string;
    backgroundColor: string;
    backgroundOpacity: number;
    position: { x: number; y: number };
    alignment?: 'left' | 'center' | 'right';
    verticalAlign?: 'top' | 'middle' | 'bottom';
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
    stroke?: { color: string; width: number };
    dropShadow?: { color: string; offsetX: number; offsetY: number; blur: number };
    letterSpacing?: number;
    lineHeight?: number;
    textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
    /** Width of the text box as % of the video frame width. */
    width?: number;
    /** Height of the text box as % of the video frame height. */
    height?: number;
    /** Horizontal inner padding in project px. */
    paddingX?: number;
    /** Vertical inner padding in project px. */
    paddingY?: number;
  };
  // Audio/Music specific
  fadeIn?: number;  // seconds
  fadeOut?: number; // seconds
  pan?: number;     // stereo pan -1 (left) to 1 (right)
  gain?: number;    // dB gain
}

/**
 * Side-channel the arg builder fills for the IPC handler (burned ASS subtitles
 * need a temp file written before FFmpeg starts, with FFmpeg's cwd set to it).
 */
export interface ExportRenderExtras {
  _ffmpegCwd?: string;
  _assContent?: string;
  _assPath?: string;
}

export interface ExportProgress {
  status: 'preparing' | 'downloading' | 'rendering' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0-100
  message: string;
  error?: string;
  outputPath?: string;
}
