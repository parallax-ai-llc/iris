/**
 * Command Executor for Video Editor Chat
 *
 * Parses <command>{...}</command> blocks from the LLM response and dispatches
 * the matching action against the video editor store (`useEditorStore`) and,
 * for modal-gated flows, raises a callback the UI listens to.
 */

import { useEditorStore } from '@/features/video-editor/stores/editor.store';
import type { ClipEffect, Keyframe } from '@/types/videoProject.types';
import type { SubtitleStyle, SubtitleClip } from '@/types/editor.types';

// ==================== Command types ====================

type SubtitleStylePatch = Partial<SubtitleStyle>;

type ClipEffectInput = {
  type: 'filter' | 'transition' | 'audio-effect';
  name?: string;
  filterType?: string;
  filterIntensity?: number;
  filterParams?: Record<string, unknown>;
  transitionType?: string;
  transitionDuration?: number;
  transitionPosition?: 'start' | 'end' | 'both';
  audioEffectType?: string;
  audioParams?: Record<string, number | string | number[]>;
};

export type VideoEditorCommand =
  | { action: 'seek'; time: number }
  | { action: 'play' }
  | { action: 'pause' }
  | { action: 'selectClip'; clipId: string }
  | { action: 'clearSelection' }
  | {
      action: 'addSubtitle';
      text: string;
      startTime: number;
      endTime: number;
      style?: SubtitleStylePatch;
    }
  | { action: 'updateSubtitleStyle'; clipId: string; style: SubtitleStylePatch }
  | { action: 'addClipEffect'; clipId?: string; effect: ClipEffectInput }
  | { action: 'removeClipEffect'; clipId: string; effectId: string }
  | { action: 'updateClipOpacity'; clipId?: string; opacity: number }
  | { action: 'setClipVolume'; clipId?: string; volume: number }
  | {
      action: 'addKeyframe';
      clipId?: string;
      time: number;
      property: Keyframe['property'];
      value: number;
      easing?: Keyframe['easing'];
    }
  | { action: 'splitClip'; clipId?: string; time?: number }
  | { action: 'removeClip'; clipId: string }
  | { action: 'duplicateClip'; clipId: string }
  | { action: 'toggleTrackMute'; trackId: string }
  | { action: 'openSilenceRemoval' }
  | { action: 'openAutoCaptions' }
  | { action: 'addMarker'; time: number; label?: string }
  | { action: 'undo' }
  | { action: 'redo' };

// ==================== Parser ====================

export function parseVideoCommand(text: string): VideoEditorCommand | null {
  const match = text.match(/<command>([\s\S]*?)<\/command>/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1].trim());
    if (parsed && typeof parsed === 'object' && typeof parsed.action === 'string') {
      return parsed as VideoEditorCommand;
    }
    return null;
  } catch {
    return null;
  }
}

// ==================== Modal-gated callbacks ====================

/**
 * Some actions can't be executed purely on the store — they open a modal so
 * the user can confirm parameters (silence removal needs ffmpeg + threshold
 * review; auto captions needs API call + language selection). The chat panel
 * registers handlers via this hook.
 */
export interface VideoChatModalHandlers {
  openSilenceRemoval?: () => void;
  openAutoCaptions?: () => void;
}

let modalHandlers: VideoChatModalHandlers = {};

export function setVideoChatModalHandlers(handlers: VideoChatModalHandlers): void {
  modalHandlers = handlers;
}

// ==================== Helpers ====================

