/**
 * TimelineClip - Draggable/resizable clip on timeline
 * Professional video editor style with thumbnail frames and waveforms
 */

import { memo, useCallback, useMemo, useState, useEffect } from 'react';
import { VolumeX, Link2, Unlink, Link, Trash2, Copy, Scissors, AlertTriangle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  useEditorStore,
  type Clip,
  type AudioClip,
  type MusicClip,
  type VideoClip,
  type SubtitleClip,
  type AdjustmentClip,
  type CompoundClip,
  type DragOperation,
  hasEffects,
} from '@/features/video-editor/stores/editor.store';
import { selectClipIdSet } from '@/features/video-editor/stores/editor/selectors';
import { useCachedAssetUrlById } from '@/shared/hooks/useCachedAssetUrl';
import { useWaveformAnalyzer, MAX_WEB_DECODE_SECONDS } from '@/features/video-editor/hooks/useWaveformAnalyzer';
import { createClipEffectFromDefinition } from '@/shared/lib/utils/effectUtils';

// Cache for extracted video frames (shared across all clips)
const frameCache = new Map<string, string[]>();

/**
 * Extract frames from video at specified intervals
 */
async function extractVideoFrames(
  videoUrl: string,
  clipDuration: number,
  frameCount: number,
  sourceStartTime: number
): Promise<string[]> {
  const cacheKey = `${videoUrl}-${frameCount}-${sourceStartTime}-${clipDuration}`;
  
  if (frameCache.has(cacheKey)) {
    return frameCache.get(cacheKey)!;
  }

  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';

    const frames: string[] = [];
    let currentFrame = 0;
    let resolved = false;
    const interval = clipDuration / frameCount;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const cleanup = () => {
      video.onseeked = null;
      video.onloadedmetadata = null;
      video.onerror = null;
      video.src = '';
      video.remove();
      canvas.width = 0;
      canvas.height = 0;
    };

    const finish = (result: string[]) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(result);
    };

    if (!ctx) {
      finish([]);
      return;
    }

    const captureFrame = () => {
      if (currentFrame >= frameCount) {
        frameCache.set(cacheKey, frames);
        finish(frames);
        return;
      }

      // Set canvas size based on video aspect ratio (thumbnail size)
      const aspectRatio = video.videoWidth / video.videoHeight || 16/9;
      canvas.height = 48;
      canvas.width = Math.round(48 * aspectRatio);

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        frames.push(dataUrl);
      } catch {
        frames.push('');
      }

      currentFrame++;

      if (currentFrame < frameCount) {
        const nextTime = sourceStartTime + (currentFrame * interval);
        video.currentTime = nextTime;
      } else {
        frameCache.set(cacheKey, frames);
        finish(frames);
      }
    };

    video.onseeked = captureFrame;

    video.onloadedmetadata = () => {
      video.currentTime = sourceStartTime;
    };

    video.onerror = () => {
      finish([]);
    };

    // Timeout fallback
    setTimeout(() => {
      if (!resolved) {
        finish(frames.length > 0 ? frames : []);
      }
    }, 10000);

    video.src = videoUrl;
  });
}

interface TimelineClipProps {
  clip: Clip;
  pixelsPerSecond: number;
  isSelected: boolean;
  isDragging: boolean;
  trackLocked: boolean;
}

