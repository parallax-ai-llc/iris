/**
 * Video editor editing / playback shortcuts on the central dispatcher.
 * Keys live in VIDEO_EDITOR_KEYMAP; this hook supplies the handlers.
 * Mounted by VideoEditor. (Project new/open/save are VideoEditorPage's.)
 *
 * This replaces the old VideoEditor + EditorTimeline keydown listeners, which
 * both handled Delete / Ctrl+A / Ctrl+D and so ran twice per key press.
 */

import { useMemo, useRef } from 'react';
import { useKeymapLayer, useModalShortcutBlock, type ShortcutHandler } from '@/shared/lib/shortcuts';
import { useEditorStore } from '@/features/video-editor/stores/editor.store';
import {
  VIDEO_EDITOR_KEYMAP,
  type VideoEditorEditCommand,
} from '@/features/video-editor/lib/shortcuts/videoEditorKeymap';

const store = () => useEditorStore.getState();

export interface VideoEditorShortcutContext {
  onShowShortcuts: () => void;
}

/** Digit 1-9 from the physical key (top row or numpad). */
function digitFromEvent(e: KeyboardEvent): number | null {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code) ?? /^([1-9])$/.exec(e.key);
  return m ? Number(m[1]) : null;
}

export function createVideoEditorEditHandlers(
  ctx: () => VideoEditorShortcutContext,
): Record<VideoEditorEditCommand, ShortcutHandler> {
  const pauseIfArrow = (e: KeyboardEvent) => {
    const s = store();
    if (e.code.startsWith('Arrow') && s.isPlaying) s.pause();
  };

  return {
    undo: () => store().undo(),
    redo: () => store().redo(),
    cut: () => {
      const s = store();
      if (s.selection.clipIds.length === 0) return;
      s.copyClips();
      s.deleteSelected();
    },
    copy: () => store().copyClips(),
    paste: () => store().pasteClips(),
    duplicate: () => {
      const s = store();
      if (s.selection.clipIds.length > 1) s.duplicateSelectedClips();
      else if (s.selectedClip) s.duplicateClip(s.selectedClip.id);
    },
    selectAll: () => store().selectAll(),
    clearSelection: () => store().clearSelection(),
    deleteSelected: (e) => {
      const s = store();
      // Backspace with nothing selected inside a compound clip → leave it.
      if (e.code === 'Backspace' && s.compoundEditStack.length > 0 && s.selection.clipIds.length === 0) {
        s.exitCompoundClip();
        return;
      }
      s.deleteSelected();
    },
    rippleDelete: () => store().rippleDelete(),
    splitAtPlayhead: () => {
      const s = store();
      const clip = s.selectedClip;
      if (clip && s.currentTime > clip.startTime && s.currentTime < clip.endTime) {
        s.splitClip(clip.id, s.currentTime);
      }
    },
    createCompound: () => {
      const s = store();
      if (s.selection.clipIds.length >= 2) s.createCompoundClip();
    },
    expandCompound: () => {
      const s = store();
      if (s.selectedClip?.type === 'compound') s.expandCompoundClip(s.selectedClip.id);
    },
    enterCompound: () => {
      const s = store();
      if (s.selectedClip?.type !== 'compound') return false;
      s.enterCompoundClip(s.selectedClip.id);
    },
    toggleMute: () => {
      const s = store();
      for (const clipId of s.selection.clipIds) {
        for (const track of s.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip && (clip.type === 'video' || clip.type === 'audio')) {
            s.updateClip(clipId, { muted: !clip.muted });
          }
        }
      }
    },
    playPause: () => store().togglePlay(),
    shuttleReverse: () => {
      const s = store();
      const rate = s.playbackRate;
      if (s.isPlaying && rate > 0) {
        s.setPlaybackRate(rate <= 0.25 ? -1 : rate / 2);
      } else if (s.isPlaying && rate < 0) {
        s.setPlaybackRate(Math.max(-8, rate * 2));
      } else {
        s.setPlaybackRate(-1);
        s.play();
      }
    },
    stop: () => store().pause(),
    shuttleForward: () => {
      const s = store();
      const rate = s.playbackRate;
      if (s.isPlaying && rate > 0) {
        s.setPlaybackRate(Math.min(8, rate * 2));
      } else if (s.isPlaying && rate < 0) {
        s.setPlaybackRate(rate >= -0.25 ? 1 : rate / 2);
      } else {
        s.setPlaybackRate(1);
        s.play();
      }
    },
    seekBackward: (e) => {
      pauseIfArrow(e);
      const s = store();
      s.seek(s.currentTime - 1);
    },
    seekForward: (e) => {
      pauseIfArrow(e);
      const s = store();
      s.seek(s.currentTime + 1);
    },
    goToStart: (e) => {
      pauseIfArrow(e);
      store().seek(0);
    },
    goToEnd: (e) => {
      pauseIfArrow(e);
      const s = store();
      s.seek(s.duration);
    },
    setInPoint: () => {
      const s = store();
      s.setInPoint(s.currentTime);
    },
    setOutPoint: () => {
      const s = store();
      s.setOutPoint(s.currentTime);
    },
    clearInOut: () => store().clearInOutPoints(),
    toggleSnap: () => store().toggleSnapToGrid(),
    zoomIn: () => store().zoomIn(),
    zoomOut: () => store().zoomOut(),
    multicamAngle: (e) => {
      const s = store();
      if (!s.multicamEnabled) return false;
      const digit = digitFromEvent(e);
      if (digit === null) return false;
      const angleIndex = digit - 1;
      if (angleIndex < s.multicamSources.length) {
        s.setMulticamActiveAngle(angleIndex);
        if (s.isPlaying) s.addMulticamCut(s.currentTime, angleIndex);
      }
    },
    showShortcuts: () => ctx().onShowShortcuts(),
  };
}

export function useVideoEditorShortcuts(context: VideoEditorShortcutContext & { modalOpen: boolean }): void {
  const ctxRef = useRef(context);
  ctxRef.current = context;
  const handlers = useMemo(() => createVideoEditorEditHandlers(() => ctxRef.current), []);

  useModalShortcutBlock(context.modalOpen);
  useKeymapLayer('editor', VIDEO_EDITOR_KEYMAP, handlers);
}
