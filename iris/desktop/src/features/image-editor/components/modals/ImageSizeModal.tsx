/**
 * ImageSizeModal - Photoshop-style "Image Size..." dialog.
 * Resamples all layer pixel data to a new width/height, scaling
 * the image (and layer positions) proportionally.
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Maximize2, X, Link2, Link2Off } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';

type Unit = 'px' | 'percent';
type Resample = 'nearest' | 'bilinear' | 'bicubic';

interface ImageSizeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RESAMPLE_OPTIONS: { value: Resample; label: string; hint: string }[] = [
  { value: 'bicubic', label: 'Bicubic (best for photos)', hint: 'Smoothest gradients' },
  { value: 'bilinear', label: 'Bilinear', hint: 'Balanced speed/quality' },
  { value: 'nearest', label: 'Nearest Neighbor', hint: 'Pixel art / hard edges' },
];

export const ImageSizeModal = memo(function ImageSizeModal({
  isOpen,
  onClose,
}: ImageSizeModalProps) {
  const resizeImage = useImageEditorStore((s) => s.resizeImage);
  const storeWidth = useImageEditorStore((s) => s.canvasWidth);
  const storeHeight = useImageEditorStore((s) => s.canvasHeight);
  const layers = useImageEditorStore((s) => s.layers);

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
  const [linked, setLinked] = useState(true);
  const [resample, setResample] = useState<Resample>('bicubic');

  useEffect(() => {
    if (!isOpen) return;
    setUnit('px');
    setWidth(currentWidth);
    setHeight(currentHeight);
    setLinked(true);
    setResample('bicubic');
  }, [isOpen, currentWidth, currentHeight]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const finalWidth = useMemo(() => {
    if (unit === 'percent') return Math.max(1, Math.round((width / 100) * currentWidth));
    return Math.max(1, Math.round(width));
  }, [width, currentWidth, unit]);
  const finalHeight = useMemo(() => {
    if (unit === 'percent') return Math.max(1, Math.round((height / 100) * currentHeight));
    return Math.max(1, Math.round(height));
  }, [height, currentHeight, unit]);

  const handleUnitChange = useCallback((next: Unit) => {
    if (next === unit) return;
    if (next === 'percent') {
      setWidth(Math.round((width / currentWidth) * 100));
      setHeight(Math.round((height / currentHeight) * 100));
    } else {
      setWidth(finalWidth);
      setHeight(finalHeight);
    }
    setUnit(next);
  }, [unit, width, height, currentWidth, currentHeight, finalWidth, finalHeight]);

  const handleWidthChange = useCallback((v: number) => {
    setWidth(v);
    if (linked && currentWidth > 0) {
      if (unit === 'percent') {
        setHeight(v);
      } else {
        const ratio = currentHeight / currentWidth;
        setHeight(Math.max(1, Math.round(v * ratio)));
      }
    }
  }, [linked, currentWidth, currentHeight, unit]);

  const handleHeightChange = useCallback((v: number) => {
    setHeight(v);
    if (linked && currentHeight > 0) {
      if (unit === 'percent') {
        setWidth(v);
      } else {
        const ratio = currentWidth / currentHeight;
        setWidth(Math.max(1, Math.round(v * ratio)));
      }
    }
  }, [linked, currentWidth, currentHeight, unit]);

  const handleApply = useCallback(() => {
    if (finalWidth < 1 || finalHeight < 1) return;
    resizeImage(finalWidth, finalHeight, resample);
    onClose();
  }, [finalWidth, finalHeight, resample, resizeImage, onClose]);

  if (!isOpen) return null;

  const pctW = currentWidth > 0 ? Math.round((finalWidth / currentWidth) * 100) : 100;
  const pctH = currentHeight > 0 ? Math.round((finalHeight / currentHeight) * 100) : 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-zinc-900 rounded-xl shadow-2xl border border-zinc-700 w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <Maximize2 className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-white">Image Size</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="px-3 py-2 bg-zinc-800/50 rounded-lg text-xs text-zinc-400">
            <div className="flex items-center justify-between">
              <span>Current Size</span>
              <span className="text-zinc-300">{currentWidth} × {currentHeight} px</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Dimensions</h3>
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
                title={linked ? 'Unlink (free resize)' : 'Constrain proportions'}
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
          </div>

          {/* Resample method */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Resample</h3>
            <div className="space-y-1">
              {RESAMPLE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors',
                    resample === opt.value
                      ? 'bg-white/10 border border-white/20'
                      : 'bg-zinc-800 border border-transparent hover:bg-zinc-700'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={resample === opt.value}
                      onChange={() => setResample(opt.value)}
                      className="w-3.5 h-3.5"
                    />
                    <span className="text-xs text-zinc-200">{opt.label}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500">{opt.hint}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 rounded-lg text-xs">
            <span className="text-zinc-500">New Size</span>
            <span className="text-zinc-200">
              {finalWidth} × {finalHeight} px
              <span className="ml-2 text-zinc-500">({pctW}% × {pctH}%)</span>
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

export default ImageSizeModal;
