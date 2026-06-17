/**
 * HistoryControls - Undo/Redo controls
 */

import { memo } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { Undo2, Redo2, Clock } from 'lucide-react';

export const HistoryControls = memo(function HistoryControls() {
  const { history, historyIndex, undo, redo, canUndo, canRedo } = useImageEditorStore();

  const undoEnabled = canUndo();
  const redoEnabled = canRedo();

  return (
    <div className="flex items-center gap-1">
      {/* Undo */}
      <button
        onClick={undo}
        disabled={!undoEnabled}
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          undoEnabled
            ? 'text-zinc-400 hover:text-white hover:bg-zinc-700'
            : 'text-zinc-600 cursor-not-allowed'
        )}
        title="Undo (Ctrl+Z)"
      >
        <Undo2 className="w-4 h-4" />
      </button>

      {/* Redo */}
      <button
        onClick={redo}
        disabled={!redoEnabled}
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          redoEnabled
            ? 'text-zinc-400 hover:text-white hover:bg-zinc-700'
            : 'text-zinc-600 cursor-not-allowed'
        )}
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo2 className="w-4 h-4" />
      </button>

      {/* History indicator */}
      {history.length > 0 && (
        <div className="flex items-center gap-1 ml-2 px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-500">
          <Clock className="w-3 h-3" />
          <span>{historyIndex + 1}/{history.length}</span>
        </div>
      )}
    </div>
  );
});

export default HistoryControls;