export const TimelineClip = memo(function TimelineClip({
  clip,
  pixelsPerSecond,
  isSelected,
  isDragging,
  trackLocked,
}: TimelineClipProps) {
  const selectClip = useEditorStore((s) => s.selectClip);
  const startDrag = useEditorStore((s) => s.startDrag);
  const removeClip = useEditorStore((s) => s.removeClip);
  const splitClip = useEditorStore((s) => s.splitClip);
  const duplicateClip = useEditorStore((s) => s.duplicateClip);
  const linkClips = useEditorStore((s) => s.linkClips);
  const unlinkClip = useEditorStore((s) => s.unlinkClip);
  const addClipEffect = useEditorStore((s) => s.addClipEffect);
  const currentTime = useEditorStore((s) => s.currentTime);
  const selection = useEditorStore((s) => s.selection);
  const clipIdSet = useEditorStore(selectClipIdSet);
  const enterCompoundClip = useEditorStore((s) => s.enterCompoundClip);

  // Calculate position and width (guard against null/zero pixelsPerSecond)
  const safePPS = pixelsPerSecond > 0 && Number.isFinite(pixelsPerSecond) ? pixelsPerSecond : 50;
  const left = clip.startTime * safePPS;
  const width = Math.max((clip.endTime - clip.startTime) * safePPS, 20);

  // State for extracted video frames
  const [extractedFrames, setExtractedFrames] = useState<string[]>([]);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Effect drag-over state
  const [effectDragOver, setEffectDragOver] = useState(false);

  const handleEffectDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('application/effect')) return;
      if (!hasEffects(clip)) return;
      if (trackLocked) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setEffectDragOver(true);
    },
    [clip, trackLocked]
  );

  const handleEffectDragLeave = useCallback((e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    const currentTarget = e.currentTarget as HTMLElement;
    if (relatedTarget && currentTarget.contains(relatedTarget)) return;
    setEffectDragOver(false);
  }, []);

  const handleEffectDrop = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('application/effect')) return;
      e.preventDefault();
      e.stopPropagation();
      setEffectDragOver(false);
      const data = e.dataTransfer.getData('application/effect');
      if (!data || !hasEffects(clip)) return;
      try {
        const effect = JSON.parse(data);
        const clipEffect = createClipEffectFromDefinition(effect);
        addClipEffect(clip.id, clipEffect);
      } catch {
        // ignore parse errors
      }
    },
    [clip, addClipEffect]
  );

  // Handle clip click
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setContextMenu(null);
      selectClip(clip.id, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
    },
    [clip.id, selectClip]
  );

  // Handle right-click context menu
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      selectClip(clip.id);
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [clip.id, selectClip]
  );

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [contextMenu]);

  // Can this clip be linked? (video or audio with another selected)
  const canLink = !clip.linkedClipId && (clip.type === 'video' || clip.type === 'audio') &&
    selection.clipIds.length === 2 && clipIdSet.has(clip.id);

  // Can split at current playhead?
  const canSplit = currentTime > clip.startTime && currentTime < clip.endTime;

  // Handle drag start
  const handleDragStart = useCallback(
    (e: React.MouseEvent, operation: DragOperation) => {
      if (trackLocked) return;
      e.stopPropagation();
      e.preventDefault();

      // Calculate the time at which the user clicked, using the clip's own
      // bounding rect. This is robust regardless of horizontal scroll or
      // whether the clip extends beyond the viewport — the cursor's offset
      // within the clip directly maps to a time offset from the clip's start.
      const clipEl = e.currentTarget.closest('[data-clip-id]') as HTMLElement | null;
      const clipRect = clipEl?.getBoundingClientRect();
      const offsetWithinClipPx = clipRect ? e.clientX - clipRect.left : 0;
      const ppsForClick = safePPS;
      const clickTime = clip.startTime + offsetWithinClipPx / ppsForClick;

      // Alt+drag: Roll Edit on edges, Slip Edit on body
      let finalOp = operation;
      let adjacentClipId: string | undefined;
      let adjacentOriginalClip: typeof clip | undefined;

      // Alt+Shift+trim-end = Rate Stretch (change speed by dragging end, video only)
      if (e.altKey && e.shiftKey && operation === 'trim-end' && clip.type === 'video') {
        finalOp = 'rate-stretch';
      }

      // Alt+move = Slip Edit (shift source without moving clip)
      if (e.altKey && !e.shiftKey && operation === 'move') {
        finalOp = 'slip';
      }

      if (e.altKey && !e.shiftKey && (operation === 'trim-start' || operation === 'trim-end')) {
        const trackClips = useEditorStore.getState().tracks.find((t) => t.id === clip.trackId)?.clips ?? [];
        if (operation === 'trim-start') {
          // Find clip whose end touches this clip's start
          const adj = trackClips.find((c) => c.id !== clip.id && Math.abs(c.endTime - clip.startTime) < 0.01);
          if (adj) { finalOp = 'roll-start'; adjacentClipId = adj.id; adjacentOriginalClip = { ...adj }; }
        } else {
          // Find clip whose start touches this clip's end
          const adj = trackClips.find((c) => c.id !== clip.id && Math.abs(c.startTime - clip.endTime) < 0.01);
          if (adj) { finalOp = 'roll-end'; adjacentClipId = adj.id; adjacentOriginalClip = { ...adj }; }
        }
      }

      // Save linked clip's original state for delta-based dragging
      let linkedOriginalClip: typeof clip | undefined;
      if (clip.linkedClipId) {
        const linkedFound = useEditorStore.getState().tracks
          .flatMap((t) => t.clips)
          .find((c) => c.id === clip.linkedClipId);
        if (linkedFound) linkedOriginalClip = { ...linkedFound };
      }

      startDrag({
        clipId: clip.id,
        trackId: clip.trackId,
        operation: finalOp,
        startX: e.clientX,
        startTime: clickTime,
        originalClip: { ...clip },
        linkedOriginalClip,
        adjacentClipId,
        adjacentOriginalClip,
      });
    },
    [clip, trackLocked, startDrag, safePPS]
  );

  // Get audio/music assetId for waveform analysis (must be before waveformHeights useMemo)
  const audioOrMusicClip = (clip.type === 'audio' || clip.type === 'music')
    ? (clip as AudioClip | MusicClip)
    : null;
  const audioAssetId = audioOrMusicClip?.assetId ?? null;
  const existingWaveformData = audioOrMusicClip?.waveformData;
  const showWaveforms = useEditorStore((s) => s.showWaveforms);

  // This clip's window into the source. Peaks always span the FULL source
  // [0, sourceDuration]; after a split/trim the clip covers only part of it, so we
  // slice the peaks to [sourceStartTime, sourceEndTime] at render time.
  const clipDuration = Math.max(0.01, clip.endTime - clip.startTime);
  const sourceDuration =
    audioOrMusicClip?.sourceDuration && audioOrMusicClip.sourceDuration > 0
      ? audioOrMusicClip.sourceDuration
      : clipDuration;
  const sourceWindowStart = audioOrMusicClip?.sourceStartTime ?? 0;
  const sourceWindowEnd = audioOrMusicClip?.sourceEndTime ?? sourceDuration;

  // Analyze the FULL source at a fixed TIME resolution (peaks-per-second), NOT clip
  // pixel width. Tying density to width meant a long source collapsed into a handful
  // of coarse samples (~0.2s each) and splitting sliced that down to almost nothing
  // ("one bar"). At ~140 peaks/sec each sample is ~7ms, like pro editors — and it's
  // stable across zoom/splits so the cached peaks are reused, not re-analyzed.
  const WAVEFORM_PEAKS_PER_SECOND = 1200;
  const targetSampleCount = Math.min(
    Math.max(Math.round(sourceDuration * WAVEFORM_PEAKS_PER_SECOND), 2400),
    180000
  );

  // Web Audio decoding holds the whole PCM in memory, so we skip it for very long
  // sources (handled out-of-process instead) to avoid a multi-GB OOM spike.
  const tooLongForWebDecode = sourceDuration > MAX_WEB_DECODE_SECONDS;

  // Long sources are extracted out-of-process via ffmpeg in the main process. Only a
  // direct file/http source is ffmpeg-readable — a bare server id or blob: URL is not.
  const ffmpegReadableSrc =
    audioAssetId &&
    /^(file:|https?:|[A-Za-z]:[\\/]|\/)/.test(audioAssetId) &&
    !audioAssetId.startsWith('blob:')
      ? audioAssetId
      : null;

  // Peaks are no longer persisted on the clip (that bloated undo-history / project save
  // via structuredClone and duplicated on every split). They live only in the
  // analyzer's in-memory asset cache; `existingWaveformData` is read solely as a
  // fallback for projects saved by older builds.
  const hasUsableExistingData =
    !!existingWaveformData && existingWaveformData.length >= targetSampleCount * 0.9;
  const needsWaveformAnalysis =
    !!audioAssetId && showWaveforms && !hasUsableExistingData && !tooLongForWebDecode;

  const { url: cachedAudioUrl, error: audioAssetError } = useCachedAssetUrlById(
    audioAssetId,
    'audio/*',
    { type: 'preview', enabled: needsWaveformAnalysis }
  );
  // Selected clip jumps the analysis queue so the focused part resolves first.
  const { peaks: analyzedPeaks, isLoading: isAnalyzingWaveform } = useWaveformAnalyzer(
    needsWaveformAnalysis ? cachedAudioUrl : null,
    targetSampleCount,
    {
      priority: isSelected ? 10 : 1,
      sourceDuration,
      mainSrc: tooLongForWebDecode ? ffmpegReadableSrc : undefined,
    }
  );

  // Normalized waveform peaks (0..1) from real audio analysis only
  const waveformPeaks = useMemo<number[]>(() => {
    if (clip.type !== 'audio' && clip.type !== 'music') return [];
    if (analyzedPeaks && analyzedPeaks.length > 0) return analyzedPeaks;
    if (existingWaveformData && existingWaveformData.length > 0) return existingWaveformData;
    return [];
  }, [clip.type, analyzedPeaks, existingWaveformData]);

  // Slice the full-source peaks down to this clip's actual source window.
  const visibleWaveformPeaks = useMemo<number[]>(() => {
    const peaks = waveformPeaks;
    if (peaks.length < 2 || sourceDuration <= 0) return peaks;
    let startFrac = sourceWindowStart / sourceDuration;
    let endFrac = sourceWindowEnd / sourceDuration;
    startFrac = Math.max(0, Math.min(1, startFrac));
    endFrac = Math.max(startFrac, Math.min(1, endFrac));
    // Essentially the full range → no slicing needed (untrimmed clip).
    if (startFrac <= 0.001 && endFrac >= 0.999) return peaks;
    const startIdx = Math.floor(startFrac * peaks.length);
    const endIdx = Math.max(startIdx + 2, Math.ceil(endFrac * peaks.length));
    return peaks.slice(startIdx, endIdx);
  }, [waveformPeaks, sourceWindowStart, sourceWindowEnd, sourceDuration]);

  // Build a dense Premiere-style vertical-bar waveform. ~1 bar per 1.5px of clip width
  // (fine division), each bar slightly narrower than its slot so a hairline gap shows
  // the bars individually — a contiguous fill (old behavior) reads as a flat rectangle.
  const { waveformPath, waveformViewBox } = useMemo(() => {
    const src = visibleWaveformPeaks;
    if (src.length < 2) return { waveformPath: '', waveformViewBox: '0 0 1 100' };
    const barCount = Math.max(16, Math.min(Math.floor(width), src.length, 24000));
    const vbH = 100;
    const mid = vbH / 2;
    const maxAmp = mid - 1;
    const barW = 0.85; // bar width within each 1-unit slot → hairline gap between bars
    let d = '';
    for (let i = 0; i < barCount; i++) {
      // Max-pool the source peaks that fall into this display bar.
      const from = Math.floor((i / barCount) * src.length);
      const to = Math.max(from + 1, Math.floor(((i + 1) / barCount) * src.length));
      let peak = 0;
      for (let j = from; j < to; j++) if (src[j] > peak) peak = src[j];
      // Near-linear mapping so loud/quiet variation stays visible; keep a thin sliver
      // for quiet-but-audible bars, and true silence (≈0) drops to a gap.
      const a = peak > 0.015 ? Math.max(Math.pow(peak, 1.1) * maxAmp, 0.75) : 0;
      if (a <= 0) continue;
      const x = (i + (1 - barW) / 2).toFixed(2); // center bar in its slot
      d += `M${x},${(mid - a).toFixed(2)}h${barW}v${(a * 2).toFixed(2)}h-${barW}z`;
    }
    return { waveformPath: d, waveformViewBox: `0 0 ${barCount} 100` };
  }, [visibleWaveformPeaks, width]);

  // Calculate number of frames needed for video
  const frameCount = useMemo(() => {
    if (clip.type !== 'video') return 0;
    const frameWidth = 60;
    return Math.max(1, Math.floor(width / frameWidth));
  }, [clip.type, width]);

  // Get assetId and mediaType for video/image clips
  const videoClipData = clip.type === 'video' ? (clip as VideoClip) : null;
  const videoAssetId = videoClipData?.assetId ?? null;
  const isImageClip = videoClipData?.mediaType === 'image';

  // Get cached URL for the clip's asset (handles encrypted assets)
  const { url: cachedAssetUrl, error: videoAssetError, isLoading: videoAssetLoading } = useCachedAssetUrlById(
    videoAssetId,
    isImageClip ? 'image/*' : 'video/mp4',
    { type: 'preview', enabled: !!videoAssetId }
  );

  // Detect missing media: asset has ID but failed to load (not just loading)
  const isVideoMediaMissing = !!videoAssetId && !cachedAssetUrl && !videoAssetLoading && !!videoAssetError;
  const isAudioMediaMissing = !!audioAssetId && !cachedAudioUrl && !!audioAssetError;

  // Extract video frames on mount or when clip changes (skip for images)
  const videoSourceStartTime = clip.type === 'video' ? (clip as VideoClip).sourceStartTime || 0 : 0;
  useEffect(() => {
    if (clip.type !== 'video') return;
    if (!cachedAssetUrl) return;
    if (extractedFrames.length > 0) return;

    // For image clips, use the image URL directly for all frames
    if (isImageClip) {
      const imageFrames = Array(frameCount).fill(cachedAssetUrl);
      setExtractedFrames(imageFrames);
      return;
    }

    const clipDuration = clip.endTime - clip.startTime;

    extractVideoFrames(cachedAssetUrl, clipDuration, frameCount, videoSourceStartTime)
      .then((frames) => {
        setExtractedFrames(frames);
      })
      .catch(() => {
        setExtractedFrames([]);
      });
  }, [clip.type, clip.startTime, clip.endTime, videoSourceStartTime, frameCount, cachedAssetUrl, extractedFrames.length, isImageClip]);

  // Render missing media overlay (shared by video/audio/music)
  const renderMissingMediaOverlay = () => (
    <div className="absolute inset-0 flex items-center justify-center bg-red-950/80 border border-red-500/40">
      <div className="flex items-center gap-1 px-1.5 py-0.5">
        <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />
        <span className="text-[9px] text-red-300 font-medium truncate">Media Offline</span>
      </div>
    </div>
  );

  // Render video clip content (thumbnail frames)
  const renderVideoContent = () => {
    if (isVideoMediaMissing) return renderMissingMediaOverlay();

    const frames = extractedFrames.length > 0 ? extractedFrames : Array(frameCount).fill('');

    return (
      <div className="absolute inset-0 flex overflow-hidden bg-zinc-800">
        {frames.map((frameUrl, i) => (
          <div
            key={i}
            className="h-full flex-shrink-0 border-r border-zinc-700/30 last:border-r-0"
            style={{ width: `${100 / frames.length}%` }}
          >
            {frameUrl ? (
              <img
                src={frameUrl}
                alt=""
                className="w-full h-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full bg-zinc-700/50 animate-pulse" />
            )}
          </div>
        ))}
        {/* Overlay gradient for readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/30 pointer-events-none" />
      </div>
    );
  };

  // Render audio clip content (waveform)
  const renderAudioContent = () => {
    if (isAudioMediaMissing) return renderMissingMediaOverlay();

    return (
      <div className="absolute inset-0 flex flex-col">
        <div className="flex-1 relative min-h-0 px-0.5 pt-[14px]">
          {waveformPath ? (
            <svg
              className="absolute inset-0 w-full h-full block"
              viewBox={waveformViewBox}
              preserveAspectRatio="none"
              aria-hidden
            >
              <path d={waveformPath} fill="rgb(6 78 59 / 0.85)" />
            </svg>
          ) : isAnalyzingWaveform ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] text-[#a8cce0] animate-pulse">Analyzing...</span>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center">
              <div className="w-full h-px bg-[#a8cce0]/40" />
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render subtitle clip content
  const renderSubtitleContent = () => {
    const subtitleClip = clip as SubtitleClip;

    return (
      <div className="absolute inset-0 flex items-center px-2">
        <p className="text-[11px] text-white truncate leading-tight">
          {subtitleClip.text}
        </p>
      </div>
    );
  };

  // Render music clip content
  const renderMusicContent = () => {
    if (isAudioMediaMissing) return renderMissingMediaOverlay();

    return (
      <div className="absolute inset-0 flex flex-col">
        <div className="flex-1 relative min-h-0 px-0.5 pt-[14px]">
          {waveformPath ? (
            <svg
              className="absolute inset-0 w-full h-full block"
              viewBox={waveformViewBox}
              preserveAspectRatio="none"
              aria-hidden
            >
              <path d={waveformPath} fill="rgb(6 78 59 / 0.85)" />
            </svg>
          ) : isAnalyzingWaveform ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] text-[#a8cce0] animate-pulse">Analyzing...</span>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center">
              <div className="w-full h-px bg-[#a8cce0]/30" />
            </div>
          )}
        </div>
      </div>
    );
  };

  // Get clip type specific styles
  const getClipStyles = () => {
    // Missing media overrides normal styles
    if ((clip.type === 'video' && isVideoMediaMissing) ||
        ((clip.type === 'audio' || clip.type === 'music') && isAudioMediaMissing)) {
      return {
        border: isSelected ? 'border-red-400' : 'border-red-500/60',
        ring: 'ring-red-400/50',
      };
    }

    switch (clip.type) {
      case 'video':
        return {
          border: isSelected ? 'border-[#7fb3d5]' : 'border-[#3a5a72]',
          ring: 'ring-[#7fb3d5]/60',
        };
      case 'audio':
        return {
          border: isSelected ? 'border-emerald-400' : 'border-emerald-900/60',
          ring: 'ring-emerald-400/50',
        };
      case 'subtitle':
        return {
          border: isSelected ? 'border-yellow-300' : 'border-zinc-600',
          ring: 'ring-yellow-300/50',
        };
      case 'music':
        return {
          border: isSelected ? 'border-emerald-300' : 'border-emerald-900/60',
          ring: 'ring-emerald-300/50',
        };
      case 'adjustment':
        return {
          border: isSelected ? 'border-purple-400' : 'border-purple-700/60',
          ring: 'ring-purple-400/50',
        };
      case 'compound':
        return {
          border: isSelected ? 'border-teal-400' : 'border-teal-700/60',
          ring: 'ring-teal-400/50',
        };
      default:
        return {
          border: isSelected ? 'border-zinc-400' : 'border-zinc-600',
          ring: 'ring-zinc-400/50',
        };
    }
  };

  const styles = getClipStyles();

  return (
    <div
      className={cn(
        'absolute h-full rounded-sm group cursor-pointer overflow-hidden',
        // Only transition colors — never geometry. Transitioning left/width would
        // make the clip edge lag behind the cursor while trimming/moving.
        'border transition-colors',
        styles.border,
        isSelected && `ring-2 ${styles.ring} z-10`,
        // No transform scale while dragging: scaling from the centre pushes both
        // edges out, so the trim handle stops matching the cursor.
        isDragging && 'cursor-grabbing opacity-70',
        effectDragOver && 'ring-2 ring-sky-400/50',
        trackLocked && 'opacity-50 cursor-not-allowed'
      )}
      style={{
        left: `${left}px`,
        width: `${width}px`,
      }}
      data-clip-id={clip.id}
      onClick={handleClick}
      onDoubleClick={(e) => {
        if (clip.type === 'compound') {
          e.stopPropagation();
          enterCompoundClip(clip.id);
        }
      }}
      onContextMenu={handleContextMenu}
      onMouseDown={(e) => !trackLocked && e.button === 0 && handleDragStart(e, 'move')}
      onDragOver={handleEffectDragOver}
      onDragLeave={handleEffectDragLeave}
      onDrop={handleEffectDrop}
    >
      {/* Content based on clip type */}
      {clip.type === 'video' && renderVideoContent()}
      {clip.type === 'audio' && renderAudioContent()}
      {clip.type === 'subtitle' && renderSubtitleContent()}
      {clip.type === 'music' && renderMusicContent()}
      {clip.type === 'adjustment' && (() => {
        const adjClip = clip as AdjustmentClip;
        const effectCount = adjClip.effects.filter((e) => e.enabled).length;
        return (
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              // Diagonal hatched pattern in purple/magenta — distinct from all other clip types
              background: `repeating-linear-gradient(
                -45deg,
                rgba(168,85,247,0.15) 0px,
                rgba(168,85,247,0.15) 4px,
                rgba(217,70,239,0.08) 4px,
                rgba(217,70,239,0.08) 10px
              )`,
              borderTop: '2px solid rgba(168,85,247,0.7)',
              borderBottom: '2px solid rgba(168,85,247,0.4)',
            }}
          >
            {/* Center label row */}
            <div className="absolute inset-0 flex items-center justify-center gap-1.5 pointer-events-none">
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-900/60 border border-purple-500/40">
                <span className="text-[9px] font-bold text-purple-300 tracking-widest uppercase leading-none">
                  Adj
                </span>
                {effectCount > 0 && (
                  <span className="text-[8px] font-semibold text-purple-400 leading-none">
                    {effectCount}fx
                  </span>
                )}
              </div>
            </div>
            {/* Opacity bar at bottom */}
            <div
              className="absolute bottom-0 left-0 right-0 h-0.5"
              style={{
                background: `rgba(168,85,247,${adjClip.opacity ?? 1})`,
              }}
            />
          </div>
        );
      })()}
      {clip.type === 'compound' && (() => {
        const compClip = clip as CompoundClip;
        const clipCount = compClip.innerClips.length;
        return (
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              background: `linear-gradient(135deg, rgba(20,184,166,0.2) 0%, rgba(6,182,212,0.15) 100%)`,
              borderTop: '2px solid rgba(20,184,166,0.7)',
              borderBottom: '2px solid rgba(6,182,212,0.4)',
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center gap-1.5 pointer-events-none">
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-900/60 border border-teal-500/40">
                <span className="text-[9px] font-bold text-teal-300 tracking-widest uppercase leading-none">
                  Compound
                </span>
                <span className="text-[8px] font-semibold text-teal-400 leading-none">
                  {clipCount} clips
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Clip name label */}
      <div className="absolute top-0 left-0 right-0 px-1.5 py-0.5 bg-black/50 backdrop-blur-sm flex items-center gap-1">
        {clip.linkedClipId && (
          <Link2 className="w-3 h-3 text-sky-400 flex-shrink-0" />
        )}
        <span className="text-[10px] text-white font-medium truncate flex-1">
          {clip.name}
        </span>
        {hasEffects(clip) && clip.effects.length > 0 && (
          <span className="text-[9px] font-bold text-white bg-zinc-500/80 rounded px-1 py-px flex-shrink-0 leading-none">
            fx{clip.effects.length}
          </span>
        )}
      </div>

      {/* Muted indicator for audio */}
      {clip.type === 'audio' && (clip as AudioClip).muted && (
        <div className="absolute top-0.5 right-1 bg-black/50 rounded p-0.5">
          <VolumeX className="w-3 h-3 text-red-400" />
        </div>
      )}

      {/* Trim handle - start */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize z-20',
          'bg-white/0 hover:bg-white/30 transition-colors',
          'group-hover:bg-white/20'
        )}
        onMouseDown={(e) => handleDragStart(e, 'trim-start')}
      />

      {/* Trim handle - end */}
      <div
        className={cn(
          'absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize z-20',
          'bg-white/0 hover:bg-white/30 transition-colors',
          'group-hover:bg-white/20'
        )}
        onMouseDown={(e) => handleDragStart(e, 'trim-end')}
      />

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Split */}
          {canSplit && (
            <button
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
              onClick={() => { splitClip(clip.id, currentTime); setContextMenu(null); }}
            >
              <Scissors className="w-3 h-3" />
              Split at Playhead
            </button>
          )}

          {/* Duplicate */}
          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            onClick={() => { duplicateClip(clip.id); setContextMenu(null); }}
          >
            <Copy className="w-3 h-3" />
            Duplicate
          </button>

          {/* Link / Unlink */}
          {clip.linkedClipId ? (
            <button
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
              onClick={() => { unlinkClip(clip.id); setContextMenu(null); }}
            >
              <Unlink className="w-3 h-3" />
              Unlink Clip
            </button>
          ) : canLink ? (
            <button
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
              onClick={() => {
                const otherId = selection.clipIds.find((id) => id !== clip.id);
                if (otherId) linkClips(clip.id, otherId);
                setContextMenu(null);
              }}
            >
              <Link className="w-3 h-3" />
              Link Selected Clips
            </button>
          ) : null}

          {/* Divider */}
          <div className="border-t border-zinc-700 my-1" />

          {/* Delete */}
          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-400 hover:bg-zinc-800 hover:text-red-300 transition-colors"
            onClick={() => { removeClip(clip.id); setContextMenu(null); }}
          >
            <Trash2 className="w-3 h-3" />
            Delete{clip.linkedClipId ? ' (with linked)' : ''}
          </button>
        </div>
      )}
    </div>
  );
});

export default TimelineClip;
