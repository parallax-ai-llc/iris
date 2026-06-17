/**
 * PathsSection - Photoshop-style vector path management panel
 * Shows saved paths with fill, stroke, and selection conversion tools
 */

import { memo, useCallback } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import {
  Plus,
  Trash2,
  PenTool,
  Paintbrush,
  MousePointer2,
} from 'lucide-react';

export const PathsSection = memo(function PathsSection() {
  const {
    paths,
    activePathId,
    activeLayerId,
    addPath,
    deletePath,
    setActivePath,
    fillPath,
    strokePath,
    loadPathAsSelection,
  } = useImageEditorStore();

  const activePath = paths.find((p) => p.id === activePathId);

  const handleAddPath = useCallback(() => {
    addPath();
  }, [addPath]);

  const handleDelete = useCallback(() => {
    if (activePathId) deletePath(activePathId);
  }, [activePathId, deletePath]);

  const handleFill = useCallback(() => {
    if (activePathId) fillPath(activePathId);
  }, [activePathId, fillPath]);

  const handleStroke = useCallback(() => {
    if (activePathId) strokePath(activePathId);
  }, [activePathId, strokePath]);

  const handleLoadAsSelection = useCallback(() => {
    if (activePathId) loadPathAsSelection(activePathId);
  }, [activePathId, loadPathAsSelection]);

  const canActOnPath = !!activePath && activePath.points.length >= 2;

  return (
    <div className="px-3 pb-3">
      {/* Path list */}
      {paths.length === 0 ? (
        <div className="py-4 text-center text-zinc-500 text-xs">
          No paths yet
        </div>
      ) : (
        <div className="space-y-0.5">
          {paths.map((path) => (
            <div
              key={path.id}
              className={cn(
                'flex items-center gap-2 p-1.5 rounded-md transition-colors cursor-pointer',
                path.id === activePathId
                  ? 'bg-white/10 border border-white/20'
                  : 'bg-zinc-800/50 border border-transparent hover:bg-zinc-700/50'
              )}
              onClick={() => setActivePath(path.id)}
            >
              {/* Path icon */}
              <PenTool className="w-3 h-3 text-zinc-400 flex-shrink-0" />

              {/* Path name */}
              <span className={cn(
                'text-xs flex-1 truncate',
                path.id === activePathId ? 'text-white' : 'text-zinc-300'
              )}>
                {path.name}
              </span>

              {/* Point count */}
              <span className="text-[10px] text-zinc-500 tabular-nums flex-shrink-0">
                {path.points.length} pts
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-1 mt-3">
        <button
          onClick={handleFill}
          disabled={!canActOnPath || !activeLayerId}
          title="Fill Path"
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white text-[10px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Paintbrush className="w-3 h-3" />
          Fill
        </button>
        <button
          onClick={handleStroke}
          disabled={!canActOnPath || !activeLayerId}
          title="Stroke Path"
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white text-[10px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <PenTool className="w-3 h-3" />
          Stroke
        </button>
        <button
          onClick={handleLoadAsSelection}
          disabled={!canActOnPath}
          title="Load Path as Selection"
          className="p-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white text-[10px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <MousePointer2 className="w-3 h-3" />
        </button>
        <button
          onClick={handleAddPath}
          title="New Path"
          className="p-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
        <button
          onClick={handleDelete}
          disabled={!activePathId}
          title="Delete Path"
          className="p-1 rounded bg-zinc-800 text-zinc-400 hover:bg-red-600/20 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
});
