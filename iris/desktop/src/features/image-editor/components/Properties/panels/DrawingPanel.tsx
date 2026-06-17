/**
 * DrawingPanel - Brush and drawing tool settings
 */

import { memo, useCallback } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore, DrawTool } from '@/features/image-editor/stores/imageEditor.store';
import { Pencil, PenTool, Eraser, Droplet, PaintBucket, Copy } from 'lucide-react';

const DRAW_TOOLS: Array<{ id: DrawTool; label: string; icon: React.ReactNode; shortcut: string }> = [
  { id: 'brush', label: 'Brush', icon: <PenTool className="w-5 h-5" />, shortcut: 'B' },
  { id: 'pencil', label: 'Pencil', icon: <Pencil className="w-5 h-5" />, shortcut: 'N' },
  { id: 'eraser', label: 'Eraser', icon: <Eraser className="w-5 h-5" />, shortcut: 'E' },
  { id: 'gradient', label: 'Gradient', icon: <Droplet className="w-5 h-5" />, shortcut: 'G' },
  { id: 'bucket', label: 'Fill', icon: <PaintBucket className="w-5 h-5" />, shortcut: 'K' },
  { id: 'clone', label: 'Clone', icon: <Copy className="w-5 h-5" />, shortcut: 'S' },
];

const BLEND_MODES = [
  { id: 'normal', label: 'Normal' },
  { id: 'multiply', label: 'Multiply' },
  { id: 'screen', label: 'Screen' },
  { id: 'overlay', label: 'Overlay' },
] as const;

export const DrawingPanel = memo(function DrawingPanel() {
  const { activeTool, setActiveTool, brushSettings, setBrushSettings } = useImageEditorStore();

  const handleToolChange = useCallback((tool: DrawTool) => {
    setActiveTool(tool);
  }, [setActiveTool]);

  return (
    <div className="p-4 space-y-6">
      {/* Drawing tools */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Tool
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {DRAW_TOOLS.map((tool) => (
            <button
              key={tool.id}
              onClick={() => handleToolChange(tool.id)}
              title={`${tool.label} (${tool.shortcut})`}
              className={cn(
                'flex flex-col items-center justify-center gap-1 p-3 rounded-lg',
                'transition-all',
                activeTool === tool.id
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

      {/* Brush settings */}
      <div className="space-y-4">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Brush Settings
        </h3>

        {/* Color picker */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-zinc-400">Color</label>
          <input
            type="color"
            value={brushSettings.color}
            onChange={(e) => setBrushSettings({ color: e.target.value })}
            className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
          />
          <span className="text-xs text-zinc-500 uppercase">{brushSettings.color}</span>
        </div>

        {/* Size */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Size</span>
            <span className="text-xs text-zinc-500">{brushSettings.size}px</span>
          </div>
          <input
            type="range"
            min={1}
            max={200}
            value={brushSettings.size}
            onChange={(e) => setBrushSettings({ size: Number(e.target.value) })}
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

        {/* Hardness */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Hardness</span>
            <span className="text-xs text-zinc-500">{brushSettings.hardness}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={brushSettings.hardness}
            onChange={(e) => setBrushSettings({ hardness: Number(e.target.value) })}
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

        {/* Opacity */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Opacity</span>
            <span className="text-xs text-zinc-500">{brushSettings.opacity}%</span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            value={brushSettings.opacity}
            onChange={(e) => setBrushSettings({ opacity: Number(e.target.value) })}
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

        {/* Flow */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Flow</span>
            <span className="text-xs text-zinc-500">{brushSettings.flow}%</span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            value={brushSettings.flow}
            onChange={(e) => setBrushSettings({ flow: Number(e.target.value) })}
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

        {/* Blend mode */}
        <div className="space-y-2">
          <label className="text-xs text-zinc-400">Blend Mode</label>
          <select
            value={brushSettings.blendMode}
            onChange={(e) => setBrushSettings({ blendMode: e.target.value as typeof brushSettings.blendMode })}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white"
          >
            {BLEND_MODES.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Brush preview */}
      <div className="space-y-2 pt-4 border-t border-zinc-800">
        <span className="text-xs text-zinc-400">Preview</span>
        <div className="h-16 bg-zinc-800 rounded-lg flex items-center justify-center">
          <div
            className="rounded-full"
            style={{
              width: Math.min(brushSettings.size, 48),
              height: Math.min(brushSettings.size, 48),
              backgroundColor: brushSettings.color,
              opacity: brushSettings.opacity / 100,
            }}
          />
        </div>
      </div>
    </div>
  );
});

export default DrawingPanel;
