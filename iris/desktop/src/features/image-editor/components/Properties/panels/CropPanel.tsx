/**
 * CropPanel - Crop settings and aspect ratio selection
 */

import { memo, useCallback } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { RotateCcw, Check } from 'lucide-react';

const ASPECT_RATIOS = [
  { id: 'free', label: 'Free', icon: '⬜' },
  { id: '1:1', label: '1:1', icon: '⬜' },
  { id: '4:3', label: '4:3', icon: '▭' },
  { id: '16:9', label: '16:9', icon: '▭' },
  { id: '3:2', label: '3:2', icon: '▭' },
  { id: '5:4', label: '5:4', icon: '▭' },
  { id: '3:4', label: '3:4', icon: '▯' },
  { id: '9:16', label: '9:16', icon: '▯' },
  { id: '2:3', label: '2:3', icon: '▯' },
] as const;

const CROP_OVERLAYS = [
  { id: 'none', label: 'None' },
  { id: 'rule-of-thirds', label: 'Rule of Thirds' },
  { id: 'grid', label: 'Grid' },
  { id: 'diagonal', label: 'Diagonal' },
  { id: 'golden-ratio', label: 'Golden Ratio' },
] as const;

export type CropOverlay = typeof CROP_OVERLAYS[number]['id'];

export const CropPanel = memo(function CropPanel() {
  const {
    cropData,
    cropAspectRatio,
    setCropAspectRatio,
    setCropData,
    applyCrop,
  } = useImageEditorStore();

  const handleAspectRatioChange = useCallback((ratio: typeof cropAspectRatio) => {
    setCropAspectRatio(ratio);
  }, [setCropAspectRatio]);

  const handleReset = useCallback(() => {
    setCropData(null);
    setCropAspectRatio('free');
  }, [setCropData, setCropAspectRatio]);

  return (
    <div className="p-4 space-y-6">
      <p className="text-xs text-zinc-500">
        Drag on the canvas to define the crop area, or select an aspect ratio below.
      </p>

      {/* Aspect ratio selection */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Aspect Ratio
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {ASPECT_RATIOS.map((ratio) => (
            <button
              key={ratio.id}
              onClick={() => handleAspectRatioChange(ratio.id as typeof cropAspectRatio)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 p-3 rounded-lg',
                'transition-all',
                cropAspectRatio === ratio.id
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              )}
            >
              <span className="text-lg">{ratio.icon}</span>
              <span className="text-xs font-medium">{ratio.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Crop dimensions */}
      {cropData && (
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
            Dimensions
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Width</label>
              <input
                type="number"
                value={Math.round(cropData.width)}
                readOnly
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Height</label>
              <input
                type="number"
                value={Math.round(cropData.height)}
                readOnly
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">X Position</label>
              <input
                type="number"
                value={Math.round(cropData.x)}
                readOnly
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Y Position</label>
              <input
                type="number"
                value={Math.round(cropData.y)}
                readOnly
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* Crop Overlay */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Overlay
        </h3>
        <div className="space-y-1">
          {CROP_OVERLAYS.map((overlay) => (
            <button
              key={overlay.id}
              className={cn(
                'w-full px-3 py-1.5 text-left rounded text-xs transition-colors',
                'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              )}
            >
              {overlay.label}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2 pt-4 border-t border-zinc-800">
        <button
          onClick={handleReset}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg',
            'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700',
            'text-sm transition-colors'
          )}
        >
          <RotateCcw className="w-4 h-4" />
          Reset Crop
        </button>
        
        <button
          onClick={applyCrop}
          disabled={!cropData}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg',
            'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white',
            'text-sm font-medium transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <Check className="w-4 h-4" />
          Apply Crop
        </button>
      </div>
    </div>
  );
});

export default CropPanel;
