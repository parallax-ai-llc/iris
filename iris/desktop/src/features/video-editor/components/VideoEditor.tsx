/**
 * VideoEditor - Main editor layout component
 * Adobe Premiere-style integrated video editor with multi-track timeline
 *
 * Layout:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ [Preview Panel]          │  [Inspector Panel]                   │
 * │ ┌─────────────────────┐  │  ┌──────────────────────────────┐   │
 * │ │   Video Preview     │  │  │ Properties / Effects          │   │
 * │ │   (with subtitles)  │  │  │ - Position, Scale, Rotation   │   │
 * │ └─────────────────────┘  │  │ - Subtitle styling            │   │
 * ├──────────────────────────┴─────────────────────────────────────┤
 * │ [Playhead Controls]                                             │
 * │ [Timeline Panel - Multi-track]                                  │
 * │ │ Video Track    │████████████│                                │
 * │ │ Audio Track    │▁▂▃▄▅▆▇█▇▆▅▄▃│                               │
 * │ │ Subtitle Track │ cue1 │ cue2 │                               │
 * │ │ Music Track    │░░░░░░░░░░░░│                                │
 * └─────────────────────────────────────────────────────────────────┘
 */

import { memo, useEffect, useCallback, useState, useRef } from 'react';
import { Upload, Type, Captions, Sliders, KeyRound, Camera, Zap } from 'lucide-react';
import { LOWER_THIRD_PRESETS, LOWER_THIRD_CATEGORIES, type LowerThirdPreset } from '@/features/video-editor/lib/lowerThirdPresets';
import { cn } from '@/shared/lib/utils';
import { useEditorStore, type Track } from '@/features/video-editor/stores/editor.store';
import { useVideoStore } from '@/features/videos/stores/video.store';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import { useLibraryStore } from '@/features/library/stores/library.store';
import type { IrisAsset } from '@/shared/api/types';
import { IS_SELF_HOST } from '@/config/self-host';
import { assetDownloadUrl } from '@/shared/api/iris-local';
import { EditorPreview } from './EditorPreview';
import { EditorInspector } from './EditorInspector';
import { EditorTimeline } from './EditorTimeline';
import { PlayheadControls } from './PlayheadControls';
import { MediaPanel } from './MediaPanel';
import { EffectsPanel } from './EffectsPanel';
import { createClipEffectFromDefinition, getEffectDefId } from '@/shared/lib/utils/effectUtils';
import { KeyframeEditor } from './KeyframeEditor';
import { EditorHeader } from './EditorHeader';
import { HistoryPanel } from './HistoryPanel';
import { TranscriptPanel } from './TranscriptPanel';
import { AutoCaptionsModal } from './AutoCaptionsModal';
import { AutoCutModal } from './modals/AutoCutModal';
import { AutoReframeModal } from './modals/AutoReframeModal';
import { SourceMonitorModal } from './SourceMonitorModal';
import {
  VideoUpscaleModal,
  VideoMotionControlModal,
  VideoInpaintModal,
  VideoCutModal,
} from './modals';
import { AudioMixerPanel } from './AudioMixerPanel';
import { LumetriColorPanel } from './LumetriColorPanel';
import { MulticamMonitor } from './MulticamMonitor';
import { KeyboardShortcutsModal } from './modals/KeyboardShortcutsModal';
import { ExportModal, type ExportOptions } from './modals/ExportModal';
import { ImportMediaModal, type LocalFileImport } from './modals/ImportMediaModal';
import { toLocalMediaUrl } from './modals/localMediaUrl';
import { ProxyGenerationModal } from './modals/ProxyGenerationModal';
import { ProxyQueueIndicator } from './ProxyQueueIndicator';
import { usePreRenderGate } from '@/features/video-editor/hooks/usePreRenderGate';
import { VideoEditorChatPanel } from './Chat/VideoEditorChatPanel';

// Allowed file types for drag-and-drop import
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/flac'];
const ALL_ALLOWED_TYPES = [...ALLOWED_VIDEO_TYPES, ...ALLOWED_IMAGE_TYPES, ...ALLOWED_AUDIO_TYPES];

export interface VideoEditorProps {
  /** Asset ID for the video (used for URL resolution) */
  assetId?: string;
  /** Video file URL to edit (fallback, deprecated) */
  videoUrl?: string;
  /** Video thumbnail URL */
  thumbnailUrl?: string;
  /** Video duration in seconds */
  duration: number;
  /** Video title/name */
  title?: string;
  /** Initial subtitle data (optional) */
  initialSubtitles?: Array<{
    id: string;
    text: string;
    startTime: number;
    endTime: number;
  }>;
  /** Callback when editor is closed */
  onClose?: () => void;
  /** Callback when project is saved */
  onSave?: (projectData: EditorProjectData) => void;
  /** Callback when video is exported */
  onExport?: (exportOptions: ExportOptions) => void;
  /** Hide the built-in header (when menu bar is in TitleBar) */
  hideHeader?: boolean;
  /** External control to open the export modal */
  openExportModal?: boolean;
  /** Callback when export modal state changes */
  onExportModalChange?: (open: boolean) => void;
  /** Additional CSS class */
  className?: string;
  /** Open the project-level silence removal modal (lives in VideoEditorPage). */
  onOpenSilenceRemoval?: () => void;
}

export interface EditorProjectData {
  tracks: Track[];
  duration: number;
  settings: {
    snapToGrid: boolean;
    pixelsPerSecond: number;
  };
}

export type { ExportOptions } from './modals/ExportModal';


