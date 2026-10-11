/**
 * InpaintModal sends the image the mask was painted on: the original asset
 * only while the document is unchanged, otherwise the current composite
 * (uploaded). Before the fix it always sent sourceAsset.id, so after a crop
 * the mask did not line up and edits were ignored.
 */

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setupImageEditorTestTab, mockSourceAsset } from '@/test-utils/imageEditorHelpers';
import type { ImageEditorStoreApi } from '@/features/image-editor/stores/imageEditorFactory';
import { inpaintImage, uploadImage } from '@/shared/api/image.api';
import { InpaintModal } from '../InpaintModal';

vi.mock('@/shared/api/image.api', async () => {
  const actual = await vi.importActual<typeof import('@/shared/api/image.api')>('@/shared/api/image.api');
  return {
    AssetEditError: actual.AssetEditError,
    EditWaitAbortedError: actual.EditWaitAbortedError,
    inpaintImage: vi.fn(async () => ({ id: 'job-1' })),
    waitForEditResult: vi.fn(async () => ({ id: 'result-1', previewUrl: 'https://example.com/r.png' })),
    uploadImage: vi.fn(async () => ({ id: 'composite-1' })),
  };
});
vi.mock('@/features/image-editor/canvas/layerCompositor', () => ({
  compositeLayers: vi.fn(async (_l: unknown, w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }),
  flattenLayersToBlob: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
}));
vi.mock('@/shared/hooks/useImageEditTokenCost', () => ({
  useImageEditTokenCost: () => ({ cost: 0, isLoading: false }),
}));
vi.mock('@/shared/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

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
  width: 300,
  height: 200,
};

let store: ImageEditorStoreApi;
const canvasRef = { current: null };

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no pointer capture
  HTMLElement.prototype.setPointerCapture = vi.fn();
  store = setupImageEditorTestTab();
  store.setState({
    sourceAsset: mockSourceAsset,
    layers: [BG],
    activeLayerId: 'bg',
    canvasWidth: 300,
    canvasHeight: 200,
    addLayerFromUrl: vi.fn(async () => 'layer-x'),
  });
  store.getState().pushHistory('Open', '', false);
});

async function paintAndGenerate() {
  render(<InpaintModal isOpen onClose={() => {}} canvasRef={canvasRef} />);
  const maskCanvas = document.querySelector('canvas.cursor-crosshair') as HTMLCanvasElement;
  fireEvent.pointerDown(maskCanvas, { clientX: 10, clientY: 10, pointerId: 1 });
  fireEvent.pointerUp(maskCanvas);
  fireEvent.change(screen.getByPlaceholderText(/Describe what should appear/), { target: { value: 'a cat' } });
  fireEvent.click(screen.getByRole('button', { name: /Generate/ }));
}

describe('InpaintModal source image', () => {
  it('unchanged document: inpaints the original asset', async () => {
    await paintAndGenerate();
    await waitFor(() => expect(inpaintImage).toHaveBeenCalled());
    expect((inpaintImage as Mock).mock.calls[0][0]).toBe(mockSourceAsset.id);
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it('cropped document: uploads the current composite and inpaints that', async () => {
    store.setState({ layers: [{ ...BG, width: 120, height: 80 }], canvasWidth: 120, canvasHeight: 80 });
    store.getState().pushHistory('Crop', '', true);

    await paintAndGenerate();

    await waitFor(() => expect(inpaintImage).toHaveBeenCalled());
    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect((inpaintImage as Mock).mock.calls[0][0]).toBe('composite-1');
    await waitFor(() => expect(store.getState().isProcessing).toBe(false));
  });
});
