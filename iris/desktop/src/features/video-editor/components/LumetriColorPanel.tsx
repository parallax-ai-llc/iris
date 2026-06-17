/**
 * LumetriColorPanel - Advanced color correction panel
 * Inspired by Adobe Premiere Pro's Lumetri Color panel
 *
 * Sections:
 * - Basic Correction (Exposure, Contrast, Highlights, Shadows, Whites, Blacks, Temperature, Tint)
 * - Curves (RGB curves with draggable control points)
 * - Hue Curves (Hue vs Saturation, Hue vs Hue — 6-point slider controls per major hue)
 * - HSL Secondary (Hue/Saturation/Luminance per color channel)
 * - Color Wheels (Shadows, Midtones, Highlights lift/gamma/gain)
 */

import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sun,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Palette,
  Layers,
  X,
  Wand2,
  Sparkles,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  useEditorStore,
  hasEffects,
} from '@/features/video-editor/stores/editor.store';
import type { ClipEffect } from '@/types/videoProject.types';
import {
  LUT_PRESETS,
  LUT_CATEGORIES,
  type LutPreset,
} from '@/features/video-editor/lib/lutPresets';

// ==================== Types ====================

interface ColorCorrectionParams {
  // Basic Correction
  exposure: number; // -100 to 100
  contrast: number; // -100 to 100
  highlights: number; // -100 to 100
  shadows: number; // -100 to 100
  whites: number; // -100 to 100
  blacks: number; // -100 to 100
  temperature: number; // -100 to 100 (cool to warm)
  tint: number; // -100 to 100 (green to magenta)
  vibrance: number; // -100 to 100
  saturation: number; // -100 to 100

  // Curves (array of control points for each channel)
  curveMaster: [number, number][]; // [[x,y], ...] normalized 0-1
  curveRed: [number, number][];
  curveGreen: [number, number][];
  curveBlue: [number, number][];

  // HSL
  hslHue: number[]; // 8 channels: Red, Orange, Yellow, Green, Aqua, Blue, Purple, Magenta
  hslSaturation: number[];
  hslLuminance: number[];

  // Hue Curves — 6 major hue bands: Red(0°), Yellow(60°), Green(120°), Cyan(180°), Blue(240°), Magenta(300°)
  // Hue vs Saturation: saturation adjustment per hue band (-100 to +100)
  hueSatRed: number;
  hueSatYellow: number;
  hueSatGreen: number;
  hueSatCyan: number;
  hueSatBlue: number;
  hueSatMagenta: number;
  // Hue vs Hue: hue shift per hue band (-60 to +60 degrees)
  hueHueRed: number;
  hueHueYellow: number;
  hueHueGreen: number;
  hueHueCyan: number;
  hueHueBlue: number;
  hueHueMagenta: number;

  // Hue vs Luma: luma adjustment per hue band (-100 to +100)
  hueVsLumaRed: number;
  hueVsLumaYellow: number;
  hueVsLumaGreen: number;
  hueVsLumaCyan: number;
  hueVsLumaBlue: number;
  hueVsLumaMagenta: number;
  // Luma vs Saturation: saturation at different luma levels (-100 to +100)
  lumaVsSatShadows: number;
  lumaVsSatDarks: number;
  lumaVsSatMidtones: number;
  lumaVsSatLights: number;
  lumaVsSatHighlights: number;
  lumaVsSatWhites: number;
  // Sat vs Saturation: saturation output at different input levels (-100 to +100)
  satVsSatVeryLow: number;
  satVsSatLow: number;
  satVsSatMedium: number;
  satVsSatHigh: number;
  satVsSatVeryHigh: number;
  satVsSatMaximum: number;
  // Creative
  fadedFilm: number;

  // Color Wheels (x,y offset from center, -1 to 1)
  shadowsWheel: [number, number];
  midtonesWheel: [number, number];
  highlightsWheel: [number, number];
  shadowsLift: number; // -100 to 100
  midtonesGamma: number;
  highlightsGain: number;
}

const DEFAULT_COLOR_PARAMS: ColorCorrectionParams = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,
  curveMaster: [[0, 0], [1, 1]],
  curveRed: [[0, 0], [1, 1]],
  curveGreen: [[0, 0], [1, 1]],
  curveBlue: [[0, 0], [1, 1]],
  hslHue: [0, 0, 0, 0, 0, 0, 0, 0],
  hslSaturation: [0, 0, 0, 0, 0, 0, 0, 0],
  hslLuminance: [0, 0, 0, 0, 0, 0, 0, 0],
  hueSatRed: 0,
  hueSatYellow: 0,
  hueSatGreen: 0,
  hueSatCyan: 0,
  hueSatBlue: 0,
  hueSatMagenta: 0,
  hueHueRed: 0,
  hueHueYellow: 0,
  hueHueGreen: 0,
  hueHueCyan: 0,
  hueHueBlue: 0,
  hueHueMagenta: 0,
  hueVsLumaRed: 0,
  hueVsLumaYellow: 0,
  hueVsLumaGreen: 0,
  hueVsLumaCyan: 0,
  hueVsLumaBlue: 0,
  hueVsLumaMagenta: 0,
  lumaVsSatShadows: 0,
  lumaVsSatDarks: 0,
  lumaVsSatMidtones: 0,
  lumaVsSatLights: 0,
  lumaVsSatHighlights: 0,
  lumaVsSatWhites: 0,
  satVsSatVeryLow: 0,
  satVsSatLow: 0,
  satVsSatMedium: 0,
  satVsSatHigh: 0,
  satVsSatVeryHigh: 0,
  satVsSatMaximum: 0,
  fadedFilm: 0,
  shadowsWheel: [0, 0],
  midtonesWheel: [0, 0],
  highlightsWheel: [0, 0],
  shadowsLift: 0,
  midtonesGamma: 0,
  highlightsGain: 0,
};

