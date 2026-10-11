/**
 * PlayheadControls - Transport controls for video editor
 * Play, pause, seek, playback rate, and time display
 */

import { memo, useCallback, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Rewind,
  FastForward,
  Volume2,
  VolumeX,
  Maximize2,
  Grid3X3,
  Undo2,
  Redo2,
  Scissors,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useEditorStore } from '@/features/video-editor/stores/editor.store';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import { useShallow } from 'zustand/react/shallow';
import { selectPlayheadState, selectPlayheadActions } from '@/features/video-editor/stores/editor/selectors';
import { formatSMPTE } from '@/shared/api/subtitle.api';

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

const STANDARD_RATIOS = [
  { w: 16, h: 9 }, { w: 9, h: 16 },
  { w: 4, h: 3 },  { w: 3, h: 4 },
  { w: 1, h: 1 },
  { w: 21, h: 9 }, { w: 9, h: 21 },
  { w: 2, h: 1 },  { w: 1, h: 2 },
  { w: 3, h: 2 },  { w: 2, h: 3 },
  { w: 16, h: 10 },
];

function getRatio(w: number, h: number): string {
  const actual = w / h;

  // Exact match against known standard ratios (within 2% tolerance)
  for (const r of STANDARD_RATIOS) {
    if (Math.abs(actual - r.w / r.h) < 0.02) return `${r.w}:${r.h}`;
  }

  // GCD-reduced exact ratio for small numbers
  const d = gcd(w, h);
  const rw = w / d, rh = h / d;
  if (rw <= 30 && rh <= 30) return `${rw}:${rh}`;

  // Non-standard: show closest known ratio with ≈ prefix
  let best = STANDARD_RATIOS[0];
  let bestDiff = Infinity;
  for (const r of STANDARD_RATIOS) {
    const diff = Math.abs(actual - r.w / r.h);
    if (diff < bestDiff) { bestDiff = diff; best = r; }
  }
  return `≈${best.w}:${best.h}`;
}

