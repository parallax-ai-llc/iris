/**
 * Image editor keymap — the single source of truth for every keyboard
 * shortcut in the image editor AND for the shortcut labels in EditorMenuBar.
 *
 * Commands are split by who owns the handler (all register in the `editor`
 * scope of the central dispatcher):
 *   - PAGE   → useImageEditorShortcuts (mounted by ImageEditorPage)
 *   - LAYER  → useImageEditorLayerShortcuts
 *   - CANVAS → EditorCanvas (needs the canvas ref for history snapshots)
 * Tool-group letters (M, L, W, B, …) are derived from ToolPanel's
 * TOOL_GROUPS and are registered next to the PAGE commands.
 *
 * Photoshop (Windows) conventions: Redo = Ctrl+Shift+Z, Ctrl+Y = Proof Colors.
 */

import type { Keymap } from '@/shared/lib/shortcuts';

export const IMAGE_EDITOR_PAGE_COMMANDS = [
  'escape',
  'applyCrop',
  'undo',
  'redo',
  'newDocument',
  'open',
  'save',
  'saveAs',
  'exportAs',
  'closeTab',
  'paste',
  'freeTransform',
  'stampVisible',
  'canvasSize',
  'imageSize',
  'zoomIn',
  'zoomOut',
  'zoomFit',
  'zoom100',
  'selectAll',
  'deselect',
  'invertSelection',
  'quickMask',
  'proofColors',
  'gamutWarning',
  'toggleLayersPanel',
  'toggleImageInfoPanel',
  'brushSmaller',
  'brushLarger',
  'resetColors',
  'swapColors',
  'toolMove',
  'toolCrop',
  'toolPen',
  'toolText',
  'toolShape',
  'toolHand',
  'toolZoom',
] as const;

export const IMAGE_EDITOR_LAYER_COMMANDS = [
  'duplicateLayer',
  'mergeLayerDown',
  'newLayer',
  'flattenLayers',
  'bringLayerForward',
  'sendLayerBackward',
  'bringLayerToFront',
  'sendLayerToBack',
  'selectLayerAbove',
  'selectLayerBelow',
  'groupLayers',
  'ungroupLayers',
] as const;

export const IMAGE_EDITOR_CANVAS_COMMANDS = [
  'deleteSelection',
  'nudgeUp',
  'nudgeDown',
  'nudgeLeft',
  'nudgeRight',
] as const;

export type ImageEditorPageCommand = (typeof IMAGE_EDITOR_PAGE_COMMANDS)[number];
export type ImageEditorLayerCommand = (typeof IMAGE_EDITOR_LAYER_COMMANDS)[number];
export type ImageEditorCanvasCommand = (typeof IMAGE_EDITOR_CANVAS_COMMANDS)[number];
export type ImageEditorCommand =
  | ImageEditorPageCommand
  | ImageEditorLayerCommand
  | ImageEditorCanvasCommand;

