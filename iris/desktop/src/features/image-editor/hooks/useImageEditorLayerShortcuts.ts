/**
 * Photoshop-style keyboard shortcuts for the image editor layer panel.
 *
 * Mounted by ImageEditorPage so these shortcuts are only active while
 * the image editor is visible.
 *
 *  Ctrl+J           Duplicate active layer
 *  Ctrl+E           Merge active layer down
 *  Ctrl+Shift+N     New (empty) layer
 *  Ctrl+Shift+E     Flatten (merge visible — we flatten all as closest equivalent)
 *  Ctrl+]           Bring layer forward  (index + 1)
 *  Ctrl+[           Send layer backward  (index - 1)
 *  Ctrl+Shift+]     Bring to front        (last index)
 *  Ctrl+Shift+[     Send to back          (index 0)
 *  Alt+]            Select layer above   (next higher index)
 *  Alt+[            Select layer below   (next lower index)
 *  Ctrl+G           Group layers
 *  Ctrl+Shift+G     Ungroup active layer's group
 */

import { useShortcut } from '@/shared/hooks/useKeyboardShortcuts';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';

export function useImageEditorLayerShortcuts() {
  const getState = () => useImageEditorStore.getState();

  const withActiveIndex = (fn: (index: number, layerId: string) => void) => () => {
    const { layers, activeLayerId } = getState();
    if (!activeLayerId) return;
    const index = layers.findIndex((l) => l.id === activeLayerId);
    if (index === -1) return;
    fn(index, activeLayerId);
  };

  // Ctrl+J — Duplicate
  useShortcut(
    'j',
    () => {
      const { activeLayerId, duplicateLayer } = getState();
      if (activeLayerId) duplicateLayer(activeLayerId);
    },
    { ctrl: true, description: 'Duplicate layer' }
  );

  // Ctrl+E — Merge down
  useShortcut(
    'e',
    () => {
      const { activeLayerId, mergeLayerDown } = getState();
      if (activeLayerId) mergeLayerDown(activeLayerId);
    },
    { ctrl: true, description: 'Merge layer down' }
  );

  // Ctrl+Shift+N — New empty layer
  useShortcut(
    'n',
    () => {
      const { addLayer, layers } = getState();
      // Create a transparent 1x1 placeholder; addLayer expects imageData
      // (store will paint onto it via drawing). Use an empty PNG data URL.
      const emptyPng =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAgAAetx+wcAAAAASUVORK5CYII=';
      addLayer(emptyPng, `Layer ${layers.length + 1}`);
    },
    { ctrl: true, shift: true, description: 'New layer' }
  );

  // Ctrl+Shift+E — Flatten / merge visible
  useShortcut(
    'e',
    () => {
      getState().flattenLayers?.();
    },
    { ctrl: true, shift: true, description: 'Flatten layers' }
  );

  // Ctrl+] — Bring forward
  useShortcut(
    ']',
    withActiveIndex((index) => {
      const { layers, reorderLayers } = getState();
      if (index < layers.length - 1) reorderLayers(index, index + 1);
    }),
    { ctrl: true, description: 'Bring layer forward' }
  );

  // Ctrl+[ — Send backward
  useShortcut(
    '[',
    withActiveIndex((index) => {
      const { reorderLayers } = getState();
      if (index > 0) reorderLayers(index, index - 1);
    }),
    { ctrl: true, description: 'Send layer backward' }
  );

  // Ctrl+Shift+] — Bring to front
  useShortcut(
    ']',
    withActiveIndex((index) => {
      const { layers, reorderLayers } = getState();
      if (index < layers.length - 1) reorderLayers(index, layers.length - 1);
    }),
    { ctrl: true, shift: true, description: 'Bring layer to front' }
  );

  // Ctrl+Shift+[ — Send to back
  useShortcut(
    '[',
    withActiveIndex((index) => {
      if (index > 0) getState().reorderLayers(index, 0);
    }),
    { ctrl: true, shift: true, description: 'Send layer to back' }
  );

  // Alt+] — Select layer above (higher index)
  useShortcut(
    ']',
    withActiveIndex((index) => {
      const { layers, setActiveLayer } = getState();
      if (index < layers.length - 1) setActiveLayer(layers[index + 1].id);
    }),
    { alt: true, description: 'Select layer above' }
  );

  // Alt+[ — Select layer below
  useShortcut(
    '[',
    withActiveIndex((index) => {
      const { layers, setActiveLayer } = getState();
      if (index > 0) setActiveLayer(layers[index - 1].id);
    }),
    { alt: true, description: 'Select layer below' }
  );

  // Ctrl+G — Group
  useShortcut(
    'g',
    () => {
      getState().createLayerGroup?.();
    },
    { ctrl: true, description: 'Group layers' }
  );

  // Ctrl+Shift+G — Ungroup (ungroup the active layer's parent group, or the
  // active layer itself if it is a group).
  useShortcut(
    'g',
    () => {
      const { layers, activeLayerId, ungroupLayers } = getState();
      if (!activeLayerId) return;
      const active = layers.find((l) => l.id === activeLayerId);
      if (!active) return;
      const targetId =
        active.type === 'group' ? active.id : active.parentId ?? null;
      if (targetId) ungroupLayers(targetId);
    },
    { ctrl: true, shift: true, description: 'Ungroup layers' }
  );
}

export default useImageEditorLayerShortcuts;
