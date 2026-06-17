/**
 * AIOptions - Options bar content for AI modes
 * Shows mode name and hint text; actual controls are in floating panel
 */

import { memo } from 'react';
import { Sparkles, Eraser, Wand2, ImagePlus, Smile, Droplets } from 'lucide-react';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';

const AI_MODE_INFO: Record<string, { label: string; icon: React.ReactNode; hint: string }> = {
  upscale: { label: 'AI Upscale', icon: <Sparkles className="w-3.5 h-3.5" />, hint: 'Configure upscale settings in the floating panel' },
  bgRemove: { label: 'Remove Background', icon: <Eraser className="w-3.5 h-3.5" />, hint: 'Configure settings in the floating panel' },
  inpaint: { label: 'AI Inpaint', icon: <Wand2 className="w-3.5 h-3.5" />, hint: 'Draw a mask on canvas, configure in floating panel' },
  outpaint: { label: 'AI Outpaint', icon: <ImagePlus className="w-3.5 h-3.5" />, hint: 'Configure expansion settings in the floating panel' },
  faceRestore: { label: 'Face Restore', icon: <Smile className="w-3.5 h-3.5" />, hint: 'Configure restoration settings in the floating panel' },
  colorize: { label: 'Colorize', icon: <Droplets className="w-3.5 h-3.5" />, hint: 'Configure colorization settings in the floating panel' },
};

export const AIOptions = memo(function AIOptions() {
  const editMode = useImageEditorStore((s) => s.editMode);
  const info = AI_MODE_INFO[editMode];

  if (!info) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-md border border-white/10">
        {info.icon}
        <span className="text-[11px] text-white font-medium">{info.label}</span>
      </div>
      <span className="text-[11px] text-zinc-500">{info.hint}</span>
    </div>
  );
});
