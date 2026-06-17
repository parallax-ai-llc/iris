/**
 * PropertiesPanel - Right sidebar with mode-specific properties
 * Dynamic panel that changes based on current edit mode
 */

import { memo, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore, type EditMode } from '@/features/image-editor/stores/imageEditor.store';
import { AdjustPanel } from './panels/AdjustPanel';
import { FilterPanel } from './panels/FilterPanel';
import { CropPanel } from './panels/CropPanel';
import { TransformPanel } from './panels/TransformPanel';
import { SelectionPanel } from './panels/SelectionPanel';
import { DrawingPanel } from './panels/DrawingPanel';
import { TextPanel } from './panels/TextPanel';
import { LayersPanel } from './panels/LayersPanel';
import { UpscalePanel } from './panels/UpscalePanel';
import { BgRemovePanel } from './panels/BgRemovePanel';
import { InpaintPanel } from './panels/InpaintPanel';
import { OutpaintPanel } from './panels/OutpaintPanel';
import { FaceRestorePanel } from './panels/FaceRestorePanel';
import { ColorizePanel } from './panels/ColorizePanel';
import { DefaultPanel } from './panels/DefaultPanel';

// AI edit modes that should show back button
const AI_MODES: EditMode[] = ['upscale', 'bgRemove', 'inpaint', 'outpaint', 'faceRestore', 'colorize'];

export const PropertiesPanel = memo(function PropertiesPanel() {
  const { editMode, sourceAsset, setEditMode } = useImageEditorStore();
  
  const isAIMode = AI_MODES.includes(editMode);
  
  const handleBack = useCallback(() => {
    setEditMode('none');
  }, [setEditMode]);

  // Render panel based on current edit mode
  const renderPanel = () => {
    switch (editMode) {
      case 'adjust':
        return <AdjustPanel />;
      case 'filter':
        return <FilterPanel />;
      case 'crop':
        return <CropPanel />;
      case 'transform':
        return <TransformPanel />;
      case 'selection':
        return <SelectionPanel />;
      case 'drawing':
        return <DrawingPanel />;
      case 'text':
        return <TextPanel />;
      case 'layers':
        return <LayersPanel />;
      case 'upscale':
        return <UpscalePanel />;
      case 'bgRemove':
        return <BgRemovePanel />;
      case 'inpaint':
        return <InpaintPanel />;
      case 'outpaint':
        return <OutpaintPanel />;
      case 'faceRestore':
        return <FaceRestorePanel />;
      case 'colorize':
        return <ColorizePanel />;
      default:
        return <DefaultPanel />;
    }
  };

  // Get panel title based on mode
  const getPanelTitle = () => {
    switch (editMode) {
      case 'adjust': return 'Adjustments';
      case 'filter': return 'Filters';
      case 'crop': return 'Crop';
      case 'transform': return 'Transform';
      case 'selection': return 'Selection';
      case 'drawing': return 'Drawing';
      case 'text': return 'Text';
      case 'layers': return 'Layers';
      case 'upscale': return 'AI Upscale';
      case 'bgRemove': return 'Remove Background';
      case 'inpaint': return 'AI Inpaint';
      case 'outpaint': return 'AI Outpaint';
      case 'faceRestore': return 'Face Restore';
      case 'colorize': return 'Colorize';
      default: return 'Properties';
    }
  };

  return (
    <div className="w-72 bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden">
      {/* Panel header */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          {isAIMode && (
            <button
              onClick={handleBack}
              className={cn(
                'p-1 -ml-1 rounded-md transition-colors',
                'hover:bg-zinc-800 text-zinc-400 hover:text-white'
              )}
              title="Back to tools"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-medium text-white">{getPanelTitle()}</h2>
            {sourceAsset && (
              <p className="text-xs text-zinc-500 truncate mt-0.5">
                {sourceAsset.name}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto">
        {renderPanel()}
      </div>
    </div>
  );
});

export default PropertiesPanel;
