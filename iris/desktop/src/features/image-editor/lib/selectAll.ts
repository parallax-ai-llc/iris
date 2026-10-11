/**
 * Select All — a full white mask covering the active layer.
 * Shared by the Select ▸ All menu item and the Ctrl+A shortcut so both build
 * the same selection (the mask is required by Delete / fill / feather).
 */

import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';

export function selectAllOnActiveLayer(): void {
  const { layers, activeLayerId, setSelection } = useImageEditorStore.getState();
  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const w = activeLayer?.width || 1920;
  const h = activeLayer?.height || 1080;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  setSelection({
    maskDataUrl: c.toDataURL(),
    bounds: { x: 0, y: 0, width: w, height: h },
    feather: 0,
    isInverted: false,
  });
}
