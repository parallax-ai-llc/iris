/**
 * OptionsBar - Horizontal options bar between header and canvas
 * Renders tool-specific options based on current editMode
 */

import { memo } from 'react';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import {
  DefaultOptions,
  CropOptions,
  TransformOptions,
  SelectionOptions,
  DrawingOptions,
  TextOptions,
  AdjustOptions,
  FilterOptions,
  AIOptions,
  PenOptions,
} from './options';
import { ShapeOptions } from './options/ShapeOptions';

const AI_MODES = ['upscale', 'bgRemove', 'inpaint', 'outpaint', 'faceRestore', 'colorize'] as const;

export const OptionsBar = memo(function OptionsBar() {
  const editMode = useImageEditorStore((s) => s.editMode);

  const renderOptions = () => {
    if (AI_MODES.includes(editMode as typeof AI_MODES[number])) {
      return <AIOptions />;
    }
    switch (editMode) {
      case 'crop':
        return <CropOptions />;
      case 'transform':
        return <TransformOptions />;
      case 'selection':
        return <SelectionOptions />;
      case 'drawing':
        return <DrawingOptions />;
      case 'shape':
        return <ShapeOptions />;
      case 'pen':
        return <PenOptions />;
      case 'text':
        return <TextOptions />;
      case 'adjust':
        return <AdjustOptions />;
      case 'filter':
        return <FilterOptions />;
      default:
        return <DefaultOptions />;
    }
  };

  return (
    <div className="h-10 bg-zinc-900 border-b border-zinc-800 flex items-center px-3 flex-shrink-0 relative z-20 overflow-x-auto overflow-y-visible scrollbar-none">
      {renderOptions()}
    </div>
  );
});
