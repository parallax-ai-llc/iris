/**
 * Video Editor Store
 * State management for Adobe Premiere-style multi-track video editor
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { TimelineData, TimelineTrack, TimelineClip, ClipEffect } from '@/types/videoProject.types';
import { generateId } from '@/shared/lib/utils/id';
import { IS_SELF_HOST } from '@/config/self-host';
import { getIrisApiBaseUrl } from '@/shared/api/iris-local';
import { formatTime } from '@/shared/lib/utils/time';
import { findClipById, calculateMaxEndTime, sortClipsByStartTime, closeGapsInClips } from '@/shared/lib/utils/trackUtils';

// Re-export all types for backward compatibility
export { DEFAULT_SUBTITLE_STYLE, DEFAULT_TRANSFORM, hasEffects, hasSpeed, hasVolume } from '@/types/editor.types';
export type {
  TrackType, BlendMode, Position, Transform, SubtitleAnimation, SubtitleStyle,
  BaseClip, VideoClip, AudioClip, SubtitleClip, MusicClip, AdjustmentClip, CompoundClip, Clip,
  DistributiveOmit, Track, EditorProject, DragOperation, DragState, Selection,
  Marker, MulticamSource, MulticamCut, EditorState, EditorActions,
  ClipLabel, ShapeClip,
  TimeRemappingKeyframe, MediaBin, WorkspacePreset,
  TeamMemberRole, TeamMember, TeamProject, FrameIoComment,
  ObjectMaskTrackingFrame, ObjectMask, TranscriptSegment,
  MogrtEditableProperty, MotionGraphicsTemplate,
  TextStyle, AlignDistribute, ResponsiveDesignPin, MasterTextStyle, VectorPath,
  PanelLayout, PanelConfig, ReferenceMonitor, PenPathPoint,
  ProductionProject, GpuAccelerationMode, TransmitConfig,
  EssentialSoundType, ClosedCaptionStandard, CaptionDurationRules,
  Guide, DynamicLinkProject,
} from '@/types/editor.types';

// Import types for internal use in this file
import type {
  BlendMode, TrackType, VideoClip, AudioClip, SubtitleClip,
  AdjustmentClip, CompoundClip, Clip, Track, EditorProject,
  Marker, MulticamSource, EditorState, EditorActions,
  MediaBin, WorkspacePreset,
  ProductionProject, GpuAccelerationMode, TransmitConfig,
  EssentialSoundType, ClosedCaptionStandard,
  Guide, DynamicLinkProject,
} from '@/types/editor.types';
import type { MasterTextStyle, VectorPath, PanelLayout } from '@/types/editor.types';

import { DEFAULT_SUBTITLE_STYLE, DEFAULT_TRANSFORM, hasEffects } from '@/types/editor.types';

// ==================== Helper Functions ====================

// Convert TimelineData (videoProject format) to editor.store Track format
function convertTimelineDataToEditorTracks(timelineData: TimelineData): Track[] {
  const convertClip = (clip: TimelineClip, trackId: string): Clip => {
    const baseClip = {
      id: clip.id,
      trackId,
      startTime: clip.startTime,
      endTime: clip.endTime,
      sourceStartTime: clip.inPoint,
      sourceEndTime: clip.outPoint,
      name: clip.name,
    };

    if (clip.type === 'video' || clip.type === 'image') {
      return {
        ...baseClip,
        type: 'video',
        // Preserve the image flag so the preview composites it as an overlay
        // image (and loads it as an image, not a video that would fail).
        mediaType: clip.type === 'image' ? 'image' : 'video',
        sourceWidth: clip.sourceWidth,
        sourceHeight: clip.sourceHeight,
        assetId: clip.sourceUrl || clip.mediaId || '',
        transform: {
          scale: clip.scale ?? 1,
          rotation: clip.rotation ?? 0,
          opacity: clip.opacity ?? 1,
          x: clip.x ?? 0,
          y: clip.y ?? 0,
        },
        volume: clip.volume ?? 1,
        muted: false,
        audioExtracted: clip.audioExtracted ?? false,
        speed: clip.speed ?? 1,
        blendMode: 'normal',
        effects: clip.effects ?? [],
        keyframes: clip.keyframes ?? [],
      } as VideoClip;
    }

    if (clip.type === 'audio') {
      return {
        ...baseClip,
        type: 'audio',
        assetId: clip.sourceUrl || clip.mediaId || '',
        volume: clip.volume ?? 1,
        muted: false,
        fadeIn: clip.fadeIn ?? 0,
        fadeOut: clip.fadeOut ?? 0,
        effects: clip.effects ?? [],
        keyframes: clip.keyframes ?? [],
      } as AudioClip;
    }

    if (clip.type === 'subtitle' || clip.type === 'text') {
      return {
        ...baseClip,
        type: 'subtitle',
        text: clip.content || '',
        style: {
          fontSize: clip.fontSize ?? 24,
          fontFamily: clip.fontFamily ?? 'Arial',
          fontColor: clip.fontColor ?? '#FFFFFF',
          backgroundColor: clip.backgroundColor ?? '#000000',
          backgroundOpacity: clip.backgroundOpacity ?? 0.7,
          position: { x: clip.textPositionX ?? 50, y: clip.textPositionY ?? 85 },
          alignment: clip.textAlign ?? 'center',
          verticalAlign: clip.verticalAlign ?? 'bottom',
          width: clip.textWidth,
          height: clip.textHeight,
          paddingX: clip.textPaddingX,
          paddingY: clip.textPaddingY,
        },
      } as SubtitleClip;
    }

    if (clip.type === 'adjustment') {
      return {
        ...baseClip,
        type: 'adjustment',
        opacity: clip.opacity ?? 1,
        effects: clip.effects ?? [],
        keyframes: clip.keyframes ?? [],
      } as AdjustmentClip;
    }

    // Default to video
    return {
      ...baseClip,
      type: 'video',
      assetId: clip.sourceUrl || clip.mediaId || '',
      transform: { ...DEFAULT_TRANSFORM },
      volume: clip.volume ?? 1,
      muted: false,
      speed: 1,
      blendMode: 'normal',
    } as VideoClip;
  };

  const convertTrack = (track: TimelineTrack): Track => ({
    id: track.id,
    type: track.type === 'subtitle' ? 'subtitle' : track.type,
    name: track.name,
    locked: track.locked,
    muted: track.muted,
    solo: false,
    visible: track.visible,
    volume: 1,
    height: track.height,
    clips: track.clips.map((clip) => convertClip(clip, track.id)),
  });

  return timelineData.tracks.map(convertTrack);
}

function createDefaultTracks(
  assetId: string,
  duration: number,
  audioAssetId?: string,
  // When false (blank/placeholder projects) the video & audio tracks start
  // empty — no placeholder "Main Video"/"Original Audio" clips are inserted.
  includeMainClips = true,
): Track[] {
  return [
    {
      id: 'track-video-1',
      type: 'video',
      name: 'Video 1',
      locked: false,
      muted: false,
      solo: false,
      visible: true,
      volume: 1,
      height: 80,
      clips: includeMainClips
        ? [
            {
              id: 'clip-video-main',
              trackId: 'track-video-1',
              type: 'video',
              assetId,
              name: 'Main Video',
              startTime: 0,
              endTime: duration,
              sourceStartTime: 0,
              sourceEndTime: duration,
              transform: { ...DEFAULT_TRANSFORM },
              volume: 1,
              muted: false,
              speed: 1,
              blendMode: 'normal',
              effects: [],
              keyframes: [],
            } as VideoClip,
          ]
        : [],
    },
    {
      id: 'track-audio-1',
      type: 'audio',
      name: 'Audio 1',
      locked: false,
      muted: false,
      solo: false,
      visible: true,
      volume: 1,
      height: 60,
      clips: includeMainClips
        ? [
            {
              id: 'clip-audio-main',
              trackId: 'track-audio-1',
              type: 'audio',
              assetId: audioAssetId || assetId,
              name: 'Original Audio',
              startTime: 0,
              endTime: duration,
              sourceStartTime: 0,
              sourceEndTime: duration,
              volume: 1,
              muted: false,
              fadeIn: 0,
              fadeOut: 0,
              effects: [],
              keyframes: [],
            } as AudioClip,
          ]
        : [],
    },
    {
      id: 'track-subtitle-1',
      type: 'subtitle',
      name: 'Subtitles',
      locked: false,
      muted: false,
      solo: false,
      visible: true,
      volume: 1,
      height: 50,
      clips: [],
    },
    {
      id: 'track-music-1',
      type: 'music',
      name: 'Music',
      locked: false,
      muted: false,
      solo: false,
      visible: true,
      volume: 1,
      height: 50,
      clips: [],
    },
  ];
}

function snapToGrid(time: number, gridSize: number, enabled: boolean): number {
  if (!enabled || gridSize <= 0) return time;
  return Math.round(time / gridSize) * gridSize;
}

/**
 * Snap time to nearby clip edges, playhead, markers, and grid.
 * Returns the snapped time and which edge was snapped to (for visual indicator).
 */
const SNAP_THRESHOLD_PX = 8; // pixels within which snapping occurs

function snapToEdges(
  time: number,
  tracks: Track[],
  excludeClipId: string,
  excludeLinkedClipId: string | null | undefined,
  currentTime: number,
  markers: Marker[],
  pixelsPerSecond: number,
  gridSize: number,
  snapToGridEnabled: boolean,
): { snappedTime: number; snapTarget: number | null } {
  // Edge/playhead/marker snapping is ALWAYS active regardless of the snap-to-grid toggle.
  // The snapToGridEnabled flag only controls whether the time-grid is also considered.
  const threshold = SNAP_THRESHOLD_PX / pixelsPerSecond;
  let bestSnap = time;
  let bestDist = threshold;
  let snapTarget: number | null = null;

  // Collect all snap points: clip edges + playhead + markers
  const snapPoints: number[] = [currentTime]; // playhead
  for (const marker of markers) {
    snapPoints.push(marker.time);
  }
  for (const track of tracks) {
    for (const clip of track.clips) {
      // Exclude the dragged clip AND its linked counterpart — snapping to your own
      // paired audio/video clip is rarely useful and causes confusing near-self snaps.
      if (clip.id === excludeClipId) continue;
      if (excludeLinkedClipId && clip.id === excludeLinkedClipId) continue;
      snapPoints.push(clip.startTime, clip.endTime);
    }
  }

  for (const pt of snapPoints) {
    const dist = Math.abs(time - pt);
    if (dist < bestDist) {
      bestDist = dist;
      bestSnap = pt;
      snapTarget = pt;
    }
  }

  // Also check grid — only when snap-to-grid is enabled
  if (snapToGridEnabled && gridSize > 0) {
    const gridSnap = Math.round(time / gridSize) * gridSize;
    const gridDist = Math.abs(time - gridSnap);
    if (gridDist < bestDist) {
      bestSnap = gridSnap;
      snapTarget = null; // grid doesn't show indicator
    }
  }

  return { snappedTime: bestSnap, snapTarget };
}

// ==================== Store ====================

