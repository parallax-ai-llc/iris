/**
 * TranscriptPanel — Text-based video editing via transcript
 *
 * Features:
 * - Scrollable transcript with per-cue blocks
 * - Click cue → seek to that time
 * - Select cues → select corresponding timeline clips
 * - Delete cue → remove subtitle clip from timeline
 * - Inline edit cue text → update subtitle clip + sync to backend
 * - Auto-scroll to follow playhead
 * - Search/filter within transcript
 */

import { memo, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  FileText,
  Search,
  Trash2,
  Edit3,
  Check,
  X,
  Scissors,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { formatSubtitleTime } from '@/shared/api/subtitle.api';
import { useEditorStore } from '@/features/video-editor/stores/editor.store';
import type { SubtitleClip } from '@/types/editor.types';

// ==================== Types ====================

interface TranscriptCue {
  id: string;
  clipId: string;      // corresponding timeline clip ID
  index: number;
  startTime: number;   // seconds
  endTime: number;     // seconds
  text: string;
}

interface TranscriptPanelProps {
  className?: string;
  subtitleId?: string;  // for backend sync
  onCueUpdate?: (cue: TranscriptCue) => void;
  onCueDelete?: (cue: TranscriptCue) => void;
}

// ==================== Component ====================

export const TranscriptPanel = memo(function TranscriptPanel({
  className,
  subtitleId: _subtitleId,
  onCueUpdate,
  onCueDelete,
}: TranscriptPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCueId, setEditingCueId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeCueRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Editor store
  const tracks = useEditorStore((s) => s.tracks);
  const currentTime = useEditorStore((s) => s.currentTime);
  const selectedClip = useEditorStore((s) => s.selectedClip);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const selectClip = useEditorStore((s) => s.selectClip);
  const removeClip = useEditorStore((s) => s.removeClip);
  const updateClip = useEditorStore((s) => s.updateClip);
  const splitClip = useEditorStore((s) => s.splitClip);
  const selectClipsInRange = useEditorStore((s) => s.selectClipsInRange);

  // Extract transcript cues from subtitle track clips
  const cues = useMemo<TranscriptCue[]>(() => {
    const subtitleTrack = tracks.find((t) => t.type === 'subtitle');
    if (!subtitleTrack) return [];

    return subtitleTrack.clips
      .filter((c): c is SubtitleClip => c.type === 'subtitle')
      .sort((a, b) => a.startTime - b.startTime)
      .map((clip, idx) => ({
        id: clip.cueId || clip.id,
        clipId: clip.id,
        index: idx,
        startTime: clip.startTime,
        endTime: clip.endTime,
        text: clip.text || clip.name || '',
      }));
  }, [tracks]);

  // Filter cues by search
  const filteredCues = useMemo(() => {
    if (!searchQuery.trim()) return cues;
    const q = searchQuery.toLowerCase();
    return cues.filter((c) => c.text.toLowerCase().includes(q));
  }, [cues, searchQuery]);

  // Find active cue at current time
  const activeCueIndex = useMemo(() => {
    return cues.findIndex(
      (c) => currentTime >= c.startTime && currentTime < c.endTime
    );
  }, [cues, currentTime]);

  // Auto-scroll to active cue
  useEffect(() => {
    if (autoScroll && activeCueRef.current && scrollContainerRef.current) {
      activeCueRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeCueIndex, autoScroll]);

  // ==================== Handlers ====================

  /** Click cue → seek to that time + select the clip */
  const handleCueClick = useCallback(
    (cue: TranscriptCue) => {
      setCurrentTime(cue.startTime);
      selectClip(cue.clipId);
    },
    [setCurrentTime, selectClip]
  );

  /** Select range of cues (shift-click) */
  const handleCueShiftClick = useCallback(
    (cue: TranscriptCue, index: number) => {
      if (activeCueIndex < 0) {
        handleCueClick(cue);
        return;
      }

      const start = Math.min(activeCueIndex, index);
      const end = Math.max(activeCueIndex, index);
      const clipIds = cues.slice(start, end + 1).map((c) => c.clipId);
      selectClipsInRange(clipIds);
    },
    [activeCueIndex, cues, selectClipsInRange, handleCueClick]
  );

  /** Delete cue → remove clip from timeline */
  const handleDeleteCue = useCallback(
    (cue: TranscriptCue) => {
      removeClip(cue.clipId);
      onCueDelete?.(cue);
    },
    [removeClip, onCueDelete]
  );

  /** Start editing cue text */
  const handleStartEdit = useCallback((cue: TranscriptCue) => {
    setEditingCueId(cue.id);
    setEditText(cue.text);
  }, []);

  /** Save edited cue text */
  const handleSaveEdit = useCallback(
    (cue: TranscriptCue) => {
      if (editText.trim() && editText !== cue.text) {
        updateClip(cue.clipId, {
          name: editText.substring(0, 30),
          text: editText,
        } as Partial<SubtitleClip>);
        onCueUpdate?.({ ...cue, text: editText });
      }
      setEditingCueId(null);
      setEditText('');
    },
    [editText, updateClip, onCueUpdate]
  );

  /** Cancel editing */
  const handleCancelEdit = useCallback(() => {
    setEditingCueId(null);
    setEditText('');
  }, []);

  /** Split at playhead position within the active cue */
  const handleSplitAtPlayhead = useCallback(() => {
    if (activeCueIndex < 0) return;
    const cue = cues[activeCueIndex];
    if (currentTime > cue.startTime && currentTime < cue.endTime) {
      splitClip(cue.clipId, currentTime);
    }
  }, [activeCueIndex, cues, currentTime, splitClip]);

  /** Handle keyboard in edit mode */
  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent, cue: TranscriptCue) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSaveEdit(cue);
      } else if (e.key === 'Escape') {
        handleCancelEdit();
      }
    },
    [handleSaveEdit, handleCancelEdit]
  );

  // No subtitle track
  if (cues.length === 0) {
    return (
      <div className={cn('flex flex-col h-full bg-zinc-900', className)}>
        <PanelHeader
          showSearch={showSearch}
          onToggleSearch={() => setShowSearch(!showSearch)}
        />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="text-sm text-zinc-500">No transcript available</p>
            <p className="text-xs text-zinc-600">
              Generate auto-captions first to enable text-based editing
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full bg-zinc-900', className)}>
      {/* Header */}
      <PanelHeader
        showSearch={showSearch}
        onToggleSearch={() => setShowSearch(!showSearch)}
        cueCount={filteredCues.length}
        totalCount={cues.length}
      />

      {/* Search bar */}
      {showSearch && (
        <div className="px-3 py-2 border-b border-zinc-800">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search transcript..."
              className="w-full pl-8 pr-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                <X className="w-3 h-3 text-zinc-500 hover:text-white" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-800">
        <button
          onClick={handleSplitAtPlayhead}
          disabled={activeCueIndex < 0}
          className={cn(
            'p-1 rounded transition-colors',
            activeCueIndex >= 0
              ? 'hover:bg-zinc-800 text-zinc-400 hover:text-white'
              : 'text-zinc-700 cursor-not-allowed'
          )}
          title="Split at playhead (S)"
        >
          <Scissors className="w-3.5 h-3.5" />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={cn(
            'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
            autoScroll
              ? 'bg-blue-500/20 text-blue-400'
              : 'text-zinc-500 hover:text-zinc-300'
          )}
          title="Auto-scroll to follow playhead"
        >
          Auto-scroll
        </button>
      </div>

      {/* Cue list */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
      >
        {filteredCues.map((cue) => {
          const isActive =
            currentTime >= cue.startTime && currentTime < cue.endTime;
          const isSelected = selectedClip?.id === cue.clipId;
          const isEditing = editingCueId === cue.id;
          const originalIndex = cues.indexOf(cue);

          return (
            <div
              key={cue.id}
              ref={isActive ? activeCueRef : undefined}
              className={cn(
                'group border-b border-zinc-800/50 transition-colors cursor-pointer',
                isActive && 'bg-blue-500/10',
                isSelected && !isActive && 'bg-zinc-800/80',
                !isActive && !isSelected && 'hover:bg-zinc-800/40'
              )}
              onClick={(e) => {
                if (isEditing) return;
                if (e.shiftKey) {
                  handleCueShiftClick(cue, originalIndex);
                } else {
                  handleCueClick(cue);
                }
              }}
            >
              {/* Time label */}
              <div className="flex items-center gap-2 px-3 pt-2 pb-0.5">
                <span
                  className={cn(
                    'text-[10px] font-mono',
                    isActive ? 'text-blue-400' : 'text-zinc-600'
                  )}
                >
                  {formatSubtitleTime(cue.startTime)}
                </span>
                <span className="text-[10px] text-zinc-700">-</span>
                <span
                  className={cn(
                    'text-[10px] font-mono',
                    isActive ? 'text-blue-400' : 'text-zinc-600'
                  )}
                >
                  {formatSubtitleTime(cue.endTime)}
                </span>

                {/* Action buttons (visible on hover/active) */}
                <div className="flex-1" />
                <div
                  className={cn(
                    'flex items-center gap-0.5 transition-opacity',
                    isActive || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  )}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit(cue);
                    }}
                    className="p-0.5 hover:bg-zinc-700 rounded"
                    title="Edit text"
                  >
                    <Edit3 className="w-3 h-3 text-zinc-500 hover:text-white" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCue(cue);
                    }}
                    className="p-0.5 hover:bg-red-500/20 rounded"
                    title="Delete segment"
                  >
                    <Trash2 className="w-3 h-3 text-zinc-500 hover:text-red-400" />
                  </button>
                </div>
              </div>

              {/* Text content */}
              <div className="px-3 pb-2">
                {isEditing ? (
                  <div className="flex items-start gap-1">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => handleEditKeyDown(e, cue)}
                      className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-white resize-none focus:outline-none focus:border-blue-500"
                      rows={2}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveEdit(cue);
                        }}
                        className="p-0.5 hover:bg-emerald-500/20 rounded"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelEdit();
                        }}
                        className="p-0.5 hover:bg-red-500/20 rounded"
                      >
                        <X className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <p
                    className={cn(
                      'text-xs leading-relaxed',
                      isActive ? 'text-white' : 'text-zinc-300'
                    )}
                  >
                    {searchQuery
                      ? highlightMatch(cue.text, searchQuery)
                      : cue.text}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer: summary */}
      <div className="px-3 py-1.5 border-t border-zinc-800 flex items-center justify-between">
        <span className="text-[10px] text-zinc-600">
          {cues.length} segment{cues.length !== 1 ? 's' : ''}
        </span>
        {cues.length > 0 && (
          <span className="text-[10px] text-zinc-600">
            {formatSubtitleTime(cues[0].startTime)} - {formatSubtitleTime(cues[cues.length - 1].endTime)}
          </span>
        )}
      </div>
    </div>
  );
});

// ==================== Sub-components ====================

const PanelHeader = memo(function PanelHeader({
  showSearch,
  onToggleSearch,
  cueCount,
  totalCount,
}: {
  showSearch: boolean;
  onToggleSearch: () => void;
  cueCount?: number;
  totalCount?: number;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 border-b border-zinc-700">
      <FileText className="w-4 h-4 text-zinc-400" />
      <span className="text-xs font-medium text-zinc-300">Transcript</span>
      {cueCount !== undefined && totalCount !== undefined && cueCount !== totalCount && (
        <span className="text-[10px] text-zinc-500">
          ({cueCount}/{totalCount})
        </span>
      )}
      <div className="flex-1" />
      <button
        onClick={onToggleSearch}
        className={cn(
          'p-1 rounded transition-colors',
          showSearch
            ? 'bg-zinc-700 text-white'
            : 'hover:bg-zinc-700 text-zinc-500 hover:text-white'
        )}
        title="Search transcript"
      >
        <Search className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});

// ==================== Helpers ====================

/** Highlight search matches in text */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;

  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-500/30 text-yellow-200 rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
