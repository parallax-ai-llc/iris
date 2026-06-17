/**
 * SubtitleCueEditor - Individual subtitle cue editing component
 * Supports inline text editing and time adjustment
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import {
  GripVertical,
  Trash2,
  Clock,
  Type,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { formatSubtitleTime, parseSubtitleTime, SubtitleCue } from '@/shared/api/subtitle.api';

interface SubtitleCueEditorProps {
  cue: SubtitleCue;
  isActive: boolean;
  videoDuration: number;
  onUpdate: (cue: Partial<SubtitleCue> & { id: string }) => void;
  onDelete: (id: string) => void;
  onSelect: (cue: SubtitleCue) => void;
  onSeekTo: (time: number) => void;
}

export const SubtitleCueEditor = memo(function SubtitleCueEditor({
  cue,
  isActive,
  videoDuration,
  onUpdate,
  onDelete,
  onSelect,
  onSeekTo,
}: SubtitleCueEditorProps) {
  const [isEditingText, setIsEditingText] = useState(false);
  const [isEditingStart, setIsEditingStart] = useState(false);
  const [isEditingEnd, setIsEditingEnd] = useState(false);
  const [localText, setLocalText] = useState(cue.text);
  const [localStartTime, setLocalStartTime] = useState(formatSubtitleTime(cue.startTime));
  const [localEndTime, setLocalEndTime] = useState(formatSubtitleTime(cue.endTime));

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);

  // Sync local state when cue changes
  useEffect(() => {
    setLocalText(cue.text);
    setLocalStartTime(formatSubtitleTime(cue.startTime));
    setLocalEndTime(formatSubtitleTime(cue.endTime));
  }, [cue.text, cue.startTime, cue.endTime]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current && isEditingText) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditingText]);

  // Handle text save
  const handleTextSave = useCallback(() => {
    setIsEditingText(false);
    if (localText.trim() !== cue.text) {
      onUpdate({ id: cue.id, text: localText.trim() });
    }
  }, [localText, cue.id, cue.text, onUpdate]);

  // Handle start time save
  const handleStartTimeSave = useCallback(() => {
    setIsEditingStart(false);
    const newTime = parseSubtitleTime(localStartTime);
    if (newTime >= 0 && newTime < cue.endTime && newTime !== cue.startTime) {
      onUpdate({ id: cue.id, startTime: newTime });
    } else {
      setLocalStartTime(formatSubtitleTime(cue.startTime));
    }
  }, [localStartTime, cue.id, cue.startTime, cue.endTime, onUpdate]);

  // Handle end time save
  const handleEndTimeSave = useCallback(() => {
    setIsEditingEnd(false);
    const newTime = parseSubtitleTime(localEndTime);
    if (newTime > cue.startTime && newTime <= videoDuration && newTime !== cue.endTime) {
      onUpdate({ id: cue.id, endTime: newTime });
    } else {
      setLocalEndTime(formatSubtitleTime(cue.endTime));
    }
  }, [localEndTime, cue.id, cue.startTime, cue.endTime, videoDuration, onUpdate]);

  // Handle key events
  const handleTextKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        setLocalText(cue.text);
        setIsEditingText(false);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleTextSave();
      }
    },
    [cue.text, handleTextSave]
  );

  const handleTimeKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLInputElement>,
      isStart: boolean,
      save: () => void,
      reset: () => void
    ) => {
      if (e.key === 'Enter') {
        save();
      } else if (e.key === 'Escape') {
        reset();
        if (isStart) {
          setIsEditingStart(false);
        } else {
          setIsEditingEnd(false);
        }
      }
    },
    []
  );

  // Nudge time by small increment
  const nudgeTime = useCallback(
    (isStart: boolean, delta: number) => {
      if (isStart) {
        const newTime = Math.max(0, cue.startTime + delta);
        if (newTime < cue.endTime) {
          onUpdate({ id: cue.id, startTime: newTime });
        }
      } else {
        const newTime = Math.min(videoDuration, cue.endTime + delta);
        if (newTime > cue.startTime) {
          onUpdate({ id: cue.id, endTime: newTime });
        }
      }
    },
    [cue.id, cue.startTime, cue.endTime, videoDuration, onUpdate]
  );

  const handleClick = useCallback(() => {
    onSelect(cue);
  }, [cue, onSelect]);

  const handleSeek = useCallback(() => {
    onSeekTo(cue.startTime);
  }, [cue.startTime, onSeekTo]);

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(cue.id);
    },
    [cue.id, onDelete]
  );

  const duration = cue.endTime - cue.startTime;

  return (
    <div
      className={cn(
        'group relative flex gap-3 p-3 rounded-lg transition-colors cursor-pointer',
        'border',
        isActive
          ? 'bg-white/10/20 border-white/30/50'
          : 'bg-zinc-800/50 border-zinc-700/50 hover:bg-zinc-800 hover:border-zinc-600'
      )}
      onClick={handleClick}
    >
      {/* Drag handle */}
      <div className="flex-shrink-0 pt-1 cursor-grab opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity">
        <GripVertical className="w-4 h-4 text-zinc-500" />
      </div>

      {/* Index badge */}
      <div
        className={cn(
          'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium',
          isActive
            ? 'bg-white/10 text-white border border-white/20'
            : 'bg-zinc-700 text-zinc-300'
        )}
      >
        {cue.index}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-2">
        {/* Time row */}
        <div className="flex items-center gap-2 text-xs">
          {/* Start time */}
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-zinc-500" />
            {isEditingStart ? (
              <input
                ref={startInputRef}
                type="text"
                value={localStartTime}
                onChange={(e) => setLocalStartTime(e.target.value)}
                onBlur={handleStartTimeSave}
                onKeyDown={(e) =>
                  handleTimeKeyDown(
                    e,
                    true,
                    handleStartTimeSave,
                    () => setLocalStartTime(formatSubtitleTime(cue.startTime))
                  )
                }
                className={cn(
                  'w-20 px-1 py-0.5 rounded bg-zinc-700 border border-white/30',
                  'text-white text-xs font-mono focus:outline-none'
                )}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <button
                className={cn(
                  'px-1.5 py-0.5 rounded font-mono transition-colors',
                  'text-zinc-300 hover:bg-zinc-700 hover:text-white'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingStart(true);
                  setTimeout(() => startInputRef.current?.select(), 0);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleSeek();
                }}
                title="Double-click to seek, click to edit"
              >
                {formatSubtitleTime(cue.startTime)}
              </button>
            )}
            <div className="flex flex-col">
              <button
                className="p-0.5 text-zinc-500 hover:text-white transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  nudgeTime(true, 0.1);
                }}
                title="Increase start time"
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              <button
                className="p-0.5 text-zinc-500 hover:text-white transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  nudgeTime(true, -0.1);
                }}
                title="Decrease start time"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </div>

          <span className="text-zinc-500">→</span>

          {/* End time */}
          <div className="flex items-center gap-1">
            {isEditingEnd ? (
              <input
                ref={endInputRef}
                type="text"
                value={localEndTime}
                onChange={(e) => setLocalEndTime(e.target.value)}
                onBlur={handleEndTimeSave}
                onKeyDown={(e) =>
                  handleTimeKeyDown(
                    e,
                    false,
                    handleEndTimeSave,
                    () => setLocalEndTime(formatSubtitleTime(cue.endTime))
                  )
                }
                className={cn(
                  'w-20 px-1 py-0.5 rounded bg-zinc-700 border border-white/30',
                  'text-white text-xs font-mono focus:outline-none'
                )}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <button
                className={cn(
                  'px-1.5 py-0.5 rounded font-mono transition-colors',
                  'text-zinc-300 hover:bg-zinc-700 hover:text-white'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingEnd(true);
                  setTimeout(() => endInputRef.current?.select(), 0);
                }}
                title="Click to edit"
              >
                {formatSubtitleTime(cue.endTime)}
              </button>
            )}
            <div className="flex flex-col">
              <button
                className="p-0.5 text-zinc-500 hover:text-white transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  nudgeTime(false, 0.1);
                }}
                title="Increase end time"
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              <button
                className="p-0.5 text-zinc-500 hover:text-white transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  nudgeTime(false, -0.1);
                }}
                title="Decrease end time"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Duration */}
          <span className="text-zinc-500 ml-2">
            ({duration.toFixed(1)}s)
          </span>
        </div>

        {/* Text content */}
        <div className="flex items-start gap-2">
          <Type className="w-3.5 h-3.5 text-zinc-500 mt-1 flex-shrink-0" />
          {isEditingText ? (
            <textarea
              ref={textareaRef}
              value={localText}
              onChange={(e) => setLocalText(e.target.value)}
              onBlur={handleTextSave}
              onKeyDown={handleTextKeyDown}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'flex-1 min-h-[60px] px-2 py-1.5 rounded resize-none',
                'bg-zinc-700 border border-white/30 text-white text-sm',
                'focus:outline-none placeholder-zinc-500'
              )}
              placeholder="Enter subtitle text..."
            />
          ) : (
            <p
              className={cn(
                'flex-1 text-sm leading-relaxed whitespace-pre-wrap',
                'text-zinc-200 hover:text-white cursor-text transition-colors',
                !cue.text && 'text-zinc-500 italic'
              )}
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingText(true);
              }}
            >
              {cue.text || 'Click to add text...'}
            </p>
          )}
        </div>
      </div>

      {/* Delete button */}
      <button
        className={cn(
          'absolute top-2 right-2 p-1.5 rounded',
          'text-zinc-500 hover:text-red-400 hover:bg-red-500/20',
          'opacity-0 group-hover:opacity-100 transition-all'
        )}
        onClick={handleDeleteClick}
        title="Delete cue"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
});

export default SubtitleCueEditor;