export const useEditorStore = create<EditorState & EditorActions>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    project: null,
    asset: null,
    isEditorOpen: false,
    clientProcessingInProgress: false,
    videoUrl: '',

    currentTime: 0,
    duration: 0,
    isPlaying: false,
    playbackRate: 1,
    volume: 1,
    isMuted: false,

    pixelsPerSecond: 50,
    scrollLeft: 0,
    tracks: [],
    markers: [],

    selection: { clipIds: [], trackIds: [] },
    selectedClip: null,

    dragState: null,
    dragHoverTrackId: null,
    snapTarget: null,
    setDragHoverTrackId: (trackId) => set({ dragHoverTrackId: trackId }),

    history: [],
    historyIndex: -1,
    historyLabels: [],

    inPoint: null,
    outPoint: null,

    targetVideoTrackId: null,
    targetAudioTrackId: null,

    // Proxy workflow
    proxyMode: false,
    proxyStatus: new Map(),
    proxyPaths: new Map(),

    // Local asset storage
    assetPaths: new Map(),
    assetDownloadStatus: new Map(),

    // Multicam
    multicamEnabled: false,
    multicamSources: [],
    multicamActiveAngle: 0,
    multicamCuts: [],

    // Compound clip editing
    compoundEditStack: [],

    inspectorTab: 'properties',
    showWaveforms: true,
    snapToGrid: true,
    gridSize: 0.1, // 100ms
    frameRate: 30, // default 30fps
    playbackResolution: 1 as 1 | 0.5 | 0.25, // Full resolution by default

    clipGroups: new Map(),
    keyframeClipboard: [],
    attributeClipboard: null,
    clipClipboard: null,

    // Comparison view
    comparisonMode: false,
    comparisonSplit: 0.5,

    // Overlays
    showSafeMargins: false,
    showGridOverlay: false,

    // Scopes & render bar
    showWaveformScope: false,
    showVectorscope: false,
    showRenderBar: false,

    // Graph editor
    showGraphEditor: false,
    graphEditorProperty: null,

    // Media bins
    mediaBins: [],

    // Source monitor
    sourceMonitorClipId: null,
    sourceMonitorInPoint: null,
    sourceMonitorOutPoint: null,

    // Workspace presets
    workspacePresets: [],
    activeWorkspacePreset: null,

    // Marker list
    showMarkerList: false,

    // Team/Collaboration
    teamProject: null,
    frameIoConnected: false,
    frameIoComments: [],
    projectLocked: false,
    lockedBy: null,

    // Text-based editing
    transcript: [],
    showTextEditor: false,

    // Essential Graphics
    showEssentialGraphics: false,

    // MOGRT
    mogrtTemplates: [],

    // Phase 4: Text & Graphics Advanced
    masterTextStyles: [],
    responsiveDesignPins: [],
    vectorPaths: [],
    activePenTool: false,

    // Phase 4: Workspace Advanced
    panelLayout: null,
    panelVisibility: new Map(),
    referenceMonitor: { enabled: false, sourceClipId: null, displayMode: 'composite' as const },
    fullScreenPreview: false,
    dualMonitorEnabled: false,

    // Phase 4: Multicam Advanced
    multicamAudioFollowVideo: true,
    multicamMixedAudioSources: false,

    // Phase 5: Sequence Markers (separate from clip markers)
    sequenceMarkers: [],

    // Phase 5: Productions (multi-project management)
    productions: [],

    // Phase 5: Shared Projects
    sharedProjectMode: false,

    // Phase 5: Playback & Performance
    gpuAccelerationMode: 'metal' as GpuAccelerationMode,
    hardwareDecoding: true,
    smartRendering: false,
    transmitConfig: { enabled: false, device: '', outputFormat: 'HD 1080i 29.97' } as TransmitConfig,

    // Phase 5: Closed Captions & Caption Duration Rules
    captionStandard: 'open' as ClosedCaptionStandard,
    captionDurationRules: { minDuration: 0.5, maxDuration: 7.0, minGap: 0.1 },

    // Phase 5: Essential Sound type mapping (clipId → EssentialSoundType)
    essentialSoundMap: new Map<string, EssentialSoundType>(),

    // Phase 7: Trimming
    razorToolActive: false,

    // Phase 7: Workspace
    guidesEnabled: false,
    guides: [],
    programmMonitorOverlay: 'none' as const,

    // Phase 7: Performance
    previewRenderQuality: 'full' as const,
    parallelProcessing: true,
    renderCache: new Map<string, string>(),

    // Phase 8: Titles
    textToolActive: false,
    textToolMode: 'point' as const,
    rollingCrawlSettings: { speed: 50, direction: 'up' as const },

    // Phase 8: Scopes
    activeScope: null,
    scopeOverlay: false,

    // Phase 8: Sequence Settings
    sequenceSettings: {
      editingMode: 'custom' as const,
      timebase: 30,
      pixelAspectRatio: 1,
      fieldDominance: 'progressive' as const,
      audioChannels: 'stereo' as const,
      sampleRate: 48000 as const,
    },

    // Phase 8: Nesting & Linking
    linkedSelectionEnabled: true,

    // Phase 8: Timeline Tools
    activeTimelineTool: 'selection' as const,

    // Phase 9: VR/360
    vrMode: false,
    vrProjectionType: 'equirectangular' as const,
    vrFieldOfView: 90,

    // Phase 9: Dynamic Link
    dynamicLinkProjects: [] as DynamicLinkProject[],
    dynamicLinkAutoUpdate: false,

    // Phase 9: Advanced Trimming
    threePointEditMode: false,
    fourPointEditMode: false,
    trimMonitorEnabled: false,

    // Phase 9: Advanced Color Grading
    inputLutPath: null,
    faceDetectionEnabled: false,
    hslSecondaryDenoise: 0,
    hslSecondaryBlur: 0,
    hslSecondaryRefine: { smooth: 0, chatter: 0, contrast: 0 },

    // Phase 9: Advanced Keying
    ultraKeySettings: {
      matteGeneration: { transparency: 45, highlight: 50, shadow: 50, tolerance: 50, pedestal: 10 },
      matteCleanup: { choke: 0, soften: 0, contrast: 0, midPoint: 50 },
      spillSuppression: { desaturate: 25, range: 50, spillAmount: 50, luma: 50 },
    },

    // Phase 9: Surround Sound
    surroundFormat: 'stereo' as const,
    surroundPannerMode: 'balance' as const,
    audioChannelLinking: new Map<string, string[]>(),
    loudnessAnalysis: null,

    // Phase 9: Broadcast
    autoProxyOnImport: false,
    proxyPreset: 'h264-1024' as const,
    projectEncrypted: false,
    closedCaptionDisplay: false,

    // ==================== Project Actions ====================

    openEditor: (asset) => {
      set({ isEditorOpen: true, asset, videoUrl: '' });
      // If the asset already carries a duration in metadata, seed the editor
      // with it so the timeline isn't briefly stuck at the 30s placeholder.
      const metaDuration = ((asset.metadata || {}) as { duration?: number }).duration;
      const initialDuration = typeof metaDuration === 'number' && metaDuration > 0
        ? metaDuration
        : undefined;
      get().initializeProject(asset, undefined, initialDuration);
    },

    setVideoUrl: (url) => {
      set({ videoUrl: url });
    },

    setClientProcessing: (inProgress: boolean) => {
      set({ clientProcessingInProgress: inProgress });
    },

    closeEditor: () => {
      set({
        isEditorOpen: false,
        clientProcessingInProgress: false,
        project: null,
        asset: null,
        videoUrl: '',
        tracks: [],
        currentTime: 0,
        isPlaying: false,
        selection: { clipIds: [], trackIds: [] },
        selectedClip: null,
        history: [],
        historyIndex: -1,
        historyLabels: [],
        inPoint: null,
        outPoint: null,
        // Markers are project-scoped — do not leak across projects
        markers: [],
        sequenceMarkers: [],
        clipGroups: new Map(),
        keyframeClipboard: [],
        attributeClipboard: null,
        clipClipboard: null,
      });
    },

    loadFromTimelineData: (timelineData, duration) => {
      const tracks = convertTimelineDataToEditorTracks(timelineData);
      const restoredMarkers = (timelineData.markers ?? []).map((m) => ({ ...m })) as Marker[];
      const { project } = get();

      // Build initial history entry from existing project (if set by openEditor)
      const initialProject = project
        ? { ...project, tracks: structuredClone(tracks), duration, updatedAt: new Date().toISOString() }
        : null;

      set({
        isEditorOpen: true,
        tracks,
        duration,
        currentTime: 0,
        isPlaying: false,
        markers: restoredMarkers,
        sequenceMarkers: [],
        inPoint: null,
        outPoint: null,
        selection: { clipIds: [], trackIds: [] },
        selectedClip: null,
        ...(initialProject
          ? { project: initialProject, history: [initialProject], historyIndex: 0, historyLabels: ['Load Project'] }
          : { history: [], historyIndex: -1, historyLabels: [] }),
      });
    },

    initializeProject: (asset, subtitleCues, durationOverride) => {
      const metadata = (asset.metadata || {}) as Record<string, unknown>;
      const isImage = asset.assetType === 'IMAGE';
      // Blank/placeholder projects (created via "New Project") carry no real
      // source media — start them with empty tracks instead of placeholder
      // "Main Video"/"Original Audio" clips.
      const isPlaceholder = asset.id.startsWith('blank-') || asset.id.startsWith('project-');
      const duration = durationOverride ?? (isImage ? 5 : ((metadata.duration as number) || 30));

      const tracks = createDefaultTracks(asset.id, duration, undefined, !isPlaceholder);

      // Import subtitle cues if provided
      if (subtitleCues && subtitleCues.length > 0) {
        const subtitleTrack = tracks.find((t) => t.type === 'subtitle');
        if (subtitleTrack) {
          subtitleTrack.clips = subtitleCues.map((cue) => ({
            id: `clip-subtitle-${cue.id}`,
            trackId: subtitleTrack.id,
            type: 'subtitle' as const,
            cueId: cue.id,
            name: cue.text.substring(0, 30),
            text: cue.text,
            startTime: cue.startTime,
            endTime: cue.endTime,
            sourceStartTime: cue.startTime,
            sourceEndTime: cue.endTime,
            style: { ...DEFAULT_SUBTITLE_STYLE },
          }));
        }
      }

      const project: EditorProject = {
        id: generateId(),
        name: asset.name,
        assetId: asset.id,
        duration,
        tracks,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      set({
        project,
        tracks,
        duration,
        history: [project],
        historyIndex: 0,
        // Reset project-scoped state when starting a fresh project
        markers: [],
        sequenceMarkers: [],
        inPoint: null,
        outPoint: null,
      });

      // Separate audio from video in background
      if (!isImage && !isPlaceholder && window.electronAPI?.audioExtract?.separate) {
        const videoPath = asset.id.startsWith('file://')
          ? decodeURIComponent(asset.id.replace(/^file:\/\/\//, ''))
          : get().assetPaths.get(asset.id) ?? get().proxyPaths.get(asset.id);

        if (videoPath) {
          const audioDir = videoPath.replace(/[/\\][^/\\]+$/, '');
          const audioFileName = `audio_${asset.id.replace(/[^a-zA-Z0-9]/g, '_')}.m4a`;
          const audioOutputPath = `${audioDir}/${audioFileName}`;

          window.electronAPI.audioExtract.separate(videoPath, audioOutputPath).then((result) => {
            if (result.success && result.outputPath) {
              // Update audio clip to use separated audio file
              const { tracks: currentTracks } = get();
              const audioTrack = currentTracks.find((t) => t.type === 'audio');
              if (audioTrack) {
                const updatedTracks = currentTracks.map((t) =>
                  t.id === audioTrack.id
                    ? {
                        ...t,
                        clips: t.clips.map((c) =>
                          c.id === 'clip-audio-main'
                            ? { ...c, assetId: result.outputPath! }
                            : c
                        ),
                      }
                    : t
                );
                set({ tracks: updatedTracks });
                // Store audio path for subtitle generation and export
                get().setAssetPath(`audio:${asset.id}`, result.outputPath!);
              }
            }
          });
        }
      }
    },

    saveProject: async () => {
      // TODO: Implement project save to backend
      const { project, tracks } = get();
      if (!project) return;

      const updatedProject = {
        ...project,
        tracks,
        updatedAt: new Date().toISOString(),
      };

      set({ project: updatedProject });
    },

    // ==================== Playback Actions ====================

    play: () => {
      // If the playhead is at (or past) the end, restart from the beginning
      const { currentTime, duration, inPoint, outPoint } = get();
      // If a marked in/out range exists and the playhead is outside it, jump to in point
      if (inPoint !== null && outPoint !== null && (currentTime < inPoint || currentTime >= outPoint - 0.01)) {
        set({ currentTime: inPoint, isPlaying: true });
        return;
      }
      if (duration > 0 && currentTime >= duration - 0.01) {
        set({ currentTime: 0, isPlaying: true });
      } else {
        set({ isPlaying: true });
      }
    },
    pause: () => set({ isPlaying: false }),
    togglePlay: () => {
      const { isPlaying, currentTime, duration, inPoint, outPoint } = get();
      if (!isPlaying && inPoint !== null && outPoint !== null && (currentTime < inPoint || currentTime >= outPoint - 0.01)) {
        set({ currentTime: inPoint, isPlaying: true });
        return;
      }
      if (!isPlaying && duration > 0 && currentTime >= duration - 0.01) {
        // Resuming from the very end → rewind to start
        set({ currentTime: 0, isPlaying: true });
      } else {
        set({ isPlaying: !isPlaying });
      }
    },

    seek: (time) => {
      const { duration, tracks } = get();
      // Always recalculate duration from actual clips before clamping
      const actualDuration = Math.max(calculateMaxEndTime(tracks), 1);
      if (Math.abs(actualDuration - duration) > 0.01) {
        set({ duration: actualDuration });
      }
      const clampedTime = Math.max(0, Math.min(actualDuration, time));
      set({ currentTime: clampedTime });
    },

    setPlaybackRate: (rate) => set({ playbackRate: Math.max(-8, Math.min(8, rate)) || 1 }),
    setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
    toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
    setDuration: (duration) => set({ duration }),
    setCurrentTime: (time) => {
      const { duration, isPlaying, inPoint, outPoint } = get();
      let next = Math.max(0, Math.min(time, duration || Infinity));
      // Loop playback within marked in/out region while playing
      if (isPlaying && inPoint !== null && outPoint !== null && next >= outPoint) {
        next = inPoint;
      }
      set({ currentTime: next });
    },

    // ==================== Timeline Actions ====================

    setZoom: (pixelsPerSecond) => {
      set({ pixelsPerSecond: Math.max(0.5, Math.min(500, pixelsPerSecond)) });
    },

    zoomIn: () => {
      const { pixelsPerSecond } = get();
      set({ pixelsPerSecond: Math.min(500, pixelsPerSecond * 1.25) });
    },

    zoomOut: () => {
      const { pixelsPerSecond } = get();
      set({ pixelsPerSecond: Math.max(0.5, pixelsPerSecond / 1.25) });
    },

    fitToView: (containerWidth) => {
      const { duration } = get();
      if (duration <= 0 || !containerWidth || containerWidth <= 100) return;
      // Allow zoom as low as needed to fit the entire timeline in the viewport
      const newZoom = Math.max(0.5, Math.min(500, (containerWidth - 100) / duration));
      if (!Number.isFinite(newZoom) || newZoom <= 0) return;
      set({ pixelsPerSecond: newZoom, scrollLeft: 0 });
    },

    setScrollLeft: (scrollLeft) => set({ scrollLeft: Math.max(0, scrollLeft) }),

    // ==================== Track Actions ====================

    addTrack: (type, name, opts) => {
      const { tracks } = get();
      const trackCount = tracks.filter((t) => t.type === type).length + 1;
      const defaultNames: Record<TrackType, string> = {
        video: `Video ${trackCount}`,
        audio: `Audio ${trackCount}`,
        subtitle: `Subtitles ${trackCount}`,
        music: `Music ${trackCount}`,
        adjustment: `Adjustment ${trackCount}`,
      };

      const newTrack: Track = {
        id: `track-${type}-${generateId()}`,
        type,
        name: name || defaultNames[type],
        locked: false,
        muted: false,
        solo: false,
        visible: true,
        volume: 1,
        height: type === 'video' || type === 'adjustment' ? 80 : type === 'audio' ? 60 : 50,
        clips: [],
      };

      // atTop inserts the new track as the top-most layer (index 0). In the
      // timeline the top track is the highest compositing layer (z-order), so
      // image overlays added on top render above the base video.
      const updates: Partial<EditorState> = {
        tracks: opts?.atTop ? [newTrack, ...tracks] : [...tracks, newTrack],
      };
      // Auto-set target track if none is set
      if (type === 'video' && !get().targetVideoTrackId) {
        updates.targetVideoTrackId = newTrack.id;
      } else if ((type === 'audio' || type === 'music') && !get().targetAudioTrackId) {
        updates.targetAudioTrackId = newTrack.id;
      }
      set(updates);
      get().pushHistory('Add Track');
      return newTrack;
    },

    removeTrack: (trackId) => {
      const { tracks, selection } = get();
      const newTracks = tracks.filter((t) => t.id !== trackId);
      const newSelection = {
        ...selection,
        trackIds: selection.trackIds.filter((id) => id !== trackId),
        clipIds: selection.clipIds.filter((clipId) => {
          const found = findClipById(newTracks, clipId);
          return found !== null;
        }),
      };

      set({ tracks: newTracks, selection: newSelection });
      get().pushHistory('Remove Track');
    },

    updateTrack: (trackId, updates) => {
      const { tracks } = get();
      const newTracks = tracks.map((t) =>
        t.id === trackId ? { ...t, ...updates } : t
      );
      set({ tracks: newTracks });
    },

    toggleTrackMute: (trackId) => {
      const { tracks } = get();
      const newTracks = tracks.map((t) =>
        t.id === trackId ? { ...t, muted: !t.muted } : t
      );
      set({ tracks: newTracks });
    },

    toggleTrackSolo: (trackId) => {
      const { tracks } = get();
      const track = tracks.find((t) => t.id === trackId);
      if (!track) return;
      const newSolo = !track.solo;
      const newTracks = tracks.map((t) =>
        t.id === trackId ? { ...t, solo: newSolo } : t
      );
      set({ tracks: newTracks });
    },

    setTrackVolume: (trackId, volume) => {
      const { tracks } = get();
      const newTracks = tracks.map((t) =>
        t.id === trackId ? { ...t, volume: Math.max(0, Math.min(1, volume)) } : t
      );
      set({ tracks: newTracks });
    },

    toggleTrackLock: (trackId) => {
      const { tracks } = get();
      const newTracks = tracks.map((t) =>
        t.id === trackId ? { ...t, locked: !t.locked } : t
      );
      set({ tracks: newTracks });
    },

    toggleTrackVisibility: (trackId) => {
      const { tracks } = get();
      const newTracks = tracks.map((t) =>
        t.id === trackId ? { ...t, visible: !t.visible } : t
      );
      set({ tracks: newTracks });
    },

    reorderTracks: (fromIndex, toIndex) => {
      const { tracks } = get();
      const newTracks = [...tracks];
      const [removed] = newTracks.splice(fromIndex, 1);
      newTracks.splice(toIndex, 0, removed);
      set({ tracks: newTracks });
      get().pushHistory('Reorder Tracks');
    },

    // ==================== Clip Actions ====================

    addClip: (trackId, clipData) => {
      const { tracks, duration } = get();
      const existingEffects = 'effects' in clipData ? clipData.effects : undefined;
      const newClip = {
        ...clipData,
        effects: existingEffects ?? [],
        id: `clip-${generateId()}`,
        trackId,
      } as Clip;

      const newTracks = tracks.map((t) =>
        t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t
      );

      // Auto-expand duration if clip extends beyond current duration
      const newDuration = Math.max(duration, newClip.endTime);

      set({ tracks: newTracks, duration: newDuration });
      get().pushHistory('Add Clip');
      return newClip;
    },

    addAdjustmentLayer: (trackId, startTime, clipDuration) => {
      const { tracks } = get();

      // Ensure the target track exists and is an adjustment track
      const targetTrack = tracks.find((t) => t.id === trackId);
      let actualTrackId = trackId;

      if (!targetTrack || targetTrack.type !== 'adjustment') {
        // Create a new adjustment track if needed
        const newTrack = get().addTrack('adjustment');
        actualTrackId = newTrack.id;
      }

      const newClip: AdjustmentClip = {
        id: `clip-adj-${generateId()}`,
        trackId: actualTrackId,
        type: 'adjustment',
        name: 'Adjustment Layer',
        startTime,
        endTime: startTime + clipDuration,
        sourceStartTime: 0,
        sourceEndTime: clipDuration,
        opacity: 1,
        effects: [
          {
            id: `eff-${generateId()}`,
            type: 'filter',
            name: 'Brightness',
            enabled: true,
            filterType: 'brightness',
            filterIntensity: 0,
            keyframes: [],
          },
        ],
        keyframes: [],
      };

      const freshTracks = get().tracks;
      const newTracks = freshTracks.map((t) =>
        t.id === actualTrackId ? { ...t, clips: [...t.clips, newClip] } : t
      );

      const currentDuration = get().duration;
      const expandedDuration = Math.max(currentDuration, newClip.endTime);

      set({ tracks: newTracks, duration: expandedDuration });
      get().pushHistory('Add Adjustment Layer');
      return newClip;
    },

    removeClip: (clipId) => {
      const { tracks, selection, selectedClip } = get();

      // Find linked clip to remove together
      const found = findClipById(tracks, clipId);
      const linkedId = found?.clip.linkedClipId;

      // Collect source assetIds of any audio/music clips being removed so that a
      // surviving video clip from the same source stops playing its embedded
      // audio (matched by assetId, robust to lost linkedClipId after reload/unlink).
      const removedAudioAssetIds = new Set<string>();
      for (const t of tracks) {
        for (const c of t.clips) {
          if (
            (c.id === clipId || c.id === linkedId) &&
            (c.type === 'audio' || c.type === 'music') &&
            'assetId' in c &&
            c.assetId
          ) {
            removedAudioAssetIds.add(c.assetId);
          }
        }
      }

      const newTracks = tracks.map((t) => ({
        ...t,
        clips: t.clips
          .filter((c) => c.id !== clipId && c.id !== linkedId)
          .map((c) =>
            c.type === 'video' && 'assetId' in c && c.assetId && removedAudioAssetIds.has(c.assetId)
              ? { ...c, audioExtracted: true }
              : c
          ),
      }));

      set({
        tracks: newTracks,
        duration: Math.max(calculateMaxEndTime(newTracks), 0),
        selection: {
          ...selection,
          clipIds: selection.clipIds.filter((id) => id !== clipId),
        },
        selectedClip: selectedClip?.id === clipId ? null : selectedClip,
      });
      get().pushHistory('Remove Clip');
    },

    moveClipToTrack: (clipId, targetTrackId) => {
      const { tracks } = get();
      const found = findClipById(tracks, clipId);
      if (!found) return;
      const { clip, track: sourceTrack } = found;
      if (sourceTrack.id === targetTrackId) return;

      const targetTrack = tracks.find((t) => t.id === targetTrackId);
      if (!targetTrack) return;

      // Only allow moving between same-type tracks
      if (targetTrack.type !== sourceTrack.type) return;

      // Reject move if target track has any clip overlapping the dropped position
      const hasOverlap = targetTrack.clips.some(
        (c) => clip.startTime < c.endTime && clip.endTime > c.startTime
      );
      if (hasOverlap) return;

      const movedClip = { ...clip, trackId: targetTrackId };
      const newTracks = tracks.map((t) => {
        if (t.id === sourceTrack.id) {
          return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
        }
        if (t.id === targetTrackId) {
          return { ...t, clips: [...t.clips, movedClip] };
        }
        return t;
      });

      set({ tracks: newTracks });
    },

    moveClipZOrder: (clipId, direction) => {
      const { tracks } = get();
      const found = findClipById(tracks, clipId);
      if (!found) return;
      const sourceTrack = found.track;
      // z-order only applies to visual (video/image) tracks.
      if (sourceTrack.type !== 'video') return;

      const fromIndex = tracks.findIndex((t) => t.id === sourceTrack.id);
      if (fromIndex === -1) return;

      // 'up' = bring forward = lower array index (index 0 is the top-most layer).
      const step = direction === 'up' ? -1 : 1;
      let targetIndex = -1;
      for (let i = fromIndex + step; i >= 0 && i < tracks.length; i += step) {
        if (tracks[i].type === 'video') {
          targetIndex = i;
          break;
        }
      }
      // Already at the top/bottom of the video stack — nothing to do.
      if (targetIndex === -1) return;

      const newTracks = [...tracks];
      [newTracks[fromIndex], newTracks[targetIndex]] = [
        newTracks[targetIndex],
        newTracks[fromIndex],
      ];
      set({ tracks: newTracks });
      get().pushHistory(direction === 'up' ? 'Bring Forward' : 'Send Backward');
    },

    updateClip: (clipId, updates) => {
      const { tracks, selectedClip } = get();

      let newSelectedClip = selectedClip;

      const newTracks = tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id === clipId) {
            const updatedClip = { ...c, ...updates } as Clip;
            // When speed changes on a video clip, recalculate endTime
            const speedUpdate = (updates as Partial<VideoClip>).speed;
            if ('speed' in updates && typeof speedUpdate === 'number' && c.type === 'video') {
              const speed = speedUpdate;
              if (speed > 0) {
                const sourceDuration = c.sourceEndTime - c.sourceStartTime;
                updatedClip.endTime = c.startTime + sourceDuration / speed;
              }
              // speed === 0 (freeze frame): keep current endTime as-is
            }
            // Update selected clip reference if needed
            if (selectedClip?.id === clipId) {
              newSelectedClip = updatedClip;
            }
            return updatedClip;
          }
          return c;
        }),
      }));

      set({
        tracks: newTracks,
        duration: Math.max(calculateMaxEndTime(newTracks), 1),
        selectedClip: newSelectedClip,
      });
    },

    moveClip: (clipId, newTrackId, newStartTime) => {
      const { tracks, snapToGrid: snap, gridSize, duration: currentDuration } = get();
      const found = findClipById(tracks, clipId);
      if (!found) return;

      const { clip } = found;
      const clipDuration = clip.endTime - clip.startTime;
      const snappedStartTime = snapToGrid(newStartTime, gridSize, snap);

      // Remove from old track
      const tracksWithoutClip = tracks.map((t) => ({
        ...t,
        clips: t.clips.filter((c) => c.id !== clipId),
      }));

      // Add to new track
      const movedClip = {
        ...clip,
        trackId: newTrackId,
        startTime: snappedStartTime,
        endTime: snappedStartTime + clipDuration,
      };

      const newTracks = tracksWithoutClip.map((t) =>
        t.id === newTrackId ? { ...t, clips: [...t.clips, movedClip] } : t
      );

      // Auto-expand duration if clip extends beyond current duration
      const newDuration = Math.max(currentDuration, movedClip.endTime);

      set({ tracks: newTracks, duration: newDuration });
      get().pushHistory('Move Clip');
    },

    splitClip: (clipId, splitTime) => {
      let { tracks } = get();
      const found = findClipById(tracks, clipId);
      if (!found) return;

      const { clip, track } = found;

      // Can't split outside clip bounds
      if (splitTime <= clip.startTime || splitTime >= clip.endTime) return;

      const relativeTime = splitTime - clip.startTime;
      const sourceRelativeTime = clip.sourceStartTime + relativeTime;

      const firstId = clip.id;
      const secondId = `clip-${generateId()}`;

      // Also split linked clip if exists
      let linkedFirstId: string | undefined;
      let linkedSecondId: string | undefined;
      if (clip.linkedClipId) {
        const linkedFound = findClipById(tracks, clip.linkedClipId);
        if (linkedFound && splitTime > linkedFound.clip.startTime && splitTime < linkedFound.clip.endTime) {
          linkedFirstId = linkedFound.clip.id;
          linkedSecondId = `clip-${generateId()}`;
          const linkedRelTime = splitTime - linkedFound.clip.startTime;
          const linkedSourceRelTime = linkedFound.clip.sourceStartTime + linkedRelTime;

          const cloneLinkedShared = (c: Clip) => ({
            ...(hasEffects(c)
              ? {
                  effects: c.effects.map((e) => ({
                    ...e,
                    filterParams: e.filterParams
                      ? JSON.parse(JSON.stringify(e.filterParams))
                      : e.filterParams,
                  })),
                  keyframes: c.keyframes.map((k) => ({ ...k })),
                }
              : {}),
            ...('transform' in c && (c as VideoClip).transform
              ? { transform: { ...(c as VideoClip).transform } }
              : {}),
          });
          const linkedFirst: Clip = {
            ...linkedFound.clip,
            linkedClipId: firstId,
            endTime: splitTime,
            sourceEndTime: linkedSourceRelTime,
            ...cloneLinkedShared(linkedFound.clip),
          } as Clip;
          const linkedSecond: Clip = {
            ...linkedFound.clip,
            id: linkedSecondId,
            linkedClipId: secondId,
            name: `${linkedFound.clip.name} (2)`,
            startTime: splitTime,
            sourceStartTime: linkedSourceRelTime,
            ...cloneLinkedShared(linkedFound.clip),
          } as Clip;

          tracks = tracks.map((t) => {
            if (t.id !== linkedFound.track.id) return t;
            const newClips = t.clips.filter((c) => c.id !== linkedFound.clip.id);
            return { ...t, clips: [...newClips, linkedFirst, linkedSecond] };
          });
        }
      }

      // Deep-clone mutable per-clip state so the two halves are fully independent.
      // Without this, both halves share the same `effects` (and nested filterParams)
      // array reference — editing color/effects on one half visibly affects the other.
      const cloneSharedState = (c: Clip) => ({
        ...(hasEffects(c)
          ? {
              effects: c.effects.map((e) => ({
                ...e,
                filterParams: e.filterParams
                  ? JSON.parse(JSON.stringify(e.filterParams))
                  : e.filterParams,
              })),
              keyframes: c.keyframes.map((k) => ({ ...k })),
            }
          : {}),
        ...('transform' in c && (c as VideoClip).transform
          ? { transform: { ...(c as VideoClip).transform } }
          : {}),
      });

      // Create two clips from the split
      const firstClip: Clip = {
        ...clip,
        endTime: splitTime,
        sourceEndTime: sourceRelativeTime,
        linkedClipId: linkedFirstId ?? clip.linkedClipId,
        ...cloneSharedState(clip),
      } as Clip;

      const secondClip: Clip = {
        ...clip,
        id: secondId,
        name: `${clip.name} (2)`,
        startTime: splitTime,
        sourceStartTime: sourceRelativeTime,
        linkedClipId: linkedSecondId ?? undefined,
        ...cloneSharedState(clip),
      } as Clip;

      const newTracks = tracks.map((t) => {
        if (t.id !== track.id) return t;
        const newClips = t.clips.filter((c) => c.id !== clipId);
        return { ...t, clips: [...newClips, firstClip, secondClip] };
      });

      const { selectedClip } = get();
      set({
        tracks: newTracks,
        selectedClip: selectedClip?.id === clipId ? firstClip : selectedClip,
      });
      get().pushHistory('Split Clip');
    },

    duplicateClip: (clipId) => {
      const { tracks } = get();
      const found = findClipById(tracks, clipId);
      if (!found) return null;

      const { clip, track } = found;
      const duration = clip.endTime - clip.startTime;

      // Deep-clone mutable per-clip state (effects, keyframes, transform) so the
      // duplicated clip is fully independent. Without this, editing color (or any
      // other effect) on one clip silently mutates the other via shared references.
      const newClip: Clip = {
        ...clip,
        id: `clip-${generateId()}`,
        name: `${clip.name} (copy)`,
        startTime: clip.endTime,
        endTime: clip.endTime + duration,
        ...(hasEffects(clip)
          ? {
              effects: clip.effects.map((e) => ({
                ...e,
                filterParams: e.filterParams
                  ? JSON.parse(JSON.stringify(e.filterParams))
                  : e.filterParams,
              })),
              keyframes: clip.keyframes.map((k) => ({ ...k })),
            }
          : {}),
        ...('transform' in clip && clip.transform
          ? { transform: { ...clip.transform } }
          : {}),
      } as Clip;

      const newTracks = tracks.map((t) =>
        t.id === track.id ? { ...t, clips: [...t.clips, newClip] } : t
      );

      set({ tracks: newTracks });
      get().pushHistory('Duplicate Clip');
      return newClip;
    },

    linkClips: (clipIdA, clipIdB) => {
      get().updateClip(clipIdA, { linkedClipId: clipIdB });
      get().updateClip(clipIdB, { linkedClipId: clipIdA });
      get().pushHistory('Link Clips');
    },

    unlinkClip: (clipId) => {
      const { tracks } = get();
      const found = findClipById(tracks, clipId);
      if (!found) return;
      const linkedId = found.clip.linkedClipId;
      get().updateClip(clipId, { linkedClipId: undefined });
      if (linkedId) {
        get().updateClip(linkedId, { linkedClipId: undefined });
      }
      get().pushHistory('Unlink Clip');
    },

    // ==================== Selection Actions ====================

    selectClip: (clipId, addToSelection = false) => {
      const { tracks, selection } = get();
      const found = findClipById(tracks, clipId);

      // Normalize options: accept boolean (legacy) or { shift, ctrl } object
      let doAdd = false;
      let doToggle = false;
      if (typeof addToSelection === 'boolean') {
        doAdd = addToSelection;
      } else {
        doAdd = !!(addToSelection?.shift || addToSelection?.ctrl);
        doToggle = !!(addToSelection?.ctrl);
      }

      if (doAdd) {
        let newClipIds: string[];
        if (doToggle) {
          // Ctrl/Cmd: toggle individual clip
          newClipIds = selection.clipIds.includes(clipId)
            ? selection.clipIds.filter((id) => id !== clipId)
            : [...selection.clipIds, clipId];
        } else {
          // Shift: add to selection (don't toggle if already selected)
          newClipIds = selection.clipIds.includes(clipId)
            ? selection.clipIds.filter((id) => id !== clipId)
            : [...selection.clipIds, clipId];
        }
        // selectedClip = first clip in new selection
        const firstId = newClipIds[0];
        const firstFound = firstId ? findClipById(tracks, firstId) : null;
        set({
          selection: { ...selection, clipIds: newClipIds },
          selectedClip: found?.clip || firstFound?.clip || null,
        });
      } else {
        set({
          selection: { clipIds: [clipId], trackIds: [] },
          selectedClip: found?.clip || null,
        });
      }
    },

    selectClipsInRange: (clipIds) => {
      const { tracks } = get();
      const ids = Array.isArray(clipIds) ? clipIds : [clipIds];
      if (ids.length === 0) {
        set({ selection: { clipIds: [], trackIds: [] }, selectedClip: null });
        return;
      }
      const firstFound = findClipById(tracks, ids[0]);
      set({
        selection: { clipIds: ids, trackIds: [] },
        selectedClip: firstFound?.clip || null,
      });
    },

    selectTrack: (trackId, addToSelection = false) => {
      const { selection } = get();
      if (addToSelection) {
        const newTrackIds = selection.trackIds.includes(trackId)
          ? selection.trackIds.filter((id) => id !== trackId)
          : [...selection.trackIds, trackId];
        set({ selection: { ...selection, trackIds: newTrackIds } });
      } else {
        set({ selection: { clipIds: [], trackIds: [trackId] } });
      }
    },

    clearSelection: () => {
      set({
        selection: { clipIds: [], trackIds: [] },
        selectedClip: null,
      });
    },

    selectAll: () => {
      const { tracks } = get();
      const allClipIds = tracks.flatMap((t) => t.clips.map((c) => c.id));
      set({ selection: { clipIds: allClipIds, trackIds: [] } });
    },

    deleteSelected: () => {
      const { tracks, selection } = get();

      // Collect linked clip IDs that should also be deleted
      const idsToDelete = new Set(selection.clipIds);
      for (const track of tracks) {
        for (const clip of track.clips) {
          if (idsToDelete.has(clip.id) && clip.linkedClipId) {
            idsToDelete.add(clip.linkedClipId);
          }
        }
      }

      // Collect source assetIds of audio/music clips being deleted so a surviving
      // video clip from the same source stops playing its embedded audio.
      const removedAudioAssetIds = new Set<string>();
      for (const track of tracks) {
        for (const clip of track.clips) {
          if (
            idsToDelete.has(clip.id) &&
            (clip.type === 'audio' || clip.type === 'music') &&
            'assetId' in clip &&
            clip.assetId
          ) {
            removedAudioAssetIds.add(clip.assetId);
          }
        }
      }

      // Filter out deleted clips; clear stale linkedClipId; silence surviving
      // video clips whose paired audio (same source) was removed.
      const newTracks = tracks.map((t) => ({
        ...t,
        clips: t.clips
          .filter((c) => !idsToDelete.has(c.id))
          .map((c) => {
            let next = c;
            if (c.linkedClipId && idsToDelete.has(c.linkedClipId)) {
              next = { ...next, linkedClipId: undefined };
            }
            if (
              c.type === 'video' &&
              'assetId' in c &&
              c.assetId &&
              removedAudioAssetIds.has(c.assetId)
            ) {
              next = { ...(next as VideoClip), audioExtracted: true };
            }
            return next;
          }),
      }));

      set({
        tracks: newTracks,
        duration: Math.max(calculateMaxEndTime(newTracks), 0),
        selection: { clipIds: [], trackIds: [] },
        selectedClip: null,
      });
      get().pushHistory('Delete Selected');
    },

    rippleDelete: () => {
      const { tracks, selection } = get();
      if (selection.clipIds.length === 0) return;

      const newTracks = tracks.map((track) => {
        // Find deleted clips on this track
        const deletedClips = track.clips.filter((c) => selection.clipIds.includes(c.id));
        if (deletedClips.length === 0) return track;

        // Remove selected clips and close gaps
        const remaining = track.clips.filter((c) => !selection.clipIds.includes(c.id));
        return { ...track, clips: closeGapsInClips(remaining) };
      });

      set({
        tracks: newTracks,
        selection: { clipIds: [], trackIds: [] },
        selectedClip: null,
      });
      get().pushHistory('Ripple Delete');
    },

    duplicateSelectedClips: () => {
      const { tracks, selection } = get();
      if (selection.clipIds.length === 0) return;

      const newClipIds: string[] = [];
      const OFFSET = 0.5; // seconds offset for duplicated clips

      const newTracks = tracks.map((track) => {
        const clipsToAdd: Clip[] = [];
        for (const clip of track.clips) {
          if (selection.clipIds.includes(clip.id)) {
            const duration = clip.endTime - clip.startTime;
            const newClip: Clip = {
              ...clip,
              id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: `${clip.name} (copy)`,
              startTime: clip.endTime + OFFSET,
              endTime: clip.endTime + OFFSET + duration,
              linkedClipId: undefined,
              ...(hasEffects(clip)
                ? {
                    effects: clip.effects.map((e) => ({
                      ...e,
                      filterParams: e.filterParams
                        ? JSON.parse(JSON.stringify(e.filterParams))
                        : e.filterParams,
                    })),
                    keyframes: clip.keyframes.map((k) => ({ ...k })),
                  }
                : {}),
              ...('transform' in clip && clip.transform
                ? { transform: { ...clip.transform } }
                : {}),
            } as Clip;
            clipsToAdd.push(newClip);
            newClipIds.push(newClip.id);
          }
        }
        if (clipsToAdd.length === 0) return track;
        return { ...track, clips: [...track.clips, ...clipsToAdd] };
      });

      const firstNewClip = newClipIds[0] ? findClipById(newTracks, newClipIds[0])?.clip || null : null;
      set({
        tracks: newTracks,
        duration: Math.max(calculateMaxEndTime(newTracks), 1),
        selection: { clipIds: newClipIds, trackIds: [] },
        selectedClip: firstNewClip,
      });
      get().pushHistory('Duplicate Clips');
    },

    moveSelectedClips: (deltaTime, _deltaTrackIndex) => {
      const { tracks, selection, selectedClip } = get();
      if (selection.clipIds.length === 0) return;

      const newTracks = tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => {
          if (!selection.clipIds.includes(clip.id)) return clip;
          const newStart = Math.max(0, clip.startTime + deltaTime);
          const duration = clip.endTime - clip.startTime;
          return { ...clip, startTime: newStart, endTime: newStart + duration };
        }),
      }));

      let newSelectedClip = selectedClip;
      if (selectedClip && selection.clipIds.includes(selectedClip.id)) {
        newSelectedClip = findClipById(newTracks, selectedClip.id)?.clip || null;
      }

      set({
        tracks: newTracks,
        duration: Math.max(calculateMaxEndTime(newTracks), 1),
        selectedClip: newSelectedClip,
      });
      get().pushHistory('Move Clips');
    },

    // ==================== Drag Actions ====================

    startDrag: (dragState) => set({ dragState }),

    updateDrag: (_currentX, currentTime) => {
      const { dragState, tracks, snapToGrid: snap, gridSize, markers, pixelsPerSecond, currentTime: playhead } = get();
      if (!dragState) return;

      const found = findClipById(tracks, dragState.clipId);
      if (!found) return;

      const { originalClip } = dragState;
      const clipDuration = originalClip.endTime - originalClip.startTime;

      // Image clips have no intrinsic source duration — they can be stretched to
      // any length. Exempt them from the source-duration trim clamp so the user
      // can drag the end handle to extend an image indefinitely.
      const isImageClip =
        originalClip.type === 'video' && (originalClip as VideoClip).mediaType === 'image';

      // Helper: snap using clip edges, playhead, markers, and grid.
      // Also excludes the dragged clip's linked counterpart to avoid self-snapping.
      const linkedClipId = originalClip.linkedClipId ?? null;
      const doSnap = (time: number, excludeId: string) =>
        snapToEdges(time, tracks, excludeId, linkedClipId, playhead, markers, pixelsPerSecond, gridSize, snap);

      // Helper: apply same updates to linked clip
      const applyToLinked = (updates: Partial<Clip>) => {
        if (originalClip.linkedClipId) {
          get().updateClip(originalClip.linkedClipId, updates);
        }
      };

      if (dragState.operation === 'move') {
        // Anchor the clip's LEFT EDGE to the cursor (drop x position), regardless
        // of where within the clip body the user grabbed it.
        const rawStart = currentTime;

        // Only apply snap if user has moved clip more than a minimal threshold
        // This prevents the clip from jumping to a snap point immediately on click
        const moveDistance = Math.abs(rawStart - originalClip.startTime);
        const MIN_MOVE_THRESHOLD = 0.05; // seconds — must move at least this much before snap engages
        const { snappedTime, snapTarget } = moveDistance > MIN_MOVE_THRESHOLD
          ? doSnap(rawStart, dragState.clipId)
          : { snappedTime: rawStart, snapTarget: null };
        const newStartTime = Math.max(0, snappedTime);
        const newEndTime = newStartTime + clipDuration;
        const delta = newStartTime - originalClip.startTime;

        set({ snapTarget });
        const moveUpdates = { startTime: newStartTime, endTime: newEndTime };
        get().updateClip(dragState.clipId, moveUpdates);

        // Apply delta to linked clip using its original position (not current — avoids drift)
        if (originalClip.linkedClipId && dragState.linkedOriginalClip) {
          const lo = dragState.linkedOriginalClip;
          const linkedDuration = lo.endTime - lo.startTime;
          const linkedStart = Math.max(0, lo.startTime + delta);
          get().updateClip(originalClip.linkedClipId, {
            startTime: linkedStart,
            endTime: linkedStart + linkedDuration,
          });
        } else {
          applyToLinked(moveUpdates);
        }

        // Move all other selected clips by the same delta
        const { selection } = get();
        if (selection.clipIds.length > 1) {
          for (const selId of selection.clipIds) {
            if (selId === dragState.clipId || selId === originalClip.linkedClipId) continue;
            const selFound = findClipById(tracks, selId);
            if (selFound) {
              const s = selFound.clip;
              const sStart = Math.max(0, s.startTime + delta);
              get().updateClip(selId, { startTime: sStart, endTime: sStart + (s.endTime - s.startTime) });
            }
          }
        }

        // Keep duration in sync with actual clip positions during drag
        const latestTracks = get().tracks;
        set({ duration: Math.max(calculateMaxEndTime(latestTracks), 1) });
        return;
      } else if (dragState.operation === 'trim-start') {
        const { snappedTime, snapTarget: rawSnapTarget } = doSnap(currentTime, dragState.clipId);
        let newStartTime = snappedTime;
        const clampedStartTime = Math.max(0, Math.min(originalClip.endTime - 0.1, newStartTime));
        newStartTime = clampedStartTime;
        // Only show the snap guide if the clamped position still matches the snap target —
        // if clamping overrode the snap, the guide would render at the wrong position.
        const snapTarget = rawSnapTarget !== null && Math.abs(clampedStartTime - rawSnapTarget) < 0.001
          ? rawSnapTarget
          : null;
        set({ snapTarget });

        // Clamp: sourceStartTime cannot go below 0
        let newSourceStart = originalClip.sourceStartTime + (newStartTime - originalClip.startTime);
        if (newSourceStart < 0) {
          newSourceStart = 0;
          newStartTime = originalClip.startTime - originalClip.sourceStartTime;
        }

        const trimStartUpdates = { startTime: newStartTime, sourceStartTime: newSourceStart };
        get().updateClip(dragState.clipId, trimStartUpdates);
        applyToLinked(trimStartUpdates);
      } else if (dragState.operation === 'trim-end') {
        const { snappedTime: snappedEnd, snapTarget: rawSnapTargetEnd } = doSnap(currentTime, dragState.clipId);
        let newEndTime = snappedEnd;
        const clampedEndTime = Math.max(originalClip.startTime + 0.1, newEndTime);
        newEndTime = clampedEndTime;
        // Only show the snap guide if the clamped position still matches the snap target.
        const snapTargetEnd = rawSnapTargetEnd !== null && Math.abs(clampedEndTime - rawSnapTargetEnd) < 0.001
          ? rawSnapTargetEnd
          : null;
        set({ snapTarget: snapTargetEnd });

        // Clamp: sourceEndTime cannot exceed sourceDuration (images are exempt —
        // they have no source media length and may be stretched without limit).
        let newSourceEnd = originalClip.sourceEndTime + (newEndTime - originalClip.endTime);
        const maxDuration = originalClip.sourceDuration ?? 0;
        if (!isImageClip && maxDuration > 0 && newSourceEnd > maxDuration) {
          newSourceEnd = maxDuration;
          newEndTime = originalClip.endTime + (maxDuration - originalClip.sourceEndTime);
        }

        const trimEndUpdates = { endTime: newEndTime, sourceEndTime: newSourceEnd };
        get().updateClip(dragState.clipId, trimEndUpdates);
        applyToLinked(trimEndUpdates);
      } else if (dragState.operation === 'roll-end' && dragState.adjacentClipId && dragState.adjacentOriginalClip) {
        // Roll edit: drag the end of this clip and start of the adjacent clip together
        let newBoundary = currentTime;
        // Clamp between start of this clip + 0.1 and end of adjacent clip - 0.1
        const adjOriginal = dragState.adjacentOriginalClip;
        newBoundary = Math.max(originalClip.startTime + 0.1, Math.min(adjOriginal.endTime - 0.1, newBoundary));

        // Update this clip's end
        const endDelta = newBoundary - originalClip.endTime;
        let newSourceEnd = originalClip.sourceEndTime + endDelta;
        const maxDur = originalClip.sourceDuration ?? 0;
        if (!isImageClip && maxDur > 0 && newSourceEnd > maxDur) {
          newSourceEnd = maxDur;
          newBoundary = originalClip.endTime + (maxDur - originalClip.sourceEndTime);
        }
        get().updateClip(dragState.clipId, { endTime: newBoundary, sourceEndTime: newSourceEnd });

        // Update adjacent clip's start
        const startDelta = newBoundary - adjOriginal.startTime;
        let newAdjSourceStart = adjOriginal.sourceStartTime + startDelta;
        if (newAdjSourceStart < 0) newAdjSourceStart = 0;
        get().updateClip(dragState.adjacentClipId, { startTime: newBoundary, sourceStartTime: newAdjSourceStart });
      } else if (dragState.operation === 'roll-start' && dragState.adjacentClipId && dragState.adjacentOriginalClip) {
        // Roll edit: drag the start of this clip and end of the adjacent clip together
        let newBoundary = currentTime;
        const adjOriginal = dragState.adjacentOriginalClip;
        newBoundary = Math.max(adjOriginal.startTime + 0.1, Math.min(originalClip.endTime - 0.1, newBoundary));

        // Update this clip's start
        const startDelta = newBoundary - originalClip.startTime;
        let newSourceStart = originalClip.sourceStartTime + startDelta;
        if (newSourceStart < 0) newSourceStart = 0;
        get().updateClip(dragState.clipId, { startTime: newBoundary, sourceStartTime: newSourceStart });

        // Update adjacent clip's end
        const endDelta = newBoundary - adjOriginal.endTime;
        let newAdjSourceEnd = adjOriginal.sourceEndTime + endDelta;
        const adjMaxDur = adjOriginal.sourceDuration ?? 0;
        if (adjMaxDur > 0 && newAdjSourceEnd > adjMaxDur) newAdjSourceEnd = adjMaxDur;
        get().updateClip(dragState.adjacentClipId, { endTime: newBoundary, sourceEndTime: newAdjSourceEnd });
      } else if (dragState.operation === 'slip') {
        // Slip edit: shift source in/out while keeping timeline position fixed
        const timeDelta = currentTime - dragState.startTime;
        let newSourceStart = originalClip.sourceStartTime + timeDelta;
        let newSourceEnd = originalClip.sourceEndTime + timeDelta;

        // Clamp source range
        if (newSourceStart < 0) {
          newSourceEnd -= newSourceStart;
          newSourceStart = 0;
        }
        const maxDuration = originalClip.sourceDuration ?? 0;
        if (maxDuration > 0 && newSourceEnd > maxDuration) {
          newSourceStart -= (newSourceEnd - maxDuration);
          newSourceEnd = maxDuration;
        }

        get().updateClip(dragState.clipId, { sourceStartTime: newSourceStart, sourceEndTime: newSourceEnd });
      } else if (dragState.operation === 'slide') {
        // Slide edit: the selected clip stays in place; adjacent clips absorb the delta by
        // changing their in/out points (the clip's timeline position is fixed).
        const timeDelta = currentTime - dragState.startTime;
        if (dragState.adjacentClipId && dragState.adjacentOriginalClip) {
          // Single adjacent clip provided — treat it as the clip to the right (post-clip).
          // Shrink/grow the preceding clip's out-point and the post-clip's in-point.
          const postOriginal = dragState.adjacentOriginalClip;

          // Adjust the preceding (adjacent) clip's out point by -timeDelta
          const prevNewSourceEnd = postOriginal.sourceEndTime - timeDelta;
          const prevNewEnd = Math.max(postOriginal.startTime + 0.1, postOriginal.endTime - timeDelta);
          get().updateClip(dragState.adjacentClipId, {
            endTime: prevNewEnd,
            sourceEndTime: Math.max(postOriginal.sourceStartTime + 0.1, prevNewSourceEnd),
          });
        } else {
          // No adjacent clip info — fall back to adjusting only the neighbouring clips
          // found on the same track by scanning the current tracks state.
          const { tracks: currentTracks } = get();
          const trackWithClip = currentTracks.find((t) => t.clips.some((c) => c.id === dragState.clipId));
          if (trackWithClip) {
            const sorted = [...trackWithClip.clips].sort((a, b) => a.startTime - b.startTime);
            const idx = sorted.findIndex((c) => c.id === dragState.clipId);

            // Adjust the preceding clip's out-point
            if (idx > 0) {
              const prevClip = sorted[idx - 1];
              const prevNewEnd = Math.max(prevClip.startTime + 0.1, prevClip.endTime + timeDelta);
              const prevSourceDelta = prevNewEnd - prevClip.endTime;
              let prevNewSourceEnd = prevClip.sourceEndTime + prevSourceDelta;
              const prevMaxDur = prevClip.sourceDuration ?? 0;
              if (prevMaxDur > 0 && prevNewSourceEnd > prevMaxDur) prevNewSourceEnd = prevMaxDur;
              get().updateClip(prevClip.id, { endTime: prevNewEnd, sourceEndTime: prevNewSourceEnd });
            }

            // Adjust the following clip's in-point
            if (idx < sorted.length - 1) {
              const nextClip = sorted[idx + 1];
              const nextNewStart = Math.max(0, Math.min(nextClip.endTime - 0.1, nextClip.startTime + timeDelta));
              const nextSourceDelta = nextNewStart - nextClip.startTime;
              let nextNewSourceStart = nextClip.sourceStartTime + nextSourceDelta;
              if (nextNewSourceStart < 0) nextNewSourceStart = 0;
              get().updateClip(nextClip.id, { startTime: nextNewStart, sourceStartTime: nextNewSourceStart });
            }
          }
        }
      } else if (dragState.operation === 'rate-stretch') {
        // Rate stretch: change speed by dragging end edge (only for video clips)
        const newEndTime = Math.max(originalClip.startTime + 0.1, currentTime);
        const newDuration = newEndTime - originalClip.startTime;
        const sourceDuration = originalClip.sourceEndTime - originalClip.sourceStartTime;
        const newSpeed = Math.max(0.1, Math.min(8, sourceDuration / newDuration));
        get().updateClip(dragState.clipId, { endTime: newEndTime, speed: newSpeed } as Partial<Clip>);
      }

      // Keep duration in sync during trim/other operations
      {
        const latestTracks = get().tracks;
        set({ duration: Math.max(calculateMaxEndTime(latestTracks), 1) });
      }
    },

    endDrag: () => {
      set({ snapTarget: null });
      const { dragState, tracks } = get();
      if (!dragState) { set({ dragState: null, dragHoverTrackId: null }); return; }

      if (dragState.operation === 'move') {
        const found = findClipById(tracks, dragState.clipId);
        if (found) {
          const { clip } = found;

          // If the clip didn't actually move (just a click), don't run ripple or push history
          const moved = Math.abs(clip.startTime - dragState.originalClip.startTime) > 0.001;
          if (!moved) {
            set({ dragState: null, dragHoverTrackId: null });
            return;
          }

          // Resolve overlaps: for each track, push overlapping clips to the right
          // Only push clips that actually overlap with the moved clip (or its linked pair)
          const movedClipIds = new Set([dragState.clipId]);
          if (clip.linkedClipId) movedClipIds.add(clip.linkedClipId);

          const newTracks = tracks.map((track) => {
            // Find the moved clip in this track (if any)
            const movedInTrack = track.clips.find((c) => movedClipIds.has(c.id));
            if (!movedInTrack) return track;

            const others = track.clips.filter((c) => !movedClipIds.has(c.id));
            const sorted = sortClipsByStartTime(others);

            // Decide per-other whether the moved clip should ripple it aside
            // or simply snap itself adjacent. Rule: ripple only if the moved
            // clip has encroached past the midpoint of the neighbour — small
            // overlaps just snap the moved clip to the neighbour's edge so
            // the timeline doesn't rearrange itself for tiny drags.
            const movedDuration = movedInTrack.endTime - movedInTrack.startTime;
            let finalMovedStart = movedInTrack.startTime;
            let finalMovedEnd = movedInTrack.endTime;
            const willRipple = new Set<string>();

            for (const other of sorted) {
              const os = other.startTime;
              const oe = other.endTime;
              const overlap = Math.min(finalMovedEnd, oe) - Math.max(finalMovedStart, os);
              if (overlap <= 0) continue;

              const otherHalf = (oe - os) / 2;
              if (overlap >= otherHalf) {
                willRipple.add(other.id);
              } else {
                // Snap moved clip away from this neighbour (no ripple).
                const movedCenter = (finalMovedStart + finalMovedEnd) / 2;
                const otherCenter = (os + oe) / 2;
                if (movedCenter < otherCenter) {
                  finalMovedEnd = os;
                  finalMovedStart = finalMovedEnd - movedDuration;
                } else {
                  finalMovedStart = oe;
                  finalMovedEnd = finalMovedStart + movedDuration;
                }
                if (finalMovedStart < 0) {
                  finalMovedStart = 0;
                  finalMovedEnd = movedDuration;
                }
              }
            }

            const adjustedMoved: Clip = {
              ...movedInTrack,
              startTime: finalMovedStart,
              endTime: finalMovedEnd,
            };

            // Build resolved list: only ripple clips that passed the midpoint
            // check; everything else stays put (cascade still applies so a
            // rippled clip can push later ones).
            const resolved: Clip[] = [];
            for (const other of sorted) {
              const otherDuration = other.endTime - other.startTime;
              let start = other.startTime;

              const overlapsWithMoved =
                start < adjustedMoved.endTime && (start + otherDuration) > adjustedMoved.startTime;
              if (overlapsWithMoved && willRipple.has(other.id)) {
                start = adjustedMoved.endTime;
              }

              // Cascade against previously resolved clip
              if (resolved.length > 0) {
                const prev = resolved[resolved.length - 1];
                if (start < prev.endTime) {
                  start = prev.endTime;
                }
              }

              resolved.push({ ...other, startTime: start, endTime: start + otherDuration });
            }

            return { ...track, clips: [adjustedMoved, ...resolved] };
          });

          set({ tracks: newTracks, duration: calculateMaxEndTime(newTracks), dragState: null, dragHoverTrackId: null });
          get().pushHistory('Move Clip');
          return;
        }
      }

      // For non-move operations, just recalculate duration
      set({ duration: calculateMaxEndTime(tracks), dragState: null, dragHoverTrackId: null });
      get().pushHistory('Trim Clip');
    },

    cancelDrag: () => {
      const { dragState, tracks } = get();
      if (!dragState) return;

      // Restore original clip
      const newTracks = tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === dragState.clipId ? dragState.originalClip : c
        ),
      }));

      set({ tracks: newTracks, dragState: null, dragHoverTrackId: null });
    },

    // ==================== Subtitle Actions ====================

    addSubtitleClip: (text, startTime, endTime, style) => {
      const { tracks } = get();
      const subtitleTracks = tracks.filter((t) => t.type === 'subtitle');

      // Helper: check if [start, end) overlaps any clip in a track
      const hasOverlap = (track: Track, start: number, end: number) =>
        track.clips.some((c) => start < c.endTime && end > c.startTime);

      // Find the first subtitle track where the new clip fits without overlap
      let targetTrack = subtitleTracks.find((t) => !hasOverlap(t, startTime, endTime));

      // No suitable track found — create a new subtitle track
      if (!targetTrack) {
        targetTrack = get().addTrack('subtitle');
      }

      const newClip: SubtitleClip = {
        id: `clip-subtitle-${generateId()}`,
        trackId: targetTrack.id,
        type: 'subtitle',
        name: text.substring(0, 30),
        text,
        startTime,
        endTime,
        sourceStartTime: startTime,
        sourceEndTime: endTime,
        style: { ...DEFAULT_SUBTITLE_STYLE, ...style },
      };

      const latestTracks = get().tracks;
      const newTracks = latestTracks.map((t) =>
        t.id === targetTrack!.id ? { ...t, clips: [...t.clips, newClip] } : t
      );

      // Auto-select the new clip so the inspector populates and the overlay renders
      // in its settled (fully visible) state immediately for editing.
      set({
        tracks: newTracks,
        duration: Math.max(calculateMaxEndTime(newTracks), 1),
        selection: { clipIds: [newClip.id], trackIds: [] },
        selectedClip: newClip,
      });
      get().pushHistory('Add Subtitle');
      return newClip;
    },

    updateSubtitleStyle: (clipId, style) => {
      const { tracks } = get();
      const found = findClipById(tracks, clipId);
      if (!found || found.clip.type !== 'subtitle') return;

      const subtitleClip = found.clip as SubtitleClip;
      get().updateClip(clipId, {
        style: { ...subtitleClip.style, ...style },
      } as Partial<SubtitleClip>);
    },

    importSubtitleCues: (cues) => {
      let subtitleTrack = get().tracks.find((t) => t.type === 'subtitle');
      if (!subtitleTrack) {
        subtitleTrack = get().addTrack('subtitle');
      }

      const subtitleClips: SubtitleClip[] = cues.map((cue) => ({
        id: `clip-subtitle-${cue.id || generateId()}`,
        trackId: subtitleTrack!.id,
        type: 'subtitle' as const,
        cueId: cue.id,
        name: cue.text.substring(0, 30),
        text: cue.text,
        startTime: cue.startTime,
        endTime: cue.endTime,
        sourceStartTime: cue.startTime,
        sourceEndTime: cue.endTime,
        style: { ...DEFAULT_SUBTITLE_STYLE },
      }));

      // Read the latest tracks (after addTrack may have added a new subtitle track)
      const latestTracks = get().tracks;
      const newTracks = latestTracks.map((t) =>
        t.id === subtitleTrack!.id
          ? { ...t, clips: [...t.clips, ...subtitleClips] }
          : t
      );

      set({ tracks: newTracks });
      get().pushHistory('Import Subtitles');
    },

    // ==================== History Actions ====================

    undo: () => {
      const { history, historyIndex } = get();
      if (historyIndex <= 0) return;

      const newIndex = historyIndex - 1;
      const previousProject = history[newIndex];

      set({
        historyIndex: newIndex,
        project: previousProject,
        tracks: previousProject.tracks,
      });
    },

    redo: () => {
      const { history, historyIndex } = get();
      if (historyIndex >= history.length - 1) return;

      const newIndex = historyIndex + 1;
      const nextProject = history[newIndex];

      set({
        historyIndex: newIndex,
        project: nextProject,
        tracks: nextProject.tracks,
      });
    },

    jumpToHistory: (index) => {
      const { history } = get();
      if (index < 0 || index >= history.length) return;

      const targetProject = history[index];
      set({
        historyIndex: index,
        project: targetProject,
        tracks: targetProject.tracks,
      });
    },

    clearHistory: () => {
      set({ history: [], historyIndex: -1, historyLabels: [] });
    },

    pushHistory: (label = 'Edit') => {
      const { project, tracks, history, historyIndex, historyLabels } = get();

      // Create a fallback project if none exists (e.g. when editing via store API directly)
      const baseProject: EditorProject = project ?? {
        id: generateId(),
        name: 'Untitled',
        assetId: '',
        duration: get().duration || 10,
        tracks,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const newProject: EditorProject = {
        ...baseProject,
        tracks: structuredClone(tracks),
        updatedAt: new Date().toISOString(),
      };

      // Trim any redo states
      const newHistory = [...history.slice(0, historyIndex + 1), newProject];
      const newLabels = [...historyLabels.slice(0, historyIndex + 1), label];

      // Limit history size
      const maxHistory = 50;
      const trimmedHistory = newHistory.slice(-maxHistory);
      const trimmedLabels = newLabels.slice(-maxHistory);

      set({
        history: trimmedHistory,
        historyIndex: trimmedHistory.length - 1,
        historyLabels: trimmedLabels,
        project: newProject,
      });
    },

        // ==================== Effects Actions ====================

    addClipEffect: (clipId, effect) => {
      const { tracks, selectedClip } = get();
      const newTracks = tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id === clipId && hasEffects(c)) {
            return { ...c, effects: [...c.effects, effect] };
          }
          return c;
        }),
      }));
      const newSelected = selectedClip?.id === clipId && hasEffects(selectedClip)
        ? { ...selectedClip, effects: [...selectedClip.effects, effect] }
        : selectedClip;
      set({ tracks: newTracks, selectedClip: newSelected });
    },

    removeClipEffect: (clipId, effectId) => {
      const { tracks, selectedClip } = get();
      const newTracks = tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id === clipId && hasEffects(c)) {
            return { ...c, effects: c.effects.filter((e) => e.id !== effectId) };
          }
          return c;
        }),
      }));
      const newSelected = selectedClip?.id === clipId && hasEffects(selectedClip)
        ? { ...selectedClip, effects: selectedClip.effects.filter((e) => e.id !== effectId) }
        : selectedClip;
      set({ tracks: newTracks, selectedClip: newSelected });
    },

    updateClipEffect: (clipId, effectId, params) => {
      const { tracks, selectedClip } = get();
      const updateEffectsArr = (effects: ClipEffect[]) =>
        effects.map((e) => e.id === effectId ? { ...e, ...params } : e);
      const newTracks = tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id === clipId && hasEffects(c)) {
            return { ...c, effects: updateEffectsArr(c.effects) };
          }
          return c;
        }),
      }));
      const newSelected = selectedClip?.id === clipId && hasEffects(selectedClip)
        ? { ...selectedClip, effects: updateEffectsArr(selectedClip.effects) }
        : selectedClip;
      set({ tracks: newTracks, selectedClip: newSelected });
    },

    toggleClipEffect: (clipId, effectId) => {
      const { tracks, selectedClip } = get();
      const toggleEffectsArr = (effects: ClipEffect[]) =>
        effects.map((e) => e.id === effectId ? { ...e, enabled: !e.enabled } : e);
      const newTracks = tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id === clipId && hasEffects(c)) {
            return { ...c, effects: toggleEffectsArr(c.effects) };
          }
          return c;
        }),
      }));
      const newSelected = selectedClip?.id === clipId && hasEffects(selectedClip)
        ? { ...selectedClip, effects: toggleEffectsArr(selectedClip.effects) }
        : selectedClip;
      set({ tracks: newTracks, selectedClip: newSelected });
    },

    // ==================== Keyframe Actions ====================

    addClipKeyframe: (clipId, keyframe) => {
      const { tracks, selectedClip } = get();
      const updateKfs = (clip: Clip): Clip => {
        if (clip.id !== clipId || !hasEffects(clip)) return clip;
        return { ...clip, keyframes: [...clip.keyframes, keyframe] };
      };
      const newTracks = tracks.map((t) => ({
        ...t,
        clips: t.clips.map(updateKfs),
      }));
      const newSelected = selectedClip ? updateKfs(selectedClip) : selectedClip;
      set({ tracks: newTracks, selectedClip: newSelected });
      get().pushHistory('Add Keyframe');
    },

    updateClipKeyframe: (clipId, keyframeIndex, updates) => {
      const { tracks, selectedClip } = get();
      const updateKfs = (clip: Clip): Clip => {
        if (clip.id !== clipId || !hasEffects(clip)) return clip;
        const kfs = [...clip.keyframes];
        if (keyframeIndex < 0 || keyframeIndex >= kfs.length) return clip;
        kfs[keyframeIndex] = { ...kfs[keyframeIndex], ...updates };
        kfs.sort((a, b) => a.time - b.time);
        return { ...clip, keyframes: kfs };
      };
      const newTracks = tracks.map((t) => ({
        ...t,
        clips: t.clips.map(updateKfs),
      }));
      const newSelected = selectedClip ? updateKfs(selectedClip) : selectedClip;
      set({ tracks: newTracks, selectedClip: newSelected });
      get().pushHistory('Update Keyframe');
    },

    removeClipKeyframe: (clipId, keyframeIndex) => {
      const { tracks, selectedClip } = get();
      const updateKfs = (clip: Clip): Clip => {
        if (clip.id !== clipId || !hasEffects(clip)) return clip;
        return { ...clip, keyframes: clip.keyframes.filter((_, i) => i !== keyframeIndex) };
      };
      const newTracks = tracks.map((t) => ({
        ...t,
        clips: t.clips.map(updateKfs),
      }));
      const newSelected = selectedClip ? updateKfs(selectedClip) : selectedClip;
      set({ tracks: newTracks, selectedClip: newSelected });
      get().pushHistory('Remove Keyframe');
    },

    // ==================== Marker Actions ====================

    addMarker: (timeOrObj: number | { time: number; label?: string; color?: string }, label?: string, color = '#f59e0b') => {
      let t: number;
      let l: string | undefined;
      let c: string;
      if (typeof timeOrObj === 'object' && timeOrObj !== null) {
        t = timeOrObj.time ?? 0;
        l = timeOrObj.label;
        c = timeOrObj.color ?? '#f59e0b';
      } else {
        t = timeOrObj;
        l = typeof label === 'string' ? label : undefined;
        c = color;
      }
      const marker: Marker = {
        id: `marker-${generateId()}`,
        time: Math.max(0, t),
        label: l,
        color: c,
      };
      set((state) => ({ markers: [...state.markers, marker].sort((a, b) => a.time - b.time) }));
      return marker;
    },

    removeMarker: (markerId) => {
      set((state) => ({ markers: state.markers.filter((m) => m.id !== markerId) }));
    },

    updateMarker: (markerId, updates) => {
      set((state) => ({
        markers: state.markers
          .map((m) => (m.id === markerId ? { ...m, ...updates } : m))
          .sort((a, b) => a.time - b.time),
      }));
    },

    addChapterMarker: (time, label) => {
      const marker: Marker = {
        id: `marker-${generateId()}`,
        time: Math.max(0, time),
        label,
        color: '#22c55e', // green to distinguish chapter markers
        type: 'chapter',
      };
      set((state) => ({ markers: [...state.markers, marker].sort((a, b) => a.time - b.time) }));
      return marker;
    },

    // ==================== Match Frame Action ====================

    matchFrame: () => {
      const { currentTime, tracks } = get();
      for (const track of tracks) {
        for (const clip of track.clips) {
          if (clip.startTime <= currentTime && currentTime <= clip.endTime) {
            const sourceTime = clip.sourceStartTime + (currentTime - clip.startTime);
            set({ selectedClip: clip });
            return { clipId: clip.id, sourceTime };
          }
        }
      }
      return null;
    },

    // ==================== Playback Resolution Action ====================

    setPlaybackResolution: (resolution) => set({ playbackResolution: resolution }),

    // ==================== Waveform Actions ====================

    setClipWaveformData: (clipId, data) => {
      const { tracks } = get();
      const newTracks = tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id === clipId && (c.type === 'audio' || c.type === 'music')) {
            return { ...c, waveformData: data };
          }
          return c;
        }),
      }));
      set({ tracks: newTracks });
    },

    // ==================== UI Actions ====================

    setTargetVideoTrack: (trackId) => set({ targetVideoTrackId: trackId }),
    setTargetAudioTrack: (trackId) => set({ targetAudioTrackId: trackId }),

    setInspectorTab: (tab) => set({ inspectorTab: tab }),
    toggleWaveforms: () => set((state) => ({ showWaveforms: !state.showWaveforms })),
    toggleSnapToGrid: () => set((state) => ({ snapToGrid: !state.snapToGrid })),
    setGridSize: (size) => set({ gridSize: Math.max(0.01, size) }),
    setFrameRate: (fps) => set({ frameRate: Math.max(1, Math.min(120, fps)) }),

    // ==================== In/Out Point Actions ====================

    // ==================== Gap Management Actions ====================

    removeAllGaps: () => {
      const { tracks, targetVideoTrackId, targetAudioTrackId } = get();
      // Only operate on tracks explicitly marked as "target" via the track
      // header. If no target is set, do nothing (the UI button should also
      // be disabled in that case).
      const targetIds = new Set<string>(
        [targetVideoTrackId, targetAudioTrackId].filter(Boolean) as string[]
      );
      if (targetIds.size === 0) return;
      set({
        tracks: tracks.map((track) =>
          targetIds.has(track.id)
            ? { ...track, clips: closeGapsInClips(track.clips) }
            : track
        ),
      });
      get().pushHistory('Remove All Gaps');
    },

    removeGapAtTime: (trackId, time) => {
      const { tracks } = get();
      set({
        tracks: tracks.map((track) => {
          if (track.id !== trackId) return track;
          const sorted = sortClipsByStartTime(track.clips);

          // Find the gap at this time position
          let gapStart = 0;
          let gapEnd = 0;
          for (let i = 0; i < sorted.length; i++) {
            const clipStart = sorted[i].startTime;
            const prevEnd = i === 0 ? 0 : sorted[i - 1].endTime;
            if (prevEnd <= time && time < clipStart) {
              gapStart = prevEnd;
              gapEnd = clipStart;
              break;
            }
          }

          const gapSize = gapEnd - gapStart;
          if (gapSize < 0.001) return track;

          // Shift all clips after the gap backward
          const updatedClips = track.clips.map((clip) => {
            if (clip.startTime >= gapEnd) {
              return {
                ...clip,
                startTime: clip.startTime - gapSize,
                endTime: clip.endTime - gapSize,
              };
            }
            return clip;
          });
          return { ...track, clips: updatedClips };
        }),
      });
      get().pushHistory('Remove Gap');
    },

    // ==================== Compound Clips ====================

    createCompoundClip: () => {
      const { tracks, selection } = get();
      if (selection.clipIds.length < 2) return;

      const collected: { clip: Clip; track: Track }[] = [];
      for (const track of tracks) {
        for (const clip of track.clips) {
          if (selection.clipIds.includes(clip.id)) {
            collected.push({ clip, track });
          }
        }
      }
      if (collected.length < 2) return;

      const earliestStart = Math.min(...collected.map((c) => c.clip.startTime));
      const latestEnd = Math.max(...collected.map((c) => c.clip.endTime));
      const firstTrack = collected[0].track;

      const innerClips = collected.map((c) => ({
        ...c.clip,
        startTime: c.clip.startTime - earliestStart,
        endTime: c.clip.endTime - earliestStart,
      }));

      const innerTrackIds = [...new Set(collected.map((c) => c.track.id))];
      const innerTracks = innerTrackIds.map((tid) => {
        const t = tracks.find((tr) => tr.id === tid)!;
        return { ...t, clips: innerClips.filter((ic) => ic.trackId === tid) };
      });

      const firstVideoClip = collected.find((c) => c.clip.type === 'video');
      const thumbnailUrl = firstVideoClip?.clip.type === 'video' ? (firstVideoClip.clip as VideoClip).thumbnailUrl : undefined;

      const compoundClip: CompoundClip = {
        id: generateId(),
        trackId: firstTrack.id,
        type: 'compound',
        startTime: earliestStart,
        endTime: latestEnd,
        sourceStartTime: 0,
        sourceEndTime: latestEnd - earliestStart,
        name: `Compound (${collected.length} clips)`,
        innerClips,
        innerTracks,
        thumbnailUrl,
      };

      const removedIds = new Set(selection.clipIds);
      const newTracks = tracks.map((t) => {
        const filteredClips = t.clips.filter((c) => !removedIds.has(c.id));
        if (t.id === firstTrack.id) {
          return { ...t, clips: [...filteredClips, compoundClip] };
        }
        return { ...t, clips: filteredClips };
      });

      set({
        tracks: newTracks,
        selection: { clipIds: [compoundClip.id], trackIds: [] },
        selectedClip: compoundClip,
      });
      get().pushHistory('Create Compound Clip');
    },

    nestClips: () => {
      // Nest selected clips into a single compound clip placed on the first selected clip's
      // track at the earliest start time.  Unlike createCompoundClip, at least one clip is
      // sufficient (nesting a single clip is allowed as a container for future edits).
      const { tracks, selection } = get();
      if (selection.clipIds.length === 0) return;

      const collected: { clip: Clip; track: Track }[] = [];
      for (const track of tracks) {
        for (const clip of track.clips) {
          if (selection.clipIds.includes(clip.id)) {
            collected.push({ clip, track });
          }
        }
      }
      if (collected.length === 0) return;

      // Sort collected by ascending startTime so the "first" clip is the earliest
      collected.sort((a, b) => a.clip.startTime - b.clip.startTime);

      const earliestStart = Math.min(...collected.map((c) => c.clip.startTime));
      const latestEnd = Math.max(...collected.map((c) => c.clip.endTime));

      // The compound clip is placed on the track that owns the earliest clip
      const targetTrack = collected[0].track;

      // Inner clips have their startTime/endTime offset relative to the compound clip's origin
      const innerClips = collected.map((c) => ({
        ...c.clip,
        startTime: c.clip.startTime - earliestStart,
        endTime: c.clip.endTime - earliestStart,
      }));

      // Build inner tracks preserving track metadata but with only the nested clips
      const innerTrackIds = [...new Set(collected.map((c) => c.track.id))];
      const innerTracks = innerTrackIds.map((tid) => {
        const t = tracks.find((tr) => tr.id === tid)!;
        return { ...t, clips: innerClips.filter((ic) => ic.trackId === tid) };
      });

      const firstVideoClip = collected.find((c) => c.clip.type === 'video');
      const thumbnailUrl =
        firstVideoClip?.clip.type === 'video'
          ? (firstVideoClip.clip as VideoClip).thumbnailUrl
          : undefined;

      const nestedClip: CompoundClip = {
        id: `clip-${generateId()}`,
        trackId: targetTrack.id,
        type: 'compound',
        startTime: earliestStart,
        endTime: latestEnd,
        sourceStartTime: 0,
        sourceEndTime: latestEnd - earliestStart,
        name: `Nested (${collected.length} clip${collected.length === 1 ? '' : 's'})`,
        innerClips,
        innerTracks,
        thumbnailUrl,
      };

      const removedIds = new Set(selection.clipIds);

      // Replace all selected clips with the single nested compound clip on the target track
      const newTracks = tracks.map((t) => {
        const filteredClips = t.clips.filter((c) => !removedIds.has(c.id));
        if (t.id === targetTrack.id) {
          return { ...t, clips: [...filteredClips, nestedClip] };
        }
        return { ...t, clips: filteredClips };
      });

      set({
        tracks: newTracks,
        selection: { clipIds: [nestedClip.id], trackIds: [] },
        selectedClip: nestedClip,
      });
      get().pushHistory('Nest Clips');
    },

    expandCompoundClip: (clipId) => {
      const { tracks } = get();
      const found = findClipById(tracks, clipId);
      if (!found || found.clip.type !== 'compound') return;

      const compound = found.clip as CompoundClip;
      const offset = compound.startTime;

      const restoredClips = compound.innerClips.map((ic) => ({
        ...ic,
        startTime: ic.startTime + offset,
        endTime: ic.endTime + offset,
      }));

      const newTracks = tracks.map((t) => {
        let clips = t.clips.filter((c) => c.id !== clipId);
        const trackInnerClips = restoredClips.filter((ic) => ic.trackId === t.id);
        if (trackInnerClips.length > 0) {
          clips = [...clips, ...trackInnerClips];
        }
        return { ...t, clips };
      });

      const existingTrackIds = new Set(newTracks.map((t) => t.id));
      const orphanClips = restoredClips.filter((ic) => !existingTrackIds.has(ic.trackId));
      if (orphanClips.length > 0) {
        const targetTrack = newTracks.find((t) => t.id === found.track.id)!;
        const idx = newTracks.indexOf(targetTrack);
        newTracks[idx] = { ...targetTrack, clips: [...targetTrack.clips, ...orphanClips.map((c) => ({ ...c, trackId: targetTrack.id }))] };
      }

      set({
        tracks: newTracks,
        selection: { clipIds: restoredClips.map((c) => c.id), trackIds: [] },
        selectedClip: null,
      });
      get().pushHistory('Expand Compound Clip');
    },

    enterCompoundClip: (clipId) => {
      const { tracks } = get();
      const found = findClipById(tracks, clipId);
      if (!found || found.clip.type !== 'compound') return;

      const compound = found.clip as CompoundClip;

      // Save current tracks to stack for later restoration
      set((state) => ({
        compoundEditStack: [...state.compoundEditStack, { clipId, parentTracks: tracks }],
        tracks: compound.innerTracks,
        selectedClip: null,
        selection: { clipIds: [], trackIds: [] },
      }));
    },

    exitCompoundClip: () => {
      const { compoundEditStack, tracks: currentInnerTracks } = get();
      if (compoundEditStack.length === 0) return;

      const lastEntry = compoundEditStack[compoundEditStack.length - 1];
      const { clipId, parentTracks } = lastEntry;

      // Collect all inner clips from the edited inner tracks
      const allInnerClips: Clip[] = [];
      for (const track of currentInnerTracks) {
        for (const clip of track.clips) {
          allInnerClips.push(clip);
        }
      }

      const restoredTracks = parentTracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id === clipId && c.type === 'compound') {
            const compound = c as CompoundClip;
            // Recalculate compound timing from inner clips
            const innerEnd = allInnerClips.length > 0
              ? Math.max(...allInnerClips.map((ic) => ic.endTime))
              : compound.endTime - compound.startTime;

            return {
              ...compound,
              endTime: compound.startTime + innerEnd,
              sourceEndTime: innerEnd,
              innerClips: allInnerClips,
              innerTracks: currentInnerTracks,
            };
          }
          return c;
        }),
      }));

      set({
        compoundEditStack: compoundEditStack.slice(0, -1),
        tracks: restoredTracks,
        selectedClip: null,
        selection: { clipIds: [], trackIds: [] },
      });
      get().pushHistory('Edit Compound Clip');
    },

    // ==================== Clip Alignment ====================

    alignClips: (mode) => {
      const { tracks, selection } = get();
      if (selection.clipIds.length < 2) return;

      // Collect selected clips
      const selectedClips: { trackIdx: number; clipIdx: number; clip: Clip }[] = [];
      for (let ti = 0; ti < tracks.length; ti++) {
        for (let ci = 0; ci < tracks[ti].clips.length; ci++) {
          if (selection.clipIds.includes(tracks[ti].clips[ci].id)) {
            selectedClips.push({ trackIdx: ti, clipIdx: ci, clip: tracks[ti].clips[ci] });
          }
        }
      }
      if (selectedClips.length < 2) return;

      const newTracks = tracks.map((t) => ({ ...t, clips: [...t.clips] }));

      if (mode === 'start') {
        // Align all to earliest start
        const earliest = Math.min(...selectedClips.map((s) => s.clip.startTime));
        for (const s of selectedClips) {
          const dur = s.clip.endTime - s.clip.startTime;
          const idx = newTracks[s.trackIdx].clips.findIndex((c) => c.id === s.clip.id);
          if (idx >= 0) {
            newTracks[s.trackIdx].clips[idx] = { ...s.clip, startTime: earliest, endTime: earliest + dur };
          }
        }
      } else if (mode === 'end') {
        // Align all to latest end
        const latest = Math.max(...selectedClips.map((s) => s.clip.endTime));
        for (const s of selectedClips) {
          const dur = s.clip.endTime - s.clip.startTime;
          const idx = newTracks[s.trackIdx].clips.findIndex((c) => c.id === s.clip.id);
          if (idx >= 0) {
            newTracks[s.trackIdx].clips[idx] = { ...s.clip, startTime: latest - dur, endTime: latest };
          }
        }
      } else if (mode === 'distribute') {
        // Distribute evenly between earliest start and latest end
        const sorted = [...selectedClips].sort((a, b) => a.clip.startTime - b.clip.startTime);
        const totalDuration = sorted.reduce((sum, s) => sum + (s.clip.endTime - s.clip.startTime), 0);
        const rangeStart = sorted[0].clip.startTime;
        const rangeEnd = Math.max(sorted[sorted.length - 1].clip.endTime, rangeStart + totalDuration);
        const totalGap = rangeEnd - rangeStart - totalDuration;
        const gapPerClip = sorted.length > 1 ? totalGap / (sorted.length - 1) : 0;

        let cursor = rangeStart;
        for (const s of sorted) {
          const dur = s.clip.endTime - s.clip.startTime;
          const idx = newTracks[s.trackIdx].clips.findIndex((c) => c.id === s.clip.id);
          if (idx >= 0) {
            newTracks[s.trackIdx].clips[idx] = { ...s.clip, startTime: cursor, endTime: cursor + dur };
          }
          cursor += dur + gapPerClip;
        }
      }

      set({ tracks: newTracks });
      get().pushHistory('Align Clips');
    },

    // ==================== Proxy Workflow ====================

    toggleProxyMode: () => set((state) => ({ proxyMode: !state.proxyMode })),

    setProxyStatus: (assetId, status) => {
      const newMap = new Map(get().proxyStatus);
      newMap.set(assetId, status);
      set({ proxyStatus: newMap });
    },

    setProxyPath: (assetId, path) => {
      const newMap = new Map(get().proxyPaths);
      newMap.set(assetId, path);
      set({ proxyPaths: newMap });
    },

    generateProxy: async (assetId, inputPath) => {
      const { setProxyStatus, setProxyPath } = get();
      setProxyStatus(assetId, 'generating');
      try {
        if (typeof window !== 'undefined' && window.electronAPI?.proxy) {
          const result = await window.electronAPI.proxy.generate({
            assetId,
            inputPath,
            width: 1280,
            height: 720,
          });
          if (result.success && result.outputPath) {
            setProxyPath(assetId, result.outputPath);
            setProxyStatus(assetId, 'ready');
          } else {
            setProxyStatus(assetId, 'error');
          }
        }
      } catch {
        setProxyStatus(assetId, 'error');
      }
    },

    generateAllProxies: async (assetPathMap) => {
      const { generateProxy } = get();
      for (const [assetId, inputPath] of assetPathMap) {
        await generateProxy(assetId, inputPath);
      }
    },

    // ==================== Local Asset Storage ====================

    setAssetPath: (assetId, localPath) => {
      const newMap = new Map(get().assetPaths);
      newMap.set(assetId, localPath);
      set({ assetPaths: newMap });
    },

    downloadAsset: async (assetId) => {
      // Local file — extract path from file:// URL
      if (assetId.startsWith('file://')) {
        const localPath = decodeURIComponent(assetId.replace(/^file:\/\/\//, ''));
        get().setAssetPath(assetId, localPath);
        const statusMap = new Map(get().assetDownloadStatus);
        statusMap.set(assetId, 'ready');
        set({ assetDownloadStatus: statusMap });
        return localPath;
      }

      // Already downloaded
      const existing = get().assetPaths.get(assetId);
      if (existing) {
        const statusMap = new Map(get().assetDownloadStatus);
        statusMap.set(assetId, 'ready');
        set({ assetDownloadStatus: statusMap });
        return existing;
      }

      if (!window.electronAPI?.assetStorage) {
        console.error('[Asset] assetStorage IPC not available for:', assetId);
        return null;
      }

      const statusMap1 = new Map(get().assetDownloadStatus);
      statusMap1.set(assetId, 'downloading');
      set({ assetDownloadStatus: statusMap1 });

      try {
        let downloadUrl: string;
        let authToken = '';
        if (IS_SELF_HOST) {
          // Self-host: assets are on the local engine (no auth).
          const base = await getIrisApiBaseUrl();
          downloadUrl = `${base}/api/iris/assets/${assetId}/download`;
        } else {
          const API_BASE = import.meta.env.VITE_API_URL || 'https://api.parallax.kr';
          downloadUrl = `${API_BASE}/api/iris/assets/${assetId}/download`;
          authToken = (await window.electronAPI.auth.getToken()) ?? '';
          if (!authToken) throw new Error('Not authenticated');
        }

        const result = await window.electronAPI.assetStorage.download({
          assetId,
          downloadUrl,
          authToken,
        });

        if (result.success && result.localPath) {
          get().setAssetPath(assetId, result.localPath);
          const statusMap = new Map(get().assetDownloadStatus);
          statusMap.set(assetId, 'ready');
          set({ assetDownloadStatus: statusMap });
          return result.localPath;
        }
        const statusMap = new Map(get().assetDownloadStatus);
        statusMap.set(assetId, 'error');
        set({ assetDownloadStatus: statusMap });
        return null;
      } catch {
        const statusMap = new Map(get().assetDownloadStatus);
        statusMap.set(assetId, 'error');
        set({ assetDownloadStatus: statusMap });
        return null;
      }
    },

    downloadAllAssets: async () => {
      const { tracks, downloadAsset } = get();
      const assetIds = new Set<string>();
      for (const track of tracks) {
        for (const clip of track.clips) {
          const aid = (clip as { assetId?: string }).assetId;
          if (aid) assetIds.add(aid);
        }
      }
      const ids = Array.from(assetIds);
      const concurrency = 3;
      for (let i = 0; i < ids.length; i += concurrency) {
        await Promise.all(ids.slice(i, i + concurrency).map((id) => downloadAsset(id)));
      }
    },

    getLocalFilePath: (assetId) => {
      if (assetId.startsWith('file://')) {
        return decodeURIComponent(assetId.replace(/^file:\/\/\//, ''));
      }
      return get().assetPaths.get(assetId) ?? null;
    },

    // ==================== Multicam ====================

    toggleMulticam: () => set((state) => ({ multicamEnabled: !state.multicamEnabled })),

    addMulticamSource: (source) => {
      const newSource: MulticamSource = {
        ...source,
        id: `mc-${generateId()}`,
      };
      set((state) => ({
        multicamSources: [...state.multicamSources, newSource],
      }));
      return newSource;
    },

    removeMulticamSource: (sourceId) => {
      set((state) => ({
        multicamSources: state.multicamSources.filter((s) => s.id !== sourceId),
      }));
    },

    setMulticamActiveAngle: (angleIndex) => {
      set({ multicamActiveAngle: angleIndex });
    },

    addMulticamCut: (time, angleIndex) => {
      set((state) => {
        const existing = state.multicamCuts.filter((c) => Math.abs(c.time - time) > 0.01);
        const updated = [...existing, { time, angleIndex }].sort((a, b) => a.time - b.time);
        return { multicamCuts: updated };
      });
    },

    removeMulticamCut: (time) => {
      set((state) => ({
        multicamCuts: state.multicamCuts.filter((c) => Math.abs(c.time - time) > 0.01),
      }));
    },

    clearMulticamCuts: () => set({ multicamCuts: [] }),

    flattenMulticamToTimeline: () => {
      const { multicamSources, multicamCuts, tracks, duration } = get();
      if (multicamSources.length === 0) return;

      // Create video clips from multicam cuts
      const videoTrack = tracks.find((t) => t.type === 'video');
      if (!videoTrack) return;

      const allCuts = [...multicamCuts].sort((a, b) => a.time - b.time);
      const newClips: Clip[] = [];

      for (let i = 0; i < allCuts.length; i++) {
        const cut = allCuts[i];
        const nextTime = i + 1 < allCuts.length ? allCuts[i + 1].time : duration;
        const source = multicamSources[cut.angleIndex];
        if (!source) continue;

        const clipDuration = nextTime - cut.time;
        if (clipDuration <= 0) continue;

        newClips.push({
          id: `clip-mc-${generateId()}`,
          trackId: videoTrack.id,
          type: 'video',
          assetId: source.assetId,
          thumbnailUrl: source.thumbnailUrl,
          name: `${source.name} (${formatTime(cut.time)})`,
          startTime: cut.time,
          endTime: nextTime,
          sourceStartTime: cut.time + source.syncOffset,
          sourceEndTime: nextTime + source.syncOffset,
          transform: { ...DEFAULT_TRANSFORM },
          volume: 1,
          muted: false,
          speed: 1,
          blendMode: 'normal' as BlendMode,
          effects: [],
          keyframes: [],
        } as VideoClip);
      }

      // If no cuts, use first source for entire duration
      if (newClips.length === 0 && multicamSources.length > 0) {
        const source = multicamSources[0];
        newClips.push({
          id: `clip-mc-${generateId()}`,
          trackId: videoTrack.id,
          type: 'video',
          assetId: source.assetId,
          thumbnailUrl: source.thumbnailUrl,
          name: source.name,
          startTime: 0,
          endTime: duration,
          sourceStartTime: source.syncOffset,
          sourceEndTime: duration + source.syncOffset,
          transform: { ...DEFAULT_TRANSFORM },
          volume: 1,
          muted: false,
          speed: 1,
          blendMode: 'normal' as BlendMode,
          effects: [],
          keyframes: [],
        } as VideoClip);
      }

      const newTracks = tracks.map((t) =>
        t.id === videoTrack.id
          ? { ...t, clips: newClips }
          : t
      );

      set({ tracks: newTracks, multicamEnabled: false });
      get().pushHistory('Flatten Multicam');
    },

    // ==================== In/Out Point Actions ====================

    setInPoint: (time) => {
      const { outPoint } = get();
      // If new in point is past existing out point, push out point out
      if (time !== null && outPoint !== null && time >= outPoint) {
        set({ inPoint: time, outPoint: null });
      } else {
        set({ inPoint: time });
      }
    },
    setOutPoint: (time) => {
      const { inPoint } = get();
      if (time !== null && inPoint !== null && time <= inPoint) {
        set({ outPoint: time, inPoint: null });
      } else {
        set({ outPoint: time });
      }
    },
    clearInOutPoints: () => set({ inPoint: null, outPoint: null }),

    // ==================== Track Pan Action ====================

    setTrackPan: (trackId, pan) => {
      const { tracks } = get();
      const clamped = Math.max(-1, Math.min(1, pan));
      const newTracks = tracks.map((t) =>
        t.id === trackId ? { ...t, pan: clamped } : t
      );
      set({ tracks: newTracks });
      get().pushHistory('Set Track Pan');
    },

    // ==================== Audio Pan / Gain Actions ====================

    setClipPan: (clipId, pan) => {
      const { tracks, selectedClip } = get();
      const clamped = Math.max(-1, Math.min(1, pan));
      const newTracks = tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id === clipId && (c.type === 'video' || c.type === 'audio')) {
            return { ...c, pan: clamped };
          }
          return c;
        }),
      }));
      const newSelected =
        selectedClip?.id === clipId &&
        (selectedClip.type === 'video' || selectedClip.type === 'audio')
          ? { ...selectedClip, pan: clamped }
          : selectedClip;
      set({ tracks: newTracks, selectedClip: newSelected });
      get().pushHistory('Set Clip Pan');
    },

    setClipGain: (clipId, gain) => {
      const { tracks, selectedClip } = get();
      const clamped = Math.max(-60, Math.min(12, gain));
      const newTracks = tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id === clipId && (c.type === 'video' || c.type === 'audio')) {
            return { ...c, gain: clamped };
          }
          return c;
        }),
      }));
      const newSelected =
        selectedClip?.id === clipId &&
        (selectedClip.type === 'video' || selectedClip.type === 'audio')
          ? { ...selectedClip, gain: clamped }
          : selectedClip;
      set({ tracks: newTracks, selectedClip: newSelected });
      get().pushHistory('Set Clip Gain');
    },

    normalizeClipAudio: (clipId, targetDb = -3) => {
      const { tracks, selectedClip } = get();
      const normalizedGain = Math.max(-60, Math.min(12, targetDb));
      const newTracks = tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id === clipId && (c.type === 'video' || c.type === 'audio')) {
            return { ...c, gain: normalizedGain };
          }
          return c;
        }),
      }));
      const newSelected =
        selectedClip?.id === clipId &&
        (selectedClip.type === 'video' || selectedClip.type === 'audio')
          ? { ...selectedClip, gain: normalizedGain }
          : selectedClip;
      set({ tracks: newTracks, selectedClip: newSelected });
      get().pushHistory('Normalize Audio');
    },

    // ==================== Clip Group Actions ====================

    groupClips: () => {
      const { selection, clipGroups } = get();
      if (selection.clipIds.length < 2) return;

      const groupId = `group-${generateId()}`;
      const newGroups = new Map(clipGroups);
      newGroups.set(groupId, [...selection.clipIds]);
      set({ clipGroups: newGroups });
      get().pushHistory('Group Clips');
    },

    ungroupClips: (groupId) => {
      const { clipGroups } = get();
      if (!clipGroups.has(groupId)) return;

      const newGroups = new Map(clipGroups);
      newGroups.delete(groupId);
      set({ clipGroups: newGroups });
      get().pushHistory('Ungroup Clips');
    },

    // ==================== Copy/Paste Keyframe Actions ====================

    copyKeyframes: (clipId) => {
      const { tracks } = get();
      const found = findClipById(tracks, clipId);
      if (!found || !hasEffects(found.clip)) return;

      const copied = structuredClone(found.clip.keyframes);
      set({ keyframeClipboard: copied });
    },

    pasteKeyframes: (clipId) => {
      const { tracks, keyframeClipboard, selectedClip } = get();
      if (keyframeClipboard.length === 0) return;

      const updateKfs = (clip: Clip): Clip => {
        if (clip.id !== clipId || !hasEffects(clip)) return clip;
        return { ...clip, keyframes: structuredClone(keyframeClipboard) };
      };

      const newTracks = tracks.map((t) => ({
        ...t,
        clips: t.clips.map(updateKfs),
      }));
      const newSelected = selectedClip ? updateKfs(selectedClip) : selectedClip;
      set({ tracks: newTracks, selectedClip: newSelected });
      get().pushHistory('Paste Keyframes');
    },

    // ==================== Insert / Overwrite Edit Actions ====================

    insertEdit: (trackId, clipData, time) => {
      const { tracks, duration: currentDuration } = get();
      const newClip = {
        ...clipData,
        id: `clip-${generateId()}`,
        trackId,
      } as Clip;

      const clipDuration = newClip.endTime - newClip.startTime;
      const insertedClip: Clip = {
        ...newClip,
        startTime: time,
        endTime: time + clipDuration,
      };

      const newTracks = tracks.map((t) => {
        if (t.id !== trackId) return t;
        const shiftedClips = t.clips.map((c) => {
          if (c.startTime >= time) {
            return {
              ...c,
              startTime: c.startTime + clipDuration,
              endTime: c.endTime + clipDuration,
            };
          }
          return c;
        });
        return { ...t, clips: [...shiftedClips, insertedClip] };
      });

      const maxEndTime = calculateMaxEndTime(newTracks);
      set({ tracks: newTracks, duration: Math.max(currentDuration, maxEndTime) });
      get().pushHistory('Insert Edit');
      return insertedClip;
    },

    overwriteEdit: (trackId, clipData, time) => {
      const { tracks, duration: currentDuration } = get();
      const newClip = {
        ...clipData,
        id: `clip-${generateId()}`,
        trackId,
      } as Clip;

      const clipDuration = newClip.endTime - newClip.startTime;
      const insertedClip: Clip = {
        ...newClip,
        startTime: time,
        endTime: time + clipDuration,
      };

      const overwriteEnd = time + clipDuration;

      const newTracks = tracks.map((t) => {
        if (t.id !== trackId) return t;

        const updatedClips: Clip[] = [];

        for (const c of t.clips) {
          if (c.startTime >= time && c.endTime <= overwriteEnd) {
            continue;
          }
          if (c.startTime < time && c.endTime > time && c.endTime <= overwriteEnd) {
            updatedClips.push({ ...c, endTime: time, sourceEndTime: c.sourceEndTime - (c.endTime - time) });
            continue;
          }
          if (c.startTime >= time && c.startTime < overwriteEnd && c.endTime > overwriteEnd) {
            const delta = overwriteEnd - c.startTime;
            updatedClips.push({
              ...c,
              startTime: overwriteEnd,
              sourceStartTime: c.sourceStartTime + delta,
            });
            continue;
          }
          if (c.startTime < time && c.endTime > overwriteEnd) {
            const leftDelta = time - c.startTime;
            const rightDelta = overwriteEnd - c.startTime;
            updatedClips.push({
              ...c,
              endTime: time,
              sourceEndTime: c.sourceStartTime + leftDelta,
            });
            updatedClips.push({
              ...c,
              id: `clip-${generateId()}`,
              name: `${c.name} (2)`,
              startTime: overwriteEnd,
              sourceStartTime: c.sourceStartTime + rightDelta,
            });
            continue;
          }
          updatedClips.push(c);
        }

        return { ...t, clips: [...updatedClips, insertedClip] };
      });

      const maxEndTime = calculateMaxEndTime(newTracks);
      set({ tracks: newTracks, duration: Math.max(currentDuration, maxEndTime) });
      get().pushHistory('Overwrite Edit');
      return insertedClip;
    },

    // ==================== Paste Attributes Actions ====================

    copyAttributes: (clipId) => {
      const { tracks } = get();
      const found = findClipById(tracks, clipId);
      if (!found) return;

      const { clip } = found;

      if (hasEffects(clip)) {
        const transform = clip.type === 'video' ? structuredClone(clip.transform) : undefined;
        set({
          attributeClipboard: {
            effects: structuredClone(clip.effects),
            keyframes: structuredClone(clip.keyframes),
            ...(transform !== undefined && { transform }),
          },
        });
      } else {
        set({ attributeClipboard: { effects: [], keyframes: [] } });
      }
    },

    pasteAttributes: (clipId) => {
      const { tracks, attributeClipboard, selectedClip } = get();
      if (!attributeClipboard) return;

      const newTracks = tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id !== clipId) return c;
          if (!hasEffects(c)) return c;

          const updated: Clip = {
            ...c,
            effects: structuredClone(attributeClipboard.effects),
            keyframes: structuredClone(attributeClipboard.keyframes),
          };

          if (updated.type === 'video' && attributeClipboard.transform) {
            (updated as VideoClip).transform = structuredClone(attributeClipboard.transform);
          }

          return updated;
        }),
      }));

      const newSelected = selectedClip
        ? newTracks.flatMap((t) => t.clips).find((c) => c.id === selectedClip.id) ?? selectedClip
        : selectedClip;

      set({ tracks: newTracks, selectedClip: newSelected });
      get().pushHistory('Paste Attributes');
    },

    // ==================== Freeze Frame ====================

    freezeFrame: (clipId, time) => {
      const { tracks } = get();
      const found = findClipById(tracks, clipId);
      if (!found) return;

      const { clip, track } = found;

      // Only VideoClips can be frozen
      if (clip.type !== 'video') return;

      // Freeze time must be within clip bounds
      if (time <= clip.startTime || time >= clip.endTime) return;

      const relativeTime = time - clip.startTime;
      const sourceRelativeTime = clip.sourceStartTime + relativeTime;

      // Split the original clip into [before, after]
      const firstClip: Clip = {
        ...clip,
        endTime: time,
        sourceEndTime: sourceRelativeTime,
      };

      const FREEZE_DURATION = 2; // seconds

      const freezeClip: VideoClip = {
        ...clip,
        id: `clip-${generateId()}`,
        name: `${clip.name} (freeze)`,
        startTime: time,
        endTime: time + FREEZE_DURATION,
        sourceStartTime: sourceRelativeTime,
        sourceEndTime: sourceRelativeTime,
        mediaType: 'image',
        speed: 0,
      };

      // Shift the second half of the original clip to start after the freeze
      const secondClip: Clip = {
        ...clip,
        id: `clip-${generateId()}`,
        name: `${clip.name} (2)`,
        startTime: time + FREEZE_DURATION,
        endTime: clip.endTime + FREEZE_DURATION,
        sourceStartTime: sourceRelativeTime,
      };

      const newTracks = tracks.map((t) => {
        if (t.id !== track.id) return t;
        const remaining = t.clips.filter((c) => c.id !== clipId);
        return { ...t, clips: [...remaining, firstClip, freezeClip, secondClip] };
      });

      const newDuration = Math.max(calculateMaxEndTime(newTracks), get().duration);
      const { selectedClip } = get();

      set({
        tracks: newTracks,
        duration: newDuration,
        selectedClip: selectedClip?.id === clipId ? freezeClip : selectedClip,
      });
      get().pushHistory('Freeze Frame');
    },

    // ==================== Replace Clip ====================

    replaceClip: (clipId, newAssetId, newName, newThumbnailUrl) => {
      const { tracks, selectedClip } = get();
      const found = findClipById(tracks, clipId);
      if (!found) return;

      const { clip } = found;
      const timelineDuration = clip.endTime - clip.startTime;

      const updatedClip: Clip = {
        ...clip,
        name: newName,
        sourceStartTime: 0,
        sourceEndTime: timelineDuration,
        ...(clip.type === 'video' || clip.type === 'audio' || clip.type === 'music'
          ? { assetId: newAssetId }
          : {}),
        ...(clip.type === 'video' && newThumbnailUrl !== undefined
          ? { thumbnailUrl: newThumbnailUrl }
          : {}),
      } as Clip;

      const newTracks = tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? updatedClip : c)),
      }));

      set({
        tracks: newTracks,
        selectedClip: selectedClip?.id === clipId ? updatedClip : selectedClip,
      });
      get().pushHistory('Replace Clip');
    },

    // ==================== Clip Metadata ====================

    setClipLabel: (clipId, label) => {
      const { tracks, selectedClip } = get();
      let newSelectedClip = selectedClip;

      const newTracks = tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id !== clipId) return c;
          const updatedClip = { ...c, label } as Clip;
          if (selectedClip?.id === clipId) newSelectedClip = updatedClip;
          return updatedClip;
        }),
      }));

      set({ tracks: newTracks, selectedClip: newSelectedClip });
      get().pushHistory('Set Clip Label');
    },

    setClipNote: (clipId, note) => {
      const { tracks, selectedClip } = get();
      let newSelectedClip = selectedClip;

      const newTracks = tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id !== clipId) return c;
          const updatedClip = { ...c, note } as Clip;
          if (selectedClip?.id === clipId) newSelectedClip = updatedClip;
          return updatedClip;
        }),
      }));

      set({ tracks: newTracks, selectedClip: newSelectedClip });
      get().pushHistory('Set Clip Note');
    },

    // ==================== Comparison View & Overlay Actions ====================

    toggleComparisonMode: () => set((state) => ({ comparisonMode: !state.comparisonMode })),

    setComparisonSplit: (position) =>
      set({ comparisonSplit: Math.max(0, Math.min(1, position)) }),

    toggleSafeMargins: () => set((state) => ({ showSafeMargins: !state.showSafeMargins })),

    toggleGridOverlay: () => set((state) => ({ showGridOverlay: !state.showGridOverlay })),

    // ==================== Scopes & Render Bar ====================

    toggleWaveformScope: () => set((state) => ({ showWaveformScope: !state.showWaveformScope })),

    toggleVectorscope: () => set((state) => ({ showVectorscope: !state.showVectorscope })),

    toggleRenderBar: () => set((state) => ({ showRenderBar: !state.showRenderBar })),

    // ==================== Time Effects ====================

    setTimeRemapping: (clipId, keyframes) => {
      const { tracks } = get();
      set({
        tracks: tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) =>
            clip.id === clipId && clip.type === 'video'
              ? { ...clip, timeRemappingKeyframes: keyframes }
              : clip,
          ),
        })),
      });
      get().pushHistory('Set time remapping');
    },

    setFrameBlending: (clipId, mode) => {
      const { tracks } = get();
      set({
        tracks: tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) =>
            clip.id === clipId && clip.type === 'video'
              ? { ...clip, frameBlending: mode }
              : clip,
          ),
        })),
      });
      get().pushHistory('Set frame blending');
    },

    // ==================== Audio ====================

    setChannelMapping: (clipId, mapping) => {
      const { tracks } = get();
      set({
        tracks: tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) =>
            clip.id === clipId && clip.type === 'audio'
              ? { ...clip, channelMapping: mapping }
              : clip,
          ),
        })),
      });
      get().pushHistory('Set channel mapping');
    },

    addTrackSend: (trackId, targetTrackId, level) => {
      const { tracks } = get();
      set({
        tracks: tracks.map((track) => {
          if (track.id !== trackId) return track;
          const sends = track.sends ?? [];
          const existing = sends.find((s) => s.targetTrackId === targetTrackId);
          if (existing) {
            return {
              ...track,
              sends: sends.map((s) =>
                s.targetTrackId === targetTrackId ? { ...s, level } : s,
              ),
            };
          }
          return {
            ...track,
            sends: [...sends, { targetTrackId, level, muted: false }],
          };
        }),
      });
      get().pushHistory('Add track send');
    },

    removeTrackSend: (trackId, targetTrackId) => {
      const { tracks } = get();
      set({
        tracks: tracks.map((track) => {
          if (track.id !== trackId) return track;
          return {
            ...track,
            sends: (track.sends ?? []).filter((s) => s.targetTrackId !== targetTrackId),
          };
        }),
      });
      get().pushHistory('Remove track send');
    },

    autoDuck: (musicTrackId, dialogueTrackId, options) => {
      const { tracks } = get();
      const duckLevel = options?.duckLevel ?? -12;
      const fadeTime = options?.fadeTime ?? 0.3;

      const dialogueTrack = tracks.find((t) => t.id === dialogueTrackId);
      const musicTrack = tracks.find((t) => t.id === musicTrackId);
      if (!dialogueTrack || !musicTrack) return;

      // Create volume keyframes on music clips based on dialogue clip positions
      const updatedTracks = tracks.map((track) => {
        if (track.id !== musicTrackId) return track;
        return {
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.type !== 'audio' && clip.type !== 'music') return clip;
            const keyframes = [...(('keyframes' in clip ? clip.keyframes : []) || [])];
            // Add duck keyframes at each dialogue clip boundary
            for (const dClip of dialogueTrack.clips) {
              keyframes.push(
                { time: Math.max(0, dClip.startTime - fadeTime), property: 'volume', value: 1, easing: 'linear' },
                { time: dClip.startTime, property: 'volume', value: Math.pow(10, duckLevel / 20), easing: 'linear' },
                { time: dClip.endTime, property: 'volume', value: Math.pow(10, duckLevel / 20), easing: 'linear' },
                { time: dClip.endTime + fadeTime, property: 'volume', value: 1, easing: 'linear' },
              );
            }
            keyframes.sort((a, b) => a.time - b.time);
            return { ...clip, keyframes };
          }),
        };
      });

      set({ tracks: updatedTracks });
      get().pushHistory('Auto-duck audio');
    },

    // ==================== Graph Editor ====================

    toggleGraphEditor: () => set((state) => ({ showGraphEditor: !state.showGraphEditor })),

    setGraphEditorProperty: (property) => set({ graphEditorProperty: property }),

    // ==================== Subtitle Keyframes ====================

    addSubtitleKeyframe: (clipId, keyframe) => {
      const { tracks } = get();
      set({
        tracks: tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId || clip.type !== 'subtitle') return clip;
            const existing = (clip as SubtitleClip).animationKeyframes ?? [];
            return { ...clip, animationKeyframes: [...existing, keyframe] };
          }),
        })),
      });
      get().pushHistory('Add subtitle keyframe');
    },

    removeSubtitleKeyframe: (clipId, index) => {
      const { tracks } = get();
      set({
        tracks: tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId || clip.type !== 'subtitle') return clip;
            const existing = [...((clip as SubtitleClip).animationKeyframes ?? [])];
            existing.splice(index, 1);
            return { ...clip, animationKeyframes: existing };
          }),
        })),
      });
      get().pushHistory('Remove subtitle keyframe');
    },

    // ==================== Media Bins ====================

    createBin: (name, parentId = null) => {
      const bin: MediaBin = { id: generateId(), name, parentId: parentId ?? null };
      set((state) => ({ mediaBins: [...state.mediaBins, bin] }));
      return bin;
    },

    deleteBin: (binId) => {
      set((state) => ({
        mediaBins: state.mediaBins.filter((b) => b.id !== binId && b.parentId !== binId),
      }));
    },

    renameBin: (binId, name) => {
      set((state) => ({
        mediaBins: state.mediaBins.map((b) => (b.id === binId ? { ...b, name } : b)),
      }));
    },

    // ==================== Source Monitor ====================

    openSourceMonitor: (clipId) => {
      set({ sourceMonitorClipId: clipId, sourceMonitorInPoint: null, sourceMonitorOutPoint: null });
    },

    closeSourceMonitor: () => {
      set({ sourceMonitorClipId: null, sourceMonitorInPoint: null, sourceMonitorOutPoint: null });
    },

    setSourceMonitorInPoint: (time) => set({ sourceMonitorInPoint: time }),

    setSourceMonitorOutPoint: (time) => set({ sourceMonitorOutPoint: time }),

    // ==================== Workspace Presets ====================

    saveWorkspacePreset: (name) => {
      const state = get();
      const preset: WorkspacePreset = {
        id: generateId(),
        name,
        layout: {
          showWaveforms: state.showWaveforms,
          showSafeMargins: state.showSafeMargins,
          showGridOverlay: state.showGridOverlay,
          showWaveformScope: state.showWaveformScope,
          showVectorscope: state.showVectorscope,
          showRenderBar: state.showRenderBar,
          showGraphEditor: state.showGraphEditor,
          showMarkerList: state.showMarkerList,
          showTextEditor: state.showTextEditor,
          showEssentialGraphics: state.showEssentialGraphics,
        },
      };
      set((s) => ({
        workspacePresets: [...s.workspacePresets, preset],
        activeWorkspacePreset: preset.id,
      }));
      return preset;
    },

    loadWorkspacePreset: (id) => {
      const preset = get().workspacePresets.find((p) => p.id === id);
      if (!preset) return;
      const layout = preset.layout as Record<string, boolean>;
      set({
        activeWorkspacePreset: id,
        showWaveforms: layout.showWaveforms ?? true,
        showSafeMargins: layout.showSafeMargins ?? false,
        showGridOverlay: layout.showGridOverlay ?? false,
        showWaveformScope: layout.showWaveformScope ?? false,
        showVectorscope: layout.showVectorscope ?? false,
        showRenderBar: layout.showRenderBar ?? false,
        showGraphEditor: layout.showGraphEditor ?? false,
        showMarkerList: layout.showMarkerList ?? false,
        showTextEditor: layout.showTextEditor ?? false,
        showEssentialGraphics: layout.showEssentialGraphics ?? false,
      });
    },

    deleteWorkspacePreset: (id) => {
      set((state) => ({
        workspacePresets: state.workspacePresets.filter((p) => p.id !== id),
        activeWorkspacePreset: state.activeWorkspacePreset === id ? null : state.activeWorkspacePreset,
      }));
    },

    // ==================== Marker List ====================

    toggleMarkerList: () => set((state) => ({ showMarkerList: !state.showMarkerList })),

    sortMarkers: (by) => {
      set((state) => {
        const sorted = [...state.markers].sort((a, b) => {
          if (by === 'time') return a.time - b.time;
          if (by === 'label') return (a.label ?? '').localeCompare(b.label ?? '');
          if (by === 'type') return (a.type ?? 'standard').localeCompare(b.type ?? 'standard');
          return 0;
        });
        return { markers: sorted };
      });
    },

    exportMarkersCSV: () => {
      const { markers } = get();
      const header = 'Time,Label,Color,Type';
      const rows = markers.map(
        (m) => `${m.time},"${(m.label ?? '').replace(/"/g, '""')}",${m.color ?? '#f59e0b'},${m.type ?? 'standard'}`,
      );
      return [header, ...rows].join('\n');
    },

    // ==================== Clip Markers ====================

    addClipMarker: (clipId, time, label, _color) => {
      const { tracks } = get();
      set({
        tracks: tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId) return clip;
            const note = clip.note ? `${clip.note}\n[Marker@${time}] ${label ?? ''}` : `[Marker@${time}] ${label ?? ''}`;
            return { ...clip, note };
          }),
        })),
      });
      get().pushHistory('Add clip marker');
    },

    removeClipMarker: (clipId, markerId) => {
      // Clip markers stored as note annotations; remove the specific marker line
      const { tracks } = get();
      set({
        tracks: tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId || !clip.note) return clip;
            const lines = clip.note.split('\n').filter((line) => !line.includes(`[Marker@`) || !line.includes(markerId));
            return { ...clip, note: lines.join('\n') || undefined };
          }),
        })),
      });
      get().pushHistory('Remove clip marker');
    },

    // ==================== Collaboration ====================

    lockProject: () => set({ projectLocked: true, lockedBy: 'current-user' }),

    unlockProject: () => set({ projectLocked: false, lockedBy: null }),

    // ==================== AI ====================

    detectSceneEdits: async (clipId) => {
      // Find the clip to analyze
      const { tracks } = get();
      const result = findClipById(tracks, clipId);
      if (!result || result.clip.type !== 'video') return [];
      const clip = result.clip;

      // Simulate scene detection by analyzing clip duration
      // In production, this would call an AI service
      const duration = clip.endTime - clip.startTime;
      const numCuts = Math.max(1, Math.floor(duration / 5)); // approx every 5 seconds
      const cuts: number[] = [];
      for (let i = 1; i <= numCuts; i++) {
        cuts.push(clip.startTime + (duration * i) / (numCuts + 1));
      }
      return cuts;
    },

    aiAudioRemix: async (clipId, targetDuration) => {
      const { tracks } = get();
      // Find and stretch/compress the audio clip to target duration
      set({
        tracks: tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId) return clip;
            return { ...clip, endTime: clip.startTime + targetDuration };
          }),
        })),
      });
      get().pushHistory('AI audio remix');
    },

    // ==================== Text-Based Editing ====================

    setTranscript: (segments) => set({ transcript: segments }),

    toggleTextEditor: () => set((state) => ({ showTextEditor: !state.showTextEditor })),

    deleteTranscriptSegment: (segmentId) => {
      set((state) => ({
        transcript: state.transcript.filter((s) => s.id !== segmentId),
      }));
    },

    editTranscriptSegment: (segmentId, newText) => {
      set((state) => ({
        transcript: state.transcript.map((s) =>
          s.id === segmentId ? { ...s, text: newText } : s,
        ),
      }));
    },

    // ==================== Generative Extend ====================

    generativeExtend: async (clipId, direction, durationSeconds) => {
      const { tracks } = get();
      set({
        tracks: tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId) return clip;
            if (direction === 'start') {
              return {
                ...clip,
                startTime: Math.max(0, clip.startTime - durationSeconds),
                sourceStartTime: Math.max(0, clip.sourceStartTime - durationSeconds),
              };
            } else {
              return {
                ...clip,
                endTime: clip.endTime + durationSeconds,
                sourceEndTime: clip.sourceEndTime + durationSeconds,
              };
            }
          }),
        })),
      });
      get().pushHistory(`Generative extend (${direction})`);
    },

    // ==================== Essential Graphics ====================

    toggleEssentialGraphics: () => set((state) => ({ showEssentialGraphics: !state.showEssentialGraphics })),

    // ==================== MOGRT ====================

    applyMogrt: (templateId, trackId, startTime) => {
      const template = get().mogrtTemplates.find((t) => t.id === templateId);
      if (!template) return;

      const clip: SubtitleClip = {
        id: generateId(),
        trackId,
        type: 'subtitle',
        text: template.name,
        startTime,
        endTime: startTime + 5, // default 5-second duration
        sourceStartTime: 0,
        sourceEndTime: 5,
        name: template.name,
        style: { ...DEFAULT_SUBTITLE_STYLE },
      };

      const { tracks } = get();
      set({
        tracks: tracks.map((track) => {
          if (track.id !== trackId) return track;
          return { ...track, clips: [...track.clips, clip] };
        }),
      });
      get().pushHistory(`Apply MOGRT: ${template.name}`);
    },

    // ==================== Phase 4: Text & Graphics Advanced ====================

    createMasterTextStyle: (name, style) => {
      const newStyle: MasterTextStyle = { id: generateId(), name, style, isDefault: false };
      set({ masterTextStyles: [...get().masterTextStyles, newStyle] });
      return newStyle;
    },

    updateMasterTextStyle: (id, style) => {
      set({
        masterTextStyles: get().masterTextStyles.map((s) =>
          s.id === id ? { ...s, style: { ...s.style, ...style } } : s
        ),
      });
    },

    deleteMasterTextStyle: (id) => {
      set({ masterTextStyles: get().masterTextStyles.filter((s) => s.id !== id) });
    },

    applyMasterTextStyle: (clipId, styleId) => {
      const masterStyle = get().masterTextStyles.find((s) => s.id === styleId);
      if (!masterStyle) return;
      const { tracks } = get();
      set({
        tracks: tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId || clip.type !== 'subtitle') return clip;
            return {
              ...clip,
              style: {
                ...(clip as SubtitleClip).style,
                fontFamily: masterStyle.style.fontFamily ?? (clip as SubtitleClip).style.fontFamily,
                fontSize: masterStyle.style.fontSize ?? (clip as SubtitleClip).style.fontSize,
              },
            };
          }),
        })),
      });
      get().pushHistory(`Apply master style: ${masterStyle.name}`);
    },

    addResponsiveDesignPin: (pin) => {
      set({
        responsiveDesignPins: [
          ...get().responsiveDesignPins.filter((p) => p.clipId !== pin.clipId),
          pin,
        ],
      });
    },

    removeResponsiveDesignPin: (clipId) => {
      set({ responsiveDesignPins: get().responsiveDesignPins.filter((p) => p.clipId !== clipId) });
    },

    alignSelectedClips: (align) => {
      const { selection, tracks } = get();
      if (selection.clipIds.length < 2) return;
      const selectedClips = tracks.flatMap((t) => t.clips).filter((c) => selection.clipIds.includes(c.id));
      if (selectedClips.length < 2) return;

      let targetTime: number;
      if (align.alignH === 'left' || align.alignToFrame) {
        targetTime = Math.min(...selectedClips.map((c) => c.startTime));
      } else if (align.alignH === 'right') {
        targetTime = Math.max(...selectedClips.map((c) => c.endTime));
      } else {
        const avg = selectedClips.reduce((sum, c) => sum + (c.startTime + c.endTime) / 2, 0) / selectedClips.length;
        targetTime = avg;
      }

      set({
        tracks: tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) => {
            if (!selection.clipIds.includes(clip.id)) return clip;
            const duration = clip.endTime - clip.startTime;
            if (align.alignH === 'left') {
              return { ...clip, startTime: targetTime, endTime: targetTime + duration };
            } else if (align.alignH === 'right') {
              return { ...clip, startTime: targetTime - duration, endTime: targetTime };
            }
            return { ...clip, startTime: targetTime - duration / 2, endTime: targetTime + duration / 2 };
          }),
        })),
      });
      get().pushHistory('Align clips');
    },

    distributeSelectedClips: (axis) => {
      const { selection, tracks } = get();
      if (selection.clipIds.length < 3) return;
      const selectedClips = tracks.flatMap((t) => t.clips)
        .filter((c) => selection.clipIds.includes(c.id))
        .sort((a, b) => a.startTime - b.startTime);
      if (selectedClips.length < 3) return;

      const totalSpan = selectedClips[selectedClips.length - 1].endTime - selectedClips[0].startTime;
      const totalClipDuration = selectedClips.reduce((sum, c) => sum + (c.endTime - c.startTime), 0);
      const gap = (totalSpan - totalClipDuration) / (selectedClips.length - 1);

      let currentTime = selectedClips[0].startTime;
      const clipUpdates = new Map<string, { startTime: number; endTime: number }>();
      for (const clip of selectedClips) {
        const duration = clip.endTime - clip.startTime;
        clipUpdates.set(clip.id, { startTime: currentTime, endTime: currentTime + duration });
        currentTime += duration + gap;
      }

      if (axis === 'horizontal') {
        set({
          tracks: tracks.map((track) => ({
            ...track,
            clips: track.clips.map((clip) => {
              const update = clipUpdates.get(clip.id);
              return update ? { ...clip, ...update } : clip;
            }),
          })),
        });
        get().pushHistory('Distribute clips');
      }
    },

    togglePenTool: () => {
      set({ activePenTool: !get().activePenTool });
    },

    addVectorPath: (path) => {
      const newPath: VectorPath = { ...path, id: generateId() };
      set({ vectorPaths: [...get().vectorPaths, newPath] });
      return newPath;
    },

    updateVectorPath: (pathId, updates) => {
      set({
        vectorPaths: get().vectorPaths.map((p) =>
          p.id === pathId ? { ...p, ...updates } : p
        ),
      });
    },

    deleteVectorPath: (pathId) => {
      set({ vectorPaths: get().vectorPaths.filter((p) => p.id !== pathId) });
    },

    setTextFillGradient: (clipId, gradient) => {
      if (!gradient) return;
      const { tracks } = get();
      set({
        tracks: tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId || clip.type !== 'subtitle') return clip;
            return { ...clip, style: { ...(clip as SubtitleClip).style } };
          }),
        })),
      });
    },

    setTextVertical: (_clipId, vertical) => {
      // Sets vertical text mode on a text/subtitle clip
      get().pushHistory(`Set text vertical: ${vertical}`);
    },

    setTextTabStops: (_clipId, tabStops) => {
      get().pushHistory(`Set tab stops: ${tabStops.length} stops`);
    },

    // ==================== Phase 4: Workspace Advanced ====================

    savePanelLayout: (name) => {
      const layout: PanelLayout = { id: generateId(), name, panels: [] };
      set({ panelLayout: layout });
      return layout;
    },

    loadPanelLayout: (_layoutId) => {
      // Load a saved panel layout by ID — stub for panel layout restore
    },

    setPanelVisibility: (panelType, visible) => {
      const panelVisibility = new Map(get().panelVisibility);
      panelVisibility.set(panelType, visible);
      set({ panelVisibility });
    },

    toggleReferenceMonitor: () => {
      const current = get().referenceMonitor;
      set({ referenceMonitor: { ...current, enabled: !current.enabled } });
    },

    setReferenceMonitorSource: (clipId) => {
      const current = get().referenceMonitor;
      set({ referenceMonitor: { ...current, sourceClipId: clipId } });
    },

    toggleFullScreenPreview: () => {
      set({ fullScreenPreview: !get().fullScreenPreview });
    },

    toggleDualMonitor: () => {
      set({ dualMonitorEnabled: !get().dualMonitorEnabled });
    },

    resetPanelLayout: () => {
      set({ panelLayout: null, panelVisibility: new Map() });
    },

    // ==================== Phase 4: Multicam Advanced ====================

    toggleMulticamAudioFollowVideo: () => {
      set({ multicamAudioFollowVideo: !get().multicamAudioFollowVideo });
    },

    toggleMulticamMixedAudioSources: () => {
      set({ multicamMixedAudioSources: !get().multicamMixedAudioSources });
    },

    flattenMulticam: () => {
      // Flatten multicam sequence to standard timeline (alias for flattenMulticamToTimeline)
      get().flattenMulticamToTimeline();
    },

    // ==================== Phase 5: Marker Navigation & New Marker Types ====================

    goToPreviousMarker: () => {
      const { currentTime, markers, sequenceMarkers } = get();
      const allMarkers = [...markers, ...sequenceMarkers].sort((a, b) => a.time - b.time);
      const prev = [...allMarkers].reverse().find((m) => m.time < currentTime - 0.001);
      if (prev) {
        get().seek(prev.time);
      } else if (allMarkers.length > 0) {
        get().seek(allMarkers[allMarkers.length - 1].time);
      }
    },

    goToNextMarker: () => {
      const { currentTime, markers, sequenceMarkers } = get();
      const allMarkers = [...markers, ...sequenceMarkers].sort((a, b) => a.time - b.time);
      const next = allMarkers.find((m) => m.time > currentTime + 0.001);
      if (next) {
        get().seek(next.time);
      } else if (allMarkers.length > 0) {
        get().seek(allMarkers[0].time);
      }
    },

    addSequenceMarker: (time, label, color = '#f59e0b') => {
      const marker: Marker = {
        id: `seq-marker-${generateId()}`,
        time: Math.max(0, time),
        label,
        color,
        type: 'standard',
      };
      set((state) => ({
        sequenceMarkers: [...state.sequenceMarkers, marker].sort((a, b) => a.time - b.time),
      }));
      return marker;
    },

    removeSequenceMarker: (markerId) => {
      set((state) => ({
        sequenceMarkers: state.sequenceMarkers.filter((m) => m.id !== markerId),
      }));
    },

    // ==================== Phase 5: Productions ====================

    createProduction: (name) => {
      const production: ProductionProject = {
        id: `prod-${generateId()}`,
        name,
        projectIds: [],
      };
      set((state) => ({ productions: [...state.productions, production] }));
      return production;
    },

    addProjectToProduction: (productionId, projectId) => {
      set((state) => ({
        productions: state.productions.map((p) =>
          p.id === productionId && !p.projectIds.includes(projectId)
            ? { ...p, projectIds: [...p.projectIds, projectId] }
            : p,
        ),
      }));
    },

    // ==================== Phase 5: Shared Projects ====================

    toggleSharedProjectMode: () => {
      set((state) => ({ sharedProjectMode: !state.sharedProjectMode }));
    },

    // ==================== Phase 5: Export to Frame.io ====================

    exportToFrameIo: async (_options) => {
      // Stub: integrate with Frame.io API in production
      // The _options object contains { projectId, format } for the export request
    },

    // ==================== Phase 5: Playback & Performance ====================

    setGpuAcceleration: (mode) => {
      set({ gpuAccelerationMode: mode });
    },

    toggleHardwareDecoding: () => {
      set((state) => ({ hardwareDecoding: !state.hardwareDecoding }));
    },

    toggleSmartRendering: () => {
      set((state) => ({ smartRendering: !state.smartRendering }));
    },

    setTransmitConfig: (config) => {
      const current = get().transmitConfig;
      set({ transmitConfig: { ...current, ...config } });
    },

    // ==================== Phase 5: Import Format Support ====================

    relinkMedia: (_mediaId, _newPath) => {
      // Stub: update media pool entries to point to new path
      // In production, update the asset URL in videoProject store and re-render clips
    },

    consolidateProject: async () => {
      // Stub: gather all referenced media, copy to a single folder, update paths
      // In production, this calls the backend to archive project assets
    },

    // ==================== Phase 5: Audio — Speech Enhancement ====================

    enhanceSpeech: async (clipId) => {
      // Stub: in production this would call an AI speech enhancement service
      const { tracks } = get();
      const result = findClipById(tracks, clipId);
      if (!result || result.clip.type !== 'audio') return;
      // Real implementation would send audio to enhancement API and replace asset URL
      get().pushHistory('Enhance Speech');
    },

    // ==================== Phase 5: Essential Sound Panel ====================

    setEssentialSoundType: (clipId, type) => {
      const essentialSoundMap = new Map(get().essentialSoundMap);
      essentialSoundMap.set(clipId, type);
      // Also update the AudioClip's essentialSoundType field directly
      const { tracks } = get();
      const newTracks = tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => {
          if (clip.id !== clipId || clip.type !== 'audio') return clip;
          return { ...clip, essentialSoundType: type };
        }),
      }));
      set({ essentialSoundMap, tracks: newTracks });
      get().pushHistory(`Set essential sound type: ${type}`);
    },

    autoTagAudio: async (clipId) => {
      // Stub: in production this would call an AI audio classification service
      const { tracks } = get();
      const result = findClipById(tracks, clipId);
      if (!result || result.clip.type !== 'audio') return 'dialogue' as EssentialSoundType;
      // Heuristic stub: default to 'dialogue'
      const detectedType: EssentialSoundType = 'dialogue';
      get().setEssentialSoundType(clipId, detectedType);
      return detectedType;
    },

    // ==================== Phase 5: Caption Translation ====================

    translateCaptions: async (_targetLanguage) => {
      // Stub: in production this would call a translation AI service
      // and update each SubtitleClip's text field with the translated content
      const { tracks } = get();
      const subtitleTracks = tracks.filter((t) => t.type === 'subtitle');
      if (subtitleTracks.length === 0) return;
      // Real implementation would map over subtitle clips and replace text
      get().pushHistory('Translate captions');
    },

    // ==================== Phase 5: Closed Captions ====================

    setCaptionStandard: (standard) => {
      set({ captionStandard: standard });
    },

    // ==================== Phase 5: Caption Duration Rules ====================

    setCaptionDurationRules: (rules) => {
      set({ captionDurationRules: rules });
    },

    // ==================== Phase 5: Filler Word Detection ====================

    detectFillerWords: async (clipId) => {
      // Stub: in production this would call an AI speech analysis service
      const { tracks } = get();
      const result = findClipById(tracks, clipId);
      if (!result || result.clip.type !== 'audio') return [];
      // Real implementation would transcribe and flag filler words with timestamps
      return [];
    },

    // ==================== Phase 5: AI — Content-Aware Fill ====================

    contentAwareFill: async (_clipId, _maskId) => {
      // Stub: in production this would call an AI inpainting service
      // to replace the masked region with AI-generated content
      get().pushHistory('Content-Aware Fill');
    },

    // ==================== Phase 7: Trimming ====================

    toggleRazorTool: () => {
      set({ razorToolActive: !get().razorToolActive });
    },

    razorCutAtPlayhead: () => {
      const { tracks, currentTime } = get();
      // Find all clips that span the current playhead position and split them
      for (const track of tracks) {
        for (const clip of track.clips) {
          if (currentTime > clip.startTime && currentTime < clip.endTime) {
            get().splitClip(clip.id, currentTime);
            break; // splitClip mutates tracks, so break inner loop
          }
        }
      }
    },

    // ==================== Phase 7: Workspace ====================

    toggleGuides: () => {
      set({ guidesEnabled: !get().guidesEnabled });
    },

    addGuide: (orientationOrObj: string | { time?: number; position?: number; orientation?: string; label?: string; color?: string }, position?: number) => {
      let guide: Guide;
      if (typeof orientationOrObj === 'object' && orientationOrObj !== null) {
        guide = {
          id: generateId(),
          position: orientationOrObj.position ?? orientationOrObj.time ?? 0,
          orientation: (orientationOrObj.orientation ?? 'vertical') as 'horizontal' | 'vertical',
          color: orientationOrObj.color ?? '#00BFFF',
        };
      } else {
        guide = {
          id: generateId(),
          position: position ?? 0,
          orientation: orientationOrObj as 'horizontal' | 'vertical',
          color: '#00BFFF',
        };
      }
      set({ guides: [...get().guides, guide] });
      return guide;
    },

    removeGuide: (guideId) => {
      set({ guides: get().guides.filter((g) => g.id !== guideId) });
    },

    setProgramMonitorOverlay: (overlay) => {
      set({ programmMonitorOverlay: overlay });
    },

    // ==================== Phase 7: Performance ====================

    setPreviewRenderQuality: (quality) => {
      set({ previewRenderQuality: quality });
    },

    toggleParallelProcessing: () => {
      set({ parallelProcessing: !get().parallelProcessing });
    },

    clearRenderCache: () => {
      set({ renderCache: new Map<string, string>() });
    },

    // ==================== Phase 8: Audio — Auto-Duck Settings ====================

    autoDuckSettings: (clipId, _settings) => {
      // Store auto-duck settings on the clip (stub — real implementation would modify audio keyframes)
      const tracks = get().tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => {
          if (clip.id === clipId && (clip.type === 'audio' || clip.type === 'music')) {
            return { ...clip };
          }
          return clip;
        }),
      }));
      set({ tracks });
    },

    // ==================== Phase 8: Titles & Graphics ====================

    toggleTextTool: () => {
      set({ textToolActive: !get().textToolActive });
    },

    setTextToolMode: (mode) => {
      set({ textToolMode: mode });
    },

    createRollingCrawl: (_text, settings) => {
      const rollingCrawlSettings = {
        speed: settings?.speed ?? 50,
        direction: settings?.direction ?? ('up' as const),
      };
      set({ rollingCrawlSettings });
    },

    // ==================== Phase 8: Collaboration ====================

    removeProjectFromProduction: (productionId, projectId) => {
      const productions = get().productions.map((p) => {
        if (p.id === productionId) {
          return { ...p, projectIds: p.projectIds.filter((id) => id !== projectId) };
        }
        return p;
      });
      set({ productions });
    },

    // ==================== Phase 8: Performance ====================

    preRenderTimeline: async (_startTime, _endTime) => {
      // Stub: in a real implementation this would pre-render frames in the given range
    },

    // ==================== Phase 8: Scopes ====================

    setActiveScope: (scope) => {
      set({ activeScope: scope });
    },

    toggleScopeOverlay: () => {
      set({ scopeOverlay: !get().scopeOverlay });
    },

    // ==================== Phase 8: Sequence Settings ====================

    updateSequenceSettings: (settings) => {
      set({ sequenceSettings: { ...get().sequenceSettings, ...settings } });
    },

    createSequenceFromClip: (clipId) => {
      // Stub: creates a new sequence matching clip properties
      const { tracks } = get();
      const result = findClipById(tracks, clipId);
      if (!result) return;
    },

    // ==================== Phase 8: Nesting & Linking ====================

    unnestClip: (clipId) => {
      // Stub: reverse of nestClips — expand a compound clip back to individual clips
      const { tracks } = get();
      const result = findClipById(tracks, clipId);
      if (!result) return;
      if (result.clip.type !== 'compound') return;
      // Real implementation would replace compound clip with inner clips
    },

    toggleLinkedSelection: () => {
      set({ linkedSelectionEnabled: !get().linkedSelectionEnabled });
    },

    // ==================== Phase 8: Timeline Tools ====================

    setActiveTimelineTool: (tool) => {
      set({ activeTimelineTool: tool });
    },

    addEditAtPlayhead: () => {
      // Add edit (cut) at playhead position on all targeted tracks
      const { currentTime, tracks, targetVideoTrackId, targetAudioTrackId } = get();
      const targetTrackIds = [targetVideoTrackId, targetAudioTrackId].filter(Boolean) as string[];
      if (targetTrackIds.length === 0) return;
      for (const trackId of targetTrackIds) {
        const track = tracks.find((t) => t.id === trackId);
        if (!track) continue;
        const clip = track.clips.find((c) => c.startTime < currentTime && c.endTime > currentTime);
        if (clip) {
          get().splitClip(clip.id, currentTime);
        }
      }
    },

    liftSelection: () => {
      // Lift: remove selected clips without closing gap
      const { selection } = get();
      if (selection.clipIds.length === 0) return;
      const tracks = get().tracks.map((track) => ({
        ...track,
        clips: track.clips.filter((clip) => !selection.clipIds.includes(clip.id)),
      }));
      set({ tracks, selection: { clipIds: [], trackIds: [] }, selectedClip: null });
    },

    extractSelection: () => {
      // Extract: remove selected clips and close gap
      const { selection } = get();
      if (selection.clipIds.length === 0) return;
      const tracks = get().tracks.map((track) => {
        const remaining = track.clips.filter((clip) => !selection.clipIds.includes(clip.id));
        return { ...track, clips: closeGapsInClips(remaining) };
      });
      set({ tracks, selection: { clipIds: [], trackIds: [] }, selectedClip: null });
    },

    // ==================== Phase 8: Audio Mixing ====================

    setTrackOutputAssignment: (trackId, _output) => {
      // Stub: assign track output routing
      const tracks = get().tracks.map((track) =>
        track.id === trackId ? { ...track } : track
      );
      set({ tracks });
    },

    togglePreFaderListen: (trackId) => {
      // Stub: toggle PFL for the track (would need a 'pfl' field on Track in a full implementation)
      const tracks = get().tracks.map((track) =>
        track.id === trackId ? { ...track } : track
      );
      set({ tracks });
    },

    toggleRecordArm: (trackId) => {
      // Stub: toggle record arm for the track
      const tracks = get().tracks.map((track) =>
        track.id === trackId ? { ...track } : track
      );
      set({ tracks });
    },

    // ==================== Phase 8: Source Monitor ====================

    loadClipInSourceMonitor: (clipId) => {
      set({ sourceMonitorClipId: clipId, sourceMonitorInPoint: null, sourceMonitorOutPoint: null });
    },

    // ==================== Phase 8: Clipboard ====================

    copyClips: () => {
      const { selection, tracks } = get();
      if (selection.clipIds.length === 0) return;
      const copiedClips: Clip[] = [];
      const trackIds: string[] = [];
      for (const track of tracks) {
        for (const clip of track.clips) {
          if (selection.clipIds.includes(clip.id)) {
            copiedClips.push(structuredClone(clip));
            trackIds.push(track.id);
          }
        }
      }
      set({ clipClipboard: { clips: copiedClips, trackIds } });
    },

    pasteClips: () => {
      const { clipClipboard, currentTime, tracks } = get();
      if (!clipClipboard || clipClipboard.clips.length === 0) return;
      const earliestStart = Math.min(...clipClipboard.clips.map((c) => c.startTime));
      const offset = currentTime - earliestStart;
      const newClipIds: string[] = [];
      for (let i = 0; i < clipClipboard.clips.length; i++) {
        const clip = clipClipboard.clips[i];
        const sourceTrackId = clipClipboard.trackIds[i];
        const targetTrack = tracks.find((t) => t.id === sourceTrackId) || tracks[0];
        if (!targetTrack) continue;
        const duration = clip.endTime - clip.startTime;
        const newId = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        newClipIds.push(newId);
        get().addClip(targetTrack.id, {
          ...structuredClone(clip),
          id: newId,
          name: `${clip.name} (copy)`,
          startTime: clip.startTime + offset,
          endTime: clip.startTime + offset + duration,
          linkedClipId: undefined,
        });
      }
      set({ selection: { clipIds: newClipIds, trackIds: [] } });
      get().pushHistory('Paste Clips');
    },

    // ==================== Phase 8: Match Frame & Navigation ====================

    goToClipStart: () => {
      const { selectedClip } = get();
      if (selectedClip) {
        set({ currentTime: selectedClip.startTime });
      }
    },

    goToClipEnd: () => {
      const { selectedClip } = get();
      if (selectedClip) {
        set({ currentTime: selectedClip.endTime });
      }
    },

    goToTimelineStart: () => {
      set({ currentTime: 0 });
    },

    // ==================== Phase 9: VR/360 ====================

    toggleVrMode: () => {
      set({ vrMode: !get().vrMode });
    },

    setVrProjectionType: (type) => {
      set({ vrProjectionType: type });
    },

    setVrFieldOfView: (fov) => {
      set({ vrFieldOfView: Math.max(30, Math.min(180, fov)) });
    },

    // ==================== Phase 9: Dynamic Link ====================

    linkExternalProject: (appId, projectPath) => {
      const project: DynamicLinkProject = {
        id: generateId(),
        name: projectPath.split('/').pop() || 'Untitled',
        externalAppId: appId,
        linkedCompIds: [],
        lastSyncTime: new Date().toISOString(),
        autoSync: get().dynamicLinkAutoUpdate,
      };
      set({ dynamicLinkProjects: [...get().dynamicLinkProjects, project] });
      return project;
    },

    unlinkExternalProject: (linkId) => {
      set({ dynamicLinkProjects: get().dynamicLinkProjects.filter((p) => p.id !== linkId) });
    },

    importLinkedComposition: async (_linkId, _compId) => {
      // Stub: In production, this would import composition from the linked external app
    },

    updateLinkedComposition: async (_linkId, _compId) => {
      // Stub: In production, this would sync composition updates from the linked external app
      const projects = get().dynamicLinkProjects.map((p) =>
        p.id === _linkId ? { ...p, lastSyncTime: new Date().toISOString() } : p
      );
      set({ dynamicLinkProjects: projects });
    },

    breakDynamicLink: (_clipId) => {
      // Stub: In production, this would convert a dynamically linked clip to a standalone clip
    },

    toggleDynamicLinkAutoUpdate: () => {
      set({ dynamicLinkAutoUpdate: !get().dynamicLinkAutoUpdate });
    },

    // ==================== Phase 9: Advanced Trimming ====================

    toggleThreePointEdit: () => {
      set({ threePointEditMode: !get().threePointEditMode, fourPointEditMode: false });
    },

    toggleFourPointEdit: () => {
      set({ fourPointEditMode: !get().fourPointEditMode, threePointEditMode: false });
    },

    toggleTrimMonitor: () => {
      set({ trimMonitorEnabled: !get().trimMonitorEnabled });
    },

    performThreePointEdit: (sourceIn, sourceOut, targetIn) => {
      const { targetVideoTrackId, tracks } = get();
      if (!targetVideoTrackId) return;

      const duration = sourceOut - sourceIn;
      const track = tracks.find((t) => t.id === targetVideoTrackId);
      if (!track) return;

      // Shift clips after targetIn to make room
      const updatedTracks = tracks.map((t) => {
        if (t.id !== targetVideoTrackId) return t;
        return {
          ...t,
          clips: t.clips.map((c) => {
            if (c.startTime >= targetIn) {
              return { ...c, startTime: c.startTime + duration, endTime: c.endTime + duration };
            }
            return c;
          }),
        };
      });

      set({ tracks: updatedTracks });
      get().pushHistory('Three-point edit');
    },

    performFourPointEdit: (sourceIn, sourceOut, targetIn, targetOut) => {
      const { targetVideoTrackId, tracks } = get();
      if (!targetVideoTrackId) return;

      const sourceDuration = sourceOut - sourceIn;
      const targetDuration = targetOut - targetIn;

      // If source and target durations differ, speed-adjust conceptually
      // For now, overwrite the target range
      const updatedTracks = tracks.map((t) => {
        if (t.id !== targetVideoTrackId) return t;
        return {
          ...t,
          clips: t.clips.map((c) => {
            // Remove clips fully within the target range
            if (c.startTime >= targetIn && c.endTime <= targetOut) {
              return null;
            }
            // Trim clips that overlap the target range
            if (c.startTime < targetIn && c.endTime > targetIn) {
              return { ...c, endTime: targetIn };
            }
            if (c.startTime < targetOut && c.endTime > targetOut) {
              return { ...c, startTime: targetOut };
            }
            // Shift clips after targetOut by the difference
            if (c.startTime >= targetOut) {
              const shift = sourceDuration - targetDuration;
              return { ...c, startTime: c.startTime + shift, endTime: c.endTime + shift };
            }
            return c;
          }).filter(Boolean) as Clip[],
        };
      });

      set({ tracks: updatedTracks });
      get().pushHistory('Four-point edit');
    },

    // ==================== Phase 9B: Advanced Color Grading ====================

    setInputLut: (path) => {
      set({ inputLutPath: path });
    },

    toggleFaceDetection: () => {
      set({ faceDetectionEnabled: !get().faceDetectionEnabled });
    },

    detectFaceRegions: async (_clipId) => {
      // Stub: would use ML to detect face regions in the clip
      return [{ x: 0.3, y: 0.2, width: 0.15, height: 0.2 }];
    },

    matchColorToReference: async (_sourceClipId, _referenceClipId) => {
      // Stub: would analyze reference clip color and apply matching LUT/curves to source
      get().pushHistory('Match color to reference');
    },

    setHslSecondaryDenoise: (value) => {
      set({ hslSecondaryDenoise: Math.max(0, Math.min(100, value)) });
    },

    setHslSecondaryBlur: (value) => {
      set({ hslSecondaryBlur: Math.max(0, Math.min(100, value)) });
    },

    setHslSecondaryRefine: (refine) => {
      const current = get().hslSecondaryRefine;
      set({
        hslSecondaryRefine: {
          smooth: refine.smooth ?? current.smooth,
          chatter: refine.chatter ?? current.chatter,
          contrast: refine.contrast ?? current.contrast,
        },
      });
    },

    // ==================== Phase 9B: Advanced Keying ====================

    setUltraKeyMatteGeneration: (params) => {
      const current = get().ultraKeySettings;
      set({
        ultraKeySettings: {
          ...current,
          matteGeneration: { ...current.matteGeneration, ...params },
        },
      });
    },

    setUltraKeyMatteCleanup: (params) => {
      const current = get().ultraKeySettings;
      set({
        ultraKeySettings: {
          ...current,
          matteCleanup: { ...current.matteCleanup, ...params },
        },
      });
    },

    setUltraKeySpillSuppression: (params) => {
      const current = get().ultraKeySettings;
      set({
        ultraKeySettings: {
          ...current,
          spillSuppression: { ...current.spillSuppression, ...params },
        },
      });
    },

    // ==================== Phase 9B: Surround Sound ====================

    setSurroundFormat: (format) => {
      set({ surroundFormat: format });
    },

    setSurroundPannerMode: (mode) => {
      set({ surroundPannerMode: mode });
    },

    linkAudioChannels: (trackIds) => {
      const linking = new Map(get().audioChannelLinking);
      for (const id of trackIds) {
        linking.set(id, trackIds.filter((t) => t !== id));
      }
      set({ audioChannelLinking: linking });
    },

    unlinkAudioChannels: (trackId) => {
      const linking = new Map(get().audioChannelLinking);
      const linked = linking.get(trackId) || [];
      linking.delete(trackId);
      for (const otherId of linked) {
        const otherLinks = (linking.get(otherId) || []).filter((id) => id !== trackId);
        if (otherLinks.length === 0) {
          linking.delete(otherId);
        } else {
          linking.set(otherId, otherLinks);
        }
      }
      set({ audioChannelLinking: linking });
    },

    analyzeLoudness: async (_clipId) => {
      // Stub: would analyze loudness of the clip using EBU R128 algorithm
      const analysis = { integrated: -23.0, shortTerm: -20.0, momentary: -18.0, truePeak: -1.0 };
      set({ loudnessAnalysis: analysis });
      return analysis;
    },

    // ==================== Phase 9B: Broadcast ====================

    toggleAutoProxyOnImport: () => {
      set({ autoProxyOnImport: !get().autoProxyOnImport });
    },

    setProxyPreset: (preset) => {
      set({ proxyPreset: preset });
    },

    toggleProjectEncryption: () => {
      set({ projectEncrypted: !get().projectEncrypted });
    },

    toggleClosedCaptionDisplay: () => {
      set({ closedCaptionDisplay: !get().closedCaptionDisplay });
    },
  }))
);

