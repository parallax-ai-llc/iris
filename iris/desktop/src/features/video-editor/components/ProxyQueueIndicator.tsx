/**
 * ProxyQueueIndicator — small floating chip shown when background proxy
 * generation is happening for newly added media. Click to expand and
 * cancel individual items.
 */

import { memo, useState } from 'react';
import { Loader2, X, Check, AlertCircle, Zap } from 'lucide-react';
import { useProxyQueueStore } from '@/features/video-editor/stores/proxyQueue.store';

function ProxyQueueIndicatorInner() {
  const items = useProxyQueueStore((s) => s.items);
  const cancelItem = useProxyQueueStore((s) => s.cancelItem);
  const cancelAll = useProxyQueueStore((s) => s.cancelAll);
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  const inFlight = items.filter((it) => it.status === 'transcoding' || it.status === 'downloading' || it.status === 'pending').length;
  const done = items.filter((it) => it.status === 'done').length;
  const failed = items.filter((it) => it.status === 'error').length;

  return (
    <div className="absolute bottom-3 right-3 z-40">
      {/* Collapsed chip */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-full shadow-lg text-xs text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          {inFlight > 0 ? (
            <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
          ) : failed > 0 ? (
            <AlertCircle className="w-3.5 h-3.5 text-red-400" />
          ) : (
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
          )}
          <span>
            Proxy {done}/{items.length}
            {failed > 0 && <span className="text-red-400 ml-1">({failed} failed)</span>}
          </span>
        </button>
      )}

      {/* Expanded panel */}
      {expanded && (
        <div className="w-72 bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-lg shadow-xl">
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
            <div className="flex items-center gap-2 text-xs text-zinc-200">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-medium">Background Proxy</span>
              <span className="text-zinc-500">
                {done}/{items.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {inFlight > 0 && (
                <button
                  onClick={cancelAll}
                  className="text-[10px] text-zinc-500 hover:text-red-400 px-1.5 py-0.5"
                  title="Cancel all"
                >
                  Cancel all
                </button>
              )}
              <button
                onClick={() => setExpanded(false)}
                className="p-1 rounded hover:bg-zinc-800 text-zinc-400"
                title="Collapse"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {items.map((it) => (
              <div
                key={it.mediaId}
                className="px-3 py-2 border-b border-zinc-800/60 last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  {it.status === 'done' ? (
                    <Check className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                  ) : it.status === 'error' ? (
                    <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
                  ) : it.status === 'transcoding' || it.status === 'downloading' ? (
                    <Loader2 className="w-3 h-3 text-amber-400 animate-spin flex-shrink-0" />
                  ) : (
                    <div className="w-3 h-3 rounded-full border border-zinc-600 flex-shrink-0" />
                  )}
                  <span
                    className="text-[11px] text-zinc-200 truncate flex-1"
                    title={it.name}
                  >
                    {it.name}
                  </span>
                  {(it.status === 'pending' || it.status === 'downloading' || it.status === 'transcoding') && (
                    <button
                      onClick={() => cancelItem(it.mediaId)}
                      className="p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-red-400 flex-shrink-0"
                      title="Cancel"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {(it.status === 'transcoding' || it.status === 'downloading') && (
                  <div className="h-1 mt-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 transition-all"
                      style={{ width: `${Math.round(it.progress * 100)}%` }}
                    />
                  </div>
                )}
                {it.status === 'error' && it.error && (
                  <div className="text-[10px] text-red-400 mt-0.5 truncate" title={it.error}>
                    {it.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const ProxyQueueIndicator = memo(ProxyQueueIndicatorInner);
