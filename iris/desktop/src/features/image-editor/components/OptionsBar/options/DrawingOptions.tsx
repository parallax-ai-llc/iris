/**
 * DrawingOptions - Drawing/brush tool options for Options Bar
 */

import { memo, useCallback } from 'react';
import { PenTool, Pencil, Eraser, Droplet, PaintBucket, Copy, Sun, Moon, Droplets, Wind, ZoomIn, Wand2, Bandage, Sparkles, Eye, Hash, ArrowLeftRight, Grid3X3, RotateCcw, Palette, Trash2, EyeOff, ArrowRight, Circle, Diamond, RotateCw } from 'lucide-react';
import { useImageEditorStore, type DrawTool, type GradientType } from '@/features/image-editor/stores/imageEditor.store';
import { PillButtonGroup, CompactSlider, BarSeparator } from '../shared';

const DRAW_TOOL_OPTIONS = [
  { id: 'brush', label: 'Brush', icon: <PenTool className="w-3 h-3" /> },
  { id: 'pencil', label: 'Pencil', icon: <Pencil className="w-3 h-3" /> },
  { id: 'gradient', label: 'Grad', icon: <Droplet className="w-3 h-3" /> },
  { id: 'bucket', label: 'Fill', icon: <PaintBucket className="w-3 h-3" /> },
];

const CLONE_TOOL_OPTIONS = [
  { id: 'clone', label: 'Clone', icon: <Copy className="w-3 h-3" /> },
];

const TONAL_TOOL_OPTIONS = [
  { id: 'dodge', label: 'Dodge', icon: <Sun className="w-3 h-3" /> },
  { id: 'burn', label: 'Burn', icon: <Moon className="w-3 h-3" /> },
  { id: 'sponge', label: 'Sponge', icon: <Droplets className="w-3 h-3" /> },
];

const LOCAL_ADJUST_OPTIONS = [
  { id: 'smudge', label: 'Smudge', icon: <Wind className="w-3 h-3" /> },
  { id: 'blur-brush', label: 'Blur', icon: <ZoomIn className="w-3 h-3" /> },
  { id: 'sharpen-brush', label: 'Sharpen', icon: <Wand2 className="w-3 h-3" /> },
];

const HEAL_TOOL_OPTIONS = [
  { id: 'spot-healing', label: 'Spot Heal', icon: <Sparkles className="w-3 h-3" /> },
  { id: 'healing', label: 'Healing', icon: <Bandage className="w-3 h-3" /> },
  { id: 'red-eye-removal', label: 'Red Eye', icon: <EyeOff className="w-3 h-3" /> },
];

const EXTRA_TOOL_OPTIONS = [
  { id: 'color-sampler', label: 'Sampler', icon: <Eye className="w-3 h-3" /> },
  { id: 'count-tool', label: 'Count', icon: <Hash className="w-3 h-3" /> },
  { id: 'color-replace', label: 'Replace', icon: <ArrowLeftRight className="w-3 h-3" /> },
  { id: 'pattern-stamp', label: 'Pattern', icon: <Grid3X3 className="w-3 h-3" /> },
];

const HISTORY_TOOL_OPTIONS = [
  { id: 'history-brush', label: 'History', icon: <RotateCcw className="w-3 h-3" /> },
  { id: 'art-history-brush', label: 'Art History', icon: <Palette className="w-3 h-3" /> },
];

const ERASER_TOOL_OPTIONS = [
  { id: 'eraser', label: 'Eraser', icon: <Eraser className="w-3 h-3" /> },
  { id: 'background-eraser', label: 'BG Erase', icon: <Trash2 className="w-3 h-3" /> },
  { id: 'magic-eraser', label: 'Magic', icon: <Wand2 className="w-3 h-3" /> },
];

const DODGE_BURN_RANGE_OPTIONS = [
  { id: 'shadows', label: 'Shadows' },
  { id: 'midtones', label: 'Midtones' },
  { id: 'highlights', label: 'Highlights' },
];

const SPONGE_MODE_OPTIONS = [
  { id: 'saturate', label: 'Saturate' },
  { id: 'desaturate', label: 'Desaturate' },
];

