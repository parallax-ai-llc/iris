/**
 * imageEditor.store — selectSubject & refineEdge actions
 *
 * Tests the AI-powered subject selection and edge refinement store actions.
 * Dynamic imports are intercepted by vi.mock() which is hoisted by Vitest.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { useImageEditorStore } from '../imageEditor.store';
import {
  mockSourceAsset,
  mockBgRemovedAsset,
  mockSelection,
  setupImageEditorTestTab,
} from '@/test-utils/imageEditorHelpers';

// ==================== Module mocks ====================

vi.mock('@/shared/api/image.api', () => ({
  removeBackground: vi.fn(),
  getAssetStatus: vi.fn(),
  uploadImage: vi.fn(),
}));

vi.mock('@/features/image-editor/canvas/selectionEngine', () => ({
  loadMaskAsSelection: vi.fn(),
  getSelectionBounds: vi.fn(),
  loadSelectionMask: vi.fn(),
  refineEdge: vi.fn(),
}));

// ==================== Helpers ====================

async function getImageApi() {
  return await import('@/shared/api/image.api');
}

async function getSelectionEngine() {
  return await import('@/features/image-editor/canvas/selectionEngine');
}

const mockLayer = {
  id: 'layer-1',
  name: 'Background',
  visible: true,
  locked: false,
  opacity: 100,
  blendMode: 'normal' as const,
  imageData: 'data:image/png;base64,abc',
  x: 0,
  y: 0,
  width: 800,
  height: 600,
};

const readyStatusResponse = {
  status: 'READY',
  asset: mockBgRemovedAsset,
};

// ==================== Tests ====================

beforeEach(() => {
  setupImageEditorTestTab(); // fresh active tab per test (registry shim requires one)
});

describe('imageEditor.store — selectSubject', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset store state
    useImageEditorStore.setState({
      sourceAsset: mockSourceAsset,
      layers: [mockLayer],
      activeLayerId: 'layer-1',
      selection: null,
      selectionFeather: 0,
      isProcessing: false,
      processingMessage: '',
      processingProgress: 0,
    });

    // Default happy-path mocks
    const { removeBackground, getAssetStatus } = await getImageApi();
    const { loadMaskAsSelection, getSelectionBounds } = await getSelectionEngine();

    (removeBackground as Mock).mockResolvedValue(mockBgRemovedAsset);
    (getAssetStatus as Mock).mockResolvedValue(readyStatusResponse);

    const fakeMask = new Uint8ClampedArray(800 * 600).fill(255);
    (loadMaskAsSelection as Mock).mockResolvedValue(fakeMask);
    (getSelectionBounds as Mock).mockReturnValue({ x: 0, y: 0, width: 800, height: 600 });
  });

  // S1: Normal success flow
  it('S1: sets selection with bounds on success', async () => {
    await useImageEditorStore.getState().selectSubject();

    const { selection, isProcessing } = useImageEditorStore.getState();
    expect(selection).not.toBeNull();
    expect(selection?.bounds).not.toBeNull();
    expect(selection?.bounds).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(selection?.isInverted).toBe(false);
    expect(isProcessing).toBe(false);
  });

  it('S1b: sets isProcessing=true during execution then resets', async () => {
    let processingDuring = false;
    const { removeBackground } = await getImageApi();

    (removeBackground as Mock).mockImplementation(async () => {
      processingDuring = useImageEditorStore.getState().isProcessing;
      return mockBgRemovedAsset;
    });

    await useImageEditorStore.getState().selectSubject();

    expect(processingDuring).toBe(true);
    expect(useImageEditorStore.getState().isProcessing).toBe(false);
  });

  it('S1c: calls removeBackground with correct asset id', async () => {
    const { removeBackground } = await getImageApi();

    await useImageEditorStore.getState().selectSubject();

    expect(removeBackground).toHaveBeenCalledWith('asset-123');
  });

  // S2: removeBackground returns null → throws
  it('S2: throws and resets isProcessing when removeBackground fails', async () => {
    const { removeBackground } = await getImageApi();
    (removeBackground as Mock).mockResolvedValue(null);

    await expect(useImageEditorStore.getState().selectSubject()).rejects.toThrow(
      'Failed to start subject selection'
    );

    expect(useImageEditorStore.getState().isProcessing).toBe(false);
    expect(useImageEditorStore.getState().selection).toBeNull();
  });

  // S3: getAssetStatus returns FAILED → throws
  it('S3: throws when status is FAILED', async () => {
    const { getAssetStatus } = await getImageApi();
    (getAssetStatus as Mock).mockResolvedValue({
      status: 'FAILED',
      error: 'Processing error',
    });

    await expect(useImageEditorStore.getState().selectSubject()).rejects.toThrow(
      'Processing error'
    );

    expect(useImageEditorStore.getState().isProcessing).toBe(false);
  });

  // 서버 IrisProcessingStatus enum에는 ERROR가 없다(READY/PROCESSING/FAILED).
  // 미지의 status는 폴링 계속 → 여기서는 status 조회 실패(null) 경로를 검증한다.
  it('S3b: throws when status fetch fails', async () => {
    const { getAssetStatus } = await getImageApi();
    (getAssetStatus as Mock).mockResolvedValue(null);

    await expect(useImageEditorStore.getState().selectSubject()).rejects.toThrow();
    expect(useImageEditorStore.getState().isProcessing).toBe(false);
  });

  // S4: Called twice — second replaces first
  it('S4: second call replaces previous selection', async () => {
    const { getSelectionBounds } = await getSelectionEngine();

    // First call: bounds A
    (getSelectionBounds as Mock).mockReturnValueOnce({ x: 0, y: 0, width: 800, height: 600 });
    await useImageEditorStore.getState().selectSubject();
    const firstBounds = useImageEditorStore.getState().selection?.bounds;

    // Second call: bounds B (different subject)
    (getSelectionBounds as Mock).mockReturnValueOnce({ x: 50, y: 50, width: 400, height: 400 });
    await useImageEditorStore.getState().selectSubject();
    const secondBounds = useImageEditorStore.getState().selection?.bounds;

    expect(firstBounds).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(secondBounds).toEqual({ x: 50, y: 50, width: 400, height: 400 });
  });

  // S5: No sourceAsset → early return (no throw, no processing)
  it('throws without processing if sourceAsset is null', async () => {
    useImageEditorStore.setState({ sourceAsset: null });

    await expect(useImageEditorStore.getState().selectSubject()).rejects.toThrow(
      'No source image available',
    );

    const { selection, isProcessing } = useImageEditorStore.getState();
    expect(selection).toBeNull();
    expect(isProcessing).toBe(false);

    const { removeBackground } = await getImageApi();
    expect(removeBackground).not.toHaveBeenCalled();
  });

  // Canvas dimensions fall back to 512 if no layers
  it('uses 512×512 if no layers exist', async () => {
    useImageEditorStore.setState({ layers: [] });
    const { loadMaskAsSelection } = await getSelectionEngine();

    await useImageEditorStore.getState().selectSubject();

    expect(loadMaskAsSelection).toHaveBeenCalledWith(
      expect.any(String),
      512,
      512
    );
  });
});

// ==================== refineEdge ====================

describe('imageEditor.store — refineEdge', () => {
  const refineOptions = { radius: 3, smoothing: 2, feather: 1, contrast: 0 };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set up store with an existing selection
    useImageEditorStore.setState({
      layers: [mockLayer],
      selection: mockSelection,
      isProcessing: false,
    });

    const { loadSelectionMask, refineEdge, getSelectionBounds } = await getSelectionEngine();

    const fakeMask = new Uint8ClampedArray(800 * 600).fill(128);
    (loadSelectionMask as Mock).mockResolvedValue(fakeMask);

    const refinedMask = new Uint8ClampedArray(800 * 600).fill(200);
    (refineEdge as Mock).mockReturnValue(refinedMask);
    (getSelectionBounds as Mock).mockReturnValue({ x: 0, y: 0, width: 100, height: 100 });
  });

  // S5: refineEdge updates selection
  it('S5: updates selection maskDataUrl after refinement', async () => {
    await (useImageEditorStore.getState().refineEdge as unknown as (o: typeof refineOptions) => Promise<void>)(refineOptions);

    const { selection } = useImageEditorStore.getState();
    expect(selection).not.toBeNull();
    // maskDataUrl should be a canvas data URL (even if mocked canvas returns empty)
    expect(selection?.maskDataUrl).toBeDefined();
    // feather should be updated to the new value
    expect(selection?.feather).toBe(refineOptions.feather);
  });

  it('S5b: calls refineEdge function with correct options', async () => {
    const { refineEdge } = await getSelectionEngine();

    await (useImageEditorStore.getState().refineEdge as unknown as (o: typeof refineOptions) => Promise<void>)(refineOptions);

    expect(refineEdge).toHaveBeenCalledWith(
      expect.any(Uint8ClampedArray),
      mockLayer.width,
      mockLayer.height,
      refineOptions
    );
  });

  // S6: no selection → no-op
  it('S6: does nothing when selection is null', async () => {
    useImageEditorStore.setState({ selection: null });

    const { refineEdge } = await getSelectionEngine();

    await (useImageEditorStore.getState().refineEdge as unknown as (o: typeof refineOptions) => Promise<void>)(refineOptions);

    expect(refineEdge).not.toHaveBeenCalled();
    expect(useImageEditorStore.getState().selection).toBeNull();
  });
});
