/**
 * MarkerListPanel — Floating panel listing all timeline markers.
 * Click a row to seek to that marker. Inline edit label/comment.
 */

import { memo, useState } from 'react';
import { X, MapPin } from 'lucide-react';
import { useEditorStore } from '@/features/video-editor/stores/editor.store';
import { useShallow } from 'zustand/react/shallow';
import { formatSMPTE } from '@/shared/api/subtitle.api';

interface MarkerListPanelProps {
  onClose: () => void;
}

function MarkerListPanelInner({ onClose }: MarkerListPanelProps) {
  const { markers, frameRate } = useEditorStore(
    useShallow((s) => ({ markers: s.markers, frameRate: s.frameRate }))
  );
  const seek = useEditorStore((s) => s.seek);
  const updateMarker = useEditorStore((s) => s.updateMarker);
  const removeMarker = useEditorStore((s) => s.removeMarker);

  const [editing, setEditing] = useState<{ id: string; field: 'label' | 'comment'; value: string } | null>(null);

  const commitEdit = () => {
    if (!editing) return;
    updateMarker(editing.id, { [editing.field]: editing.value } as Partial<{ label: string; comment: string }>);
    setEditing(null);
  };

  return (
    <div className="absolute top-2 right-2 z-30 w-80 max-h-[70%] bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-lg shadow-2xl flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2 text-sm text-zinc-200 font-medium">
          <MapPin size={14} className="text-amber-400" />
          Markers <span className="text-zinc-500 font-normal">({markers.length})</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>

      <div className="overflow-y-auto flex-1">
        {markers.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-zinc-500">
            No markers yet.<br />
            Double-click the timeline ruler to add one.
          </div>
        ) : (
          markers.map((m) => {
            const isRange = typeof m.endTime === 'number' && m.endTime > m.time;
            const color = m.color ?? '#f59e0b';
            return (
              <div
                key={m.id}
                className="group px-3 py-2 border-b border-zinc-800/60 hover:bg-zinc-800/50 cursor-pointer"
                onClick={() => seek(m.time)}
              >
                <div className="flex items-start gap-2">
                  <div
                    className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <div className="flex-1 min-w-0">
                    {/* Label row */}
                    {editing?.id === m.id && editing.field === 'label' ? (
                      <input
                        autoFocus
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-xs text-zinc-100"
                        value={editing.value}
                        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                        onBlur={commitEdit}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit();
                          if (e.key === 'Escape') setEditing(null);
                        }}
                      />
                    ) : (
                      <div
                        className="text-xs text-zinc-100 truncate"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing({ id: m.id, field: 'label', value: m.label ?? '' });
                        }}
                      >
                        {m.label || <span className="text-zinc-500 italic">(no label)</span>}
                      </div>
                    )}

                    {/* Time row */}
                    <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                      {formatSMPTE(m.time, frameRate)}
                      {isRange && ` → ${formatSMPTE(m.endTime!, frameRate)}`}
                    </div>

                    {/* Comment row */}
                    {editing?.id === m.id && editing.field === 'comment' ? (
                      <textarea
                        autoFocus
                        rows={2}
                        className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-[11px] text-zinc-200 resize-none"
                        value={editing.value}
                        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                        onBlur={commitEdit}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commitEdit();
                          if (e.key === 'Escape') setEditing(null);
                        }}
                      />
                    ) : (
                      <div
                        className="text-[11px] text-zinc-400 mt-0.5 whitespace-pre-wrap"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing({ id: m.id, field: 'comment', value: m.comment ?? '' });
                        }}
                      >
                        {m.comment || <span className="text-zinc-600 italic">+ add comment</span>}
                      </div>
                    )}
                  </div>
                  <button
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-700 text-red-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeMarker(m.id);
                    }}
                    title="Delete"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export const MarkerListPanel = memo(MarkerListPanelInner);
