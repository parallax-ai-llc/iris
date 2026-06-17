/**
 * FilterPanel - Filter presets grid with detailed adjustments
 */

import { memo, useCallback, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore, FILTER_PRESETS, DEFAULT_ADJUSTMENTS, type AdjustmentValues } from '@/features/image-editor/stores/imageEditor.store';
import { Check, ChevronDown, ChevronUp, RotateCcw, Layers } from 'lucide-react';
import * as F from '@/features/image-editor/canvas/filters';

interface PixelFilterItem {
  id: string;
  name: string;
  run: (d: ImageData) => ImageData;
  label: string;
}

interface PixelFilterGroup {
  heading: string;
  items: PixelFilterItem[];
}

const PIXEL_FILTER_GROUPS: PixelFilterGroup[] = [
  {
    heading: 'Blur',
    items: [
      { id: 'blur', name: 'Blur', label: 'Blur', run: (d) => F.blur(d) },
      { id: 'blurMore', name: 'Blur More', label: 'Blur More', run: (d) => F.blurMore(d) },
      { id: 'gaussianBlur', name: 'Gaussian', label: 'Gaussian Blur', run: (d) => F.gaussianBlur(d, 3) },
      { id: 'motionBlur', name: 'Motion', label: 'Motion Blur', run: (d) => F.motionBlur(d, 0, 10) },
      { id: 'boxBlur', name: 'Box', label: 'Box Blur', run: (d) => F.boxBlur(d, 3) },
    ],
  },
  {
    heading: 'Sharpen',
    items: [
      { id: 'sharpen', name: 'Sharpen', label: 'Sharpen', run: (d) => F.sharpen(d) },
      { id: 'sharpenMore', name: 'Sharpen More', label: 'Sharpen More', run: (d) => F.sharpenMore(d) },
      { id: 'unsharpMask', name: 'Unsharp', label: 'Unsharp Mask', run: (d) => F.unsharpMask(d, 1, 50, 0) },
    ],
  },
  {
    heading: 'Noise',
    items: [
      { id: 'addNoise', name: 'Add Noise', label: 'Add Noise', run: (d) => F.addNoise(d, 25) },
      { id: 'reduceNoise', name: 'Reduce Noise', label: 'Reduce Noise', run: (d) => F.reduceNoise(d, 5) },
      { id: 'median', name: 'Median', label: 'Median', run: (d) => F.median(d, 1) },
    ],
  },
  {
    heading: 'Stylize',
    items: [
      { id: 'pixelate', name: 'Pixelate', label: 'Pixelate', run: (d) => F.pixelate(d, 10) },
      { id: 'edgeDetect', name: 'Edge Detect', label: 'Edge Detect', run: (d) => F.edgeDetect(d) },
      { id: 'emboss', name: 'Emboss', label: 'Emboss', run: (d) => F.emboss(d) },
      { id: 'findEdges', name: 'Find Edges', label: 'Find Edges', run: (d) => F.findEdges(d) },
      { id: 'posterize', name: 'Posterize', label: 'Posterize', run: (d) => F.posterize(d, 4) },
      { id: 'solarize', name: 'Solarize', label: 'Solarize', run: (d) => F.solarize(d) },
      { id: 'glowingEdges', name: 'Glowing Edges', label: 'Glowing Edges', run: (d) => F.glowingEdges(d) },
    ],
  },
];

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  unit?: string;
}

const Slider = memo(function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  unit = '',
}: SliderProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">{label}</span>
        <span className="text-xs text-zinc-500 tabular-nums">
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
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
  );
});

