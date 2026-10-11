/**
 * Track / clip audio rules shared by the preview and the FFmpeg export.
 *
 * Preview: EditorPreview.tsx (base <video> volume, AudioPlayer list).
 * Export:  buildExportRequest.ts (renderer) and
 *          electron/ipc/export-render/ffmpeg-args.ts (main, relative import).
 *
 * Rules
 *   - Mute and solo are AUDIO controls. A muted video track still renders its
 *     pictures; only its embedded sound is silenced.
 *   - Solo considers audio-producing tracks (video / audio / music): when any
 *     of them is soloed, every non-soloed one is silent.
 *   - A video clip's embedded audio is skipped when an audio/music track holds
 *     a clip of the same asset (the separated copy plays instead), or when its
 *     audio was extracted to a paired clip (`audioExtracted`).
 *
 * Keep this file free of `@/` imports — the Electron main process imports it.
 */

export interface AudioRuleTrack {
  type: string;
  muted?: boolean;
  solo?: boolean;
}

export interface AudioRuleAssetTrack {
  type: string;
  clips: ReadonlyArray<{ assetId?: string } | object>;
}

const AUDIO_PRODUCING = new Set(['video', 'audio', 'music']);

export function hasSoloedAudioTrack(tracks: ReadonlyArray<AudioRuleTrack>): boolean {
  return tracks.some((t) => !!t.solo && AUDIO_PRODUCING.has(t.type));
}

/** Whether a track's audio is heard (mute + solo). */
export function isTrackAudible(
  track: AudioRuleTrack,
  tracks: ReadonlyArray<AudioRuleTrack>,
): boolean {
  if (track.muted) return false;
  if (hasSoloedAudioTrack(tracks) && !track.solo) return false;
  return true;
}

/**
 * True when an audio/music track carries a clip of `assetId` — the preview mutes
 * the video element in that case so the sound is not doubled.
 */
export function isEmbeddedAudioHandledExternally(
  assetId: string | undefined,
  tracks: ReadonlyArray<AudioRuleAssetTrack>,
): boolean {
  if (!assetId) return false;
  return tracks.some(
    (t) =>
      (t.type === 'audio' || t.type === 'music') &&
      t.clips.some((c) => 'assetId' in c && (c as { assetId?: string }).assetId === assetId),
  );
}
