/**
 * SelectionPanel - Selection tools and options
 */

import { memo, useCallback } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore, SelectionTool } from '@/features/image-editor/stores/imageEditor.store';
import { Square, Circle, Lasso, PenTool, Wand2, XCircle, RefreshCw } from 'lucide-react';

const SELECTION_TOOLS: Array<{ id: SelectionTool; label: string; icon: React.ReactNode }> = [
  { id: 'rectangle', label: 'Rectangle', icon: <Square className="w-5 h-5" /> },
  { id: 'ellipse', label: 'Ellipse', icon: <Circle className="w-5 h-5" /> },
  { id: 'lasso', label: 'Lasso', icon: <Lasso className="w-5 h-5" /> },
  { id: 'polygonal', label: 'Polygonal', icon: <PenTool className="w-5 h-5" /> },
  { id: 'magicWand', label: 'Magic Wand', icon: <Wand2 className="w-5 h-5" /> },
];

export const SelectionPanel = memo(function SelectionPanel() {
  const {
    selectionTool,
    setSelectionTool,
    selection,
    clearSelection,
    invertSelection,
    selectionFeather,
    setSelectionFeather,
    selectionTolerance,
    setSelectionTolerance,
  } = useImageEditorStore();

  const handleToolChange = useCallback((tool: SelectionTool) => {
    setSelectionTool(tool);
  }, [setSelectionTool]);

  return (
    <div className="p-4 space-y-6">
      {/* Selection tools */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Selection Tool
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {SELECTION_TOOLS.map((tool) => (
            <button
              key={tool.id}
              onClick={() => handleToolChange(tool.id)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 p-3 rounded-lg',
                'transition-all',
                selectionTool === tool.id
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              )}
            >
              {tool.icon}
              <span className="text-[10px] font-medium">{tool.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Selection options */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Options
        </h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Feather</span>
            <span className="text-xs text-zinc-500">{selectionFeather}px</span>
          </div>
          <input
            type="range"
            min={0}
            max={50}
            value={selectionFeather}
            onChange={(e) => setSelectionFeather(Number(e.target.value))}
            className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-3
              [&::-webkit-slider-thumb]:h-3
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-white
              [&::-webkit-slider-thumb]:shadow-md
              [&::-webkit-slider-thumb]:cursor-pointer"
          />
        </div>

        {selectionTool === 'magicWand' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">Tolerance</span>
              <span className="text-xs text-zinc-500">{selectionTolerance}</span>
            </div>
            <input
              type="range"
              min={0}
              max={255}
              value={selectionTolerance}
              onChange={(e) => setSelectionTolerance(Number(e.target.value))}
              className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-3
                [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-white
                [&::-webkit-slider-thumb]:shadow-md
                [&::-webkit-slider-thumb]:cursor-pointer"
            />
          </div>
        )}
      </div>

      {/* Selection actions */}
      {selection && (
        <div className="space-y-3 pt-4 border-t border-zinc-800">
          <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
            Selection Actions
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={invertSelection}
              className={cn(
                'flex items-center justify-center gap-2 p-2 rounded-lg',
                'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white',
                'text-xs transition-colors'
              )}
            >
              <RefreshCw className="w-4 h-4" />
              Invert
            </button>
            <button
              onClick={clearSelection}
              className={cn(
                'flex items-center justify-center gap-2 p-2 rounded-lg',
                'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white',
                'text-xs transition-colors'
              )}
            >
              <XCircle className="w-4 h-4" />
              Deselect
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-500">
        Click and drag on the canvas to create a selection. Hold Shift to add to selection.
      </p>
    </div>
  );
});

export default SelectionPanel;
