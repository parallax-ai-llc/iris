/**
 * CropOptions - Crop tool options for Options Bar
 */

import { memo, useCallback } from 'react';
import { RotateCcw, Check } from 'lucide-react';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { PillButtonGroup, ActionButton, BarSeparator } from '../shared';

const ASPECT_OPTIONS = [
  { id: 'free', label: 'Free' },
  { id: '1:1', label: '1:1' },
  { id: '4:3', label: '4:3' },
  { id: '16:9', label: '16:9' },
  { id: '3:2', label: '3:2' },
  { id: '5:4', label: '5:4' },
  { id: '3:4', label: '3:4' },
  { id: '9:16', label: '9:16' },
  { id: '2:3', label: '2:3' },
];

export const CropOptions = memo(function CropOptions() {
  const { cropData, cropAspectRatio, setCropAspectRatio, setCropData, applyCrop } = useImageEditorStore();

  const handleReset = useCallback(() => {
    setCropData(null);
    setCropAspectRatio('free');
  }, [setCropData, setCropAspectRatio]);

  return (
    <div className="flex items-center gap-2">
      <PillButtonGroup
        options={ASPECT_OPTIONS}
        value={cropAspectRatio}
        onChange={(v) => setCropAspectRatio(v as typeof cropAspectRatio)}
      />

      {cropData && (
        <>
          <BarSeparator />
          <span className="text-[10px] text-zinc-500 tabular-nums">
            {Math.round(cropData.width)} x {Math.round(cropData.height)}
          </span>
        </>
      )}

      <BarSeparator />
      <ActionButton icon={<RotateCcw className="w-3 h-3" />} label="Reset" onClick={handleReset} />
      <ActionButton
        icon={<Check className="w-3 h-3" />}
        label="Apply"
        onClick={applyCrop}
        disabled={!cropData}
        variant="primary"
      />
    </div>
  );
});
