/**
 * AI panels whose job is still running when the panel goes away (panel
 * closed, tab switched). The job was paid for, so:
 *  - `isProcessing` must not stay stuck on the tab that started it
 *  - the result must still land in THAT tab, never in the tab that is active now
 */

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ComponentType } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@/shared/lib/i18n';
import { setupImageEditorTestTab, mockSourceAsset } from '@/test-utils/imageEditorHelpers';
import { getOrCreateStore, setActiveTabId, deleteStore } from '@/features/image-editor/stores/imageEditorRegistry';
import type { ImageEditorStoreApi } from '@/features/image-editor/stores/imageEditorFactory';
import { getAssetStatus } from '@/shared/api/image.api';
import { UpscalePanel } from '../UpscalePanel';
import { BgRemovePanel } from '../BgRemovePanel';
import { FaceRestorePanel } from '../FaceRestorePanel';
import { ColorizePanel } from '../ColorizePanel';
import { OutpaintPanel } from '../OutpaintPanel';

vi.mock('@/shared/api/image.api', async () => {
  const actual = await vi.importActual<typeof import('@/shared/api/image.api')>('@/shared/api/image.api');
  const getAssetStatus = vi.fn();
  return {
    AssetEditError: actual.AssetEditError,
    EditWaitAbortedError: actual.EditWaitAbortedError,
    getAssetStatus,
    // Same contract as the real one, polling the mocked getAssetStatus without delays
    waitForEditResult: vi.fn(async (id: string) => {
      for (;;) {
        const s = await getAssetStatus(id);
        if (!s) throw new actual.AssetEditError('Failed to get processing status');
        if (s.status === 'READY' || s.status === 'COMPLETED') return s.asset;
        if (s.status === 'FAILED' || s.status === 'ERROR') throw new actual.AssetEditError(s.error || 'Processing failed');
      }
    }),
    upscaleImage: vi.fn(async () => ({ id: 'job-1' })),
    removeBackground: vi.fn(async () => ({ id: 'job-1' })),
    faceRestoreImage: vi.fn(async () => ({ id: 'job-1' })),
    colorizeImage: vi.fn(async () => ({ id: 'job-1' })),
    outpaintImage: vi.fn(async () => ({ id: 'job-1' })),
    uploadImage: vi.fn(),
  };
});

vi.mock('@/shared/hooks/useImageEditTokenCost', () => ({
  useImageEditTokenCost: () => ({ cost: 0, isLoading: false }),
}));

vi.mock('@/shared/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const LAYER = {
  id: 'base',
  name: 'Background',
  visible: true,
  locked: false,
  opacity: 100,
  blendMode: 'normal' as const,
  imageData: 'data:image/png;base64,BASE',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
};

const RESULT = { ...mockSourceAsset, id: 'result-1', previewUrl: 'https://example.com/result.png' };

interface Case {
  name: string;
  Panel: ComponentType;
  button: RegExp;
  /** true: the result is added as a layer; false: the editor opens the result asset */
  addsLayer: boolean;
}

const CASES: Case[] = [
  { name: 'Upscale', Panel: UpscalePanel, button: /^Upscale 2×$/, addsLayer: true },
  { name: 'Background remove', Panel: BgRemovePanel, button: /^Remove Background$/, addsLayer: true },
  { name: 'Face restore', Panel: FaceRestorePanel, button: /^Restore Faces$/, addsLayer: true },
  { name: 'Colorize', Panel: ColorizePanel, button: /^Colorize Image$/, addsLayer: true },
  { name: 'Outpaint', Panel: OutpaintPanel, button: /^Expand Image$/, addsLayer: false },
];

let startStore: ImageEditorStoreApi;
let addLayerFromUrl: Mock;
let openEditor: Mock;
let resolveStatus: (value: unknown) => void;

beforeEach(() => {
  vi.clearAllMocks();
  startStore = setupImageEditorTestTab('tab-start');
  addLayerFromUrl = vi.fn(async () => 'new-layer');
  openEditor = vi.fn();
  startStore.setState({
    sourceAsset: mockSourceAsset,
    layers: [LAYER],
    activeLayerId: 'base',
    canvasWidth: 100,
    canvasHeight: 100,
    addLayerFromUrl,
    openEditor,
  });
  (getAssetStatus as Mock).mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveStatus = resolve;
      }),
  );
});

describe.each(CASES)('$name panel: job outlives the panel', ({ Panel, button, addsLayer }) => {
  it('clears isProcessing and applies the result to the starting tab after the panel unmounts', async () => {
    const { unmount } = render(<Panel />);
    fireEvent.click(screen.getByRole('button', { name: button }));
    await waitFor(() => expect(getAssetStatus).toHaveBeenCalled());
    expect(startStore.getState().isProcessing).toBe(true);

    unmount();
    await act(async () => {
      resolveStatus({ status: 'READY', asset: RESULT });
    });

    await waitFor(() => expect(startStore.getState().isProcessing).toBe(false));
    if (addsLayer) expect(addLayerFromUrl).toHaveBeenCalledWith(RESULT.previewUrl, expect.any(String));
    else expect(openEditor).toHaveBeenCalledWith(RESULT);
  });

  it('applies to the tab that started the job even when another tab is active now', async () => {
    const other = getOrCreateStore('tab-other');
    const otherAdd = vi.fn(async () => 'x');
    const otherOpen = vi.fn();
    other.setState({ sourceAsset: mockSourceAsset, layers: [LAYER], addLayerFromUrl: otherAdd, openEditor: otherOpen });

    const { unmount } = render(<Panel />);
    fireEvent.click(screen.getByRole('button', { name: button }));
    await waitFor(() => expect(getAssetStatus).toHaveBeenCalled());

    // the user switches tabs: the editor subtree (and this panel) re-mounts for the other tab
    unmount();
    setActiveTabId('tab-other');
    await act(async () => {
      resolveStatus({ status: 'READY', asset: RESULT });
    });

    await waitFor(() => expect(startStore.getState().isProcessing).toBe(false));
    expect(otherAdd).not.toHaveBeenCalled();
    expect(otherOpen).not.toHaveBeenCalled();
    expect(other.getState().isProcessing).toBe(false);
    if (addsLayer) expect(addLayerFromUrl).toHaveBeenCalled();
    else expect(openEditor).toHaveBeenCalledWith(RESULT);
    deleteStore('tab-other');
  });

  it('a failed job after unmount still clears isProcessing', async () => {
    const { unmount } = render(<Panel />);
    fireEvent.click(screen.getByRole('button', { name: button }));
    await waitFor(() => expect(getAssetStatus).toHaveBeenCalled());
    unmount();
    await act(async () => {
      resolveStatus({ status: 'FAILED', error: 'provider down' });
    });
    await waitFor(() => expect(startStore.getState().isProcessing).toBe(false));
  });
});
