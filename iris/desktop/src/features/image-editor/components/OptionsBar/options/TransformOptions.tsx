/**
 * TransformOptions - Transform tool options for Options Bar
 */

import { memo, useCallback, useState } from 'react';
import { RotateCw, RotateCcw, FlipHorizontal, FlipVertical, Grid3x3 } from 'lucide-react';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { CompactSlider, ActionButton, BarSeparator } from '../shared';

export const TransformOptions = memo(function TransformOptions() {
  const { rotation, setRotation, toggleFlipHorizontal, toggleFlipVertical, enterWarpMode, isWarpMode } = useImageEditorStore();
  const [localRotation, setLocalRotation] = useState(rotation);

  const handleRotateCW = useCallback(() => {
    const newRot = (rotation + 90) % 360;
    setRotation(newRot);
    setLocalRotation(newRot);
  }, [rotation, setRotation]);

  const handleRotateCCW = useCallback(() => {
    const newRot = (rotation - 90 + 360) % 360;
    setRotation(newRot);
    setLocalRotation(newRot);
  }, [rotation, setRotation]);

  const handleRotationSlider = useCallback((value: number) => {
    setLocalRotation(value);
    setRotation(value);
  }, [setRotation]);

  return (
    <div className="flex items-center gap-2">
      <ActionButton icon={<RotateCcw className="w-3.5 h-3.5" />} label="90°L" onClick={handleRotateCCW} />
      <ActionButton icon={<RotateCw className="w-3.5 h-3.5" />} label="90°R" onClick={handleRotateCW} />
      <BarSeparator />
      <ActionButton icon={<FlipHorizontal className="w-3.5 h-3.5" />} label="Flip H" onClick={toggleFlipHorizontal} />
      <ActionButton icon={<FlipVertical className="w-3.5 h-3.5" />} label="Flip V" onClick={toggleFlipVertical} />
      <BarSeparator />
      <CompactSlider
        label="Angle"
        value={localRotation}
        min={0}
        max={360}
        onChange={handleRotationSlider}
        unit="°"
      />
      <BarSeparator />
      <ActionButton
        icon={<Grid3x3 className="w-3.5 h-3.5" />}
        label="Warp"
        onClick={enterWarpMode}
        disabled={isWarpMode}
        variant={isWarpMode ? 'primary' : 'default'}
      />
    </div>
  );
});
