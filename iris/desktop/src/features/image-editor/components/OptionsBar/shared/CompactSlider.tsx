/**
 * CompactSlider - Compact number input with dropdown slider for Options Bar
 * Default: [Label] [value▾] — click ▾ to open slider dropdown
 */

import { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';

interface CompactSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  unit?: string;
  /** @deprecated No longer used — kept for backward compatibility */
  width?: string;
}

export const CompactSlider = memo(function CompactSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  unit = '',
}: CompactSliderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(String(step < 1 ? value.toFixed(1) : value));
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync input display when value changes externally (e.g. slider drag)
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setInputValue(String(step < 1 ? value.toFixed(1) : value));
    }
  }, [value, step]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const clamp = useCallback(
    (v: number) => Math.min(max, Math.max(min, v)),
    [min, max]
  );

  const commitInput = useCallback(() => {
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) {
      const clamped = clamp(parsed);
      onChange(step < 1 ? clamped : Math.round(clamped));
    }
    // Reset display to current value
    setInputValue(String(step < 1 ? value.toFixed(1) : value));
  }, [inputValue, clamp, onChange, step, value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        commitInput();
        inputRef.current?.blur();
      } else if (e.key === 'Escape') {
        setInputValue(String(step < 1 ? value.toFixed(1) : value));
        inputRef.current?.blur();
      }
      // Prevent editor keyboard shortcuts from firing while typing
      e.stopPropagation();
    },
    [commitInput, step, value]
  );

  // Compute fixed position for dropdown so it works inside overflow-hidden parents
  const dropdownStyle = useMemo(() => {
    if (!isOpen || !containerRef.current) return undefined;
    const rect = containerRef.current.getBoundingClientRect();
    return { top: rect.bottom + 4, left: rect.left } as React.CSSProperties;
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative flex items-center gap-1.5">
      <span className="text-[11px] text-zinc-400 whitespace-nowrap">{label}</span>
      <div className="flex items-center bg-zinc-800 border border-zinc-700 rounded h-[22px]">
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={commitInput}
          onKeyDown={handleKeyDown}
          onFocus={(e) => e.target.select()}
          className="w-10 bg-transparent text-[11px] text-zinc-300 tabular-nums text-right px-1 py-0 outline-none border-none"
        />
        {unit && (
          <span className="text-[10px] text-zinc-500 pr-0.5">{unit}</span>
        )}
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="flex items-center justify-center w-4 h-full border-l border-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      {/* Slider dropdown — fixed position to escape overflow-hidden parents */}
      {isOpen && (
        <div
          className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg p-2.5 flex items-center gap-2"
          style={dropdownStyle}
        >
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-32 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-2.5
              [&::-webkit-slider-thumb]:h-2.5
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-white
              [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <span className="text-[10px] text-zinc-500 tabular-nums min-w-[28px] text-right whitespace-nowrap">
            {step < 1 ? value.toFixed(1) : value}{unit}
          </span>
        </div>
      )}
    </div>
  );
});
