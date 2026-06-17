/**
 * Background proxy generation queue.
 *
 * When proxy mode is on and a new video media item is added to the project,
 * we kick off a background ffmpeg transcode here. Unlike the modal queue,
 * this one:
 *   - does NOT block the UI (the user keeps editing)
 *   - falls back to the original asset until the proxy is ready (the
 *     useProxyAwareAssetId resolver from step 4 handles this automatically —
 *     until proxyPaths gets an entry, playback uses the original)
 *   - shows a small indicator (read by ProxyQueueIndicator)
 *   - persists per-item proxy state to the server (same PATCH endpoint)
 */

import { create } from 'zustand';
import { useEditorStore } from '@/features/video-editor/stores/editor.store';
import { updateMediaProxy } from '@/shared/api/videoProject.api';
import type { ProjectMedia } from '@/types/videoProject.types';

export interface ProxyQueueItem {
  mediaId: string;       // server media row id
  externalId: string;    // asset id used for proxy file naming
  projectId: string;
  name: string;
  status: 'pending' | 'downloading' | 'transcoding' | 'done' | 'error';
  progress: number;      // 0..1
  error?: string;
}

interface ProxyQueueState {
  items: ProxyQueueItem[];
  isRunning: boolean;
  enqueue: (media: ProjectMedia, projectId: string) => void;
  cancelItem: (mediaId: string) => void;
  cancelAll: () => void;
  /** Internal — runs the queue if not already running */
  _kick: () => void;
  _updateItem: (mediaId: string, patch: Partial<ProxyQueueItem>) => void;
  _removeDoneItems: () => void;
}

export const useProxyQueueStore = create<ProxyQueueState>((set, get) => ({
  items: [],
  isRunning: false,

  enqueue: (media, projectId) => {
    if (media.mediaType !== 'video') return;
    // Skip if already ready and the file still exists — caller should have
    // hydrated proxyPaths via VideoEditorPage; we just trust the in-memory
    // resolver state here to keep this hook cheap.
    const existing = useEditorStore.getState().proxyPaths.get(media.externalId ?? media.id);
    if (existing && media.proxyStatus === 'ready') return;

    // Skip if same media id is already queued
    if (get().items.some((it) => it.mediaId === media.id)) return;

    const item: ProxyQueueItem = {
      mediaId: media.id,
      externalId: media.externalId ?? media.id,
      projectId,
      name: media.name,
      status: 'pending',
      progress: 0,
    };
    set((s) => ({ items: [...s.items, item] }));
    get()._kick();
  },

  cancelItem: (mediaId) => {
    const item = get().items.find((it) => it.mediaId === mediaId);
    if (!item) return;
    void window.electronAPI?.proxy?.cancel(item.externalId);
    set((s) => ({ items: s.items.filter((it) => it.mediaId !== mediaId) }));
  },

  cancelAll: () => {
    void window.electronAPI?.proxy?.cancel();
    set({ items: [], isRunning: false });
  },

  _updateItem: (mediaId, patch) => {
    set((s) => ({
      items: s.items.map((it) => (it.mediaId === mediaId ? { ...it, ...patch } : it)),
    }));
  },

  _removeDoneItems: () => {
    // Keep terminal items visible briefly so the indicator can show "done",
    // then drop them after a short delay.
    setTimeout(() => {
      set((s) => ({ items: s.items.filter((it) => it.status !== 'done') }));
    }, 1500);
  },

  _kick: () => {
    if (get().isRunning) return;
    void runQueue();
  },
}));

// ── progress event subscription (set up once at module load) ───────────────
if (typeof window !== 'undefined' && window.electronAPI?.proxy?.onProgress) {
  window.electronAPI.proxy.onProgress((data) => {
    const items = useProxyQueueStore.getState().items;
    for (const it of items) {
      if (it.externalId === data.assetId && it.status === 'transcoding') {
        useProxyQueueStore.getState()._updateItem(it.mediaId, { progress: data.progress });
      }
    }
  });
}

// ── runner ─────────────────────────────────────────────────────────────────
async function runQueue() {
  const store = useProxyQueueStore;
  store.setState({ isRunning: true });

  while (true) {
    const next = store.getState().items.find((it) => it.status === 'pending');
    if (!next) break;

    const editor = useEditorStore.getState();
    const proxyKey = next.externalId;

    try {
      // 1. Resolve local input path. If the media item is a file:// it might
      //    not be in assetPaths yet — fall back to direct decoding.
      store.getState()._updateItem(next.mediaId, { status: 'downloading' });
      let inputPath: string | null = editor.assetPaths.get(next.externalId) ?? null;
      if (!inputPath) {
        if (next.externalId.startsWith('file://')) {
          inputPath = decodeURIComponent(next.externalId.replace(/^file:\/\/\//, ''));
        } else {
          inputPath = await editor.downloadAsset(next.externalId);
        }
      }
      if (!inputPath) {
        store.getState()._updateItem(next.mediaId, {
          status: 'error',
          error: 'Could not resolve local source path',
        });
        await persistError(next.projectId, next.mediaId, 'no source path');
        continue;
      }

      // 2. Mark transcoding + persist generating
      store.getState()._updateItem(next.mediaId, { status: 'transcoding', progress: 0 });
      editor.setProxyStatus(proxyKey, 'generating');
      await persistStatus(next.projectId, next.mediaId, 'generating');

      // 3. Run the transcode
      const result = await window.electronAPI.proxy.generate({
        assetId: proxyKey,
        inputPath,
        width: 1280,
        height: 720,
      });

      if (result.cancelled) {
        // Cancellation — drop the item silently
        store.setState((s) => ({ items: s.items.filter((it) => it.mediaId !== next.mediaId) }));
        continue;
      }

      if (result.success && result.outputPath) {
        editor.setProxyPath(proxyKey, result.outputPath);
        editor.setProxyStatus(proxyKey, 'ready');
        store.getState()._updateItem(next.mediaId, { status: 'done', progress: 1 });
        await updateMediaProxy(next.projectId, next.mediaId, {
          proxyStatus: 'ready',
          proxyPath: result.outputPath,
          originalHash: result.hash ?? null,
          proxyError: null,
        });
      } else {
        const err = result.error ?? 'Unknown ffmpeg error';
        editor.setProxyStatus(proxyKey, 'error');
        store.getState()._updateItem(next.mediaId, { status: 'error', error: err });
        await persistError(next.projectId, next.mediaId, err);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      editor.setProxyStatus(proxyKey, 'error');
      store.getState()._updateItem(next.mediaId, { status: 'error', error: msg });
      await persistError(next.projectId, next.mediaId, msg);
    }
  }

  store.setState({ isRunning: false });
  store.getState()._removeDoneItems();
}

async function persistStatus(
  projectId: string,
  mediaId: string,
  status: 'none' | 'generating' | 'ready' | 'error',
) {
  try {
    await updateMediaProxy(projectId, mediaId, { proxyStatus: status });
  } catch (e) {
    console.warn('[proxy-queue] persist status failed', e);
  }
}

async function persistError(projectId: string, mediaId: string, error: string) {
  try {
    await updateMediaProxy(projectId, mediaId, {
      proxyStatus: 'error',
      proxyError: error.slice(0, 500),
    });
  } catch (e) {
    console.warn('[proxy-queue] persist error failed', e);
  }
}
