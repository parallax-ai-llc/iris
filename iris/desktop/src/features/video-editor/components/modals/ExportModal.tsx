/**
 * ExportModal - Video export options dialog with FFmpeg rendering progress
 *
 * Flow:
 * 1. User selects export options (format, quality, fps, subtitles)
 * 2. User picks save location via native file dialog
 * 3. FFmpeg renders locally via Electron IPC
 * 4. Progress bar shows rendering status
 * 5. On completion, option to open file or folder
 */

import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Download,
  FolderOpen,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  FileVideo,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useEditorStore } from '@/features/video-editor/stores/editor.store';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import { renderSubtitleClipToPng } from '@/features/video-editor/lib/renderSubtitlePng';
import type { SubtitleClip } from '@/types/editor.types';

export interface ExportOptions {
  format: 'mp4' | 'webm' | 'mov' | 'gif';
  quality: 'low' | 'medium' | 'high' | 'ultra';
  frameRate: 24 | 30 | 60;
  width: number;
  height: number;
  includeSubtitles: boolean;
  subtitleFormat?: 'burned' | 'srt' | 'vtt';
  platform?: string;
  /** Video codec selection. Only applicable when format is 'mp4' or 'mov'. */
  codec?: 'h264' | 'h265' | 'prores' | 'vp9';
  /** ProRes profile. Only applicable when codec is 'prores'. */
  proResProfile?: '422' | '422-hq' | '422-lt' | '422-proxy' | '4444';
}

// ==================== Platform Presets ====================

export interface PlatformPreset {
  id: string;
  label: string;
  icon: string; // emoji
  width: number;
  height: number;
  ratio: string;
  fps: 24 | 30 | 60;
  format: ExportOptions['format'];
  quality: ExportOptions['quality'];
  maxDuration?: number; // seconds
  description: string;
}

const PLATFORM_PRESETS: PlatformPreset[] = [
  {
    id: 'custom',
    label: 'Custom',
    icon: '🎬',
    width: 1920,
    height: 1080,
    ratio: '16:9',
    fps: 30,
    format: 'mp4',
    quality: 'high',
    description: 'Custom settings',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    icon: '▶️',
    width: 1920,
    height: 1080,
    ratio: '16:9',
    fps: 60,
    format: 'mp4',
    quality: 'high',
    description: '1080p 60fps',
  },
  {
    id: 'youtube-4k',
    label: 'YouTube 4K',
    icon: '▶️',
    width: 3840,
    height: 2160,
    ratio: '16:9',
    fps: 60,
    format: 'mp4',
    quality: 'ultra',
    description: '4K 60fps',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    icon: '🎵',
    width: 1080,
    height: 1920,
    ratio: '9:16',
    fps: 30,
    format: 'mp4',
    quality: 'high',
    maxDuration: 600,
    description: '1080×1920 · 9:16',
  },
  {
    id: 'reels',
    label: 'Instagram Reels',
    icon: '📸',
    width: 1080,
    height: 1920,
    ratio: '9:16',
    fps: 30,
    format: 'mp4',
    quality: 'high',
    maxDuration: 90,
    description: '1080×1920 · 9:16',
  },
  {
    id: 'instagram',
    label: 'Instagram Post',
    icon: '📸',
    width: 1080,
    height: 1080,
    ratio: '1:1',
    fps: 30,
    format: 'mp4',
    quality: 'high',
    maxDuration: 60,
    description: '1080×1080 · 1:1',
  },
  {
    id: 'instagram-story',
    label: 'Instagram Story',
    icon: '📸',
    width: 1080,
    height: 1920,
    ratio: '9:16',
    fps: 30,
    format: 'mp4',
    quality: 'medium',
    maxDuration: 60,
    description: '1080×1920 · 9:16',
  },
  {
    id: 'shorts',
    label: 'YouTube Shorts',
    icon: '📱',
    width: 1080,
    height: 1920,
    ratio: '9:16',
    fps: 30,
    format: 'mp4',
    quality: 'high',
    maxDuration: 60,
    description: '1080×1920 · 9:16',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: '💼',
    width: 1920,
    height: 1080,
    ratio: '16:9',
    fps: 30,
    format: 'mp4',
    quality: 'medium',
    maxDuration: 600,
    description: '1920×1080 · 16:9',
  },
  {
    id: 'twitter',
    label: 'X (Twitter)',
    icon: '🐦',
    width: 1280,
    height: 720,
    ratio: '16:9',
    fps: 30,
    format: 'mp4',
    quality: 'medium',
    maxDuration: 140,
    description: '1280×720 · 16:9',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    icon: '👥',
    width: 1280,
    height: 720,
    ratio: '16:9',
    fps: 30,
    format: 'mp4',
    quality: 'medium',
    description: '1280×720 · 16:9',
  },
];

