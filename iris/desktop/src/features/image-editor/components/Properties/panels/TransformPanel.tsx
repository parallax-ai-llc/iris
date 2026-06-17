/**
 * TransformPanel - Rotate, flip, scale, and other transforms
 */

import { memo, useCallback, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import {
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  Maximize,
  Move,
  RotateCcw as Reset,
} from 'lucide-react';

type TransformAction = 'rotate-cw' | 'rotate-ccw' | 'flip-h' | 'flip-v' | 'reset';

export const TransformPanel = memo(function TransformPanel() {
  const {
    rotation,
    setRotation,
    flipHorizontal,
    flipVertical,
    toggleFlipHorizontal,
    toggleFlipVertical,
    resetAllTransforms,
    applyTransforms,
  } = useImageEditorStore();
  const [customRotation, setCustomRotation] = useState(rotation);

  // Check if there are any transforms to apply
  const hasTransforms = rotation !== 0 || flipHorizontal || flipVertical;

  const handleTransform = useCallback((action: TransformAction) => {
    switch (action) {
      case 'rotate-cw':
        setRotation((rotation + 90) % 360);
        setCustomRotation((rotation + 90) % 360);
        break;
      case 'rotate-ccw':
        setRotation((rotation - 90 + 360) % 360);
        setCustomRotation((rotation - 90 + 360) % 360);
        break;
      case 'flip-h':
        toggleFlipHorizontal();
        break;
      case 'flip-v':
        toggleFlipVertical();
        break;
      case 'reset':
        resetAllTransforms();
        setCustomRotation(0);
        break;
    }
  }, [rotation, setRotation, toggleFlipHorizontal, toggleFlipVertical, resetAllTransforms]);

  const handleRotationChange = useCallback((value: number) => {
    setCustomRotation(value);
    setRotation(value);
  }, [setRotation]);

  const handleApplyTransform = useCallback(() => {
    applyTransforms();
    setCustomRotation(0);
  }, [applyTransforms]);

  const [freeTransformMode, setFreeTransformMode] = useState<'scale' | 'rotate' | 'skew' | 'perspective' | null>(null);

  const handleFreeTransformToggle = useCallback((mode: 'scale' | 'rotate' | 'skew' | 'perspective') => {
    setFreeTransformMode(prev => prev === mode ? null : mode);
  }, []);

  return (
    <div className="p-4 space-y-6">
      {/* Quick actions */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Quick Actions
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleTransform('rotate-ccw')}
            className={cn(
              'flex items-center justify-center gap-2 p-3 rounded-lg',
              'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white',
              'transition-colors'
            )}
          >
            <RotateCcw className="w-5 h-5" />
            <span className="text-xs">Rotate Left</span>
          </button>
          <button
            onClick={() => handleTransform('rotate-cw')}
            className={cn(
              'flex items-center justify-center gap-2 p-3 rounded-lg',
              'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white',
              'transition-colors'
            )}
          >
            <RotateCw className="w-5 h-5" />
            <span className="text-xs">Rotate Right</span>
          </button>
          <button
            onClick={() => handleTransform('flip-h')}
            className={cn(
              'flex items-center justify-center gap-2 p-3 rounded-lg',
              'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white',
              'transition-colors'
            )}
          >
            <FlipHorizontal className="w-5 h-5" />
            <span className="text-xs">Flip H</span>
          </button>
          <button
            onClick={() => handleTransform('flip-v')}
            className={cn(
              'flex items-center justify-center gap-2 p-3 rounded-lg',
              'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white',
              'transition-colors'
            )}
          >
            <FlipVertical className="w-5 h-5" />
            <span className="text-xs">Flip V</span>
          </button>
        </div>
      </div>

      {/* Rotation */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Rotation
        </h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Angle</span>
            <span className="text-xs text-zinc-500 tabular-nums">{customRotation}°</span>
          </div>
          <input
            type="range"
            min={0}
            max={360}
            value={customRotation}
            onChange={(e) => handleRotationChange(Number(e.target.value))}
            className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-3
              [&::-webkit-slider-thumb]:h-3
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-white
              [&::-webkit-slider-thumb]:shadow-md
              [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <div className="flex gap-1">
            {[0, 90, 180, 270].map((angle) => (
              <button
                key={angle}
                onClick={() => handleRotationChange(angle)}
                className={cn(
                  'flex-1 py-1.5 rounded text-xs font-medium transition-colors',
                  customRotation === angle
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                )}
              >
                {angle}°
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Free Transform (Unified) */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Free Transform
        </h3>
        <p className="text-xs text-zinc-500">
          Select a mode, then drag handles on the canvas. Hold Shift for constrained proportions.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {([
            { mode: 'scale' as const, icon: Maximize, label: 'Scale', desc: 'Resize proportionally' },
            { mode: 'rotate' as const, icon: RotateCw, label: 'Rotate', desc: 'Free angle rotation' },
            { mode: 'skew' as const, icon: Move, label: 'Skew', desc: 'Slant horizontally/vertically' },
            { mode: 'perspective' as const, icon: Move, label: 'Perspective', desc: 'Adjust perspective' },
          ] as const).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => handleFreeTransformToggle(mode)}
              className={cn(
                'flex items-center justify-center gap-2 p-3 rounded-lg transition-colors',
                freeTransformMode === mode
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="text-xs">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Reset */}
      <button
        onClick={() => handleTransform('reset')}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg',
          'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700',
          'text-sm transition-colors'
        )}
      >
        <Reset className="w-4 h-4" />
        Reset Transform
      </button>

      {/* Apply button */}
      <button
        onClick={handleApplyTransform}
        disabled={!hasTransforms}
        className={cn(
          'w-full px-4 py-2.5 rounded-lg text-sm font-medium',
          'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white',
          'transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        Apply Transform
      </button>
    </div>
  );
});

export default TransformPanel;
