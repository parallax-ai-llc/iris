/**
 * ZoomControls - Zoom in/out and fit controls
 */

import { memo, useCallback } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { ZoomIn, ZoomOut, Maximize, Square } from 'lucide-react';

export const ZoomControls = memo(function ZoomControls() {
  const { zoom, zoomIn, zoomOut, zoomToFit, zoomTo100, setZoom } = useImageEditorStore();

  const handleZoomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setZoom(Number(e.target.value));
  }, [setZoom]);

  return (
    <div className="flex items-center gap-2">
      {/* Zoom out */}
      <button
        onClick={zoomOut}
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          'text-zinc-400 hover:text-white hover:bg-zinc-700'
        )}
        title="Zoom Out (Ctrl+-)"
      >
        <ZoomOut className="w-4 h-4" />
      </button>

      {/* Zoom slider */}
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={10}
          max={400}
          value={zoom}
          onChange={handleZoomChange}
          className="w-20 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-3
            [&::-webkit-slider-thumb]:h-3
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:shadow-md
            [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <span className="text-xs text-zinc-400 w-12 text-right tabular-nums">
          {Math.round(zoom)}%
        </span>
      </div>

      {/* Zoom in */}
      <button
        onClick={zoomIn}
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          'text-zinc-400 hover:text-white hover:bg-zinc-700'
        )}
        title="Zoom In (Ctrl++)"
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      {/* Separator */}
      <div className="w-px h-4 bg-zinc-700 mx-1" />

      {/* Fit to view */}
      <button
        onClick={zoomToFit}
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          'text-zinc-400 hover:text-white hover:bg-zinc-700'
        )}
        title="Fit to View (Ctrl+0)"
      >
        <Maximize className="w-4 h-4" />
      </button>

      {/* 100% */}
      <button
        onClick={zoomTo100}
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          'text-zinc-400 hover:text-white hover:bg-zinc-700'
        )}
        title="Actual Size (Ctrl+1)"
      >
        <Square className="w-4 h-4" />
      </button>
    </div>
  );
});

export default ZoomControls;
