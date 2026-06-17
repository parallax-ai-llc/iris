/**
 * KeyframeEditor - Keyframe timeline editor for video clips
 * Edit animation keyframes for opacity, scale, position, rotation, etc.
 *
 * Features:
 * - Visual keyframe timeline
 * - Property selection
 * - Drag keyframes to adjust timing
 * - Easing curve selection
 * - Add/remove keyframes
 */

import { memo, useState, useCallback, useMemo, useRef } from 'react';
import {
  Key,
  Trash2,
  ChevronRight,
  ChevronDown,
  Diamond,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { Keyframe } from '@/types/videoProject.types';
import { formatTime } from '@/shared/lib/utils/time';
import { KEYFRAME_PROPERTIES } from './keyframeProperties';

/** Minimal clip data needed by KeyframeEditor */
interface KeyframeClip {
  name: string;
  keyframes: Keyframe[];
}

interface KeyframeEditorProps {
  clip: KeyframeClip | null;
  currentTime: number; // relative to clip start
  duration: number; // clip duration
  pixelsPerSecond: number;
  onKeyframeAdd?: (property: Keyframe['property'], time: number) => void;
  onKeyframeUpdate?: (index: number, updates: Partial<Keyframe>) => void;
  onKeyframeRemove?: (index: number) => void;
  onSeek?: (time: number) => void;
  className?: string;
}


// Easing options
const EASING_OPTIONS: { value: Keyframe['easing']; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'ease-in', label: 'Ease In' },
  { value: 'ease-out', label: 'Ease Out' },
  { value: 'ease-in-out', label: 'Ease In Out' },
  { value: 'bezier', label: 'Bezier (Custom)' },
];

// Format time with centisecond precision
const formatTimePrecise = (seconds: number) => formatTime(seconds, { fractionalDigits: 2 });

// Bezier curve editor geometry constants
const BEZIER_SIZE = 120;
const BEZIER_PAD = 8;
const BEZIER_W = BEZIER_SIZE - BEZIER_PAD * 2;

const bezierToSvg = (nx: number, ny: number): [number, number] => [
  BEZIER_PAD + nx * BEZIER_W,
  BEZIER_PAD + (1 - ny) * BEZIER_W,
];

const bezierFromSvg = (sx: number, sy: number): [number, number] => [
  Math.max(0, Math.min(1, (sx - BEZIER_PAD) / BEZIER_W)),
  Math.max(0, Math.min(1, 1 - (sy - BEZIER_PAD) / BEZIER_W)),
];