function makeEffectId(): string {
  return `fx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function resolveTargetClipId(commandClipId: string | undefined): string {
  if (commandClipId) return commandClipId;
  const selected = useEditorStore.getState().selectedClip;
  if (!selected) throw new Error('No clip selected — please pass clipId.');
  return selected.id;
}

function findClipOrThrow(clipId: string) {
  const tracks = useEditorStore.getState().tracks;
  for (const t of tracks) {
    const c = t.clips.find((cl) => cl.id === clipId);
    if (c) return c;
  }
  throw new Error(`Clip not found: ${clipId}`);
}

function buildClipEffectFromInput(input: ClipEffectInput): ClipEffect {
  return {
    id: makeEffectId(),
    type: input.type,
    name:
      input.name ||
      input.filterType ||
      input.transitionType ||
      input.audioEffectType ||
      'Effect',
    enabled: true,
    filterType: input.type === 'filter' ? (input.filterType as ClipEffect['filterType']) : undefined,
    filterIntensity:
      input.type === 'filter'
        ? typeof input.filterIntensity === 'number'
          ? input.filterIntensity
          : 50
        : undefined,
    filterParams: input.type === 'filter' ? input.filterParams : undefined,
    transitionType:
      input.type === 'transition' ? (input.transitionType as ClipEffect['transitionType']) : undefined,
    transitionDuration:
      input.type === 'transition'
        ? typeof input.transitionDuration === 'number'
          ? input.transitionDuration
          : 0.5
        : undefined,
    transitionPosition: input.type === 'transition' ? input.transitionPosition : undefined,
    audioEffectType:
      input.type === 'audio-effect' ? (input.audioEffectType as ClipEffect['audioEffectType']) : undefined,
    audioParams: input.type === 'audio-effect' ? input.audioParams : undefined,
    keyframes: [],
  };
}

// ==================== Executor ====================

export async function executeVideoCommand(command: VideoEditorCommand): Promise<void> {
  const store = useEditorStore.getState();

  switch (command.action) {
    case 'seek':
      if (typeof command.time !== 'number' || !Number.isFinite(command.time)) {
        throw new Error('Invalid seek time');
      }
      store.seek(command.time);
      return;

    case 'play':
      store.play();
      return;

    case 'pause':
      store.pause();
      return;

    case 'selectClip':
      store.selectClip(command.clipId);
      return;

    case 'clearSelection':
      store.clearSelection();
      return;

    case 'addSubtitle': {
      if (typeof command.text !== 'string' || !command.text.trim()) {
        throw new Error('Subtitle text is required');
      }
      if (
        typeof command.startTime !== 'number' ||
        typeof command.endTime !== 'number' ||
        command.endTime <= command.startTime
      ) {
        throw new Error('Subtitle endTime must be greater than startTime');
      }
      store.addSubtitleClip(command.text, command.startTime, command.endTime, command.style ?? {});
      return;
    }

    case 'updateSubtitleStyle': {
      const clip = findClipOrThrow(command.clipId);
      if (clip.type !== 'subtitle') {
        throw new Error(`Clip ${command.clipId} is not a subtitle clip`);
      }
      store.updateSubtitleStyle(command.clipId, command.style);
      return;
    }

    case 'addClipEffect': {
      const targetId = resolveTargetClipId(command.clipId);
      const clip = findClipOrThrow(targetId);
      if (clip.type !== 'video' && clip.type !== 'audio' && clip.type !== 'adjustment') {
        throw new Error(`Effects can't be applied to ${clip.type} clips`);
      }
      const effect = buildClipEffectFromInput(command.effect);
      store.addClipEffect(targetId, effect);
      return;
    }

    case 'removeClipEffect':
      store.removeClipEffect(command.clipId, command.effectId);
      return;

    case 'updateClipOpacity': {
      const targetId = resolveTargetClipId(command.clipId);
      const clip = findClipOrThrow(targetId);
      const opacity = Math.max(0, Math.min(1, command.opacity));
      if (clip.type === 'video') {
        store.updateClip(targetId, { transform: { ...clip.transform, opacity } });
      } else if (clip.type === 'adjustment') {
        store.updateClip(targetId, { opacity });
      } else {
        throw new Error(`Opacity is not supported on ${clip.type} clips`);
      }
      return;
    }

    case 'setClipVolume': {
      const targetId = resolveTargetClipId(command.clipId);
      const clip = findClipOrThrow(targetId);
      const volume = Math.max(0, Math.min(1, command.volume));
      if (clip.type === 'video' || clip.type === 'audio' || clip.type === 'music') {
        store.updateClip(targetId, { volume });
      } else {
        throw new Error(`Volume is not supported on ${clip.type} clips`);
      }
      return;
    }

    case 'addKeyframe': {
      const targetId = resolveTargetClipId(command.clipId);
      const clip = findClipOrThrow(targetId);
      if (clip.type !== 'video' && clip.type !== 'audio' && clip.type !== 'adjustment') {
        throw new Error(`Keyframes can't be applied to ${clip.type} clips`);
      }
      const keyframe: Keyframe = {
        time: command.time,
        property: command.property,
        value: command.value,
        easing: command.easing ?? 'linear',
      };
      store.addClipKeyframe(targetId, keyframe);
      return;
    }

    case 'splitClip': {
      const targetId = resolveTargetClipId(command.clipId);
      const splitAt = typeof command.time === 'number' ? command.time : store.currentTime;
      store.splitClip(targetId, splitAt);
      return;
    }

    case 'removeClip':
      store.removeClip(command.clipId);
      return;

    case 'duplicateClip':
      store.duplicateClip(command.clipId);
      return;

    case 'toggleTrackMute':
      store.toggleTrackMute(command.trackId);
      return;

    case 'openSilenceRemoval':
      if (!modalHandlers.openSilenceRemoval) {
        throw new Error('Silence removal is not available in this context');
      }
      modalHandlers.openSilenceRemoval();
      return;

    case 'openAutoCaptions':
      if (!modalHandlers.openAutoCaptions) {
        throw new Error('Auto captions are not available in this context');
      }
      modalHandlers.openAutoCaptions();
      return;

    case 'addMarker':
      store.addMarker(command.time, command.label);
      return;

    case 'undo':
      store.undo();
      return;

    case 'redo':
      store.redo();
      return;

    default: {
      const unknown = command as { action: string };
      throw new Error(`Unknown command action: ${unknown.action}`);
    }
  }
}

export type { SubtitleClip };
