/**
 * prepareAssetForAI on a ONE-layer document: before the fix it always sent
 * the original asset id, so a crop / stroke / filter made after opening was
 * thrown away by the AI tool.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { setupImageEditorTestTab, mockSourceAsset } from '@/test-utils/imageEditorHelpers';
import type { ImageEditorStoreApi } from '@/features/image-editor/stores/imageEditorFactory';

const uploadImage = vi.fn();
vi.mock('@/shared/api/image.api', () => ({
  uploadImage: (...args: unknown[]) => uploadImage(...args),
}));
vi.mock('@/features/image-editor/canvas/layerCompositor', () => ({
  flattenLayersToBlob: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
}));

import { useAIOperation } from '../useAIOperation';

const BG = {
  id: 'bg',
  name: 'Background',
  visible: true,
  locked: false,
  opacity: 100,
  blendMode: 'normal' as const,
  imageData: 'data:bg',
  x: 0,
  y: 0,
  width: 640,
  height: 480,
};

let store: ImageEditorStoreApi;

beforeEach(() => {
  uploadImage.mockReset();
  uploadImage.mockResolvedValue({ ...mockSourceAsset, id: 'composite-1' });
  store = setupImageEditorTestTab();
  store.setState({ sourceAsset: mockSourceAsset, layers: [BG], activeLayerId: 'bg', canvasWidth: 640, canvasHeight: 480 });
  store.getState().pushHistory('Open', '', false);
});

describe('useAIOperation.prepareAssetForAI (single layer)', () => {
  it('unchanged document: sends the original asset without uploading', async () => {
    const { result } = renderHook(() => useAIOperation());
    let id: string | null = null;
    await act(async () => {
      id = await result.current.prepareAssetForAI();
    });
    expect(id).toBe(mockSourceAsset.id);
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it('edited after opening: uploads the current document and sends that', async () => {
    store.getState().updateLayer('bg', { imageData: 'data:painted' });
    store.getState().pushHistory('Brush', '', true);

    const { result } = renderHook(() => useAIOperation());
    let id: string | null = null;
    await act(async () => {
      id = await result.current.prepareAssetForAI();
    });

    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(id).toBe('composite-1');
  });
});
