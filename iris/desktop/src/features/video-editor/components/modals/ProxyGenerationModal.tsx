/**
 * ProxyGenerationModal — Blocking modal that orchestrates the proxy
 * transcode queue when the user enables proxy mode.
 *
 * Behavior:
 * - On mount, walks the project's video media pool. For each item that
 *   doesn't already have a ready proxy on disk, downloads the source
 *   (if needed), then calls the main-process ffmpeg transcoder.
 * - Persists per-item proxy state to the server via PATCH so the result
 *   survives across sessions.
 * - Shows current item name + per-item progress bar + overall N/M counter
 *   + a Cancel button. Backdrop blocks all editing while running.
 * - On completion (or partial completion after cancel), the parent decides
 *   whether to flip proxyMode on (we only flip when at least the started
 *   items finished cleanly).
 */

import { memo, useEffect, useRef, useState, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useEditorStore } from '@/features/video-editor/stores/editor.store';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import { updateMediaProxy } from '@/shared/api/videoProject.api';
import type { ProjectMedia } from '@/types/videoProject.types';

interface ProxyGenerationModalProps {
  isOpen: boolean;
  /**
   * If true, the modal regenerates ALL video proxies from scratch even when
   * the on-disk file is already present. Used by "Regenerate Proxies"
   * (Shift+Click on the Proxy toolbar button).
   */
  forceRegenerate?: boolean;
  /** Called when the queue finishes (either fully or via cancel). */
  onComplete: (result: { completed: number; failed: number; cancelled: boolean }) => void;
}

interface QueueItem {
  media: ProjectMedia;
  status: 'pending' | 'downloading' | 'transcoding' | 'done' | 'error' | 'skipped';
  progress: number; // 0..1
  error?: string;
}