const HSL_CHANNEL_NAMES = ['Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta'];
const HSL_CHANNEL_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

// 6 major hue bands used by the Hue Curves section (matching the 6 preset hue points at 0°/60°/120°/180°/240°/300°)
const HUE_BAND_NAMES = ['Red', 'Yellow', 'Green', 'Cyan', 'Blue', 'Magenta'] as const;
type HueBandName = (typeof HUE_BAND_NAMES)[number];
const HUE_BAND_COLORS: Record<HueBandName, string> = {
  Red: '#ef4444',
  Yellow: '#eab308',
  Green: '#22c55e',
  Cyan: '#06b6d4',
  Blue: '#3b82f6',
  Magenta: '#ec4899',
};
// Param key suffixes that map each band to a filterParams key
const HUE_SAT_KEYS: Record<HueBandName, keyof ColorCorrectionParams> = {
  Red: 'hueSatRed',
  Yellow: 'hueSatYellow',
  Green: 'hueSatGreen',
  Cyan: 'hueSatCyan',
  Blue: 'hueSatBlue',
  Magenta: 'hueSatMagenta',
};
const HUE_HUE_KEYS: Record<HueBandName, keyof ColorCorrectionParams> = {
  Red: 'hueHueRed',
  Yellow: 'hueHueYellow',
  Green: 'hueHueGreen',
  Cyan: 'hueHueCyan',
  Blue: 'hueHueBlue',
  Magenta: 'hueHueMagenta',
};
const HUE_LUMA_KEYS: Record<HueBandName, keyof ColorCorrectionParams> = {
  Red: 'hueVsLumaRed',
  Yellow: 'hueVsLumaYellow',
  Green: 'hueVsLumaGreen',
  Cyan: 'hueVsLumaCyan',
  Blue: 'hueVsLumaBlue',
  Magenta: 'hueVsLumaMagenta',
};
const LUMA_SAT_NAMES = ['Shadows', 'Darks', 'Midtones', 'Lights', 'Highlights', 'Whites'] as const;
const LUMA_SAT_KEYS: Record<(typeof LUMA_SAT_NAMES)[number], keyof ColorCorrectionParams> = {
  Shadows: 'lumaVsSatShadows',
  Darks: 'lumaVsSatDarks',
  Midtones: 'lumaVsSatMidtones',
  Lights: 'lumaVsSatLights',
  Highlights: 'lumaVsSatHighlights',
  Whites: 'lumaVsSatWhites',
};
const LUMA_SAT_COLORS: Record<(typeof LUMA_SAT_NAMES)[number], string> = {
  Shadows: '#374151', Darks: '#6b7280', Midtones: '#9ca3af', Lights: '#d1d5db', Highlights: '#e5e7eb', Whites: '#f3f4f6',
};
const SAT_SAT_NAMES = ['VeryLow', 'Low', 'Medium', 'High', 'VeryHigh', 'Maximum'] as const;
const SAT_SAT_KEYS: Record<(typeof SAT_SAT_NAMES)[number], keyof ColorCorrectionParams> = {
  VeryLow: 'satVsSatVeryLow',
  Low: 'satVsSatLow',
  Medium: 'satVsSatMedium',
  High: 'satVsSatHigh',
  VeryHigh: 'satVsSatVeryHigh',
  Maximum: 'satVsSatMaximum',
};
const SAT_SAT_COLORS: Record<(typeof SAT_SAT_NAMES)[number], string> = {
  VeryLow: '#6b7280', Low: '#a78bfa', Medium: '#8b5cf6', High: '#7c3aed', VeryHigh: '#6d28d9', Maximum: '#5b21b6',
};

// ==================== Slider Component ====================

const ColorSlider = memo(function ColorSlider({
  label,
  value,
  onChange,
  min = -100,
  max = 100,
  step = 1,
  color,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  color?: string;
}) {
  const center = (min + max) / 2;
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="flex items-center gap-2">
      <label className="text-[11px] text-zinc-400 w-20 flex-shrink-0 truncate">{label}</label>
      <div className="flex-1 relative h-4 flex items-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full h-1 bg-zinc-700 rounded-full relative">
            {/* Fill from center */}
            {value !== center && (
              <div
                className="absolute h-full rounded-full"
                style={{
                  left: value > center ? `${((center - min) / (max - min)) * 100}%` : `${percentage}%`,
                  width: `${Math.abs(percentage - ((center - min) / (max - min)) * 100)}%`,
                  backgroundColor: color || '#a78bfa',
                }}
              />
            )}
          </div>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
        {/* Thumb indicator */}
        <div
          className="absolute w-2.5 h-2.5 rounded-full border-2 border-white bg-zinc-900 pointer-events-none"
          style={{ left: `calc(${percentage}% - 5px)` }}
        />
      </div>
      <span className="text-[10px] text-zinc-500 w-8 text-right font-mono tabular-nums">
        {value > 0 ? `+${value}` : value}
      </span>
    </div>
  );
});

// ==================== Section Component ====================

