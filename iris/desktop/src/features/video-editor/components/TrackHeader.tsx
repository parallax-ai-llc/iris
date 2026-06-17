/**
 * TrackHeader - Track controls (mute, lock, visibility)
 * Shows track name, type icon, and control buttons
 */

import { memo, useCallback } from 'react';
import {
  Video,
  Volume2,
  VolumeX,
  Type,
  Music,
  Layers,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  GripVertical,
  Trash2,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useEditorStore, type Track, type TrackType } from '@/features/video-editor/stores/editor.store';

interface TrackHeaderProps {
  track: Track;
  isSelected: boolean;
  isTarget?: boolean;
}

// Get icon for track type
function getTrackIcon(type: TrackType) {
  switch (type) {
    case 'video':
      return Video;
    case 'audio':
      return Volume2;
    case 'subtitle':
      return Type;
    case 'music':
      return Music;
    case 'adjustment':
      return Layers;
  }
}

// Get color for track type
function getTrackColor(type: TrackType) {
  switch (type) {
    case 'video':
      return 'text-blue-400';
    case 'audio':
      return 'text-green-400';
    case 'subtitle':
      return 'text-yellow-400';
    case 'music':
      return 'text-purple-400';
    case 'adjustment':
      return 'text-orange-400';
  }
}

export const TrackHeader = memo(function TrackHeader({
  track,
  isSelected,
  isTarget,
}: TrackHeaderProps) {
  const selectTrack = useEditorStore((s) => s.selectTrack);
  const toggleTrackMute = useEditorStore((s) => s.toggleTrackMute);
  const toggleTrackLock = useEditorStore((s) => s.toggleTrackLock);
  const toggleTrackVisibility = useEditorStore((s) => s.toggleTrackVisibility);
  const removeTrack = useEditorStore((s) => s.removeTrack);
  const setTargetVideoTrack = useEditorStore((s) => s.setTargetVideoTrack);
  const setTargetAudioTrack = useEditorStore((s) => s.setTargetAudioTrack);

  const Icon = getTrackIcon(track.type);
  const color = getTrackColor(track.type);

  const handleSelect = useCallback(() => {
    selectTrack(track.id);
  }, [track.id, selectTrack]);

  const handleMute = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleTrackMute(track.id);
    },
    [track.id, toggleTrackMute]
  );

  const handleLock = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleTrackLock(track.id);
    },
    [track.id, toggleTrackLock]
  );

  const handleVisibility = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleTrackVisibility(track.id);
    },
    [track.id, toggleTrackVisibility]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // Don't delete if it's the main video/audio track
      if (track.clips.length > 0 && (track.type === 'video' || track.type === 'audio')) {
        return;
      }
      removeTrack(track.id);
    },
    [track, removeTrack]
  );

  // Can't delete main video/audio tracks
  const canDelete =
    track.clips.length === 0 ||
    (track.type !== 'video' && track.type !== 'audio');

  // Toggle target track (click on target indicator)
  const handleTargetToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (track.type === 'video') {
        setTargetVideoTrack(isTarget ? null : track.id);
      } else if (track.type === 'audio' || track.type === 'music') {
        setTargetAudioTrack(isTarget ? null : track.id);
      }
    },
    [track.id, track.type, isTarget, setTargetVideoTrack, setTargetAudioTrack]
  );

  // Target label (V1, V2, A1, A2, etc.)
  const targetLabel =
    track.type === 'video' ? 'V' : track.type === 'audio' || track.type === 'music' ? 'A' : null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2 border-b border-zinc-700',
        'bg-zinc-800/50 hover:bg-zinc-800 transition-colors cursor-pointer',
        isSelected && 'bg-zinc-700/50 border-l-2 border-l-white/50'
      )}
      style={{ height: `${track.height}px` }}
      onClick={handleSelect}
    >
      {/* Track target indicator (V1/A1) */}
      {targetLabel ? (
        <button
          className={cn(
            'w-5 h-4 rounded text-[9px] font-bold flex items-center justify-center flex-shrink-0 transition-colors',
            isTarget
              ? track.type === 'video'
                ? 'bg-blue-500 text-white'
                : 'bg-green-500 text-white'
              : 'bg-zinc-700 text-zinc-500 hover:bg-zinc-600'
          )}
          onClick={handleTargetToggle}
          title={isTarget ? 'Remove target' : 'Set as target track'}
        >
          {targetLabel}
        </button>
      ) : (
        <GripVertical className="w-3 h-3 text-zinc-600 cursor-grab flex-shrink-0" />
      )}

      {/* Track icon */}
      <Icon className={cn('w-4 h-4 flex-shrink-0', color)} />

      {/* Track name */}
      <span className="flex-1 text-xs text-zinc-300 truncate min-w-0">
        {track.name}
      </span>

      {/* Control buttons */}
      <div className="flex items-center gap-0.5">
        {/* Mute button (for audio/music tracks) */}
        {(track.type === 'audio' || track.type === 'music') && (
          <button
            className={cn(
              'p-1 rounded hover:bg-zinc-700 transition-colors',
              track.muted ? 'text-red-400' : 'text-zinc-400 hover:text-white'
            )}
            onClick={handleMute}
            title={track.muted ? 'Unmute' : 'Mute'}
          >
            {track.muted ? (
              <VolumeX className="w-3 h-3" />
            ) : (
              <Volume2 className="w-3 h-3" />
            )}
          </button>
        )}

        {/* Visibility button (for video/subtitle tracks) */}
        {(track.type === 'video' || track.type === 'subtitle') && (
          <button
            className={cn(
              'p-1 rounded hover:bg-zinc-700 transition-colors',
              !track.visible ? 'text-red-400' : 'text-zinc-400 hover:text-white'
            )}
            onClick={handleVisibility}
            title={track.visible ? 'Hide' : 'Show'}
          >
            {track.visible ? (
              <Eye className="w-3 h-3" />
            ) : (
              <EyeOff className="w-3 h-3" />
            )}
          </button>
        )}

        {/* Lock button */}
        <button
          className={cn(
            'p-1 rounded hover:bg-zinc-700 transition-colors',
            track.locked ? 'text-yellow-400' : 'text-zinc-400 hover:text-white'
          )}
          onClick={handleLock}
          title={track.locked ? 'Unlock' : 'Lock'}
        >
          {track.locked ? (
            <Lock className="w-3 h-3" />
          ) : (
            <Unlock className="w-3 h-3" />
          )}
        </button>

        {/* Delete button */}
        {canDelete && (
          <button
            className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-red-400 transition-colors"
            onClick={handleDelete}
            title="Delete track"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
});

export default TrackHeader;