const GRADIENT_TYPE_OPTIONS = [
  { id: 'linear', label: 'Linear', icon: <ArrowRight className="w-3 h-3" /> },
  { id: 'radial', label: 'Radial', icon: <Circle className="w-3 h-3" /> },
  { id: 'angular', label: 'Angular', icon: <RotateCw className="w-3 h-3" /> },
  { id: 'diamond', label: 'Diamond', icon: <Diamond className="w-3 h-3" /> },
  { id: 'reflected', label: 'Reflected', icon: <ArrowLeftRight className="w-3 h-3" /> },
];

const BLEND_OPTIONS = [
  { id: 'normal', label: 'Normal' },
  { id: 'multiply', label: 'Multiply' },
  { id: 'screen', label: 'Screen' },
  { id: 'overlay', label: 'Overlay' },
];

const isGradientTool = (tool: DrawTool) => tool === 'gradient' || tool === 'reflected-gradient';
const isTonalTool = (tool: DrawTool) => tool === 'dodge' || tool === 'burn' || tool === 'sponge';
const isLocalAdjustTool = (tool: DrawTool) => tool === 'smudge' || tool === 'blur-brush' || tool === 'sharpen-brush';
const isHealTool = (tool: DrawTool) => tool === 'healing' || tool === 'spot-healing' || tool === 'red-eye-removal';
const isExtraTool = (tool: DrawTool) => tool === 'color-sampler' || tool === 'count-tool' || tool === 'color-replace' || tool === 'pattern-stamp';
const isHistoryTool = (tool: DrawTool) => tool === 'history-brush' || tool === 'art-history-brush';
const isEraserTool = (tool: DrawTool) => tool === 'eraser' || tool === 'background-eraser' || tool === 'magic-eraser';
const isCloneTool = (tool: DrawTool) => tool === 'clone';
const isStandardBrushTool = (tool: DrawTool) => !isTonalTool(tool) && !isLocalAdjustTool(tool) && !isHealTool(tool) && !isExtraTool(tool) && !isHistoryTool(tool) && !isEraserTool(tool) && !isGradientTool(tool) && !isCloneTool(tool);