const Section = memo(function Section({
  title,
  icon: Icon,
  children,
  defaultExpanded = false,
  onReset,
}: {
  title: string;
  icon: typeof Sun;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  onReset?: () => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border-b border-zinc-800">
      <div
        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-zinc-800/50 transition-colors cursor-pointer"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } }}
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
        )}
        <Icon className="w-3.5 h-3.5 text-zinc-400" />
        <span className="text-xs font-medium text-zinc-300">{title}</span>
        {onReset && (
          <button
            className="ml-auto p-0.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-white transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onReset();
            }}
            title="Reset"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
      </div>
      {expanded && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
});

// ==================== LUT Presets Section ====================

const LutPresetsSection = memo(function LutPresetsSection({
  onApply,
  activePresetId,
  onReset,
}: {
  onApply: (preset: LutPreset) => void;
  activePresetId: string | null;
  onReset: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [activeCategory, setActiveCategory] = useState<LutPreset['category']>('cinematic');

  const visiblePresets = useMemo(
    () => LUT_PRESETS.filter((p) => p.category === activeCategory),
    [activeCategory]
  );

  const activeCategoryMeta = LUT_CATEGORIES.find((c) => c.id === activeCategory)!;

  return (
    <div className="border-b border-zinc-800">
      {/* Section header */}
      <div
        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-zinc-800/50 transition-colors cursor-pointer"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
        )}
        <Layers className="w-3.5 h-3.5 text-zinc-400" />
        <span className="text-xs font-medium text-zinc-300">LUT Presets</span>
        {activePresetId && (
          <button
            className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-zinc-700 text-zinc-300 hover:bg-zinc-600 hover:text-white transition-colors"
            title="Clear LUT preset"
            onClick={(e) => {
              e.stopPropagation();
              onReset();
            }}
          >
            <X className="w-2.5 h-2.5" />
            Reset
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* Category tabs */}
          <div className="flex gap-1">
            {LUT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'flex-1 px-1 py-1 rounded text-[10px] font-medium transition-colors truncate',
                  activeCategory === cat.id
                    ? `bg-zinc-700 border border-zinc-600 ${cat.colorClass}`
                    : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Preset grid */}
          <div className="grid grid-cols-2 gap-1.5">
            {visiblePresets.map((preset) => {
              const isActive = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => onApply(preset)}
                  title={preset.description}
                  className={cn(
                    'flex flex-col items-start px-2 py-1.5 rounded text-left transition-colors',
                    isActive
                      ? `bg-zinc-700 border border-zinc-500 ${activeCategoryMeta.colorClass}`
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-transparent'
                  )}
                >
                  <span className="text-[11px] font-medium leading-tight truncate w-full">
                    {preset.name}
                  </span>
                  <span className="text-[9px] text-zinc-500 leading-tight truncate w-full mt-0.5">
                    {preset.description}
                  </span>
                </button>
              );
            })}
          </div>

          {activePresetId && (
            <p className="text-[9px] text-zinc-500 text-center">
              Preset applied — adjust sliders to fine-tune
            </p>
          )}
        </div>
      )}
    </div>
  );
});

// ==================== Curves Editor ====================

const CurveEditor = memo(function CurveEditor({
  points,
  onChange,
  color = '#ffffff',
  label,
}: {
  points: [number, number][];
  onChange: (points: [number, number][]) => void;
  color?: string;
  label: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const size = 160;
  const pad = 8;
  const inner = size - pad * 2;

  // Convert normalized coords to SVG coords
  const toSvg = useCallback(
    (x: number, y: number): [number, number] => [pad + x * inner, pad + (1 - y) * inner],
    [inner]
  );

  // Convert SVG coords to normalized
  const fromSvg = useCallback(
    (sx: number, sy: number): [number, number] => [
      Math.max(0, Math.min(1, (sx - pad) / inner)),
      Math.max(0, Math.min(1, 1 - (sy - pad) / inner)),
    ],
    [inner]
  );

  // Generate smooth curve path using catmull-rom
  const curvePath = useMemo(() => {
    if (points.length < 2) return '';
    const pts = points.map(([x, y]) => toSvg(x, y));
    if (pts.length === 2) {
      return `M${pts[0][0]},${pts[0][1]} L${pts[1][0]},${pts[1][1]}`;
    }
    // Catmull-Rom to bezier
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
    }
    return d;
  }, [points, toSvg]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(index);
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragging === null || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const [nx, ny] = fromSvg(sx, sy);

      // Don't allow moving first/last point horizontally
      const newPoints = [...points] as [number, number][];
      if (dragging === 0) {
        newPoints[0] = [0, ny];
      } else if (dragging === points.length - 1) {
        newPoints[dragging] = [1, ny];
      } else {
        // Constrain between neighbors
        const prevX = newPoints[dragging - 1][0] + 0.01;
        const nextX = newPoints[dragging + 1][0] - 0.01;
        newPoints[dragging] = [Math.max(prevX, Math.min(nextX, nx)), ny];
      }
      onChange(newPoints);
    },
    [dragging, points, onChange, fromSvg]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  // Add point on double-click
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const [nx, ny] = fromSvg(e.clientX - rect.left, e.clientY - rect.top);
      // Insert sorted by x
      const newPoints = [...points] as [number, number][];
      let insertIdx = newPoints.length - 1;
      for (let i = 0; i < newPoints.length - 1; i++) {
        if (nx > newPoints[i][0] && nx < newPoints[i + 1][0]) {
          insertIdx = i + 1;
          break;
        }
      }
      newPoints.splice(insertIdx, 0, [nx, ny]);
      onChange(newPoints);
    },
    [points, onChange, fromSvg]
  );

  // Right-click to remove point
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.preventDefault();
      if (index === 0 || index === points.length - 1) return; // Don't remove endpoints
      const newPoints = points.filter((_, i) => i !== index);
      onChange(newPoints);
    },
    [points, onChange]
  );

  useEffect(() => {
    if (dragging !== null) {
      const up = () => setDragging(null);
      window.addEventListener('mouseup', up);
      return () => window.removeEventListener('mouseup', up);
    }
  }, [dragging]);

  return (
    <div>
      <span className="text-[10px] text-zinc-500 mb-1 block">{label}</span>
      <svg
        ref={svgRef}
        width={size}
        height={size}
        className="bg-zinc-800 rounded border border-zinc-700 cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      >
        {/* Grid */}
        {[0.25, 0.5, 0.75].map((v) => {
          const [gx, gy] = toSvg(v, 0);
          const [, gy2] = toSvg(v, 1);
          return (
            <g key={v}>
              <line x1={gx} y1={gy} x2={gx} y2={gy2} stroke="#333" strokeWidth="0.5" />
              <line x1={pad} y1={gy} x2={size - pad} y2={gy2} stroke="#333" strokeWidth="0.5" />
            </g>
          );
        })}
        {/* Diagonal reference line */}
        <line
          x1={pad}
          y1={size - pad}
          x2={size - pad}
          y2={pad}
          stroke="#444"
          strokeWidth="0.5"
          strokeDasharray="4,4"
        />
        {/* Curve */}
        <path d={curvePath} fill="none" stroke={color} strokeWidth="2" />
        {/* Control points */}
        {points.map(([x, y], i) => {
          const [sx, sy] = toSvg(x, y);
          return (
            <circle
              key={i}
              cx={sx}
              cy={sy}
              r={4}
              fill={dragging === i ? color : '#1a1a1a'}
              stroke={color}
              strokeWidth="1.5"
              className="cursor-pointer"
              onMouseDown={(e) => handleMouseDown(e, i)}
              onContextMenu={(e) => handleContextMenu(e, i)}
            />
          );
        })}
      </svg>
    </div>
  );
});