// Bezier curve editor — SVG-based control point editor
const BezierCurveEditor = memo(function BezierCurveEditor({
  points,
  onChange,
}: {
  points: [number, number, number, number];
  onChange: (points: [number, number, number, number]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const SIZE = BEZIER_SIZE;
  const PAD = BEZIER_PAD;
  const W = BEZIER_W;

  const [p1x, p1y, p2x, p2y] = points;
  const [sx1, sy1] = bezierToSvg(p1x, p1y);
  const [sx2, sy2] = bezierToSvg(p2x, p2y);
  const [startX, startY] = bezierToSvg(0, 0);
  const [endX, endY] = bezierToSvg(1, 1);

  // Generate curve path
  const d = `M ${startX} ${startY} C ${sx1} ${sy1}, ${sx2} ${sy2}, ${endX} ${endY}`;

  // Drag handler factory
  const makeDragHandler = useCallback(
    (cpIndex: 0 | 1) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const svg = svgRef.current;
      if (!svg) return;

      const onMove = (ev: MouseEvent) => {
        const rect = svg.getBoundingClientRect();
        const sx = ev.clientX - rect.left;
        const sy = ev.clientY - rect.top;
        const [nx, ny] = bezierFromSvg(sx, sy);
        const newPoints: [number, number, number, number] = [...points] as [number, number, number, number];
        newPoints[cpIndex * 2] = nx;
        newPoints[cpIndex * 2 + 1] = ny;
        onChange(newPoints);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [points, onChange]
  );

  // Preset curves
  const presets: { label: string; pts: [number, number, number, number] }[] = [
    { label: 'Ease', pts: [0.25, 0.1, 0.25, 1] },
    { label: 'In', pts: [0.42, 0, 1, 1] },
    { label: 'Out', pts: [0, 0, 0.58, 1] },
    { label: 'InOut', pts: [0.42, 0, 0.58, 1] },
    { label: 'Bounce', pts: [0.68, -0.55, 0.27, 1.55] },
  ];

  return (
    <div className="flex items-start gap-2">
      <svg
        ref={svgRef}
        width={SIZE}
        height={SIZE}
        className="bg-zinc-800 rounded border border-zinc-600 flex-shrink-0"
      >
        {/* Grid */}
        <line x1={PAD} y1={PAD} x2={PAD} y2={PAD + W} stroke="#3f3f46" strokeWidth={0.5} />
        <line x1={PAD} y1={PAD + W} x2={PAD + W} y2={PAD + W} stroke="#3f3f46" strokeWidth={0.5} />
        <line x1={PAD} y1={PAD} x2={PAD + W} y2={PAD} stroke="#3f3f46" strokeWidth={0.5} />
        <line x1={PAD + W} y1={PAD} x2={PAD + W} y2={PAD + W} stroke="#3f3f46" strokeWidth={0.5} />
        {/* Linear reference */}
        <line x1={startX} y1={startY} x2={endX} y2={endY} stroke="#52525b" strokeWidth={0.5} strokeDasharray="3,3" />
        {/* Bezier curve */}
        <path d={d} fill="none" stroke="#60a5fa" strokeWidth={2} />
        {/* Control point lines */}
        <line x1={startX} y1={startY} x2={sx1} y2={sy1} stroke="#f59e0b" strokeWidth={1} strokeDasharray="2,2" />
        <line x1={endX} y1={endY} x2={sx2} y2={sy2} stroke="#f59e0b" strokeWidth={1} strokeDasharray="2,2" />
        {/* Start / End points */}
        <circle cx={startX} cy={startY} r={3} fill="#a1a1aa" />
        <circle cx={endX} cy={endY} r={3} fill="#a1a1aa" />
        {/* Control points (draggable) */}
        <circle
          cx={sx1}
          cy={sy1}
          r={5}
          fill="#f59e0b"
          stroke="#fff"
          strokeWidth={1}
          className="cursor-grab active:cursor-grabbing"
          onMouseDown={makeDragHandler(0)}
        />
        <circle
          cx={sx2}
          cy={sy2}
          r={5}
          fill="#f59e0b"
          stroke="#fff"
          strokeWidth={1}
          className="cursor-grab active:cursor-grabbing"
          onMouseDown={makeDragHandler(1)}
        />
      </svg>
      {/* Preset buttons */}
      <div className="flex flex-col gap-0.5">
        {presets.map((p) => (
          <button
            key={p.label}
            className="px-1.5 py-0.5 text-[9px] text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
            onClick={(e) => { e.stopPropagation(); onChange(p.pts); }}
          >
            {p.label}
          </button>
        ))}
        <span className="text-[8px] text-zinc-600 mt-1 text-center">
          {points.map((v) => v.toFixed(2)).join(', ')}
        </span>
      </div>
    </div>
  );
});

// Keyframe diamond component
const KeyframeDiamond = memo(function KeyframeDiamond({
  keyframe,
  index,
  isSelected,
  pixelsPerSecond,
  maxTime,
  onSelect,
  onDrag,
  onRemove,
}: {
  keyframe: Keyframe;
  index: number;
  isSelected: boolean;
  pixelsPerSecond: number;
  maxTime: number;
  onSelect: (index: number) => void;
  onDrag: (index: number, newTime: number) => void;
  onRemove: (index: number) => void;
}) {
  const left = keyframe.time * pixelsPerSecond;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(index);

      const startX = e.clientX;
      const startTime = keyframe.time;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaTime = deltaX / pixelsPerSecond;
        const newTime = Math.max(0, Math.min(maxTime, startTime + deltaTime));
        onDrag(index, newTime);
      };

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [index, keyframe.time, pixelsPerSecond, maxTime, onSelect, onDrag]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onRemove(index);
    },
    [index, onRemove]
  );

  return (
    <div
      className={cn(
        'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer',
        'transition-transform hover:scale-110'
      )}
      style={{ left }}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
    >
      <Diamond
        className={cn(
          'w-3 h-3',
          isSelected ? 'text-white fill-white' : 'text-zinc-400 hover:text-white'
        )}
      />
    </div>
  );
});

