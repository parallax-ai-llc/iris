/**
 * CanvasSizeModal - Photoshop-style "Canvas Size..." dialog.
 * Resizes the canvas (working area) without scaling layer contents;
 * a 3x3 anchor grid controls where existing content sits relative
 * to the new canvas bounds.
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Crop, X, Link2, Link2Off } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';

type Unit = 'px' | 'percent';

type AnchorId =
  | 'top-left' | 'top' | 'top-right'
  | 'left' | 'center' | 'right'
  | 'bottom-left' | 'bottom' | 'bottom-right';

const ANCHORS: AnchorId[] = [
  'top-left', 'top', 'top-right',
  'left', 'center', 'right',
  'bottom-left', 'bottom', 'bottom-right',
];

interface CanvasSizeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CanvasSizeModal = memo(function CanvasSizeModal({
  isOpen,
  onClose,
}: CanvasSizeModalProps) {
  const resizeCanvas = useImageEditorStore((s) => s.resizeCanvas);
  const storeWidth = useImageEditorStore((s) => s.canvasWidth);
  const storeHeight = useImageEditorStore((s) => s.canvasHeight);
  const layers = useImageEditorStore((s) => s.layers);

  // Fall back to the bounding box of layers if canvas dims are unset.
  const currentWidth = useMemo(() => {
    if (storeWidth > 0) return storeWidth;
    return Math.max(...layers.map((l) => (l.x ?? 0) + (l.width || 0)), 1);
  }, [storeWidth, layers]);
  const currentHeight = useMemo(() => {
    if (storeHeight > 0) return storeHeight;
    return Math.max(...layers.map((l) => (l.y ?? 0) + (l.height || 0)), 1);
  }, [storeHeight, layers]);

  const [unit, setUnit] = useState<Unit>('px');
  const [width, setWidth] = useState(currentWidth);
  const [height, setHeight] = useState(currentHeight);
  const [anchor, setAnchor] = useState<AnchorId>('center');
  const [relative, setRelative] = useState(false);
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setUnit('px');
    setWidth(currentWidth);
    setHeight(currentHeight);
    setAnchor('center');
    setRelative(false);
    setLinked(false);
  }, [isOpen, currentWidth, currentHeight]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const toPx = useCallback((value: number, base: number): number => {
    if (unit === 'percent') return Math.max(1, Math.round((value / 100) * base));
    return Math.max(1, Math.round(value));
  }, [unit]);

  const finalWidth = useMemo(() => {
    const px = toPx(width, currentWidth);
    return relative ? Math.max(1, currentWidth + px) : px;
  }, [width, currentWidth, toPx, relative]);

  const finalHeight = useMemo(() => {
    const px = toPx(height, currentHeight);
    return relative ? Math.max(1, currentHeight + px) : px;
  }, [height, currentHeight, toPx, relative]);

  const handleUnitChange = useCallback((next: Unit) => {
    if (next === unit) return;
    if (next === 'percent') {
      setWidth(Math.round((width / currentWidth) * 100));
      setHeight(Math.round((height / currentHeight) * 100));
    } else {
      setWidth(toPx(width, currentWidth));
      setHeight(toPx(height, currentHeight));
    }
    setUnit(next);
  }, [unit, width, height, currentWidth, currentHeight, toPx]);

  const handleWidthChange = useCallback((v: number) => {
    setWidth(v);
    if (linked && currentWidth > 0) {
      const ratio = currentHeight / currentWidth;
      setHeight(unit === 'percent' ? v : Math.max(1, Math.round(v * ratio)));
    }
  }, [linked, currentWidth, currentHeight, unit]);

  const handleHeightChange = useCallback((v: number) => {
    setHeight(v);
    if (linked && currentHeight > 0) {
      const ratio = currentWidth / currentHeight;
      setWidth(unit === 'percent' ? v : Math.max(1, Math.round(v * ratio)));
    }
  }, [linked, currentWidth, currentHeight, unit]);

  const handleApply = useCallback(() => {
    if (finalWidth < 1 || finalHeight < 1) return;
    resizeCanvas(finalWidth, finalHeight, anchor);
    onClose();
  }, [finalWidth, finalHeight, anchor, resizeCanvas, onClose]);

  if (!isOpen) return null;

  const diffW = finalWidth - currentWidth;
  const diffH = finalHeight - currentHeight;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-zinc-900 rounded-xl shadow-2xl border border-zinc-700 w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <Crop className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-white">Canvas Size</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Current size */}
          <div className="px-3 py-2 bg-zinc-800/50 rounded-lg text-xs text-zinc-400">
            <div className="flex items-center justify-between">
              <span>Current Size</span>
              <span className="text-zinc-300">{currentWidth} × {currentHeight} px</span>
            </div>
          </div>

          {/* New size */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">New Size</h3>
              <div className="flex items-center gap-1 bg-zinc-800 rounded-md p-0.5">
                <button
                  onClick={() => handleUnitChange('px')}
                  className={cn(
                    'px-2 py-0.5 text-[11px] rounded transition-colors',
                    unit === 'px' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
                  )}
                >
                  px
                </button>
                <button
                  onClick={() => handleUnitChange('percent')}
                  className={cn(
                    'px-2 py-0.5 text-[11px] rounded transition-colors',
                    unit === 'percent' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
                  )}
                >
                  %
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-[11px] text-zinc-500">Width</label>
                <input
                  type="number"
                  value={width}
                  onChange={(e) => handleWidthChange(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white text-center focus:outline-none focus:border-zinc-500"
                />
              </div>

              <button
                onClick={() => setLinked((v) => !v)}
                className={cn(
                  'mt-5 p-2 rounded-lg transition-colors',
                  linked ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
                )}
                title={linked ? 'Unlink width and height' : 'Link width and height'}
              >
                {linked ? <Link2 className="w-3.5 h-3.5" /> : <Link2Off className="w-3.5 h-3.5" />}
              </button>

              <div className="flex-1 space-y-1">
                <label className="text-[11px] text-zinc-500">Height</label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => handleHeightChange(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white text-center focus:outline-none focus:border-zinc-500"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={relative}
                onChange={(e) => setRelative(e.target.checked)}
                className="w-3.5 h-3.5 rounded bg-zinc-800 border-zinc-700"
              />
              Relative (add to current size)
            </label>
          </div>

          {/* Anchor grid */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Anchor</h3>
            <div className="grid grid-cols-3 gap-1 w-32 mx-auto">
              {ANCHORS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAnchor(a)}
                  className={cn(
                    'aspect-square rounded border transition-colors flex items-center justify-center',
                    anchor === a
                      ? 'bg-white border-white'
                      : 'bg-zinc-800 border-zinc-700 hover:border-zinc-500'
                  )}
                  title={a}
                >
                  {anchor === a && <div className="w-1.5 h-1.5 rounded-full bg-zinc-900" />}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 rounded-lg text-xs">
            <span className="text-zinc-500">New Size</span>
            <span className="text-zinc-200">
              {finalWidth} × {finalHeight} px
              {(diffW !== 0 || diffH !== 0) && (
                <span className="ml-2 text-zinc-500">
                  ({diffW >= 0 ? '+' : ''}{diffW}, {diffH >= 0 ? '+' : ''}{diffH})
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={finalWidth < 1 || finalHeight < 1}
            className={cn(
              'flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium',
              'bg-gradient-to-r from-slate-300 via-white to-slate-300',
              'text-neutral-900 hover:from-white hover:to-white',
              'transition-colors disabled:opacity-50'
            )}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
});

export default CanvasSizeModal;
