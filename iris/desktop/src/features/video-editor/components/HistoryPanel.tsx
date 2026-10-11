/**
 * HistoryPanel - Undo/Redo history panel for video editor
 * Displays the full action history as a scrollable list.
 *
 * Features:
 * - Chronological list of history entries (most recent at top)
 * - Current state highlighted in blue
 * - Future (redo) states shown grayed out
 * - Click any entry to jump to that state
 * - Undo / Redo buttons at the top
 * - Clear history button
 */

import { memo, useCallback, useRef, useEffect } from 'react';
import {
  Clock,
  Undo2,
  Redo2,
  Trash2,
  Film,
  Scissors,
  Copy,
  Plus,
  Minus,
  ArrowLeftRight,
  Layers,
  Music,
  Type,
  AlignStartHorizontal,
  AlignEndHorizontal,
  AlignCenterHorizontal,
  Move,
  CornerDownRight,
  SplitSquareHorizontal,
  Link2,
  Link2Off,
  Wand2,
  KeySquare,
  Eraser,
  GripVertical,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useEditorStore, selectHistoryLabels, selectHistoryIndex, selectHistoryLength } from '@/features/video-editor/stores/editor.store';

/** Map action labels to lucide icons */
function getIconForLabel(label: string) {
  const l = label.toLowerCase();
  if (l.includes('add clip')) return Film;
  if (l.includes('remove clip') || l.includes('delete')) return Minus;
  if (l.includes('add track')) return Layers;
  if (l.includes('remove track')) return Minus;
  if (l.includes('reorder track')) return GripVertical;
  if (l.includes('move clip') || l.includes('move clips')) return Move;
  if (l.includes('trim')) return Scissors;
  if (l.includes('split')) return SplitSquareHorizontal;
  if (l.includes('duplicate')) return Copy;
  if (l.includes('link clips')) return Link2;
  if (l.includes('unlink')) return Link2Off;
  if (l.includes('ripple')) return CornerDownRight;
  if (l.includes('subtitle') || l.includes('import subtitle')) return Type;
  if (l.includes('music')) return Music;
  if (l.includes('keyframe') && l.includes('add')) return Plus;
  if (l.includes('keyframe') && l.includes('update')) return Wand2;
  if (l.includes('keyframe') && l.includes('remove')) return Minus;
  if (l.includes('keyframe')) return KeySquare;
  if (l.includes('align') && l.includes('start')) return AlignStartHorizontal;
  if (l.includes('align') && l.includes('end')) return AlignEndHorizontal;
  if (l.includes('align')) return AlignCenterHorizontal;
  if (l.includes('gap')) return ArrowLeftRight;
  if (l.includes('adjustment')) return Layers;
  if (l.includes('compound')) return Layers;
  return Film;
}

/** Format a timestamp (ISO string) to relative human-readable text */
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = Date.now();
  const diff = now - date.getTime();

  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

interface HistoryPanelProps {
  className?: string;
}

export const HistoryPanel = memo(function HistoryPanel({ className }: HistoryPanelProps) {
  const labels = useEditorStore(selectHistoryLabels);
  const historyIndex = useEditorStore(selectHistoryIndex);
  const historyLength = useEditorStore(selectHistoryLength);
  const history = useEditorStore((s) => s.history);

  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const jumpToHistory = useEditorStore((s) => s.jumpToHistory);
  const clearHistory = useEditorStore((s) => s.clearHistory);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyLength - 1;

  const listRef = useRef<HTMLDivElement>(null);

  // Scroll active entry into view when historyIndex changes
  useEffect(() => {
    if (!listRef.current) return;
    // Entries are rendered in reverse order (index 0 = bottom of list, historyLength-1 = top)
    const activeEl = listRef.current.querySelector('[data-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [historyIndex]);

  const handleJump = useCallback(
    (index: number) => {
      jumpToHistory(index);
    },
    [jumpToHistory]
  );

  // Entries displayed newest-first (reverse order)
  const entries = Array.from({ length: historyLength }, (_, i) => {
    const reverseIndex = historyLength - 1 - i; // display index 0 = newest
    return {
      displayIndex: i,
      storeIndex: reverseIndex,
      label: labels[reverseIndex] ?? 'Edit',
      timestamp: history[reverseIndex]?.updatedAt ?? new Date().toISOString(),
      isCurrent: reverseIndex === historyIndex,
      isFuture: reverseIndex > historyIndex,
    };
  });

  return (
    <div className={cn('flex flex-col h-full bg-zinc-900', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-xs font-medium text-zinc-300">History</span>
          {historyLength > 0 && (
            <span className="text-xs text-zinc-600">
              ({historyIndex + 1}/{historyLength})
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {/* Undo button */}
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className={cn(
              'p-1 rounded transition-colors',
              canUndo
                ? 'text-zinc-400 hover:text-white hover:bg-zinc-700'
                : 'text-zinc-700 cursor-not-allowed'
            )}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          {/* Redo button */}
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            className={cn(
              'p-1 rounded transition-colors',
              canRedo
                ? 'text-zinc-400 hover:text-white hover:bg-zinc-700'
                : 'text-zinc-700 cursor-not-allowed'
            )}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          {/* Clear history */}
          {historyLength > 0 && (
            <button
              onClick={clearHistory}
              title="Clear history"
              className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-700 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Entry list */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {historyLength === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-600 py-8">
            <Eraser className="w-8 h-8" />
            <p className="text-xs">No history yet</p>
          </div>
        ) : (
          <ul className="py-1">
            {entries.map((entry) => {
              const Icon = getIconForLabel(entry.label);
              return (
                <li key={entry.storeIndex}>
                  <button
                    data-active={entry.isCurrent}
                    onClick={() => handleJump(entry.storeIndex)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors',
                      entry.isCurrent
                        ? 'bg-blue-600/20 text-white border-l-2 border-blue-500'
                        : entry.isFuture
                        ? 'text-zinc-600 hover:bg-zinc-800/50 border-l-2 border-transparent'
                        : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 border-l-2 border-transparent'
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-3.5 h-3.5 flex-shrink-0',
                        entry.isCurrent
                          ? 'text-blue-400'
                          : entry.isFuture
                          ? 'text-zinc-700'
                          : 'text-zinc-500'
                      )}
                    />
                    <span className="flex-1 text-xs truncate">{entry.label}</span>
                    <span
                      className={cn(
                        'text-xs flex-shrink-0 tabular-nums',
                        entry.isCurrent
                          ? 'text-blue-400/70'
                          : 'text-zinc-700'
                      )}
                    >
                      {formatRelativeTime(entry.timestamp)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
});

export default HistoryPanel;