function ProxyGenerationModalInner({ isOpen, forceRegenerate = false, onComplete }: ProxyGenerationModalProps) {
  const currentProject = useVideoProjectStore((s) => s.currentProject);
  const downloadAsset = useEditorStore((s) => s.downloadAsset);
  const setProxyStatus = useEditorStore((s) => s.setProxyStatus);
  const setProxyPath = useEditorStore((s) => s.setProxyPath);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const cancelRef = useRef(false);

  // Latest values for the cleanup-only async loop
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const updateItem = useCallback((index: number, patch: Partial<QueueItem>) => {
    setQueue((prev) => {
      const next = [...prev];
      if (next[index]) next[index] = { ...next[index], ...patch };
      return next;
    });
  }, []);

  // Build queue + run when modal opens
  useEffect(() => {
    if (!isOpen || !currentProject) return;

    // Only video items need proxies
    const videoItems = (currentProject.mediaPool ?? []).filter((m) => m.mediaType === 'video');
    const initialQueue: QueueItem[] = videoItems.map((m) => ({
      media: m,
      status: 'pending',
      progress: 0,
    }));
    setQueue(initialQueue);
    setCurrentIndex(0);
    cancelRef.current = false;

    if (initialQueue.length === 0) {
      onCompleteRef.current({ completed: 0, failed: 0, cancelled: false });
      return;
    }

    // Subscribe to ffmpeg progress events from the main process
    const offProgress = window.electronAPI?.proxy?.onProgress?.((data) => {
      // Match the event back to the queue index by externalId/id
      setQueue((prev) => {
        const next = [...prev];
        for (let i = 0; i < next.length; i++) {
          const m = next[i].media;
          const matchId = m.externalId ?? m.id;
          if (matchId === data.assetId && next[i].status === 'transcoding') {
            next[i] = { ...next[i], progress: data.progress };
          }
        }
        return next;
      });
    });

    let cancelled = false;

    const run = async () => {
      let completed = 0;
      let failed = 0;

      for (let i = 0; i < initialQueue.length; i++) {
        if (cancelRef.current) {
          cancelled = true;
          break;
        }
        setCurrentIndex(i);
        const item = initialQueue[i];
        const media = item.media;
        const proxyAssetId = media.externalId ?? media.id;

        try {
          // 1. Skip if a ready proxy already exists on disk AND the source
          //    hasn't changed since it was generated. forceRegenerate bypasses
          //    this entirely (used by "Regenerate Proxies").
          if (!forceRegenerate && media.proxyStatus === 'ready' && media.proxyPath) {
            const check = await window.electronAPI.proxy.check(proxyAssetId);
            if (check.exists) {
              // Hash-based invalidation: if we know the original hash and can
              // re-compute it (the source is downloaded), compare. Mismatch
              // means the source file changed and the proxy is stale.
              let sourceUnchanged = true;
              if (media.originalHash) {
                const localPath = useEditorStore.getState().assetPaths.get(proxyAssetId);
                if (localPath) {
                  const { hash: currentHash } = await window.electronAPI.proxy.hash(localPath);
                  if (currentHash && currentHash !== media.originalHash) {
                    sourceUnchanged = false;
                  }
                }
              }
              if (sourceUnchanged) {
                setProxyPath(proxyAssetId, check.outputPath!);
                setProxyStatus(proxyAssetId, 'ready');
                updateItem(i, { status: 'skipped', progress: 1 });
                completed++;
                continue;
              }
              // Stale proxy → fall through to regeneration
            }
            // Proxy file missing on disk → fall through to regeneration
          }

          // 2. Resolve local input path. The asset must be downloaded into
          //    iris's temp dir before ffmpeg can read it.
          updateItem(i, { status: 'downloading' });
          let inputPath: string | null = null;

          if (media.fileUrl?.startsWith('file://')) {
            inputPath = decodeURIComponent(media.fileUrl.replace(/^file:\/\/\//, ''));
          } else if (media.externalId) {
            inputPath = await downloadAsset(media.externalId);
          }

          if (!inputPath) {
            updateItem(i, { status: 'error', error: 'Could not resolve local source path' });
            failed++;
            await persistProxyError(currentProject.id, media.id, 'no source path');
            continue;
          }

          if (cancelRef.current) { cancelled = true; break; }

          // 3. Mark as transcoding + persist 'generating' state to server
          updateItem(i, { status: 'transcoding', progress: 0 });
          setProxyStatus(proxyAssetId, 'generating');
          await persistProxyStatus(currentProject.id, media.id, 'generating');

          // 4. Run the transcode
          const result = await window.electronAPI.proxy.generate({
            assetId: proxyAssetId,
            inputPath,
            width: 1280,
            height: 720,
            force: forceRegenerate,
          });

          if (result.cancelled) { cancelled = true; break; }

          if (result.success && result.outputPath) {
            setProxyPath(proxyAssetId, result.outputPath);
            setProxyStatus(proxyAssetId, 'ready');
            updateItem(i, { status: 'done', progress: 1 });
            completed++;
            await updateMediaProxy(currentProject.id, media.id, {
              proxyStatus: 'ready',
              proxyPath: result.outputPath,
              originalHash: result.hash ?? null,
              proxyError: null,
            });
          } else {
            const err = result.error ?? 'Unknown ffmpeg error';
            setProxyStatus(proxyAssetId, 'error');
            updateItem(i, { status: 'error', error: err });
            failed++;
            await persistProxyError(currentProject.id, media.id, err);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          setProxyStatus(proxyAssetId, 'error');
          updateItem(i, { status: 'error', error: msg });
          failed++;
          await persistProxyError(currentProject.id, media.id, msg);
        }
      }

      offProgress?.();
      onCompleteRef.current({ completed, failed, cancelled });
    };

    void run();

    return () => {
      offProgress?.();
      // Best-effort: kill any in-flight ffmpeg jobs if the modal unmounts.
      void window.electronAPI?.proxy?.cancel();
      void cancelled; // referenced for clarity
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentProject?.id]);

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
    void window.electronAPI?.proxy?.cancel();
  }, []);

  if (!isOpen) return null;

  const total = queue.length;
  const overallFraction = total === 0 ? 1 : queue.reduce((sum, q) => sum + q.progress, 0) / total;
  const current = queue[currentIndex];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-[480px] max-w-[90vw]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
            <span className="text-sm font-medium text-zinc-100">Generating Proxy Files</span>
          </div>
          <button
            onClick={handleCancel}
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Overall */}
          <div>
            <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
              <span>Overall</span>
              <span>
                {Math.min(currentIndex + 1, total)} / {total}
              </span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${Math.round(overallFraction * 100)}%` }}
              />
            </div>
          </div>

          {/* Current item */}
          {current && (
            <div>
              <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                <span className="truncate max-w-[300px]" title={current.media.name}>
                  {current.media.name}
                </span>
                <span className="text-zinc-500 capitalize">{current.status}</span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${Math.round(current.progress * 100)}%` }}
                />
              </div>
              {current.error && (
                <div className="mt-1 text-[10px] text-red-400 truncate" title={current.error}>
                  {current.error}
                </div>
              )}
            </div>
          )}

          <div className="text-[11px] text-zinc-500 leading-relaxed">
            Editing is paused while low-resolution proxies are being created. Originals are
            untouched and will still be used for export.
          </div>
        </div>

        <div className="px-5 py-3 border-t border-zinc-800 flex justify-end">
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Best-effort fire-and-forget helper for intermediate state transitions
async function persistProxyStatus(
  projectId: string,
  mediaId: string,
  status: 'none' | 'generating' | 'ready' | 'error',
) {
  try {
    await updateMediaProxy(projectId, mediaId, { proxyStatus: status });
  } catch (e) {
    console.warn('[proxy] failed to persist status', e);
  }
}

async function persistProxyError(projectId: string, mediaId: string, error: string) {
  try {
    await updateMediaProxy(projectId, mediaId, {
      proxyStatus: 'error',
      proxyError: error.slice(0, 500),
    });
  } catch (e) {
    console.warn('[proxy] failed to persist error', e);
  }
}

export const ProxyGenerationModal = memo(ProxyGenerationModalInner);
