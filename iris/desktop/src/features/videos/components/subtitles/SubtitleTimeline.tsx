/**
 * SubtitleTimeline - Visual timeline showing cues over video duration
 * Supports draggable cue markers and zoom/scroll
 */

import { memo, useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { formatSubtitleTime, SubtitleCue } from '@/shared/api/subtitle.api';

interface SubtitleTimelineProps {
  cues: SubtitleCue[];
  currentTime: number;
  duration: number;
  selectedCueId: string | null;
  onCueSelect: (cue: SubtitleCue) => void;
  onCueUpdate: (cue: Partial<SubtitleCue> & { id: string }) => void;
  onSeek: (time: number) => void;
}

// Calculate time markers based on zoom level
function calculateTimeMarkers(duration: number, pixelsPerSecond: number): number[] {
  const markers: number[] = [];
  
  // Determine interval based on zoom level
  let interval: number;
  if (pixelsPerSecond > 100) {
    interval = 1; // Every second
  } else if (pixelsPerSecond > 50) {
    interval = 2; // Every 2 seconds
  } else if (pixelsPerSecond > 25) {
    interval = 5; // Every 5 seconds
  } else if (pixelsPerSecond > 10) {
    interval = 10; // Every 10 seconds
  } else {
    interval = 30; // Every 30 seconds
  }

  for (let t = 0; t <= duration; t += interval) {
    markers.push(t);
  }
  
  return markers;
}

export const SubtitleTimeline = memo(function SubtitleTimeline({
  cues,
  currentTime,
  duration,
  selectedCueId,
  onCueSelect,
  onCueUpdate,
  onSeek,
}: SubtitleTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Zoom level (pixels per second)
  const [pixelsPerSecond, setPixelsPerSecond] = useState(30);
  
  // Drag state
  const [dragState, setDragState] = useState<{
    cueId: string;
    type: 'move' | 'start' | 'end';
    initialX: number;
    initialStartTime: number;
    initialEndTime: number;
  } | null>(null);

  const minZoom = 10;
  const maxZoom = 150;

  // Calculate timeline width
  const timelineWidth = useMemo(() => {
    return Math.max(duration * pixelsPerSecond, 500);
  }, [duration, pixelsPerSecond]);

  // Time markers
  const timeMarkers = useMemo(() => {
    return calculateTimeMarkers(duration, pixelsPerSecond);
  }, [duration, pixelsPerSecond]);

  // Handle zoom
  const handleZoomIn = useCallback(() => {
    setPixelsPerSecond((prev) => Math.min(prev * 1.5, maxZoom));
  }, []);

  const handleZoomOut = useCallback(() => {
    setPixelsPerSecond((prev) => Math.max(prev / 1.5, minZoom));
  }, []);

  const handleFitToView = useCallback(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth - 20;
      const newZoom = Math.max(minZoom, Math.min(maxZoom, containerWidth / duration));
      setPixelsPerSecond(newZoom);
    }
  }, [duration]);

  // Handle wheel zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setPixelsPerSecond((prev) =>
          Math.max(minZoom, Math.min(maxZoom, prev * delta))
        );
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Convert time to position
  const timeToPosition = useCallback(
    (time: number) => time * pixelsPerSecond,
    [pixelsPerSecond]
  );

  // Convert position to time
  const positionToTime = useCallback(
    (x: number) => Math.max(0, Math.min(duration, x / pixelsPerSecond)),
    [duration, pixelsPerSecond]
  );

  // Handle timeline click for seeking
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left + (containerRef.current?.scrollLeft || 0);
      const time = positionToTime(x);
      onSeek(time);
    },
    [positionToTime, onSeek]
  );

  // Handle cue drag start
  const handleDragStart = useCallback(
    (
      e: React.MouseEvent,
      cue: SubtitleCue,
      type: 'move' | 'start' | 'end'
    ) => {
      e.stopPropagation();
      e.preventDefault();

      setDragState({
        cueId: cue.id,
        type,
        initialX: e.clientX,
        initialStartTime: cue.startTime,
        initialEndTime: cue.endTime,
      });

      onCueSelect(cue);
    },
    [onCueSelect]
  );

  // Handle drag
  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragState.initialX;
      const deltaTime = deltaX / pixelsPerSecond;

      const cue = cues.find((c) => c.id === dragState.cueId);
      if (!cue) return;

      if (dragState.type === 'move') {
        const newStart = Math.max(0, dragState.initialStartTime + deltaTime);
        const cueDuration = dragState.initialEndTime - dragState.initialStartTime;
        const newEnd = Math.min(duration, newStart + cueDuration);
        const adjustedStart = newEnd === duration ? duration - cueDuration : newStart;

        onCueUpdate({
          id: cue.id,
          startTime: Math.max(0, adjustedStart),
          endTime: newEnd,
        });
      } else if (dragState.type === 'start') {
        const newStart = Math.max(
          0,
          Math.min(dragState.initialEndTime - 0.1, dragState.initialStartTime + deltaTime)
        );
        onCueUpdate({ id: cue.id, startTime: newStart });
      } else if (dragState.type === 'end') {
        const newEnd = Math.min(
          duration,
          Math.max(dragState.initialStartTime + 0.1, dragState.initialEndTime + deltaTime)
        );
        onCueUpdate({ id: cue.id, endTime: newEnd });
      }
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, cues, duration, pixelsPerSecond, onCueUpdate]);

  // Auto-scroll to follow playhead
  useEffect(() => {
    if (!containerRef.current || !timelineRef.current) return;

    const playheadPos = timeToPosition(currentTime);
    const container = containerRef.current;
    const scrollLeft = container.scrollLeft;
    const viewWidth = container.clientWidth;

    // If playhead is outside visible area, scroll to it
    if (playheadPos < scrollLeft || playheadPos > scrollLeft + viewWidth - 50) {
      container.scrollTo({
        left: playheadPos - viewWidth / 3,
        behavior: 'smooth',
      });
    }
  }, [currentTime, timeToPosition]);

  return (
    <div className="flex flex-col h-full bg-zinc-900 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 border-b border-zinc-700">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span>Timeline</span>
          <span className="text-zinc-600">|</span>
          <span className="font-mono">{formatSubtitleTime(currentTime)}</span>
          <span className="text-zinc-600">/</span>
          <span className="font-mono">{formatSubtitleTime(duration)}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
            onClick={handleZoomOut}
            title="Zoom out (Ctrl+Scroll)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-zinc-500 w-10 text-center">
            {Math.round(pixelsPerSecond)}x
          </span>
          <button
            className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
            onClick={handleZoomIn}
            title="Zoom in (Ctrl+Scroll)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors ml-1"
            onClick={handleFitToView}
            title="Fit to view"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Timeline container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-x-auto overflow-y-hidden"
      >
        <div
          ref={timelineRef}
          className="relative h-full min-h-[120px]"
          style={{ width: `${timelineWidth}px` }}
          onClick={handleTimelineClick}
        >
          {/* Time markers */}
          <div className="absolute top-0 left-0 right-0 h-6 border-b border-zinc-700">
            {timeMarkers.map((time) => (
              <div
                key={time}
                className="absolute top-0 h-full flex flex-col items-center"
                style={{ left: `${timeToPosition(time)}px` }}
              >
                <span className="text-[10px] text-zinc-500 font-mono mt-0.5">
                  {formatSubtitleTime(time)}
                </span>
                <div className="flex-1 w-px bg-zinc-700" />
              </div>
            ))}
          </div>

          {/* Cue track */}
          <div className="absolute top-8 left-0 right-0 bottom-0 py-2">
            {cues.map((cue) => {
              const left = timeToPosition(cue.startTime);
              const width = timeToPosition(cue.endTime - cue.startTime);
              const isSelected = cue.id === selectedCueId;
              const isDragging = dragState?.cueId === cue.id;

              return (
                <div
                  key={cue.id}
                  className={cn(
                    'absolute h-16 rounded-md transition-all group',
                    'flex items-center overflow-hidden',
                    isSelected || isDragging
                      ? 'bg-white/10/40 border-2 border-white/30 z-10'
                      : 'bg-zinc-700/60 border border-zinc-600 hover:bg-zinc-700',
                    isDragging && 'cursor-grabbing'
                  )}
                  style={{
                    left: `${left}px`,
                    width: `${Math.max(width, 20)}px`,
                    top: '8px',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCueSelect(cue);
                  }}
                  onMouseDown={(e) => handleDragStart(e, cue, 'move')}
                >
                  {/* Start handle */}
                  <div
                    className={cn(
                      'absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize',
                      'bg-white/70/50 opacity-0 group-hover:opacity-100 hover:!bg-white/70',
                      'transition-opacity'
                    )}
                    onMouseDown={(e) => handleDragStart(e, cue, 'start')}
                  />

                  {/* Content */}
                  <div className="flex-1 px-2 overflow-hidden cursor-grab">
                    <p className="text-xs text-white truncate">
                      {cue.text || 'No text'}
                    </p>
                    <p className="text-[10px] text-zinc-400 font-mono">
                      {formatSubtitleTime(cue.startTime)}
                    </p>
                  </div>

                  {/* End handle */}
                  <div
                    className={cn(
                      'absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize',
                      'bg-white/70/50 opacity-0 group-hover:opacity-100 hover:!bg-white/70',
                      'transition-opacity'
                    )}
                    onMouseDown={(e) => handleDragStart(e, cue, 'end')}
                  />
                </div>
              );
            })}
          </div>

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
            style={{ left: `${timeToPosition(currentTime)}px` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-sm rotate-45" />
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="px-3 py-1.5 bg-zinc-800/30 border-t border-zinc-800">
        <p className="text-[10px] text-zinc-500">
          Click to seek • Drag cues to move • Drag edges to resize • Ctrl+Scroll to zoom
        </p>
      </div>
    </div>
  );
});

export default SubtitleTimeline;
