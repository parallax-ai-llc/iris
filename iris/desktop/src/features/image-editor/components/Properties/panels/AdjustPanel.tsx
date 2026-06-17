/**
 * AdjustPanel - Brightness, contrast, saturation, etc.
 */

import { memo, useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  useImageEditorStore, AdjustmentValues, DEFAULT_ADJUSTMENTS,
  LevelsValues, DEFAULT_LEVELS, CurvePoint, CurvesValues,
  ColorBalanceValues, ColorBalanceTone, DEFAULT_COLOR_BALANCE,
  HueSatChannelsValues, HueSatChannel, HueSatTone, DEFAULT_HUE_SAT_CHANNELS,
} from '@/features/image-editor/stores/imageEditor.store';
import { computeHistogram } from '@/features/image-editor/canvas/filters';

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
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:transition-transform
          [&::-webkit-slider-thumb]:hover:scale-110"
      />
    </div>
  );
});

// ==================== Histogram ====================

const HistogramBar = memo(function HistogramBar({ histogram }: { histogram: Uint32Array | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !histogram) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const max = Math.max(1, ...Array.from(histogram));
    ctx.fillStyle = 'rgba(160,160,160,0.7)';
    for (let i = 0; i < 256; i++) {
      const x = Math.floor((i / 255) * (W - 1));
      const h = Math.round((histogram[i] / max) * H);
      ctx.fillRect(x, H - h, Math.max(1, W / 256), h);
    }
  }, [histogram]);

  return (
    <canvas
      ref={canvasRef}
      width={256}
      height={48}
      className="w-full h-12 rounded bg-zinc-900"
    />
  );
});

// ==================== Levels Panel ====================

interface LevelsPanelProps {
  levels: LevelsValues;
  onChange: (levels: LevelsValues) => void;
  histogram: Uint32Array | null;
}

const LevelsPanel = memo(function LevelsPanel({ levels, onChange, histogram }: LevelsPanelProps) {
  const set = useCallback((key: keyof LevelsValues, value: number) => {
    onChange({ ...levels, [key]: value });
  }, [levels, onChange]);

  return (
    <div className="space-y-2">
      <HistogramBar histogram={histogram} />
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>Input</span>
          <span className="text-zinc-500">{levels.inputBlack} — {levels.inputWhite}</span>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 space-y-0.5">
            <span className="text-[10px] text-zinc-500">Black</span>
            <input type="range" min={0} max={253} value={levels.inputBlack}
              onChange={(e) => set('inputBlack', Math.min(Number(e.target.value), levels.inputWhite - 2))}
              className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer" />
          </div>
          <div className="flex-1 space-y-0.5">
            <span className="text-[10px] text-zinc-500">Gamma</span>
            <input type="range" min={10} max={999} value={Math.round(levels.gamma * 100)}
              onChange={(e) => set('gamma', Number(e.target.value) / 100)}
              className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-400 [&::-webkit-slider-thumb]:cursor-pointer" />
          </div>
          <div className="flex-1 space-y-0.5">
            <span className="text-[10px] text-zinc-500">White</span>
            <input type="range" min={2} max={255} value={levels.inputWhite}
              onChange={(e) => set('inputWhite', Math.max(Number(e.target.value), levels.inputBlack + 2))}
              className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer" />
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>Output</span>
          <span className="text-zinc-500">{levels.outputBlack} — {levels.outputWhite}</span>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 space-y-0.5">
            <span className="text-[10px] text-zinc-500">Black</span>
            <input type="range" min={0} max={253} value={levels.outputBlack}
              onChange={(e) => set('outputBlack', Math.min(Number(e.target.value), levels.outputWhite - 2))}
              className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer" />
          </div>
          <div className="flex-1 space-y-0.5">
            <span className="text-[10px] text-zinc-500">White</span>
            <input type="range" min={2} max={255} value={levels.outputWhite}
              onChange={(e) => set('outputWhite', Math.max(Number(e.target.value), levels.outputBlack + 2))}
              className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer" />
          </div>
        </div>
      </div>
    </div>
  );
});

// ==================== Curves Panel ====================

const CHANNEL_LABELS = ['RGB', 'Red', 'Green', 'Blue'];
const CHANNEL_COLORS = ['#ffffff', '#f87171', '#4ade80', '#60a5fa'];
const DEFAULT_CURVE: CurvePoint[] = [{ x: 0, y: 0 }, { x: 255, y: 255 }];