// ==================== Color Wheel ====================

const ColorWheel = memo(function ColorWheel({
  value,
  onChange,
  label,
  liftValue,
  onLiftChange,
  liftLabel,
}: {
  value: [number, number];
  onChange: (value: [number, number]) => void;
  label: string;
  liftValue: number;
  onLiftChange: (value: number) => void;
  liftLabel: string;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const wheelSize = 90;
  const radius = wheelSize / 2 - 4;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      let dx = (e.clientX - rect.left - cx) / radius;
      let dy = (e.clientY - rect.top - cy) / radius;
      // Clamp to circle
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        dx /= dist;
        dy /= dist;
      }
      onChange([Math.round(dx * 100) / 100, Math.round(dy * 100) / 100]);
    },
    [dragging, radius, onChange]
  );

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  // Indicator position
  const indicatorX = wheelSize / 2 + value[0] * radius;
  const indicatorY = wheelSize / 2 + value[1] * radius;

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] text-zinc-400 font-medium">{label}</span>
      <div
        ref={canvasRef}
        className="relative rounded-full cursor-crosshair"
        style={{
          width: wheelSize,
          height: wheelSize,
          background: `conic-gradient(
            from 90deg,
            hsl(0, 70%, 50%),
            hsl(60, 70%, 50%),
            hsl(120, 70%, 50%),
            hsl(180, 70%, 50%),
            hsl(240, 70%, 50%),
            hsl(300, 70%, 50%),
            hsl(360, 70%, 50%)
          )`,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Inner gradient overlay for brightness */}
        <div
          className="absolute inset-1 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(128,128,128,0.9) 0%, transparent 70%)',
          }}
        />
        {/* Center crosshair */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-px h-3 bg-zinc-400/50" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-px w-3 bg-zinc-400/50" />
        </div>
        {/* Indicator dot */}
        <div
          className="absolute w-3 h-3 rounded-full border-2 border-white shadow-md pointer-events-none"
          style={{
            left: indicatorX - 6,
            top: indicatorY - 6,
            backgroundColor: `hsl(${Math.atan2(-value[1], value[0]) * (180 / Math.PI) + 180}, 70%, 50%)`,
          }}
        />
      </div>
      {/* Lift/Gamma/Gain slider below */}
      <div className="w-full mt-1">
        <ColorSlider
          label={liftLabel}
          value={liftValue}
          onChange={onLiftChange}
          min={-100}
          max={100}
          color="#a78bfa"
        />
      </div>
    </div>
  );
});

// ==================== Main Panel ====================

interface LumetriColorPanelProps {
  className?: string;
}

