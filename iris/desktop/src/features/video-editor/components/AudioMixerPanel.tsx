/**
 * AudioMixerPanel - Audio mixer with per-track pan, volume, and gain controls
 * Displays channel strips for each audio/music track (and video tracks with audio).
 *
 * Channel Strip Layout (per track):
 * ┌────────────┐
 * │  Track Name │
 * │  [Pan Knob] │  L ─── C ─── R
 * │  Pan Value  │
 * │  ─────────  │
 * │  [Volume]   │  fader slider
 * │  Vol  dB    │
 * │  ─────────  │
 * │  Gain  dB   │  +/- input
 * │  [M]  [N]   │  Mute / Normalize
 * └────────────┘
 */

import { memo, useCallback } from 'react';
import { Volume2, VolumeX, Sliders, RotateCcw } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  useEditorStore,
  type Track,
} from '@/features/video-editor/stores/editor.store';

// Convert linear volume (0–1) to dB string for display
function linearToDb(linear: number): string {
  if (linear <= 0) return '-∞';
  const db = 20 * Math.log10(linear);
  return `${db >= 0 ? '+' : ''}${db.toFixed(1)}`;
}

// Convert pan value to display string
function panToLabel(pan: number): string {
  if (Math.abs(pan) < 0.01) return 'C';
  const pct = Math.round(Math.abs(pan) * 100);
  return pan < 0 ? `L${pct}` : `R${pct}`;
}

interface ChannelStripProps {
  track: Track;
}

