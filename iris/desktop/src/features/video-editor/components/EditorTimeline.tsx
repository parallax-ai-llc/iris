/**
 * EditorTimeline - Multi-track timeline for video editor
 * Adobe Premiere-style timeline with video, audio, subtitle, and music tracks
 */

import { memo, useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { ZoomIn, ZoomOut, Plus, Video, Volume2, Type, Music, Layers, AlignLeft, Maximize2, MapPin } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useEditorStore, type Track, type TrackType, type VideoClip, type AudioClip } from '@/features/video-editor/stores/editor.store';
import { useShallow } from 'zustand/react/shallow';
import { selectTimelineState, selectTimelineActions, selectClipIdSet } from '@/features/video-editor/stores/editor/selectors';
import { formatSMPTE } from '@/shared/api/subtitle.api';
import { TrackHeader } from './TrackHeader';
import { TimelineClip } from './TimelineClip';
import { MarkerListPanel } from './MarkerListPanel';
import type { ProjectMedia } from '@/types/videoProject.types';

interface EditorTimelineProps {
  className?: string;
}

// Time ruler markers calculation
function calculateTimeMarkers(
  duration: number,
  pixelsPerSecond: number
): { time: number; isMajor: boolean }[] {
  const markers: { time: number; isMajor: boolean }[] = [];

  // Determine interval based on zoom level
  let majorInterval: number;
  let minorInterval: number;

  if (pixelsPerSecond > 100) {
    majorInterval = 1;
    minorInterval = 0.5;
  } else if (pixelsPerSecond > 50) {
    majorInterval = 2;
    minorInterval = 1;
  } else if (pixelsPerSecond > 25) {
    majorInterval = 5;
    minorInterval = 1;
  } else if (pixelsPerSecond > 10) {
    majorInterval = 10;
    minorInterval = 5;
  } else if (pixelsPerSecond > 5) {
    majorInterval = 30;
    minorInterval = 10;
  } else if (pixelsPerSecond > 2) {
    majorInterval = 60;      // 1 minute major
    minorInterval = 30;
  } else if (pixelsPerSecond > 1) {
    majorInterval = 300;     // 5 minute major
    minorInterval = 60;
  } else {
    majorInterval = 600;     // 10 minute major
    minorInterval = 300;
  }

  for (let t = 0; t <= duration; t += minorInterval) {
    markers.push({
      time: t,
      isMajor: t % majorInterval === 0,
    });
  }

  return markers;
}

type RubberBandState = { startX: number; startY: number; currentX: number; currentY: number; active: boolean } | null;

