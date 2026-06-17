/**
 * HistorySection - History state list with click-to-jump
 */

import { memo, useCallback } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { Clock, Undo2, Redo2 } from 'lucide-react';
import { CollapsibleSection } from '../CollapsibleSection';

export const HistorySection = memo(function HistorySection() {
  const {
    history,
    historyIndex,
    goToHistoryState,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useImageEditorStore();

  const handleJump = useCallback((index: number) => {
    goToHistoryState(index);
  }, [goToHistoryState]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <CollapsibleSection title="History" count={history.length}>
      {/* Undo/Redo toolbar */}
      <div className="flex items-center gap-1 mb-2">
        <button
          onClick={undo}
          disabled={!canUndo()}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white text-[10px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Undo2 className="w-3 h-3" />
          Undo
        </button>
        <button
          onClick={redo}
          disabled={!canRedo()}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white text-[10px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Redo2 className="w-3 h-3" />
          Redo
        </button>
      </div>

      {/* History list */}
      {history.length === 0 ? (
        <div className="py-4 text-center text-zinc-500 text-xs">
          No history yet
        </div>
      ) : (
        <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
          {history.map((state, index) => (
            <button
              key={state.id}
              onClick={() => handleJump(index)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors',
                index === historyIndex
                  ? 'bg-white/10 text-white border border-white/20'
                  : index > historyIndex
                    ? 'text-zinc-600 hover:bg-zinc-800/50 hover:text-zinc-400'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
              )}
            >
              <Clock className="w-3 h-3 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs truncate block">{state.label}</span>
              </div>
              <span className="text-[10px] text-zinc-600 tabular-nums flex-shrink-0">
                {formatTime(state.timestamp)}
              </span>
            </button>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
});
