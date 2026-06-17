/**
 * SelectionOptions - Selection tool options for Options Bar
 */

import { memo, useCallback, useState, useRef } from 'react';
import { XCircle, RefreshCw, Scan, SlidersHorizontal, Paintbrush, Square, Plus, Minus, Combine } from 'lucide-react';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { CompactSlider, ActionButton, BarSeparator } from '../shared';
import { cn } from '@/shared/lib/utils';
import { toast } from '@/shared/lib/toast';

const SELECTION_MODES = [
  { mode: 'new' as const, icon: Square, title: 'New Selection', shortcut: '' },
  { mode: 'add' as const, icon: Plus, title: 'Add to Selection (Shift)', shortcut: 'Shift' },
  { mode: 'subtract' as const, icon: Minus, title: 'Subtract from Selection (Alt)', shortcut: 'Alt' },
  { mode: 'intersect' as const, icon: Combine, title: 'Intersect with Selection (Shift+Alt)', shortcut: 'Shift+Alt' },
] as const;

export const SelectionOptions = memo(function SelectionOptions() {
  const {
    selectionTool,
    selection,
    selectionMode,
    setSelectionMode,
    clearSelection,
    invertSelection,
    selectSubject,
    contentAwareFill,
    refineEdge,
    isProcessing,
    sourceAsset,
    selectionFeather,
    setSelectionFeather,
    selectionAntiAlias,
    setSelectionAntiAlias,
    selectionContiguous,
    setSelectionContiguous,
    quickSelectBrushSize,
    setQuickSelectBrushSize,
    colorRangeColor,
    colorRangeTolerance,
    colorRangeFuzziness,
    setColorRangeTolerance,
    setColorRangeFuzziness,
  } = useImageEditorStore();

  const [showRefinePanel, setShowRefinePanel] = useState(false);
  const refineBtnRef = useRef<HTMLDivElement>(null);
  const [refineRadius, setRefineRadius] = useState(3);
  const [refineSmoothing, setRefineSmoothing] = useState(3);
  const [refineFeather, setRefineFeather] = useState(0);
  const [refineContrast, setRefineContrast] = useState(0);

  const handleSelectSubject = useCallback(() => {
    selectSubject().catch((err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Subject selection failed');
    });
  }, [selectSubject]);

  const handleContentAwareFill = useCallback(() => {
    contentAwareFill().catch((err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Content-Aware Fill failed');
    });
  }, [contentAwareFill]);

  const handleApplyRefineEdge = useCallback(() => {
    void (refineEdge as (o: { radius: number; smoothing: number; feather: number; contrast: number }) => void | Promise<void>)({
      radius: refineRadius,
      smoothing: refineSmoothing,
      feather: refineFeather,
      contrast: refineContrast,
    });
    setShowRefinePanel(false);
  }, [refineEdge, refineRadius, refineSmoothing, refineFeather, refineContrast]);

  return (
    <div className="relative flex items-center gap-2">
      {/* Selection mode toggle: New / Add / Subtract / Intersect */}
      <div className="flex items-center gap-0.5 bg-zinc-800 rounded p-0.5">
        {SELECTION_MODES.map(({ mode, icon: Icon, title }) => (
          <button
            key={mode}
            onClick={() => setSelectionMode(mode)}
            className={cn(
              'p-1 rounded transition-colors',
              selectionMode === mode
                ? 'bg-white/15 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            )}
            title={title}
          >
            <Icon className="w-3 h-3" />
          </button>
        ))}
      </div>
      <BarSeparator />
      <CompactSlider label="Feather" value={selectionFeather} min={0} max={50} onChange={setSelectionFeather} unit="px" />
      <button
        onClick={() => setSelectionAntiAlias(!selectionAntiAlias)}
        className={cn(
          'px-2 py-1 rounded text-[10px] font-medium transition-colors',
          selectionAntiAlias
            ? 'bg-white/10 text-white border border-white/20'
            : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
        )}
        title="Anti-aliasing"
      >
        AA
      </button>
      {selectionTool === 'magicWand' && (
        <>
          <CompactSlider label="Tolerance" value={32} min={0} max={255} onChange={() => {}} />
          <button
            onClick={() => setSelectionContiguous(!selectionContiguous)}
            className={cn(
              'px-2 py-1 rounded text-[10px] font-medium transition-colors',
              selectionContiguous
                ? 'bg-white/10 text-white border border-white/20'
                : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
            )}
            title="Contiguous - Only select connected pixels"
          >
            Contiguous
          </button>
        </>
      )}
      {selectionTool === 'quickSelect' && (
        <CompactSlider label="Brush Size" value={quickSelectBrushSize} min={1} max={200} onChange={setQuickSelectBrushSize} unit="px" />
      )}
      {selectionTool === 'colorRange' && (
        <>
          <CompactSlider label="Tolerance" value={colorRangeTolerance} min={0} max={255} onChange={setColorRangeTolerance} />
          <CompactSlider label="Fuzziness" value={colorRangeFuzziness} min={0} max={100} onChange={setColorRangeFuzziness} />
          {colorRangeColor && (
            <div className="flex items-center gap-1.5 px-1">
              <div
                className="w-4 h-4 rounded border border-zinc-600"
                style={{ backgroundColor: colorRangeColor }}
                title={`Sampled: ${colorRangeColor}`}
              />
              <span className="text-[10px] text-zinc-400 font-mono">{colorRangeColor}</span>
            </div>
          )}
        </>
      )}
      <BarSeparator />
      <ActionButton
        icon={<Scan className="w-3 h-3" />}
        label={isProcessing ? 'Selecting...' : 'Select Subject'}
        onClick={handleSelectSubject}
        disabled={isProcessing || !sourceAsset}
        iconOnly
      />
      {selection && (
        <>
          <BarSeparator />
          <div ref={refineBtnRef}>
            <ActionButton
              icon={<SlidersHorizontal className="w-3 h-3" />}
              label="Refine Edge"
              onClick={() => setShowRefinePanel(v => !v)}
              variant={showRefinePanel ? 'primary' : 'default'}
              iconOnly
            />
          </div>
          <ActionButton
            icon={<Paintbrush className="w-3 h-3" />}
            label={isProcessing ? 'Filling...' : 'Content-Aware Fill'}
            onClick={handleContentAwareFill}
            disabled={isProcessing || !sourceAsset}
            iconOnly
          />
          <ActionButton icon={<RefreshCw className="w-3 h-3" />} label="Invert" onClick={invertSelection} iconOnly />
          <ActionButton icon={<XCircle className="w-3 h-3" />} label="Deselect" onClick={clearSelection} iconOnly />
        </>
      )}

      {/* Refine Edge dropdown panel — fixed to escape overflow-hidden parents */}
      {showRefinePanel && selection && (
        <div
          className={cn(
            'fixed z-50',
            'bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-4 w-64 space-y-3',
          )}
          style={refineBtnRef.current ? (() => {
            const r = refineBtnRef.current!.getBoundingClientRect();
            return { top: r.bottom + 8, left: r.left + r.width / 2 - 128 };
          })() : undefined}
        >
          <div className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Refine Edge</div>

          <CompactSlider
            label="Radius"
            value={refineRadius}
            min={0}
            max={50}
            onChange={setRefineRadius}
            unit="px"
          />
          <CompactSlider
            label="Smooth"
            value={refineSmoothing}
            min={0}
            max={10}
            onChange={setRefineSmoothing}
          />
          <CompactSlider
            label="Feather"
            value={refineFeather}
            min={0}
            max={50}
            onChange={setRefineFeather}
            unit="px"
          />
          <CompactSlider
            label="Contrast"
            value={refineContrast}
            min={0}
            max={100}
            onChange={setRefineContrast}
          />

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleApplyRefineEdge}
              className="flex-1 px-3 py-1.5 rounded-md bg-white text-black text-xs font-medium hover:bg-zinc-200 transition-colors"
            >
              Apply
            </button>
            <button
              onClick={() => setShowRefinePanel(false)}
              className="flex-1 px-3 py-1.5 rounded-md bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
