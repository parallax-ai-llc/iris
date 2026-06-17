/**
 * EditorInspector - Properties panel for selected clip
 * Edit clip properties, subtitle styling, and effects
 */

import { memo, useCallback, useMemo, useState } from 'react';
import {
  Type,
  Palette,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  Volume2,
  Move,
  Sliders,
  Clock,
  Trash2,
  Copy,
  Scissors,
  VolumeX,
  Gauge,
  Eye,
  EyeOff,
  Sparkles,
  Clapperboard,
  Bold,
  Italic,
  Layers,
  Watch,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  useEditorStore,
  type Clip,
  type VideoClip,
  type AudioClip,
  type SubtitleClip,
  type MusicClip,
  type AdjustmentClip,
  type BlendMode,
  type SubtitleStyle,
  type SubtitleAnimation,
  hasEffects,
} from '@/features/video-editor/stores/editor.store';
import { formatSMPTE } from '@/shared/api/subtitle.api';
import { PropertyRow } from './KeyframeEditor';
import { KEYFRAME_PROPERTIES } from './keyframeProperties';
import type { Keyframe } from '@/types/videoProject.types';

// Look up keyframe property metadata (min/max/step/icon) once
const KF_PROP_BY_ID = Object.fromEntries(
  KEYFRAME_PROPERTIES.map((p) => [p.id, p]),
) as Record<Keyframe['property'], (typeof KEYFRAME_PROPERTIES)[number]>;

interface EditorInspectorProps {
  className?: string;
  style?: React.CSSProperties;
}

// Section header component
const SectionHeader = memo(function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: typeof Type;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 border-b border-zinc-700">
      <Icon className="w-4 h-4 text-zinc-400" />
      <span className="text-xs font-medium text-zinc-300">{title}</span>
    </div>
  );
});

// Input field component
const InputField = memo(function InputField({
  label,
  value,
  onChange,
  type = 'text',
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: 'text' | 'number' | 'color';
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="text-xs text-zinc-400">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          step={step}
          className={cn(
            'px-2 py-1 rounded text-xs text-white',
            'bg-zinc-700 border border-zinc-600',
            'focus:outline-none focus:ring-1 focus:ring-white/30',
            type === 'color' ? 'w-8 h-6 p-0' : 'w-20'
          )}
        />
        {suffix && <span className="text-xs text-zinc-500">{suffix}</span>}
      </div>
    </div>
  );
});

// Slider field component
const SliderField = memo(function SliderField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix,
  kfButton,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  kfButton?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {kfButton}
          <label className="text-xs text-zinc-400">{label}</label>
        </div>
        <span className="text-xs text-zinc-500">
          {(value ?? 0).toFixed(step < 1 ? 2 : 0)}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        value={value ?? 0}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        min={min}
        max={max}
        step={step}
        className={cn(
          'w-full h-1 rounded-full appearance-none cursor-pointer',
          'bg-zinc-600',
          '[&::-webkit-slider-thumb]:appearance-none',
          '[&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3',
          '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white/70',
          '[&::-webkit-slider-thumb]:cursor-pointer'
        )}
      />
    </div>
  );
});