const ChannelStrip = memo(function ChannelStrip({ track }: ChannelStripProps) {
  const toggleTrackMute = useEditorStore((s) => s.toggleTrackMute);
  const setTrackPan = useEditorStore((s) => s.setTrackPan);
  const updateTrack = useEditorStore((s) => s.updateTrack);

  // Derive a representative volume from the first audio/video clip on this track
  // (track-level volume is stored as `volume` on each clip; here we display track fader)
  // For simplicity, track fader is represented via track.clips[0].volume or 1
  const firstClip = track.clips[0];
  const trackVolume =
    firstClip && 'volume' in firstClip ? firstClip.volume : 1;

  const handleMute = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleTrackMute(track.id);
    },
    [track.id, toggleTrackMute]
  );

  const handlePanChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTrackPan(track.id, parseFloat(e.target.value));
    },
    [track.id, setTrackPan]
  );

  const handlePanReset = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setTrackPan(track.id, 0);
    },
    [track.id, setTrackPan]
  );

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const vol = parseFloat(e.target.value);
      // Update all clips on this track with the new volume
      const { tracks, updateClip } = useEditorStore.getState();
      const t = tracks.find((tr) => tr.id === track.id);
      if (!t) return;
      t.clips.forEach((c) => {
        if ('volume' in c) updateClip(c.id, { volume: vol });
      });
      // Also mark track as updated (no separate track volume field; clips carry volume)
      updateTrack(track.id, {});
    },
    [track.id, updateTrack]
  );

  // Track color by type
  const accentColor =
    track.type === 'video'
      ? 'text-blue-400 border-blue-500/30'
      : track.type === 'music'
      ? 'text-purple-400 border-purple-500/30'
      : 'text-green-400 border-green-500/30';

  const panLabel = panToLabel(track.pan ?? 0);
  const isPanCenter = Math.abs(track.pan ?? 0) < 0.01;

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 px-3 py-3',
        'bg-zinc-900 border border-zinc-800 rounded-lg',
        'w-28 flex-shrink-0',
        track.muted && 'opacity-50'
      )}
    >
      {/* Track name */}
      <div className="w-full text-center">
        <span className={cn('text-[10px] font-semibold truncate block', accentColor)}>
          {track.name}
        </span>
      </div>

      {/* Pan section */}
      <div className="w-full flex flex-col items-center gap-1">
        {/* L/C/R labels */}
        <div className="flex items-center justify-between w-full px-0.5">
          <span className="text-[9px] text-zinc-500">L</span>
          <span className="text-[9px] text-zinc-500">C</span>
          <span className="text-[9px] text-zinc-500">R</span>
        </div>

        {/* Pan slider */}
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={track.pan}
          onChange={handlePanChange}
          className={cn(
            'w-full h-1.5 appearance-none rounded-full cursor-pointer',
            'bg-zinc-700 accent-zinc-300',
            '[&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3',
            '[&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:bg-white',
            '[&::-webkit-slider-thumb]:cursor-grab',
            '[&::-webkit-slider-thumb]:shadow-sm'
          )}
          title={`Pan: ${panLabel}`}
        />

        {/* Pan value + reset */}
        <div className="flex items-center gap-1">
          <span
            className={cn(
              'text-[9px] font-mono tabular-nums min-w-[24px] text-center',
              isPanCenter ? 'text-zinc-500' : 'text-white'
            )}
          >
            {panLabel}
          </span>
          {!isPanCenter && (
            <button
              onClick={handlePanReset}
              className="text-zinc-600 hover:text-zinc-300 transition-colors"
              title="Reset pan to center"
            >
              <RotateCcw className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="w-full border-t border-zinc-800" />

      {/* Volume fader */}
      <div className="w-full flex flex-col items-center gap-1">
        <span className="text-[9px] text-zinc-500 flex items-center gap-1">
          <Sliders className="w-2.5 h-2.5" />
          Vol
        </span>

        {/* Vertical fader (rotated range input) */}
        <div className="flex flex-col items-center gap-1 w-full">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={trackVolume}
            onChange={handleVolumeChange}
            className={cn(
              'w-full h-1.5 appearance-none rounded-full cursor-pointer',
              'bg-zinc-700 accent-zinc-300',
              '[&::-webkit-slider-thumb]:appearance-none',
              '[&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3',
              '[&::-webkit-slider-thumb]:rounded-full',
              '[&::-webkit-slider-thumb]:bg-white',
              '[&::-webkit-slider-thumb]:cursor-grab',
              '[&::-webkit-slider-thumb]:shadow-sm'
            )}
            title={`Volume: ${linearToDb(trackVolume)} dB`}
          />
          <span className="text-[9px] font-mono tabular-nums text-zinc-400">
            {linearToDb(trackVolume)} dB
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="w-full border-t border-zinc-800" />

      {/* Mute button */}
      <button
        onClick={handleMute}
        className={cn(
          'w-full flex items-center justify-center gap-1 py-1 rounded text-[9px] font-medium transition-colors',
          track.muted
            ? 'bg-red-900/50 text-red-400 border border-red-700/50'
            : 'bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 hover:bg-zinc-700'
        )}
        title={track.muted ? 'Unmute track' : 'Mute track'}
      >
        {track.muted ? (
          <VolumeX className="w-3 h-3" />
        ) : (
          <Volume2 className="w-3 h-3" />
        )}
        <span>{track.muted ? 'Muted' : 'M'}</span>
      </button>
    </div>
  );
});

// Clip-level pan/gain controls for selected audio/video clips
interface ClipAudioControlsProps {
  clipId: string;
  clipName: string;
  pan: number;
  gain: number;
  volume: number;
}

