/**
 * PreviewZoomControls — bottom zoom section bar for the editor preview.
 *
 * Layout:  [−]  [────── slider ──────]  [+]   [ 100 ]%   [Fit]
 * The slider is log-scaled so fit (100%) sits near the middle. The numeric
 * input lets the user type an exact ratio (zoom can go below fit, i.e. < 100%).
 */
import { memo, useEffect, useRef, useState } from 'react';
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface PreviewZoomControlsProps {
  zoom: number;
  min: number;
  max: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  /** Set an exact zoom ratio (1 = fit). */
  onSetZoom: (ratio: number) => void;
  /** Toggle preview fullscreen. */
  onFullscreen: () => void;
  className?: string;
}

const SLIDER_RES = 1000;

export const PreviewZoomControls = memo(function PreviewZoomControls({
  zoom,
  min,
  max,
  onZoomIn,
  onZoomOut,
  onFit,
  onSetZoom,
  onFullscreen,
  className,
}: PreviewZoomControlsProps) {
  // Log mapping between zoom ratio and the linear slider track.
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  const zoomToSlider = (z: number) =>
    Math.round(((Math.log(z) - logMin) / (logMax - logMin)) * SLIDER_RES);
  const sliderToZoom = (s: number) => Math.exp(logMin + (s / SLIDER_RES) * (logMax - logMin));

  const pct = Math.round(zoom * 100);

  // Editable text for the numeric input; synced from `zoom` unless the user is
  // mid-edit (focused).
  const [draft, setDraft] = useState(String(pct));
  const editingRef = useRef(false);
  useEffect(() => {
    if (!editingRef.current) setDraft(String(Math.round(zoom * 100)));
  }, [zoom]);

  const commitDraft = () => {
    editingRef.current = false;
    const parsed = parseFloat(draft.replace('%', '').trim());
    if (!Number.isNaN(parsed) && parsed > 0) {
      onSetZoom(Math.min(max, Math.max(min, parsed / 100)));
    } else {
      setDraft(String(Math.round(zoom * 100)));
    }
  };

  const isFit = Math.abs(zoom - 1) < 1e-3;

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 border-t border-white/10 text-white/80',
        className,
      )}
    >
      <button
        className="p-1 rounded hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
        title="Zoom out"
        onClick={onZoomOut}
        disabled={zoom <= min + 1e-4}
      >
        <ZoomOut className="w-4 h-4" />
      </button>

      <input
        type="range"
        min={0}
        max={SLIDER_RES}
        value={zoomToSlider(zoom)}
        onChange={(e) => onSetZoom(sliderToZoom(Number(e.target.value)))}
        className="flex-1 max-w-[260px] h-1 accent-blue-500 cursor-pointer"
        title="Zoom"
        aria-label="Zoom"
      />

      <button
        className="p-1 rounded hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
        title="Zoom in"
        onClick={onZoomIn}
        disabled={zoom >= max - 1e-4}
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          onFocus={() => {
            editingRef.current = true;
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              editingRef.current = false;
              setDraft(String(Math.round(zoom * 100)));
              e.currentTarget.blur();
            }
          }}
          className="w-12 px-1 py-0.5 text-xs font-mono tabular-nums text-right rounded bg-black/40 border border-white/10 focus:border-blue-500 outline-none"
          aria-label="Zoom percentage"
        />
        <span className="text-xs text-white/50">%</span>
      </div>

      <button
        className="px-2 py-0.5 text-xs rounded hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
        title="Fit to frame (100%)"
        onClick={onFit}
        disabled={isFit}
      >
        Fit
      </button>

      <div className="w-px h-4 bg-white/10" />

      <button
        className="p-1 rounded hover:bg-white/10 hover:text-white transition-colors"
        title="Fullscreen"
        onClick={onFullscreen}
      >
        <Maximize className="w-4 h-4" />
      </button>
    </div>
  );
});

export default PreviewZoomControls;