// Button group component
const ButtonGroup = memo(function ButtonGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; icon: typeof AlignLeft; title: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 bg-zinc-700 rounded">
      {options.map(({ value: optValue, icon: Icon, title }) => (
        <button
          key={optValue}
          className={cn(
            'p-1.5 rounded transition-colors',
            optValue === value
              ? 'bg-white/10 text-white border border-white/20'
              : 'text-zinc-400 hover:text-white'
          )}
          onClick={() => onChange(optValue)}
          title={title}
        >
          <Icon className="w-3 h-3" />
        </button>
      ))}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Keyframe-aware editing (Premiere-style stopwatch toggle on Properties tab)
// ---------------------------------------------------------------------------

const KEYFRAME_TIME_TOLERANCE = 0.05; // seconds — snap edits within this window

/**
 * Hook that exposes per-property keyframe helpers for the currently selected
 * clip in the Properties tab. Returns whether a property is animated and a
 * recordKeyframe() that should be called from every onChange handler.
 *
 * Behavior:
 * - If a property has no keyframes, recordKeyframe() is a no-op (the slider
 *   simply updates the static clip property as before).
 * - If a property is animated, recordKeyframe() either updates the keyframe at
 *   the current time (within tolerance) or adds a new one. The static clip
 *   property is also updated so it remains a sensible fallback.
 */
function useKeyframeAware(clipId: string, clipStartTime: number, keyframes: Keyframe[] | undefined) {
  const currentTime = useEditorStore((s) => s.currentTime);
  const addClipKeyframe = useEditorStore((s) => s.addClipKeyframe);
  const updateClipKeyframe = useEditorStore((s) => s.updateClipKeyframe);
  const removeClipKeyframe = useEditorStore((s) => s.removeClipKeyframe);

  const localTime = Math.max(0, currentTime - clipStartTime);

  const animatedSet = useMemo(() => {
    const set = new Set<Keyframe['property']>();
    keyframes?.forEach((k) => set.add(k.property));
    return set;
  }, [keyframes]);

  const isAnimated = useCallback((property: Keyframe['property']) => animatedSet.has(property), [animatedSet]);

  const recordKeyframe = useCallback(
    (property: Keyframe['property'], value: number) => {
      if (!animatedSet.has(property)) return;
      const list = keyframes ?? [];
      // Find global index of an existing keyframe at the current time for this property
      const idx = list.findIndex(
        (k) => k.property === property && Math.abs(k.time - localTime) < KEYFRAME_TIME_TOLERANCE,
      );
      if (idx >= 0) {
        updateClipKeyframe(clipId, idx, { value });
      } else {
        addClipKeyframe(clipId, { property, time: localTime, value, easing: 'linear' });
      }
    },
    [animatedSet, keyframes, localTime, clipId, addClipKeyframe, updateClipKeyframe],
  );

  const enableAnimation = useCallback(
    (property: Keyframe['property'], currentValue: number) => {
      if (animatedSet.has(property)) return;
      addClipKeyframe(clipId, { property, time: localTime, value: currentValue, easing: 'linear' });
    },
    [animatedSet, addClipKeyframe, clipId, localTime],
  );

  const disableAnimation = useCallback(
    (property: Keyframe['property']) => {
      if (!keyframes || keyframes.length === 0) return;
      // Remove from highest index first to keep indices stable
      const indices: number[] = [];
      keyframes.forEach((k, i) => {
        if (k.property === property) indices.push(i);
      });
      for (let i = indices.length - 1; i >= 0; i--) {
        removeClipKeyframe(clipId, indices[i]);
      }
    },
    [keyframes, removeClipKeyframe, clipId],
  );

  return { isAnimated, recordKeyframe, enableAnimation, disableAnimation };
}

// Inline mini timeline + keyframe list editor for a single property.
// Reuses PropertyRow from KeyframeEditor.tsx and wires it into the store.
const InlineKeyframeRow = memo(function InlineKeyframeRow({
  clipId,
  clipStartTime,
  clipDuration,
  property,
  allKeyframes,
}: {
  clipId: string;
  clipStartTime: number;
  clipDuration: number;
  property: Keyframe['property'];
  allKeyframes: Keyframe[];
}) {
  const currentTime = useEditorStore((s) => s.currentTime);
  const pixelsPerSecond = useEditorStore((s) => s.pixelsPerSecond);
  const addClipKeyframe = useEditorStore((s) => s.addClipKeyframe);
  const updateClipKeyframe = useEditorStore((s) => s.updateClipKeyframe);
  const removeClipKeyframe = useEditorStore((s) => s.removeClipKeyframe);
  const seek = useEditorStore((s) => s.seek);
  const [expanded, setExpanded] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Local-to-global index map for this property
  const { localKfs, localToGlobal } = useMemo(() => {
    const local: Keyframe[] = [];
    const map: number[] = [];
    allKeyframes.forEach((k, i) => {
      if (k.property === property) {
        local.push(k);
        map.push(i);
      }
    });
    // Sort by time but keep global index correspondence
    const indexed = local.map((kf, i) => ({ kf, idx: map[i] }));
    indexed.sort((a, b) => a.kf.time - b.kf.time);
    return {
      localKfs: indexed.map((x) => x.kf),
      localToGlobal: indexed.map((x) => x.idx),
    };
  }, [allKeyframes, property]);

  const propMeta = KF_PROP_BY_ID[property];
  if (!propMeta) return null;

  return (
    <div className="-mx-3 mt-1 border-y border-zinc-800/70 bg-zinc-900/40">
      <PropertyRow
        compact
        property={propMeta}
        keyframes={localKfs}
        duration={clipDuration}
        pixelsPerSecond={pixelsPerSecond * 0.5}
        currentTime={Math.max(0, currentTime - clipStartTime)}
        isExpanded={expanded}
        selectedKeyframeIndex={selectedIdx}
        onToggle={() => setExpanded((v) => !v)}
        onKeyframeSelect={setSelectedIdx}
        onKeyframeAdd={(time) => {
          addClipKeyframe(clipId, {
            property,
            time,
            value: propMeta.defaultValue,
            easing: 'linear',
          });
        }}
        onKeyframeDrag={(localIdx, newTime) => {
          const g = localToGlobal[localIdx];
          if (g != null) updateClipKeyframe(clipId, g, { time: newTime });
        }}
        onKeyframeRemove={(localIdx) => {
          const g = localToGlobal[localIdx];
          if (g != null) removeClipKeyframe(clipId, g);
        }}
        onKeyframeValueChange={(localIdx, value) => {
          const g = localToGlobal[localIdx];
          if (g != null) updateClipKeyframe(clipId, g, { value });
        }}
        onKeyframeEasingChange={(localIdx, easing) => {
          const g = localToGlobal[localIdx];
          if (g != null) updateClipKeyframe(clipId, g, { easing });
        }}
        onKeyframeBezierChange={(localIdx, points) => {
          const g = localToGlobal[localIdx];
          if (g != null) updateClipKeyframe(clipId, g, { bezierPoints: points });
        }}
        onSeek={(relTime) => seek(clipStartTime + relTime)}
      />
    </div>
  );
});

// Stopwatch toggle button shown next to keyframe-able properties
const KeyframeToggle = memo(function KeyframeToggle({
  active,
  onToggle,
  title,
}: {
  active: boolean;
  onToggle: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={title ?? (active ? 'Disable keyframes' : 'Enable keyframes')}
      className={cn(
        'p-0.5 rounded transition-colors',
        active ? 'text-blue-400 hover:text-blue-300' : 'text-zinc-600 hover:text-zinc-300',
      )}
    >
      <Watch className="w-3 h-3" />
    </button>
  );
});

// Subtitle properties panel
const SubtitleProperties = memo(function SubtitleProperties({
  clip,
}: {
  clip: SubtitleClip;
}) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const updateSubtitleStyle = useEditorStore((s) => s.updateSubtitleStyle);

  const handleTextChange = useCallback(
    (text: string) => {
      updateClip(clip.id, { text, name: text.substring(0, 30) });
    },
    [clip.id, updateClip]
  );

  const handleStyleChange = useCallback(
    <K extends keyof SubtitleStyle>(key: K, value: SubtitleStyle[K]) => {
      updateSubtitleStyle(clip.id, { [key]: value });
    },
    [clip.id, updateSubtitleStyle]
  );

  return (
    <>
      {/* Text content */}
      <div className="p-3 border-b border-zinc-700">
        <label className="block text-xs text-zinc-400 mb-1.5">Subtitle Text</label>
        <textarea
          value={clip.text}
          onChange={(e) => handleTextChange(e.target.value)}
          className={cn(
            'w-full px-2 py-1.5 rounded text-sm text-white',
            'bg-zinc-700 border border-zinc-600',
            'focus:outline-none focus:ring-1 focus:ring-white/30',
            'resize-none'
          )}
          rows={3}
        />
      </div>

      {/* Typography */}
      <SectionHeader icon={Type} title="Typography" />
      <div className="p-3 space-y-3 border-b border-zinc-700">
        <InputField
          label="Font Size"
          value={clip.style.fontSize}
          onChange={(v) => handleStyleChange('fontSize', parseInt(v) || 24)}
          type="number"
          min={8}
          max={72}
          suffix="px"
        />

        <div className="flex items-center justify-between">
          <label className="text-xs text-zinc-400">Font Family</label>
          <select
            value={clip.style.fontFamily}
            onChange={(e) => handleStyleChange('fontFamily', e.target.value)}
            className="px-2 py-1 rounded text-xs text-white bg-zinc-700 border border-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/30"
          >
            <option value="Arial">Arial</option>
            <option value="Helvetica">Helvetica</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Georgia">Georgia</option>
            <option value="Verdana">Verdana</option>
            <option value="Courier New">Courier New</option>
          </select>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-xs text-zinc-400">Alignment</label>
          <ButtonGroup
            options={[
              { value: 'left' as const, icon: AlignLeft, title: 'Left' },
              { value: 'center' as const, icon: AlignCenter, title: 'Center' },
              { value: 'right' as const, icon: AlignRight, title: 'Right' },
            ]}
            value={clip.style.alignment}
            onChange={(v) => handleStyleChange('alignment', v as 'left' | 'center' | 'right')}
          />
        </div>

        {/* Bold / Italic toggles */}
        <div className="flex items-center justify-between">
          <label className="text-xs text-zinc-400">Style</label>
          <div className="flex gap-1">
            <button
              title="Bold"
              className={cn(
                'p-1.5 rounded transition-colors',
                (clip.style.fontWeight ?? 'normal') === 'bold'
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-zinc-700 text-zinc-400 hover:text-white'
              )}
              onClick={() =>
                handleStyleChange(
                  'fontWeight',
                  (clip.style.fontWeight ?? 'normal') === 'bold' ? 'normal' : 'bold'
                )
              }
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              title="Italic"
              className={cn(
                'p-1.5 rounded transition-colors',
                (clip.style.fontStyle ?? 'normal') === 'italic'
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-zinc-700 text-zinc-400 hover:text-white'
              )}
              onClick={() =>
                handleStyleChange(
                  'fontStyle',
                  (clip.style.fontStyle ?? 'normal') === 'italic' ? 'normal' : 'italic'
                )
              }
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Text Transform */}
        <div className="flex items-center justify-between">
          <label className="text-xs text-zinc-400">Transform</label>
          <select
            value={clip.style.textTransform ?? 'none'}
            onChange={(e) =>
              handleStyleChange(
                'textTransform',
                e.target.value as 'none' | 'uppercase' | 'lowercase' | 'capitalize'
              )
            }
            className="px-2 py-1 rounded text-xs text-white bg-zinc-700 border border-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/30"
          >
            <option value="none">None</option>
            <option value="uppercase">UPPERCASE</option>
            <option value="lowercase">lowercase</option>
            <option value="capitalize">Capitalize</option>
          </select>
        </div>
      </div>

      {/* Colors */}
      <SectionHeader icon={Palette} title="Colors" />
      <div className="p-3 space-y-3 border-b border-zinc-700">
        <InputField
          label="Text Color"
          value={clip.style.fontColor}
          onChange={(v) => handleStyleChange('fontColor', v)}
          type="color"
        />

        <InputField
          label="Background"
          value={clip.style.backgroundColor}
          onChange={(v) => handleStyleChange('backgroundColor', v)}
          type="color"
        />

        <SliderField
          label="BG Opacity"
          value={clip.style.backgroundOpacity}
          onChange={(v) => handleStyleChange('backgroundOpacity', v)}
          min={0}
          max={1}
          step={0.1}
          suffix=""
        />
      </div>

      {/* Position */}
      <SectionHeader icon={Move} title="Position" />
      <div className="p-3 space-y-3 border-b border-zinc-700">
        <SliderField
          label="Horizontal"
          value={clip.style.position.x}
          onChange={(v) =>
            handleStyleChange('position', { ...clip.style.position, x: v })
          }
          min={0}
          max={100}
          suffix="%"
        />

        <SliderField
          label="Vertical"
          value={clip.style.position.y}
          onChange={(v) =>
            handleStyleChange('position', { ...clip.style.position, y: v })
          }
          min={0}
          max={100}
          suffix="%"
        />

        <div className="flex items-center justify-between">
          <label className="text-xs text-zinc-400">Vertical Align</label>
          <ButtonGroup
            options={[
              { value: 'top' as const, icon: AlignVerticalJustifyStart, title: 'Top' },
              { value: 'middle' as const, icon: AlignVerticalJustifyCenter, title: 'Middle' },
              { value: 'bottom' as const, icon: AlignVerticalJustifyEnd, title: 'Bottom' },
            ]}
            value={clip.style.verticalAlign}
            onChange={(v) => handleStyleChange('verticalAlign', v as 'top' | 'middle' | 'bottom')}
          />
        </div>

        {/* Position presets — 9-grid */}
        <div className="grid grid-cols-3 gap-1 mt-2">
          {[
            { x: 10, y: 10, label: 'TL' },
            { x: 50, y: 10, label: 'Top' },
            { x: 90, y: 10, label: 'TR' },
            { x: 10, y: 50, label: 'Left' },
            { x: 50, y: 50, label: 'Center' },
            { x: 90, y: 50, label: 'Right' },
            { x: 10, y: 85, label: 'BL' },
            { x: 50, y: 85, label: 'Bottom' },
            { x: 90, y: 85, label: 'BR' },
          ].map(({ x, y, label }) => (
            <button
              key={label}
              className={cn(
                'px-2 py-1 rounded text-[10px] transition-colors',
                clip.style.position.x === x && clip.style.position.y === y
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-zinc-700 text-zinc-400 hover:text-white'
              )}
              onClick={() => handleStyleChange('position', { x, y })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Styling */}
      <SectionHeader icon={Layers} title="Advanced Styling" />
      <div className="p-3 space-y-3 border-b border-zinc-700">
        <SliderField
          label="Letter Spacing"
          value={clip.style.letterSpacing ?? 0}
          onChange={(v) => handleStyleChange('letterSpacing', v)}
          min={-5}
          max={20}
          step={0.5}
          suffix="px"
        />

        <SliderField
          label="Line Height"
          value={clip.style.lineHeight ?? 1.2}
          onChange={(v) => handleStyleChange('lineHeight', v)}
          min={0.8}
          max={3.0}
          step={0.1}
          suffix="x"
        />

        {/* Text Stroke */}
        <div className="flex items-center justify-between">
          <label className="text-xs text-zinc-400">Text Stroke</label>
          <button
            className={cn(
              'px-3 py-1 rounded text-xs transition-colors',
              clip.style.stroke
                ? 'bg-white/10 text-white border border-white/20'
                : 'bg-zinc-700 text-zinc-400 hover:text-white'
            )}
            onClick={() =>
              handleStyleChange(
                'stroke',
                clip.style.stroke ? undefined : { color: '#000000', width: 1 }
              )
            }
          >
            {clip.style.stroke ? 'ON' : 'OFF'}
          </button>
        </div>
        {clip.style.stroke && (
          <>
            <InputField
              label="Stroke Color"
              value={clip.style.stroke.color}
              onChange={(v) =>
                handleStyleChange('stroke', { ...clip.style.stroke!, color: v })
              }
              type="color"
            />
            <SliderField
              label="Stroke Width"
              value={clip.style.stroke.width}
              onChange={(v) =>
                handleStyleChange('stroke', { ...clip.style.stroke!, width: v })
              }
              min={0.5}
              max={5}
              step={0.5}
              suffix="px"
            />
          </>
        )}

        {/* Drop Shadow */}
        <div className="flex items-center justify-between">
          <label className="text-xs text-zinc-400">Drop Shadow</label>
          <button
            className={cn(
              'px-3 py-1 rounded text-xs transition-colors',
              clip.style.dropShadow
                ? 'bg-white/10 text-white border border-white/20'
                : 'bg-zinc-700 text-zinc-400 hover:text-white'
            )}
            onClick={() =>
              handleStyleChange(
                'dropShadow',
                clip.style.dropShadow
                  ? undefined
                  : { color: '#000000', offsetX: 2, offsetY: 2, blur: 4 }
              )
            }
          >
            {clip.style.dropShadow ? 'ON' : 'OFF'}
          </button>
        </div>
        {clip.style.dropShadow && (
          <>
            <InputField
              label="Shadow Color"
              value={clip.style.dropShadow.color}
              onChange={(v) =>
                handleStyleChange('dropShadow', {
                  ...clip.style.dropShadow!,
                  color: v,
                })
              }
              type="color"
            />
            <SliderField
              label="Offset X"
              value={clip.style.dropShadow.offsetX}
              onChange={(v) =>
                handleStyleChange('dropShadow', {
                  ...clip.style.dropShadow!,
                  offsetX: v,
                })
              }
              min={-10}
              max={10}
              suffix="px"
            />
            <SliderField
              label="Offset Y"
              value={clip.style.dropShadow.offsetY}
              onChange={(v) =>
                handleStyleChange('dropShadow', {
                  ...clip.style.dropShadow!,
                  offsetY: v,
                })
              }
              min={-10}
              max={10}
              suffix="px"
            />
            <SliderField
              label="Blur"
              value={clip.style.dropShadow.blur}
              onChange={(v) =>
                handleStyleChange('dropShadow', {
                  ...clip.style.dropShadow!,
                  blur: v,
                })
              }
              min={0}
              max={20}
              suffix="px"
            />
          </>
        )}
      </div>

      {/* Animation */}
      <SectionHeader icon={Clapperboard} title="Animation" />
      <div className="p-3 space-y-3 border-b border-zinc-700">
        <div className="grid grid-cols-3 gap-1.5">
          {([
            { value: 'none', label: 'None', desc: 'No animation' },
            { value: 'highlight', label: 'Karaoke', desc: 'Word-by-word color' },
            { value: 'typewriter', label: 'Typewriter', desc: 'Type character by character' },
            { value: 'bounce', label: 'Bounce', desc: 'Words bounce in' },
            { value: 'scale', label: 'Pop', desc: 'Current word scales up' },
            { value: 'fade-word', label: 'Fade', desc: 'Words fade in' },
            { value: 'slide-up', label: 'Slide Up', desc: 'Slide from below' },
            { value: 'glow', label: 'Glow', desc: 'Pulsing glow effect' },
            { value: 'wave', label: 'Wave', desc: 'Wave motion' },
          ] as { value: SubtitleAnimation; label: string; desc: string }[]).map(({ value, label, desc }) => (
            <button
              key={value}
              title={desc}
              className={cn(
                'px-2 py-1.5 rounded text-[10px] transition-colors text-center',
                (clip.style.animation ?? 'none') === value
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-zinc-700 text-zinc-400 hover:text-white'
              )}
              onClick={() => handleStyleChange('animation', value)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Animation accent color — only shown for animations that use it */}
        {clip.style.animation && clip.style.animation !== 'none' && (
          <InputField
            label="Accent Color"
            value={clip.style.animationColor ?? '#FFD700'}
            onChange={(v) => handleStyleChange('animationColor', v)}
            type="color"
          />
        )}
      </div>
    </>
  );
});

// Audio/Music properties panel
const AudioProperties = memo(function AudioProperties({
  clip,
}: {
  clip: AudioClip | MusicClip;
}) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const clipKeyframes = 'keyframes' in clip ? clip.keyframes : undefined;
  const kf = useKeyframeAware(clip.id, clip.startTime, clipKeyframes);

  const handleVolumeChange = useCallback(
    (volume: number) => {
      updateClip(clip.id, { volume });
      kf.recordKeyframe('volume', volume);
    },
    [clip.id, updateClip, kf]
  );

  const handleMuteToggle = useCallback(() => {
    if (clip.type === 'audio') {
      updateClip(clip.id, { muted: !(clip as AudioClip).muted });
    }
  }, [clip, updateClip]);

  return (
    <>
      <SectionHeader icon={Volume2} title="Audio" />
      <div className="p-3 space-y-3 border-b border-zinc-700">
        <SliderField
          label="Volume"
          value={clip.volume * 100}
          onChange={(v) => handleVolumeChange(v / 100)}
          min={0}
          max={100}
          suffix="%"
          kfButton={
            <KeyframeToggle
              active={kf.isAnimated('volume')}
              onToggle={() =>
                kf.isAnimated('volume')
                  ? kf.disableAnimation('volume')
                  : kf.enableAnimation('volume', clip.volume)
              }
            />
          }
        />
        {kf.isAnimated('volume') && (
          <InlineKeyframeRow
            clipId={clip.id}
            clipStartTime={clip.startTime}
            clipDuration={clip.endTime - clip.startTime}
            property="volume"
            allKeyframes={clipKeyframes ?? []}
          />
        )}

        {clip.type === 'audio' && (
          <div className="flex items-center justify-between">
            <label className="text-xs text-zinc-400">Muted</label>
            <button
              className={cn(
                'px-3 py-1 rounded text-xs transition-colors',
                (clip as AudioClip).muted
                  ? 'bg-red-600/20 text-red-400'
                  : 'bg-zinc-700 text-zinc-400 hover:text-white'
              )}
              onClick={handleMuteToggle}
            >
              {(clip as AudioClip).muted ? 'Muted' : 'Unmuted'}
            </button>
          </div>
        )}

        {(clip.type === 'audio' || clip.type === 'music') && (
          <>
            <SliderField
              label="Fade In"
              value={(clip as AudioClip | MusicClip).fadeIn}
              onChange={(v) => updateClip(clip.id, { fadeIn: v })}
              min={0}
              max={5}
              step={0.1}
              suffix="s"
            />

            <SliderField
              label="Fade Out"
              value={(clip as AudioClip | MusicClip).fadeOut}
              onChange={(v) => updateClip(clip.id, { fadeOut: v })}
              min={0}
              max={5}
              step={0.1}
              suffix="s"
            />
          </>
        )}
      </div>
    </>
  );
});

// Video properties panel
const VideoProperties = memo(function VideoProperties({
  clip,
}: {
  clip: VideoClip;
}) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const kf = useKeyframeAware(clip.id, clip.startTime, clip.keyframes);

  const handleTransformChange = useCallback(
    <K extends keyof VideoClip['transform']>(
      key: K,
      value: VideoClip['transform'][K]
    ) => {
      updateClip(clip.id, {
        transform: { ...clip.transform, [key]: value },
      });
      if (typeof value === 'number') {
        // Map transform key → keyframe property name (they happen to match)
        kf.recordKeyframe(key as Keyframe['property'], value);
      }
    },
    [clip.id, clip.transform, updateClip, kf]
  );

  const handleVolumeChange = useCallback(
    (v: number) => {
      const next = v / 100;
      updateClip(clip.id, { volume: next });
      kf.recordKeyframe('volume', next);
    },
    [clip.id, updateClip, kf],
  );

  const handleSpeedChange = useCallback(
    (s: number) => {
      updateClip(clip.id, { speed: s });
      kf.recordKeyframe('speed', s);
    },
    [clip.id, updateClip, kf],
  );

  return (
    <>
      {/* Audio */}
      <SectionHeader icon={Volume2} title="Audio" />
      <div className="p-3 space-y-3 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <button
            onClick={() => updateClip(clip.id, { muted: !clip.muted })}
            className={cn(
              'p-1.5 rounded transition-colors',
              clip.muted
                ? 'bg-red-500/20 text-red-400'
                : 'bg-zinc-700 text-zinc-400 hover:text-white'
            )}
            title={clip.muted ? 'Unmute' : 'Mute'}
          >
            {clip.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          <div className="flex-1">
            <SliderField
              label="Volume"
              value={Math.round((clip.volume ?? 1) * 100)}
              onChange={handleVolumeChange}
              min={0}
              max={100}
              suffix="%"
              kfButton={
                <KeyframeToggle
                  active={kf.isAnimated('volume')}
                  onToggle={() =>
                    kf.isAnimated('volume')
                      ? kf.disableAnimation('volume')
                      : kf.enableAnimation('volume', clip.volume ?? 1)
                  }
                />
              }
            />
            {kf.isAnimated('volume') && (
              <InlineKeyframeRow
                clipId={clip.id}
                clipStartTime={clip.startTime}
                clipDuration={clip.endTime - clip.startTime}
                property="volume"
                allKeyframes={clip.keyframes ?? []}
              />
            )}
          </div>
        </div>
      </div>

      {/* Speed */}
      <SectionHeader icon={Gauge} title="Speed" />
      <div className="p-3 space-y-2 border-b border-zinc-700">
        <div className="flex items-center justify-between">
          <KeyframeToggle
            active={kf.isAnimated('speed')}
            onToggle={() =>
              kf.isAnimated('speed')
                ? kf.disableAnimation('speed')
                : kf.enableAnimation('speed', clip.speed ?? 1)
            }
            title={kf.isAnimated('speed') ? 'Disable speed keyframes' : 'Enable speed keyframes'}
          />
          <span className="text-[10px] text-zinc-500">
            {kf.isAnimated('speed') ? 'animated' : 'static'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {[0.25, 0.5, 1, 1.5, 2, 4].map((s) => (
            <button
              key={s}
              onClick={() => handleSpeedChange(s)}
              className={cn(
                'flex-1 px-1 py-1 rounded text-[10px] font-medium transition-colors',
                (clip.speed ?? 1) === s
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-700'
              )}
            >
              {s}x
            </button>
          ))}
        </div>
        {kf.isAnimated('speed') && (
          <InlineKeyframeRow
            clipId={clip.id}
            clipStartTime={clip.startTime}
            clipDuration={clip.endTime - clip.startTime}
            property="speed"
            allKeyframes={clip.keyframes ?? []}
          />
        )}
      </div>

      {/* Transform */}
      <SectionHeader icon={Sliders} title="Transform" />
      <div className="p-3 space-y-3 border-b border-zinc-700">
        <SliderField
          label="Scale"
          value={clip.transform.scale * 100}
          onChange={(v) => handleTransformChange('scale', v / 100)}
          min={10}
          max={200}
          suffix="%"
          kfButton={
            <KeyframeToggle
              active={kf.isAnimated('scale')}
              onToggle={() =>
                kf.isAnimated('scale')
                  ? kf.disableAnimation('scale')
                  : kf.enableAnimation('scale', clip.transform.scale)
              }
            />
          }
        />
        {kf.isAnimated('scale') && (
          <InlineKeyframeRow
            clipId={clip.id}
            clipStartTime={clip.startTime}
            clipDuration={clip.endTime - clip.startTime}
            property="scale"
            allKeyframes={clip.keyframes ?? []}
          />
        )}

        <SliderField
          label="Rotation"
          value={clip.transform.rotation}
          onChange={(v) => handleTransformChange('rotation', v)}
          min={-180}
          max={180}
          suffix="°"
          kfButton={
            <KeyframeToggle
              active={kf.isAnimated('rotation')}
              onToggle={() =>
                kf.isAnimated('rotation')
                  ? kf.disableAnimation('rotation')
                  : kf.enableAnimation('rotation', clip.transform.rotation)
              }
            />
          }
        />
        {kf.isAnimated('rotation') && (
          <InlineKeyframeRow
            clipId={clip.id}
            clipStartTime={clip.startTime}
            clipDuration={clip.endTime - clip.startTime}
            property="rotation"
            allKeyframes={clip.keyframes ?? []}
          />
        )}

        <SliderField
          label="Opacity"
          value={clip.transform.opacity * 100}
          onChange={(v) => handleTransformChange('opacity', v / 100)}
          min={0}
          max={100}
          suffix="%"
          kfButton={
            <KeyframeToggle
              active={kf.isAnimated('opacity')}
              onToggle={() =>
                kf.isAnimated('opacity')
                  ? kf.disableAnimation('opacity')
                  : kf.enableAnimation('opacity', clip.transform.opacity)
              }
            />
          }
        />
        {kf.isAnimated('opacity') && (
          <InlineKeyframeRow
            clipId={clip.id}
            clipStartTime={clip.startTime}
            clipDuration={clip.endTime - clip.startTime}
            property="opacity"
            allKeyframes={clip.keyframes ?? []}
          />
        )}

        {/* Position */}
        <SectionHeader icon={Move} title="Position" />
        <SliderField
          label="X"
          value={clip.transform.x ?? 0}
          onChange={(v) => handleTransformChange('x', v)}
          min={-500}
          max={500}
          suffix="px"
          kfButton={
            <KeyframeToggle
              active={kf.isAnimated('x')}
              onToggle={() =>
                kf.isAnimated('x')
                  ? kf.disableAnimation('x')
                  : kf.enableAnimation('x', clip.transform.x ?? 0)
              }
            />
          }
        />
        {kf.isAnimated('x') && (
          <InlineKeyframeRow
            clipId={clip.id}
            clipStartTime={clip.startTime}
            clipDuration={clip.endTime - clip.startTime}
            property="x"
            allKeyframes={clip.keyframes ?? []}
          />
        )}
        <SliderField
          label="Y"
          value={clip.transform.y ?? 0}
          onChange={(v) => handleTransformChange('y', v)}
          min={-500}
          max={500}
          suffix="px"
          kfButton={
            <KeyframeToggle
              active={kf.isAnimated('y')}
              onToggle={() =>
                kf.isAnimated('y')
                  ? kf.disableAnimation('y')
                  : kf.enableAnimation('y', clip.transform.y ?? 0)
              }
            />
          }
        />
        {kf.isAnimated('y') && (
          <InlineKeyframeRow
            clipId={clip.id}
            clipStartTime={clip.startTime}
            clipDuration={clip.endTime - clip.startTime}
            property="y"
            allKeyframes={clip.keyframes ?? []}
          />
        )}

        <button
          className="w-full px-3 py-1.5 rounded text-xs bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          onClick={() =>
            updateClip(clip.id, {
              transform: { scale: 1, rotation: 0, opacity: 1, x: 0, y: 0 },
            })
          }
        >
          Reset Transform
        </button>
      </div>

      {/* Blend Mode */}
      <SectionHeader icon={Clapperboard} title="Compositing" />
      <div className="p-3 space-y-3 border-b border-zinc-700">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-zinc-400">Blend Mode</label>
          <select
            value={clip.blendMode ?? 'normal'}
            onChange={(e) => updateClip(clip.id, { blendMode: e.target.value as BlendMode })}
            className="px-2 py-1 rounded text-xs text-white bg-zinc-800 border border-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/30"
          >
            <optgroup label="Normal">
              <option value="normal">Normal</option>
            </optgroup>
            <optgroup label="Darken">
              <option value="darken">Darken</option>
              <option value="multiply">Multiply</option>
              <option value="color-burn">Color Burn</option>
            </optgroup>
            <optgroup label="Lighten">
              <option value="lighten">Lighten</option>
              <option value="screen">Screen</option>
              <option value="color-dodge">Color Dodge</option>
            </optgroup>
            <optgroup label="Contrast">
              <option value="overlay">Overlay</option>
              <option value="hard-light">Hard Light</option>
              <option value="soft-light">Soft Light</option>
            </optgroup>
            <optgroup label="Comparative">
              <option value="difference">Difference</option>
              <option value="exclusion">Exclusion</option>
            </optgroup>
          </select>
        </div>
      </div>
    </>
  );
});

// Timing properties (common to all clips)
const TimingProperties = memo(function TimingProperties({
  clip,
}: {
  clip: Clip;
}) {
  const frameRate = useEditorStore((s) => s.frameRate);

  return (
    <>
      <SectionHeader icon={Clock} title="Timing" />
      <div className="p-3 space-y-3 border-b border-zinc-700">
        <div className="flex items-center justify-between">
          <label className="text-xs text-zinc-400">Start</label>
          <span className="text-xs text-white font-mono">
            {formatSMPTE(clip.startTime, frameRate)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-xs text-zinc-400">End</label>
          <span className="text-xs text-white font-mono">
            {formatSMPTE(clip.endTime, frameRate)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-xs text-zinc-400">Duration</label>
          <span className="text-xs text-white font-mono">
            {formatSMPTE(clip.endTime - clip.startTime, frameRate)}
          </span>
        </div>
      </div>
    </>
  );
});

// Preset filters that can be added to an adjustment layer
const ADJUSTMENT_FILTER_PRESETS: Array<{
  name: string;
  filterType: import('@/types/videoProject.types').ClipEffect['filterType'];
  defaultIntensity: number;
}> = [
  { name: 'Brightness', filterType: 'brightness', defaultIntensity: 20 },
  { name: 'Contrast', filterType: 'contrast', defaultIntensity: 20 },
  { name: 'Saturation', filterType: 'saturation', defaultIntensity: 20 },
  { name: 'Hue Rotate', filterType: 'hue', defaultIntensity: 0 },
  { name: 'Blur', filterType: 'blur', defaultIntensity: 5 },
  { name: 'Sepia', filterType: 'sepia', defaultIntensity: 50 },
  { name: 'Grayscale', filterType: 'grayscale', defaultIntensity: 100 },
  { name: 'Invert', filterType: 'invert', defaultIntensity: 100 },
  { name: 'Vignette', filterType: 'vignette', defaultIntensity: 50 },
  { name: 'Color Grade', filterType: 'color-correction', defaultIntensity: 50 },
];

// Adjustment layer properties panel
const AdjustmentProperties = memo(function AdjustmentProperties({
  clip,
}: {
  clip: AdjustmentClip;
}) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const addClipEffect = useEditorStore((s) => s.addClipEffect);
  const removeClipEffect = useEditorStore((s) => s.removeClipEffect);
  const updateClipEffect = useEditorStore((s) => s.updateClipEffect);
  const toggleClipEffect = useEditorStore((s) => s.toggleClipEffect);

  const generateEffectId = () => `eff-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const handleAddFilter = useCallback(
    (preset: typeof ADJUSTMENT_FILTER_PRESETS[0]) => {
      addClipEffect(clip.id, {
        id: generateEffectId(),
        type: 'filter',
        name: preset.name,
        enabled: true,
        filterType: preset.filterType,
        filterIntensity: preset.defaultIntensity,
        keyframes: [],
      });
    },
    [clip.id, addClipEffect]
  );

  return (
    <>
      {/* Opacity / blend intensity */}
      <SectionHeader icon={Sliders} title="Adjustment Layer" />
      <div className="p-3 space-y-3 border-b border-zinc-700">
        <SliderField
          label="Opacity"
          value={(clip.opacity ?? 1) * 100}
          onChange={(v) => updateClip(clip.id, { opacity: v / 100 } as Partial<AdjustmentClip>)}
          min={0}
          max={100}
          suffix="%"
        />
        <p className="text-[10px] text-zinc-500 leading-relaxed">
          Opacity controls how strongly this adjustment layer's effects blend onto the clips below it.
        </p>
      </div>

      {/* Applied effects list */}
      <SectionHeader icon={Sparkles} title="Effects" />
      <div className="p-3 space-y-2 border-b border-zinc-700">
        {(clip.effects?.length ?? 0) === 0 ? (
          <p className="text-[11px] text-zinc-500 py-2 text-center">No effects — add one below</p>
        ) : (
          clip.effects.map((effect) => (
            <div key={effect.id} className="p-2 bg-zinc-800 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-300">{effect.name}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleClipEffect(clip.id, effect.id)}
                    className={cn(
                      'p-1 rounded transition-colors',
                      effect.enabled ? 'text-white' : 'text-zinc-600'
                    )}
                    title={effect.enabled ? 'Disable' : 'Enable'}
                  >
                    {effect.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => removeClipEffect(clip.id, effect.id)}
                    className="p-1 rounded text-zinc-500 hover:text-red-400 transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              {effect.type === 'filter' && effect.filterType && (
                <SliderField
                  label="Intensity"
                  value={effect.filterIntensity ?? 50}
                  onChange={(v) => updateClipEffect(clip.id, effect.id, { filterIntensity: v })}
                  min={effect.filterType === 'hue' ? -180 : 0}
                  max={effect.filterType === 'hue' ? 180 : (effect.filterType === 'blur' ? 50 : 100)}
                  suffix={effect.filterType === 'hue' ? '°' : (effect.filterType === 'blur' ? 'px' : '%')}
                />
              )}
            </div>
          ))
        )}
      </div>

      {/* Add effect presets */}
      <SectionHeader icon={Sparkles} title="Add Effect" />
      <div className="p-3 border-b border-zinc-700">
        <div className="grid grid-cols-2 gap-1">
          {ADJUSTMENT_FILTER_PRESETS.map((preset) => (
            <button
              key={preset.filterType}
              className="px-2 py-1.5 rounded text-[10px] bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors text-left"
              onClick={() => handleAddFilter(preset)}
            >
              + {preset.name}
            </button>
          ))}
        </div>
      </div>
    </>
  );
});

export const EditorInspector = memo(function EditorInspector({
  className,
  style,
}: EditorInspectorProps) {
  const selectedClip = useEditorStore((s) => s.selectedClip);
  const selection = useEditorStore((s) => s.selection);
  const currentTime = useEditorStore((s) => s.currentTime);
  const removeClip = useEditorStore((s) => s.removeClip);
  const duplicateClip = useEditorStore((s) => s.duplicateClip);
  const splitClip = useEditorStore((s) => s.splitClip);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const duplicateSelectedClips = useEditorStore((s) => s.duplicateSelectedClips);
  const inspectorTab = useEditorStore((s) => s.inspectorTab);
  const setInspectorTab = useEditorStore((s) => s.setInspectorTab);
  const removeClipEffect = useEditorStore((s) => s.removeClipEffect);
  const updateClipEffect = useEditorStore((s) => s.updateClipEffect);
  const toggleClipEffect = useEditorStore((s) => s.toggleClipEffect);

  const multiSelectCount = Array.isArray(selection.clipIds) ? selection.clipIds.length : 0;
  const isMultiSelect = multiSelectCount > 1;

  // Actions
  const handleDelete = useCallback(() => {
    if (selectedClip) {
      removeClip(selectedClip.id);
    }
  }, [selectedClip, removeClip]);

  const handleDuplicate = useCallback(() => {
    if (selectedClip) {
      duplicateClip(selectedClip.id);
    }
  }, [selectedClip, duplicateClip]);

  const handleSplit = useCallback(() => {
    if (
      selectedClip &&
      currentTime > selectedClip.startTime &&
      currentTime < selectedClip.endTime
    ) {
      splitClip(selectedClip.id, currentTime);
    }
  }, [selectedClip, currentTime, splitClip]);

  const canSplit =
    selectedClip &&
    currentTime > selectedClip.startTime &&
    currentTime < selectedClip.endTime;

  // Multi-select panel: shown when 2+ clips are selected
  if (isMultiSelect) {
    return (
      <div
        className={cn('flex flex-col overflow-hidden', className)}
        style={style}
      >
        {/* Header */}
        <div className="px-3 py-2 bg-zinc-800 border-b border-zinc-700">
          <h3 className="text-sm font-medium text-white">
            Multiple Clips Selected
          </h3>
          <p className="text-xs text-zinc-400">{multiSelectCount} clips selected</p>
        </div>

        {/* Multi-select actions */}
        <div className="p-3 space-y-2 border-b border-zinc-700">
          <button
            className="flex items-center gap-2 w-full px-3 py-2 rounded text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 hover:text-white transition-colors"
            onClick={duplicateSelectedClips}
          >
            <Copy className="w-3.5 h-3.5" />
            Duplicate All ({multiSelectCount})
          </button>
          <button
            className="flex items-center gap-2 w-full px-3 py-2 rounded text-xs text-red-400 bg-zinc-800 hover:bg-zinc-700 hover:text-red-300 transition-colors"
            onClick={deleteSelected}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete All ({multiSelectCount})
          </button>
        </div>

        <div className="p-3 text-xs text-zinc-500 space-y-1">
          <p>Shift+click to add/remove clips</p>
          <p>Ctrl/Cmd+click to toggle individual clips</p>
          <p>Drag any selected clip to move all</p>
        </div>
      </div>
    );
  }

  if (!selectedClip) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center text-center p-6',
          className
        )}
        style={style}
      >
        <Sliders className="w-12 h-12 text-zinc-600 mb-3" />
        <p className="text-sm text-zinc-400">No clip selected</p>
        <p className="text-xs text-zinc-500 mt-1">
          Select a clip on the timeline to edit its properties
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col overflow-hidden', className)} style={style}>
      {/* Header */}
      <div className="px-3 py-2 bg-zinc-800 border-b border-zinc-700">
        <h3 className="text-sm font-medium text-white truncate">
          {selectedClip.name}
        </h3>
        <p className="text-xs text-zinc-400 capitalize">{selectedClip.type} Clip</p>
      </div>

      {/* Tabs: Properties / Effects — shown for video, audio, and adjustment clips.
          Keyframes are edited inline within the Properties tab via stopwatch toggles. */}
      {(selectedClip.type === 'video' || selectedClip.type === 'audio' || selectedClip.type === 'adjustment') && (
        <div className="flex border-b border-zinc-700">
          <button
            onClick={() => setInspectorTab('properties')}
            className={cn(
              'flex-1 px-2 py-1.5 text-xs font-medium transition-colors',
              inspectorTab !== 'effects'
                ? 'text-white bg-zinc-800 border-b-2 border-white/30'
                : 'text-zinc-500 hover:text-white'
            )}
          >
            Properties
          </button>
          {/* Effects tab: only for video and audio (adjustment uses properties tab for effects) */}
          {selectedClip.type !== 'adjustment' && (
            <button
              onClick={() => setInspectorTab('effects')}
              className={cn(
                'flex-1 px-2 py-1.5 text-xs font-medium transition-colors',
                inspectorTab === 'effects'
                  ? 'text-white bg-zinc-800 border-b-2 border-white/30'
                  : 'text-zinc-500 hover:text-white'
              )}
            >
              Effects{(() => {
                if (!hasEffects(selectedClip)) return '';
                return (selectedClip.effects?.length ?? 0) > 0 ? ` (${selectedClip.effects.length})` : '';
              })()}
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {inspectorTab !== 'effects' ? (
          <>
            {/* Timing (all clips) */}
            <TimingProperties clip={selectedClip} />

            {/* Type-specific properties */}
            {selectedClip.type === 'subtitle' && (
              <SubtitleProperties clip={selectedClip as SubtitleClip} />
            )}

            {selectedClip.type === 'video' && (
              <VideoProperties clip={selectedClip as VideoClip} />
            )}

            {(selectedClip.type === 'audio' || selectedClip.type === 'music') && (
              <AudioProperties clip={selectedClip as AudioClip | MusicClip} />
            )}

            {selectedClip.type === 'adjustment' && (
              <AdjustmentProperties clip={selectedClip as AdjustmentClip} />
            )}
          </>
        ) : (
          /* Effects tab */
          <div className="p-3 space-y-2">
            {(() => {
              const effects = hasEffects(selectedClip) ? selectedClip.effects : undefined;
              if (!effects || effects.length === 0) {
                return (
                  <div className="py-6 text-center">
                    <Sparkles className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                    <p className="text-xs text-zinc-500">No effects applied</p>
                    <p className="text-[10px] text-zinc-600 mt-1">Double-click an effect in the left panel to add</p>
                  </div>
                );
              }
              return effects.map((effect) => (
                <div key={effect.id} className="p-2 bg-zinc-800 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-300">{effect.name}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleClipEffect(selectedClip.id, effect.id)}
                        className={cn(
                          'p-1 rounded transition-colors',
                          effect.enabled ? 'text-white' : 'text-zinc-600'
                        )}
                        title={effect.enabled ? 'Disable' : 'Enable'}
                      >
                        {effect.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => removeClipEffect(selectedClip.id, effect.id)}
                        className="p-1 rounded text-zinc-500 hover:text-red-400 transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {effect.type === 'filter' && effect.filterType && (
                    <SliderField
                      label="Intensity"
                      value={effect.filterIntensity ?? 50}
                      onChange={(v) => updateClipEffect(selectedClip.id, effect.id, { filterIntensity: v })}
                      min={effect.filterType === 'hue' ? -180 : 0}
                      max={effect.filterType === 'hue' ? 180 : (effect.filterType === 'blur' ? 50 : 100)}
                      suffix={effect.filterType === 'hue' ? '°' : (effect.filterType === 'blur' ? 'px' : '%')}
                    />
                  )}
                  {effect.type === 'transition' && (
                    <SliderField
                      label="Duration"
                      value={effect.transitionDuration ?? 0.5}
                      onChange={(v) => updateClipEffect(selectedClip.id, effect.id, { transitionDuration: v })}
                      min={0.1}
                      max={5}
                      step={0.1}
                      suffix="s"
                    />
                  )}
                  {effect.type === 'audio-effect' && effect.audioEffectType && (() => {
                    const params = (effect.audioParams ?? {}) as Record<string, number>;
                    const updateParam = (key: string, val: number) => {
                      updateClipEffect(selectedClip.id, effect.id, {
                        audioParams: { ...params, [key]: val },
                      });
                    };

                    switch (effect.audioEffectType) {
                      case 'eq':
                        return (
                          <div className="space-y-2">
                            <SliderField label="Low" value={params.low ?? 0} onChange={(v) => updateParam('low', v)} min={-24} max={24} suffix="dB" />
                            <SliderField label="Mid" value={params.mid ?? 0} onChange={(v) => updateParam('mid', v)} min={-24} max={24} suffix="dB" />
                            <SliderField label="High" value={params.high ?? 0} onChange={(v) => updateParam('high', v)} min={-24} max={24} suffix="dB" />
                          </div>
                        );
                      case 'compressor':
                        return (
                          <div className="space-y-2">
                            <SliderField label="Threshold" value={params.threshold ?? -20} onChange={(v) => updateParam('threshold', v)} min={-60} max={0} suffix="dB" />
                            <SliderField label="Ratio" value={params.ratio ?? 4} onChange={(v) => updateParam('ratio', v)} min={1} max={20} step={0.5} />
                            <SliderField label="Attack" value={params.attack ?? 5} onChange={(v) => updateParam('attack', v)} min={0} max={100} suffix="ms" />
                            <SliderField label="Release" value={params.release ?? 50} onChange={(v) => updateParam('release', v)} min={10} max={500} suffix="ms" />
                          </div>
                        );
                      case 'reverb':
                        return (
                          <div className="space-y-2">
                            <SliderField label="Decay" value={params.decay ?? 2} onChange={(v) => updateParam('decay', v)} min={0.1} max={10} step={0.1} suffix="s" />
                            <SliderField label="Wet/Dry" value={params.wet ?? 30} onChange={(v) => updateParam('wet', v)} min={0} max={100} suffix="%" />
                            <SliderField label="Pre-delay" value={params.preDelay ?? 20} onChange={(v) => updateParam('preDelay', v)} min={0} max={100} suffix="ms" />
                          </div>
                        );
                      case 'delay':
                        return (
                          <div className="space-y-2">
                            <SliderField label="Time" value={params.time ?? 250} onChange={(v) => updateParam('time', v)} min={10} max={2000} suffix="ms" />
                            <SliderField label="Feedback" value={params.feedback ?? 30} onChange={(v) => updateParam('feedback', v)} min={0} max={90} suffix="%" />
                            <SliderField label="Wet/Dry" value={params.wet ?? 30} onChange={(v) => updateParam('wet', v)} min={0} max={100} suffix="%" />
                          </div>
                        );
                      case 'noise-reduction':
                        return (
                          <div className="space-y-2">
                            <SliderField label="Reduction" value={params.reduction ?? 50} onChange={(v) => updateParam('reduction', v)} min={0} max={100} suffix="%" />
                            <SliderField label="Sensitivity" value={params.sensitivity ?? 50} onChange={(v) => updateParam('sensitivity', v)} min={0} max={100} suffix="%" />
                          </div>
                        );
                      default:
                        return null;
                    }
                  })()}
                </div>
              ));
            })()}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="p-3 border-t border-zinc-700 bg-zinc-800/50">
        <div className="flex items-center gap-2">
          <button
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
            onClick={handleDuplicate}
            title="Duplicate clip"
          >
            <Copy className="w-3 h-3" />
            Duplicate
          </button>

          <button
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors',
              canSplit
                ? 'bg-zinc-700 text-zinc-300 hover:text-white'
                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
            )}
            onClick={handleSplit}
            disabled={!canSplit}
            title="Split at playhead"
          >
            <Scissors className="w-3 h-3" />
            Split
          </button>

          <button
            className="flex items-center justify-center p-1.5 rounded text-zinc-400 hover:text-red-400 hover:bg-red-600/10 transition-colors"
            onClick={handleDelete}
            title="Delete clip"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
});

export default EditorInspector;