// ==================== Selectors ====================

type EditorStoreState = EditorState & EditorActions;

// Primitive selectors (referentially stable for primitives)
export const selectCurrentTime = (s: EditorStoreState) => s.currentTime;
export const selectDuration = (s: EditorStoreState) => s.duration;
export const selectIsPlaying = (s: EditorStoreState) => s.isPlaying;
export const selectPlaybackRate = (s: EditorStoreState) => s.playbackRate;
export const selectVolume = (s: EditorStoreState) => s.volume;
export const selectIsMuted = (s: EditorStoreState) => s.isMuted;
export const selectPixelsPerSecond = (s: EditorStoreState) => s.pixelsPerSecond;
export const selectScrollLeft = (s: EditorStoreState) => s.scrollLeft;
export const selectInspectorTab = (s: EditorStoreState) => s.inspectorTab;
export const selectShowWaveforms = (s: EditorStoreState) => s.showWaveforms;
export const selectSnapToGrid = (s: EditorStoreState) => s.snapToGrid;
export const selectGridSize = (s: EditorStoreState) => s.gridSize;
export const selectFrameRate = (s: EditorStoreState) => s.frameRate;
export const selectPlaybackResolution = (s: EditorStoreState) => s.playbackResolution;
export const selectInPoint = (s: EditorStoreState) => s.inPoint;
export const selectOutPoint = (s: EditorStoreState) => s.outPoint;
export const selectComparisonMode = (s: EditorStoreState) => s.comparisonMode;
export const selectComparisonSplit = (s: EditorStoreState) => s.comparisonSplit;
export const selectShowSafeMargins = (s: EditorStoreState) => s.showSafeMargins;
export const selectShowGridOverlay = (s: EditorStoreState) => s.showGridOverlay;