// Property row component (exported for inline use in EditorInspector)
export const PropertyRow = memo(function PropertyRow({
  property,
  keyframes,
  duration,
  pixelsPerSecond,
  currentTime,
  isExpanded,
  selectedKeyframeIndex,
  onToggle,
  onKeyframeSelect,
  onKeyframeAdd,
  onKeyframeDrag,
  onKeyframeRemove,
  onKeyframeValueChange,
  onKeyframeEasingChange,
  onKeyframeBezierChange,
  onSeek,
  compact = false,
}: {
  property: (typeof KEYFRAME_PROPERTIES)[0];
  keyframes: Keyframe[];
  duration: number;
  pixelsPerSecond: number;
  currentTime: number;
  isExpanded: boolean;
  selectedKeyframeIndex: number | null;
  onToggle: () => void;
  onKeyframeSelect: (index: number) => void;
  onKeyframeAdd: (time: number) => void;
  onKeyframeDrag: (index: number, newTime: number) => void;
  onKeyframeRemove: (index: number) => void;
  onKeyframeValueChange?: (index: number, value: number) => void;
  onKeyframeEasingChange?: (index: number, easing: Keyframe['easing']) => void;
  onKeyframeBezierChange?: (index: number, points: [number, number, number, number]) => void;
  onSeek: (time: number) => void;
  /** When true, hide the left header (chevron + icon + name) and show only the
   *  timeline strip with a small expand button on the right. Used for inline
   *  embedding inside the Properties tab where the slider already labels the row. */
  compact?: boolean;
}) {
  const Icon = property.icon;
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineWidth = duration * pixelsPerSecond;

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = x / pixelsPerSecond;
      onSeek(Math.max(0, Math.min(duration, time)));
    },
    [duration, pixelsPerSecond, onSeek]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = x / pixelsPerSecond;
      onKeyframeAdd(Math.max(0, Math.min(duration, time)));
    },
    [duration, pixelsPerSecond, onKeyframeAdd]
  );

  return (
    <div className="border-b border-zinc-800 last:border-b-0">
      {/* Property header */}
      <div className="flex items-center">
        {!compact && (
          <button
            onClick={onToggle}
            className="flex items-center gap-2 w-32 px-2 py-1.5 bg-zinc-800/50 hover:bg-zinc-800 transition-colors flex-shrink-0"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            ) : (
              <ChevronRight className="w-3 h-3 text-zinc-500" />
            )}
            <Icon className="w-3 h-3 text-zinc-400" />
            <span className="text-xs text-zinc-300 truncate">{property.name}</span>
          </button>
        )}

        {/* Keyframe timeline */}
        <div
          ref={timelineRef}
          className="flex-1 h-6 bg-zinc-900 relative cursor-pointer overflow-hidden"
          style={{ minWidth: timelineWidth }}
          onClick={handleTimelineClick}
          onDoubleClick={handleDoubleClick}
          title={
            compact
              ? 'Double-click to add keyframe • Drag diamond to move • Right-click to remove'
              : undefined
          }
        >
          {/* Empty-state hint (compact mode only) */}
          {compact && keyframes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[9px] text-zinc-600">
                Move playhead and change the value to add keyframes
              </span>
            </div>
          )}

          {/* Keyframes */}
          {keyframes.map((kf, idx) => (
            <KeyframeDiamond
              key={idx}
              keyframe={kf}
              index={idx}
              isSelected={selectedKeyframeIndex === idx}
              pixelsPerSecond={pixelsPerSecond}
              maxTime={duration}
              onSelect={onKeyframeSelect}
              onDrag={onKeyframeDrag}
              onRemove={onKeyframeRemove}
            />
          ))}

          {/* Playhead indicator */}
          <div
            className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none"
            style={{ left: currentTime * pixelsPerSecond }}
          />

          {/* Keyframe count badge */}
          {keyframes.length > 0 && (
            <div
              className={cn(
                'absolute top-1/2 -translate-y-1/2 px-1 py-0.5 rounded bg-zinc-700 text-[9px] text-zinc-400 pointer-events-none',
                compact ? 'right-7' : 'right-1',
              )}
            >
              {keyframes.length}
            </div>
          )}
        </div>

        {/* Compact-mode expand button (replaces left header chevron) */}
        {compact && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="flex-shrink-0 px-1.5 h-6 bg-zinc-900 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
            title={isExpanded ? 'Hide keyframe list' : 'Show keyframe list'}
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </button>
        )}
      </div>

      {/* Expanded value editor */}
      {isExpanded && keyframes.length > 0 && (
        <div className="px-2 py-2 bg-zinc-800/30 space-y-2">
          {keyframes.map((kf, idx) => (
            <div
              key={idx}
              className={cn(
                'flex items-center gap-2 p-2 rounded',
                selectedKeyframeIndex === idx
                  ? 'bg-zinc-700'
                  : 'hover:bg-zinc-800'
              )}
              onClick={() => onKeyframeSelect(idx)}
            >
              <Diamond className="w-3 h-3 text-zinc-400 flex-shrink-0" />
              <span className="text-[10px] text-zinc-500 w-16 flex-shrink-0">
                {formatTimePrecise(kf.time)}
              </span>
              <input
                type="number"
                value={kf.value}
                min={property.min}
                max={property.max}
                step={property.step}
                className="w-16 px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-600 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) onKeyframeValueChange?.(idx, v);
                }}
              />
              <span className="text-[10px] text-zinc-500">{property.unit}</span>
              <select
                value={kf.easing || 'linear'}
                className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-600 text-xs text-white focus:outline-none"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onKeyframeEasingChange?.(idx, e.target.value as Keyframe['easing'])}
              >
                {EASING_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onKeyframeRemove(idx);
                }}
                className="p-1 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {/* Bezier curve editor for selected keyframe with bezier easing */}
          {selectedKeyframeIndex !== null &&
            keyframes[selectedKeyframeIndex]?.easing === 'bezier' && (
              <div className="px-2 pb-2" onClick={(e) => e.stopPropagation()}>
                <BezierCurveEditor
                  points={keyframes[selectedKeyframeIndex].bezierPoints || [0.25, 0.1, 0.25, 1]}
                  onChange={(pts) => onKeyframeBezierChange?.(selectedKeyframeIndex, pts)}
                />
              </div>
            )}
        </div>
      )}
    </div>
  );
});

