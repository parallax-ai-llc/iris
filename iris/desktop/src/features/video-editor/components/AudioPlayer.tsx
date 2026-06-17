/**
 * AudioPlayer - Hidden audio element for audio/music clip playback
 * Handles Web Audio API DSP chain (EQ, compressor, fade in/out)
 */

import { memo, useRef, useEffect, useMemo } from 'react';
import type { AudioClip, MusicClip } from '@/types/editor.types';
import { useCachedAssetUrlById } from '@/shared/hooks/useCachedAssetUrl';

interface AudioPlayerProps {
  clip: AudioClip | MusicClip;
  currentTime: number;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  trackVolume?: number;
}

export const AudioPlayer = memo(function AudioPlayer({
  clip,
  currentTime,
  isPlaying,
  volume,
  isMuted,
  playbackRate,
  trackVolume = 1,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  // DSP nodes
  const eqLowRef = useRef<BiquadFilterNode | null>(null);
  const eqMidRef = useRef<BiquadFilterNode | null>(null);
  const eqHighRef = useRef<BiquadFilterNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);

  const { url: audioUrl } = useCachedAssetUrlById(
    clip.assetId,
    'audio/mpeg',
    { type: 'preview', enabled: !!clip.assetId }
  );

  // Check if this clip is active at current time
  const isActive = currentTime >= clip.startTime && currentTime < clip.endTime;

  // Get audio effects (only AudioClip has effects)
  const audioEffects = useMemo(() => {
    if (clip.type !== 'audio' || !('effects' in clip)) return [];
    return (clip as AudioClip).effects.filter((e) => e.enabled && e.type === 'audio-effect');
  }, [clip]);

  const needsWebAudio = clip.fadeIn > 0 || clip.fadeOut > 0 || audioEffects.length > 0;

  // Set up Web Audio context with DSP chain
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !needsWebAudio) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;

    if (!sourceNodeRef.current) {
      sourceNodeRef.current = ctx.createMediaElementSource(audio);
      gainNodeRef.current = ctx.createGain();

      // Create EQ nodes (3-band)
      eqLowRef.current = ctx.createBiquadFilter();
      eqLowRef.current.type = 'lowshelf';
      eqLowRef.current.frequency.value = 320;

      eqMidRef.current = ctx.createBiquadFilter();
      eqMidRef.current.type = 'peaking';
      eqMidRef.current.frequency.value = 1000;
      eqMidRef.current.Q.value = 0.5;

      eqHighRef.current = ctx.createBiquadFilter();
      eqHighRef.current.type = 'highshelf';
      eqHighRef.current.frequency.value = 3200;

      // Create compressor
      compressorRef.current = ctx.createDynamicsCompressor();

      // Chain: source → gain → eqLow → eqMid → eqHigh → compressor → destination
      sourceNodeRef.current.connect(gainNodeRef.current);
      gainNodeRef.current.connect(eqLowRef.current);
      eqLowRef.current.connect(eqMidRef.current);
      eqMidRef.current.connect(eqHighRef.current);
      eqHighRef.current.connect(compressorRef.current);
      compressorRef.current.connect(ctx.destination);
    }

    return () => {
      // Close AudioContext on unmount to release system audio resources
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
        sourceNodeRef.current = null;
        gainNodeRef.current = null;
        eqLowRef.current = null;
        eqMidRef.current = null;
        eqHighRef.current = null;
        compressorRef.current = null;
      }
    };
  }, [needsWebAudio]);

  // Apply audio effect parameters
  useEffect(() => {
    if (!audioCtxRef.current) return;

    // Reset EQ to flat
    if (eqLowRef.current) eqLowRef.current.gain.value = 0;
    if (eqMidRef.current) eqMidRef.current.gain.value = 0;
    if (eqHighRef.current) eqHighRef.current.gain.value = 0;

    // Reset compressor to transparent
    if (compressorRef.current) {
      compressorRef.current.threshold.value = 0;
      compressorRef.current.ratio.value = 1;
      compressorRef.current.attack.value = 0.003;
      compressorRef.current.release.value = 0.25;
    }

    for (const eff of audioEffects) {
      const p = (eff.audioParams ?? {}) as Record<string, number>;
      if (eff.audioEffectType === 'eq') {
        if (eqLowRef.current) eqLowRef.current.gain.value = p.low ?? 0;
        if (eqMidRef.current) eqMidRef.current.gain.value = p.mid ?? 0;
        if (eqHighRef.current) eqHighRef.current.gain.value = p.high ?? 0;
      } else if (eff.audioEffectType === 'compressor') {
        if (compressorRef.current) {
          compressorRef.current.threshold.value = p.threshold ?? -24;
          compressorRef.current.ratio.value = p.ratio ?? 4;
          compressorRef.current.attack.value = (p.attack ?? 5) / 1000;
          compressorRef.current.release.value = (p.release ?? 50) / 1000;
        }
      } else if (eff.audioEffectType === 'bass') {
        if (eqLowRef.current) {
          eqLowRef.current.frequency.value = 100;
          eqLowRef.current.gain.value = p.gain ?? 0;
        }
      } else if (eff.audioEffectType === 'treble') {
        if (eqHighRef.current) {
          eqHighRef.current.frequency.value = 8000;
          eqHighRef.current.gain.value = p.gain ?? 0;
        }
      } else if (eff.audioEffectType === 'notch-filter') {
        if (eqMidRef.current) {
          eqMidRef.current.type = 'notch';
          eqMidRef.current.frequency.value = p.frequency ?? 1000;
          eqMidRef.current.Q.value = p.q ?? 10;
        }
      } else if (eff.audioEffectType === 'balance') {
        // balance: not directly supported in Web Audio without extra stereo
        // splitter nodes — no-op.
      } else if (eff.audioEffectType === 'amplify') {
        if (gainNodeRef.current) {
          const gainDb = p.gain ?? 0;
          const gainLinear = Math.pow(10, gainDb / 20);
          gainNodeRef.current.gain.value *= gainLinear;
        }
      }
    }
  }, [audioEffects]);

  // Apply fade gain
  useEffect(() => {
    if (!gainNodeRef.current || !audioCtxRef.current) return;
    if (!isActive) return;

    const clipOffset = currentTime - clip.startTime;
    const clipDuration = clip.endTime - clip.startTime;
    const clipMuted = 'muted' in clip ? clip.muted : false;
    const baseVolume = clipMuted || isMuted ? 0 : volume * clip.volume * trackVolume;

    let gain = baseVolume;
    if (clip.fadeIn > 0 && clipOffset < clip.fadeIn) {
      gain = baseVolume * (clipOffset / clip.fadeIn);
    } else if (clip.fadeOut > 0 && clipOffset > clipDuration - clip.fadeOut) {
      const fadeProgress = (clipDuration - clipOffset) / clip.fadeOut;
      gain = baseVolume * Math.max(0, fadeProgress);
    }

    gainNodeRef.current.gain.setTargetAtTime(gain, audioCtxRef.current.currentTime, 0.05);
  }, [currentTime, isActive, clip, volume, isMuted, trackVolume]);

  // Play/pause the audio element only when the active/playing state flips.
  // Intentionally NOT dependent on `currentTime`: during natural playback the
  // audio element advances on its own, and a useEffect firing every rAF tick
  // (with re-seek checks + play() calls) was the source of audible stutter.
  const clipMutedForPlayback = 'muted' in clip ? clip.muted : false;
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    if (isActive && isPlaying && !clipMutedForPlayback) {
      if (audio.paused) {
        // Seek once at the moment we start playing so we begin at the correct
        // source offset. After that, the element advances on its own and is
        // only corrected by the drift effect below on real user seeks.
        const { currentTime: ct } = { currentTime: currentTimeRef.current };
        const clipOffset = ct - clip.startTime;
        const sourceTime = clip.sourceStartTime + clipOffset;
        if (Math.abs(audio.currentTime - sourceTime) > 0.05) {
          audio.currentTime = sourceTime;
        }
        if (audioCtxRef.current?.state === 'suspended') {
          audioCtxRef.current.resume();
        }
        audio.play().catch(() => {});
      }
    } else {
      if (!audio.paused) audio.pause();
    }
  }, [isActive, isPlaying, clipMutedForPlayback, audioUrl, clip.startTime, clip.sourceStartTime]);

  // Track currentTime in a ref so the play/pause effect can read it without
  // re-running every frame.
  const currentTimeRef = useRef(currentTime);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // Handle *user* seeks (scrubbing) during playback. Uses a loose threshold so
  // natural playback drift never triggers a reseek — only explicit jumps do.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl || !isActive || !isPlaying) return;
    const clipOffset = currentTime - clip.startTime;
    const sourceTime = clip.sourceStartTime + clipOffset;
    if (Math.abs(audio.currentTime - sourceTime) > 0.35) {
      audio.currentTime = sourceTime;
    }
  }, [currentTime, isActive, isPlaying, clip.startTime, clip.sourceStartTime, audioUrl]);

  // Sync volume (when no Web Audio context)
  const clipMuted = 'muted' in clip ? clip.muted : false;
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && !gainNodeRef.current) {
      audio.volume = clipMuted ? 0 : volume * clip.volume * trackVolume;
      audio.muted = isMuted || clipMuted;
      audio.playbackRate = Math.max(0.0625, Math.abs(playbackRate));
    } else if (audio) {
      // With Web Audio, only playbackRate on element
      audio.playbackRate = Math.max(0.0625, Math.abs(playbackRate));
    }
  }, [volume, isMuted, clip.volume, clipMuted, playbackRate, trackVolume]);

  if (!audioUrl) return null;

  return (
    <audio
      ref={audioRef}
      src={audioUrl}
      preload="auto"
      style={{ display: 'none' }}
    />
  );
});