export const FilterPanel = memo(function FilterPanel() {
  const {
    adjustments, activeFilterPreset, filterIntensity,
    applyFilterPreset, setFilterIntensity, setAdjustment, resetAdjustments, applyAdjustments,
    activeLayerId, layers, applyCanvasFilter,
  } = useImageEditorStore();
  const [showDetails, setShowDetails] = useState(false);

  const activeLayer = activeLayerId ? layers.find((l) => l.id === activeLayerId) : null;

  const handlePresetClick = useCallback((presetId: string) => {
    applyFilterPreset(presetId);
  }, [applyFilterPreset]);

  const handleIntensityChange = useCallback((value: number) => {
    setFilterIntensity(value);
  }, [setFilterIntensity]);

  const handleAdjustmentChange = useCallback((key: keyof AdjustmentValues, value: number) => {
    setAdjustment(key, value);
  }, [setAdjustment]);

  const isModified = Object.keys(adjustments).some(
    (key) => adjustments[key as keyof AdjustmentValues] !== DEFAULT_ADJUSTMENTS[key as keyof AdjustmentValues]
  );

  return (
    <div className="p-4 space-y-4">
      <p className="text-xs text-zinc-500">
        Select a filter preset to apply to your image.
      </p>

      {/* Target layer indicator */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-zinc-800/50">
        <Layers className="w-3 h-3 text-zinc-500 flex-shrink-0" />
        <span className="text-[10px] text-zinc-400 truncate">
          {activeLayer ? `Applies to: ${activeLayer.name}` : 'Applies to entire canvas'}
        </span>
      </div>

      {/* Filter grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {FILTER_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => handlePresetClick(preset.id)}
            className={cn(
              'relative rounded-lg overflow-hidden py-2.5 px-1',
              'border transition-all',
              activeFilterPreset === preset.id
                ? 'border-white/30 bg-zinc-700'
                : 'border-transparent bg-zinc-800 hover:border-zinc-700'
            )}
          >
            {activeFilterPreset === preset.id && (
              <div className="absolute top-1 right-1">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
            <span className="text-[10px] text-zinc-300 font-medium">
              {preset.name}
            </span>
          </button>
        ))}
      </div>

      {/* Pixel filters section (real pixel-level filters from filters.ts) */}
      <div className="space-y-3 pt-3 border-t border-zinc-800">
        <h3 className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
          Pixel Filters
        </h3>
        {PIXEL_FILTER_GROUPS.map((group) => (
          <div key={group.heading} className="space-y-1.5">
            <h4 className="text-[9px] font-medium text-zinc-600 uppercase tracking-wider">
              {group.heading}
            </h4>
            <div className="grid grid-cols-3 gap-1.5">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => applyCanvasFilter(item.run, item.label)}
                  className={cn(
                    'relative rounded-lg overflow-hidden py-2 px-1',
                    'border border-transparent bg-zinc-800 hover:border-zinc-700 transition-all'
                  )}
                  title={item.label}
                >
                  <span className="text-[10px] text-zinc-300 font-medium">
                    {item.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Intensity slider */}
      {activeFilterPreset !== 'none' && (
        <div className="space-y-2 pt-3 border-t border-zinc-800">
          <Slider
            label="Intensity"
            value={filterIntensity}
            min={0}
            max={100}
            onChange={handleIntensityChange}
            unit="%"
          />
        </div>
      )}

      {/* Detail adjustments toggle */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="w-full flex items-center justify-between px-1 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
      >
        <span className="font-medium uppercase tracking-wider">Fine Tune</span>
        {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {/* Detail sliders */}
      {showDetails && (
        <div className="space-y-5">
          {/* Reset */}
          {isModified && (
            <button
              onClick={resetAdjustments}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg',
                'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700',
                'text-xs transition-colors'
              )}
            >
              <RotateCcw className="w-3 h-3" />
              Reset All
            </button>
          )}

          {/* Light */}
          <div className="space-y-2.5">
            <h3 className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Light</h3>
            <Slider label="Exposure" value={adjustments.exposure} min={-100} max={100} onChange={(v) => handleAdjustmentChange('exposure', v)} />
            <Slider label="Brightness" value={adjustments.brightness} min={-100} max={100} onChange={(v) => handleAdjustmentChange('brightness', v)} />
            <Slider label="Contrast" value={adjustments.contrast} min={-100} max={100} onChange={(v) => handleAdjustmentChange('contrast', v)} />
            <Slider label="Highlights" value={adjustments.highlights} min={-100} max={100} onChange={(v) => handleAdjustmentChange('highlights', v)} />
            <Slider label="Shadows" value={adjustments.shadows} min={-100} max={100} onChange={(v) => handleAdjustmentChange('shadows', v)} />
            <Slider label="Gamma" value={adjustments.gamma} min={0.1} max={3} step={0.1} onChange={(v) => handleAdjustmentChange('gamma', v)} />
          </div>

          {/* Color */}
          <div className="space-y-2.5">
            <h3 className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Color</h3>
            <Slider label="Temperature" value={adjustments.temperature} min={-100} max={100} onChange={(v) => handleAdjustmentChange('temperature', v)} />
            <Slider label="Tint" value={adjustments.tint} min={-100} max={100} onChange={(v) => handleAdjustmentChange('tint', v)} />
            <Slider label="Saturation" value={adjustments.saturation} min={-100} max={100} onChange={(v) => handleAdjustmentChange('saturation', v)} />
            <Slider label="Vibrance" value={adjustments.vibrance} min={-100} max={100} onChange={(v) => handleAdjustmentChange('vibrance', v)} />
            <Slider label="Hue" value={adjustments.hue} min={0} max={360} onChange={(v) => handleAdjustmentChange('hue', v)} unit="°" />
          </div>

          {/* Detail */}
          <div className="space-y-2.5">
            <h3 className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Detail</h3>
            <Slider label="Clarity" value={adjustments.clarity} min={-100} max={100} onChange={(v) => handleAdjustmentChange('clarity', v)} />
          </div>
        </div>
      )}

      {/* Apply button */}
      <button
        onClick={applyAdjustments}
        disabled={!isModified}
        className={cn(
          'w-full px-4 py-2.5 rounded-lg text-sm font-medium',
          'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white',
          'transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        Apply Filter
      </button>
    </div>
  );
});

export default FilterPanel;