export const VideoEditor = memo(function VideoEditor({
  assetId,
  videoUrl,
  thumbnailUrl,
  duration,
  title,
  initialSubtitles,
  onClose,
  onSave,
  onExport,
  hideHeader,
  openExportModal,
  onExportModalChange,
  className,
  onOpenSilenceRemoval,
}: VideoEditorProps) {
  // Resolve the actual asset ID - prefer explicit assetId, fallback to legacy videoUrl
  const resolvedAssetId = assetId || videoUrl || '';
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showExport, _setShowExport] = useState(false);
  const setShowExport = useCallback((open: boolean) => {
    _setShowExport(open);
    onExportModalChange?.(open);
  }, [onExportModalChange]);
  const [showImport, setShowImport] = useState(false);
  const [showAutoCaptions, setShowAutoCaptions] = useState(false);
  const [showAutoCut, setShowAutoCut] = useState(false);
  const [showAutoReframe, setShowAutoReframe] = useState(false);
  // Sync export modal with external control
  useEffect(() => {
    if (openExportModal !== undefined && openExportModal !== showExport) {
      _setShowExport(openExportModal);
    }
  }, [openExportModal, showExport]);

  // Pre-rendered asset ID for AI tools operating on multi-clip projects
  const [prerenderAssetId, setPrerenderAssetId] = useState<string | null>(null);
  const [sourceMonitorMedia, setSourceMonitorMedia] = useState<import('@/types/videoProject.types').ProjectMedia | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [leftPanelTab, setLeftPanelTab] = useState<'media' | 'effects' | 'color' | 'history' | 'transcript'>('media');
  const [showKeyframes, setShowKeyframes] = useState(false);
  const [showMixer, setShowMixer] = useState(false);
  const [showMulticam, setShowMulticam] = useState(false);

  // Clipboard for copy/paste
  const clipboardRef = useRef<import('@/features/video-editor/stores/editor.store').Clip | null>(null);

  // File drag-and-drop state
  const [isFileDragging, setIsFileDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // Resizable panel widths
  const [leftPanelWidth, setLeftPanelWidth] = useState(256);
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(320);
  const [keyframesHeight, setKeyframesHeight] = useState(160);
  const [mixerHeight, setMixerHeight] = useState(200);
  const [multicamHeight, setMulticamHeight] = useState(240);
  const leftResizeRef = useRef({ resizing: false, startX: 0, startWidth: 0 });
  const rightResizeRef = useRef({ resizing: false, startX: 0, startWidth: 0 });
  const bottomResizeRef = useRef({ resizing: false, startY: 0, startHeight: 0 });

  // Generic vertical resize handler factory — drag down increases the height below it
  const startVerticalResize = useCallback(
    (
      e: React.MouseEvent,
      currentHeight: number,
      setHeight: (h: number) => void,
      opts?: { min?: number; max?: number; invert?: boolean }
    ) => {
      const min = opts?.min ?? 80;
      const max = opts?.max ?? 800;
      const invert = opts?.invert ?? false; // true: drag up grows
      const startY = e.clientY;
      const startHeight = currentHeight;
      const onMove = (ev: MouseEvent) => {
        const raw = ev.clientY - startY;
        const delta = invert ? -raw : raw;
        setHeight(Math.max(min, Math.min(max, startHeight + delta)));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'row-resize';
    },
    []
  );

  // Video project store for media pool
  const addMedia = useVideoProjectStore((s) => s.addMedia);
  const currentProject = useVideoProjectStore((s) => s.currentProject);
  const uploadFile = useLibraryStore((s) => s.uploadFile);

  // Sync frame rate from project to editor store
  useEffect(() => {
    if (currentProject?.frameRate) {
      useEditorStore.getState().setFrameRate(currentProject.frameRate);
    }
  }, [currentProject?.frameRate]);

  const {
    tracks,
    pixelsPerSecond,
    snapToGrid,
    history,
    historyIndex,
    currentTime,
    selectedClip,
    setDuration,
    addTrack,
    addClip,
    addSubtitleClip,
    undo,
    redo,
    seek,
    clearSelection,
    deleteSelected,
    selectAll,
    splitClip,
    duplicateClip,
    addClipKeyframe,
    updateClipKeyframe,
    removeClipKeyframe,
    enterCompoundClip,
    exitCompoundClip,
  } = useEditorStore();

  // Initialize editor with video and initial subtitles (only once)
  useEffect(() => {
    // Check if tracks already exist (to avoid reinitializing)
    if (tracks.length === 0) {
      // Set initial project duration only on first initialization
      setDuration(duration);
      // Create default tracks
      const videoTrack = addTrack('video', 'Video');
      const audioTrack = addTrack('audio', 'Audio');
      const subtitleTrack = addTrack('subtitle', 'Subtitles');

      // Add main video clip
      const videoClip = addClip(videoTrack.id, {
        type: 'video',
        name: title || 'Main Video',
        startTime: 0,
        endTime: duration,
        sourceStartTime: 0,
        sourceEndTime: duration,
        sourceDuration: duration,
        assetId: resolvedAssetId,
        thumbnailUrl,
        transform: { scale: 1, rotation: 0, opacity: 1, x: 0, y: 0 },
        volume: 1,
        muted: false,
        speed: 1,
        blendMode: 'normal',
        effects: [],
        keyframes: [],
      });

      // Add main audio clip (extracted from video) — paired with video
      const audioClip = addClip(audioTrack.id, {
        type: 'audio',
        name: 'Original Audio',
        startTime: 0,
        endTime: duration,
        sourceStartTime: 0,
        sourceEndTime: duration,
        sourceDuration: duration,
        assetId: resolvedAssetId,
        volume: 1,
        muted: false,
        effects: [],
        keyframes: [],
        fadeIn: 0,
        fadeOut: 0,
        linkedClipId: videoClip.id,
      });

      // Link video clip back to audio clip
      useEditorStore.getState().updateClip(videoClip.id, { linkedClipId: audioClip.id });

      // Add initial subtitles if provided
      if (initialSubtitles && initialSubtitles.length > 0) {
        initialSubtitles.forEach((subtitle) => {
          addClip(subtitleTrack.id, {
            type: 'subtitle',
            name: subtitle.text.substring(0, 20) + '...',
            startTime: subtitle.startTime,
            endTime: subtitle.endTime,
            sourceStartTime: 0,
            sourceEndTime: subtitle.endTime - subtitle.startTime,
            text: subtitle.text,
            cueId: subtitle.id,
            style: {
              fontSize: 24,
              fontFamily: 'Arial',
              fontColor: '#FFFFFF',
              backgroundColor: '#000000',
              backgroundOpacity: 0.7,
              position: { x: 50, y: 85 },
              alignment: 'center',
              verticalAlign: 'bottom',
              animation: 'none',
              animationColor: '#FFFF00',
            },
          });
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount - duration expansion is handled by store

  // Save handler
  const handleSave = useCallback(async () => {
    if (!onSave) return;

    setIsSaving(true);
    try {
      const projectData: EditorProjectData = {
        tracks,
        duration,
        settings: {
          snapToGrid,
          pixelsPerSecond,
        },
      };
      await onSave(projectData);
    } finally {
      setIsSaving(false);
    }
  }, [onSave, tracks, duration, snapToGrid, pixelsPerSecond]);

  // Keyboard shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const store = useEditorStore.getState();

      // Ctrl/Cmd + Z: Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Ctrl/Cmd + Shift + Z: Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }

      // Ctrl/Cmd + S: Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
        return;
      }

      // Ctrl/Cmd + C: Copy selected clip
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        if (store.selectedClip) {
          clipboardRef.current = structuredClone(store.selectedClip);
        }
        return;
      }

      // Ctrl/Cmd + V: Paste clip at playhead
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        const clip = clipboardRef.current;
        if (clip) {
          const clipDuration = clip.endTime - clip.startTime;
          // Find matching track type
          const targetTrack = store.tracks.find((t) => t.type === clip.type);
          if (targetTrack) {
            const { id: _id, trackId: _trackId, linkedClipId: _linked, ...clipData } = clip;
            store.addClip(targetTrack.id, {
              ...clipData,
              startTime: store.currentTime,
              endTime: store.currentTime + clipDuration,
            });
          }
        }
        return;
      }

      // Ctrl/Cmd + A: Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }

      // Ctrl/Cmd + D: Duplicate selected clip
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        if (store.selectedClip) {
          duplicateClip(store.selectedClip.id);
        }
        return;
      }

      // Ctrl/Cmd + G: Create compound clip from selected clips
      if ((e.ctrlKey || e.metaKey) && e.key === 'g' && !e.shiftKey) {
        e.preventDefault();
        if (store.selection.clipIds.length >= 2) {
          store.createCompoundClip();
        }
        return;
      }

      // Ctrl/Cmd + Shift + G: Expand compound clip
      if ((e.ctrlKey || e.metaKey) && e.key === 'G' && e.shiftKey) {
        e.preventDefault();
        if (store.selectedClip?.type === 'compound') {
          store.expandCompoundClip(store.selectedClip.id);
        }
        return;
      }

      // Enter compound clip (Enter key when a compound clip is selected)
      if (e.key === 'Enter' && store.selectedClip?.type === 'compound') {
        e.preventDefault();
        enterCompoundClip(store.selectedClip.id);
        return;
      }

      // Exit compound clip (Backspace when in compound editing mode with no clip selection)
      if (e.key === 'Backspace' && store.compoundEditStack.length > 0 && store.selection.clipIds.length === 0) {
        e.preventDefault();
        exitCompoundClip();
        return;
      }

      // Shift+Delete: Ripple delete (delete + close gap) — must check before plain Delete
      if (e.shiftKey && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        store.rippleDelete();
        return;
      }

      // Delete/Backspace: Delete selected clips
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
        return;
      }

      // C: Split clip at playhead (Razor tool)
      if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
        if (store.selectedClip) {
          const clip = store.selectedClip;
          if (store.currentTime > clip.startTime && store.currentTime < clip.endTime) {
            splitClip(clip.id, store.currentTime);
          }
        }
        return;
      }

      // Arrow keys are handled by EditorTimeline (1s step, Up/Down for start/end)

      // Home: Jump to start
      if (e.key === 'Home') {
        e.preventDefault();
        seek(0);
        return;
      }

      // End: Jump to end
      if (e.key === 'End') {
        e.preventDefault();
        seek(store.duration);
        return;
      }

      // I: Set in point at playhead
      if (e.key === 'i' && !e.ctrlKey && !e.metaKey) {
        store.setInPoint(store.currentTime);
        return;
      }

      // O: Set out point at playhead
      if (e.key === 'o' && !e.ctrlKey && !e.metaKey) {
        store.setOutPoint(store.currentTime);
        return;
      }

      // Alt+X: Clear in/out points
      if (e.altKey && e.key === 'x') {
        e.preventDefault();
        store.clearInOutPoints();
        return;
      }

      // J/K/L: Shuttle playback
      if (e.key === 'j') {
        // J: Reverse / slow down
        const rate = store.playbackRate;
        if (store.isPlaying && rate > 0) {
          // Playing forward → slow down or reverse
          const newRate = rate <= 0.25 ? -1 : rate / 2;
          store.setPlaybackRate(newRate);
        } else if (store.isPlaying && rate < 0) {
          // Already reverse → speed up reverse
          store.setPlaybackRate(Math.max(-8, rate * 2));
        } else {
          // Not playing → start reverse
          store.setPlaybackRate(-1);
          store.play();
        }
        return;
      }

      if (e.key === 'k') {
        // K: Stop
        store.pause();
        return;
      }

      if (e.key === 'l') {
        // L: Forward / speed up
        const rate = store.playbackRate;
        if (store.isPlaying && rate > 0) {
          // Already forward → speed up
          store.setPlaybackRate(Math.min(8, rate * 2));
        } else if (store.isPlaying && rate < 0) {
          // Reverse → slow down or forward
          const newRate = rate >= -0.25 ? 1 : rate / 2;
          store.setPlaybackRate(newRate);
        } else {
          // Not playing → start forward
          store.setPlaybackRate(1);
          store.play();
        }
        return;
      }

      // Space: Toggle play/pause
      if (e.key === ' ') {
        e.preventDefault();
        store.togglePlay();
        return;
      }

      // Escape: Clear selection
      if (e.key === 'Escape') {
        clearSelection();
        return;
      }

      // G: Toggle snap to grid
      if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
        store.toggleSnapToGrid();
        return;
      }

      // M: Toggle mute on selected clip(s)
      if (e.key === 'm' && !e.ctrlKey && !e.metaKey) {
        const { selection, tracks: currentTracks } = store;
        if (selection.clipIds.length > 0) {
          for (const clipId of selection.clipIds) {
            for (const track of currentTracks) {
              const clip = track.clips.find((c) => c.id === clipId);
              if (clip && (clip.type === 'video' || clip.type === 'audio')) {
                store.updateClip(clipId, { muted: !clip.muted });
              }
            }
          }
        }
        return;
      }

      // 1-9: Switch multicam angle (when multicam is enabled)
      if (store.multicamEnabled && e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey) {
        const angleIndex = parseInt(e.key) - 1;
        if (angleIndex < store.multicamSources.length) {
          store.setMulticamActiveAngle(angleIndex);
          if (store.isPlaying) {
            store.addMulticamCut(store.currentTime, angleIndex);
          }
        }
        return;
      }

      // ?: Show shortcuts
      if (e.key === '?') {
        setShowShortcuts(true);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, clearSelection, deleteSelected, selectAll, splitClip, duplicateClip, seek, currentProject?.frameRate, enterCompoundClip, exitCompoundClip, handleSave]);

  // Export handler
  const handleExport = useCallback(
    (options: ExportOptions) => {
      if (onExport) {
        onExport(options);
      }
    },
    [onExport]
  );

  // Probe video metadata (duration, dimensions) and extract a thumbnail frame
  const probeVideoFile = useCallback((videoUrl: string): Promise<{
    duration: number;
    width: number;
    height: number;
    thumbnailUrl: string | null;
  }> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;

      const cleanup = () => { video.src = ''; video.load(); };
      const fallback = () => { cleanup(); resolve({ duration: 0, width: 0, height: 0, thumbnailUrl: null }); };
      const timeout = setTimeout(fallback, 15000);

      video.onloadedmetadata = () => {
        const dur = isFinite(video.duration) ? video.duration : 0;
        const w = video.videoWidth || 0;
        const h = video.videoHeight || 0;

        if (dur <= 0) {
          clearTimeout(timeout);
          cleanup();
          resolve({ duration: 0, width: w, height: h, thumbnailUrl: null });
          return;
        }

        // Seek to 10% of duration for a representative thumbnail
        video.currentTime = Math.min(dur * 0.1, 2);
      };

      video.onseeked = () => {
        clearTimeout(timeout);
        const dur = isFinite(video.duration) ? video.duration : 0;
        const w = video.videoWidth || 0;
        const h = video.videoHeight || 0;

        // Extract frame to canvas
        let thumbnailUrl: string | null = null;
        try {
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, 320 / Math.max(w, 1));
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7);
          }
        } catch {
          // Canvas extraction may fail due to CORS
        }

        cleanup();
        resolve({ duration: dur, width: w, height: h, thumbnailUrl });
      };

      video.onerror = () => { clearTimeout(timeout); fallback(); };
      video.src = videoUrl;
    });
  }, []);

  // Import handler - download gallery assets to local storage, then add to
  // media pool the same way local file imports do (fileUrl-based, not externalId).
  const handleImportMedia = useCallback(
    async (importedAssets: IrisAsset[]) => {
      for (const asset of importedAssets) {
        const metadata = (asset.metadata || {}) as Record<string, unknown>;

        const mediaType: 'video' | 'image' | 'audio' =
          asset.assetType === 'VIDEO' ? 'video'
          : asset.assetType === 'IMAGE' ? 'image'
          : asset.assetType === 'AUDIO' ? 'audio'
          : 'video';

        // Derive file extension from mimeType (fallback to sane default per type)
        const extFromMime = (() => {
          const mt = (asset.mimeType || '').toLowerCase();
          if (!mt) return null;
          if (mt.includes('mp4')) return '.mp4';
          if (mt.includes('quicktime')) return '.mov';
          if (mt.includes('webm')) return '.webm';
          if (mt.includes('matroska')) return '.mkv';
          if (mt.includes('jpeg')) return '.jpg';
          if (mt.includes('png')) return '.png';
          if (mt.includes('gif')) return '.gif';
          if (mt.includes('webp')) return '.webp';
          if (mt.includes('mpeg') && mt.startsWith('audio')) return '.mp3';
          if (mt.includes('mp3')) return '.mp3';
          if (mt.includes('wav')) return '.wav';
          if (mt.includes('aac')) return '.aac';
          if (mt.includes('mp4') && mt.startsWith('audio')) return '.m4a';
          return null;
        })();
        const defaultExt = mediaType === 'image' ? '.jpg' : mediaType === 'audio' ? '.mp3' : '.mp4';
        const ext = extFromMime || defaultExt;

        // Download the asset to persistent local storage (mirrors local-file flow)
        let localFileUrl: string | null = null;
        try {
          if (!window.electronAPI?.assetStorage) {
            throw new Error('assetStorage IPC not available');
          }
          // Self-host: local engine, no auth. Cloud: requires a token.
          let authToken = '';
          if (!IS_SELF_HOST) {
            authToken = (await window.electronAPI.auth.getToken()) ?? '';
            if (!authToken) throw new Error('Not authenticated');
          }
          const downloadUrl = await assetDownloadUrl(asset.id);

          const result = await window.electronAPI.assetStorage.download({
            assetId: asset.id,
            downloadUrl,
            authToken,
            ext,
          });

          if (!result.success || !result.localPath) {
            throw new Error(result.error || 'Download failed');
          }
          localFileUrl = await toLocalMediaUrl(result.localPath);
        } catch (err) {
          console.error('[ImportMedia] Failed to download gallery asset:', asset.id, err);
          // Skip this asset rather than falling back to externalId — we want
          // a consistent local-file flow.
          continue;
        }

        // Probe duration/dimensions/thumbnail from the local file (same as local import)
        let duration: number | null = null;
        let width: number | null = null;
        let height: number | null = null;
        let thumbnailUrl: string | null = null;

        if (mediaType === 'video') {
          const probe = await probeVideoFile(localFileUrl);
          duration = probe.duration > 0 ? probe.duration : null;
          width = probe.width || null;
          height = probe.height || null;
          thumbnailUrl = probe.thumbnailUrl;
        } else if (mediaType === 'image') {
          duration = 5;
          thumbnailUrl = localFileUrl;
        }

        // Fall back to server metadata if probing produced nothing
        if (!duration && metadata.duration) duration = Math.round(metadata.duration as number);
        if (!width && metadata.width) width = Math.round(metadata.width as number);
        if (!height && metadata.height) height = Math.round(metadata.height as number);

        await addMedia({
          mediaType,
          name: asset.name,
          fileUrl: localFileUrl,
          thumbnailUrl,
          duration,
          width,
          height,
          fileSize: asset.sizeBytes ? Math.round(asset.sizeBytes) : null,
        });
      }
    },
    [addMedia, probeVideoFile]
  );

  // Import local files (reference only, no upload/copy)
  const handleImportLocalFiles = useCallback(
    async (files: LocalFileImport[]) => {
      for (const file of files) {
        const fileUrl = await toLocalMediaUrl(file.path);
        let duration: number | null = null;
        let width: number | null = null;
        let height: number | null = null;
        let thumbnailUrl: string | null = null;

        if (file.mediaType === 'video') {
          const probe = await probeVideoFile(fileUrl);
          duration = probe.duration > 0 ? probe.duration : null;
          width = probe.width || null;
          height = probe.height || null;
          thumbnailUrl = probe.thumbnailUrl;
        }

        if (file.mediaType === 'image') {
          duration = 5;
          thumbnailUrl = fileUrl; // image itself is the thumbnail
        }

        await addMedia({
          mediaType: file.mediaType,
          name: file.name,
          fileUrl,
          thumbnailUrl,
          duration,
          width,
          height,
          fileSize: file.size || null,
        });
      }
    },
    [addMedia, probeVideoFile]
  );

  // File drag-and-drop handlers for OS file import
  const handleFileDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes('Files')) return;
    dragCounterRef.current++;
    setIsFileDragging(true);
  }, []);

  const handleFileDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsFileDragging(false);
  }, []);

  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleFileDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsFileDragging(false);

    // Only handle OS file drops, not internal drags
    if (!e.dataTransfer.files.length) return;

    const files = Array.from(e.dataTransfer.files).filter(f => ALL_ALLOWED_TYPES.includes(f.type));
    if (files.length === 0) return;

    const uploadedAssets: IrisAsset[] = [];
    for (const file of files) {
      const assetType = ALLOWED_VIDEO_TYPES.includes(file.type) || ALLOWED_AUDIO_TYPES.includes(file.type)
        ? 'VIDEO' as const : 'IMAGE' as const;
      const asset = await uploadFile(file, assetType);
      if (asset) uploadedAssets.push(asset);
    }
    if (uploadedAssets.length > 0) {
      await handleImportMedia(uploadedAssets);
    }
  }, [uploadFile, handleImportMedia]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Pre-render gate for multi-clip AI tools
  const { isMultiClip, isPrerendering, prerenderProgress, prepareAsset, cancelPrerender } = usePreRenderGate();

  // Proxy mode
  const proxyMode = useEditorStore((s) => s.proxyMode);
  const toggleProxyMode = useEditorStore((s) => s.toggleProxyMode);
  const [showProxyModal, setShowProxyModal] = useState(false);
  const [proxyForceRegenerate, setProxyForceRegenerate] = useState(false);

  // Multicam
  const multicamEnabled = useEditorStore((s) => s.multicamEnabled);
  const toggleMulticam = useEditorStore((s) => s.toggleMulticam);

  // Compound clip editing
  const compoundEditStack = useEditorStore((s) => s.compoundEditStack);

  // Get video store actions
  const asset = useEditorStore((s) => s.asset);
  const downloadVideo = useVideoStore((s) => s.downloadVideo);
  const isEditing = useVideoStore((s) => s.isEditing);
  const activeToolModal = useVideoStore((s) => s.activeToolModal);
  const openToolModal = useVideoStore((s) => s.openToolModal);
  const closeToolModal = useVideoStore((s) => s.closeToolModal);

  // Tool modal handlers — Upscale uses PreRenderGate for multi-clip support
  const handleUpscale = useCallback(async () => {
    if (isMultiClip) {
      const assetId = await prepareAsset();
      if (!assetId) return;
      setPrerenderAssetId(assetId);
    } else {
      setPrerenderAssetId(null);
    }
    openToolModal('upscale');
  }, [openToolModal, isMultiClip, prepareAsset]);

  const handleMotionControl = useCallback(() => {
    openToolModal('motion-control');
  }, [openToolModal]);

  const handleInpaint = useCallback(() => {
    openToolModal('inpaint');
  }, [openToolModal]);

  const handleCut = useCallback(() => {
    openToolModal('cut');
  }, [openToolModal]);

  // AutoCut and AutoReframe use PreRenderGate for multi-clip support
  const handleAutoCutGated = useCallback(async () => {
    if (isMultiClip) {
      const assetId = await prepareAsset();
      if (!assetId) return;
      setPrerenderAssetId(assetId);
    } else {
      setPrerenderAssetId(null);
    }
    setShowAutoCut(true);
  }, [isMultiClip, prepareAsset]);

  const handleAutoReframeGated = useCallback(async () => {
    if (isMultiClip) {
      const assetId = await prepareAsset();
      if (!assetId) return;
      setPrerenderAssetId(assetId);
    } else {
      setPrerenderAssetId(null);
    }
    setShowAutoReframe(true);
  }, [isMultiClip, prepareAsset]);

  const handleDownload = useCallback(() => {
    if (asset?.id) {
      downloadVideo(asset.id);
    }
  }, [asset?.id, downloadVideo]);

  // Add a title/text clip at the current playhead position
  const handleAddTitleClip = useCallback(() => {
    const { currentTime: time } = useEditorStore.getState();
    addSubtitleClip('Title Text', time, time + 5, {
      fontSize: 48,
      fontFamily: 'Arial',
      fontColor: '#FFFFFF',
      backgroundColor: '#000000',
      backgroundOpacity: 0,
      alignment: 'center',
      verticalAlign: 'middle',
      animation: 'none',
    });
  }, [addSubtitleClip]);

  // Lower Third preset dropdown state
  const [showLowerThirdMenu, setShowLowerThirdMenu] = useState(false);
  const lowerThirdMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showLowerThirdMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (lowerThirdMenuRef.current && !lowerThirdMenuRef.current.contains(e.target as Node)) {
        setShowLowerThirdMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showLowerThirdMenu]);

  // Apply a Lower Third preset at the current playhead
  const handleAddLowerThird = useCallback(
    (preset: LowerThirdPreset) => {
      const { currentTime: time } = useEditorStore.getState();
      addSubtitleClip('Lower Third', time, time + 5, preset.style);
      setShowLowerThirdMenu(false);
    },
    [addSubtitleClip]
  );

  return (
    <div
      className={cn(
        'relative flex flex-col bg-zinc-950 text-white overflow-hidden',
        className
      )}
      onDragEnter={handleFileDragEnter}
      onDragLeave={handleFileDragLeave}
      onDragOver={handleFileDragOver}
      onDrop={handleFileDrop}
    >
      {/* File drop overlay */}
      {isFileDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm border-2 border-dashed border-white/50 rounded-lg pointer-events-none">
          <div className="text-center">
            <Upload className="w-12 h-12 text-white/70 mx-auto mb-3" />
            <p className="text-lg font-medium text-white">Drop files to import</p>
            <p className="text-sm text-zinc-400">Videos, images, or audio files</p>
          </div>
        </div>
      )}

      {/* Pre-rendering overlay */}
      {isPrerendering && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="text-center max-w-sm">
            <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
            <p className="text-lg font-medium text-white mb-1">Preparing project...</p>
            <p className="text-sm text-zinc-400 mb-3">{prerenderProgress.message}</p>
            <div className="w-64 h-1.5 bg-zinc-700 rounded-full mx-auto overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${prerenderProgress.progress}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500 mt-2">{prerenderProgress.progress}%</p>
            <button
              onClick={cancelPrerender}
              className="mt-4 px-4 py-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Header (hidden when menu bar is in TitleBar) */}
      {!hideHeader && (
        <EditorHeader
          title={title}
          assetId={asset?.id}
          onClose={onClose}
          onSave={onSave ? handleSave : undefined}
          onExport={() => setShowExport(true)}
          onShowShortcuts={() => setShowShortcuts(true)}
          onUpscale={handleUpscale}
          onMotionControl={handleMotionControl}
          onInpaint={handleInpaint}
          onCut={handleCut}
          onDownload={handleDownload}
          onAutoCaptions={() => setShowAutoCaptions(true)}
          onAutoCut={handleAutoCutGated}
          onAutoReframe={handleAutoReframeGated}
          isSaving={isSaving}
          isProcessing={isEditing}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
        />
      )}

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Media/Effects panel */}
        <div className="border-r border-zinc-800 flex-shrink-0 flex flex-col relative" style={{ width: leftPanelWidth }}>
          {/* Panel tabs */}
          <div className="flex border-b border-zinc-800">
            <button
              onClick={() => setLeftPanelTab('media')}
              className={cn(
                'flex-1 px-3 py-2 text-xs font-medium transition-colors',
                leftPanelTab === 'media'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:text-white hover:bg-zinc-800/50'
              )}
            >
              Media
            </button>
            <button
              onClick={() => setLeftPanelTab('effects')}
              className={cn(
                'flex-1 px-3 py-2 text-xs font-medium transition-colors',
                leftPanelTab === 'effects'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:text-white hover:bg-zinc-800/50'
              )}
            >
              Effects
            </button>
            <button
              onClick={() => setLeftPanelTab('color')}
              className={cn(
                'flex-1 px-3 py-2 text-xs font-medium transition-colors',
                leftPanelTab === 'color'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:text-white hover:bg-zinc-800/50'
              )}
            >
              Color
            </button>
            <button
              onClick={() => setLeftPanelTab('history')}
              className={cn(
                'flex-1 px-3 py-2 text-xs font-medium transition-colors',
                leftPanelTab === 'history'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:text-white hover:bg-zinc-800/50'
              )}
            >
              History
            </button>
            <button
              onClick={() => setLeftPanelTab('transcript')}
              className={cn(
                'flex-1 px-3 py-2 text-xs font-medium transition-colors',
                leftPanelTab === 'transcript'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:text-white hover:bg-zinc-800/50'
              )}
            >
              Text
            </button>
          </div>
          {/* Panel content */}
          <div className="flex-1 overflow-hidden">
            {leftPanelTab === 'media' ? (
              <MediaPanel
                className="h-full"
                onImportClick={() => setShowImport(true)}
                onDoubleClick={(media) => setSourceMonitorMedia(media)}
              />
            ) : leftPanelTab === 'color' ? (
              <LumetriColorPanel className="h-full" />
            ) : leftPanelTab === 'history' ? (
              <HistoryPanel className="h-full" />
            ) : leftPanelTab === 'transcript' ? (
              <TranscriptPanel className="h-full" />
            ) : (
              <EffectsPanel
                className="h-full"
                selectedClipType={selectedClip?.type}
                appliedEffects={
                  selectedClip && (selectedClip.type === 'video' || selectedClip.type === 'audio' || selectedClip.type === 'adjustment')
                    ? new Map(
                        (selectedClip as import('@/features/video-editor/stores/editor.store').VideoClip | import('@/features/video-editor/stores/editor.store').AudioClip | import('@/features/video-editor/stores/editor.store').AdjustmentClip).effects.map(e => [getEffectDefId(e), e.id])
                      )
                    : undefined
                }
                onEffectApply={(effect) => {
                  const { selectedClip, addClipEffect } = useEditorStore.getState();
                  if (selectedClip && (selectedClip.type === 'video' || selectedClip.type === 'audio' || selectedClip.type === 'adjustment')) {
                    const clipEffect = createClipEffectFromDefinition(effect);
                    addClipEffect(selectedClip.id, clipEffect);
                  }
                }}
                onEffectRemove={(instanceId) => {
                  const { selectedClip, removeClipEffect } = useEditorStore.getState();
                  if (selectedClip) {
                    removeClipEffect(selectedClip.id, instanceId);
                  }
                }}
              />
            )}
          </div>
        </div>

        {/* Left resize handle */}
        <div
          className="w-1 flex-shrink-0 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500/70 transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            leftResizeRef.current = { resizing: true, startX: e.clientX, startWidth: leftPanelWidth };
            const onMouseMove = (ev: MouseEvent) => {
              if (!leftResizeRef.current.resizing) return;
              const delta = ev.clientX - leftResizeRef.current.startX;
              setLeftPanelWidth(Math.max(180, Math.min(500, leftResizeRef.current.startWidth + delta)));
            };
            const onMouseUp = () => {
              leftResizeRef.current.resizing = false;
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
              document.body.style.cursor = '';
              document.body.style.userSelect = '';
            };
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          }}
        />

        {/* Center: Preview panel */}
        <div className="flex-1 flex flex-col min-w-0">
          <EditorPreview
            thumbnailUrl={thumbnailUrl}
            className="flex-1"
          />
        </div>

        {/* Right resize handle */}
        <div
          className="w-1 flex-shrink-0 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500/70 transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            rightResizeRef.current = { resizing: true, startX: e.clientX, startWidth: rightPanelWidth };
            const onMouseMove = (ev: MouseEvent) => {
              if (!rightResizeRef.current.resizing) return;
              const delta = rightResizeRef.current.startX - ev.clientX;
              setRightPanelWidth(Math.max(240, Math.min(500, rightResizeRef.current.startWidth + delta)));
            };
            const onMouseUp = () => {
              rightResizeRef.current.resizing = false;
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
              document.body.style.cursor = '';
              document.body.style.userSelect = '';
            };
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          }}
        />

        {/* Right: Inspector panel */}
        <EditorInspector className="border-l border-zinc-800 flex-shrink-0" style={{ width: rightPanelWidth }} />
      </div>

      {/* Horizontal resize handle for bottom timeline area */}
      <div
        className="h-1 flex-shrink-0 cursor-row-resize hover:bg-blue-500/50 active:bg-blue-500/70 transition-colors"
        onMouseDown={(e) => {
          bottomResizeRef.current = { resizing: true, startY: e.clientY, startHeight: bottomPanelHeight };
          const onMove = (ev: MouseEvent) => {
            if (!bottomResizeRef.current.resizing) return;
            // Dragging up (negative delta) increases the bottom panel height
            const delta = bottomResizeRef.current.startY - ev.clientY;
            const maxH = Math.max(200, window.innerHeight - 200);
            setBottomPanelHeight(
              Math.max(150, Math.min(maxH, bottomResizeRef.current.startHeight + delta))
            );
          };
          const onUp = () => {
            bottomResizeRef.current.resizing = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
          document.body.style.cursor = 'row-resize';
        }}
      />

      {/* Bottom: Timeline and controls */}
      <div className="flex-shrink-0 border-t border-zinc-800 flex flex-col relative" style={{ height: bottomPanelHeight }}>
        <ProxyQueueIndicator />
        {/* Compound clip breadcrumb — shown when editing inside a compound clip */}
        {compoundEditStack.length > 0 && (
          <div className="flex items-center gap-1 px-3 py-1.5 bg-teal-900/30 border-b border-teal-700/50 flex-shrink-0">
            <button
              onClick={() => {
                while (useEditorStore.getState().compoundEditStack.length > 0) {
                  useEditorStore.getState().exitCompoundClip();
                }
              }}
              className="text-[11px] text-zinc-400 hover:text-white transition-colors"
            >
              Timeline
            </button>
            {compoundEditStack.map((entry, i) => {
              const clip = i === 0
                ? entry.parentTracks.flatMap((t) => t.clips).find((c) => c.id === entry.clipId)
                : compoundEditStack[i - 1].parentTracks.flatMap((t) => t.clips).find((c) => c.id === entry.clipId);
              return (
                <div key={entry.clipId} className="flex items-center gap-1">
                  <span className="text-[10px] text-zinc-600">/</span>
                  <span className="text-[11px] text-teal-400 font-medium">
                    {clip?.name || 'Compound'}
                  </span>
                </div>
              );
            })}
            <button
              onClick={exitCompoundClip}
              className="ml-auto text-[10px] px-2 py-0.5 bg-teal-700/30 text-teal-300 hover:bg-teal-700/50 rounded transition-colors"
            >
              Back
            </button>
          </div>
        )}
        <div className="flex items-center justify-between border-b border-zinc-800">
          <PlayheadControls className="flex-1" />
          <button
            onClick={handleAddTitleClip}
            className="px-2.5 h-full transition-colors border-l border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800"
            title="Title — Add title/text clip at playhead"
          >
            <Type className="w-3.5 h-3.5" />
          </button>
          {/* Lower Third preset picker */}
          <div ref={lowerThirdMenuRef} className="relative h-full">
            <button
              onClick={() => setShowLowerThirdMenu((v) => !v)}
              className={cn(
                'px-2.5 h-full transition-colors border-l border-zinc-800 flex items-center justify-center',
                showLowerThirdMenu
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
              )}
              title="Lower Third — Add lower third subtitle preset at playhead"
            >
              <Captions className="w-3.5 h-3.5" />
            </button>
            {showLowerThirdMenu && (
              <div className="absolute bottom-full right-0 mb-1 w-56 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500 border-b border-zinc-800">
                  Lower Third Presets
                </div>
                {LOWER_THIRD_CATEGORIES.map((cat) => {
                  const presets = LOWER_THIRD_PRESETS.filter((p) => p.category === cat.key);
                  return (
                    <div key={cat.key}>
                      <div className="px-3 pt-2 pb-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                        {cat.label}
                      </div>
                      {presets.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => handleAddLowerThird(preset)}
                          className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors flex items-center justify-between"
                          title={preset.description}
                        >
                          <span>{preset.name}</span>
                          <span className="text-[10px] text-zinc-600 truncate ml-2 max-w-[80px]">{preset.description}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <button
            onClick={() => setShowMixer(!showMixer)}
            className={cn(
              'px-2.5 h-full transition-colors border-l border-zinc-800 flex items-center justify-center',
              showMixer
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
            )}
            title="Mixer — Audio mixer panel"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowKeyframes(!showKeyframes)}
            className={cn(
              'px-2.5 h-full transition-colors border-l border-zinc-800 flex items-center justify-center',
              showKeyframes
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
            )}
            title="Keyframes — Animate clip properties"
          >
            <KeyRound className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              const next = !showMulticam;
              setShowMulticam(next);
              if (next && !multicamEnabled) toggleMulticam();
              if (!next && multicamEnabled) toggleMulticam();
            }}
            className={cn(
              'px-2.5 h-full transition-colors border-l border-zinc-800 flex items-center justify-center',
              showMulticam
                ? 'bg-sky-900/50 text-sky-400'
                : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
            )}
            title="Multicam — Multi-camera angle switcher"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              if (e.shiftKey) {
                // Shift+Click → force regenerate ALL proxies, even ready ones.
                // Useful if a source file changed or proxies are corrupted.
                setProxyForceRegenerate(true);
                setShowProxyModal(true);
                return;
              }
              if (proxyMode) {
                // Turning OFF — keep generated proxies on disk, just stop using them
                toggleProxyMode();
              } else {
                // Turning ON — open the generation modal first; only flip when done
                setProxyForceRegenerate(false);
                setShowProxyModal(true);
              }
            }}
            className={cn(
              'px-2.5 h-full transition-colors border-l border-zinc-800 flex items-center justify-center',
              proxyMode
                ? 'bg-amber-900/50 text-amber-400'
                : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
            )}
            title="Proxy — Use low-resolution previews for faster playback (Shift+Click to regenerate all)"
          >
            <Zap className="w-3.5 h-3.5" />
          </button>
        </div>
        <EditorTimeline className="flex-1 min-h-[150px]" />
        {/* Panels Container — stacks vertically with scroll */}
        {(showKeyframes || showMixer || showMulticam) && (
          <div className="flex-shrink-0 overflow-y-auto border-t border-zinc-800">
            {showKeyframes && (
              <>
                <div
                  className="h-1 flex-shrink-0 cursor-row-resize hover:bg-blue-500/50 active:bg-blue-500/70 transition-colors"
                  onMouseDown={(e) => startVerticalResize(e, keyframesHeight, setKeyframesHeight, { min: 100, max: 600, invert: true })}
                />
              <div className="border-b border-zinc-800 flex-shrink-0" style={{ height: keyframesHeight }}>
                <KeyframeEditor
                  clip={selectedClip && 'keyframes' in selectedClip ? selectedClip : null}
                  currentTime={Math.max(0, currentTime - (selectedClip?.startTime ?? 0))}
                  duration={selectedClip
                    ? selectedClip.endTime - selectedClip.startTime
                    : duration}
                  pixelsPerSecond={pixelsPerSecond}
                  onKeyframeAdd={(property, time) => {
                    if (!selectedClip) return;
                    const propDefaults: Record<string, number> = {
                      opacity: 1, scale: 1, x: 0, y: 0, rotation: 0, volume: 1, blur: 0, brightness: 1, contrast: 1,
                    };
                    addClipKeyframe(selectedClip.id, {
                      time,
                      property: property as import('@/types/videoProject.types').Keyframe['property'],
                      value: propDefaults[property] ?? 1,
                      easing: 'linear',
                    });
                  }}
                  onKeyframeUpdate={(index, updates) => {
                    if (selectedClip) updateClipKeyframe(selectedClip.id, index, updates);
                  }}
                  onKeyframeRemove={(index) => {
                    if (selectedClip) removeClipKeyframe(selectedClip.id, index);
                  }}
                  onSeek={(relTime) => {
                    if (selectedClip) seek(selectedClip.startTime + relTime);
                  }}
                  className="h-full"
                />
              </div>
              </>
            )}
            {showMixer && (
              <>
                <div
                  className="h-1 flex-shrink-0 cursor-row-resize hover:bg-blue-500/50 active:bg-blue-500/70 transition-colors"
                  onMouseDown={(e) => startVerticalResize(e, mixerHeight, setMixerHeight, { min: 100, max: 600, invert: true })}
                />
                <div className="flex-shrink-0 border-b border-zinc-800 overflow-auto" style={{ height: mixerHeight }}>
                  <AudioMixerPanel />
                </div>
              </>
            )}
            {showMulticam && (
              <>
                <div
                  className="h-1 flex-shrink-0 cursor-row-resize hover:bg-blue-500/50 active:bg-blue-500/70 transition-colors"
                  onMouseDown={(e) => startVerticalResize(e, multicamHeight, setMulticamHeight, { min: 120, max: 700, invert: true })}
                />
                <div className="flex-shrink-0 overflow-auto" style={{ height: multicamHeight }}>
                  <MulticamMonitor
                    onClose={() => setShowMulticam(false)}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* AI chat assistant — collapsible bar at the bottom */}
      <VideoEditorChatPanel
        onOpenSilenceRemoval={onOpenSilenceRemoval}
        onOpenAutoCaptions={() => setShowAutoCaptions(true)}
      />

      {/* Modals */}
      <KeyboardShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
      <ExportModal
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        onExport={handleExport}
        defaultFrameRate={currentProject?.frameRate}
      />
      <ImportMediaModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImportMedia}
        onImportLocalFiles={handleImportLocalFiles}
      />

      {/* Proxy generation — blocks editing while ffmpeg builds low-res copies */}
      <ProxyGenerationModal
        isOpen={showProxyModal}
        forceRegenerate={proxyForceRegenerate}
        onComplete={({ completed, failed, cancelled }) => {
          setShowProxyModal(false);
          setProxyForceRegenerate(false);
          // Only flip proxy mode on if at least one item is now ready and the
          // user didn't cancel the whole batch.
          if (!cancelled && completed > 0 && !proxyMode) {
            toggleProxyMode();
          }
          if (failed > 0) {
            console.warn(`[proxy] ${failed} item(s) failed`);
          }
        }}
      />

      {/* Auto Captions Modal */}
      <AutoCaptionsModal
        isOpen={showAutoCaptions}
        onClose={() => setShowAutoCaptions(false)}
        assetId={resolvedAssetId}
        duration={duration}
      />

      {/* AutoCut Modal — uses pre-rendered assetId when multi-clip */}
      <AutoCutModal
        isOpen={showAutoCut}
        onClose={() => { setShowAutoCut(false); setPrerenderAssetId(null); }}
        assetId={prerenderAssetId || resolvedAssetId}
        duration={duration}
      />

      {/* Auto-Reframe Modal — uses pre-rendered assetId when multi-clip */}
      <AutoReframeModal
        isOpen={showAutoReframe}
        onClose={() => { setShowAutoReframe(false); setPrerenderAssetId(null); }}
        assetId={prerenderAssetId || resolvedAssetId}
      />

      {/* Source Monitor Modal */}
      <SourceMonitorModal
        isOpen={!!sourceMonitorMedia}
        onClose={() => setSourceMonitorMedia(null)}
        media={sourceMonitorMedia}
      />

      {/* Video Tool Modals */}
      <VideoUpscaleModal
        isOpen={activeToolModal === 'upscale'}
        onClose={() => { closeToolModal(); setPrerenderAssetId(null); }}
        videoId={prerenderAssetId || asset?.id || ''}
        thumbnailUrl={thumbnailUrl}
      />
      <VideoMotionControlModal
        isOpen={activeToolModal === 'motion-control'}
        onClose={closeToolModal}
        videoId={asset?.id || ''}
        thumbnailUrl={thumbnailUrl}
      />
      <VideoInpaintModal
        isOpen={activeToolModal === 'inpaint'}
        onClose={closeToolModal}
        videoId={asset?.id || ''}
        thumbnailUrl={thumbnailUrl}
        duration={duration}
      />
      <VideoCutModal
        isOpen={activeToolModal === 'cut'}
        onClose={closeToolModal}
        videoId={asset?.id || ''}
        thumbnailUrl={thumbnailUrl}
        duration={duration}
      />

    </div>
  );
});

export default VideoEditor;
