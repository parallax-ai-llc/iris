/**
 * EditorPreview - Video preview with subtitle overlay
 * Shows video playback with real-time subtitle rendering and position controls
 */

import { memo, useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { cn } from '@/shared/lib/utils';
import {
  useEditorStore,
  type VideoClip,
  type AudioClip,
  type MusicClip,
  type SubtitleClip,
  type AdjustmentClip,
} from '@/features/video-editor/stores/editor.store';
import { useShallow } from 'zustand/react/shallow';
import { selectPreviewState, selectPreviewActions } from '@/features/video-editor/stores/editor/selectors';
import { useCachedAssetUrlById } from '@/shared/hooks/useCachedAssetUrl';
import { useProxyAwareAssetId } from '@/features/video-editor/stores/editor/proxyResolve';
import type { ClipEffect } from '@/types/videoProject.types';
import { ChromaKeyCanvas } from './ChromaKeyCanvas';
import { HslSecondaryCanvas } from './HslSecondaryCanvas';
import { AudioPlayer } from './AudioPlayer';
import { SubtitleOverlay } from './SubtitleOverlay';
import { OverlayLayer } from './OverlayLayer';
import { PreviewZoomControls } from './PreviewZoomControls';
import { usePreviewZoom, ZOOM_MIN, ZOOM_MAX } from '@/features/video-editor/hooks/usePreviewZoom';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import { interpolateKeyframes } from '@/shared/lib/utils/effectRenderer';
import {
  buildColorCorrectionSvgFilter,
  buildColorCorrectionCssFilter,
} from '@/features/video-editor/lib/videoColorFilters';

interface EditorPreviewProps {
  thumbnailUrl?: string;
  className?: string;
}

export const EditorPreview = memo(function EditorPreview({
  thumbnailUrl,
  className,
}: EditorPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Store state (batched via useShallow — 11 subscriptions → 2)
  const {
    currentTime, isPlaying, playbackRate,
    volume, isMuted, tracks, selectedClip,
  } = useEditorStore(useShallow(selectPreviewState));

  const { selectClip } = useEditorStore(useShallow(selectPreviewActions));

  const updateSubtitleStyle = useEditorStore((s) => s.updateSubtitleStyle);
  const pause = useEditorStore((s) => s.pause);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);

  // Scale subtitles relative to project resolution.
  // Track BOTH width and height so we can compute the actual video display rect
  // (object-contain letterboxing) — subtitles must be positioned in % of the
  // visible video frame, not the full container including letterbox.
  const projectWidth = useVideoProjectStore((s) => s.currentProject?.width ?? 1280);
  const projectHeight = useVideoProjectStore((s) => s.currentProject?.height ?? 720);
  const [containerSize, setContainerSize] = useState({ width: 1, height: 1 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const videoRect = useMemo(() => {
    const cR = containerSize.width / containerSize.height;
    const pR = projectWidth / projectHeight;
    let w: number, h: number;
    if (cR > pR) {
      h = containerSize.height;
      w = h * pR;
    } else {
      w = containerSize.width;
      h = w / pR;
    }
    return {
      width: w,
      height: h,
      left: (containerSize.width - w) / 2,
      top: (containerSize.height - h) / 2,
    };
  }, [containerSize, projectWidth, projectHeight]);
  const subtitleScale = videoRect.width / projectWidth;

  // The visible "stage" is locked to the project aspect ratio and centred inside
  // the (arbitrarily sized) preview panel. All video content, overlays and the
  // safe-area guide live inside this stage so the output ratio stays fixed
  // regardless of viewport / panel size.
  const stageStyle = useMemo<React.CSSProperties>(() => ({
    position: 'absolute',
    left: videoRect.left,
    top: videoRect.top,
    width: videoRect.width,
    height: videoRect.height,
  }), [videoRect]);
  // Inside the stage the video frame IS the full stage, so subtitles position
  // against a zero-origin rect of the stage's pixel size.
  const stageRect = useMemo(
    () => ({ left: 0, top: 0, width: videoRect.width, height: videoRect.height }),
    [videoRect],
  );

  // Viewport zoom & pan for the stage (view-only inspection aid).
  const {
    zoom, transform: zoomTransform, isPanning,
    zoomIn, zoomOut, fit, setZoomLevel, onPanStart,
  } = usePreviewZoom(videoRect, containerRef);

  // Ref to track last update time for manual timeline progression
  const lastUpdateRef = useRef<number>(Date.now());

  // Ref to track rAF IDs for reliable cleanup
  const videoRafRef = useRef<number>(0);
  const manualRafRef = useRef<number>(0);
  // Last timeline time written by the playback rAF loop. Used to distinguish
  // natural playback progression (store update comes from our own rAF) from a
  // user-initiated seek (store update came from somewhere else, e.g. scrubbing
  // the playhead while playing).
  const lastRafTimelineRef = useRef<number>(-1);

  // Active clip per visible video track at the current time. Index 0 is the
  // top-most track (highest compositing layer).
  const videoLayerEntries = useMemo(() => {
    const videoTracks = tracks.filter((t) => t.type === 'video' && t.visible);
    return videoTracks.map((track) => ({
      track,
      clip:
        (track.clips.find(
          (clip) =>
            clip.type === 'video' &&
            currentTime >= clip.startTime &&
            currentTime < clip.endTime,
        ) as VideoClip | undefined) || null,
    }));
  }, [tracks, currentTime]);

  // Base video clip — drives the primary <video> element (playback, audio,
  // seeking, effects). It's the bottom-most visible video track that carries a
  // real (non-image) video clip; image clips always composite as overlays.
  const activeVideoClip = useMemo(() => {
    for (let i = videoLayerEntries.length - 1; i >= 0; i--) {
      const clip = videoLayerEntries[i].clip;
      if (clip && clip.mediaType !== 'image') return clip;
    }
    return null;
  }, [videoLayerEntries]);

  // Overlay clips — every active video clip except the base, ordered
  // bottom→top so the top-most track paints last (on top). Images render at
  // natural size; non-base videos fit the frame.
  const overlayLayers = useMemo(() => {
    const baseId = activeVideoClip?.id;
    return videoLayerEntries
      .filter((e) => e.clip && e.clip.id !== baseId)
      .reverse();
  }, [videoLayerEntries, activeVideoClip]);

  // True when the currently-selected clip is one of the overlay layers — used to
  // un-clip the stage so its transform handles stay reachable for big images.
  const overlaySelected = useMemo(
    () => overlayLayers.some((e) => e.clip && e.clip.id === selectedClip?.id),
    [overlayLayers, selectedClip?.id],
  );

  // True when the base video clip is selected — used both to un-clip the stage
  // (so scaled-up handles stay reachable) and to render the transform gizmo.
  const baseSelected = useMemo(
    () => !!activeVideoClip && activeVideoClip.id === selectedClip?.id,
    [activeVideoClip, selectedClip?.id],
  );

  // Extract the chroma-key effect from the active video clip (if present and enabled)
  const chromaKeyEffect = useMemo(() => {
    if (!activeVideoClip?.effects) return null;
    return activeVideoClip.effects.find(
      (e) => e.enabled && e.filterType === 'chroma-key'
    ) ?? null;
  }, [activeVideoClip]);

  // Extract HSL Secondary params from active color-correction effect
  const hslSecondaryParams = useMemo(() => {
    if (!activeVideoClip?.effects) return null;
    const allEffects = [...activeVideoClip.effects];
    const ccEffect = allEffects.find(
      (e) => e.enabled && e.filterType === 'color-correction'
    );
    if (!ccEffect) return null;
    const p = (ccEffect.filterParams ?? {}) as Record<string, unknown>;
    const hslHue = p.hslHue as number[] | undefined;
    const hslSaturation = p.hslSaturation as number[] | undefined;
    const hslLuminance = p.hslLuminance as number[] | undefined;
    if (!hslHue && !hslSaturation && !hslLuminance) return null;
    const zeros = [0, 0, 0, 0, 0, 0, 0, 0];
    const hue = hslHue ?? zeros;
    const sat = hslSaturation ?? zeros;
    const lum = hslLuminance ?? zeros;
    // Only enable if any channel has a non-zero value
    const hasValue = hue.some(v => v !== 0) || sat.some(v => v !== 0) || lum.some(v => v !== 0);
    if (!hasValue) return null;
    return { hslHue: hue, hslSaturation: sat, hslLuminance: lum };
  }, [activeVideoClip]);

  // Get active adjustment layer effects (from adjustment tracks above the video).
  // Each effect's filterIntensity is scaled by the clip's opacity (0-1) to allow
  // partial blending — matching Premiere Pro's adjustment layer opacity control.
  const adjustmentEffects = useMemo(() => {
    const adjTracks = tracks.filter((t) => t.type === 'adjustment' && t.visible && !t.muted);
    const effects: ClipEffect[] = [];
    for (const track of adjTracks) {
      for (const clip of track.clips) {
        if (clip.type === 'adjustment' && currentTime >= clip.startTime && currentTime < clip.endTime) {
          const adjClip = clip as AdjustmentClip;
          const clipOpacity = adjClip.opacity ?? 1;
          // Scale each effect's intensity by the clip opacity for blend control
          const scaledEffects = (adjClip.effects || [])
            .filter((e) => e.enabled)
            .map((e) => ({
              ...e,
              filterIntensity: e.filterIntensity !== undefined
                ? e.filterIntensity * clipOpacity
                : undefined,
            }));
          effects.push(...scaledEffects);
        }
      }
    }
    return effects;
  }, [tracks, currentTime]);

  // SVG filter definitions for advanced color correction (temp, tint, curves, wheels, etc.)
  const svgColorFilterDefs = useMemo(() => {
    if (!activeVideoClip) return '';
    const allEffects = [...(activeVideoClip.effects || []), ...adjustmentEffects];
    const ccEffects = allEffects.filter(
      (e) => e.enabled && e.filterType === 'color-correction',
    );
    if (ccEffects.length === 0) return '';
    return ccEffects
      .map((e) => {
        const rawP = (e.filterParams ?? {}) as Record<string, unknown>;
        const intensity = Math.max(0, Math.min(1, (e.filterIntensity ?? 100) / 100));
        const p: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rawP)) {
          if (typeof v === 'number') p[k] = v * intensity;
          else p[k] = v;
        }
        const result = buildColorCorrectionSvgFilter(activeVideoClip.id, p, e.id);
        return result?.filterDef ?? null;
      })
      .filter(Boolean)
      .join('\n');
  }, [activeVideoClip, adjustmentEffects]);

  // Track previous clip ID to detect clip transitions
  const prevClipIdRef = useRef<string | null>(null);

  // Get cached URL for the active video clip's asset
  // This handles encrypted assets that need decryption
  const activeAssetId = activeVideoClip?.assetId;

  // Proxy mode swap: when on, this returns a file:// URL pointing at the
  // local low-res proxy so playback decodes faster. The image fallback path
  // keeps the original asset id since proxies are video-only.
  const playbackAssetId = useProxyAwareAssetId(activeAssetId);

  // Try to load as video first, fallback to image handled in render
  const { url: cachedVideoUrl, isLoading: isVideoUrlLoading } = useCachedAssetUrlById(
    playbackAssetId,
    'video/mp4',
    { type: 'preview', enabled: !!playbackAssetId }
  );

  // Also get image URL for fallback
  const { url: cachedImageUrl, isLoading: isImageUrlLoading } = useCachedAssetUrlById(
    activeAssetId,
    'image/jpeg',
    { type: 'preview', enabled: !!activeAssetId }
  );

  // Track if video failed to load (means it's an image)
  const [videoLoadFailed, setVideoLoadFailed] = useState(false);
  
  // Reset video load failed state when clip changes
  useEffect(() => {
    setVideoLoadFailed(false);
  }, [activeVideoClip?.id]);

  const cachedClipUrl = videoLoadFailed ? cachedImageUrl : cachedVideoUrl;
  const isClipUrlLoading = videoLoadFailed ? isImageUrlLoading : isVideoUrlLoading;
  const showingImage = videoLoadFailed && !!cachedImageUrl;

  // Check if we should show black screen (no active video clip or loading)
  const showBlackScreen = !activeVideoClip || !cachedClipUrl || isClipUrlLoading;

  // Get active subtitles at current time
  const activeSubtitles = useMemo(() => {
    const subtitleTracks = tracks.filter((t) => t.type === 'subtitle' && t.visible);
    if (subtitleTracks.length === 0) return [];

    return subtitleTracks.flatMap((track) =>
      track.clips.filter(
        (clip) =>
          clip.type === 'subtitle' &&
          currentTime >= clip.startTime &&
          currentTime <= clip.endTime
      )
    ) as SubtitleClip[];
  }, [tracks, currentTime]);

  // Get all audio + music clips with track-level volume (we'll render AudioPlayer for each)
  const audioClipsWithTrackInfo = useMemo(() => {
    const hasSolo = tracks.some((t) => t.solo && (t.type === 'audio' || t.type === 'music' || t.type === 'video'));
    const audioTracks = tracks.filter((t) => {
      if (t.type !== 'audio' && t.type !== 'music') return false;
      if (t.muted) return false;
      if (hasSolo && !t.solo) return false;
      return true;
    });
    const result: { clip: AudioClip | MusicClip; trackVolume: number }[] = [];
    for (const track of audioTracks) {
      for (const clip of track.clips) {
        if (clip.type === 'audio') result.push({ clip: clip as AudioClip, trackVolume: track.volume });
        else if (clip.type === 'music') result.push({ clip: clip as MusicClip, trackVolume: track.volume });
      }
    }
    return result;
  }, [tracks]);

  // Sync video playback with store & rAF-driven time sync
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying && activeVideoClip) {
      video.play().catch(() => {});

      // Use rAF to poll video.currentTime for smooth playhead movement
      const syncTime = () => {
        if (!video.paused && activeVideoClip) {
          const sourceTime = video.currentTime;
          const clipSpeed = activeVideoClip.speed ?? 1;

          // Enforce source boundary - stop if video played past clip's source end
          if (sourceTime >= activeVideoClip.sourceEndTime) {
            video.pause();
            setCurrentTime(activeVideoClip.endTime + 0.001);
            videoRafRef.current = requestAnimationFrame(syncTime);
            return;
          }

          const clipOffset = sourceTime - activeVideoClip.sourceStartTime;
          const timelineTime = activeVideoClip.startTime + clipOffset / clipSpeed;

          if (timelineTime >= activeVideoClip.endTime) {
            video.pause();
            lastRafTimelineRef.current = activeVideoClip.endTime + 0.001;
            setCurrentTime(activeVideoClip.endTime + 0.001);
          } else {
            lastRafTimelineRef.current = timelineTime;
            setCurrentTime(timelineTime);
          }
        }
        videoRafRef.current = requestAnimationFrame(syncTime);
      };
      videoRafRef.current = requestAnimationFrame(syncTime);

      return () => cancelAnimationFrame(videoRafRef.current);
    } else {
      video.pause();
    }
  }, [isPlaying, activeVideoClip, setCurrentTime]);

  // Manual timeline progression when:
  // - No video clip active (gap between clips)
  // - Showing an image (no video playback)
  // - Video URL still loading
  useEffect(() => {
    const needsManualProgression = isPlaying && (!activeVideoClip || showingImage || !cachedClipUrl || isClipUrlLoading);
    if (!needsManualProgression) return;

    lastUpdateRef.current = Date.now();

    const tick = () => {
      const now = Date.now();
      const deltaSeconds = ((now - lastUpdateRef.current) / 1000) * playbackRate;
      lastUpdateRef.current = now;

      const { currentTime: ct, duration: dur } = useEditorStore.getState();
      const newTime = ct + deltaSeconds;

      if (activeVideoClip && newTime >= activeVideoClip.endTime) {
        lastRafTimelineRef.current = activeVideoClip.endTime + 0.001;
        setCurrentTime(activeVideoClip.endTime + 0.001);
      } else if (newTime >= dur) {
        pause();
        lastRafTimelineRef.current = dur;
        setCurrentTime(dur);
      } else {
        lastRafTimelineRef.current = newTime;
        setCurrentTime(newTime);
      }

      manualRafRef.current = requestAnimationFrame(tick);
    };

    manualRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(manualRafRef.current);
  }, [isPlaying, activeVideoClip, showingImage, cachedClipUrl, isClipUrlLoading, playbackRate, pause, setCurrentTime]);

  // Sync playback rate (global × per-clip speed)
  // HTMLMediaElement.playbackRate must be > 0; clamp to prevent crash
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      let clipSpeed = activeVideoClip?.speed ?? 1;
      if (activeVideoClip?.keyframes?.length) {
        const offset = currentTime - activeVideoClip.startTime;
        const kfSpeed = interpolateKeyframes(activeVideoClip.keyframes, 'speed', offset);
        if (kfSpeed !== undefined) clipSpeed = kfSpeed;
      }
      const rate = playbackRate * clipSpeed;
      video.playbackRate = Math.max(0.0625, Math.abs(rate));
    }
  }, [playbackRate, activeVideoClip?.speed, activeVideoClip?.keyframes, activeVideoClip?.startTime, currentTime]);

  // Compute video track volume (considering solo across all audio-producing tracks)
  const videoTrackVolume = useMemo(() => {
    const videoTrack =
      tracks.find((t) => t.id === activeVideoClip?.trackId) ??
      tracks.find((t) => t.type === 'video');
    if (!videoTrack) return 1;
    const hasSolo = tracks.some((t) => t.solo && (t.type === 'audio' || t.type === 'music' || t.type === 'video'));
    if (hasSolo && !videoTrack.solo) return 0;
    if (videoTrack.muted) return 0;
    return videoTrack.volume;
  }, [tracks, activeVideoClip?.trackId]);

  // Check if any audio/music track already has a clip playing the same asset.
  // When true the AudioPlayer handles audio → the <video> element must be muted
  // to prevent double audio.
  const audioHandledExternally = useMemo(() => {
    if (!activeVideoClip) return false;
    const assetId = activeVideoClip.assetId;
    return tracks.some(
      (t) =>
        (t.type === 'audio' || t.type === 'music') &&
        t.clips.some((c) => 'assetId' in c && c.assetId === assetId)
    );
  }, [activeVideoClip, tracks]);

  // When multicam is enabled with audio-follow, the multicam monitor unmutes
  // the active angle's <video>. The main preview must stay muted to avoid
  // double audio output.
  const multicamEnabled = useEditorStore((s) => s.multicamEnabled);
  const multicamAudioFollowVideo = useEditorStore((s) => s.multicamAudioFollowVideo);
  const multicamHandlesAudio = multicamEnabled && multicamAudioFollowVideo;

  // Sync volume (global × per-clip × track volume with keyframe interpolation)
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      if (audioHandledExternally || activeVideoClip?.audioExtracted || multicamHandlesAudio) {
        // Audio is played by AudioPlayer or by the active multicam angle, or the
        // clip's audio was extracted to a (possibly since-deleted) audio clip
        // → silence the main <video> element to prevent double/lingering output.
        video.volume = 0;
        video.muted = true;
      } else {
        let clipVolume = activeVideoClip?.volume ?? 1;
        const clipMuted = activeVideoClip?.muted ?? false;
        if (activeVideoClip?.keyframes?.length) {
          const offset = currentTime - activeVideoClip.startTime;
          const kfVol = interpolateKeyframes(activeVideoClip.keyframes, 'volume', offset);
          if (kfVol !== undefined) clipVolume = kfVol;
        }
        video.volume = volume * clipVolume * videoTrackVolume;
        video.muted = isMuted || clipMuted;
      }
    }
  }, [volume, isMuted, activeVideoClip, currentTime, videoTrackVolume, audioHandledExternally, multicamHandlesAudio]);

  // Seek when currentTime changes externally (scrub, click-seek, clip transition).
  // During playback the rAF loop above drives video.currentTime → store, so we
  // must NOT fight it by reseeking every tick. We detect *user* seeks during
  // playback by comparing the incoming currentTime against the last value the
  // rAF loop wrote: if they differ meaningfully, the change came from outside.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideoClip) return;

    const clipSpeed = activeVideoClip.speed ?? 1;
    const clipOffset = currentTime - activeVideoClip.startTime;
    const sourceTime = activeVideoClip.sourceStartTime + clipOffset * clipSpeed;
    const isClipTransition = prevClipIdRef.current !== activeVideoClip.id;

    if (isPlaying) {
      // Only seek if this store update did NOT come from our own rAF tick.
      const rafDrift = Math.abs(currentTime - lastRafTimelineRef.current);
      if (isClipTransition || rafDrift > 0.12) {
        video.currentTime = sourceTime;
        lastRafTimelineRef.current = currentTime;
      }
    } else {
      if (isClipTransition || Math.abs(video.currentTime - sourceTime) > 0.1) {
        video.currentTime = sourceTime;
      }
    }
  }, [currentTime, activeVideoClip, isPlaying]);

  // When video source changes and loads, seek to correct position and resume playback
  const handleLoadedData = useCallback(() => {
    const video = videoRef.current;
    if (!video || !activeVideoClip) return;

    // Seek to the correct source time (account for clip speed)
    const clipSpeed = activeVideoClip.speed ?? 1;
    const clipOffset = currentTime - activeVideoClip.startTime;
    const sourceTime = activeVideoClip.sourceStartTime + clipOffset * clipSpeed;
    
    if (sourceTime >= 0 && sourceTime <= video.duration) {
      video.currentTime = sourceTime;
    }

    // Resume playback if was playing
    if (isPlaying) {
      video.play().catch(() => {});
    }
  }, [activeVideoClip, currentTime, isPlaying]);

  // Detect clip transitions and handle them
  useEffect(() => {
    const currentClipId = activeVideoClip?.id || null;
    
    if (prevClipIdRef.current !== currentClipId) {
      prevClipIdRef.current = currentClipId;
      // When transitioning to a new clip while playing, the video element will
      // automatically call handleLoadedData when the new URL loads
    }
  }, [activeVideoClip?.id]);

  const handleEnded = useCallback(() => {
    if (activeVideoClip) {
      // Advance past this clip so the next clip becomes active
      setCurrentTime(activeVideoClip.endTime + 0.001);
    } else {
      pause();
    }
  }, [activeVideoClip, setCurrentTime, pause]);

  // Handle subtitle position change
  const handleSubtitlePositionChange = useCallback(
    (clipId: string, position: { x: number; y: number }) => {
      updateSubtitleStyle(clipId, { position });
    },
    [updateSubtitleStyle]
  );

  // Handle subtitle resize (updates anchor + the changed dimension; merges so the
  // untouched dimension is preserved)
  const handleSubtitleResize = useCallback(
    (clipId: string, next: { position: { x: number; y: number }; width?: number; height?: number }) => {
      updateSubtitleStyle(clipId, next);
    },
    [updateSubtitleStyle]
  );

  // Handle subtitle selection
  const handleSubtitleSelect = useCallback(
    (clipId: string) => {
      selectClip(clipId);
    },
    [selectClip]
  );

  // Handle video error - fallback to image
  const handleVideoError = useCallback(() => {
    setVideoLoadFailed(true);
  }, []);

  // Toggle fullscreen on the preview area (container element)
  const handleToggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }, []);

  return (
    <div className={cn('relative flex flex-col overflow-hidden', className)}>
      {/* Hidden SVG for color correction filter definitions */}
      {svgColorFilterDefs && (
        <svg
          style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
          dangerouslySetInnerHTML={{ __html: `<defs>${svgColorFilterDefs}</defs>` }}
          aria-hidden="true"
        />
      )}

      {/* Preview area — fills remaining height above the zoom section.
          Floating overlays (fullscreen, speed HUD) position within this box. */}
      <div className="relative flex-1 min-h-0">
      {/* Video container — measures the available panel area + hosts zoom pan */}
      <div
        ref={containerRef}
        className={cn(
          'relative w-full h-full',
          zoom > 1.0001 && (isPanning ? 'cursor-grabbing' : 'cursor-grab'),
        )}
        onMouseDown={onPanStart}
      >
        {/* Stage — locked to the project output ratio, centred via videoRect.
            All video content + overlays + safe-area guide render inside it so the
            preview frame never changes shape with the viewport. The zoom
            transform scales/pans the whole stage around its centre. */}
        <div
          className={cn(
            'absolute bg-black ring-1 ring-white/10',
            // While an overlay or the base video clip is selected, let content +
            // transform handles spill past the frame so larger-than-frame media
            // stays editable (the outer preview panel still clips). Otherwise
            // crop to frame.
            overlaySelected || baseSelected ? 'overflow-visible' : 'overflow-hidden',
          )}
          style={{ ...stageStyle, transform: zoomTransform, transformOrigin: 'center center' }}
        >
        {/* Video element - hidden when showing image */}
        <video
          ref={videoRef}
          data-editor-preview-video
          src={!showingImage && cachedVideoUrl ? cachedVideoUrl : undefined}
          poster={thumbnailUrl}
          className={cn(
            'w-full h-full object-contain transition-all duration-100',
            (showBlackScreen || showingImage) && 'opacity-0 pointer-events-none absolute'
          )}
          style={activeVideoClip && !(showBlackScreen || showingImage) ? (() => {
            const effects = [...activeVideoClip.effects, ...adjustmentEffects];
            const clipOffset = currentTime - activeVideoClip.startTime;
            const clipDuration = activeVideoClip.endTime - activeVideoClip.startTime;
            const kfs = activeVideoClip.keyframes ?? [];

            // ── Keyframe-interpolated transform values ────────────────────
            const kfOpacity = interpolateKeyframes(kfs, 'opacity', clipOffset);
            const kfScale = interpolateKeyframes(kfs, 'scale', clipOffset);
            const kfX = interpolateKeyframes(kfs, 'x', clipOffset);
            const kfY = interpolateKeyframes(kfs, 'y', clipOffset);
            const kfRotation = interpolateKeyframes(kfs, 'rotation', clipOffset);
            const kfBlur = interpolateKeyframes(kfs, 'blur', clipOffset);
            const kfBrightness = interpolateKeyframes(kfs, 'brightness', clipOffset);
            const kfContrast = interpolateKeyframes(kfs, 'contrast', clipOffset);

            const baseOpacity = kfOpacity ?? activeVideoClip.transform.opacity;
            const baseScale = kfScale ?? activeVideoClip.transform.scale;
            const baseX = kfX ?? (activeVideoClip.transform.x ?? 0);
            const baseY = kfY ?? (activeVideoClip.transform.y ?? 0);
            const baseRotation = kfRotation ?? activeVideoClip.transform.rotation;

            // ── Transition opacity calculation ──────────────────────────────
            let transitionOpacity = baseOpacity;
            if (effects && effects.length > 0) {
              // Find enabled transition effects
              for (const eff of effects) {
                if (!eff.enabled || eff.type !== 'transition') continue;
                const dur = eff.transitionDuration ?? 0.5;
                if (dur <= 0) continue;

                if (eff.transitionType === 'fade' || eff.transitionType === 'dissolve') {
                  // Dissolve behaves like fade (opacity) in single-clip preview
                  const pos = eff.transitionPosition ?? 'start';
                  if ((pos === 'start' || pos === 'both') && clipOffset < dur) {
                    transitionOpacity = Math.min(transitionOpacity, clipOffset / dur);
                  }
                  if ((pos === 'end' || pos === 'both') && clipOffset > clipDuration - dur) {
                    transitionOpacity = Math.min(transitionOpacity, (clipDuration - clipOffset) / dur);
                  }
                }
              }
            }
            transitionOpacity = Math.max(0, Math.min(1, transitionOpacity));

            // ── CSS transform, clip-path for slide/zoom/wipe/blur transitions ─
            const flipX = effects?.some((e) => e.enabled && e.filterType === 'horizontal-flip') ? -1 : 1;
            const flipY = effects?.some((e) => e.enabled && e.filterType === 'vertical-flip') ? -1 : 1;
            let transitionTransform = `translate(${baseX}px, ${baseY}px) scale(${baseScale * flipX}, ${baseScale * flipY}) rotate(${baseRotation}deg)`;
            let transitionClipPath: string | undefined;
            let transitionBlur = 0;
            if (effects && effects.length > 0) {
              for (const eff of effects) {
                if (!eff.enabled || eff.type !== 'transition') continue;
                const dur = eff.transitionDuration ?? 0.5;
                if (dur <= 0) continue;

                if (eff.transitionType === 'slide') {
                  const pos = eff.transitionPosition ?? 'start';
                  if ((pos === 'start' || pos === 'both') && clipOffset < dur) {
                    const progress = clipOffset / dur;
                    const tx = (1 - progress) * -100;
                    transitionTransform = `translate(calc(${baseX}px + ${tx}%), ${baseY}px) scale(${baseScale * flipX}, ${baseScale * flipY}) rotate(${baseRotation}deg)`;
                  } else if ((pos === 'end' || pos === 'both') && clipOffset > clipDuration - dur) {
                    const progress = (clipDuration - clipOffset) / dur;
                    const tx = (1 - progress) * 100;
                    transitionTransform = `translate(calc(${baseX}px + ${tx}%), ${baseY}px) scale(${baseScale * flipX}, ${baseScale * flipY}) rotate(${baseRotation}deg)`;
                  }
                } else if (eff.transitionType === 'zoom') {
                  const pos = eff.transitionPosition ?? 'start';
                  const scale = eff.filterParams?.scale ?? 1.2;
                  if ((pos === 'start' || pos === 'both') && clipOffset < dur) {
                    const progress = clipOffset / dur;
                    const s = scale - (scale - baseScale) * progress;
                    transitionTransform = `translate(${baseX}px, ${baseY}px) scale(${s * flipX}, ${s * flipY}) rotate(${baseRotation}deg)`;
                  } else if ((pos === 'end' || pos === 'both') && clipOffset > clipDuration - dur) {
                    const progress = (clipDuration - clipOffset) / dur;
                    const s = baseScale + (scale - baseScale) * (1 - progress);
                    transitionTransform = `translate(${baseX}px, ${baseY}px) scale(${s * flipX}, ${s * flipY}) rotate(${baseRotation}deg)`;
                  }
                } else if (eff.transitionType === 'wipe') {
                  // Wipe: reveal from left to right using clip-path
                  const pos = eff.transitionPosition ?? 'start';
                  if ((pos === 'start' || pos === 'both') && clipOffset < dur) {
                    const progress = clipOffset / dur;
                    transitionClipPath = `inset(0 ${(1 - progress) * 100}% 0 0)`;
                  } else if ((pos === 'end' || pos === 'both') && clipOffset > clipDuration - dur) {
                    const progress = (clipDuration - clipOffset) / dur;
                    transitionClipPath = `inset(0 0 0 ${(1 - progress) * 100}%)`;
                  }
                } else if (eff.transitionType === 'blur') {
                  // Blur transition: blur in/out
                  const pos = eff.transitionPosition ?? 'start';
                  const maxBlur = eff.filterParams?.intensity ?? 20;
                  if ((pos === 'start' || pos === 'both') && clipOffset < dur) {
                    transitionBlur = maxBlur * (1 - clipOffset / dur);
                  } else if ((pos === 'end' || pos === 'both') && clipOffset > clipDuration - dur) {
                    transitionBlur = maxBlur * (1 - (clipDuration - clipOffset) / dur);
                  }
                }
              }
            }

            // ── CSS filters ──────────────────────────────────────────────────
            const filterStr = (() => {
              if (!effects || effects.length === 0) return undefined;
              const filters = effects
                .filter((e) => e.enabled && e.type === 'filter' && e.filterType)
                .map((e) => {
                  const v = e.filterIntensity ?? 50;
                  switch (e.filterType) {
                    case 'brightness': return `brightness(${1 + v / 100})`;
                    case 'contrast': return `contrast(${1 + v / 100})`;
                    case 'saturation': return `saturate(${1 + v / 100})`;
                    case 'hue': return `hue-rotate(${v}deg)`;
                    case 'blur': return `blur(${v}px)`;
                    case 'sepia': return `sepia(${v}%)`;
                    case 'grayscale': return `grayscale(${v}%)`;
                    case 'invert': return `invert(${v}%)`;
                    case 'sharpen':
                    case 'unsharp-mask': return `contrast(${1 + v / 200})`; // CSS approximation
                    case 'gaussian-blur': return `blur(${(v / 10).toFixed(1)}px)`;
                    case 'noise': return ''; // Canvas-only, not CSS
                    case 'horizontal-flip': return ''; // Applied via transform (see below)
                    case 'vertical-flip': return '';   // Applied via transform (see below)
                    case 'mosaic': return ''; // Canvas-only
                    case 'brightness-contrast': return `brightness(${1 + v / 100}) contrast(${1 + v / 100})`;
                    case 'chroma-key': return ''; // Applied via canvas, not CSS
                    case 'color-correction': {
                      // Lumetri Color: CSS filters for basic params + SVG filter for advanced.
                      // Scale all params by the effect's intensity slider (0-100) so the
                      // Effects-panel intensity control mixes the color correction in/out.
                      const rawP = (e.filterParams || {}) as Record<string, unknown>;
                      const intensity = Math.max(0, Math.min(1, (e.filterIntensity ?? 100) / 100));
                      const p: Record<string, unknown> = {};
                      for (const [k, v] of Object.entries(rawP)) {
                        if (typeof v === 'number') p[k] = v * intensity;
                        else p[k] = v; // arrays (curves, hsl, wheels) pass through unchanged
                      }
                      const cssPart = buildColorCorrectionCssFilter(p);
                      const svgResult = activeVideoClip
                        ? buildColorCorrectionSvgFilter(activeVideoClip.id, p, e.id)
                        : null;
                      const svgPart = svgResult ? `url(#${svgResult.filterId})` : '';
                      return [cssPart, svgPart].filter(Boolean).join(' ');
                    }
                    case 'black-and-white': return `grayscale(100%)`;
                    case 'tint': {
                      const sat = Math.round((v / 100) * 200);
                      return `sepia(${Math.round(v)}%) saturate(${sat}%)`;
                    }
                    case 'glow': return `drop-shadow(0 0 ${Math.max(2, Math.round(v / 10))}px rgba(255,255,255,0.8))`;
                    case 'camera-blur':
                    case 'compound-blur': return `blur(${(v / 10).toFixed(1)}px)`;
                    case 'anti-alias-blur': return `blur(0.5px)`;
                    case 'solarize': return `invert(${Math.round(v * 0.5)}%) brightness(${1 + v / 200})`;
                    case 'emboss': return `grayscale(100%) contrast(${200 + v})%`; // CSS approximation
                    case 'auto-contrast':
                    case 'auto-levels':
                    case 'auto-color': return `contrast(${1 + v / 200})`;
                    case 'proc-amp': {
                      const p = (e.filterParams || {}) as Record<string, unknown>;
                      const parts: string[] = [];
                      if (p.brightness) parts.push(`brightness(${1 + (p.brightness as number) / 100})`);
                      if (p.contrast) parts.push(`contrast(${1 + (p.contrast as number) / 100})`);
                      if (p.saturation) parts.push(`saturate(${1 + (p.saturation as number) / 100})`);
                      if (p.hue) parts.push(`hue-rotate(${p.hue}deg)`);
                      return parts.join(' ') || '';
                    }
                    case 'gamma-correction': {
                      const p = (e.filterParams || {}) as Record<string, unknown>;
                      const gamma = (p.gamma as number) ?? 1;
                      return `brightness(${Math.pow(0.5, gamma - 1).toFixed(3)})`;
                    }
                    case 'fast-color-corrector':
                    case 'luma-corrector': {
                      const p = (e.filterParams || {}) as Record<string, unknown>;
                      const parts: string[] = [];
                      if (p.brightness) parts.push(`brightness(${1 + (p.brightness as number) / 100})`);
                      if (p.contrast) parts.push(`contrast(${1 + (p.contrast as number) / 100})`);
                      if (p.saturation) parts.push(`saturate(${1 + (p.saturation as number) / 100})`);
                      return parts.join(' ') || '';
                    }
                    default: return '';
                  }
                })
                .filter(Boolean)
                .join(' ');
              return filters || undefined;
            })();

            // Apply keyframe-animated filter values
            const kfFilters: string[] = [];
            if (kfBlur !== undefined) kfFilters.push(`blur(${kfBlur}px)`);
            if (kfBrightness !== undefined) kfFilters.push(`brightness(${kfBrightness})`);
            if (kfContrast !== undefined) kfFilters.push(`contrast(${kfContrast})`);

            // Combine: effect filters + keyframe filters + transition blur
            const combinedFilter = [filterStr, kfFilters.join(' '), transitionBlur > 0 ? `blur(${transitionBlur}px)` : ''].filter(Boolean).join(' ') || undefined;

            return {
              transform: transitionTransform,
              opacity: transitionOpacity,
              transformOrigin: 'center center',
              filter: combinedFilter,
              clipPath: transitionClipPath,
              mixBlendMode: (activeVideoClip.blendMode && activeVideoClip.blendMode !== 'normal')
                ? activeVideoClip.blendMode as React.CSSProperties['mixBlendMode']
                : undefined,
            } as React.CSSProperties;
          })() : undefined}
          playsInline
          crossOrigin="anonymous"
          onLoadedData={handleLoadedData}
          onEnded={handleEnded}
          onError={handleVideoError}
        />

        {/* Chroma-key canvas overlay — processes video frames pixel-by-pixel to
            remove the key colour. Rendered on top of the video element so that
            the keyed (transparent) result is composited over whatever is behind
            the preview container. */}
        {chromaKeyEffect && !showBlackScreen && !showingImage && (
          <ChromaKeyCanvas
            videoElement={videoRef.current}
            enabled={chromaKeyEffect.enabled}
            keyColor={(chromaKeyEffect.filterParams?.keyColor as string | undefined) ?? '#00FF00'}
            similarity={(chromaKeyEffect.filterParams?.similarity as number | undefined) ?? 40}
            smoothness={(chromaKeyEffect.filterParams?.smoothness as number | undefined) ?? 8}
            spillReduction={(chromaKeyEffect.filterParams?.spillReduction as number | undefined) ?? 50}
          />
        )}

        {/* HSL Secondary canvas overlay — per-hue channel H/S/L adjustments.
            Requires pixel-level hue detection so cannot use SVG filters. */}
        {hslSecondaryParams && !showBlackScreen && !showingImage && (
          <HslSecondaryCanvas
            videoElement={videoRef.current}
            enabled={true}
            hslHue={hslSecondaryParams.hslHue}
            hslSaturation={hslSecondaryParams.hslSaturation}
            hslLuminance={hslSecondaryParams.hslLuminance}
          />
        )}

        {/* Image element - shown when video fails to load */}
        {showingImage && cachedImageUrl && (
          <img
            src={cachedImageUrl}
            alt="Clip"
            className="w-full h-full object-contain"
          />
        )}
        
        {/* Vignette overlay - radial gradient since CSS filter can't do vignette */}
        {activeVideoClip && !showBlackScreen && (() => {
          const vignetteEffect = activeVideoClip.effects?.find(
            (e) => e.enabled && e.filterType === 'vignette'
          );
          if (!vignetteEffect) return null;
          const intensity = (vignetteEffect.filterIntensity ?? 50) / 100;
          return (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${intensity}) 100%)`,
              }}
            />
          );
        })()}

        {/* Noise effect overlay */}
        {activeVideoClip?.effects?.some(e => e.enabled && e.filterType === 'noise') && (() => {
          const nfx = activeVideoClip.effects.find(e => e.enabled && e.filterType === 'noise')!;
          const freq = 0.65 + (nfx.filterIntensity ?? 50) / 200;
          return (
            <>
              <svg className="absolute inset-0 w-0 h-0">
                <defs>
                  <filter id={`noise-filter-${activeVideoClip.id}`}>
                    <feTurbulence type="fractalNoise" baseFrequency={freq.toFixed(3)} numOctaves="4" stitchTiles="stitch" result="noise"/>
                    <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise"/>
                    <feBlend in="SourceGraphic" in2="grayNoise" mode="overlay" result="blend"/>
                    <feComposite in="blend" in2="SourceGraphic" operator="in"/>
                  </filter>
                </defs>
              </svg>
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ filter: `url(#noise-filter-${activeVideoClip.id})`, opacity: (nfx.filterIntensity ?? 50) / 100 }}
              />
            </>
          );
        })()}

        {/* Mosaic effect overlay */}
        {activeVideoClip?.effects?.some(e => e.enabled && e.filterType === 'mosaic') && (() => {
          const mfx = activeVideoClip.effects.find(e => e.enabled && e.filterType === 'mosaic')!;
          const px = Math.max(4, Math.round((mfx.filterIntensity ?? 50) / 5));
          return (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backdropFilter: `blur(${px}px)`,
                WebkitBackdropFilter: `blur(${px}px)`,
              }}
            />
          );
        })()}

        {/* Black screen overlay when outside clip bounds (suppressed when an
            overlay layer is providing the visible content). */}
        {showBlackScreen && !showingImage && overlayLayers.length === 0 && (
          <div className="absolute inset-0 bg-black flex items-center justify-center">
            <span className="text-zinc-600 text-sm">No video at current time</span>
          </div>
        )}

        {/* Video/image overlay layers — composited above the base video in
            track z-order (top track on top). Images keep natural size and are
            interactively movable/resizable when selected. */}
        {overlayLayers.map(({ clip }) =>
          clip ? (
            <OverlayLayer
              key={clip.id}
              clip={clip}
              currentTime={currentTime}
              isPlaying={isPlaying}
              stageScale={subtitleScale}
              projectWidth={projectWidth}
              projectHeight={projectHeight}
              isSelected={selectedClip?.id === clip.id}
              onSelect={() => selectClip(clip.id)}
            />
          ) : null,
        )}

        {/* Base video transform gizmo — gives the primary <video> the same
            move/scale/rotate handles as overlay clips. Rendered only when the
            base clip is selected; it paints no media (the base <video> above
            provides the pixels), just the interactive handles on top. */}
        {baseSelected && activeVideoClip && !showBlackScreen && !showingImage && (
          <OverlayLayer
            key={`base-gizmo-${activeVideoClip.id}`}
            clip={activeVideoClip}
            currentTime={currentTime}
            isPlaying={isPlaying}
            stageScale={subtitleScale}
            projectWidth={projectWidth}
            projectHeight={projectHeight}
            isSelected
            onSelect={() => selectClip(activeVideoClip.id)}
            controlsOnly
          />
        )}

        {/* Subtitle overlays */}
        {activeSubtitles.map((subtitle) => (
          <SubtitleOverlay
            key={subtitle.id}
            clip={subtitle}
            currentTime={currentTime}
            isSelected={selectedClip?.id === subtitle.id}
            onSelect={() => handleSubtitleSelect(subtitle.id)}
            onPositionChange={(pos) => handleSubtitlePositionChange(subtitle.id, pos)}
            onResize={(next) => handleSubtitleResize(subtitle.id, next)}
            scale={subtitleScale}
            videoRect={stageRect}
          />
        ))}

        </div>
      </div>

      {/* Playback speed HUD */}
      {playbackRate !== 1 && isPlaying && (
        <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-sm font-mono text-white/80 pointer-events-none">
          {playbackRate > 0 ? `${playbackRate}x ▶` : `${Math.abs(playbackRate)}x ◀`}
        </div>
      )}
      </div>

      {/* Zoom section — Ctrl/Cmd+wheel also zooms; drag to pan when zoomed in */}
      <PreviewZoomControls
        zoom={zoom}
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFit={fit}
        onSetZoom={setZoomLevel}
        onFullscreen={handleToggleFullscreen}
      />

      {/* Audio players - hidden elements for audio playback */}
      {audioClipsWithTrackInfo.map(({ clip, trackVolume }) => (
        <AudioPlayer
          key={clip.id}
          clip={clip}
          currentTime={currentTime}
          isPlaying={isPlaying}
          volume={volume}
          isMuted={isMuted}
          playbackRate={playbackRate}
          trackVolume={trackVolume}
        />
      ))}
    </div>
  );
});

export default EditorPreview;
