/**
 * Shared test utilities for image editor tests
 */

import type { IrisAsset } from '@/shared/api/types';
import type { SelectionData } from '@/features/image-editor/stores/imageEditor.store';
import {
  getOrCreateStore,
  setActiveTabId,
  deleteStore,
} from '@/features/image-editor/stores/imageEditorRegistry';
import type { ImageEditorStoreApi } from '@/features/image-editor/stores/imageEditorFactory';

// ==================== Registry setup ====================
//
// `useImageEditorStore` is a shim that proxies to the active tab's store in
// imageEditorRegistry — calling `.setState()`/`.getState()` without an active
// tab throws `[imageEditorRegistry] No active tab`. Tests must create a tab
// first; call `setupImageEditorTestTab()` in a top-level `beforeEach`.

export const TEST_TAB_ID = 'vitest-tab';

/** Create a fresh store for `tabId` and mark it active. Call in beforeEach. */
export function setupImageEditorTestTab(tabId: string = TEST_TAB_ID): ImageEditorStoreApi {
  deleteStore(tabId); // drop previous test's store so each test starts fresh
  const store = getOrCreateStore(tabId);
  setActiveTabId(tabId);
  return store;
}

/** Remove the test store and clear the active tab. Call in afterEach if needed. */
export function teardownImageEditorTestTab(tabId: string = TEST_TAB_ID): void {
  deleteStore(tabId);
  setActiveTabId(null);
}

// ==================== Mock data ====================

export const mockSourceAsset: IrisAsset = {
  id: 'asset-123',
  userId: 'user-1',
  name: 'test-image.jpg',
  storagePath: 'images/test-image.jpg',
  currentVersion: 1,
  assetType: 'IMAGE',
  mimeType: 'image/jpeg',
  sizeBytes: 102400,
  isPublic: false,
  previewUrl: 'https://example.com/preview.jpg',
  publicUrl: 'https://example.com/image.jpg',
  processingStatus: 'READY',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

export const mockBgRemovedAsset: IrisAsset = {
  ...mockSourceAsset,
  id: 'asset-456',
  name: 'test-image-nobg.png',
  previewUrl: 'https://example.com/nobg-preview.png',
  publicUrl: 'https://example.com/nobg.png',
  processingStatus: 'READY',
};

export const mockSelection: SelectionData = {
  maskDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  bounds: { x: 10, y: 10, width: 100, height: 100 },
  feather: 0,
  isInverted: false,
};

// ==================== Mask helpers ====================

/**
 * Create a simple test mask: white square in the center of a black canvas
 */
export function createCenterMask(
  width: number,
  height: number,
  squareSize: number
): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(width * height);
  const startX = Math.floor((width - squareSize) / 2);
  const startY = Math.floor((height - squareSize) / 2);

  for (let y = startY; y < startY + squareSize; y++) {
    for (let x = startX; x < startX + squareSize; x++) {
      mask[y * width + x] = 255;
    }
  }
  return mask;
}

/**
 * Count pixels above threshold in a mask
 */
export function countSelectedPixels(
  mask: Uint8ClampedArray,
  threshold = 127
): number {
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] > threshold) count++;
  }
  return count;
}

/**
 * Count pixels with values between 1 and 254 (soft/feathered pixels)
 */
export function countSoftPixels(mask: Uint8ClampedArray): number {
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] > 0 && mask[i] < 255) count++;
  }
  return count;
}

// ==================== Mock image data helpers ====================

/**
 * Create mock ImageData with RGBA pattern
 * - alpha channel = maskValue for all pixels (for loadMaskAsSelection)
 * - R channel = maskValue for all pixels (for loadSelectionMask)
 */
export function createMockRGBAData(
  width: number,
  height: number,
  maskValue: number
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = maskValue;     // R
    data[i * 4 + 1] = maskValue; // G
    data[i * 4 + 2] = maskValue; // B
    data[i * 4 + 3] = maskValue; // A
  }
  return { data, width, height } as ImageData;
}

// ==================== Warp grid helpers ====================

/**
 * Create a default flat 3×3 warp grid (no distortion)
 */
export function createDefaultWarpGrid(
  width: number,
  height: number
): { x: number; y: number }[][] {
  return Array.from({ length: 3 }, (_, r) =>
    Array.from({ length: 3 }, (_, c) => ({
      x: (c / 2) * width,
      y: (r / 2) * height,
    }))
  );
}
