/**
 * Editor tracks -> persisted TimelineData conversion.
 *
 * Moved out of VideoEditorPage so the save flow and the unsaved-changes check
 * (stores/editor/dirtyTracking.ts) use the same projection: a change counts as
 * "unsaved" only if it would change what a save writes.
 */

import { hasEffects, hasVolume, type Clip, type Marker, type Track } from '@/types/editor.types';
import type { TimelineClip, TimelineData, TimelineTrack } from '@/types/videoProject.types';

export function convertEditorTracksToTimelineData(
  tracks: Track[],
  markers: Marker[] = [],
): TimelineData {
  const convertClip = (clip: Clip): TimelineClip => {
    // Image clips are stored as VideoClip (mediaType: 'image') in the editor —
    // persist them with the 'image' ClipType so the load path restores the flag
    // (otherwise they reload as plain videos and fail to render as overlays).
    const isImageClip = clip.type === 'video' && clip.mediaType === 'image';

    const baseClip: TimelineClip = {
      id: clip.id,
      type: clip.type === 'music' ? 'audio' : isImageClip ? 'image' : clip.type,
      trackId: clip.trackId,
      startTime: clip.startTime,
      endTime: clip.endTime,
      duration: clip.endTime - clip.startTime,
      sourceUrl: 'assetId' in clip ? clip.assetId : undefined,
      sourceWidth: clip.type === 'video' ? clip.sourceWidth : undefined,
      sourceHeight: clip.type === 'video' ? clip.sourceHeight : undefined,
      inPoint: clip.sourceStartTime,
      outPoint: clip.sourceEndTime,
      opacity: clip.type === 'video' ? clip.transform.opacity : (clip.type === 'adjustment' ? clip.opacity : 1),
      scale: clip.type === 'video' ? clip.transform.scale : 1,
      x: clip.type === 'video' ? (clip.transform.x ?? 0) : 0,
      y: clip.type === 'video' ? (clip.transform.y ?? 0) : 0,
      rotation: clip.type === 'video' ? clip.transform.rotation : 0,
      volume: hasVolume(clip) ? clip.volume : 1,
      fadeIn: (clip.type === 'audio' || clip.type === 'music') ? clip.fadeIn : 0,
      fadeOut: (clip.type === 'audio' || clip.type === 'music') ? clip.fadeOut : 0,
      speed: 'speed' in clip ? clip.speed ?? 1 : 1,
      effects: hasEffects(clip) ? clip.effects : [],
      keyframes: hasEffects(clip) ? clip.keyframes : [],
      audioExtracted: clip.type === 'video' ? clip.audioExtracted : undefined,
      name: clip.name,
      locked: false,
    };

    // Add subtitle-specific properties
    if (clip.type === 'subtitle') {
      baseClip.content = clip.text;
      baseClip.fontFamily = clip.style.fontFamily;
      baseClip.fontSize = clip.style.fontSize;
      baseClip.fontColor = clip.style.fontColor;
      baseClip.backgroundColor = clip.style.backgroundColor;
      baseClip.backgroundOpacity = clip.style.backgroundOpacity;
      baseClip.textAlign = clip.style.alignment;
      baseClip.textPositionX = clip.style.position.x;
      baseClip.textPositionY = clip.style.position.y;
      baseClip.textWidth = clip.style.width;
      baseClip.textHeight = clip.style.height;
      baseClip.textPaddingX = clip.style.paddingX;
      baseClip.textPaddingY = clip.style.paddingY;
      baseClip.verticalAlign = clip.style.verticalAlign;
    }

    return baseClip;
  };

  const convertTrack = (track: Track): TimelineTrack => ({
    id: track.id,
    type: track.type === 'music' ? 'audio' : track.type,
    name: track.name,
    locked: track.locked,
    muted: track.muted,
    visible: track.visible,
    height: track.height,
    clips: track.clips.map(convertClip),
  });

  return {
    version: 1,
    settings: {
      backgroundColor: '#000000',
      defaultTransitionDuration: 0.5,
      audioFadeDefault: 0.3,
    },
    tracks: tracks.map(convertTrack),
    markers: markers.map((m) => ({
      id: m.id,
      time: m.time,
      label: m.label,
      color: m.color,
      type: m.type,
      url: m.url,
      endTime: m.endTime,
      comment: m.comment,
    })),
  };
}
