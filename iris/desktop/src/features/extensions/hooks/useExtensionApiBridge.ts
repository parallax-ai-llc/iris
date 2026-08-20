/**
 * useExtensionApiBridge — renderer-side receiver for the Main → Renderer
 * extension API request channels.
 *
 * The main-process apiHandlers (electron/extensions/apiHandlers/*) forward
 * `iris.image / iris.ai / iris.window / iris.export` calls to the renderer
 * over `extensions:<request>` channels and wait for the reply on a dynamic
 * `extensions:<x>Result:<requestId>` channel. Every request/response channel
 * MUST be answered (even on error) — otherwise the calling extension blocks
 * until the main-process timeout fires.
 *
 * Mount exactly once in the app shell (see ExtensionRuntimeHost).
 */
import { useEffect, useState, useCallback } from 'react';
import { getActiveStoreSafe } from '@/features/image-editor/stores/imageEditorRegistry';
import { compositeLayers } from '@/features/image-editor/canvas/layerCompositor';
import { useEditorTabsStore } from '@/features/image-editor/stores/editorTabs.store';
import { generateImage, pollAssetUntilReady } from '@/shared/api/image.api';
import { getBaseModels } from '@/shared/api/provider.api';
import { toast } from '@/shared/lib/toast';
import i18n from '@/shared/lib/i18n';
import { useExtensionRuntimeStore } from '@/features/extensions/stores/extensionRuntime.store';
import {
  getExtensionExportPresets,
  applyExtensionExportPreset,
  getExtensionExportSettings,
  updateExtensionExportSettings,
} from '@/features/extensions/lib/extensionExportSettings';

// ─── Request payload types (mirror of apiHandlers senders) ───

interface RequestWithId {
  requestId: string;
}

interface PutImagePayload {
  imageData?: { width: number; height: number; data: unknown };
}

interface ExecuteAiModelPayload extends RequestWithId {
  extensionId: string;
  provider: string;
  params?: Record<string, unknown>;
}

interface ShowMessagePayload {
  extensionId: string;
  message: string;
  type?: string;
}

export interface InputBoxRequest {
  requestId: string;
  extensionId: string;
  prompt: string;
  value?: string;
  placeholder?: string;
}

interface CreatePanelPayload {
  panelId: string;
  extensionId: string;
  html: string;
  title: string;
  location: string;
}

interface ApplyExportPresetPayload extends RequestWithId {
  presetId: string;
}

interface UpdateExportSettingsPayload extends RequestWithId {
  settings?: Record<string, unknown>;
}

// ─── Helpers ───

/**
 * Normalize pixel data that crossed one or more IPC serialization boundaries.
 * Depending on the hop it may arrive as a Uint8Array/Uint8ClampedArray, a
 * plain number[], a JSON-ified Buffer ({ type: 'Buffer', data: number[] }),
 * or an index-keyed object.
 */
function toClampedPixels(data: unknown): Uint8ClampedArray | null {
  if (data instanceof Uint8ClampedArray) return data;
  if (data instanceof Uint8Array) {
    return new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8ClampedArray(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }
  if (Array.isArray(data)) return new Uint8ClampedArray(data);
  if (data && typeof data === 'object') {
    const obj = data as { type?: string; data?: unknown };
    if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
      return new Uint8ClampedArray(obj.data as number[]);
    }
    const values = Object.values(data as Record<string, number>);
    if (values.length > 0 && values.every((v) => typeof v === 'number')) {
      return new Uint8ClampedArray(values);
    }
  }
  return null;
}

