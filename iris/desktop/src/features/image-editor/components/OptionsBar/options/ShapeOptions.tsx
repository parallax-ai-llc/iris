/**
 * ShapeOptions
 * Options bar for shape tools
 */

import React, { useCallback } from 'react';
import { useImageEditorStore, ShapeTool } from '@/features/image-editor/stores/imageEditor.store';
import {
  Square,
  Circle,
  Minus,
  ArrowRight,
  Pentagon,
  Star,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface ShapeOptionsProps {
  className?: string;
}

const shapeTools: { value: ShapeTool; icon: React.ReactNode; title: string }[] = [
  { value: 'rectangle', icon: <Square className="w-4 h-4" />, title: 'Rectangle' },
  { value: 'ellipse', icon: <Circle className="w-4 h-4" />, title: 'Ellipse' },
  { value: 'line', icon: <Minus className="w-4 h-4" />, title: 'Line' },
  { value: 'arrow', icon: <ArrowRight className="w-4 h-4" />, title: 'Arrow' },
  { value: 'polygon', icon: <Pentagon className="w-4 h-4" />, title: 'Polygon' },
  { value: 'star', icon: <Star className="w-4 h-4" />, title: 'Star' },
];

export function ShapeOptions({ className }: ShapeOptionsProps) {
  const { shapeTool, setShapeTool, shapeSettings, setShapeSettings } = useImageEditorStore();

  const handleToolChange = useCallback(
    (value: ShapeTool) => {
      setShapeTool(value);
    },
    [setShapeTool]
  );

  const handleFillColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setShapeSettings({ fillColor: e.target.value });
    },
    [setShapeSettings]
  );

  const handleStrokeColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setShapeSettings({ strokeColor: e.target.value });
    },
    [setShapeSettings]
  );

  const handleStrokeWidthChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setShapeSettings({ strokeWidth: parseInt(e.target.value, 10) });
    },
    [setShapeSettings]
  );

  const handleCornerRadiusChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setShapeSettings({ cornerRadius: parseInt(e.target.value, 10) });
    },
    [setShapeSettings]
  );

  const handleSidesChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setShapeSettings({ sides: parseInt(e.target.value, 10) });
    },
    [setShapeSettings]
  );

  const handleInnerRadiusChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setShapeSettings({ innerRadius: parseInt(e.target.value, 10) });
    },
    [setShapeSettings]
  );

  const handleFillEnabledChange = useCallback(() => {
    setShapeSettings({ fillEnabled: !shapeSettings.fillEnabled });
  }, [setShapeSettings, shapeSettings.fillEnabled]);

  const handleStrokeEnabledChange = useCallback(() => {
    setShapeSettings({ strokeEnabled: !shapeSettings.strokeEnabled });
  }, [setShapeSettings, shapeSettings.strokeEnabled]);

  return (
    <div className={cn('flex items-center gap-4', className)}>
      {/* Shape Tool Selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">Shape</span>
        <div className="flex gap-0.5">
          {shapeTools.map((tool) => (
            <button
              key={tool.value}
              onClick={() => handleToolChange(tool.value)}
              title={tool.title}
              className={cn(
                'w-7 h-7 flex items-center justify-center rounded transition-all',
                'hover:bg-zinc-700',
                shapeTool === tool.value
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'text-zinc-400 hover:text-white'
              )}
            >
              {tool.icon}
            </button>
          ))}
        </div>
      </div>

      <div className="h-4 w-px bg-zinc-700" />

      {/* Fill Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleFillEnabledChange}
          className={cn(
            'w-4 h-4 rounded-sm border transition-colors',
            shapeSettings.fillEnabled
              ? 'bg-blue-500 border-blue-500'
              : 'bg-transparent border-zinc-600'
          )}
        >
          {shapeSettings.fillEnabled && (
            <svg className="w-4 h-4 text-white" viewBox="0 0 16 16" fill="none">
              <path d="M4 8l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
        <span className="text-xs text-zinc-500">Fill</span>
        <input
          type="color"
          value={shapeSettings.fillColor}
          onChange={handleFillColorChange}
          disabled={!shapeSettings.fillEnabled}
          className={cn(
            'h-6 w-8 p-0 border-0 cursor-pointer rounded',
            !shapeSettings.fillEnabled && 'opacity-50 cursor-not-allowed'
          )}
        />
      </div>

      <div className="h-4 w-px bg-zinc-700" />

      {/* Stroke Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleStrokeEnabledChange}
          className={cn(
            'w-4 h-4 rounded-sm border transition-colors',
            shapeSettings.strokeEnabled
              ? 'bg-blue-500 border-blue-500'
              : 'bg-transparent border-zinc-600'
          )}
        >
          {shapeSettings.strokeEnabled && (
            <svg className="w-4 h-4 text-white" viewBox="0 0 16 16" fill="none">
              <path d="M4 8l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
        <span className="text-xs text-zinc-500">Stroke</span>
        <input
          type="color"
          value={shapeSettings.strokeColor}
          onChange={handleStrokeColorChange}
          disabled={!shapeSettings.strokeEnabled}
          className={cn(
            'h-6 w-8 p-0 border-0 cursor-pointer rounded',
            !shapeSettings.strokeEnabled && 'opacity-50 cursor-not-allowed'
          )}
        />
        <div className="flex items-center gap-1">
          <input
            type="range"
            min={1}
            max={50}
            step={1}
            value={shapeSettings.strokeWidth}
            onChange={handleStrokeWidthChange}
            disabled={!shapeSettings.strokeEnabled}
            className={cn(
              'w-16 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer',
              '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3',
              '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer',
              !shapeSettings.strokeEnabled && 'opacity-50 cursor-not-allowed'
            )}
          />
          <span className="text-xs text-zinc-500 w-5 text-right">
            {shapeSettings.strokeWidth}
          </span>
        </div>
      </div>

      {/* Rectangle-specific: Corner Radius */}
      {shapeTool === 'rectangle' && (
        <>
          <div className="h-4 w-px bg-zinc-700" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 whitespace-nowrap">Radius</span>
            <div className="flex items-center gap-1">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={shapeSettings.cornerRadius}
                onChange={handleCornerRadiusChange}
                className="w-16 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <span className="text-xs text-zinc-500 w-5 text-right">
                {shapeSettings.cornerRadius}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Polygon-specific: Sides */}
      {shapeTool === 'polygon' && (
        <>
          <div className="h-4 w-px bg-zinc-700" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Sides</span>
            <div className="flex items-center gap-1">
              <input
                type="range"
                min={3}
                max={12}
                step={1}
                value={shapeSettings.sides}
                onChange={handleSidesChange}
                className="w-16 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <span className="text-xs text-zinc-500 w-5 text-right">
                {shapeSettings.sides}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Star-specific: Inner Radius */}
      {shapeTool === 'star' && (
        <>
          <div className="h-4 w-px bg-zinc-700" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 whitespace-nowrap">Inner %</span>
            <div className="flex items-center gap-1">
              <input
                type="range"
                min={10}
                max={90}
                step={1}
                value={shapeSettings.innerRadius}
                onChange={handleInnerRadiusChange}
                className="w-16 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <span className="text-xs text-zinc-500 w-5 text-right">
                {shapeSettings.innerRadius}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Hint */}
      <div className="ml-auto text-xs text-zinc-500">
        Shift: constrain | Alt: from center
      </div>
    </div>
  );
}

export default ShapeOptions;