// Main KeyframeEditor component
export const KeyframeEditor = memo(function KeyframeEditor({
  clip,
  currentTime,
  duration,
  pixelsPerSecond,
  onKeyframeAdd,
  onKeyframeUpdate,
  onKeyframeRemove,
  onSeek,
  className,
}: KeyframeEditorProps) {
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(
    new Set(['opacity', 'scale'])
  );
  const [selectedKeyframeIndex, setSelectedKeyframeIndex] = useState<number | null>(null);

  // Group keyframes by property + track global indices
  const { keyframesByProperty, globalIndicesByProperty } = useMemo(() => {
    const byProp: Record<Keyframe['property'], Keyframe[]> = {} as Record<Keyframe['property'], Keyframe[]>;
    const globalIdxByProp: Record<Keyframe['property'], number[]> = {} as Record<Keyframe['property'], number[]>;

    KEYFRAME_PROPERTIES.forEach((prop) => {
      byProp[prop.id] = [];
      globalIdxByProp[prop.id] = [];
    });

    if (clip?.keyframes) {
      clip.keyframes.forEach((kf, globalIdx) => {
        if (byProp[kf.property]) {
          byProp[kf.property].push(kf);
          globalIdxByProp[kf.property].push(globalIdx);
        }
      });
    }

    // Sort by time
    for (const key of Object.keys(byProp) as Keyframe['property'][]) {
      const combined = byProp[key].map((kf, i) => ({ kf, idx: globalIdxByProp[key][i] }));
      combined.sort((a, b) => a.kf.time - b.kf.time);
      byProp[key] = combined.map((c) => c.kf);
      globalIdxByProp[key] = combined.map((c) => c.idx);
    }

    return { keyframesByProperty: byProp, globalIndicesByProperty: globalIdxByProp };
  }, [clip?.keyframes]);

  // Toggle property expansion
  const toggleProperty = useCallback((propertyId: string) => {
    setExpandedProperties((prev) => {
      const next = new Set(prev);
      if (next.has(propertyId)) {
        next.delete(propertyId);
      } else {
        next.add(propertyId);
      }
      return next;
    });
  }, []);

  // Handle keyframe drag — map local idx → global idx
  const makeHandleKeyframeDrag = useCallback(
    (propId: Keyframe['property']) => (localIdx: number, newTime: number) => {
      const globalIdx = globalIndicesByProperty[propId]?.[localIdx] ?? localIdx;
      onKeyframeUpdate?.(globalIdx, { time: newTime });
    },
    [globalIndicesByProperty, onKeyframeUpdate]
  );

  const makeHandleKeyframeRemove = useCallback(
    (propId: Keyframe['property']) => (localIdx: number) => {
      const globalIdx = globalIndicesByProperty[propId]?.[localIdx] ?? localIdx;
      onKeyframeRemove?.(globalIdx);
    },
    [globalIndicesByProperty, onKeyframeRemove]
  );

  const makeHandleKeyframeValueChange = useCallback(
    (propId: Keyframe['property']) => (localIdx: number, value: number) => {
      const globalIdx = globalIndicesByProperty[propId]?.[localIdx] ?? localIdx;
      onKeyframeUpdate?.(globalIdx, { value });
    },
    [globalIndicesByProperty, onKeyframeUpdate]
  );

  const makeHandleKeyframeEasingChange = useCallback(
    (propId: Keyframe['property']) => (localIdx: number, easing: Keyframe['easing']) => {
      const globalIdx = globalIndicesByProperty[propId]?.[localIdx] ?? localIdx;
      onKeyframeUpdate?.(globalIdx, { easing });
    },
    [globalIndicesByProperty, onKeyframeUpdate]
  );

  const makeHandleKeyframeBezierChange = useCallback(
    (propId: Keyframe['property']) => (localIdx: number, points: [number, number, number, number]) => {
      const globalIdx = globalIndicesByProperty[propId]?.[localIdx] ?? localIdx;
      onKeyframeUpdate?.(globalIdx, { bezierPoints: points });
    },
    [globalIndicesByProperty, onKeyframeUpdate]
  );

  if (!clip) {
    return (
      <div className={cn('flex flex-col h-full bg-zinc-900', className)}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
          <Key className="w-4 h-4 text-zinc-400" />
          <h3 className="text-sm font-medium text-white">Keyframes</h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Key className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
            <p className="text-sm text-zinc-400">Select a clip to edit keyframes</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full bg-zinc-900', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-zinc-400" />
          <h3 className="text-sm font-medium text-white">Keyframes</h3>
        </div>
        <span className="text-xs text-zinc-500">{clip.name}</span>
      </div>

      {/* Time ruler */}
      <div className="flex items-center border-b border-zinc-800">
        <div className="w-32 flex-shrink-0 px-2 py-1 bg-zinc-800/50">
          <span className="text-[10px] text-zinc-500">Property</span>
        </div>
        <div
          className="flex-1 h-5 relative overflow-hidden"
          style={{ minWidth: duration * pixelsPerSecond }}
        >
          {/* Time markers */}
          {Array.from({ length: Math.ceil(duration) + 1 }).map((_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 border-l border-zinc-700"
              style={{ left: i * pixelsPerSecond }}
            >
              <span className="absolute top-0 left-1 text-[9px] text-zinc-500">
                {i}s
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Properties list */}
      <div className="flex-1 overflow-auto">
        {/* Transform properties */}
        <div className="border-b border-zinc-700">
          <div className="px-2 py-1 bg-zinc-800/30">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Transform</span>
          </div>
          {KEYFRAME_PROPERTIES.filter((p) => p.category === 'transform').map((prop) => (
            <PropertyRow
              key={prop.id}
              property={prop}
              keyframes={keyframesByProperty[prop.id]}
              duration={duration}
              pixelsPerSecond={pixelsPerSecond}
              currentTime={currentTime}
              isExpanded={expandedProperties.has(prop.id)}
              selectedKeyframeIndex={selectedKeyframeIndex}
              onToggle={() => toggleProperty(prop.id)}
              onKeyframeSelect={setSelectedKeyframeIndex}
              onKeyframeAdd={(time) => onKeyframeAdd?.(prop.id, time)}
              onKeyframeDrag={makeHandleKeyframeDrag(prop.id)}
              onKeyframeRemove={makeHandleKeyframeRemove(prop.id)}
              onKeyframeValueChange={makeHandleKeyframeValueChange(prop.id)}
              onKeyframeEasingChange={makeHandleKeyframeEasingChange(prop.id)}
              onKeyframeBezierChange={makeHandleKeyframeBezierChange(prop.id)}
              onSeek={onSeek || (() => {})}
            />
          ))}
        </div>

        {/* Audio properties */}
        <div className="border-b border-zinc-700">
          <div className="px-2 py-1 bg-zinc-800/30">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Audio</span>
          </div>
          {KEYFRAME_PROPERTIES.filter((p) => p.category === 'audio').map((prop) => (
            <PropertyRow
              key={prop.id}
              property={prop}
              keyframes={keyframesByProperty[prop.id]}
              duration={duration}
              pixelsPerSecond={pixelsPerSecond}
              currentTime={currentTime}
              isExpanded={expandedProperties.has(prop.id)}
              selectedKeyframeIndex={selectedKeyframeIndex}
              onToggle={() => toggleProperty(prop.id)}
              onKeyframeSelect={setSelectedKeyframeIndex}
              onKeyframeAdd={(time) => onKeyframeAdd?.(prop.id, time)}
              onKeyframeDrag={makeHandleKeyframeDrag(prop.id)}
              onKeyframeRemove={makeHandleKeyframeRemove(prop.id)}
              onKeyframeValueChange={makeHandleKeyframeValueChange(prop.id)}
              onKeyframeEasingChange={makeHandleKeyframeEasingChange(prop.id)}
              onKeyframeBezierChange={makeHandleKeyframeBezierChange(prop.id)}
              onSeek={onSeek || (() => {})}
            />
          ))}
        </div>

        {/* Filter properties */}
        <div>
          <div className="px-2 py-1 bg-zinc-800/30">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Filters</span>
          </div>
          {KEYFRAME_PROPERTIES.filter((p) => p.category === 'filter').map((prop) => (
            <PropertyRow
              key={prop.id}
              property={prop}
              keyframes={keyframesByProperty[prop.id]}
              duration={duration}
              pixelsPerSecond={pixelsPerSecond}
              currentTime={currentTime}
              isExpanded={expandedProperties.has(prop.id)}
              selectedKeyframeIndex={selectedKeyframeIndex}
              onToggle={() => toggleProperty(prop.id)}
              onKeyframeSelect={setSelectedKeyframeIndex}
              onKeyframeAdd={(time) => onKeyframeAdd?.(prop.id, time)}
              onKeyframeDrag={makeHandleKeyframeDrag(prop.id)}
              onKeyframeRemove={makeHandleKeyframeRemove(prop.id)}
              onKeyframeValueChange={makeHandleKeyframeValueChange(prop.id)}
              onKeyframeEasingChange={makeHandleKeyframeEasingChange(prop.id)}
              onKeyframeBezierChange={makeHandleKeyframeBezierChange(prop.id)}
              onSeek={onSeek || (() => {})}
            />
          ))}
        </div>
      </div>

    </div>
  );
});

export default KeyframeEditor;
