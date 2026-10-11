/**
 * Video editor keymap — the single source of truth for every keyboard
 * shortcut in the video editor, for the shortcut labels in VideoEditorMenuBar
 * and for the KeyboardShortcutsModal help list.
 *
 * Handler owners (all in the `editor` scope of the central dispatcher):
 *   - FILE → VideoEditorPage (owns the save / open / new project flow)
 *   - EDIT → useVideoEditorShortcuts (mounted by VideoEditor)
 */

import type { Keymap } from '@/shared/lib/shortcuts';

export const VIDEO_EDITOR_FILE_COMMANDS = [
  'newProject',
  'openProject',
  'saveProject',
  'saveProjectAs',
] as const;

export const VIDEO_EDITOR_EDIT_COMMANDS = [
  'undo',
  'redo',
  'cut',
  'copy',
  'paste',
  'duplicate',
  'selectAll',
  'clearSelection',
  'deleteSelected',
  'rippleDelete',
  'splitAtPlayhead',
  'createCompound',
  'expandCompound',
  'enterCompound',
  'toggleMute',
  'playPause',
  'shuttleReverse',
  'stop',
  'shuttleForward',
  'seekBackward',
  'seekForward',
  'goToStart',
  'goToEnd',
  'setInPoint',
  'setOutPoint',
  'clearInOut',
  'toggleSnap',
  'zoomIn',
  'zoomOut',
  'multicamAngle',
  'showShortcuts',
] as const;

export type VideoEditorFileCommand = (typeof VIDEO_EDITOR_FILE_COMMANDS)[number];
export type VideoEditorEditCommand = (typeof VIDEO_EDITOR_EDIT_COMMANDS)[number];
export type VideoEditorCommand = VideoEditorFileCommand | VideoEditorEditCommand;

export const VIDEO_EDITOR_KEYMAP: Keymap<VideoEditorCommand> = {
  // ── Project ──
  newProject: { keys: ['Mod+N'], description: 'New project' },
  openProject: { keys: ['Mod+O'], description: 'Open project' },
  saveProject: { keys: ['Mod+S'], description: 'Save project' },
  saveProjectAs: { keys: ['Mod+Shift+S'], description: 'Save project as' },

  // ── Editing ──
  undo: { keys: ['Mod+Z'], description: 'Undo' },
  redo: { keys: ['Mod+Shift+Z'], description: 'Redo' },
  cut: { keys: ['Mod+X'], description: 'Cut selected clips' },
  copy: { keys: ['Mod+C'], description: 'Copy selected clips' },
  paste: { keys: ['Mod+V'], description: 'Paste clips at playhead' },
  duplicate: { keys: ['Mod+D'], description: 'Duplicate selected clips' },
  selectAll: { keys: ['Mod+A'], description: 'Select all clips' },
  clearSelection: { keys: ['Escape'], description: 'Deselect all' },
  deleteSelected: { keys: ['Delete', 'Backspace'], description: 'Delete selected clips' },
  rippleDelete: { keys: ['Shift+Delete', 'Shift+Backspace'], description: 'Ripple delete (close gap)' },
  splitAtPlayhead: { keys: ['C'], description: 'Split clip at playhead (Razor)' },
  createCompound: { keys: ['Mod+G'], description: 'Create compound clip' },
  expandCompound: { keys: ['Mod+Shift+G'], description: 'Expand compound clip' },
  enterCompound: { keys: ['Enter'], description: 'Open the selected compound clip' },
  toggleMute: { keys: ['M'], description: 'Mute/unmute selected clips' },

  // ── Playback ──
  playPause: { keys: ['Space'], description: 'Play / Pause' },
  shuttleReverse: { keys: ['J'], description: 'Reverse / speed up reverse' },
  stop: { keys: ['K'], description: 'Stop' },
  shuttleForward: { keys: ['L'], description: 'Forward / speed up forward' },
  seekBackward: { keys: ['ArrowLeft', 'Shift+ArrowLeft'], description: 'Back 1 second' },
  seekForward: { keys: ['ArrowRight', 'Shift+ArrowRight'], description: 'Forward 1 second' },
  goToStart: { keys: ['Home', 'ArrowUp'], description: 'Go to start' },
  goToEnd: { keys: ['End', 'ArrowDown'], description: 'Go to end' },
  multicamAngle: {
    keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    description: 'Switch multicam angle (multicam on)',
  },

  // ── In/Out ──
  setInPoint: { keys: ['I'], description: 'Set in point at playhead' },
  setOutPoint: { keys: ['O'], description: 'Set out point at playhead' },
  clearInOut: { keys: ['Alt+X'], description: 'Clear in/out points' },

  // ── View ──
  toggleSnap: { keys: ['G'], description: 'Toggle snap to grid' },
  zoomIn: { keys: ['Mod+=', 'Mod+Shift+='], description: 'Zoom timeline in' },
  zoomOut: { keys: ['Mod+-'], description: 'Zoom timeline out' },
  showShortcuts: { keys: ['Shift+/'], description: 'Show keyboard shortcuts' },
};

/** Grouping for the KeyboardShortcutsModal help list. */
export const VIDEO_EDITOR_SHORTCUT_GROUPS: { title: string; commands: readonly VideoEditorCommand[] }[] = [
  {
    title: 'Playback',
    commands: ['playPause', 'shuttleReverse', 'stop', 'shuttleForward', 'seekBackward', 'seekForward', 'goToStart', 'goToEnd', 'multicamAngle'],
  },
  {
    title: 'Editing',
    commands: ['splitAtPlayhead', 'deleteSelected', 'rippleDelete', 'cut', 'copy', 'paste', 'duplicate', 'selectAll', 'clearSelection', 'toggleMute', 'createCompound', 'expandCompound', 'enterCompound'],
  },
  { title: 'In/Out Points', commands: ['setInPoint', 'setOutPoint', 'clearInOut'] },
  {
    title: 'Project',
    commands: ['undo', 'redo', 'newProject', 'openProject', 'saveProject', 'saveProjectAs', 'toggleSnap', 'zoomIn', 'zoomOut', 'showShortcuts'],
  },
];
