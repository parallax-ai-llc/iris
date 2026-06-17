/**
 * AdjustOptions - Adjustment tool options for Options Bar
 * Shows key sliders with a "More" popover for all adjustments
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { RotateCcw, ChevronDown } from 'lucide-react';
import { useImageEditorStore, type AdjustmentValues, DEFAULT_ADJUSTMENTS } from '@/features/image-editor/stores/imageEditor.store';
import { CompactSlider, ActionButton, BarSeparator } from '../shared';

export const AdjustOptions = memo(function AdjustOptions() {
  const { adjustments, setAdjustment, resetAdjustments } = useImageEditorStore();
  const [showMore, setShowMore] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const isModified = Object.keys(adjustments).some(
    (key) => adjustments[key as keyof AdjustmentValues] !== DEFAULT_ADJUSTMENTS[key as keyof AdjustmentValues]
  );

  const handleChange = useCallback((key: keyof AdjustmentValues, value: number) => {
    setAdjustment(key, value);
  }, [setAdjustment]);

  // Close popover on outside click
  useEffect(() => {
    if (!showMore) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowMore(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMore]);

  return (
    <div className="flex items-center gap-2">
      <CompactSlider label="Brightness" value={adjustments.brightness} min={-100} max={100} onChange={(v) => handleChange('brightness', v)} />
      <CompactSlider label="Contrast" value={adjustments.contrast} min={-100} max={100} onChange={(v) => handleChange('contrast', v)} />
      <CompactSlider label="Saturation" value={adjustments.saturation} min={-100} max={100} onChange={(v) => handleChange('saturation', v)} />
      <BarSeparator />

      {/* More adjustments dropdown */}
      <div className="relative" ref={popoverRef}>
        <button
          onClick={() => setShowMore((v) => !v)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
        >
          More
          <ChevronDown className="w-3 h-3" />
        </button>

        {showMore && (
          <div
            className="fixed w-64 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-3 space-y-2 z-50"
            style={popoverRef.current ? (() => {
              const r = popoverRef.current!.getBoundingClientRect();
              return { top: r.bottom + 4, left: r.left };
            })() : undefined}
          >
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">All Adjustments</div>
            <CompactSlider label="Exposure" value={adjustments.exposure} min={-100} max={100} onChange={(v) => handleChange('exposure', v)} width="w-20" />
            <CompactSlider label="Highlights" value={adjustments.highlights} min={-100} max={100} onChange={(v) => handleChange('highlights', v)} width="w-20" />
            <CompactSlider label="Shadows" value={adjustments.shadows} min={-100} max={100} onChange={(v) => handleChange('shadows', v)} width="w-20" />
            <CompactSlider label="Gamma" value={adjustments.gamma} min={0.1} max={3} step={0.1} onChange={(v) => handleChange('gamma', v)} width="w-20" />
            <CompactSlider label="Temperature" value={adjustments.temperature} min={-100} max={100} onChange={(v) => handleChange('temperature', v)} width="w-20" />
            <CompactSlider label="Tint" value={adjustments.tint} min={-100} max={100} onChange={(v) => handleChange('tint', v)} width="w-20" />
            <CompactSlider label="Vibrance" value={adjustments.vibrance} min={-100} max={100} onChange={(v) => handleChange('vibrance', v)} width="w-20" />
            <CompactSlider label="Hue" value={adjustments.hue} min={0} max={360} onChange={(v) => handleChange('hue', v)} unit="°" width="w-20" />
            <CompactSlider label="Clarity" value={adjustments.clarity} min={-100} max={100} onChange={(v) => handleChange('clarity', v)} width="w-20" />
          </div>
        )}
      </div>

      {isModified && (
        <>
          <BarSeparator />
          <ActionButton icon={<RotateCcw className="w-3 h-3" />} label="Reset" onClick={resetAdjustments} />
        </>
      )}
    </div>
  );
});
