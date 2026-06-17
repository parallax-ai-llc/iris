/**
 * Shared Zustand selectors for the editor store.
 *
 * Use these with `useEditorStore(selectXxx)` or `useEditorStore(useShallow(selectXxxState))`
 * to reduce subscription count and prevent unnecessary re-renders.
 *
 * Convention:
 * - `selectXxx`: single-value selector (safe without useShallow for primitives)
 * - `selectXxxActions`: action-only selector (must use useShallow)
 * - `selectXxxState`: multi-value state selector (must use useShallow)
 */

import type { EditorState, EditorActions, Track } from '@/types/editor.types';

type S = EditorState & EditorActions;

// ── Timeline state ──────────────────────────────────────────────────

export const selectTimelineState = (s: S) => ({
  tracks: s.tracks,
  duration: s.duration,
  pixelsPerSecond: s.pixelsPerSecond,
  scrollLeft: s.scrollLeft,
  selection: s.selection,
  dragState: s.dragState,
  dragHoverTrackId: s.dragHoverTrackId,
  snapTarget: s.snapTarget,
  targetVideoTrackId: s.targetVideoTrackId,
  targetAudioTrackId: s.targetAudioTrackId,
  markers: s.markers,
  inPoint: s.inPoint,
  outPoint: s.outPoint,
  frameRate: s.frameRate,
  showMarkerList: s.showMarkerList,
  multicamEnabled: s.multicamEnabled,
  multicamCuts: s.multicamCuts,
  multicamSources: s.multicamSources,
});

export const selectTimelineActions = (s: S) => ({
  seek: s.seek,
  setZoom: s.setZoom,
  zoomIn: s.zoomIn,
  zoomOut: s.zoomOut,
  setScrollLeft: s.setScrollLeft,
  addTrack: s.addTrack,
  addClip: s.addClip,
  addAdjustmentLayer: s.addAdjustmentLayer,
  clearSelection: s.clearSelection,
  selectAll: s.selectAll,
  deleteSelected: s.deleteSelected,
  duplicateSelectedClips: s.duplicateSelectedClips,
  selectClipsInRange: s.selectClipsInRange,
  updateDrag: s.updateDrag,
  endDrag: s.endDrag,
  moveClipToTrack: s.moveClipToTrack,
  addMarker: s.addMarker,
  removeMarker: s.removeMarker,
  updateMarker: s.updateMarker,
  toggleMarkerList: s.toggleMarkerList,
  removeAllGaps: s.removeAllGaps,
  alignClips: s.alignClips,
  fitToView: s.fitToView,
  removeMulticamCut: s.removeMulticamCut,
});

// ── Playhead controls state ─────────────────────────────────────────

export const selectPlayheadState = (s: S) => ({
  currentTime: s.currentTime,
  duration: s.duration,
  isPlaying: s.isPlaying,
  playbackRate: s.playbackRate,
  volume: s.volume,
  isMuted: s.isMuted,
  snapToGrid: s.snapToGrid,
  selectedClip: s.selectedClip,
  frameRate: s.frameRate,
  inPoint: s.inPoint,
  outPoint: s.outPoint,
  canUndo: s.historyIndex > 0,
  canRedo: s.historyIndex < s.history.length - 1,
});

export const selectPlayheadActions = (s: S) => ({
  togglePlay: s.togglePlay,
  seek: s.seek,
  setPlaybackRate: s.setPlaybackRate,
  setVolume: s.setVolume,
  toggleMute: s.toggleMute,
  toggleSnapToGrid: s.toggleSnapToGrid,
  fitToView: s.fitToView,
  undo: s.undo,
  redo: s.redo,
  splitClip: s.splitClip,
});

// ── Preview state ───────────────────────────────────────────────────

export const selectPreviewState = (s: S) => ({
  currentTime: s.currentTime,
  duration: s.duration,
  isPlaying: s.isPlaying,
  playbackRate: s.playbackRate,
  volume: s.volume,
  isMuted: s.isMuted,
  tracks: s.tracks,
  selectedClip: s.selectedClip,
  selection: s.selection,
});

export const selectPreviewActions = (s: S) => ({
  seek: s.seek,
  selectClip: s.selectClip,
  updateClip: s.updateClip,
});

// ── Cached clipId Set selector ──────────────────────────────────────
// Converts selection.clipIds array to a Set for O(1) .has() lookups.
// Reuses the same Set instance as long as the clipIds array is the same reference.

let _lastClipIds: string[] | null = null;
let _cachedClipIdSet: Set<string> = new Set();

export function selectClipIdSet(s: S): Set<string> {
  const ids = s.selection.clipIds;
  if (ids !== _lastClipIds) {
    _lastClipIds = ids;
    _cachedClipIdSet = new Set(ids);
  }
  return _cachedClipIdSet;
}

// ── Memoized computed selectors ─────────────────────────────────────
// These avoid creating new arrays on every call if tracks haven't changed.

let _lastTracks: Track[] | null = null;
let _lastVideoResult: Track[] = [];
let _lastAudioResult: Track[] = [];
let _lastSubtitleResult: Track[] = [];

export function selectVideoTracksMemo(s: S) {
  if (s.tracks !== _lastTracks) {
    _lastTracks = s.tracks;
    _lastVideoResult = s.tracks.filter(t => t.type === 'video');
    _lastAudioResult = s.tracks.filter(t => t.type === 'audio' || t.type === 'music');
    _lastSubtitleResult = s.tracks.filter(t => t.type === 'subtitle');
  }
  return _lastVideoResult;
}

export function selectAudioTracksMemo(s: S) {
  if (s.tracks !== _lastTracks) {
    _lastTracks = s.tracks;
    _lastVideoResult = s.tracks.filter(t => t.type === 'video');
    _lastAudioResult = s.tracks.filter(t => t.type === 'audio' || t.type === 'music');
    _lastSubtitleResult = s.tracks.filter(t => t.type === 'subtitle');
  }
  return _lastAudioResult;
}

export function selectSubtitleTracksMemo(s: S) {
  if (s.tracks !== _lastTracks) {
    _lastTracks = s.tracks;
    _lastVideoResult = s.tracks.filter(t => t.type === 'video');
    _lastAudioResult = s.tracks.filter(t => t.type === 'audio' || t.type === 'music');
    _lastSubtitleResult = s.tracks.filter(t => t.type === 'subtitle');
  }
  return _lastSubtitleResult;
}
