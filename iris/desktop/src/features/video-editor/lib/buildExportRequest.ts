/**
 * buildExportRequest — single source of truth for turning the editor timeline
 * into an `export:start` request.
 *
 * Both the Export modal and Silence Removal (which flattens the timeline to a
 * single video before analysis) use this, so a flattened/merged video follows
 * the EXACT same text / audio / image / effect rules as a real export. Never
 * hand-roll a separate merge — route everything through here + `videoExport.start`.
 */

import { useEditorStore } from '@/features/video-editor/stores/editor.store';
import type {
  Track, VideoClip, AudioClip, MusicClip, SubtitleClip, AdjustmentClip,
} from '@/types/editor.types';
import { renderSubtitleClipToPng } from '@/features/video-editor/lib/renderSubtitlePng';

export interface BuildExportRequestParams {
  tracks: Track[];
  /** Full timeline duration (seconds). */
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  format: 'mp4' | 'webm' | 'mov' | 'gif';
  quality: 'low' | 'medium' | 'high' | 'ultra';
  codec?: 'h264' | 'h265' | 'prores' | 'vp9';
  proResProfile?: '422' | '422-hq' | '422-lt' | '422-proxy' | '4444';
  includeSubtitles: boolean;
  subtitleFormat?: 'burned' | 'srt' | 'vtt';
  /** Destination path. Pass '' to let the main process pick a temp file. */
  outputPath: string;
  authToken?: string | null;
  /** Marked sub-range to export; null exports the whole timeline. */
  range?: { start: number; end: number } | null;
}

/**
 * Resolve every clip's assetId to a local file path / local-media URL the
 * export renderer can open (it understands file://, http://127.0.0.1 media-server
 * URLs, and bare local paths). DB ids are downloaded to their original master.
 */