// Returns true when two resolutions share the same aspect ratio (within 2% tolerance)
function aspectRatioMatches(w1: number, h1: number, w2: number, h2: number): boolean {
  return Math.abs(w1 / h1 - w2 / h2) < 0.02;
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport?: (options: ExportOptions) => void;
  defaultFrameRate?: number;
}

type ExportPhase = 'options' | 'rendering' | 'completed' | 'failed';

interface RenderProgress {
  status: string;
  progress: number;
  message: string;
  error?: string;
  outputPath?: string;
}

const FORMAT_EXTENSIONS: Record<string, string> = {
  mp4: 'mp4',
  webm: 'webm',
  mov: 'mov',
  gif: 'gif',
};

export const ExportModal = memo(function ExportModal({
  isOpen,
  onClose,
  onExport: _onExport,
  defaultFrameRate,
}: ExportModalProps) {
  const { t } = useTranslation('editor');
  // Read project dimensions directly from store — reliable regardless of prop-passing timing
  const currentProject = useVideoProjectStore((s) => s.currentProject);
  const projectWidth = currentProject?.width;
  const projectHeight = currentProject?.height;
  const [platform, setPlatform] = useState('custom');
  const [format, setFormat] = useState<ExportOptions['format']>('mp4');
  const [quality, setQuality] = useState<ExportOptions['quality']>('high');
  const [frameRate, setFrameRate] = useState<ExportOptions['frameRate']>(
    (defaultFrameRate as ExportOptions['frameRate']) ?? 30
  );
  const [width, setWidth] = useState(projectWidth ?? 1920);
  const [height, setHeight] = useState(projectHeight ?? 1080);
  const [includeSubtitles, setIncludeSubtitles] = useState(true);
  const [subtitleFormat, setSubtitleFormat] =
    useState<ExportOptions['subtitleFormat']>('burned');
  const [codec, setCodec] = useState<ExportOptions['codec']>('h264');
  const [proResProfile, setProResProfile] =
    useState<ExportOptions['proResProfile']>('422');

  // Apply preset when platform changes
  const handlePlatformChange = useCallback((presetId: string) => {
    setPlatform(presetId);
    const preset = PLATFORM_PRESETS.find((p) => p.id === presetId);
    if (preset && presetId !== 'custom') {
      setFormat(preset.format);
      setQuality(preset.quality);
      setFrameRate(preset.fps);
      setWidth(preset.width);
      setHeight(preset.height);
      setCodec('h264');
      setProResProfile('422');
    }
  }, []);

  // Filtered presets: only show those matching project aspect ratio and within project resolution
  const filteredPresets = useMemo(() => {
    if (!projectWidth || !projectHeight) return PLATFORM_PRESETS;
    return PLATFORM_PRESETS.filter((p) => {
      if (p.id === 'custom') return true;
      return (
        aspectRatioMatches(p.width, p.height, projectWidth, projectHeight) &&
        p.width <= projectWidth &&
        p.height <= projectHeight
      );
    });
  }, [projectWidth, projectHeight]);

  // Custom width change — clamps to project width and locks aspect ratio
  const handleWidthChange = useCallback((val: number) => {
    const maxW = projectWidth ?? 7680;
    const newW = Math.max(320, Math.min(maxW, val));
    setWidth(newW);
    if (projectWidth && projectHeight) {
      const ratio = projectHeight / projectWidth;
      const newH = Math.round(newW * ratio);
      setHeight(Math.max(240, Math.min(projectHeight, newH)));
    }
  }, [projectWidth, projectHeight]);

  // Custom height change — clamps to project height and locks aspect ratio
  const handleHeightChange = useCallback((val: number) => {
    const maxH = projectHeight ?? 4320;
    const newH = Math.max(240, Math.min(maxH, val));
    setHeight(newH);
    if (projectWidth && projectHeight) {
      const ratio = projectWidth / projectHeight;
      const newW = Math.round(newH * ratio);
      setWidth(Math.max(320, Math.min(projectWidth, newW)));
    }
  }, [projectWidth, projectHeight]);

  // Rendering state
  const [phase, setPhase] = useState<ExportPhase>('options');
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean | null>(null);
  const [ffmpegNeedsUpgrade, setFfmpegNeedsUpgrade] = useState<boolean>(false);
  // Setup status: null = not started, 'checking' = locating, 'downloading' = auto-install, etc.
  const [ffmpegSetup, setFfmpegSetup] = useState<{
    status: 'checking' | 'downloading' | 'ready' | 'failed';
    progress?: number;
    message?: string;
    error?: string;
  } | null>(null);

  const [outputPath, setOutputPath] = useState<string>('');
  const [exportError, setExportError] = useState<string | null>(null);

  // Editor state for building export request
  const tracks = useEditorStore((s) => s.tracks);
  const duration = useEditorStore((s) => s.duration);
  const inPoint = useEditorStore((s) => s.inPoint);
  const outPoint = useEditorStore((s) => s.outPoint);
  const setClientProcessing = useEditorStore((s) => s.setClientProcessing);

  const hasMarkedRange = inPoint !== null && outPoint !== null && outPoint > inPoint;
  const [useMarkedRange, setUseMarkedRange] = useState(false);
  useEffect(() => {
    setUseMarkedRange(hasMarkedRange);
  }, [hasMarkedRange]);

  // Set clientProcessingInProgress during rendering to protect against window close
  useEffect(() => {
    const isRendering = phase === 'rendering';
    setClientProcessing(isRendering);
    return () => {
      setClientProcessing(false);
    };
  }, [phase, setClientProcessing]);

  // Locate (and silently auto-install) FFmpeg when the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setPhase('options');
    setProgress(null);
    setExportError(null);
    setPlatform('custom');
    if (projectWidth) setWidth(projectWidth);
    if (projectHeight) setHeight(projectHeight);
    if (defaultFrameRate) setFrameRate((defaultFrameRate as ExportOptions['frameRate']) ?? 30);

    if (!window.electronAPI?.videoExport) return;

    setFfmpegSetup({ status: 'checking', message: 'Preparing video encoder...' });
    window.electronAPI.videoExport.onFFmpegSetupProgress((p) => {
      setFfmpegSetup({
        status: p.status,
        progress: p.progress,
        message: p.message,
        error: p.error,
      });
    });

    const ensure = window.electronAPI.videoExport.ensureFFmpeg ?? window.electronAPI.videoExport.checkFFmpeg;
    ensure().then((result) => {
      setFfmpegAvailable(result.available);
      setFfmpegNeedsUpgrade(result.needsUpgrade ?? false);
      setFfmpegSetup({ status: result.available ? 'ready' : 'failed', error: result.error });
    });

    return () => {
      window.electronAPI.videoExport.removeFFmpegSetupListener?.();
    };
  }, [isOpen, projectWidth, projectHeight, defaultFrameRate]);

  // Listen for export progress
  useEffect(() => {
    if (!window.electronAPI?.videoExport) return;

    window.electronAPI.videoExport.onProgress((data: RenderProgress) => {
      setProgress(data);
      if (data.status === 'completed') {
        setPhase('completed');
        setOutputPath(data.outputPath || '');
      } else if (data.status === 'failed') {
        setPhase('failed');
      } else if (data.status === 'cancelled') {
        setPhase('options');
      }
    });

    return () => {
      window.electronAPI.videoExport.removeProgressListener();
    };
  }, []);

  // Start export
  const handleStartExport = useCallback(async () => {
    setExportError(null);

    if (!window.electronAPI?.videoExport || !window.electronAPI?.files) {
      setExportError('Electron API not available. Please run as desktop app.');
      return;
    }

    // Show save dialog
    const ext = FORMAT_EXTENSIONS[format];
    let savePath: string | null = null;
    try {
      savePath = await window.electronAPI.files.saveFile({
        defaultPath: `export.${ext}`,
        filters: [{ name: `${format.toUpperCase()} Video`, extensions: [ext] }],
      });
    } catch (err) {
      setExportError(`Failed to open save dialog: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    if (!savePath) return; // User cancelled

    try {
      setPhase('rendering');
      setProgress({ status: 'preparing', progress: 0, message: 'Resolving media URLs...' });

      // Get auth token for authenticated downloads in main process
      const authToken = await window.electronAPI.auth.getToken();

      // Collect all unique assetIds and map to authenticated download URLs
      const allAssetIds = new Set<string>();
      for (const track of tracks) {
        for (const clip of track.clips) {
          const assetId = (clip as { assetId?: string }).assetId;
          if (assetId) allAssetIds.add(assetId);
        }
      }
      const urlMap = new Map<string, string>();
      for (const id of allAssetIds) {
        if (id.startsWith('file://')) {
          // file:// URL → local path
          urlMap.set(id, decodeURIComponent(id.replace(/^file:\/\/\//, '')));
        } else if (id.includes('/') || id.includes('\\')) {
          // Already a local file path (e.g. separated audio)
          urlMap.set(id, id);
        } else {
          // DB ID — export MUST always use the original master, never a
          // low-res proxy. If the user has been editing in proxy mode the
          // original may not be downloaded yet — in that case force a
          // download here. Do NOT fall back to proxyPath.
          let localPath = useEditorStore.getState().assetPaths.get(id) ?? null;
          if (!localPath) {
            const downloaded = await useEditorStore.getState().downloadAsset(id);
            if (!downloaded) {
              throw new Error(`Failed to download asset: ${id}`);
            }
            localPath = downloaded;
          }
          urlMap.set(id, localPath);
        }
      }

      setProgress({ status: 'preparing', progress: 5, message: 'Preparing...' });

      // Range trim setup — when "Export marked range only" is enabled, trim
      // clips to [inPoint, outPoint] and offset all timeline times by -inPoint.
      const rangeActive = useMarkedRange && hasMarkedRange;
      const rangeStart = rangeActive ? (inPoint as number) : 0;
      const rangeEnd = rangeActive ? (outPoint as number) : duration;
      const exportDuration = rangeActive ? (rangeEnd - rangeStart) : duration;

      // Build export request from editor state
      const exportTracks = tracks.filter((track) => track.visible !== false).map((track) => ({
        id: track.id,
        type: track.type,
        muted: track.muted,
        volume: track.volume,
        clips: track.clips
          .filter((clip) => !rangeActive || (clip.endTime > rangeStart && clip.startTime < rangeEnd))
          .map((clip) => {
          // Compute trimmed timeline range relative to the export
          const trimmedStart = Math.max(clip.startTime, rangeStart);
          const trimmedEnd = Math.min(clip.endTime, rangeEnd);
          const startTime = trimmedStart - rangeStart;
          const endTime = trimmedEnd - rangeStart;

          // Adjust source range by how much was trimmed off each side, scaled by speed
          const speed = (clip as { speed?: number }).speed ?? 1;
          const leftTrim = Math.max(0, rangeStart - clip.startTime);
          const rightTrim = Math.max(0, clip.endTime - rangeEnd);
          const sourceStartTime = clip.sourceStartTime + leftTrim * speed;
          const sourceEndTime = clip.sourceEndTime - rightTrim * speed;

          const base = {
            id: clip.id,
            type: clip.type,
            startTime,
            endTime,
            sourceStartTime,
            sourceEndTime,
            sourceUrl: '',
          };

          if (clip.type === 'video') {
            const vc = clip as import('@/features/video-editor/stores/editor.store').VideoClip;
            return {
              ...base,
              sourceUrl: urlMap.get(vc.assetId) ?? vc.assetId,
              mediaType: vc.mediaType,
              // Natural pixel dimensions — required by the overlay compositor so image
              // clips render at their source size rather than fitting the frame.
              sourceWidth: vc.sourceWidth,
              sourceHeight: vc.sourceHeight,
              // Blend mode passed through for future compositor support.
              blendMode: vc.blendMode,
              // trackId lets the compositor determine which track each clip belongs to.
              trackId: track.id,
              volume: vc.volume,
              // Audio extracted to a paired audio clip (now possibly deleted) →
              // suppress the video's embedded audio in the render too.
              muted: vc.muted || vc.audioExtracted === true,
              speed: vc.speed,
              transform: vc.transform,
              effects: vc.effects.map((e) => ({
                type: e.type,
                enabled: e.enabled,
                filterType: e.filterType,
                filterIntensity: e.filterIntensity,
                filterParams: e.filterParams,
                transitionType: e.transitionType,
                transitionPosition: e.transitionPosition,
                transitionDuration: e.transitionDuration,
                audioEffectType: e.audioEffectType,
                audioParams: e.audioParams,
              })),
            };
          }

          if (clip.type === 'audio') {
            const ac = clip as import('@/features/video-editor/stores/editor.store').AudioClip;
            return {
              ...base,
              sourceUrl: urlMap.get(ac.assetId) ?? ac.assetId,
              volume: ac.volume,
              muted: ac.muted,
              fadeIn: ac.fadeIn,
              fadeOut: ac.fadeOut,
              pan: ac.pan,
              gain: ac.gain,
            };
          }

          if (clip.type === 'subtitle') {
            const sc = clip as import('@/features/video-editor/stores/editor.store').SubtitleClip;
            return {
              ...base,
              text: sc.text,
              style: sc.style,
            };
          }

          if (clip.type === 'music') {
            const mc = clip as import('@/features/video-editor/stores/editor.store').MusicClip;
            return {
              ...base,
              sourceUrl: urlMap.get(mc.assetId) ?? mc.assetId,
              volume: mc.volume,
              fadeIn: mc.fadeIn,
              fadeOut: mc.fadeOut,
            };
          }

          if (clip.type === 'adjustment') {
            const adjClip = clip as import('@/features/video-editor/stores/editor.store').AdjustmentClip;
            return {
              ...base,
              effects: (adjClip.effects ?? []).map((e) => ({
                type: e.type,
                enabled: e.enabled,
                filterType: e.filterType,
                filterIntensity: e.filterIntensity,
                filterParams: e.filterParams,
                transitionType: e.transitionType,
                transitionPosition: e.transitionPosition,
                transitionDuration: e.transitionDuration,
                audioEffectType: e.audioEffectType,
                audioParams: e.audioParams,
              })),
            };
          }

          return base;
        }),
      }));

      // Rasterize subtitle clips to full-frame PNGs for pixel-accurate burned export.
      // Only generated when subtitleFormat === 'burned'; the PNG path replaces the ASS path.
      let subtitleOverlays:
        | Array<{ pngDataUrl: string; startTime: number; endTime: number }>
        | undefined;

      if (includeSubtitles && subtitleFormat === 'burned') {
        const subtitleClips = tracks
          .filter((t) => t.type === 'subtitle' && t.visible !== false)
          .flatMap((t) => t.clips as SubtitleClip[])
          .filter((c) => {
            if (!c.text) return false;
            if (!rangeActive) return true;
            return c.endTime > rangeStart && c.startTime < rangeEnd;
          });

        if (subtitleClips.length > 0) {
          const rendered = await Promise.all(
            subtitleClips.map(async (clip) => {
              const trimmedStart = Math.max(clip.startTime, rangeStart);
              const trimmedEnd = Math.min(clip.endTime, rangeEnd);
              const startTime = trimmedStart - rangeStart;
              const endTime = trimmedEnd - rangeStart;
              const pngDataUrl = await renderSubtitleClipToPng(clip, width, height);
              return { pngDataUrl, startTime, endTime };
            }),
          );
          subtitleOverlays = rendered;
        }
      }

      await window.electronAPI.videoExport.start({
        outputPath: savePath,
        format,
        quality,
        frameRate,
        width,
        height,
        duration: exportDuration,
        tracks: exportTracks,
        includeSubtitles,
        subtitleFormat,
        codec: (format === 'mp4' || format === 'mov') ? codec : undefined,
        proResProfile: codec === 'prores' ? proResProfile : undefined,
        authToken: authToken ?? undefined,
        subtitleOverlays,
      });
    } catch (err) {
      setPhase('failed');
      setProgress((prev) => ({
        ...prev ?? { status: 'failed', progress: 0, message: '' },
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [format, quality, frameRate, width, height, includeSubtitles, subtitleFormat, codec, proResProfile, tracks, duration, useMarkedRange, hasMarkedRange, inPoint, outPoint]);

  // Cancel export
  const handleCancel = useCallback(async () => {
    if (phase === 'rendering' && window.electronAPI?.videoExport) {
      await window.electronAPI.videoExport.cancel();
    }
    setPhase('options');
    setProgress(null);
  }, [phase]);

  // Open output file
  const handleOpenFile = useCallback(() => {
    if (outputPath && window.electronAPI?.files) {
      window.electronAPI.files.openPath(outputPath);
    }
  }, [outputPath]);

  // Show in folder
  const handleShowInFolder = useCallback(() => {
    if (outputPath && window.electronAPI?.files) {
      window.electronAPI.files.showInFolder(outputPath);
    }
  }, [outputPath]);

  const handleClose = useCallback(() => {
    if (phase === 'rendering') return; // Prevent closing during render
    onClose();
    // Reset state after close animation
    setTimeout(() => {
      setPhase('options');
      setProgress(null);
    }, 200);
  }, [phase, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={handleClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl max-w-lg w-full max-h-[calc(100vh-2rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Download className="w-5 h-5" />
            Export Video
          </h2>
          {phase !== 'rendering' && (
            <button
              onClick={handleClose}
              className="p-1 hover:bg-zinc-800 rounded transition-colors"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          )}
        </div>

        {/* Options Phase */}
        {phase === 'options' && (
          <>
            <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
              {/* FFmpeg setup state — silent install with a subtle progress strip.
                  Only escalates to an error if even the auto-download failed. */}
              {ffmpegSetup && ffmpegSetup.status === 'checking' && ffmpegAvailable === null && (
                <div className="flex items-center gap-2 p-2.5 bg-zinc-800/60 border border-zinc-700 rounded-lg">
                  <Loader2 className="w-4 h-4 text-zinc-400 animate-spin flex-shrink-0" />
                  <p className="text-xs text-zinc-400">
                    {ffmpegSetup.message ?? t('exportModal.ffmpegPreparing')}
                  </p>
                </div>
              )}
              {ffmpegSetup && ffmpegSetup.status === 'downloading' && (
                <div className="p-2.5 bg-zinc-800/60 border border-zinc-700 rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {ffmpegSetup.message ?? t('exportModal.ffmpegDownloading')}
                    </span>
                    {typeof ffmpegSetup.progress === 'number' && (
                      <span>{ffmpegSetup.progress}%</span>
                    )}
                  </div>
                  <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-200"
                      style={{ width: `${ffmpegSetup.progress ?? 0}%` }}
                    />
                  </div>
                </div>
              )}
              {ffmpegAvailable === false && ffmpegSetup?.status === 'failed' && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-red-300 font-medium">{t('exportModal.ffmpegSetupFailed')}</p>
                    <p className="text-xs text-red-400/70 mt-0.5 break-words">
                      {ffmpegSetup.error ?? t('exportModal.ffmpegRequired')}
                    </p>
                  </div>
                </div>
              )}
              {ffmpegAvailable === true && ffmpegNeedsUpgrade && (
                <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-yellow-300 font-medium">{t('exportModal.ffmpegOutdated')}</p>
                    <p className="text-xs text-yellow-400/70 mt-0.5">
                      {t('exportModal.ffmpegUpgradeMessage')}
                    </p>
                  </div>
                </div>
              )}


              {exportError && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-300">{exportError}</p>
                </div>
              )}

              {/* Platform Presets */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Platform
                </label>
                {projectWidth && projectHeight && (
                  <p className="text-[11px] text-zinc-500 mb-2">
                    Only presets matching your project ratio ({projectWidth}×{projectHeight}) are shown.
                  </p>
                )}
                <div className="grid grid-cols-3 gap-1.5">
                  {filteredPresets.map((preset) => {
                    const isSelected = platform === preset.id;
                    const durationWarning = preset.maxDuration && duration > preset.maxDuration;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => handlePlatformChange(preset.id)}
                        className={cn(
                          'relative flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg text-center transition-colors border',
                          isSelected
                            ? 'bg-white/10 border-white/20 text-white'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600'
                        )}
                      >
                        <span className="text-sm leading-none">{preset.icon}</span>
                        <span className="text-[10px] font-medium leading-tight">{preset.label}</span>
                        <span className="text-[9px] text-zinc-500 leading-tight">{preset.description}</span>
                        {durationWarning && (
                          <span className="text-[8px] text-amber-400 leading-tight">
                            Max {preset.maxDuration}s
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Resolution (from preset or custom) */}
              {platform === 'custom' && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-zinc-400 mb-1">
                      Width{projectWidth ? ` (max ${projectWidth})` : ''}
                    </label>
                    <input
                      type="number"
                      value={width}
                      onChange={(e) => handleWidthChange(Number(e.target.value) || width)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-zinc-400 mb-1">
                      Height{projectHeight ? ` (max ${projectHeight})` : ''}
                    </label>
                    <input
                      type="number"
                      value={height}
                      onChange={(e) => handleHeightChange(Number(e.target.value) || height)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
                    />
                  </div>
                </div>
              )}

              {/* Resolution display for presets */}
              {platform !== 'custom' && (
                <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 rounded-lg text-xs text-zinc-400">
                  <span>{width}×{height}</span>
                  <span className="text-zinc-600">·</span>
                  <span>{PLATFORM_PRESETS.find(p => p.id === platform)?.ratio}</span>
                  <span className="text-zinc-600">·</span>
                  <span>{frameRate}fps</span>
                  <span className="text-zinc-600">·</span>
                  <span>{format.toUpperCase()}</span>
                </div>
              )}

              {/* Format */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Format
                </label>
                <select
                  value={format}
                  onChange={(e) => {
                    const newFormat = e.target.value as ExportOptions['format'];
                    setFormat(newFormat);
                    setPlatform('custom');
                    // Reset codec to a sensible default when switching formats
                    if (newFormat === 'mp4') setCodec('h264');
                    else if (newFormat === 'mov') setCodec('prores');
                    else setCodec(undefined);
                  }}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  <option value="mp4">MP4</option>
                  <option value="webm">WebM</option>
                  <option value="mov">MOV</option>
                  <option value="gif">GIF (Animated)</option>
                </select>
              </div>

              {/* Codec — only shown for mp4 / mov */}
              {(format === 'mp4' || format === 'mov') && (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Codec
                  </label>
                  <select
                    value={codec ?? 'h264'}
                    onChange={(e) => {
                      setCodec(e.target.value as ExportOptions['codec']);
                    }}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                  >
                    {format === 'mp4' && (
                      <>
                        <option value="h264">H.264 (AVC) — universal compatibility</option>
                        <option value="h265">H.265 / HEVC — smaller file, high quality</option>
                        <option value="vp9">VP9 — open, web-optimised</option>
                      </>
                    )}
                    {format === 'mov' && (
                      <>
                        <option value="h264">H.264 (AVC)</option>
                        <option value="h265">H.265 / HEVC</option>
                        <option value="prores">Apple ProRes — lossless, for post-production</option>
                      </>
                    )}
                  </select>
                </div>
              )}

              {/* ProRes Profile — only shown when codec is 'prores' */}
              {codec === 'prores' && (format === 'mp4' || format === 'mov') && (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    ProRes Profile
                  </label>
                  <select
                    value={proResProfile ?? '422'}
                    onChange={(e) =>
                      setProResProfile(e.target.value as ExportOptions['proResProfile'])
                    }
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                  >
                    <option value="422-proxy">ProRes 422 Proxy — smallest, offline editing</option>
                    <option value="422-lt">ProRes 422 LT — light, reduced data rate</option>
                    <option value="422">ProRes 422 — standard production quality</option>
                    <option value="422-hq">ProRes 422 HQ — highest quality 422</option>
                    <option value="4444">ProRes 4444 — alpha channel support</option>
                  </select>
                </div>
              )}

              {/* Quality */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Quality
                </label>
                <select
                  value={quality}
                  onChange={(e) => {
                    setQuality(e.target.value as ExportOptions['quality']);
                  }}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  <option value="low">Low — smaller file, faster encode</option>
                  <option value="medium">Medium — balanced quality/size</option>
                  <option value="high">High — recommended</option>
                  <option value="ultra">Ultra — best quality, large file</option>
                </select>
              </div>

              {/* Frame Rate */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Frame Rate
                </label>
                <select
                  value={frameRate}
                  onChange={(e) => {
                    setFrameRate(Number(e.target.value) as ExportOptions['frameRate']);
                  }}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  <option value={24}>24 fps (Cinema)</option>
                  <option value={30}>30 fps (Standard)</option>
                  <option value={60}>60 fps (Smooth)</option>
                </select>
              </div>

              {/* Marked range */}
              {hasMarkedRange && (
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useMarkedRange}
                      onChange={(e) => setUseMarkedRange(e.target.checked)}
                      className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-white focus:ring-white/30"
                    />
                    <span className="text-sm text-zinc-300">
                      Export marked range only
                      <span className="ml-2 text-xs text-zinc-500 font-mono">
                        {(inPoint as number).toFixed(2)}s → {(outPoint as number).toFixed(2)}s
                        {' '}({((outPoint as number) - (inPoint as number)).toFixed(2)}s)
                      </span>
                    </span>
                  </label>
                </div>
              )}

              {/* Subtitles */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSubtitles}
                    onChange={(e) => setIncludeSubtitles(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-white focus:ring-white/30"
                  />
                  <span className="text-sm text-zinc-300">Include Subtitles</span>
                </label>
              </div>

              {includeSubtitles && (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Subtitle Format
                  </label>
                  <select
                    value={subtitleFormat}
                    onChange={(e) =>
                      setSubtitleFormat(
                        e.target.value as ExportOptions['subtitleFormat']
                      )
                    }
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                  >
                    <option value="burned">Burned into video</option>
                    <option value="srt">Separate SRT file</option>
                    <option value="vtt">Separate VTT file</option>
                  </select>
                </div>
              )}
            </div>

            {/* Export button */}
            <div className="flex justify-end gap-3 p-4 border-t border-zinc-800 flex-shrink-0">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              {(() => {
                const isSettingUp = ffmpegSetup?.status === 'checking' || ffmpegSetup?.status === 'downloading';
                const isBlocked = ffmpegAvailable === false || isSettingUp;
                return (
                  <button
                    onClick={handleStartExport}
                    disabled={isBlocked}
                    className={cn(
                      'px-4 py-2 rounded-lg transition-colors flex items-center gap-2 font-medium',
                      isBlocked
                        ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white'
                    )}
                  >
                    {isSettingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Export
                  </button>
                );
              })()}
            </div>
          </>
        )}

        {/* Rendering Phase */}
        {phase === 'rendering' && progress && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-white animate-spin" />
              <span className="text-sm text-white font-medium">
                {progress.message}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300 rounded-full"
                style={{ width: `${progress.progress}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>{progress.status === 'preparing' ? 'Preparing...' : 'Rendering'}</span>
              <span>{progress.progress}%</span>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-sm"
              >
                Cancel Export
              </button>
            </div>
          </div>
        )}

        {/* Completed Phase */}
        {phase === 'completed' && (
          <div className="p-6 space-y-4">
            <div className="flex flex-col items-center text-center gap-3">
              <CheckCircle2 className="w-12 h-12 text-green-400" />
              <div>
                <p className="text-lg font-medium text-white">Export Complete</p>
                <p className="text-sm text-zinc-400 mt-1">
                  Your video has been exported successfully
                </p>
              </div>
            </div>

            {outputPath && (
              <div className="bg-zinc-800 rounded-lg p-3 flex items-center gap-2">
                <FileVideo className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                <span className="text-xs text-zinc-300 truncate flex-1">
                  {outputPath}
                </span>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleOpenFile}
                className="flex-1 px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors text-sm flex items-center justify-center gap-2"
              >
                <FileVideo className="w-4 h-4" />
                Open File
              </button>
              <button
                onClick={handleShowInFolder}
                className="flex-1 px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors text-sm flex items-center justify-center gap-2"
              >
                <FolderOpen className="w-4 h-4" />
                Show in Folder
              </button>
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white rounded-lg transition-colors text-sm font-medium"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Failed Phase */}
        {phase === 'failed' && (
          <div className="p-6 space-y-4">
            <div className="flex flex-col items-center text-center gap-3">
              <XCircle className="w-12 h-12 text-red-400" />
              <div>
                <p className="text-lg font-medium text-white">Export Failed</p>
                <p className="text-sm text-red-400 mt-1">
                  {progress?.error || 'An unknown error occurred'}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors text-sm"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setPhase('options');
                  setProgress(null);
                }}
                className="px-4 py-2 bg-zinc-700 text-white rounded-lg hover:bg-zinc-600 transition-colors text-sm"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