interface CurvesPanelProps {
  curves: CurvesValues;
  onChange: (curves: CurvesValues) => void;
}

const CurvesPanel = memo(function CurvesPanel({ curves, onChange }: CurvesPanelProps) {
  const [channel, setChannel] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const SIZE = 160;
  const PAD = 8;
  const INNER = SIZE - PAD * 2;

  const pts = curves[channel] ?? DEFAULT_CURVE;

  const toSvg = useCallback((p: CurvePoint) => ({
    x: PAD + (p.x / 255) * INNER,
    y: PAD + ((255 - p.y) / 255) * INNER,
  }), [INNER, PAD]);

  const fromSvg = useCallback((sx: number, sy: number): CurvePoint => ({
    x: Math.round(Math.max(0, Math.min(255, ((sx - PAD) / INNER) * 255))),
    y: Math.round(Math.max(0, Math.min(255, ((INNER - (sy - PAD)) / INNER) * 255))),
  }), [INNER, PAD]);

  // Build SVG path from points (sorted by x)
  const sortedPts = [...pts].sort((a, b) => a.x - b.x);
  const pathD = sortedPts.map((p, i) => {
    const { x, y } = toSvg(p);
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = (e.clientX - rect.left) * (SIZE / rect.width);
    const sy = (e.clientY - rect.top) * (SIZE / rect.height);
    const np = fromSvg(sx, sy);
    // Don't add if close to existing point
    if (pts.some(p => Math.abs(p.x - np.x) < 8)) return;
    const newPts = [...pts, np];
    const newCurves = [...curves];
    newCurves[channel] = newPts;
    onChange(newCurves);
  }, [pts, curves, channel, onChange, fromSvg]);

  const handleDrag = useCallback((idx: number, e: React.MouseEvent<SVGCircleElement>) => {
    e.stopPropagation();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scaleX = SIZE / rect.width;
    const scaleY = SIZE / rect.height;

    const onMove = (me: MouseEvent) => {
      const sx = (me.clientX - rect.left) * scaleX;
      const sy = (me.clientY - rect.top) * scaleY;
      const np = fromSvg(sx, sy);
      const newPts = [...pts];
      newPts[idx] = np;
      const newCurves = [...curves];
      newCurves[channel] = newPts;
      onChange(newCurves);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pts, curves, channel, onChange, fromSvg]);

  const handleDblClick = useCallback((idx: number, e: React.MouseEvent<SVGCircleElement>) => {
    e.stopPropagation();
    if (pts.length <= 2) return; // keep at least 2 points
    const newPts = pts.filter((_, i) => i !== idx);
    const newCurves = [...curves];
    newCurves[channel] = newPts;
    onChange(newCurves);
  }, [pts, curves, channel, onChange]);

  const resetChannel = useCallback(() => {
    const newCurves = [...curves];
    newCurves[channel] = DEFAULT_CURVE;
    onChange(newCurves);
  }, [curves, channel, onChange]);

  return (
    <div className="space-y-2">
      {/* Channel tabs */}
      <div className="flex gap-1">
        {CHANNEL_LABELS.map((label, i) => (
          <button
            key={i}
            onClick={() => setChannel(i)}
            className={cn(
              'flex-1 text-[10px] py-0.5 rounded transition-colors',
              channel === i
                ? 'bg-zinc-600 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            )}
            style={{ color: channel === i ? CHANNEL_COLORS[i] : undefined }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Curve SVG editor */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full aspect-square rounded bg-zinc-900 cursor-crosshair select-none"
        onClick={handleSvgClick}
      >
        {/* Grid */}
        {[64, 128, 192].map(v => {
          const gx = PAD + (v / 255) * INNER;
          const gy = PAD + (v / 255) * INNER;
          return (
            <g key={v} stroke="#333" strokeWidth="0.5">
              <line x1={gx} y1={PAD} x2={gx} y2={PAD + INNER} />
              <line x1={PAD} y1={gy} x2={PAD + INNER} y2={gy} />
            </g>
          );
        })}
        {/* Diagonal reference */}
        <line x1={PAD} y1={PAD + INNER} x2={PAD + INNER} y2={PAD} stroke="#444" strokeWidth="0.5" strokeDasharray="4 4" />
        {/* Curve line */}
        <path d={pathD} fill="none" stroke={CHANNEL_COLORS[channel]} strokeWidth="1.5" />
        {/* Control points */}
        {pts.map((p, i) => {
          const { x, y } = toSvg(p);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={4}
              fill={CHANNEL_COLORS[channel]}
              stroke="#111"
              strokeWidth="1"
              className="cursor-move"
              onMouseDown={(e) => handleDrag(i, e)}
              onDoubleClick={(e) => handleDblClick(i, e)}
            />
          );
        })}
      </svg>
      <div className="text-[10px] text-zinc-600">Click to add point · Double-click to remove</div>
      <button onClick={resetChannel} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
        Reset {CHANNEL_LABELS[channel]}
      </button>
    </div>
  );
});

// ==================== Color Balance Panel ====================

const CB_TONES: Array<{ key: keyof ColorBalanceValues; label: string }> = [
  { key: 'shadows', label: 'Shadows' },
  { key: 'midtones', label: 'Midtones' },
  { key: 'highlights', label: 'Highlights' },
];

interface ColorBalancePanelProps {
  value: ColorBalanceValues;
  onChange: (v: ColorBalanceValues) => void;
}

const ColorBalancePanel = memo(function ColorBalancePanel({ value, onChange }: ColorBalancePanelProps) {
  const [tone, setTone] = useState<keyof ColorBalanceValues>('midtones');

  const current = value[tone] as ColorBalanceTone;
  const set = useCallback((k: keyof ColorBalanceTone, v: number) => {
    onChange({ ...value, [tone]: { ...current, [k]: v } });
  }, [value, tone, current, onChange]);

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {CB_TONES.map(t => (
          <button key={t.key as string} onClick={() => setTone(t.key)}
            className={cn('flex-1 text-[10px] py-0.5 rounded transition-colors',
              tone === t.key ? 'bg-zinc-600 text-white' : 'text-zinc-500 hover:text-zinc-300')}>
            {t.label}
          </button>
        ))}
      </div>
      {(['cyan', 'magenta', 'yellow'] as const).map((k) => {
        const labels: Record<string, [string, string]> = {
          cyan: ['Cyan', 'Red'],
          magenta: ['Magenta', 'Green'],
          yellow: ['Yellow', 'Blue'],
        };
        const [left, right] = labels[k];
        return (
          <div key={k} className="space-y-0.5">
            <div className="flex justify-between text-[10px] text-zinc-500">
              <span>{left}</span>
              <span className="tabular-nums">{current[k] > 0 ? '+' : ''}{current[k]}</span>
              <span>{right}</span>
            </div>
            <input type="range" min={-100} max={100} value={current[k]}
              onChange={e => set(k, Number(e.target.value))}
              className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer" />
          </div>
        );
      })}
      <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
        <input type="checkbox" checked={value.preserveLuminosity}
          onChange={e => onChange({ ...value, preserveLuminosity: e.target.checked })}
          className="rounded" />
        Preserve Luminosity
      </label>
    </div>
  );
});

// ==================== Hue/Sat Channels Panel ====================

const HSL_CHANNELS: HueSatChannel[] = ['master', 'reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas'];
const HSL_CHANNEL_LABELS: Record<HueSatChannel, string> = {
  master: 'Master', reds: 'Reds', yellows: 'Yellows', greens: 'Greens',
  cyans: 'Cyans', blues: 'Blues', magentas: 'Magentas',
};

interface HueSatPanelProps {
  value: HueSatChannelsValues;
  onChange: (v: HueSatChannelsValues) => void;
}

const HueSatPanel = memo(function HueSatPanel({ value, onChange }: HueSatPanelProps) {
  const [channel, setChannel] = useState<HueSatChannel>('master');
  const current = value[channel];
  const set = useCallback((k: keyof HueSatTone, v: number) => {
    onChange({ ...value, [channel]: { ...current, [k]: v } });
  }, [value, channel, current, onChange]);

  return (
    <div className="space-y-2">
      <select value={channel} onChange={e => setChannel(e.target.value as HueSatChannel)}
        className="w-full px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-xs text-white">
        {HSL_CHANNELS.map(c => (
          <option key={c} value={c}>{HSL_CHANNEL_LABELS[c]}</option>
        ))}
      </select>
      {([
        { key: 'hue', label: 'Hue', min: -180, max: 180, unit: '°' },
        { key: 'saturation', label: 'Saturation', min: -100, max: 100, unit: '%' },
        { key: 'lightness', label: 'Lightness', min: -100, max: 100, unit: '%' },
      ] as const).map(({ key, label, min, max, unit }) => (
        <div key={key} className="space-y-0.5">
          <div className="flex justify-between text-[10px] text-zinc-500">
            <span>{label}</span>
            <span className="tabular-nums">{current[key] > 0 ? '+' : ''}{current[key]}{unit}</span>
          </div>
          <input type="range" min={min} max={max} value={current[key]}
            onChange={e => set(key, Number(e.target.value))}
            className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer" />
        </div>
      ))}
    </div>
  );
});

export const AdjustPanel = memo(function AdjustPanel() {
  const { adjustments, setAdjustment, setAdjustments, resetAdjustments, applyAdjustments, activeLayerId, layers } = useImageEditorStore();
  const [levelsOpen, setLevelsOpen] = useState(false);

  const handleChange = useCallback((key: keyof AdjustmentValues, value: number) => {
    setAdjustment(key, value);
  }, [setAdjustment]);

  const handleLevelsChange = useCallback((lv: LevelsValues) => {
    setAdjustments({ levels: lv });
  }, [setAdjustments]);

  const [curvesOpen, setCurvesOpen] = useState(false);
  const handleCurvesChange = useCallback((cv: CurvesValues) => {
    setAdjustments({ curves: cv });
  }, [setAdjustments]);

  const DEFAULT_CURVES: CurvesValues = [
    DEFAULT_CURVE, DEFAULT_CURVE, DEFAULT_CURVE, DEFAULT_CURVE,
  ];

  const [colorBalanceOpen, setColorBalanceOpen] = useState(false);
  const handleColorBalanceChange = useCallback((v: ColorBalanceValues) => {
    setAdjustments({ colorBalance: v });
  }, [setAdjustments]);

  const [hueSatOpen, setHueSatOpen] = useState(false);
  const handleHueSatChange = useCallback((v: HueSatChannelsValues) => {
    setAdjustments({ hueSatChannels: v });
  }, [setAdjustments]);

  // Compute histogram from active layer
  const histogram = useMemo<Uint32Array | null>(() => {
    if (!levelsOpen) return null;
    const layer = layers.find(l => l.id === activeLayerId);
    if (!layer?.imageData) return null;
    try {
      const img = new Image();
      img.src = layer.imageData;
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 1;
      canvas.height = img.naturalHeight || 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return computeHistogram(imageData);
    } catch {
      return null;
    }
  }, [levelsOpen, activeLayerId, layers]);

  const isModified = Object.keys(adjustments).some((key) => {
    if (key === 'levels') return adjustments.levels !== null;
    if (key === 'curves') return adjustments.curves !== null;
    if (key === 'colorBalance') return adjustments.colorBalance !== null;
    if (key === 'hueSatChannels') return adjustments.hueSatChannels !== null;
    return adjustments[key as keyof AdjustmentValues] !== DEFAULT_ADJUSTMENTS[key as keyof AdjustmentValues];
  });

  return (
    <div className="p-4 space-y-6">
      {/* Reset button */}
      {isModified && (
        <button
          onClick={resetAdjustments}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg',
            'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700',
            'text-xs transition-colors'
          )}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset All
        </button>
      )}

      {/* Light section */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Light
        </h3>
        <Slider
          label="Exposure"
          value={adjustments.exposure}
          min={-100}
          max={100}
          onChange={(v) => handleChange('exposure', v)}
        />
        <Slider
          label="Brightness"
          value={adjustments.brightness}
          min={-100}
          max={100}
          onChange={(v) => handleChange('brightness', v)}
        />
        <Slider
          label="Contrast"
          value={adjustments.contrast}
          min={-100}
          max={100}
          onChange={(v) => handleChange('contrast', v)}
        />
        <Slider
          label="Highlights"
          value={adjustments.highlights}
          min={-100}
          max={100}
          onChange={(v) => handleChange('highlights', v)}
        />
        <Slider
          label="Shadows"
          value={adjustments.shadows}
          min={-100}
          max={100}
          onChange={(v) => handleChange('shadows', v)}
        />
        <Slider
          label="Gamma"
          value={adjustments.gamma}
          min={0.1}
          max={3}
          step={0.1}
          onChange={(v) => handleChange('gamma', v)}
        />
      </div>

      {/* Color section */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Color
        </h3>
        <Slider
          label="Temperature"
          value={adjustments.temperature}
          min={-100}
          max={100}
          onChange={(v) => handleChange('temperature', v)}
        />
        <Slider
          label="Tint"
          value={adjustments.tint}
          min={-100}
          max={100}
          onChange={(v) => handleChange('tint', v)}
        />
        <Slider
          label="Saturation"
          value={adjustments.saturation}
          min={-100}
          max={100}
          onChange={(v) => handleChange('saturation', v)}
        />
        <Slider
          label="Vibrance"
          value={adjustments.vibrance}
          min={-100}
          max={100}
          onChange={(v) => handleChange('vibrance', v)}
        />
        <Slider
          label="Hue"
          value={adjustments.hue}
          min={0}
          max={360}
          onChange={(v) => handleChange('hue', v)}
          unit="°"
        />
      </div>

      {/* Detail section */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Detail
        </h3>
        <Slider
          label="Clarity"
          value={adjustments.clarity}
          min={-100}
          max={100}
          onChange={(v) => handleChange('clarity', v)}
        />
      </div>

      {/* Levels section */}
      <div className="space-y-3">
        <button
          onClick={() => setLevelsOpen(o => !o)}
          className="flex items-center gap-1 text-xs font-medium text-zinc-300 uppercase tracking-wider w-full"
        >
          {levelsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Levels
          {adjustments.levels && <span className="ml-auto text-blue-400 normal-case tracking-normal font-normal">active</span>}
        </button>
        {levelsOpen && (
          <>
            <LevelsPanel
              levels={adjustments.levels ?? DEFAULT_LEVELS}
              onChange={handleLevelsChange}
              histogram={histogram}
            />
            {adjustments.levels && (
              <button
                onClick={() => setAdjustments({ levels: null })}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Reset Levels
              </button>
            )}
          </>
        )}
      </div>

      {/* Curves section */}
      <div className="space-y-3">
        <button
          onClick={() => setCurvesOpen(o => !o)}
          className="flex items-center gap-1 text-xs font-medium text-zinc-300 uppercase tracking-wider w-full"
        >
          {curvesOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Curves
          {adjustments.curves && <span className="ml-auto text-blue-400 normal-case tracking-normal font-normal">active</span>}
        </button>
        {curvesOpen && (
          <>
            <CurvesPanel
              curves={adjustments.curves ?? DEFAULT_CURVES}
              onChange={handleCurvesChange}
            />
            {adjustments.curves && (
              <button
                onClick={() => setAdjustments({ curves: null })}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Reset Curves
              </button>
            )}
          </>
        )}
      </div>

      {/* Color Balance section */}
      <div className="space-y-3">
        <button onClick={() => setColorBalanceOpen(o => !o)}
          className="flex items-center gap-1 text-xs font-medium text-zinc-300 uppercase tracking-wider w-full">
          {colorBalanceOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Color Balance
          {adjustments.colorBalance && <span className="ml-auto text-blue-400 normal-case tracking-normal font-normal">active</span>}
        </button>
        {colorBalanceOpen && (
          <>
            <ColorBalancePanel
              value={adjustments.colorBalance ?? DEFAULT_COLOR_BALANCE}
              onChange={handleColorBalanceChange}
            />
            {adjustments.colorBalance && (
              <button onClick={() => setAdjustments({ colorBalance: null })}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                Reset Color Balance
              </button>
            )}
          </>
        )}
      </div>

      {/* Hue/Saturation Channels section */}
      <div className="space-y-3">
        <button onClick={() => setHueSatOpen(o => !o)}
          className="flex items-center gap-1 text-xs font-medium text-zinc-300 uppercase tracking-wider w-full">
          {hueSatOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Hue/Sat Channels
          {adjustments.hueSatChannels && <span className="ml-auto text-blue-400 normal-case tracking-normal font-normal">active</span>}
        </button>
        {hueSatOpen && (
          <>
            <HueSatPanel
              value={adjustments.hueSatChannels ?? DEFAULT_HUE_SAT_CHANNELS}
              onChange={handleHueSatChange}
            />
            {adjustments.hueSatChannels && (
              <button onClick={() => setAdjustments({ hueSatChannels: null })}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                Reset Hue/Sat
              </button>
            )}
          </>
        )}
      </div>

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
        Apply Adjustments
      </button>
    </div>
  );
});

export default AdjustPanel;
