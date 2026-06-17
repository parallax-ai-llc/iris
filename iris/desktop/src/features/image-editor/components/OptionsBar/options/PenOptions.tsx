/**
 * PenOptions - Pen tool options for Options Bar
 */

import { memo, useCallback } from 'react';
import { PenTool, MousePointer2, Trash2, ArrowRightCircle } from 'lucide-react';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { ActionButton, BarSeparator } from '../shared';

export const PenOptions = memo(function PenOptions() {
  const penToolMode = useImageEditorStore((s) => s.penToolMode);
  const setPenToolMode = useImageEditorStore((s) => s.setPenToolMode);
  const activePathId = useImageEditorStore((s) => s.activePathId);
  const activePointIndex = useImageEditorStore((s) => s.activePointIndex);
  const activePath = useImageEditorStore((s) => s.paths.find(p => p.id === s.activePathId) ?? null);
  const removePathPoint = useImageEditorStore((s) => s.removePathPoint);
  const closePath = useImageEditorStore((s) => s.closePath);
  const loadPathAsSelection = useImageEditorStore((s) => s.loadPathAsSelection);
  const fillPath = useImageEditorStore((s) => s.fillPath);
  const strokePath = useImageEditorStore((s) => s.strokePath);
  const brushColor = useImageEditorStore((s) => s.brushSettings.color);
  const setBrushSettings = useImageEditorStore((s) => s.setBrushSettings);

  const handleDeletePoint = useCallback(() => {
    if (activePathId && activePointIndex !== null) {
      removePathPoint(activePathId, activePointIndex);
    }
  }, [activePathId, activePointIndex, removePathPoint]);

  const handleClosePath = useCallback(() => {
    if (activePathId) {
      closePath(activePathId);
    }
  }, [activePathId, closePath]);

  const handleMakeSelection = useCallback(() => {
    if (activePathId) {
      loadPathAsSelection(activePathId);
    }
  }, [activePathId, loadPathAsSelection]);

  const handleFillPath = useCallback(() => {
    if (activePathId) {
      fillPath(activePathId);
    }
  }, [activePathId, fillPath]);

  const handleStrokePath = useCallback(() => {
    if (activePathId) {
      strokePath(activePathId);
    }
  }, [activePathId, strokePath]);

  return (
    <div className="flex items-center gap-2">
      <ActionButton
        icon={<PenTool className="w-3 h-3" />}
        label="Create"
        onClick={() => setPenToolMode('create')}
        variant={penToolMode === 'create' ? 'primary' : 'default'}
      />
      <ActionButton
        icon={<MousePointer2 className="w-3 h-3" />}
        label="Edit"
        onClick={() => setPenToolMode('edit')}
        variant={penToolMode === 'edit' ? 'primary' : 'default'}
      />

      {activePath && (
        <>
          <BarSeparator />
          {!activePath.closed && activePath.points.length >= 2 && (
            <ActionButton
              icon={<ArrowRightCircle className="w-3 h-3" />}
              label="Close Path"
              onClick={handleClosePath}
            />
          )}
          {activePointIndex !== null && (
            <ActionButton
              icon={<Trash2 className="w-3 h-3" />}
              label={`Delete Point #${activePointIndex + 1}`}
              onClick={handleDeletePoint}
            />
          )}
          <BarSeparator />
          <input
            type="color"
            value={brushColor}
            onChange={(e) => setBrushSettings({ color: e.target.value })}
            className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
            title="Fill / Stroke Color"
          />
          <ActionButton label="Fill" onClick={handleFillPath} />
          <ActionButton label="Stroke" onClick={handleStrokePath} />
          <ActionButton label="Make Selection" onClick={handleMakeSelection} />
        </>
      )}

      <span className="text-[10px] text-zinc-500 ml-2">
        {activePath ? `${activePath.points.length} pts` : 'Click to add points'}
      </span>
    </div>
  );
});