export const LumetriColorPanel = memo(function LumetriColorPanel({
  className,
}: LumetriColorPanelProps) {
  const { t } = useTranslation('editor');
  const selectedClip = useEditorStore((s) => s.selectedClip);
  const addClipEffect = useEditorStore((s) => s.addClipEffect);
  const updateClipEffect = useEditorStore((s) => s.updateClipEffect);

  // Get or create the color correction effect on the selected clip
  const colorEffect = useMemo(() => {
    if (!selectedClip || !hasEffects(selectedClip)) return null;
    return selectedClip.effects.find(
      (e) => e.type === 'filter' && e.filterType === 'color-correction'
    ) || null;
  }, [selectedClip]);

  // Current params
  const params = useMemo((): ColorCorrectionParams => {
    if (!colorEffect?.filterParams) return { ...DEFAULT_COLOR_PARAMS };
    const p = colorEffect.filterParams as unknown as Partial<ColorCorrectionParams>;
    return { ...DEFAULT_COLOR_PARAMS, ...p };
  }, [colorEffect]);

  // Update a param
  const updateParam = useCallback(
    <K extends keyof ColorCorrectionParams>(key: K, value: ColorCorrectionParams[K]) => {
      if (!selectedClip || !hasEffects(selectedClip)) return;

      const newParams = { ...params, [key]: value };

      if (colorEffect) {
        // Update existing effect
        updateClipEffect(selectedClip.id, colorEffect.id, {
          filterParams: newParams as unknown as Record<string, number>,
        });
      } else {
        // Create new color correction effect
        const newEffect: ClipEffect = {
          id: `fx-cc-${Date.now()}`,
          type: 'filter',
          name: 'Lumetri Color',
          enabled: true,
          filterType: 'color-correction',
          filterIntensity: 100,
          filterParams: newParams as unknown as Record<string, number>,
          keyframes: [],
        };
        addClipEffect(selectedClip.id, newEffect);
      }
    },
    [selectedClip, colorEffect, params, updateClipEffect, addClipEffect]
  );

  // Reset a section
  const resetBasic = useCallback(() => {
    const keys: (keyof ColorCorrectionParams)[] = [
      'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks',
      'temperature', 'tint', 'vibrance', 'saturation',
    ];
    if (!selectedClip || !hasEffects(selectedClip) || !colorEffect) return;
    const newParams: ColorCorrectionParams = { ...params };
    for (const k of keys) {
      (newParams[k] as ColorCorrectionParams[typeof k]) = DEFAULT_COLOR_PARAMS[k];
    }
    updateClipEffect(selectedClip.id, colorEffect.id, {
      filterParams: newParams as unknown as Record<string, number>,
    });
  }, [selectedClip, colorEffect, params, updateClipEffect]);

  const resetCurves = useCallback(() => {
    if (!selectedClip || !colorEffect) return;
    const newParams = {
      ...params,
      curveMaster: DEFAULT_COLOR_PARAMS.curveMaster,
      curveRed: DEFAULT_COLOR_PARAMS.curveRed,
      curveGreen: DEFAULT_COLOR_PARAMS.curveGreen,
      curveBlue: DEFAULT_COLOR_PARAMS.curveBlue,
    };
    updateClipEffect(selectedClip.id, colorEffect.id, {
      filterParams: newParams as unknown as Record<string, number>,
    });
  }, [selectedClip, colorEffect, params, updateClipEffect]);

  const resetHSL = useCallback(() => {
    if (!selectedClip || !colorEffect) return;
    const newParams = {
      ...params,
      hslHue: DEFAULT_COLOR_PARAMS.hslHue,
      hslSaturation: DEFAULT_COLOR_PARAMS.hslSaturation,
      hslLuminance: DEFAULT_COLOR_PARAMS.hslLuminance,
    };
    updateClipEffect(selectedClip.id, colorEffect.id, {
      filterParams: newParams as unknown as Record<string, number>,
    });
  }, [selectedClip, colorEffect, params, updateClipEffect]);

  const resetHueCurves = useCallback(() => {
    if (!selectedClip || !colorEffect) return;
    const newParams: ColorCorrectionParams = {
      ...params,
      hueSatRed: 0,
      hueSatYellow: 0,
      hueSatGreen: 0,
      hueSatCyan: 0,
      hueSatBlue: 0,
      hueSatMagenta: 0,
      hueHueRed: 0,
      hueHueYellow: 0,
      hueHueGreen: 0,
      hueHueCyan: 0,
      hueHueBlue: 0,
      hueHueMagenta: 0,
    };
    updateClipEffect(selectedClip.id, colorEffect.id, {
      filterParams: newParams as unknown as Record<string, number>,
    });
  }, [selectedClip, colorEffect, params, updateClipEffect]);

  const resetWheels = useCallback(() => {
    if (!selectedClip || !colorEffect) return;
    const newParams = {
      ...params,
      shadowsWheel: DEFAULT_COLOR_PARAMS.shadowsWheel,
      midtonesWheel: DEFAULT_COLOR_PARAMS.midtonesWheel,
      highlightsWheel: DEFAULT_COLOR_PARAMS.highlightsWheel,
      shadowsLift: 0,
      midtonesGamma: 0,
      highlightsGain: 0,
    };
    updateClipEffect(selectedClip.id, colorEffect.id, {
      filterParams: newParams as unknown as Record<string, number>,
    });
  }, [selectedClip, colorEffect, params, updateClipEffect]);

  // HSL update helpers
  const updateHSLChannel = useCallback(
    (arr: 'hslHue' | 'hslSaturation' | 'hslLuminance', index: number, value: number) => {
      const newArr = [...params[arr]];
      newArr[index] = value;
      updateParam(arr, newArr);
    },
    [params, updateParam]
  );

  // LUT preset state — tracks which preset is currently applied (display only).
  // Stored per-clip+effect so selecting a different clip (or removing the
  // color-correction effect) doesn't leave a stale "active" highlight from a
  // previous clip.
  const [activePresetByEffect, setActivePresetByEffect] = useState<Record<string, string>>({});
  const activePresetKey = colorEffect ? `${selectedClip?.id}:${colorEffect.id}` : null;
  const explicitPresetId = activePresetKey ? activePresetByEffect[activePresetKey] ?? null : null;
  // Fallback: if no explicit preset was selected (e.g. effect was added via the
  // Effects panel, or restored from a saved project), try to match the current
  // basic params against a known preset so the panel still shows what's active.
  const matchedPresetId = useMemo(() => {
    if (!colorEffect?.filterParams) return null;
    const p = colorEffect.filterParams as Record<string, number | undefined>;
    const eq = (a: number | undefined, b: number | undefined) =>
      Math.abs((a ?? 0) - (b ?? 0)) < 0.5;
    for (const preset of LUT_PRESETS) {
      const pp = preset.params as Record<string, number | undefined>;
      const keys = new Set([...Object.keys(pp), 'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'temperature', 'tint', 'vibrance', 'saturation']);
      let allMatch = true;
      for (const k of keys) {
        if (!eq(p[k], pp[k])) { allMatch = false; break; }
      }
      if (allMatch) return preset.id;
    }
    return null;
  }, [colorEffect]);
  const activePresetId = explicitPresetId ?? matchedPresetId;
  const setActivePresetId = useCallback(
    (id: string | null) => {
      if (!activePresetKey) return;
      setActivePresetByEffect((prev) => {
        const next = { ...prev };
        if (id === null) delete next[activePresetKey];
        else next[activePresetKey] = id;
        return next;
      });
    },
    [activePresetKey]
  );

  // Clean up stale entries when their effect no longer exists on the clip.
  useEffect(() => {
    if (!selectedClip || !hasEffects(selectedClip)) return;
    const validKeys = new Set(
      selectedClip.effects
        .filter((e) => e.filterType === 'color-correction')
        .map((e) => `${selectedClip.id}:${e.id}`)
    );
    setActivePresetByEffect((prev) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (k.startsWith(`${selectedClip.id}:`) && !validKeys.has(k)) {
          changed = true;
          continue;
        }
        next[k] = v;
      }
      return changed ? next : prev;
    });
  }, [selectedClip]);

  // Apply a LUT preset: merge the preset params over the current color correction params
  const applyPreset = useCallback(
    (preset: LutPreset) => {
      if (!selectedClip || !hasEffects(selectedClip)) return;

      // Merge preset params (only defined keys override current values)
      const newParams: ColorCorrectionParams = {
        ...DEFAULT_COLOR_PARAMS,
        ...preset.params,
        // Preserve non-basic params (curves, HSL, hue curves, wheels) from current state
        curveMaster: params.curveMaster,
        curveRed: params.curveRed,
        curveGreen: params.curveGreen,
        curveBlue: params.curveBlue,
        hslHue: params.hslHue,
        hslSaturation: params.hslSaturation,
        hslLuminance: params.hslLuminance,
        hueSatRed: params.hueSatRed,
        hueSatYellow: params.hueSatYellow,
        hueSatGreen: params.hueSatGreen,
        hueSatCyan: params.hueSatCyan,
        hueSatBlue: params.hueSatBlue,
        hueSatMagenta: params.hueSatMagenta,
        hueHueRed: params.hueHueRed,
        hueHueYellow: params.hueHueYellow,
        hueHueGreen: params.hueHueGreen,
        hueHueCyan: params.hueHueCyan,
        hueHueBlue: params.hueHueBlue,
        hueHueMagenta: params.hueHueMagenta,
        shadowsWheel: params.shadowsWheel,
        midtonesWheel: params.midtonesWheel,
        highlightsWheel: params.highlightsWheel,
        shadowsLift: params.shadowsLift,
        midtonesGamma: params.midtonesGamma,
        highlightsGain: params.highlightsGain,
      };

      if (colorEffect) {
        updateClipEffect(selectedClip.id, colorEffect.id, {
          filterParams: newParams as unknown as Record<string, number>,
        });
      } else {
        const newEffect: ClipEffect = {
          id: `fx-cc-${Date.now()}`,
          type: 'filter',
          name: 'Lumetri Color',
          enabled: true,
          filterType: 'color-correction',
          filterIntensity: 100,
          filterParams: newParams as unknown as Record<string, number>,
          keyframes: [],
        };
        addClipEffect(selectedClip.id, newEffect);
      }

      setActivePresetId(preset.id);
    },
    [selectedClip, colorEffect, params, updateClipEffect, addClipEffect, setActivePresetId]
  );

  // Reset the LUT preset — restores basic correction params to defaults
  const resetPreset = useCallback(() => {
    if (!selectedClip || !hasEffects(selectedClip) || !colorEffect) {
      setActivePresetId(null);
      return;
    }
    const resetParams: ColorCorrectionParams = {
      ...params,
      exposure: 0,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
      temperature: 0,
      tint: 0,
      vibrance: 0,
      saturation: 0,
    };
    updateClipEffect(selectedClip.id, colorEffect.id, {
      filterParams: resetParams as unknown as Record<string, number>,
    });
    setActivePresetId(null);
  }, [selectedClip, colorEffect, params, updateClipEffect, setActivePresetId]);

  // Curve tab state
  const [curveChannel, setCurveChannel] = useState<'master' | 'red' | 'green' | 'blue'>('master');
  // Hue Curves tab state
  const [hueCurveMode, setHueCurveMode] = useState<'hueSat' | 'hueHue' | 'hueLuma' | 'lumaSat' | 'satSat'>('hueSat');
  // HSL tab state
  const [hslMode, setHslMode] = useState<'hue' | 'saturation' | 'luminance'>('saturation');

  // No clip selected or clip doesn't support effects
  if (!selectedClip || !hasEffects(selectedClip)) {
    return (
      <div className={cn('flex flex-col items-center justify-center p-6 text-center', className)}>
        <Palette className="w-10 h-10 text-zinc-600 mb-2" />
        <p className="text-xs text-zinc-400">Select a video or adjustment clip</p>
        <p className="text-[10px] text-zinc-500 mt-1">to use color correction</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col overflow-y-auto bg-zinc-900', className)}>
      {/* Panel header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-800/50 sticky top-0 z-10">
        <Palette className="w-4 h-4 text-purple-400" />
        <span className="text-xs font-medium text-white">Lumetri Color</span>
      </div>

      {/* LUT Presets */}
      <LutPresetsSection
        onApply={applyPreset}
        activePresetId={activePresetId}
        onReset={resetPreset}
      />

      {/* Creative */}
      <Section title="Creative" icon={Sparkles}>
        <div className="space-y-1.5">
          <ColorSlider
            label="Faded Film"
            value={params.fadedFilm}
            onChange={(v) => updateParam('fadedFilm', v)}
            color="#9ca3af"
            min={0}
            max={100}
          />
        </div>
      </Section>

      {/* Basic Correction */}
      <Section title="Basic Correction" icon={Sun} defaultExpanded onReset={resetBasic}>
        <div className="space-y-1.5">
          <ColorSlider
            label="Exposure"
            value={params.exposure}
            onChange={(v) => updateParam('exposure', v)}
            color="#facc15"
          />
          <ColorSlider
            label="Contrast"
            value={params.contrast}
            onChange={(v) => updateParam('contrast', v)}
            color="#a78bfa"
          />
          <div className="h-px bg-zinc-700 my-1" />
          <ColorSlider
            label="Highlights"
            value={params.highlights}
            onChange={(v) => updateParam('highlights', v)}
            color="#fbbf24"
          />
          <ColorSlider
            label="Shadows"
            value={params.shadows}
            onChange={(v) => updateParam('shadows', v)}
            color="#6366f1"
          />
          <ColorSlider
            label="Whites"
            value={params.whites}
            onChange={(v) => updateParam('whites', v)}
            color="#f5f5f5"
          />
          <ColorSlider
            label="Blacks"
            value={params.blacks}
            onChange={(v) => updateParam('blacks', v)}
            color="#525252"
          />
          <div className="h-px bg-zinc-700 my-1" />
          <ColorSlider
            label="Temperature"
            value={params.temperature}
            onChange={(v) => updateParam('temperature', v)}
            color="#f59e0b"
          />
          <ColorSlider
            label="Tint"
            value={params.tint}
            onChange={(v) => updateParam('tint', v)}
            color="#ec4899"
          />
          <div className="h-px bg-zinc-700 my-1" />
          <ColorSlider
            label="Vibrance"
            value={params.vibrance}
            onChange={(v) => updateParam('vibrance', v)}
            color="#8b5cf6"
          />
          <ColorSlider
            label="Saturation"
            value={params.saturation}
            onChange={(v) => updateParam('saturation', v)}
            color="#06b6d4"
          />
        </div>
      </Section>

      {/* Curves */}
      <Section title="Curves" icon={Sun} onReset={resetCurves}>
        {/* Channel tabs */}
        <div className="flex gap-1 mb-2">
          {([
            { key: 'master', label: 'RGB', color: '#fff' },
            { key: 'red', label: 'R', color: '#ef4444' },
            { key: 'green', label: 'G', color: '#22c55e' },
            { key: 'blue', label: 'B', color: '#3b82f6' },
          ] as const).map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => setCurveChannel(key)}
              className={cn(
                'flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
                curveChannel === key
                  ? 'bg-zinc-700 border border-zinc-600'
                  : 'bg-zinc-800 text-zinc-500 hover:text-white'
              )}
              style={{ color: curveChannel === key ? color : undefined }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex justify-center">
          <CurveEditor
            points={
              curveChannel === 'master' ? params.curveMaster :
              curveChannel === 'red' ? params.curveRed :
              curveChannel === 'green' ? params.curveGreen :
              params.curveBlue
            }
            onChange={(pts) => {
              const key = curveChannel === 'master' ? 'curveMaster' :
                curveChannel === 'red' ? 'curveRed' :
                curveChannel === 'green' ? 'curveGreen' : 'curveBlue';
              updateParam(key, pts);
            }}
            color={
              curveChannel === 'master' ? '#ffffff' :
              curveChannel === 'red' ? '#ef4444' :
              curveChannel === 'green' ? '#22c55e' : '#3b82f6'
            }
            label={`${curveChannel.charAt(0).toUpperCase() + curveChannel.slice(1)} Channel`}
          />
        </div>
        <p className="text-[9px] text-zinc-600 text-center mt-1">
          Double-click to add points. Right-click to remove.
        </p>
      </Section>

      {/* Hue Curves */}
      <Section title="Hue Curves" icon={Palette} onReset={resetHueCurves}>
        {/* Mode tabs */}
        <div className="flex flex-wrap gap-1 mb-3">
          {([
            { key: 'hueSat', label: 'Hue vs Sat' },
            { key: 'hueHue', label: 'Hue vs Hue' },
            { key: 'hueLuma', label: 'Hue vs Luma' },
            { key: 'lumaSat', label: 'Luma vs Sat' },
            { key: 'satSat', label: 'Sat vs Sat' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setHueCurveMode(key)}
              className={cn(
                'flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
                hueCurveMode === key
                  ? 'bg-zinc-700 text-white border border-zinc-600'
                  : 'bg-zinc-800 text-zinc-500 hover:text-white'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Description */}
        <p className="text-[9px] text-zinc-500 mb-2 leading-tight">
          {hueCurveMode === 'hueSat' && 'Adjust saturation for specific hue ranges.'}
          {hueCurveMode === 'hueHue' && 'Shift specific hues to other hues.'}
          {hueCurveMode === 'hueLuma' && 'Adjust brightness for specific hue ranges.'}
          {hueCurveMode === 'lumaSat' && 'Adjust saturation at different brightness levels.'}
          {hueCurveMode === 'satSat' && 'Adjust saturation output at different saturation input levels.'}
        </p>

        {/* Sliders per mode */}
        <div className="space-y-1.5">
          {(hueCurveMode === 'hueSat' || hueCurveMode === 'hueHue' || hueCurveMode === 'hueLuma') && HUE_BAND_NAMES.map((band) => {
            const keyMap = hueCurveMode === 'hueSat' ? HUE_SAT_KEYS : hueCurveMode === 'hueHue' ? HUE_HUE_KEYS : HUE_LUMA_KEYS;
            const paramKey = keyMap[band];
            const value = params[paramKey] as number;
            const min = hueCurveMode === 'hueHue' ? -60 : -100;
            const max = hueCurveMode === 'hueHue' ? 60 : 100;
            return (
              <ColorSlider
                key={band}
                label={band}
                value={value}
                onChange={(v) => updateParam(paramKey, v)}
                min={min}
                max={max}
                step={1}
                color={HUE_BAND_COLORS[band]}
              />
            );
          })}
          {hueCurveMode === 'lumaSat' && LUMA_SAT_NAMES.map((name) => (
            <ColorSlider
              key={name}
              label={name}
              value={params[LUMA_SAT_KEYS[name]] as number}
              onChange={(v) => updateParam(LUMA_SAT_KEYS[name], v)}
              min={-100}
              max={100}
              step={1}
              color={LUMA_SAT_COLORS[name]}
            />
          ))}
          {hueCurveMode === 'satSat' && SAT_SAT_NAMES.map((name) => (
            <ColorSlider
              key={name}
              label={name.replace(/([A-Z])/g, ' $1').trim()}
              value={params[SAT_SAT_KEYS[name]] as number}
              onChange={(v) => updateParam(SAT_SAT_KEYS[name], v)}
              min={-100}
              max={100}
              step={1}
              color={SAT_SAT_COLORS[name]}
            />
          ))}
        </div>

        {/* Range hint */}
        <p className="text-[9px] text-zinc-600 text-center mt-2">
          Range: {hueCurveMode === 'hueHue' ? '-60\u00b0 to +60\u00b0' : '-100 to +100'}
        </p>
      </Section>

      {/* HSL Secondary */}
      <Section title="HSL Secondary" icon={Palette} onReset={resetHSL}>
        {/* Mode tabs */}
        <div className="flex gap-1 mb-2">
          {([
            { key: 'hue', label: 'Hue' },
            { key: 'saturation', label: 'Saturation' },
            { key: 'luminance', label: 'Luminance' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setHslMode(key)}
              className={cn(
                'flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
                hslMode === key
                  ? 'bg-zinc-700 text-white border border-zinc-600'
                  : 'bg-zinc-800 text-zinc-500 hover:text-white'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="space-y-1">
          {HSL_CHANNEL_NAMES.map((name, i) => {
            const arrKey = hslMode === 'hue' ? 'hslHue' :
              hslMode === 'saturation' ? 'hslSaturation' : 'hslLuminance';
            return (
              <ColorSlider
                key={name}
                label={name}
                value={params[arrKey][i]}
                onChange={(v) => updateHSLChannel(arrKey, i, v)}
                color={HSL_CHANNEL_COLORS[i]}
              />
            );
          })}
        </div>
      </Section>

      {/* Color Wheels */}
      <Section title="Color Wheels" icon={Palette} onReset={resetWheels}>
        <div className="grid grid-cols-3 gap-2">
          <ColorWheel
            label="Shadows"
            value={params.shadowsWheel}
            onChange={(v) => updateParam('shadowsWheel', v)}
            liftValue={params.shadowsLift}
            onLiftChange={(v) => updateParam('shadowsLift', v)}
            liftLabel="Lift"
          />
          <ColorWheel
            label="Midtones"
            value={params.midtonesWheel}
            onChange={(v) => updateParam('midtonesWheel', v)}
            liftValue={params.midtonesGamma}
            onLiftChange={(v) => updateParam('midtonesGamma', v)}
            liftLabel="Gamma"
          />
          <ColorWheel
            label="Highlights"
            value={params.highlightsWheel}
            onChange={(v) => updateParam('highlightsWheel', v)}
            liftValue={params.highlightsGain}
            onLiftChange={(v) => updateParam('highlightsGain', v)}
            liftLabel="Gain"
          />
        </div>
        {/* Color Match */}
        <button
          onClick={() => alert(t('lumetri.colorMatchAnalyzing'))}
          className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-xs text-zinc-300 transition-colors"
        >
          <Wand2 className="w-3 h-3" />
          Color Match
        </button>
      </Section>

      {/* Histogram Scope */}
      <Section title="Histogram" icon={BarChart3}>
        <div className="bg-zinc-900 rounded p-2 h-24 flex items-end gap-px">
          {/* Placeholder histogram bars */}
          {Array.from({ length: 32 }).map((_, i) => {
            const h = Math.sin(i * 0.3) * 30 + Math.random() * 20 + 20;
            return (
              <div
                key={i}
                className="flex-1 rounded-t opacity-60"
                style={{
                  height: `${h}%`,
                  background: i < 11 ? '#ef4444' : i < 22 ? '#22c55e' : '#3b82f6',
                }}
              />
            );
          })}
        </div>
        <p className="text-[9px] text-zinc-500 text-center mt-1">RGB Histogram</p>
      </Section>
    </div>
  );
});

export default LumetriColorPanel;
