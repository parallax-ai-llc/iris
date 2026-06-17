/**
 * ImageInfoSection - Image metadata display
 */

import { memo } from 'react';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { CollapsibleSection } from '../CollapsibleSection';

export const ImageInfoSection = memo(function ImageInfoSection() {
  const { sourceAsset, zoom, rotation, colorProofing, gamutWarning, colorProfile } = useImageEditorStore();

  if (!sourceAsset) return null;

  return (
    <CollapsibleSection title="Image Info" defaultOpen={false}>
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-zinc-500">Name</span>
          <span className="text-zinc-300 truncate max-w-[140px] text-right">{sourceAsset.name}</span>
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
        <div className="flex justify-between text-xs">
          <span className="text-zinc-500">Zoom</span>
          <span className="text-zinc-300 tabular-nums">{Math.round(zoom)}%</span>
        </div>
        {rotation !== 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500">Rotation</span>
            <span className="text-zinc-300 tabular-nums">{rotation}°</span>
          </div>
        )}
        <div className="flex justify-between text-xs">
          <span className="text-zinc-500">Color</span>
          <span className="text-zinc-300">RGB/8</span>
        </div>
        {colorProofing && (
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500">Proof</span>
            <span className="text-cyan-400 truncate max-w-[140px] text-right">{colorProfile}</span>
          </div>
        )}
        {gamutWarning && (
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500">Gamut</span>
            <span className="text-yellow-400">Warning Active</span>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
});
