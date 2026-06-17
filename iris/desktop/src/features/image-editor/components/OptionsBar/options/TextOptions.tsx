/**
 * TextOptions - Text tool options for Options Bar
 */

import { memo, useCallback } from 'react';
import { Bold, Italic, AlignLeft, AlignCenter, AlignRight, Plus } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { CompactSlider, BarSeparator, ActionButton } from '../shared';

const FONT_FAMILIES = ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana', 'Courier New', 'Impact', 'Comic Sans MS'];
const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96];

export const TextOptions = memo(function TextOptions() {
  const { textSettings, setTextSettings, addTextLayer, setActiveTextLayer } = useImageEditorStore();

  const handleAddText = useCallback(() => {
    const id = addTextLayer('New Text', 100, 100);
    setActiveTextLayer(id);
  }, [addTextLayer, setActiveTextLayer]);

  return (
    <div className="flex items-center gap-2">
      <ActionButton icon={<Plus className="w-3 h-3" />} label="Add Text" onClick={handleAddText} variant="primary" />
      <BarSeparator />
      <select
        value={textSettings.fontFamily}
        onChange={(e) => setTextSettings({ fontFamily: e.target.value })}
        className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-white max-w-[100px]"
      >
        {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <select
        value={textSettings.fontSize}
        onChange={(e) => setTextSettings({ fontSize: Number(e.target.value) })}
        className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-white w-16"
      >
        {FONT_SIZES.map((s) => <option key={s} value={s}>{s}px</option>)}
      </select>
      <BarSeparator />
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => setTextSettings({ fontWeight: textSettings.fontWeight === 'bold' ? 'normal' : 'bold' })}
          className={cn('p-1 rounded transition-colors', textSettings.fontWeight === 'bold' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white')}
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setTextSettings({ fontStyle: textSettings.fontStyle === 'italic' ? 'normal' : 'italic' })}
          className={cn('p-1 rounded transition-colors', textSettings.fontStyle === 'italic' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white')}
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
      </div>
      <BarSeparator />
      <input
        type="color"
        value={textSettings.color}
        onChange={(e) => setTextSettings({ color: e.target.value })}
        className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
      />
      <BarSeparator />
      <div className="flex items-center gap-0.5">
        {(['left', 'center', 'right'] as const).map((align) => (
          <button
            key={align}
            onClick={() => setTextSettings({ alignment: align })}
            className={cn('p-1 rounded transition-colors', textSettings.alignment === align ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white')}
          >
            {align === 'left' ? <AlignLeft className="w-3.5 h-3.5" /> : align === 'center' ? <AlignCenter className="w-3.5 h-3.5" /> : <AlignRight className="w-3.5 h-3.5" />}
          </button>
        ))}
      </div>
      <BarSeparator />
      <CompactSlider label="Line H" value={textSettings.lineHeight} min={0.5} max={3} step={0.1} onChange={(v) => setTextSettings({ lineHeight: v })} />
    </div>
  );
});
