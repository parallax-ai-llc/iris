/**
 * Image editor page shortcuts (file, edit, view, select, tools) on the central
 * dispatcher. Keys come from IMAGE_EDITOR_KEYMAP; this hook only supplies the
 * handlers. Mounted by ImageEditorPage.
 */

import { useMemo, useRef } from 'react';
import {
  useKeymapLayer,
  useModalShortcutBlock,
  useShortcutLayer,
  type ShortcutBinding,
  type ShortcutHandler,
} from '@/shared/lib/shortcuts';
import { useImageEditorStore, type EditMode } from '@/features/image-editor/stores/imageEditor.store';
import { SHORTCUT_TO_GROUP } from '@/features/image-editor/components/Toolbar/ToolPanel';
import {
  IMAGE_EDITOR_KEYMAP,
  type ImageEditorPageCommand,
} from '@/features/image-editor/lib/shortcuts/imageEditorKeymap';
import { selectAllOnActiveLayer } from '@/features/image-editor/lib/selectAll';

export interface ImageEditorShortcutContext {
  onBack: () => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onCloseTab: () => void;
  onPaste: () => void | Promise<void>;
  /** A page-level dialog is open → every editor shortcut is blocked. */
  modalOpen: boolean;
}

type ToolGroup = (typeof SHORTCUT_TO_GROUP)[string];
type ToolGroupItem = ToolGroup['items'][number];

const getState = () => useImageEditorStore.getState();

function isItemActive(item: ToolGroupItem, matchEditMode: boolean): boolean {
  const { editMode, activeTool, selectionTool, navigationTool } = getState();
  const a = item.action;
  if (a.type === 'drawTool') return (!matchEditMode || editMode === 'drawing') && activeTool === a.tool;
  if (a.type === 'selectionTool') return (!matchEditMode || editMode === 'selection') && selectionTool === a.tool;
  if (a.type === 'editMode') return editMode === a.mode;
  if (a.type === 'navigationTool') return navigationTool === a.tool;
  return false;
}

/** Photoshop-style group key: first press picks the last-used tool, repeats cycle. */
export function activateToolGroup(group: ToolGroup): void {
  const state = getState();
  const items = group.items;
  const lastUsed = state.lastUsedToolPerGroup[group.groupId] || items[0].id;
  const isInGroup = items.some((item) => isItemActive(item, true));

  let target: ToolGroupItem;
  if (isInGroup && items.length > 1) {
    const currentIdx = items.findIndex((item) => isItemActive(item, false));
    target = items[(currentIdx + 1) % items.length];
  } else {
    target = items.find((i) => i.id === lastUsed) || items[0];
  }

  state.setLastUsedToolForGroup(group.groupId, target.id);
  const action = target.action;
  if (action.type === 'navigationTool') {
    state.setNavigationTool(action.tool);
    return;
  }
  state.setNavigationTool('none');
  if (action.type === 'drawTool') {
    state.setEditMode('drawing');
    state.setActiveTool(action.tool);
  } else if (action.type === 'selectionTool') {
    state.setSelectionTool(action.tool);
    state.setEditMode('selection');
  } else if (action.type === 'editMode') {
    state.setEditMode(action.mode);
  }
}

function setToolMode(mode: EditMode): void {
  const { setNavigationTool, setEditMode } = getState();
  setNavigationTool('none');
  setEditMode(mode);
}

/** Bindings for the tool-group letters defined in ToolPanel (M, L, W, B, …). */
export function toolGroupBindings(): ShortcutBinding[] {
  return Object.entries(SHORTCUT_TO_GROUP).map(([letter, group]) => ({
    id: `toolGroup.${group.groupId}`,
    keys: letter.toUpperCase(),
    run: () => activateToolGroup(group),
  }));
}

const TOOL_GROUP_BINDINGS = toolGroupBindings();

export function createImageEditorPageHandlers(
  ctx: () => Omit<ImageEditorShortcutContext, 'modalOpen'>,
): Record<ImageEditorPageCommand, ShortcutHandler> {
  return {
    escape: (e) => {
      // The text tool's contenteditable owns Escape while editing text.
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable) return false;
      const { editMode, setEditMode } = getState();
      if (editMode !== 'none') {
        setEditMode('none');
        return;
      }
      ctx().onBack();
    },
    applyCrop: () => {
      const state = getState();
      if (state.editMode !== 'crop') return false;
      state.applyCrop();
    },
    undo: () => {
      const { canUndo, undo } = getState();
      if (canUndo()) undo();
    },
    redo: () => {
      const { canRedo, redo } = getState();
      if (canRedo()) redo();
    },
    newDocument: () => ctx().onNew(),
    open: () => ctx().onOpen(),
    save: () => ctx().onSave(),
    saveAs: () => ctx().onSaveAs(),
    exportAs: () => getState().setEditMode('export'),
    closeTab: () => ctx().onCloseTab(),
    paste: () => {
      void ctx().onPaste();
    },
    freeTransform: () => getState().setEditMode('freeTransform'),
    stampVisible: () => getState().stampVisible(),
    canvasSize: () => getState().setEditMode('canvasSize'),
    imageSize: () => getState().setEditMode('imageSize'),
    zoomIn: () => getState().zoomIn(),
    zoomOut: () => getState().zoomOut(),
    zoomFit: () => getState().zoomToFit(),
    zoom100: () => getState().zoomTo100(),
    selectAll: () => selectAllOnActiveLayer(),
    deselect: () => getState().clearSelection(),
    invertSelection: () => getState().invertSelection(),
    quickMask: () => getState().toggleQuickMask(),
    proofColors: () => getState().toggleColorProofing(),
    gamutWarning: () => getState().toggleGamutWarning(),
    toggleLayersPanel: () => getState().toggleLayersPanel(),
    toggleImageInfoPanel: () => getState().toggleImageInfoPanel(),
    brushSmaller: () => {
      const { brushSettings, setBrushSettings } = getState();
      setBrushSettings({ size: Math.max(1, brushSettings.size - 5) });
    },
    brushLarger: () => {
      const { brushSettings, setBrushSettings } = getState();
      setBrushSettings({ size: Math.min(500, brushSettings.size + 5) });
    },
    resetColors: () => getState().resetDefaultColors(),
    swapColors: () => getState().swapColors(),
    toolMove: () => setToolMode('move'),
    toolCrop: () => setToolMode('crop'),
    toolPen: () => setToolMode('pen'),
    toolText: () => setToolMode('text'),
    toolShape: () => setToolMode('shape'),
    toolHand: () => getState().setNavigationTool('hand'),
    toolZoom: () => getState().setNavigationTool('zoom'),
  };
}

export function useImageEditorShortcuts(context: ImageEditorShortcutContext): void {
  const ctxRef = useRef(context);
  ctxRef.current = context;

  const handlers = useMemo(() => createImageEditorPageHandlers(() => ctxRef.current), []);

  useModalShortcutBlock(context.modalOpen);
  useKeymapLayer('editor', IMAGE_EDITOR_KEYMAP, handlers);
  useShortcutLayer('editor', TOOL_GROUP_BINDINGS);
}