export const IMAGE_EDITOR_KEYMAP: Keymap<ImageEditorCommand> = {
  // ── File / edit ──
  escape: { keys: ['Escape'], description: 'Leave the current tool mode, then back to gallery', allowInInput: true },
  applyCrop: { keys: ['Enter'], description: 'Apply crop (crop mode)' },
  undo: { keys: ['Mod+Z'], description: 'Undo' },
  redo: { keys: ['Mod+Shift+Z'], description: 'Redo' },
  newDocument: { keys: ['Mod+N'], description: 'New document' },
  open: { keys: ['Mod+O'], description: 'Open' },
  save: { keys: ['Mod+S'], description: 'Save' },
  saveAs: { keys: ['Mod+Shift+S'], description: 'Save as' },
  exportAs: { keys: ['Mod+Alt+Shift+W'], description: 'Export as' },
  closeTab: { keys: ['Mod+W'], description: 'Close tab' },
  paste: { keys: ['Mod+V'], description: 'Paste image from clipboard' },
  freeTransform: { keys: ['Mod+T'], description: 'Free transform' },
  stampVisible: { keys: ['Mod+Alt+Shift+E'], description: 'Stamp visible' },
  canvasSize: { keys: ['Mod+Alt+C'], description: 'Canvas size' },
  imageSize: { keys: ['Mod+Alt+I'], description: 'Image size' },

  // ── View ──
  zoomIn: { keys: ['Mod+=', 'Mod+Shift+='], description: 'Zoom in' },
  zoomOut: { keys: ['Mod+-'], description: 'Zoom out' },
  zoomFit: { keys: ['Mod+0'], description: 'Zoom to fit' },
  zoom100: { keys: ['Mod+1'], description: 'Zoom 100%' },
  proofColors: { keys: ['Mod+Y'], description: 'Toggle proof colors' },
  gamutWarning: { keys: ['Mod+Shift+Y'], description: 'Toggle gamut warning' },
  toggleLayersPanel: { keys: ['F7'], description: 'Toggle layers panel' },
  toggleImageInfoPanel: { keys: ['F8'], description: 'Toggle image info panel' },

  // ── Select ──
  selectAll: { keys: ['Mod+A'], description: 'Select all' },
  deselect: { keys: ['Mod+D'], description: 'Deselect' },
  invertSelection: { keys: ['Mod+Shift+I'], description: 'Invert selection' },
  quickMask: { keys: ['Q'], description: 'Toggle quick mask mode' },

  // ── Tools ──
  brushSmaller: { keys: ['['], description: 'Decrease brush size' },
  brushLarger: { keys: [']'], description: 'Increase brush size' },
  resetColors: { keys: ['D'], description: 'Default foreground/background colors' },
  swapColors: { keys: ['X'], description: 'Swap foreground/background colors' },
  toolMove: { keys: ['V'], description: 'Move tool' },
  toolCrop: { keys: ['C'], description: 'Crop tool' },
  toolPen: { keys: ['P'], description: 'Pen tool' },
  toolText: { keys: ['T'], description: 'Text tool' },
  toolShape: { keys: ['U'], description: 'Shape tool' },
  toolHand: { keys: ['H'], description: 'Hand tool' },
  toolZoom: { keys: ['Z'], description: 'Zoom tool' },

  // ── Layers ──
  duplicateLayer: { keys: ['Mod+J'], description: 'Duplicate layer' },
  mergeLayerDown: { keys: ['Mod+E'], description: 'Merge layer down' },
  newLayer: { keys: ['Mod+Shift+N'], description: 'New layer' },
  flattenLayers: { keys: ['Mod+Shift+E'], description: 'Flatten layers' },
  bringLayerForward: { keys: ['Mod+]'], description: 'Bring layer forward' },
  sendLayerBackward: { keys: ['Mod+['], description: 'Send layer backward' },
  bringLayerToFront: { keys: ['Mod+Shift+]'], description: 'Bring layer to front' },
  sendLayerToBack: { keys: ['Mod+Shift+['], description: 'Send layer to back' },
  selectLayerAbove: { keys: ['Alt+]'], description: 'Select layer above' },
  selectLayerBelow: { keys: ['Alt+['], description: 'Select layer below' },
  groupLayers: { keys: ['Mod+G'], description: 'Group layers' },
  ungroupLayers: { keys: ['Mod+Shift+G'], description: 'Ungroup layers' },

  // ── Canvas ──
  deleteSelection: { keys: ['Delete', 'Backspace'], description: 'Erase the selected area' },
  nudgeUp: { keys: ['ArrowUp', 'Shift+ArrowUp'], description: 'Nudge layer up (Shift: 10px)' },
  nudgeDown: { keys: ['ArrowDown', 'Shift+ArrowDown'], description: 'Nudge layer down (Shift: 10px)' },
  nudgeLeft: { keys: ['ArrowLeft', 'Shift+ArrowLeft'], description: 'Nudge layer left (Shift: 10px)' },
  nudgeRight: { keys: ['ArrowRight', 'Shift+ArrowRight'], description: 'Nudge layer right (Shift: 10px)' },
};