interface PlayheadControlsProps {
  className?: string;
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export const PlayheadControls = memo(function PlayheadControls({
  className,
}: PlayheadControlsProps) {
  const {
    currentTime, duration, isPlaying, playbackRate,
    volume, isMuted, snapToGrid, selectedClip,
    frameRate, inPoint, outPoint, canUndo, canRedo,
  } = useEditorStore(useShallow(selectPlayheadState));

  const currentProject = useVideoProjectStore((s) => s.currentProject);
  const projectRatio = currentProject
    ? getRatio(currentProject.width, currentProject.height)
    : null;

  const {
    togglePlay, seek, setPlaybackRate, setVolume,
    toggleMute, toggleSnapToGrid, fitToView,
    undo, redo, splitClip,
  } = useEditorStore(useShallow(selectPlayheadActions));

  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  const canSplit = selectedClip !== null;

  // Skip to start
  const handleSkipToStart = useCallback(() => {
    seek(0);
  }, [seek]);

  // Skip to end
  const handleSkipToEnd = useCallback(() => {
    seek(duration);
  }, [seek, duration]);

  // Step backward (1 second)
  const handleStepBackward = useCallback(() => {
    seek(Math.max(0, currentTime - 1));
  }, [seek, currentTime]);

  // Step forward (1 second)
  const handleStepForward = useCallback(() => {
    seek(Math.min(duration, currentTime + 1));
  }, [seek, currentTime, duration]);

  // Split selected clip at playhead
  const handleSplit = useCallback(() => {
    if (!selectedClip) return;
    if (currentTime > selectedClip.startTime && currentTime < selectedClip.endTime) {
      splitClip(selectedClip.id, currentTime);
    }
  }, [selectedClip, currentTime, splitClip]);

  // Handle volume change
  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setVolume(parseFloat(e.target.value));
    },
    [setVolume]
  );

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 bg-zinc-800',
        className
      )}
    >
      {/* History controls */}
      <div className="flex items-center gap-1 border-r border-zinc-700 pr-3">
        <button
          className={cn(
            'p-1.5 rounded hover:bg-zinc-700 transition-colors',
            canUndo ? 'text-zinc-300' : 'text-zinc-600 cursor-not-allowed'
          )}
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          className={cn(
            'p-1.5 rounded hover:bg-zinc-700 transition-colors',
            canRedo ? 'text-zinc-300' : 'text-zinc-600 cursor-not-allowed'
          )}
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      {/* Transport controls */}
      <div className="flex items-center gap-1">
        <button
          className="p-1.5 rounded hover:bg-zinc-700 text-zinc-300 transition-colors"
          onClick={handleSkipToStart}
          title="Skip to start (Home)"
        >
          <SkipBack className="w-4 h-4" />
        </button>

        <button
          className="p-1.5 rounded hover:bg-zinc-700 text-zinc-300 transition-colors"
          onClick={handleStepBackward}
          title="Step backward 1s (Left)"
        >
          <Rewind className="w-4 h-4" />
        </button>

        <button
          className={cn(
            'p-2 rounded-full transition-colors',
            isPlaying
              ? 'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white'
              : 'bg-zinc-700 text-white hover:bg-zinc-600'
          )}
          onClick={togglePlay}
          title="Play/Pause (Space)"
        >
          {isPlaying ? (
            <Pause className="w-5 h-5" />
          ) : (
            <Play className="w-5 h-5 ml-0.5" />
          )}
        </button>

        <button
          className="p-1.5 rounded hover:bg-zinc-700 text-zinc-300 transition-colors"
          onClick={handleStepForward}
          title="Step forward 1s (Right)"
        >
          <FastForward className="w-4 h-4" />
        </button>

        <button
          className="p-1.5 rounded hover:bg-zinc-700 text-zinc-300 transition-colors"
          onClick={handleSkipToEnd}
          title="Skip to end (End)"
        >
          <SkipForward className="w-4 h-4" />
        </button>
      </div>

      {/* Time display - SMPTE format (HH:MM:SS:FF) */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded font-mono text-sm select-none">
        <span className="text-white">{formatSMPTE(currentTime, frameRate)}</span>
        <span className="text-zinc-500">/</span>
        <span className="text-zinc-400">{formatSMPTE(duration, frameRate)}</span>
      </div>

      {/* In/Out point display */}
      {(inPoint !== null || outPoint !== null) && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-900/70 rounded font-mono text-[10px] select-none">
          <span className="text-cyan-400">I:</span>
          <span className="text-zinc-300">{inPoint !== null ? formatSMPTE(inPoint, frameRate) : '--:--:--:--'}</span>
          <span className="text-zinc-600">|</span>
          <span className="text-cyan-400">O:</span>
          <span className="text-zinc-300">{outPoint !== null ? formatSMPTE(outPoint, frameRate) : '--:--:--:--'}</span>
        </div>
      )}

      {/* Split button */}
      <button
        className={cn(
          'p-1.5 rounded transition-colors flex items-center gap-1.5',
          canSplit
            ? 'hover:bg-zinc-700 text-zinc-300'
            : 'text-zinc-600 cursor-not-allowed'
        )}
        onClick={handleSplit}
        disabled={!canSplit}
        title="Split clip at playhead (S)"
      >
        <Scissors className="w-4 h-4" />
        <span className="text-xs">Split</span>
      </button>

      {/* Project resolution & ratio */}
      {currentProject && projectRatio && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-900/70 rounded font-mono text-[10px] select-none text-zinc-400">
          <span>{currentProject.width}×{currentProject.height}</span>
          <span className="text-zinc-600">·</span>
          <span className="text-zinc-300">{projectRatio}</span>
          <span className="text-zinc-600">·</span>
          <span>{currentProject.frameRate}fps</span>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Snap to grid */}
      <button
        className={cn(
          'p-1.5 rounded transition-colors',
          snapToGrid
            ? 'bg-white/10 text-white'
            : 'text-zinc-400 hover:bg-zinc-700 hover:text-white'
        )}
        onClick={toggleSnapToGrid}
        title="Snap to grid (G)"
      >
        <Grid3X3 className="w-4 h-4" />
      </button>

      {/* Fit to view */}
      <button
        className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
        onClick={() => fitToView(window.innerWidth - 300)}
        title="Fit timeline to view"
      >
        <Maximize2 className="w-4 h-4" />
      </button>

      {/* Playback rate */}
      <div className="relative select-none">
        <button
          className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors flex items-center"
          onClick={() => setShowSpeedMenu(!showSpeedMenu)}
          title="Playback speed"
        >
          <span className="text-xs">{playbackRate}x</span>
        </button>

        {showSpeedMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowSpeedMenu(false)}
            />
            <div className="absolute bottom-full right-0 mb-2 py-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 min-w-[80px]">
              {PLAYBACK_RATES.map((rate) => (
                <button
                  key={rate}
                  className={cn(
                    'w-full px-3 py-1.5 text-left text-xs transition-colors',
                    rate === playbackRate
                      ? 'bg-white/10 text-white border border-white/20'
                      : 'text-zinc-300 hover:bg-zinc-700 hover:text-white'
                  )}
                  onClick={() => {
                    setPlaybackRate(rate);
                    setShowSpeedMenu(false);
                  }}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Volume control */}
      <div className="flex items-center gap-2">
        <button
          className={cn(
            'p-1.5 rounded hover:bg-zinc-700 transition-colors',
            isMuted ? 'text-red-400' : 'text-zinc-400 hover:text-white'
          )}
          onClick={toggleMute}
          title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
        >
          {isMuted || volume === 0 ? (
            <VolumeX className="w-4 h-4" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
        </button>

        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          className={cn(
            'w-20 h-1 rounded-full appearance-none cursor-pointer',
            'bg-zinc-600',
            '[&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3',
            '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white',
            '[&::-webkit-slider-thumb]:cursor-pointer'
          )}
        />
      </div>
    </div>
  );
});

export default PlayheadControls;
