/**
 * SourceMonitorModal — Preview a media item and set in/out points before adding to timeline.
 * Double-click any item in the MediaPanel to open this.
 */

import { memo, useState, useRef, useCallback, useEffect } from 'react';
import {
  X,
  Play,
  Pause,
  SkipBack,
  ChevronLeft,
  ChevronRight,
  ArrowDownToLine,
  Maximize2,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useEditorStore } from '@/features/video-editor/stores/editor.store';
import { useCachedAssetUrlById } from '@/shared/hooks/useCachedAssetUrl';
import { formatSubtitleTime } from '@/shared/api/subtitle.api';
import type { ProjectMedia } from '@/types/videoProject.types';

interface SourceMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
  media: ProjectMedia | null;
}

export const SourceMonitorModal = memo(function SourceMonitorModal({
  isOpen,
  onClose,
  media,
}: SourceMonitorModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [inPoint, setInPoint] = useState(0);
  const [outPoint, setOutPoint] = useState(0);

  const { addClip, tracks } = useEditorStore();

  // Use externalId for server assets, fileUrl for local files
  const mediaAssetRef = media?.externalId || media?.fileUrl || null;
  const { url: videoUrl } = useCachedAssetUrlById(
    mediaAssetRef,
    media?.mediaType === 'audio' ? 'audio/*' : 'video/mp4',
    { type: 'preview', enabled: !!media && isOpen }
  );

  // Reset state when media changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setInPoint(0);
    setOutPoint(media?.duration ?? 0);
  }, [media?.id, media?.duration]);

  // Sync outPoint when duration is known from video metadata
  useEffect(() => {
    if (duration > 0 && outPoint === 0) {
      setOutPoint(duration);
    }
  }, [duration, outPoint]);

  const handleLoadedMetadata = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    setDuration(vid.duration);
    setOutPoint((prev) => (prev === 0 ? vid.duration : prev));
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const vid = videoRef.current;
    if (vid) setCurrentTime(vid.currentTime);
  }, []);

  const togglePlay = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (isPlaying) {
      vid.pause();
      setIsPlaying(false);
    } else {
      vid.currentTime = Math.max(inPoint, Math.min(currentTime, outPoint));
      vid.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [isPlaying, inPoint, outPoint, currentTime]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    setCurrentTime(t);
    if (videoRef.current) videoRef.current.currentTime = t;
  }, []);

  const setIn = useCallback(() => {
    setInPoint(currentTime);
    if (outPoint < currentTime) setOutPoint(currentTime);
  }, [currentTime, outPoint]);

  const setOut = useCallback(() => {
    setOutPoint(currentTime);
    if (inPoint > currentTime) setInPoint(currentTime);
  }, [currentTime, inPoint]);

  const handleAddToTimeline = useCallback(() => {
    if (!media) return;
    const clipDuration = outPoint - inPoint;
    if (clipDuration <= 0) return;

    // Find the first suitable track
    const targetTrack = tracks.find(
      (t) =>
        (media.mediaType === 'video' && t.type === 'video') ||
        (media.mediaType === 'audio' && t.type === 'audio') ||
        (media.mediaType === 'image' && t.type === 'video')
    );
    if (!targetTrack) return;

    // Find end of existing clips in that track
    const trackEnd = targetTrack.clips.reduce((max, c) => Math.max(max, c.endTime), 0);

    const mediaDuration = media.duration || clipDuration;
    const isImage = media.mediaType === 'image';

    if (media.mediaType === 'video' || isImage) {
      const videoClip = addClip(targetTrack.id, {
        type: 'video',
        name: media.name,
        assetId: media.externalId || media.fileUrl || '',
        startTime: trackEnd,
        endTime: trackEnd + clipDuration,
        sourceStartTime: inPoint,
        sourceEndTime: outPoint,
        sourceDuration: mediaDuration,
        transform: { scale: 1, rotation: 0, opacity: 1, x: 0, y: 0 },
        volume: 1,
        muted: false,
        speed: 1,
        blendMode: 'normal',
        effects: [],
        keyframes: [],
        mediaType: isImage ? 'image' : 'video',
      });

      // Auto-create paired audio clip for video (not images)
      if (!isImage && videoClip) {
        const audioTrack = tracks.find((t) => t.type === 'audio');
        if (audioTrack) {
          const audioClip = addClip(audioTrack.id, {
            type: 'audio',
            name: media.name,
            assetId: media.externalId || media.fileUrl || '',
            startTime: trackEnd,
            endTime: trackEnd + clipDuration,
            sourceStartTime: inPoint,
            sourceEndTime: outPoint,
            sourceDuration: mediaDuration,
            volume: 1,
            muted: false,
            fadeIn: 0,
            fadeOut: 0,
            effects: [],
            keyframes: [],
            linkedClipId: videoClip.id,
          });
          if (audioClip) {
            useEditorStore.getState().updateClip(videoClip.id, { linkedClipId: audioClip.id });
          }
        }
      }
    } else if (media.mediaType === 'audio') {
      addClip(targetTrack.id, {
        type: 'audio',
        name: media.name,
        assetId: media.externalId || media.fileUrl || '',
        startTime: trackEnd,
        endTime: trackEnd + clipDuration,
        sourceStartTime: inPoint,
        sourceEndTime: outPoint,
        sourceDuration: mediaDuration,
        volume: 1,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
        effects: [],
        keyframes: [],
      });
    }

    onClose();
  }, [media, inPoint, outPoint, tracks, addClip, onClose]);

  if (!isOpen || !media) return null;

  const clipDuration = outPoint - inPoint;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2 min-w-0">
            <Maximize2 className="w-4 h-4 text-zinc-400 flex-shrink-0" />
            <h2 className="text-sm font-medium text-white truncate">{media.name}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded transition-colors ml-2">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {/* Video preview */}
        <div className="relative bg-black aspect-video w-full">
          {videoUrl ? (
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full object-contain"
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => setIsPlaying(false)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm">
              Loading preview...
            </div>
          )}

          {/* In/Out overlay */}
          {duration > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800">
              <div
                className="absolute h-full bg-white/30"
                style={{
                  left: `${(inPoint / duration) * 100}%`,
                  width: `${((outPoint - inPoint) / duration) * 100}%`,
                }}
              />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="px-4 py-3 space-y-3">
          {/* Scrubber */}
          {duration > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500 font-mono w-16 text-right">
                {formatSubtitleTime(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.01}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 accent-white"
              />
              <span className="text-[10px] text-zinc-500 font-mono w-16">
                {formatSubtitleTime(duration)}
              </span>
            </div>
          )}

          {/* Transport + In/Out */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => { if (videoRef.current) videoRef.current.currentTime = 0; setCurrentTime(0); }}
                className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors"
                title="Go to start"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={() => { const t = Math.max(0, currentTime - 1 / 30); if (videoRef.current) videoRef.current.currentTime = t; setCurrentTime(t); }}
                className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors"
                title="Previous frame"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={togglePlay}
                className="p-2 bg-white text-zinc-900 rounded-full hover:bg-zinc-100 transition-colors"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                onClick={() => { const t = Math.min(duration, currentTime + 1 / 30); if (videoRef.current) videoRef.current.currentTime = t; setCurrentTime(t); }}
                className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors"
                title="Next frame"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* In/Out controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={setIn}
                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 hover:text-white transition-colors border border-zinc-700"
                title="Set In Point (I)"
              >
                In {formatSubtitleTime(inPoint)}
              </button>
              <button
                onClick={setOut}
                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 hover:text-white transition-colors border border-zinc-700"
                title="Set Out Point (O)"
              >
                Out {formatSubtitleTime(outPoint)}
              </button>
              <span className="text-[10px] text-zinc-500">
                {formatSubtitleTime(clipDuration)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAddToTimeline}
            disabled={clipDuration <= 0}
            className={cn(
              'flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              clipDuration > 0
                ? 'bg-white text-zinc-900 hover:bg-zinc-100'
                : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
            )}
          >
            <ArrowDownToLine className="w-4 h-4" />
            Add to Timeline
          </button>
        </div>
      </div>
    </div>
  );
});

export default SourceMonitorModal;
