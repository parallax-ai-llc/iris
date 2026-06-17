/**
 * FilterOptions - Filter preset options for Options Bar (horizontal scroll)
 */

import { memo, useCallback } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore, FILTER_PRESETS } from '@/features/image-editor/stores/imageEditor.store';
import { BarSeparator } from '../shared';

export const FilterOptions = memo(function FilterOptions() {
  const { activeFilterPreset, filterIntensity, applyFilterPreset, setFilterIntensity } = useImageEditorStore();

  const handlePresetClick = useCallback((presetId: string) => {
    applyFilterPreset(presetId);
  }, [applyFilterPreset]);

  const handleIntensityChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterIntensity(Number(e.target.value));
  }, [setFilterIntensity]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-zinc-400 whitespace-nowrap">Filter:</span>
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
        {FILTER_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => handlePresetClick(preset.id)}
            className={cn(
              'px-2.5 py-1 rounded-md text-[11px] whitespace-nowrap transition-colors flex-shrink-0',
              activeFilterPreset === preset.id
                ? 'bg-white/10 text-white border border-white/20'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
            )}
          >
            {preset.name}
          </button>
        ))}
      </div>
      {activeFilterPreset !== 'none' && (
        <>
          <BarSeparator />
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] text-zinc-500 whitespace-nowrap">Intensity</span>
            <input
              type="range"
              min={0}
              max={100}
              value={filterIntensity}
              onChange={handleIntensityChange}
              className="w-20 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-2.5
                [&::-webkit-slider-thumb]:h-2.5
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-white
                [&::-webkit-slider-thumb]:cursor-pointer"
            />
            <span className="text-[10px] text-zinc-500 tabular-nums w-7">{filterIntensity}%</span>
          </div>
        </>
      )}
    </div>
  );
});
