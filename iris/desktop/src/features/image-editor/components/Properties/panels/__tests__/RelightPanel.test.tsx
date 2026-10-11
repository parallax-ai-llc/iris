import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@/shared/lib/i18n';
import { setupImageEditorTestTab, mockSourceAsset, mockSelection } from '@/test-utils/imageEditorHelpers';
import type { ImageEditorStoreApi } from '@/features/image-editor/stores/imageEditorFactory';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import { relightImage, waitForEditResult, AssetEditError, EditWaitAbortedError } from '@/shared/api/image.api';
import { applyAIResultLayer } from '@/features/image-editor/lib/aiResultLayer';
import { formatTokenCost } from '@/shared/hooks/useTokenCost';
import { RelightPanel } from '../RelightPanel';

vi.mock('@/shared/api/image.api', async () => {
  const actual = await vi.importActual<typeof import('@/shared/api/image.api')>('@/shared/api/image.api');
  return {
    AssetEditError: actual.AssetEditError,
    EditWaitAbortedError: actual.EditWaitAbortedError,
    relightImage: vi.fn(),
    waitForEditResult: vi.fn(),
    uploadImage: vi.fn(),
  };
});

vi.mock('@/features/image-editor/lib/aiResultLayer', () => ({
  applyAIResultLayer: vi.fn().mockResolvedValue('new-layer'),
}));

vi.mock('@/shared/hooks/useImageEditTokenCost', () => ({
  useImageEditTokenCost: () => ({ cost: 42, isLoading: false }),
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

const resultAsset = { ...mockSourceAsset, id: 'job-1', previewUrl: 'https://example.com/relit.png' };

let store: ImageEditorStoreApi;

function runButton() {
  return screen.getByRole('button', { name: /^Relight/ });
}

beforeEach(() => {
  vi.clearAllMocks();
  store = setupImageEditorTestTab();
  store.setState({ sourceAsset: mockSourceAsset, layers: [LAYER], activeLayerId: 'base', canvasWidth: 100, canvasHeight: 100 });
  useAuthStore.setState({ isAuthenticated: true });
  (relightImage as Mock).mockResolvedValue({ ...resultAsset, processingStatus: 'PROCESSING' });
  (waitForEditResult as Mock).mockResolvedValue(resultAsset);
});

describe('RelightPanel', () => {
  it('shows the credit cost and the web preset text', () => {
    render(<RelightPanel />);
    expect(runButton()).toHaveTextContent(formatTokenCost(42));
    expect(screen.getByText('soft natural daylight from the left window')).toBeInTheDocument();
  });

  it('disables the run button and offers sign-in when logged out', () => {
    useAuthStore.setState({ isAuthenticated: false });
    render(<RelightPanel />);
    expect(runButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('sends the composed prompt and adds the result layer with the chosen strength', async () => {
    render(<RelightPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Dramatic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Left' }));
    fireEvent.click(screen.getByRole('button', { name: 'Warm' }));
    fireEvent.change(screen.getByLabelText('Strength'), { target: { value: '70' } });
    fireEvent.click(runButton());

    await waitFor(() => expect(applyAIResultLayer).toHaveBeenCalled());
    expect(relightImage).toHaveBeenCalledWith(mockSourceAsset.id, {
      prompt: 'dramatic side lighting, strong shadows, cinematic mood, light coming from the left, warm golden light',
    });
    expect((applyAIResultLayer as Mock).mock.calls[0][1]).toBe('https://example.com/relit.png');
    expect((applyAIResultLayer as Mock).mock.calls[0][2]).toMatchObject({ opacity: 70, historyLabel: 'Relight' });
    await waitFor(() => expect(store.getState().isProcessing).toBe(false));
  });

  it('uses custom text instead of the preset', async () => {
    render(<RelightPanel />);
    fireEvent.change(screen.getByLabelText(/Describe the lighting/), { target: { value: 'candle light' } });
    fireEvent.click(runButton());
    await waitFor(() => expect(relightImage).toHaveBeenCalledWith(mockSourceAsset.id, { prompt: 'candle light' }));
  });

  it('only offers the selection mask when there is a selection', async () => {
    const { unmount } = render(<RelightPanel />);
    expect(screen.queryByLabelText('Apply only inside the selection')).not.toBeInTheDocument();
    unmount();

    store.setState({ selection: mockSelection });
    render(<RelightPanel />);
    expect(screen.getByLabelText('Apply only inside the selection')).toBeChecked();
    fireEvent.click(runButton());
    await waitFor(() => expect(applyAIResultLayer).toHaveBeenCalled());
    expect((applyAIResultLayer as Mock).mock.calls[0][2]).toMatchObject({ maskToSelection: true });
  });

  it('shows the credits message on 402', async () => {
    (relightImage as Mock).mockRejectedValue(new AssetEditError('no credits', 402));
    render(<RelightPanel />);
    fireEvent.click(runButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Not enough credits for Relight.');
    expect(applyAIResultLayer).not.toHaveBeenCalled();
    expect(store.getState().isProcessing).toBe(false);
  });

  it('shows the server message when processing fails', async () => {
    (waitForEditResult as Mock).mockRejectedValue(new AssetEditError('provider down'));
    render(<RelightPanel />);
    fireEvent.click(runButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Relight failed. provider down');
  });

  it('stops waiting without an error when the user stops', async () => {
    let rejectWait: (e: unknown) => void = () => {};
    (waitForEditResult as Mock).mockImplementation(
      (_id: string, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          rejectWait = reject;
          opts.signal.addEventListener('abort', () => reject(new EditWaitAbortedError()));
        }),
    );
    render(<RelightPanel />);
    fireEvent.click(runButton());

    fireEvent.click(await screen.findByRole('button', { name: 'Stop waiting' }));

    await waitFor(() => expect(store.getState().isProcessing).toBe(false));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(applyAIResultLayer).not.toHaveBeenCalled();
    rejectWait(new Error('unused'));
  });
});