/** Composite the active editor tab into raw RGBA pixels. */
async function readActiveImage(): Promise<{ width: number; height: number; data: Uint8Array } | null> {
  const store = getActiveStoreSafe();
  if (!store) return null;
  const { layers, canvasWidth, canvasHeight } = store.getState();
  if (!canvasWidth || !canvasHeight || layers.length === 0) return null;

  const canvas = await compositeLayers(layers, canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
  // Copy into a plain Uint8Array so the structured clone ships a tight buffer.
  return {
    width: canvasWidth,
    height: canvasHeight,
    data: new Uint8Array(imageData.data.slice().buffer),
  };
}

function readActiveFileInfo(): Record<string, unknown> | null {
  const { tabs, activeTabId } = useEditorTabsStore.getState();
  const tab = tabs.find((t) => t.id === activeTabId);
  const store = getActiveStoreSafe();
  if (!tab || !store) return null;

  const { canvasWidth, canvasHeight } = store.getState();
  const mimeType = tab.asset.mimeType || 'image/png';
  return {
    filePath: null, // cloud/library assets have no local path
    fileName: tab.asset.name,
    format: mimeType.includes('/') ? mimeType.split('/')[1] : mimeType,
    fileSize: tab.asset.sizeBytes ?? 0,
    width: canvasWidth,
    height: canvasHeight,
    mimeType,
    metadata: tab.asset.metadata ?? {},
  };
}

async function insertImageAsLayer(payload: PutImagePayload): Promise<void> {
  const imageData = payload.imageData;
  if (!imageData || !imageData.width || !imageData.height) return;

  const store = getActiveStoreSafe();
  if (!store) {
    toast.warning(i18n.t('extensions:runtime.noActiveImage'));
    return;
  }

  const pixels = toClampedPixels(imageData.data);
  if (!pixels || pixels.length !== imageData.width * imageData.height * 4) return;

  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // Re-copy into a plain ArrayBuffer-backed array (ImageData rejects views
  // that might be SharedArrayBuffer-backed at the type level).
  const copy = new Uint8ClampedArray(pixels.length);
  copy.set(pixels);
  ctx.putImageData(new ImageData(copy, imageData.width, imageData.height), 0, 0);

  await store.getState().addLayerFromUrl(canvas.toDataURL('image/png'), 'Extension');
}

async function executeAiModel(payload: ExecuteAiModelPayload): Promise<unknown> {
  const params = payload.params ?? {};
  const prompt = typeof params.prompt === 'string' ? params.prompt : '';
  if (!prompt) {
    throw new Error('iris.ai.executeModel requires params.prompt');
  }

  const asset = await generateImage({
    prompt,
    negativePrompt: typeof params.negativePrompt === 'string' ? params.negativePrompt : undefined,
    model: payload.provider,
    aspectRatio: typeof params.aspectRatio === 'string' ? params.aspectRatio : undefined,
    resolution: typeof params.resolution === 'string' ? params.resolution : undefined,
    referenceAssetId: typeof params.referenceAssetId === 'string' ? params.referenceAssetId : undefined,
    referenceImageBase64: typeof params.referenceImageBase64 === 'string' ? params.referenceImageBase64 : undefined,
    imageStrength: typeof params.imageStrength === 'number' ? params.imageStrength : undefined,
    name: typeof params.name === 'string' ? params.name : undefined,
  });
  if (!asset) {
    throw new Error('AI generation request failed');
  }

  // Main-process aiApi times out at 120s — stay safely under it.
  const ready = await pollAssetUntilReady(asset.id, { maxAttempts: 200, intervalMs: 500 });
  if (!ready) {
    throw new Error('AI generation did not complete');
  }
  return ready;
}

// ─── Hook ───

export function useExtensionApiBridge() {
  const registerPanel = useExtensionRuntimeStore((s) => s.registerPanel);
  const [inputBoxRequest, setInputBoxRequest] = useState<InputBoxRequest | null>(null);

  useEffect(() => {
    const api = window.electronAPI?.extensions;
    if (!api?.onRequest || !api?.sendResponse) return;

    const respond = (channel: string, data?: unknown) => {
      api.sendResponse(channel, data);
    };

    const unsubscribers: (() => void)[] = [
      // ── iris.image ──
      api.onRequest('extensions:getActiveImage', (raw) => {
        const { requestId } = raw as RequestWithId;
        void readActiveImage()
          .catch(() => null)
          .then((result) => respond(`extensions:activeImageResult:${requestId}`, result));
      }),

      api.onRequest('extensions:getSelection', (raw) => {
        const { requestId } = raw as RequestWithId;
        let bounds: { x: number; y: number; width: number; height: number } | null = null;
        try {
          const store = getActiveStoreSafe();
          const selection = store?.getState().selection;
          if (selection?.bounds) {
            const { x, y, width, height } = selection.bounds;
            bounds = { x, y, width, height };
          }
        } catch {
          bounds = null;
        }
        respond(`extensions:selectionResult:${requestId}`, bounds);
      }),

      api.onRequest('extensions:getActiveFileInfo', (raw) => {
        const { requestId } = raw as RequestWithId;
        let info: Record<string, unknown> | null = null;
        try {
          info = readActiveFileInfo();
        } catch {
          info = null;
        }
        respond(`extensions:activeFileInfoResult:${requestId}`, info);
      }),

      // Fire-and-forget: main does not wait for a reply.
      api.onRequest('extensions:putImage', (raw) => {
        void insertImageAsLayer(raw as PutImagePayload).catch(() => {
          toast.error(i18n.t('extensions:runtime.putImageFailed'));
        });
      }),

      // ── iris.ai ──
      api.onRequest('extensions:executeAiModel', (raw) => {
        const payload = raw as ExecuteAiModelPayload;
        void executeAiModel(payload)
          .then((result) => respond(`extensions:aiModelResult:${payload.requestId}`, { result }))
          .catch((err: unknown) =>
            respond(`extensions:aiModelResult:${payload.requestId}`, {
              error: err instanceof Error ? err.message : String(err),
            })
          );
      }),

      api.onRequest('extensions:getAvailableModels', (raw) => {
        const { requestId } = raw as RequestWithId;
        void getBaseModels()
          .then((models) =>
            models.map((m) => ({
              id: m.id,
              name: m.name,
              provider: m.provider,
              model: m.model,
              chat: m.chat,
              imageGeneration: m.imageGeneration,
              videoGeneration: m.videoGeneration,
            }))
          )
          .catch(() => [])
          .then((list) => respond(`extensions:availableModelsResult:${requestId}`, list));
      }),

      // ── iris.window ──
      // Fire-and-forget: main does not wait for a reply.
      api.onRequest('extensions:showMessage', (raw) => {
        const payload = raw as ShowMessagePayload;
        const message = `${payload.extensionId}: ${payload.message}`;
        if (payload.type === 'error') {
          toast.error(message);
        } else if (payload.type === 'warn' || payload.type === 'warning') {
          toast.warning(message);
        } else {
          toast.info(message);
        }
      }),

      api.onRequest('extensions:showInputBox', (raw) => {
        const payload = raw as InputBoxRequest;
        setInputBoxRequest((current) => {
          if (current) {
            // One input box at a time — resolve the newcomer immediately so
            // the calling extension does not hang until the 60s timeout.
            respond(`extensions:inputBoxResult:${payload.requestId}`, undefined);
            return current;
          }
          return payload;
        });
      }),

      // Fire-and-forget: main already returned the panelId to the extension.
      api.onRequest('extensions:createPanel', (raw) => {
        const payload = raw as CreatePanelPayload;
        const location =
          payload.location === 'bottom' || payload.location === 'floating'
            ? payload.location
            : 'sidebar';
        registerPanel({
          id: payload.panelId,
          extensionId: payload.extensionId,
          title: payload.title,
          location,
          html: payload.html,
        });
      }),

      // NOTE: there is no 'extensions:statusBarUpdate' receiver here on purpose.
      // iris.window.setStatusBarItem never reaches the main process — the worker
      // emits a 'statusBarItem' contribution message instead of an api-call
      // (see extensionHostWorker.ts), so status bar items arrive through
      // useExtensionRuntime's onContributionChanged path. The main-process
      // windowApi 'setStatusBarItem' handler is dead for the same reason.

      // ── iris.export ──
      api.onRequest('extensions:getExportPresets', (raw) => {
        const { requestId } = raw as RequestWithId;
        respond(`extensions:exportPresetsResult:${requestId}`, getExtensionExportPresets());
      }),

      api.onRequest('extensions:applyExportPreset', (raw) => {
        const payload = raw as ApplyExportPresetPayload;
        applyExtensionExportPreset(payload.presetId);
        // Main resolves on any reply (payload ignored) — ack to avoid the timeout.
        respond(`extensions:applyExportPresetResult:${payload.requestId}`, { ok: true });
      }),

      api.onRequest('extensions:getExportSettings', (raw) => {
        const { requestId } = raw as RequestWithId;
        respond(`extensions:exportSettingsResult:${requestId}`, getExtensionExportSettings());
      }),

      api.onRequest('extensions:updateExportSettings', (raw) => {
        const payload = raw as UpdateExportSettingsPayload;
        if (payload.settings && typeof payload.settings === 'object') {
          updateExtensionExportSettings(payload.settings);
        }
        respond(`extensions:updateExportSettingsResult:${payload.requestId}`, { ok: true });
      }),
    ];

    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [registerPanel]);

  const submitInputBox = useCallback(
    (value: string) => {
      if (!inputBoxRequest) return;
      window.electronAPI?.extensions?.sendResponse(
        `extensions:inputBoxResult:${inputBoxRequest.requestId}`,
        value
      );
      setInputBoxRequest(null);
    },
    [inputBoxRequest]
  );

  const cancelInputBox = useCallback(() => {
    if (!inputBoxRequest) return;
    window.electronAPI?.extensions?.sendResponse(
      `extensions:inputBoxResult:${inputBoxRequest.requestId}`,
      undefined
    );
    setInputBoxRequest(null);
  }, [inputBoxRequest]);

  return { inputBoxRequest, submitInputBox, cancelInputBox };
}