async function buildAssetUrlMap(tracks: Track[]): Promise<Map<string, string>> {
  const allAssetIds = new Set<string>();
  for (const track of tracks) {
    for (const clip of track.clips) {
      const assetId = (clip as { assetId?: string }).assetId;
      if (assetId) allAssetIds.add(assetId);
    }
  }
  const urlMap = new Map<string, string>();
  for (const id of allAssetIds) {
    if (id.startsWith('file://')) {
      urlMap.set(id, decodeURIComponent(id.replace(/^file:\/\/\//, '')));
    } else if (id.includes('/') || id.includes('\\')) {
      // Already a local file path (e.g. separated audio) or local-media URL.
      urlMap.set(id, id);
    } else {
      // DB id — always resolve the original master, never a proxy.
      let localPath = useEditorStore.getState().assetPaths.get(id) ?? null;
      if (!localPath) {
        const downloaded = await useEditorStore.getState().downloadAsset(id);
        if (!downloaded) {
          throw new Error(`Failed to download asset: ${id}`);
        }
        localPath = downloaded;
      }
      urlMap.set(id, localPath);
    }
  }
  return urlMap;
}

export async function buildExportRequest(
  params: BuildExportRequestParams,
): Promise<Record<string, unknown>> {
  const {
    tracks, duration, width, height, frameRate, format, quality,
    codec, proResProfile, includeSubtitles, subtitleFormat, outputPath,
    authToken, range,
  } = params;

  const urlMap = await buildAssetUrlMap(tracks);

  // Range trim — when a marked range is given, trim clips to [start, end] and
  // offset all timeline times by -start.
  const rangeActive = !!range;
  const rangeStart = rangeActive ? range!.start : 0;
  const rangeEnd = rangeActive ? range!.end : duration;
  const exportDuration = rangeActive ? rangeEnd - rangeStart : duration;

  const exportTracks = tracks.filter((track) => track.visible !== false).map((track) => ({
    id: track.id,
    type: track.type,
    muted: track.muted,
    volume: track.volume,
    clips: track.clips
      .filter((clip) => !rangeActive || (clip.endTime > rangeStart && clip.startTime < rangeEnd))
      .map((clip) => {
        const trimmedStart = Math.max(clip.startTime, rangeStart);
        const trimmedEnd = Math.min(clip.endTime, rangeEnd);
        const startTime = trimmedStart - rangeStart;
        const endTime = trimmedEnd - rangeStart;

        const speed = (clip as { speed?: number }).speed ?? 1;
        const leftTrim = Math.max(0, rangeStart - clip.startTime);
        const rightTrim = Math.max(0, clip.endTime - rangeEnd);
        const sourceStartTime = clip.sourceStartTime + leftTrim * speed;
        const sourceEndTime = clip.sourceEndTime - rightTrim * speed;

        const base = {
          id: clip.id,
          type: clip.type,
          startTime,
          endTime,
          sourceStartTime,
          sourceEndTime,
          sourceUrl: '',
        };

        if (clip.type === 'video') {
          const vc = clip as VideoClip;
          return {
            ...base,
            sourceUrl: urlMap.get(vc.assetId) ?? vc.assetId,
            mediaType: vc.mediaType,
            sourceWidth: vc.sourceWidth,
            sourceHeight: vc.sourceHeight,
            blendMode: vc.blendMode,
            trackId: track.id,
            volume: vc.volume,
            // Audio extracted to a paired audio clip (now possibly deleted) →
            // suppress the video's embedded audio in the render too.
            muted: vc.muted || vc.audioExtracted === true,
            speed: vc.speed,
            transform: vc.transform,
            effects: vc.effects.map((e) => ({
              type: e.type,
              enabled: e.enabled,
              filterType: e.filterType,
              filterIntensity: e.filterIntensity,
              filterParams: e.filterParams,
              transitionType: e.transitionType,
              transitionPosition: e.transitionPosition,
              transitionDuration: e.transitionDuration,
              audioEffectType: e.audioEffectType,
              audioParams: e.audioParams,
            })),
          };
        }

        if (clip.type === 'audio') {
          const ac = clip as AudioClip;
          return {
            ...base,
            sourceUrl: urlMap.get(ac.assetId) ?? ac.assetId,
            volume: ac.volume,
            muted: ac.muted,
            fadeIn: ac.fadeIn,
            fadeOut: ac.fadeOut,
            pan: ac.pan,
            gain: ac.gain,
          };
        }

        if (clip.type === 'subtitle') {
          const sc = clip as SubtitleClip;
          return {
            ...base,
            text: sc.text,
            style: sc.style,
          };
        }

        if (clip.type === 'music') {
          const mc = clip as MusicClip;
          return {
            ...base,
            sourceUrl: urlMap.get(mc.assetId) ?? mc.assetId,
            volume: mc.volume,
            fadeIn: mc.fadeIn,
            fadeOut: mc.fadeOut,
          };
        }

        if (clip.type === 'adjustment') {
          const adjClip = clip as AdjustmentClip;
          return {
            ...base,
            effects: (adjClip.effects ?? []).map((e) => ({
              type: e.type,
              enabled: e.enabled,
              filterType: e.filterType,
              filterIntensity: e.filterIntensity,
              filterParams: e.filterParams,
              transitionType: e.transitionType,
              transitionPosition: e.transitionPosition,
              transitionDuration: e.transitionDuration,
              audioEffectType: e.audioEffectType,
              audioParams: e.audioParams,
            })),
          };
        }

        return base;
      }),
  }));

  // Rasterize subtitle clips to full-frame PNGs for pixel-accurate burned output.
  let subtitleOverlays:
    | Array<{ pngDataUrl: string; startTime: number; endTime: number }>
    | undefined;

  if (includeSubtitles && subtitleFormat === 'burned') {
    const subtitleClips = tracks
      .filter((t) => t.type === 'subtitle' && t.visible !== false)
      .flatMap((t) => t.clips as SubtitleClip[])
      .filter((c) => {
        if (!c.text) return false;
        if (!rangeActive) return true;
        return c.endTime > rangeStart && c.startTime < rangeEnd;
      });

    if (subtitleClips.length > 0) {
      subtitleOverlays = await Promise.all(
        subtitleClips.map(async (clip) => {
          const trimmedStart = Math.max(clip.startTime, rangeStart);
          const trimmedEnd = Math.min(clip.endTime, rangeEnd);
          const startTime = trimmedStart - rangeStart;
          const endTime = trimmedEnd - rangeStart;
          const pngDataUrl = await renderSubtitleClipToPng(clip, width, height);
          return { pngDataUrl, startTime, endTime };
        }),
      );
    }
  }

  return {
    outputPath,
    format,
    quality,
    frameRate,
    width,
    height,
    duration: exportDuration,
    tracks: exportTracks,
    includeSubtitles,
    subtitleFormat,
    codec: (format === 'mp4' || format === 'mov') ? codec : undefined,
    proResProfile: codec === 'prores' ? proResProfile : undefined,
    authToken: authToken ?? undefined,
    subtitleOverlays,
  };
}
