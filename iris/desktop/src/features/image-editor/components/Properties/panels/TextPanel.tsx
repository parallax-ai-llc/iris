/**
 * TextPanel - Text tool settings
 */

import { memo, useCallback } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { AlignLeft, AlignCenter, AlignRight, Bold, Italic, Plus } from 'lucide-react';

const FONT_FAMILIES = [
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Verdana',
  'Courier New',
  'Impact',
  'Comic Sans MS',
];

const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96];

export const TextPanel = memo(function TextPanel() {
  const {
    textSettings,
    setTextSettings,
    textLayers,
    activeTextLayerId,
    addTextLayer,
    setActiveTextLayer,
  } = useImageEditorStore();

  const handleAddText = useCallback(() => {
    const id = addTextLayer('New Text', 100, 100);
    setActiveTextLayer(id);
  }, [addTextLayer, setActiveTextLayer]);

  return (
    <div className="p-4 space-y-6">
      {/* Add text button */}
      <button
        onClick={handleAddText}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg',
          'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white',
          'text-sm font-medium transition-colors'
        )}
      >
        <Plus className="w-4 h-4" />
        Add Text
      </button>

      {/* Font settings */}
      <div className="space-y-4">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Font
        </h3>

        {/* Font family */}
        <div className="space-y-2">
          <label className="text-xs text-zinc-400">Family</label>
          <select
            value={textSettings.fontFamily}
            onChange={(e) => setTextSettings({ fontFamily: e.target.value })}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white"
          >
            {FONT_FAMILIES.map((font) => (
              <option key={font} value={font} style={{ fontFamily: font }}>
                {font}
              </option>
            ))}
          </select>
        </div>

        {/* Font size */}
        <div className="space-y-2">
          <label className="text-xs text-zinc-400">Size</label>
          <select
            value={textSettings.fontSize}
            onChange={(e) => setTextSettings({ fontSize: Number(e.target.value) })}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white"
          >
            {FONT_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}px
              </option>
            ))}
          </select>
        </div>

        {/* Font style */}
        <div className="flex gap-2">
          <button
            onClick={() => setTextSettings({
              fontWeight: textSettings.fontWeight === 'bold' ? 'normal' : 'bold'
            })}
            className={cn(
              'flex-1 flex items-center justify-center p-2 rounded-lg transition-colors',
              textSettings.fontWeight === 'bold'
                ? 'bg-white/10 text-white border border-white/20'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
            )}
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTextSettings({
              fontStyle: textSettings.fontStyle === 'italic' ? 'normal' : 'italic'
            })}
            className={cn(
              'flex-1 flex items-center justify-center p-2 rounded-lg transition-colors',
              textSettings.fontStyle === 'italic'
                ? 'bg-white/10 text-white border border-white/20'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
            )}
          >
            <Italic className="w-4 h-4" />
          </button>
        </div>

        {/* Color */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-zinc-400">Color</label>
          <input
            type="color"
            value={textSettings.color}
            onChange={(e) => setTextSettings({ color: e.target.value })}
            className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
          />
          <span className="text-xs text-zinc-500 uppercase">{textSettings.color}</span>
        </div>

        {/* Alignment */}
        <div className="space-y-2">
          <label className="text-xs text-zinc-400">Alignment</label>
          <div className="flex gap-2">
            <button
              onClick={() => setTextSettings({ alignment: 'left' })}
              className={cn(
                'flex-1 flex items-center justify-center p-2 rounded-lg transition-colors',
                textSettings.alignment === 'left'
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              )}
            >
              <AlignLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTextSettings({ alignment: 'center' })}
              className={cn(
                'flex-1 flex items-center justify-center p-2 rounded-lg transition-colors',
                textSettings.alignment === 'center'
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              )}
            >
              <AlignCenter className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTextSettings({ alignment: 'right' })}
              className={cn(
                'flex-1 flex items-center justify-center p-2 rounded-lg transition-colors',
                textSettings.alignment === 'right'
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              )}
            >
              <AlignRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Line height */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Line Height</span>
            <span className="text-xs text-zinc-500">{textSettings.lineHeight.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={3}
            step={0.1}
            value={textSettings.lineHeight}
            onChange={(e) => setTextSettings({ lineHeight: Number(e.target.value) })}
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

        {/* Letter spacing */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Letter Spacing</span>
            <span className="text-xs text-zinc-500">{textSettings.letterSpacing}px</span>
          </div>
          <input
            type="range"
            min={-10}
            max={20}
            value={textSettings.letterSpacing}
            onChange={(e) => setTextSettings({ letterSpacing: Number(e.target.value) })}
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
      </div>

      {/* Text layers list */}
      {textLayers.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-zinc-800">
          <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
            Text Layers
          </h3>
          <div className="space-y-1">
            {textLayers.map((layer) => (
              <button
                key={layer.id}
                onClick={() => setActiveTextLayer(layer.id)}
                className={cn(
                  'w-full px-3 py-2 rounded-lg text-left text-sm transition-colors',
                  activeTextLayerId === layer.id
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                )}
              >
                <span className="truncate block">{layer.text || 'Empty text'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default TextPanel;