export const EditorTimeline = memo(function EditorTimeline({
  className,
}: EditorTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const trackHeadersRef = useRef<HTMLDivElement>(null);
  const bottomScrollbarRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);

  // Store state (batched via useShallow)
  // NOTE: currentTime is intentionally excluded — it changes every rAF frame
  // during playback and would cause the entire timeline to re-render 60x/sec.
  // Instead we subscribe to it separately and update the playhead via DOM ref.
  const {
    tracks, duration, pixelsPerSecond, scrollLeft,
    selection, dragState, dragHoverTrackId, snapTarget, targetVideoTrackId, targetAudioTrackId,
    markers, inPoint, outPoint, frameRate, showMarkerList,
    multicamEnabled, multicamCuts, multicamSources,
  } = useEditorStore(useShallow(selectTimelineState));

  // Playhead ref — updated via rAF subscription, never triggers React re-render
  const playheadRef = useRef<HTMLDivElement>(null);

  const {
    seek, setZoom, zoomIn, zoomOut, setScrollLeft,
    addTrack, addClip, addAdjustmentLayer,
    clearSelection, selectAll, deleteSelected, duplicateSelectedClips,
    selectClipsInRange, updateDrag, endDrag, moveClipToTrack,
    addMarker, removeMarker, updateMarker, toggleMarkerList,
    removeAllGaps, alignClips, fitToView,
    removeMulticamCut,
  } = useEditorStore(useShallow(selectTimelineActions));

  const clipIdSet = useEditorStore(selectClipIdSet);

  // Rubber-band (marquee) selection state
  const [rubberBand, setRubberBand] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    active: boolean;
  } | null>(null);
  const rubberBandRef = useRef<RubberBandState>(null);
  // Track rubber-band document listeners for cleanup on unmount
  const rbListenersRef = useRef<{ move: ((e: MouseEvent) => void) | null; up: ((e: MouseEvent) => void) | null }>({ move: null, up: null });

  // Marker context menu state
  const [markerMenu, setMarkerMenu] = useState<{ markerId: string; x: number; y: number } | null>(null);
  const markerMenuRef = useRef<HTMLDivElement>(null);

  // Marker prompt modal (window.prompt is a no-op in Electron)
  const [markerPrompt, setMarkerPrompt] = useState<{
    markerId: string;
    title: string;
    label: string;
    value: string;
    field: 'label' | 'comment' | 'endTime';
  } | null>(null);
  const markerPromptInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (markerPrompt) {
      const id = window.setTimeout(() => markerPromptInputRef.current?.select(), 0);
      return () => window.clearTimeout(id);
    }
    // Only re-run when the modal opens for a different marker/field, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerPrompt?.markerId, markerPrompt?.field]);

  const submitMarkerPrompt = useCallback(() => {
    if (!markerPrompt) return;
    const { markerId, field, value } = markerPrompt;
    const m = markers.find((mk) => mk.id === markerId);
    if (!m) { setMarkerPrompt(null); return; }
    if (field === 'label') {
      updateMarker(markerId, { label: value });
    } else if (field === 'comment') {
      updateMarker(markerId, { comment: value });
    } else if (field === 'endTime') {
      const num = parseFloat(value);
      if (!isNaN(num) && num > m.time) {
        updateMarker(markerId, { endTime: num, type: 'in-out' });
      }
    }
    setMarkerPrompt(null);
  }, [markerPrompt, markers, updateMarker]);

  // Clamp marker menu position so it never overflows the viewport
  useEffect(() => {
    if (!markerMenu || !markerMenuRef.current) return;
    const el = markerMenuRef.current;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    let nextX = markerMenu.x;
    let nextY = markerMenu.y;
    if (rect.bottom > window.innerHeight - margin) {
      nextY = Math.max(margin, window.innerHeight - rect.height - margin);
    }
    if (rect.right > window.innerWidth - margin) {
      nextX = Math.max(margin, window.innerWidth - rect.width - margin);
    }
    if (nextX !== markerMenu.x || nextY !== markerMenu.y) {
      setMarkerMenu({ ...markerMenu, x: nextX, y: nextY });
    }
  }, [markerMenu]);

  // Close marker context menu on outside click or Escape
  useEffect(() => {
    if (!markerMenu) return;
    const onPointerDown = (e: MouseEvent) => {
      if (markerMenuRef.current && !markerMenuRef.current.contains(e.target as Node)) {
        setMarkerMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMarkerMenu(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [markerMenu]);

  // Track lane right-click context menu state
  const [trackContextMenu, setTrackContextMenu] = useState<{
    x: number;
    y: number;
    time: number;
    trackId: string;
  } | null>(null);

  // Add track dropdown state
  const [showTrackMenu, setShowTrackMenu] = useState(false);
  const trackMenuRef = useRef<HTMLDivElement>(null);

  // Drop state for visual feedback
  const [dropTarget, setDropTarget] = useState<{ trackId: string; time: number } | null>(null);

  // Track header width (resizable)
  const [headerWidth, setHeaderWidth] = useState(150);
  const resizingRef = useRef(false);
  const resizeStartRef = useRef({ x: 0, width: 0 });

  // Refs for drag handler — avoids stale closures when scrollLeft/pixelsPerSecond change
  const scrollLeftRef = useRef(scrollLeft);
  scrollLeftRef.current = scrollLeft;
  const pixelsPerSecondRef = useRef(pixelsPerSecond);
  pixelsPerSecondRef.current = pixelsPerSecond;

  // Calculate timeline width
  const timelineWidth = useMemo(() => {
    return Math.max(duration * pixelsPerSecond + 100, 500);
  }, [duration, pixelsPerSecond]);

  // Time markers
  const timeMarkers = useMemo(() => {
    return calculateTimeMarkers(duration, pixelsPerSecond);
  }, [duration, pixelsPerSecond]);

  // Visible time markers (viewport-culled for large timelines)
  const visibleTimeMarkers = useMemo(() => {
    const viewportWidth = containerRef.current?.clientWidth ?? 1200;
    const margin = viewportWidth * 0.1; // small buffer to avoid pop-in
    const leftBound = scrollLeft - margin;
    const rightBound = scrollLeft + viewportWidth + margin;
    return timeMarkers.filter(({ time }) => {
      const pos = time * pixelsPerSecond;
      return pos >= leftBound && pos <= rightBound;
    });
  }, [timeMarkers, scrollLeft, pixelsPerSecond]);

  // Total tracks height
  const totalTracksHeight = useMemo(() => {
    return tracks.reduce((sum, t) => sum + t.height, 0);
  }, [tracks]);

  // Convert position to time (no upper limit - allows extending timeline)
  const positionToTime = useCallback(
    (x: number) => Math.max(0, x / pixelsPerSecond),
    [pixelsPerSecond]
  );

  // Convert time to position
  const timeToPosition = useCallback(
    (time: number) => time * pixelsPerSecond,
    [pixelsPerSecond]
  );

  // Track whether the last seek was user-initiated (click/drag) to suppress auto-scroll
  const userSeekedRef = useRef(false);

  // Handle timeline click for seeking
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Use the scroll container's rect + scrollLeft for consistent coordinate calculation
      // e.currentTarget can be the ruler or a track div — their rect.left differs
      const container = containerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const x = e.clientX - containerRect.left + container.scrollLeft;
      const time = Math.max(0, x / pixelsPerSecondRef.current);
      userSeekedRef.current = true;
      seek(time);
      clearSelection();
    },
    [seek, clearSelection]
  );

  // Handle ruler double-click to add a marker
  const handleRulerDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      // Use the scroll container's rect + scrollLeft like handleTimelineClick.
      // The ruler is inside the scrolled inner div, so its own rect.left already
      // includes scrollLeft — adding scrollLeft again would double-count it and
      // place markers off-screen when zoomed in.
      const container = containerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const x = e.clientX - containerRect.left + container.scrollLeft;
      const time = positionToTime(x);
      addMarker(time);
    },
    [positionToTime, addMarker]
  );

  // Handle marker right-click to delete
  const handleMarkerContextMenu = useCallback(
    (e: React.MouseEvent, markerId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setMarkerMenu({ markerId, x: e.clientX, y: e.clientY });
    },
    []
  );

  // Track the current drop target ref to avoid unnecessary state updates
  const dropTargetRef = useRef<{ trackId: string; time: number } | null>(null);

  // Handle drag over for media drop
  const handleDragOver = useCallback(
    (e: React.DragEvent, trackId: string) => {
      // Only handle internal media-pool drags. Let OS file drops bubble up to
      // the editor root, which imports them into the media pool. Swallowing them
      // here would leave the "Drop files to import" overlay stuck and drop nothing.
      if (!e.dataTransfer.types.includes('application/json')) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';

      const rect = e.currentTarget.getBoundingClientRect();
      const scrollLeft = e.currentTarget.parentElement?.scrollLeft || 0;
      const x = e.clientX - rect.left + scrollLeft;
      const time = positionToTime(x);

      dropTargetRef.current = { trackId, time };
      setDropTarget({ trackId, time });
    },
    [positionToTime]
  );

  // Handle drag leave - only clear if actually leaving the track
  const handleDragLeave = useCallback((e: React.DragEvent, trackId: string) => {
    // Check if we're leaving to a child element (not actually leaving the track)
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    const currentTarget = e.currentTarget as HTMLElement;
    
    if (relatedTarget && currentTarget.contains(relatedTarget)) {
      // Moving to a child element, don't clear
      return;
    }
    
    // Only clear if this is the current drop target
    if (dropTargetRef.current?.trackId === trackId) {
      dropTargetRef.current = null;
      setDropTarget(null);
    }
  }, []);

  // Find next available position on track (after existing clips or at drop time)
  const findAvailablePosition = useCallback(
    (track: Track, dropTime: number, clipDuration: number): number => {
      // Sort clips by start time
      const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime);
      
      // Check if drop time doesn't overlap with any existing clip
      let startTime = dropTime;
      let hasOverlap = true;
      
      while (hasOverlap) {
        hasOverlap = false;
        for (const clip of sortedClips) {
          // Check if new clip would overlap with this clip
          if (startTime < clip.endTime && startTime + clipDuration > clip.startTime) {
            // Overlap detected, move to end of this clip
            startTime = clip.endTime;
            hasOverlap = true;
            break;
          }
        }
      }
      
      return startTime;
    },
    []
  );

  // Handle drop media from media pool
  const handleDrop = useCallback(
    (e: React.DragEvent, trackId: string) => {
      // Only handle internal media-pool drags. OS file drops must bubble to the
      // editor root (VideoEditor.handleFileDrop) so they import + clear the overlay.
      if (!e.dataTransfer.types.includes('application/json')) return;
      e.preventDefault();
      e.stopPropagation();
      dropTargetRef.current = null;
      setDropTarget(null);

      try {
        const data = e.dataTransfer.getData('application/json');
        if (!data) return;

        const media: ProjectMedia = JSON.parse(data);
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left + (e.currentTarget.parentElement?.scrollLeft || 0);
        const dropTime = positionToTime(x);
        const clipDuration = media.duration || 5; // default 5 seconds for images

        // Get fresh track state from store
        const currentTracks = useEditorStore.getState().tracks;
        const track = currentTracks.find((t) => t.id === trackId);
        if (!track) return;

        // Find position that doesn't overlap with existing clips
        const startTime = findAvailablePosition(track, dropTime, clipDuration);

        const isVideoTrack = track.type === 'video';
        const isAudioTrack = track.type === 'audio';
        const isVideoMedia = media.mediaType === 'video' || media.mediaType === 'image';
        const isAudioMedia = media.mediaType === 'audio' || media.mediaType === 'video';

        if (isVideoTrack && isVideoMedia) {
          const isImage = media.mediaType === 'image';
          const videoClip = addClip(trackId, {
            type: 'video',
            name: media.name,
            startTime,
            endTime: startTime + clipDuration,
            sourceStartTime: 0,
            sourceEndTime: clipDuration,
            sourceDuration: clipDuration,
            assetId: media.externalId || media.fileUrl || media.id,
            thumbnailUrl: media.thumbnailUrl || undefined,
            transform: { scale: 1, rotation: 0, opacity: 1 },
            mediaType: isImage ? 'image' : 'video',
            // Video media's audio is extracted to the paired audio clip below;
            // images have no audio. Keeps the <video> silent even if that audio
            // clip is later deleted/unlinked.
            audioExtracted: !isImage,
          } as Omit<VideoClip, 'id' | 'trackId'>);

          // Auto-create paired audio clip for video media (not images)
          if (!isImage && videoClip) {
            const freshTracks = useEditorStore.getState().tracks;
            let audioTrack = freshTracks.find((t) => t.type === 'audio');
            if (!audioTrack) {
              audioTrack = addTrack('audio');
            }
            const audioClip = addClip(audioTrack.id, {
              type: 'audio',
              name: media.name,
              startTime,
              endTime: startTime + clipDuration,
              sourceStartTime: 0,
              sourceEndTime: clipDuration,
              sourceDuration: clipDuration,
              assetId: media.externalId || media.fileUrl || media.id,
              volume: 1,
              muted: false,
              linkedClipId: videoClip.id,
            } as Omit<AudioClip, 'id' | 'trackId'>);

            // Link video clip back to audio clip
            if (audioClip) {
              useEditorStore.getState().updateClip(videoClip.id, { linkedClipId: audioClip.id });
            }
          }
        } else if (isAudioTrack && isAudioMedia) {
          addClip(trackId, {
            type: 'audio',
            name: media.name,
            startTime,
            endTime: startTime + clipDuration,
            sourceStartTime: 0,
            sourceEndTime: clipDuration,
            sourceDuration: clipDuration,
            assetId: media.externalId || media.fileUrl || media.id,
            volume: 1,
            muted: false,
          } as Omit<AudioClip, 'id' | 'trackId'>);
        }
      } catch (err) {
        console.error('Failed to parse dropped media:', err);
      }
    },
    [positionToTime, addClip, addTrack, findAvailablePosition]
  );

  // Right-click on a track lane — show context menu
  const handleTrackContextMenu = useCallback(
    (e: React.MouseEvent, trackId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left + (e.currentTarget.parentElement?.scrollLeft || 0);
      const time = positionToTime(x);
      setTrackContextMenu({ x: e.clientX, y: e.clientY, time, trackId });
    },
    [positionToTime]
  );

  // Handle scroll wheel zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(pixelsPerSecond * delta);
      } else {
        // Let native scroll handle horizontal wheel; containerRef.onScroll will update store
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [pixelsPerSecond, scrollLeft, setZoom, setScrollLeft]);

  // Handle drag operations — use refs to avoid re-creating listeners on scroll/zoom changes
  // Tracks which track the mouse is hovering over during drag (for cross-track moves)
  const hoverTrackIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Use the scroll viewport (containerRef) — not the inner content (timelineRef).
      // timelineRef.getBoundingClientRect().left already has scroll baked in
      // (it shifts negatively as the user scrolls), so adding scrollLeft again
      // double-counts and makes the drag jump forward by the scroll amount.
      const viewport = containerRef.current;
      const rect = viewport?.getBoundingClientRect();
      if (!viewport || !rect) return;

      const sl = viewport.scrollLeft;
      const pps = pixelsPerSecondRef.current;
      const x = e.clientX - rect.left + sl;
      const time = Math.max(0, x / pps);
      updateDrag(e.clientX, time);

      // Detect which track the mouse is over by Y coordinate
      // (elementFromPoint would return the dragged clip itself, not the track)
      const trackLanesEl = timelineRef.current?.querySelector('[data-track-lanes]') as HTMLElement | null;
      if (trackLanesEl) {
        const lanesRect = trackLanesEl.getBoundingClientRect();
        const relY = e.clientY - lanesRect.top;
        let accY = 0;
        let foundTrackId: string | null = null;
        const currentTracks = useEditorStore.getState().tracks;
        for (const t of currentTracks) {
          if (relY >= accY && relY < accY + t.height) {
            foundTrackId = t.id;
            break;
          }
          accY += t.height;
        }
        hoverTrackIdRef.current = foundTrackId;
        // Sync to store for live cross-track preview rendering (only if same type as source)
        const sourceTrack = currentTracks.find((t) => t.id === dragState.trackId);
        const targetTrack = foundTrackId ? currentTracks.find((t) => t.id === foundTrackId) : null;
        const validHover =
          targetTrack && sourceTrack && targetTrack.type === sourceTrack.type
            ? targetTrack.id
            : null;
        if (useEditorStore.getState().dragHoverTrackId !== validHover) {
          useEditorStore.getState().setDragHoverTrackId(validHover);
        }
      }
    };

    const handleMouseUp = () => {
      // Move clip to hovered track (if different from source) before endDrag finalizes
      const hoveredTrackId = hoverTrackIdRef.current;
      if (dragState && hoveredTrackId && hoveredTrackId !== dragState.trackId) {
        moveClipToTrack(dragState.clipId, hoveredTrackId);
      }
      hoverTrackIdRef.current = null;
      endDrag();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hoverTrackIdRef.current = null;
        endDrag();
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dragState, updateDrag, endDrag, moveClipToTrack]);

  // Rubber-band (marquee) selection logic
  const handleTrackAreaMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only start rubber-band on left button click on empty area (not on clips)
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      // If clicked directly on a clip, don't start rubber-band
      if (target.closest('[data-clip-id]')) return;
      // Don't start if a drag is in progress
      if (useEditorStore.getState().dragState) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const startX = e.clientX - rect.left;
      const startY = e.clientY - rect.top;

      const rb = { startX, startY, currentX: startX, currentY: startY, active: true };
      setRubberBand(rb);
      (rubberBandRef as React.MutableRefObject<RubberBandState>).current = rb;

      const handleMouseMove = (me: MouseEvent) => {
        const currentRb = (rubberBandRef as React.MutableRefObject<RubberBandState>).current;
        if (!currentRb) return;
        const currentX = me.clientX - rect.left;
        const currentY = me.clientY - rect.top;
        const updated = { ...currentRb, currentX, currentY };
        (rubberBandRef as React.MutableRefObject<RubberBandState>).current = updated;
        setRubberBand(updated);
      };

      const cleanupRbListeners = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        rbListenersRef.current = { move: null, up: null };
      };

      const handleMouseUp = () => {
        const currentRb = (rubberBandRef as React.MutableRefObject<RubberBandState>).current;
        if (!currentRb) {
          cleanupRbListeners();
          return;
        }

        // Calculate rubber-band rect in timeline-relative coordinates (accounting for scroll)
        const rbLeft = Math.min(currentRb.startX, currentRb.currentX) + scrollLeft;
        const rbRight = Math.max(currentRb.startX, currentRb.currentX) + scrollLeft;
        // Top/bottom are relative to the track area (which starts after ruler height=24px)
        const rbTop = Math.min(currentRb.startY, currentRb.currentY);
        const rbBottom = Math.max(currentRb.startY, currentRb.currentY);

        // Only do selection if dragged far enough (avoid accidental selections on single clicks)
        const MIN_DRAG = 5;
        if (Math.abs(rbRight - rbLeft) > MIN_DRAG || Math.abs(rbBottom - rbTop) > MIN_DRAG) {
          // Find which clips overlap the rubber-band rect
          const state = useEditorStore.getState();
          const overlappingIds: string[] = [];

          // Calculate cumulative track top offsets (24px ruler height is stripped in track area div)
          let trackTop = 0;
          for (const track of state.tracks) {
            const trackBottom = trackTop + track.height;
            if (rbTop < trackBottom && rbBottom > trackTop) {
              // Track overlaps vertically — check each clip horizontally
              for (const clip of track.clips) {
                const clipLeft = clip.startTime * state.pixelsPerSecond;
                const clipRight = clip.endTime * state.pixelsPerSecond;
                if (rbLeft < clipRight && rbRight > clipLeft) {
                  overlappingIds.push(clip.id);
                }
              }
            }
            trackTop = trackBottom;
          }

          if (overlappingIds.length > 0) {
            selectClipsInRange(overlappingIds);
          } else {
            clearSelection();
          }
        }

        (rubberBandRef as React.MutableRefObject<RubberBandState>).current = null;
        setRubberBand(null);

        cleanupRbListeners();
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      rbListenersRef.current = { move: handleMouseMove, up: handleMouseUp };
    },
    [scrollLeft, selectClipsInRange, clearSelection]
  );

  // Cleanup rubber-band document listeners on unmount
  useEffect(() => {
    return () => {
      const { move, up } = rbListenersRef.current;
      if (move) document.removeEventListener('mousemove', move);
      if (up) document.removeEventListener('mouseup', up);
    };
  }, []);

  // Timeline keyboard shortcuts (when the timeline area has focus)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Ctrl/Cmd + A: select all clips
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }

      // Delete / Backspace: delete selected clips
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const state = useEditorStore.getState();
        if (state.selection.clipIds.length > 0) {
          e.preventDefault();
          deleteSelected();
        }
        return;
      }

      // Ctrl/Cmd + D: duplicate selected clips
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        const state = useEditorStore.getState();
        if (state.selection.clipIds.length > 1) {
          e.preventDefault();
          duplicateSelectedClips();
        }
        // Single-clip duplication is handled by VideoEditor keyboard handler
        return;
      }

      // Arrow keys: seek control
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const state = useEditorStore.getState();
        if (state.isPlaying) state.pause();

        if (e.key === 'ArrowUp') {
          seek(0); // Go to beginning
        } else if (e.key === 'ArrowDown') {
          seek(state.duration); // Go to end
        } else if (e.key === 'ArrowLeft') {
          seek(state.currentTime - 1);
        } else if (e.key === 'ArrowRight') {
          seek(state.currentTime + 1);
        }
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectAll, deleteSelected, duplicateSelectedClips, seek]);

  // Subscribe to currentTime outside React render cycle.
  // Updates the playhead DOM element directly and handles auto-scroll.
  // This avoids re-rendering the entire timeline 60x/sec during playback.
  useEffect(() => {
    let rafId = 0;
    let prevTime = -1;

    const tick = () => {
      const ct = useEditorStore.getState().currentTime;
      if (ct !== prevTime) {
        prevTime = ct;
        const pps = useEditorStore.getState().pixelsPerSecond;
        const pos = ct * pps;

        // Move playhead via DOM
        if (playheadRef.current) {
          playheadRef.current.style.left = `${pos}px`;
        }

        // Auto-scroll (skip if user just clicked/seeked)
        if (userSeekedRef.current) {
          userSeekedRef.current = false;
        } else if (containerRef.current) {
          const container = containerRef.current;
          const viewWidth = container.clientWidth - headerWidth;
          const currentScroll = container.scrollLeft;
          if (pos < currentScroll || pos > currentScroll + viewWidth - 50) {
            const newLeft = Math.max(0, pos - viewWidth / 3);
            isSyncingScroll.current = true;
            container.scrollLeft = newLeft;
            if (bottomScrollbarRef.current) bottomScrollbarRef.current.scrollLeft = newLeft;
            isSyncingScroll.current = false;
            setScrollLeft(newLeft);
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [headerWidth, setScrollLeft]);

  // Close add-track menu on outside click
  useEffect(() => {
    if (!showTrackMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (trackMenuRef.current && !trackMenuRef.current.contains(e.target as Node)) {
        setShowTrackMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTrackMenu]);

  // Close track lane context menu on outside click
  useEffect(() => {
    if (!trackContextMenu) return;
    const close = () => setTrackContextMenu(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [trackContextMenu]);

  // Add track dropdown menu items
  const trackTypes: { type: TrackType; icon: typeof Video; label: string }[] = [
    { type: 'video', icon: Video, label: 'Video Track' },
    { type: 'audio', icon: Volume2, label: 'Audio Track' },
    { type: 'subtitle', icon: Type, label: 'Subtitle Track' },
    { type: 'music', icon: Music, label: 'Music Track' },
    { type: 'adjustment', icon: Layers, label: 'Adjustment Layer' },
  ];

  return (
    <div className={cn('flex flex-col bg-zinc-900', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 border-b border-zinc-700">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span className="font-medium">Timeline</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Add track button */}
          <div className="relative" ref={trackMenuRef}>
            <button
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
              title="Add track"
              onClick={() => setShowTrackMenu((prev) => !prev)}
            >
              <Plus className="w-3 h-3" />
              Add Track
            </button>

            {showTrackMenu && (
              <div className="absolute top-full right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 py-1 min-w-[140px]">
                {trackTypes.map(({ type, icon: Icon, label }) => (
                  <button
                    key={type}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                    onClick={() => {
                      addTrack(type);
                      setShowTrackMenu(false);
                    }}
                  >
                    <Icon className="w-3 h-3" />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Remove gaps button — only active when a target track is set */}
          {(() => {
            const hasTarget = !!targetVideoTrackId || !!targetAudioTrackId;
            return (
              <button
                disabled={!hasTarget}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                  hasTarget
                    ? 'text-zinc-400 hover:text-white hover:bg-zinc-700'
                    : 'text-zinc-600 cursor-not-allowed'
                )}
                title={
                  hasTarget
                    ? 'Remove gaps on the target track(s)'
                    : 'Set a target track to remove gaps'
                }
                onClick={removeAllGaps}
              >
                <AlignLeft className="w-3 h-3" />
                Remove Gaps
              </button>
            );
          })()}

          {/* Align clips (visible when 2+ clips selected) */}
          {selection.clipIds.length >= 2 && (
            <div className="flex items-center gap-0.5 border-l border-zinc-700 pl-2">
              <button
                className="px-1.5 py-1 rounded text-[10px] text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                title="Align starts"
                onClick={() => alignClips('start')}
              >
                ⟵ Start
              </button>
              <button
                className="px-1.5 py-1 rounded text-[10px] text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                title="Align ends"
                onClick={() => alignClips('end')}
              >
                End ⟶
              </button>
              <button
                className="px-1.5 py-1 rounded text-[10px] text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                title="Distribute evenly"
                onClick={() => alignClips('distribute')}
              >
                ⟷ Distribute
              </button>
            </div>
          )}

          {/* Zoom controls */}
          <div className="flex items-center gap-1 border-l border-zinc-700 pl-2">
            <button
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
              onClick={zoomOut}
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min={0.5}
              max={500}
              step={0.5}
              value={pixelsPerSecond}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-20 h-1 accent-zinc-400 cursor-pointer"
              title="Zoom level"
            />
            <button
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
              onClick={zoomIn}
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
              onClick={() => fitToView(containerRef.current?.clientWidth ?? 1200)}
              title="Fit to view"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              className={cn(
                'p-1 rounded transition-colors',
                showMarkerList
                  ? 'text-amber-400 bg-zinc-700'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
              )}
              onClick={toggleMarkerList}
              title="Markers"
            >
              <MapPin className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Timeline content - single vertical scroll container */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative" ref={trackHeadersRef}>
        {showMarkerList && <MarkerListPanel onClose={toggleMarkerList} />}
        <div className="flex">
          {/* Track headers */}
          <div
            className="flex-shrink-0 border-r border-zinc-700 bg-zinc-800/30 relative"
            style={{ width: `${headerWidth}px` }}
          >
            {/* Time ruler header */}
            <div className="h-6 border-b border-zinc-700 flex items-center justify-center text-[10px] text-zinc-500 bg-zinc-800 sticky top-0 z-10">
              Time
            </div>

            {/* Track headers */}
            {tracks.map((track) => (
              <TrackHeader
                key={track.id}
                track={track}
                isSelected={selection.trackIds.includes(track.id)}
                isTarget={
                  track.type === 'video'
                    ? track.id === targetVideoTrackId
                    : (track.type === 'audio' || track.type === 'music')
                      ? track.id === targetAudioTrackId
                      : false
                }
              />
            ))}

            {/* Resize handle */}
            <div
              className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500/70 z-20 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                resizingRef.current = true;
                resizeStartRef.current = { x: e.clientX, width: headerWidth };

                const handleMouseMove = (ev: MouseEvent) => {
                  if (!resizingRef.current) return;
                  const delta = ev.clientX - resizeStartRef.current.x;
                  const newWidth = Math.max(100, Math.min(400, resizeStartRef.current.width + delta));
                  setHeaderWidth(newWidth);
                };

                const handleMouseUp = () => {
                  resizingRef.current = false;
                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);
                  document.body.style.cursor = '';
                  document.body.style.userSelect = '';
                };

                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
              }}
            />
          </div>

          {/* Scrollable timeline area (horizontal only).
              overflow-x-scroll ensures scrollbar is always visible.
              height is set explicitly so vertical scrolling is handled
              by the outer trackHeadersRef container. */}
          <div
            ref={containerRef}
            data-timeline-content
            className="flex-1 overflow-x-scroll [&::-webkit-scrollbar]:!h-0 [&::-webkit-scrollbar]:!w-0"
            style={{ height: `${totalTracksHeight + 24}px` }}
            onScroll={(e) => {
              if (isSyncingScroll.current) return;
              const newLeft = e.currentTarget.scrollLeft;
              setScrollLeft(newLeft);
              isSyncingScroll.current = true;
              if (bottomScrollbarRef.current) bottomScrollbarRef.current.scrollLeft = newLeft;
              isSyncingScroll.current = false;
            }}
          >
          <div
            ref={timelineRef}
            className="relative"
            style={{ width: `${timelineWidth}px`, height: `${totalTracksHeight + 24}px` }}
          >
            {/* Time ruler */}
            <div
              className="absolute top-0 left-0 right-0 h-6 border-b border-zinc-700 bg-zinc-800/50 select-none"
              onClick={handleTimelineClick}
              onDoubleClick={handleRulerDoubleClick}
            >
              {visibleTimeMarkers.map(({ time, isMajor }) => (
                <div
                  key={time}
                  className="absolute top-0 h-full flex flex-col items-center pointer-events-none"
                  style={{ left: `${timeToPosition(time)}px` }}
                >
                  {isMajor && (
                    <span className="text-[9px] text-zinc-500 font-mono mt-0.5">
                      {formatSMPTE(time, frameRate)}
                    </span>
                  )}
                  <div
                    className={cn(
                      'w-px flex-1',
                      isMajor ? 'bg-zinc-600' : 'bg-zinc-700'
                    )}
                  />
                </div>
              ))}

              {/* In/Out point region overlay */}
              {inPoint !== null && outPoint !== null && (
                <div
                  className="absolute top-0 h-full bg-cyan-400/10 pointer-events-none z-[5]"
                  style={{
                    left: `${timeToPosition(inPoint)}px`,
                    width: `${timeToPosition(outPoint - inPoint)}px`,
                  }}
                />
              )}

              {/* In point marker */}
              {inPoint !== null && (
                <div
                  className="absolute top-0 h-full flex flex-col items-center z-[6] pointer-events-none"
                  style={{ left: `${timeToPosition(inPoint)}px` }}
                >
                  <span className="text-[8px] text-cyan-400 font-mono font-bold mt-0.5">I</span>
                  <div className="w-px flex-1 bg-cyan-400/70" />
                </div>
              )}

              {/* Out point marker */}
              {outPoint !== null && (
                <div
                  className="absolute top-0 h-full flex flex-col items-center z-[6] pointer-events-none"
                  style={{ left: `${timeToPosition(outPoint)}px` }}
                >
                  <span className="text-[8px] text-cyan-400 font-mono font-bold mt-0.5">O</span>
                  <div className="w-px flex-1 bg-cyan-400/70" />
                </div>
              )}

              {/* Multicam cut markers — shown when multicam is enabled */}
              {multicamEnabled && multicamCuts.map((cut, idx) => {
                const source = multicamSources[cut.angleIndex];
                const angleName = source?.name ?? `Angle ${cut.angleIndex + 1}`;
                const tooltip = `Cam ${cut.angleIndex + 1}${source ? ` · ${angleName}` : ''}\n${formatSMPTE(cut.time, frameRate)}\nRight-click to remove`;
                return (
                  <div
                    key={`mc-cut-${idx}-${cut.time}`}
                    className="absolute top-0 h-full z-[7] cursor-pointer group"
                    style={{ left: `${timeToPosition(cut.time)}px` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      seek(cut.time);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removeMulticamCut(cut.time);
                    }}
                    title={tooltip}
                  >
                    <div className="flex flex-col items-center h-full">
                      {/* Angle number badge */}
                      <div className="px-1 mt-0.5 rounded-sm bg-sky-500 text-white text-[8px] font-mono font-bold leading-tight group-hover:bg-sky-400">
                        {cut.angleIndex + 1}
                      </div>
                      {/* Vertical line down through ruler */}
                      <div className="w-px flex-1 bg-sky-400/70 group-hover:bg-sky-300" />
                    </div>
                  </div>
                );
              })}

              {/* Timeline markers */}
              {markers.map((marker) => {
                const color = marker.color ?? '#f59e0b';
                const isRange = typeof marker.endTime === 'number' && marker.endTime > marker.time;
                const tooltipParts = [
                  marker.label || 'Marker',
                  isRange
                    ? `${formatSMPTE(marker.time, frameRate)} → ${formatSMPTE(marker.endTime!, frameRate)}`
                    : formatSMPTE(marker.time, frameRate),
                ];
                if (marker.comment) tooltipParts.push(marker.comment);
                const title = tooltipParts.join('\n');
                return (
                  <div
                    key={marker.id}
                    className="absolute top-0 h-full z-10 cursor-pointer group"
                    style={{
                      left: `${timeToPosition(marker.time)}px`,
                      width: isRange
                        ? `${Math.max(2, timeToPosition(marker.endTime! - marker.time))}px`
                        : undefined,
                    }}
                    onContextMenu={(e) => handleMarkerContextMenu(e, marker.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setMarkerPrompt({
                        markerId: marker.id,
                        title: 'Rename Marker',
                        label: 'Marker label',
                        value: marker.label ?? '',
                        field: 'label',
                      });
                    }}
                    title={title}
                  >
                    {isRange ? (
                      <>
                        {/* Range bar at top of ruler */}
                        <div
                          className="absolute top-0 left-0 right-0 h-1.5 rounded-sm"
                          style={{ backgroundColor: color, opacity: 0.85 }}
                        />
                        {/* Start vertical line */}
                        <div
                          className="absolute top-0 left-0 w-px h-full opacity-60"
                          style={{ backgroundColor: color }}
                        />
                        {/* End vertical line */}
                        <div
                          className="absolute top-0 right-0 w-px h-full opacity-60"
                          style={{ backgroundColor: color }}
                        />
                        {marker.label && (
                          <span
                            className="absolute top-1.5 left-1 text-[9px] font-mono whitespace-nowrap pointer-events-none"
                            style={{ color }}
                          >
                            {marker.label}
                          </span>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center h-full">
                        {/* Triangle */}
                        <div
                          className="w-0 h-0 flex-shrink-0 mt-0.5"
                          style={{
                            borderLeft: '5px solid transparent',
                            borderRight: '5px solid transparent',
                            borderTop: `8px solid ${color}`,
                          }}
                        />
                        {/* Vertical line */}
                        <div
                          className="w-px flex-1 opacity-60"
                          style={{ backgroundColor: color }}
                        />
                        {marker.label && (
                          <span
                            className="absolute top-2 left-2 text-[9px] font-mono whitespace-nowrap pointer-events-none"
                            style={{ color }}
                          >
                            {marker.label}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Marker context menu */}
            {markerMenu && (() => {
              const m = markers.find((mk) => mk.id === markerMenu.markerId);
              if (!m) return null;
              const close = () => setMarkerMenu(null);
              const colors = ['#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#06b6d4', '#eab308'];
              return (
                <div
                  ref={markerMenuRef}
                  className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[180px]"
                  style={{ left: markerMenu.x, top: markerMenu.y }}
                >
                  <button
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
                    onClick={() => {
                      setMarkerPrompt({
                        markerId: m.id,
                        title: 'Rename Marker',
                        label: 'Marker label',
                        value: m.label ?? '',
                        field: 'label',
                      });
                      close();
                    }}
                  >
                    Rename / Set Label
                  </button>
                  <button
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
                    onClick={() => {
                      setMarkerPrompt({
                        markerId: m.id,
                        title: 'Edit Comment',
                        label: 'Comment',
                        value: m.comment ?? '',
                        field: 'comment',
                      });
                      close();
                    }}
                  >
                    Edit Comment
                  </button>
                  <div className="px-3 py-1.5 flex items-center gap-1.5">
                    {colors.map((c) => (
                      <button
                        key={c}
                        title={c}
                        className="w-4 h-4 rounded-full border border-zinc-600 hover:scale-110 transition-transform"
                        style={{ backgroundColor: c }}
                        onClick={() => { updateMarker(m.id, { color: c }); close(); }}
                      />
                    ))}
                  </div>
                  <div className="border-t border-zinc-800 my-1" />
                  {typeof m.endTime === 'number' ? (
                    <button
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
                      onClick={() => { updateMarker(m.id, { endTime: undefined, type: 'standard' }); close(); }}
                    >
                      Convert to Point Marker
                    </button>
                  ) : (
                    <button
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
                      onClick={() => {
                        setMarkerPrompt({
                          markerId: m.id,
                          title: 'Convert to Range Marker',
                          label: `End time in seconds (start: ${formatSMPTE(m.time, frameRate)})`,
                          value: String((m.time + 1).toFixed(3)),
                          field: 'endTime',
                        });
                        close();
                      }}
                    >
                      Convert to Range Marker…
                    </button>
                  )}
                  <div className="border-t border-zinc-800 my-1" />
                  <button
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-red-400 hover:bg-zinc-800 transition-colors"
                    onClick={() => { removeMarker(m.id); close(); }}
                  >
                    Delete Marker
                  </button>
                </div>
              );
            })()}

            {/* Marker prompt modal (replaces window.prompt which is a no-op in Electron) */}
            {markerPrompt && (
              <div
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
                onMouseDown={(e) => { if (e.target === e.currentTarget) setMarkerPrompt(null); }}
              >
                <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-4 min-w-[320px]">
                  <div className="text-sm font-semibold text-zinc-100 mb-2">{markerPrompt.title}</div>
                  <label className="block text-xs text-zinc-400 mb-1">{markerPrompt.label}</label>
                  <input
                    ref={markerPromptInputRef}
                    autoFocus
                    type="text"
                    value={markerPrompt.value}
                    onChange={(e) => setMarkerPrompt({ ...markerPrompt, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); submitMarkerPrompt(); }
                      else if (e.key === 'Escape') { e.preventDefault(); setMarkerPrompt(null); }
                    }}
                    className="w-full px-2 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-zinc-500"
                  />
                  <div className="flex justify-end gap-2 mt-3">
                    <button
                      className="px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
                      onClick={() => setMarkerPrompt(null)}
                    >
                      Cancel
                    </button>
                    <button
                      className="px-3 py-1.5 text-sm bg-zinc-100 text-zinc-900 hover:bg-white rounded transition-colors"
                      onClick={submitMarkerPrompt}
                    >
                      OK
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* In/Out region overlay on track lanes */}
            {inPoint !== null && outPoint !== null && (
              <div
                className="absolute top-6 bottom-0 bg-cyan-400/5 pointer-events-none z-[1]"
                style={{
                  left: `${timeToPosition(inPoint)}px`,
                  width: `${timeToPosition(outPoint - inPoint)}px`,
                }}
              />
            )}

            {/* Track lanes */}
            <div
              data-track-lanes
              className="absolute top-6 left-0 right-0"
              onMouseDown={handleTrackAreaMouseDown}
            >
              {tracks.map((track) => {
                const topOffset = tracks
                  .slice(0, tracks.indexOf(track))
                  .reduce((sum, t) => sum + t.height, 0);
                const isDropTarget = dropTarget?.trackId === track.id;

                return (
                  <div
                    key={track.id}
                    data-track-id={track.id}
                    className={cn(
                      'absolute left-0 right-0 border-b border-zinc-700/50 transition-colors',
                      track.locked && 'bg-zinc-800/30',
                      !track.visible && 'opacity-50',
                      isDropTarget && 'bg-blue-500/10 border-blue-500/30'
                    )}
                    style={{
                      top: `${topOffset}px`,
                      height: `${track.height}px`,
                    }}
                    onClick={handleTimelineClick}
                    onContextMenu={(e) => handleTrackContextMenu(e, track.id)}
                    onDragOver={(e) => handleDragOver(e, track.id)}
                    onDragLeave={(e) => handleDragLeave(e, track.id)}
                    onDrop={(e) => handleDrop(e, track.id)}
                  >
                    {/* Grid lines */}
                    {visibleTimeMarkers
                      .filter((m) => m.isMajor)
                      .map(({ time }) => (
                        <div
                          key={time}
                          className="absolute top-0 bottom-0 w-px bg-zinc-700/30"
                          style={{ left: `${timeToPosition(time)}px` }}
                        />
                      ))}

                    {/* Drop indicator */}
                    {isDropTarget && dropTarget && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-20"
                        style={{ left: `${timeToPosition(dropTarget.time)}px` }}
                      />
                    )}

                    {/* Clips — when a clip is being dragged across tracks, render it
                        in the hovered track instead of its origin track for live preview. */}
                    {(() => {
                      const draggedId = dragState?.clipId;
                      const sourceTrackId = dragState?.trackId;
                      const previewActive = !!draggedId && !!dragHoverTrackId && dragHoverTrackId !== sourceTrackId;
                      let clipsToRender = track.clips;
                      if (previewActive && track.id === sourceTrackId) {
                        clipsToRender = track.clips.filter((c) => c.id !== draggedId);
                      } else if (previewActive && track.id === dragHoverTrackId) {
                        const sourceTrack = tracks.find((t) => t.id === sourceTrackId);
                        const draggedClip = sourceTrack?.clips.find((c) => c.id === draggedId);
                        if (draggedClip) clipsToRender = [...track.clips, draggedClip];
                      }
                      return clipsToRender.map((clip) => (
                        <TimelineClip
                          key={clip.id}
                          clip={clip}
                          pixelsPerSecond={pixelsPerSecond}
                          isSelected={clipIdSet.has(clip.id)}
                          isDragging={dragState?.clipId === clip.id}
                          trackLocked={track.locked}
                        />
                      ));
                    })()}
                  </div>
                );
              })}
            </div>

            {/* Rubber-band selection rectangle */}
            {rubberBand && rubberBand.active && (
              <div
                className="absolute pointer-events-none z-40 border border-blue-400 bg-blue-400/15"
                style={{
                  left: `${Math.min(rubberBand.startX, rubberBand.currentX)}px`,
                  top: `${Math.min(rubberBand.startY, rubberBand.currentY) + 24}px`,
                  width: `${Math.abs(rubberBand.currentX - rubberBand.startX)}px`,
                  height: `${Math.abs(rubberBand.currentY - rubberBand.startY)}px`,
                }}
              />
            )}

            {/* Snap indicator */}
            {snapTarget !== null && dragState && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 z-29 pointer-events-none opacity-80"
                style={{ left: `${timeToPosition(snapTarget)}px` }}
              />
            )}

            {/* Playhead — positioned via ref, not React state, to avoid re-renders */}
            <div
              ref={playheadRef}
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none"
              style={{ left: '0px' }}
            >
              <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-sm rotate-45 transform -translate-y-1/2" />
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Always-visible horizontal scrollbar — outside overflow-y-auto so it never gets clipped */}
      <div className="flex flex-shrink-0 border-t border-zinc-800" style={{ paddingLeft: `${headerWidth}px` }}>
        <div
          ref={bottomScrollbarRef}
          className="flex-1 overflow-x-scroll [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:bg-zinc-900 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-zinc-600 [&::-webkit-scrollbar-thumb:hover]:bg-zinc-500"
          onScroll={(e) => {
            if (isSyncingScroll.current) return;
            const newLeft = e.currentTarget.scrollLeft;
            setScrollLeft(newLeft);
            isSyncingScroll.current = true;
            if (containerRef.current) containerRef.current.scrollLeft = newLeft;
            isSyncingScroll.current = false;
          }}
        >
          <div style={{ width: timelineWidth, height: 1 }} />
        </div>
      </div>

      {/* Track lane right-click context menu */}
      {trackContextMenu && (
        <div
          className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[200px]"
          style={{ left: trackContextMenu.x, top: trackContextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            onClick={() => {
              const dur = useEditorStore.getState().duration || 5;
              const clipDur = Math.max(2, Math.min(5, dur - trackContextMenu.time));
              addAdjustmentLayer(trackContextMenu.trackId, trackContextMenu.time, clipDur);
              setTrackContextMenu(null);
            }}
          >
            <Layers className="w-3 h-3 text-purple-400" />
            Add Adjustment Layer Here
          </button>
          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            onClick={() => {
              const dur = useEditorStore.getState().duration || 5;
              addAdjustmentLayer(trackContextMenu.trackId, 0, dur);
              setTrackContextMenu(null);
            }}
          >
            <Layers className="w-3 h-3 text-purple-400" />
            Add Adjustment (Full Duration)
          </button>
          <div className="border-t border-zinc-700 my-1" />
          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            onClick={() => {
              addMarker(trackContextMenu.time);
              setTrackContextMenu(null);
            }}
          >
            <Plus className="w-3 h-3" />
            Add Marker Here
          </button>
        </div>
      )}
    </div>
  );
});

export default EditorTimeline;