export const DrawingOptions = memo(function DrawingOptions() {
  const {
    activeTool,
    setActiveTool,
    brushSettings,
    setBrushSettings,
    dodgeBurnSettings,
    setDodgeBurnSettings,
    spongeMode,
    setSpongeMode,
    localAdjustStrength,
    setLocalAdjustStrength,
    gradientSettings,
    setGradientSettings,
  } = useImageEditorStore();

  const handleToolChange = useCallback((tool: string) => {
    setActiveTool(tool as DrawTool);
  }, [setActiveTool]);

  return (
    <div className="flex items-center gap-2">
      {/* Tool group selector — only show the group matching the active tool */}
      {isStandardBrushTool(activeTool) && (
        <PillButtonGroup
          options={DRAW_TOOL_OPTIONS}
          value={activeTool}
          onChange={handleToolChange}
        />
      )}
      {isGradientTool(activeTool) && (
        <PillButtonGroup
          options={[{ id: 'gradient', label: 'Grad', icon: <Droplet className="w-3 h-3" /> }]}
          value={'gradient'}
          onChange={handleToolChange}
        />
      )}
      {isTonalTool(activeTool) && (
        <PillButtonGroup
          options={TONAL_TOOL_OPTIONS}
          value={activeTool}
          onChange={handleToolChange}
        />
      )}
      {isLocalAdjustTool(activeTool) && (
        <PillButtonGroup
          options={LOCAL_ADJUST_OPTIONS}
          value={activeTool}
          onChange={handleToolChange}
        />
      )}
      {isHealTool(activeTool) && (
        <PillButtonGroup
          options={HEAL_TOOL_OPTIONS}
          value={activeTool}
          onChange={handleToolChange}
        />
      )}
      {isExtraTool(activeTool) && (
        <PillButtonGroup
          options={EXTRA_TOOL_OPTIONS}
          value={activeTool}
          onChange={handleToolChange}
        />
      )}
      {isHistoryTool(activeTool) && (
        <PillButtonGroup
          options={HISTORY_TOOL_OPTIONS}
          value={activeTool}
          onChange={handleToolChange}
        />
      )}
      {isEraserTool(activeTool) && (
        <PillButtonGroup
          options={ERASER_TOOL_OPTIONS}
          value={activeTool}
          onChange={handleToolChange}
        />
      )}
      {isCloneTool(activeTool) && (
        <PillButtonGroup
          options={CLONE_TOOL_OPTIONS}
          value={activeTool}
          onChange={handleToolChange}
        />
      )}

      <BarSeparator />

      {/* Standard brush tools */}
      {isStandardBrushTool(activeTool) && (
        <>
          <input
            type="color"
            value={brushSettings.color}
            onChange={(e) => setBrushSettings({ color: e.target.value })}
            className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
          />
          <CompactSlider
            label="Size"
            value={brushSettings.size}
            min={1}
            max={200}
            onChange={(v) => setBrushSettings({ size: v })}
            unit="px"
          />
          <CompactSlider
            label="Opacity"
            value={brushSettings.opacity}
            min={1}
            max={100}
            onChange={(v) => setBrushSettings({ opacity: v })}
            unit="%"
          />
          <CompactSlider
            label="Hardness"
            value={brushSettings.hardness}
            min={0}
            max={100}
            onChange={(v) => setBrushSettings({ hardness: v })}
            unit="%"
          />
          <BarSeparator />
          <PillButtonGroup
            options={BLEND_OPTIONS}
            value={brushSettings.blendMode}
            onChange={(v) => setBrushSettings({ blendMode: v as typeof brushSettings.blendMode })}
          />
        </>
      )}

      {/* Gradient tool controls */}
      {isGradientTool(activeTool) && (
        <>
          <input
            type="color"
            value={gradientSettings.colorStops[0]?.color ?? '#000000'}
            onChange={(e) => {
              const stops = [...gradientSettings.colorStops];
              stops[0] = { ...stops[0], color: e.target.value };
              setGradientSettings({ colorStops: stops });
            }}
            className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
            title="Start color"
          />
          <input
            type="color"
            value={gradientSettings.colorStops[1]?.color ?? '#ffffff'}
            onChange={(e) => {
              const stops = [...gradientSettings.colorStops];
              stops[1] = { ...stops[1], color: e.target.value };
              setGradientSettings({ colorStops: stops });
            }}
            className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
            title="End color"
          />
          <BarSeparator />
          <PillButtonGroup
            options={GRADIENT_TYPE_OPTIONS}
            value={gradientSettings.type}
            onChange={(v) => setGradientSettings({ type: v as GradientType })}
          />
          <BarSeparator />
          <CompactSlider
            label="Angle"
            value={gradientSettings.angle}
            min={0}
            max={360}
            onChange={(v) => setGradientSettings({ angle: v })}
            unit="°"
          />
          <CompactSlider
            label="Opacity"
            value={brushSettings.opacity}
            min={1}
            max={100}
            onChange={(v) => setBrushSettings({ opacity: v })}
            unit="%"
          />
          <button
            onClick={() => setGradientSettings({ reverse: !gradientSettings.reverse })}
            className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
              gradientSettings.reverse
                ? 'bg-zinc-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
            title="Reverse gradient"
          >
            Reverse
          </button>
        </>
      )}

      {/* Dodge / Burn controls */}
      {(activeTool === 'dodge' || activeTool === 'burn') && (
        <>
          <PillButtonGroup
            options={DODGE_BURN_RANGE_OPTIONS}
            value={dodgeBurnSettings.range}
            onChange={(v) => setDodgeBurnSettings({ range: v as typeof dodgeBurnSettings.range })}
          />
          <BarSeparator />
          <CompactSlider
            label="Size"
            value={brushSettings.size}
            min={1}
            max={200}
            onChange={(v) => setBrushSettings({ size: v })}
            unit="px"
          />
          <CompactSlider
            label="Exposure"
            value={dodgeBurnSettings.exposure}
            min={1}
            max={100}
            onChange={(v) => setDodgeBurnSettings({ exposure: v })}
            unit="%"
          />
          <CompactSlider
            label="Hardness"
            value={brushSettings.hardness}
            min={0}
            max={100}
            onChange={(v) => setBrushSettings({ hardness: v })}
            unit="%"
          />
        </>
      )}

      {/* Sponge controls */}
      {activeTool === 'sponge' && (
        <>
          <PillButtonGroup
            options={SPONGE_MODE_OPTIONS}
            value={spongeMode}
            onChange={(v) => setSpongeMode(v as typeof spongeMode)}
          />
          <BarSeparator />
          <CompactSlider
            label="Size"
            value={brushSettings.size}
            min={1}
            max={200}
            onChange={(v) => setBrushSettings({ size: v })}
            unit="px"
          />
          <CompactSlider
            label="Flow"
            value={localAdjustStrength}
            min={1}
            max={100}
            onChange={setLocalAdjustStrength}
            unit="%"
          />
          <CompactSlider
            label="Hardness"
            value={brushSettings.hardness}
            min={0}
            max={100}
            onChange={(v) => setBrushSettings({ hardness: v })}
            unit="%"
          />
        </>
      )}

      {/* Local adjust tools (smudge / blur / sharpen) */}
      {isLocalAdjustTool(activeTool) && (
        <>
          <CompactSlider
            label="Size"
            value={brushSettings.size}
            min={1}
            max={200}
            onChange={(v) => setBrushSettings({ size: v })}
            unit="px"
          />
          <CompactSlider
            label="Strength"
            value={localAdjustStrength}
            min={1}
            max={100}
            onChange={setLocalAdjustStrength}
            unit="%"
          />
          <CompactSlider
            label="Hardness"
            value={brushSettings.hardness}
            min={0}
            max={100}
            onChange={(v) => setBrushSettings({ hardness: v })}
            unit="%"
          />
        </>
      )}

      {/* Heal tools (spot-healing / healing) */}
      {isHealTool(activeTool) && (
        <>
          <CompactSlider
            label="Size"
            value={brushSettings.size}
            min={1}
            max={200}
            onChange={(v) => setBrushSettings({ size: v })}
            unit="px"
          />
          <CompactSlider
            label="Opacity"
            value={brushSettings.opacity}
            min={1}
            max={100}
            onChange={(v) => setBrushSettings({ opacity: v })}
            unit="%"
          />
          <CompactSlider
            label="Hardness"
            value={brushSettings.hardness}
            min={0}
            max={100}
            onChange={(v) => setBrushSettings({ hardness: v })}
            unit="%"
          />
          {activeTool === 'healing' && (
            <span className="text-xs text-zinc-500 ml-1">Alt+click to set source</span>
          )}
        </>
      )}

      {/* Eraser tools (eraser / background-eraser / magic-eraser) */}
      {isEraserTool(activeTool) && (
        <>
          {activeTool !== 'magic-eraser' && (
            <>
              <CompactSlider
                label="Size"
                value={brushSettings.size}
                min={1}
                max={200}
                onChange={(v) => setBrushSettings({ size: v })}
                unit="px"
              />
              <CompactSlider
                label="Opacity"
                value={brushSettings.opacity}
                min={1}
                max={100}
                onChange={(v) => setBrushSettings({ opacity: v })}
                unit="%"
              />
              <CompactSlider
                label="Hardness"
                value={brushSettings.hardness}
                min={0}
                max={100}
                onChange={(v) => setBrushSettings({ hardness: v })}
                unit="%"
              />
            </>
          )}
          {activeTool === 'magic-eraser' && (
            <span className="text-xs text-zinc-500 ml-1">Click to erase contiguous similar colors</span>
          )}
          {activeTool === 'background-eraser' && (
            <span className="text-xs text-zinc-500 ml-1">Samples color at first click</span>
          )}
        </>
      )}

      {/* Clone stamp */}
      {isCloneTool(activeTool) && (
        <>
          <CompactSlider
            label="Size"
            value={brushSettings.size}
            min={1}
            max={200}
            onChange={(v) => setBrushSettings({ size: v })}
            unit="px"
          />
          <CompactSlider
            label="Opacity"
            value={brushSettings.opacity}
            min={1}
            max={100}
            onChange={(v) => setBrushSettings({ opacity: v })}
            unit="%"
          />
          <CompactSlider
            label="Hardness"
            value={brushSettings.hardness}
            min={0}
            max={100}
            onChange={(v) => setBrushSettings({ hardness: v })}
            unit="%"
          />
          <span className="text-xs text-zinc-500 ml-1">Alt+click to set source</span>
        </>
      )}
    </div>
  );
});
