/**
 * DefaultPanel - Shown when no specific mode is selected
 */

import { memo } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import {
  Crop,
  SunMedium,
  Palette,
  Sparkles,
  Eraser,
  Wand2,
  Smile,
  Droplets,
  Info,
} from 'lucide-react';

const QUICK_ACTIONS = [
  { id: 'crop', label: 'Crop', icon: <Crop className="w-5 h-5" />, mode: 'crop' as const },
  { id: 'adjust', label: 'Adjust', icon: <SunMedium className="w-5 h-5" />, mode: 'adjust' as const },
  { id: 'filter', label: 'Filter', icon: <Palette className="w-5 h-5" />, mode: 'filter' as const },
];

const AI_ACTIONS = [
  { id: 'upscale', label: 'Upscale', icon: <Sparkles className="w-5 h-5" />, mode: 'upscale' as const },
  { id: 'bgRemove', label: 'Remove BG', icon: <Eraser className="w-5 h-5" />, mode: 'bgRemove' as const },
  { id: 'inpaint', label: 'Inpaint', icon: <Wand2 className="w-5 h-5" />, mode: 'inpaint' as const },
  { id: 'faceRestore', label: 'Face Restore', icon: <Smile className="w-5 h-5" />, mode: 'faceRestore' as const },
  { id: 'colorize', label: 'Colorize', icon: <Droplets className="w-5 h-5" />, mode: 'colorize' as const },
];

export const DefaultPanel = memo(function DefaultPanel() {
  const { setEditMode, sourceAsset } = useImageEditorStore();

  return (
    <div className="p-4 space-y-6">
      {/* Welcome message */}
      <div className="p-3 bg-zinc-800/50 rounded-lg">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-zinc-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-400">
            Select a tool from the left panel or use the quick actions below to start editing.
          </p>
        </div>
      </div>

      {/* Image info */}
      {sourceAsset && (
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
            Image Info
          </h3>
          <div className="space-y-2 p-3 bg-zinc-800 rounded-lg">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Name</span>
              <span className="text-zinc-300 truncate max-w-[150px]">{sourceAsset.name}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Type</span>
              <span className="text-zinc-300">{sourceAsset.mimeType}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Size</span>
              <span className="text-zinc-300">
                {sourceAsset.sizeBytes ? `${(sourceAsset.sizeBytes / 1024 / 1024).toFixed(2)} MB` : 'Unknown'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Quick Actions
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => setEditMode(action.mode)}
              className={cn(
                'flex flex-col items-center justify-center gap-2 p-3 rounded-lg',
                'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white',
                'transition-colors'
              )}
            >
              {action.icon}
              <span className="text-xs font-medium">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* AI Actions */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          AI Enhancements
        </h3>
        <div className="space-y-2">
          {AI_ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => setEditMode(action.mode)}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-lg',
                'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white',
                'transition-colors text-left'
              )}
            >
              <div className="p-2 rounded-lg bg-white/70/10 text-white/70">
                {action.icon}
              </div>
              <span className="text-sm">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});

export default DefaultPanel;