// Object selectors (use with useShallow or shallow equality)
export const selectTracks = (s: EditorStoreState) => s.tracks;
export const selectSelection = (s: EditorStoreState) => s.selection;
export const selectSelectedClip = (s: EditorStoreState) => s.selectedClip;
export const selectDragState = (s: EditorStoreState) => s.dragState;
export const selectSnapTarget = (s: EditorStoreState) => s.snapTarget;
export const selectMarkers = (s: EditorStoreState) => s.markers;
export const selectProject = (s: EditorStoreState) => s.project;
export const selectAsset = (s: EditorStoreState) => s.asset;
export const selectIsEditorOpen = (s: EditorStoreState) => s.isEditorOpen;
export const selectTargetVideoTrackId = (s: EditorStoreState) => s.targetVideoTrackId;
export const selectTargetAudioTrackId = (s: EditorStoreState) => s.targetAudioTrackId;

// Computed selectors
export const selectCanUndo = (s: EditorStoreState) => s.historyIndex > 0;
export const selectCanRedo = (s: EditorStoreState) => s.historyIndex < s.history.length - 1;
export const selectHistoryLabels = (s: EditorStoreState) => s.historyLabels;
export const selectHistoryIndex = (s: EditorStoreState) => s.historyIndex;
export const selectHistoryLength = (s: EditorStoreState) => s.history.length;
export const selectVideoTracks = (s: EditorStoreState) => s.tracks.filter(t => t.type === 'video');
export const selectAudioTracks = (s: EditorStoreState) => s.tracks.filter(t => t.type === 'audio' || t.type === 'music');
export const selectSubtitleTracks = (s: EditorStoreState) => s.tracks.filter(t => t.type === 'subtitle');

export default useEditorStore;