const ClipAudioControls = memo(function ClipAudioControls({
  clipId,
  clipName,
  pan,
  gain,
  volume,
}: ClipAudioControlsProps) {
  const setClipPan = useEditorStore((s) => s.setClipPan);
  const setClipGain = useEditorStore((s) => s.setClipGain);
  const normalizeClipAudio = useEditorStore((s) => s.normalizeClipAudio);

  const isPanCenter = Math.abs(pan) < 0.01;

  return (
    <div className="flex flex-col gap-2 p-3 bg-zinc-900 border border-zinc-800 rounded-lg w-full">
      {/* Clip label */}
      <div className="text-[10px] font-semibold text-zinc-300 truncate">
        {clipName}
      </div>

      {/* Pan row */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-zinc-500">Pan</span>
          <div className="flex items-center gap-1">
            <span
              className={cn(
                'text-[9px] font-mono tabular-nums',
                isPanCenter ? 'text-zinc-500' : 'text-white'
              )}
            >
              {panToLabel(pan)}
            </span>
            {!isPanCenter && (
              <button
                onClick={() => setClipPan(clipId, 0)}
                className="text-zinc-600 hover:text-zinc-300 transition-colors"
                title="Reset pan"
              >
                <RotateCcw className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        </div>

        {/* L/C/R marker */}
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[8px] text-zinc-600">L</span>
          <span className="text-[8px] text-zinc-600">C</span>
          <span className="text-[8px] text-zinc-600">R</span>
        </div>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={pan}
          onChange={(e) => setClipPan(clipId, parseFloat(e.target.value))}
          className={cn(
            'w-full h-1.5 appearance-none rounded-full cursor-pointer',
            'bg-zinc-700 accent-zinc-300',
            '[&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3',
            '[&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:bg-white',
            '[&::-webkit-slider-thumb]:cursor-grab'
          )}
        />
      </div>

      {/* Gain row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] text-zinc-500 flex-shrink-0">Gain</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={-60}
            max={12}
            step={0.5}
            value={gain}
            onChange={(e) => setClipGain(clipId, parseFloat(e.target.value))}
            className={cn(
              'w-14 px-1.5 py-0.5 rounded text-[10px] text-white text-right',
              'bg-zinc-700 border border-zinc-600',
              'focus:outline-none focus:ring-1 focus:ring-white/30'
            )}
          />
          <span className="text-[9px] text-zinc-500">dB</span>
        </div>
      </div>

      {/* Vol display */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] text-zinc-500 flex-shrink-0">Vol</span>
        <span className="text-[9px] font-mono text-zinc-400">
          {linearToDb(volume)} dB
        </span>
      </div>

      {/* Normalize button */}
      <button
        onClick={() => normalizeClipAudio(clipId, -3)}
        className={cn(
          'w-full flex items-center justify-center gap-1 py-1 rounded text-[9px] font-medium',
          'bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 hover:bg-zinc-700',
          'transition-colors'
        )}
        title="Normalize to -3 dB"
      >
        <Sliders className="w-2.5 h-2.5" />
        Normalize -3 dB
      </button>
    </div>
  );
});

interface AudioMixerPanelProps {
  className?: string;
}

export const AudioMixerPanel = memo(function AudioMixerPanel({
  className,
}: AudioMixerPanelProps) {
  const tracks = useEditorStore((s) => s.tracks);
  const selectedClip = useEditorStore((s) => s.selectedClip);

  // Only show audio tracks in the mixer (not video tracks)
  const audioTracks = tracks.filter(
    (t) => t.type === 'audio' || t.type === 'music'
  );

  // Determine if selected clip has audio properties
  const selectedAudioClip =
    selectedClip &&
    (selectedClip.type === 'video' || selectedClip.type === 'audio')
      ? selectedClip
      : null;

  return (
    <div className={cn('flex flex-col gap-4 p-4 bg-zinc-950 overflow-y-auto', className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Volume2 className="w-4 h-4 text-zinc-400" />
        <span className="text-xs font-semibold text-zinc-300">Audio Mixer</span>
      </div>

      {/* Track channel strips */}
      {audioTracks.length > 0 ? (
        <div className="flex flex-row gap-2 overflow-x-auto pb-2">
          {audioTracks.map((track) => (
            <ChannelStrip key={track.id} track={track} />
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-zinc-600 text-center py-4">
          No audio tracks found.
        </p>
      )}

      {/* Clip-level controls for selected clip */}
      {selectedAudioClip && (
        <>
          <div className="border-t border-zinc-800 pt-3">
            <div className="flex items-center gap-2 mb-2">
              <Sliders className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">
                Clip Controls
              </span>
            </div>
            <ClipAudioControls
              clipId={selectedAudioClip.id}
              clipName={selectedAudioClip.name}
              pan={selectedAudioClip.pan ?? 0}
              gain={selectedAudioClip.gain ?? 0}
              volume={selectedAudioClip.volume ?? 1}
            />
          </div>
        </>
      )}
    </div>
  );
});

export default AudioMixerPanel;
