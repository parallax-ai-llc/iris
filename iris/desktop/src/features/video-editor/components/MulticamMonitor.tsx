/**
 * MulticamMonitor - Multi-angle source monitor for multicam editing
 * Shows all camera angles in a grid, allowing live angle switching during playback
 */

import { memo, useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { Camera, Trash2, X, Film, Plus, Info, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  useEditorStore,
  type MulticamSource,
} from '@/features/video-editor/stores/editor.store';
import { useVideoProjectStore, selectMediaPool } from '@/features/video-editor/stores/videoProject.store';
import { useCachedAssetUrlById } from '@/shared/hooks/useCachedAssetUrl';
import { useProxyAwareAssetId } from '@/features/video-editor/stores/editor/proxyResolve';

interface MulticamMonitorProps {
  className?: string;
  onClose?: () => void;
}

// Individual camera angle preview
const AnglePreview = memo(function AnglePreview({
  source,
  index,
  isActive,
  isPlaying,
  currentTime,
  audioActive,
  onSelect,
  onRemove,
}: {
  source: MulticamSource;
  index: number;
  isActive: boolean;
  isPlaying: boolean;
  currentTime: number;
  /** When true, this preview's video element will be unmuted (used for the active angle when audio-follow is on) */
  audioActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const playbackAssetId = useProxyAwareAssetId(source.assetId);
  const { url: videoUrl } = useCachedAssetUrlById(
    playbackAssetId,
    'video/mp4',
    { type: 'preview', enabled: true }
  );

  return (
    <div
      className={cn(
        'relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all',
        isActive
          ? 'border-sky-400 ring-2 ring-sky-400/30'
          : 'border-zinc-700 hover:border-zinc-500'
      )}
      onClick={onSelect}
    >
      {/* Video preview */}
      <div className="aspect-video bg-zinc-900 relative">
        {videoUrl ? (
          <video
            src={videoUrl}
            className="w-full h-full object-contain"
            muted={!audioActive}
            playsInline
            crossOrigin="anonymous"
            ref={(el) => {
              if (el) {
                const syncTime = currentTime + source.syncOffset;
                if (Math.abs(el.currentTime - syncTime) > 0.2) {
                  el.currentTime = Math.max(0, syncTime);
                }
                // Keep DOM property in sync (the muted attribute alone isn't enough on re-renders)
                if (el.muted !== !audioActive) el.muted = !audioActive;
                if (isPlaying && el.paused) el.play().catch(() => {});
                if (!isPlaying && !el.paused) el.pause();
              }
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-8 h-8 text-zinc-700" />
          </div>
        )}

        {/* Angle number badge */}
        <div className={cn(
          'absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-bold',
          isActive ? 'bg-sky-500 text-white' : 'bg-black/60 text-zinc-300'
        )}>
          {index + 1}
        </div>

        {/* Active indicator */}
        {isActive && (
          <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        )}

        {/* Remove button */}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute bottom-1 right-1 p-0.5 rounded bg-black/50 text-zinc-400 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Label */}
      <div className="px-2 py-1 bg-zinc-800">
        <p className="text-[10px] text-zinc-300 truncate">{source.name}</p>
      </div>
    </div>
  );
});

export const MulticamMonitor = memo(function MulticamMonitor({
  className,
  onClose,
}: MulticamMonitorProps) {
  const multicamSources = useEditorStore((s) => s.multicamSources);
  const multicamActiveAngle = useEditorStore((s) => s.multicamActiveAngle);
  const multicamCuts = useEditorStore((s) => s.multicamCuts);
  const currentTime = useEditorStore((s) => s.currentTime);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const setMulticamActiveAngle = useEditorStore((s) => s.setMulticamActiveAngle);
  const addMulticamCut = useEditorStore((s) => s.addMulticamCut);
  const addMulticamSource = useEditorStore((s) => s.addMulticamSource);
  const removeMulticamSource = useEditorStore((s) => s.removeMulticamSource);
  const flattenMulticamToTimeline = useEditorStore((s) => s.flattenMulticamToTimeline);
  const clearMulticamCuts = useEditorStore((s) => s.clearMulticamCuts);
  const audioFollowVideo = useEditorStore((s) => s.multicamAudioFollowVideo);
  const toggleAudioFollowVideo = useEditorStore((s) => s.toggleMulticamAudioFollowVideo);

  const mediaPool = useVideoProjectStore(selectMediaPool);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [pickerOpen]);

  // Available video assets that aren't already added as multicam sources
  const availableVideoAssets = useMemo(() => {
    const usedAssetIds = new Set(multicamSources.map((s) => s.assetId));
    return mediaPool.filter((m) => m.mediaType === 'video' && !usedAssetIds.has(m.id));
  }, [mediaPool, multicamSources]);

  const handleAddSource = useCallback(
    (asset: (typeof mediaPool)[number]) => {
      addMulticamSource({
        assetId: asset.id,
        name: asset.name,
        thumbnailUrl: asset.thumbnailUrl ?? undefined,
        syncOffset: 0,
        duration: asset.duration ?? 0,
      });
      setPickerOpen(false);
    },
    [addMulticamSource],
  );

  // Determine current active angle from cuts
  const currentAngle = useMemo(() => {
    if (multicamCuts.length === 0) return multicamActiveAngle;
    const sortedCuts = [...multicamCuts].sort((a, b) => a.time - b.time);
    let active = multicamActiveAngle;
    for (const cut of sortedCuts) {
      if (currentTime >= cut.time) {
        active = cut.angleIndex;
      } else break;
    }
    return active;
  }, [multicamCuts, currentTime, multicamActiveAngle]);

  const handleAngleSelect = useCallback((index: number) => {
    setMulticamActiveAngle(index);
    // If playing, record a cut at current time
    if (isPlaying) {
      addMulticamCut(currentTime, index);
    }
  }, [setMulticamActiveAngle, addMulticamCut, isPlaying, currentTime]);

  const handleRemoveSource = useCallback((sourceId: string) => {
    removeMulticamSource(sourceId);
  }, [removeMulticamSource]);

  // Grid columns based on source count
  const gridCols = multicamSources.length <= 2 ? 'grid-cols-2'
    : multicamSources.length <= 4 ? 'grid-cols-2'
    : multicamSources.length <= 6 ? 'grid-cols-3'
    : 'grid-cols-4';

  return (
    <div className={cn('flex flex-col bg-zinc-900 border-b border-zinc-800', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-sky-400" />
          <h3 className="text-xs font-medium text-white">Multicam Monitor</h3>
          <span className="text-[10px] text-zinc-500">
            {multicamSources.length} angles · {multicamCuts.length} cuts
          </span>
          {/* Info tooltip — replaces the previous bottom keyboard hint */}
          <span
            className="inline-flex items-center text-zinc-500 hover:text-zinc-300 cursor-help"
            title={
              'How to use:\n' +
              '• Add camera angles with the + button\n' +
              '• Press 1–9 during playback to switch angles\n' +
              '• Cuts are recorded automatically while playing\n' +
              '• Toggle the speaker icon to hear the active angle’s audio\n' +
              '• Click Flatten to bake the cuts into the timeline'
            }
          >
            <Info className="w-3 h-3" />
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Audio follow video toggle */}
          <button
            onClick={toggleAudioFollowVideo}
            className={cn(
              'p-1 rounded transition-colors',
              audioFollowVideo
                ? 'text-sky-400 hover:text-sky-300 bg-sky-500/10'
                : 'text-zinc-500 hover:text-white bg-zinc-800',
            )}
            title={
              audioFollowVideo
                ? 'Audio follows active angle (click to mute monitor)'
                : 'Monitor is muted (click to follow active angle audio)'
            }
          >
            {audioFollowVideo ? (
              <Volume2 className="w-3.5 h-3.5" />
            ) : (
              <VolumeX className="w-3.5 h-3.5" />
            )}
          </button>
          {/* Add Source dropdown */}
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] text-sky-400 hover:text-sky-300 bg-sky-500/10 rounded transition-colors"
              title="Add a video asset as a camera angle"
            >
              <Plus className="w-3 h-3" />
              Add Source
            </button>
            {pickerOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 max-h-72 overflow-y-auto rounded-md border border-zinc-700 bg-zinc-900 shadow-lg z-50">
                {availableVideoAssets.length === 0 ? (
                  <div className="px-3 py-3 text-[11px] text-zinc-500 text-center">
                    {mediaPool.length === 0
                      ? 'No media in project. Import videos first.'
                      : 'All video assets are already added.'}
                  </div>
                ) : (
                  <ul className="py-1">
                    {availableVideoAssets.map((asset) => (
                      <li key={asset.id}>
                        <button
                          onClick={() => handleAddSource(asset)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-zinc-800 transition-colors"
                        >
                          <div className="w-10 h-6 flex-shrink-0 bg-zinc-800 rounded overflow-hidden flex items-center justify-center">
                            {asset.thumbnailUrl ? (
                              <img
                                src={asset.thumbnailUrl}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Film className="w-3 h-3 text-zinc-600" />
                            )}
                          </div>
                          <span className="flex-1 min-w-0 truncate text-[11px] text-zinc-200">
                            {asset.name}
                          </span>
                          {asset.duration != null && (
                            <span className="text-[10px] text-zinc-500 flex-shrink-0">
                              {asset.duration.toFixed(1)}s
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <button
            onClick={clearMulticamCuts}
            className="px-2 py-1 text-[10px] text-zinc-400 hover:text-white bg-zinc-800 rounded transition-colors"
            title="Clear all cuts"
          >
            Clear Cuts
          </button>
          <button
            onClick={flattenMulticamToTimeline}
            className="px-2 py-1 text-[10px] text-sky-400 hover:text-sky-300 bg-sky-500/10 rounded transition-colors"
            title="Apply multicam edits to timeline"
          >
            Flatten
          </button>
          {onClose && (
            <button onClick={onClose} className="p-1 text-zinc-500 hover:text-white transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Source grid */}
      {multicamSources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Camera className="w-10 h-10 text-zinc-700 mb-2" />
          <p className="text-xs text-zinc-500 mb-1">No camera angles added</p>
          <p className="text-[10px] text-zinc-600">
            Click <span className="text-sky-400">+ Add Source</span> above to pick a video from the media pool
          </p>
        </div>
      ) : (
        <div className={cn('grid gap-2 p-3', gridCols)}>
          {multicamSources.map((source, index) => (
            <AnglePreview
              key={source.id}
              source={source}
              index={index}
              isActive={currentAngle === index}
              isPlaying={isPlaying}
              currentTime={currentTime}
              audioActive={audioFollowVideo && currentAngle === index}
              onSelect={() => handleAngleSelect(index)}
              onRemove={() => handleRemoveSource(source.id)}
            />
          ))}
        </div>
      )}

    </div>
  );
});

export default MulticamMonitor;
