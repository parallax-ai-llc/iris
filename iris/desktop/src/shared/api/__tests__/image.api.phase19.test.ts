/**
 * Phase 19 Neural Filter API Tests
 *
 * Tests for: smartPortrait, superZoom, makeupTransfer, photoRestoration, landscapeMixer
 *
 * These functions use useIrisAssetStore.getState().assets for asset lookup
 * instead of the getImage() API call used by earlier functions.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { apiClient } from '../client';

// Mock the apiClient
vi.mock('../client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    uploadFile: vi.fn(),
  },
}));

// Mock asset data
const mockAsset = {
  id: 'asset-123',
  name: 'test-image.png',
  type: 'IMAGE',
  url: 'https://example.com/image.png',
  thumbnailUrl: 'https://example.com/thumb.png',
  width: 1920,
  height: 1080,
  processingStatus: 'READY',
  path: 'images',
};

const mockReferenceAsset = {
  id: 'ref-456',
  name: 'reference.png',
  type: 'IMAGE',
  url: 'https://example.com/reference.png',
  thumbnailUrl: 'https://example.com/ref-thumb.png',
  width: 1024,
  height: 768,
  processingStatus: 'READY',
  path: 'images',
};

// Mock useImageStore — used by Phase 19 neural filter functions
// (구 useIrisAssetStore.assets → 현 useImageStore.images)
const mockStoreAssets = [mockAsset, mockReferenceAsset];

vi.mock('@/features/images/stores/image.store', () => ({
  useImageStore: {
    getState: () => ({
      images: mockStoreAssets,
    }),
  },
}));

// Import after mocks are set up
import {
  smartPortrait,
  superZoom,
  makeupTransfer,
  photoRestoration,
  landscapeMixer,
} from '../image.api';

describe('Phase 19 Neural Filter API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== smartPortrait ====================

  describe('smartPortrait', () => {
    it('should call API with default parameters', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      const result = await smartPortrait('asset-123');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          assetType: 'IMAGE',
          storagePath: 'images',
          prompt: '',
          settings: expect.objectContaining({
            model: 'smart-portrait',
            providerId: 'replicate',
            referenceAssetId: 'asset-123',
            smartPortrait: {
              smoothSkin: 50,
              enhanceEyes: 30,
              enhanceLips: 20,
              faceLight: 0,
              age: 0,
            },
          }),
          referenceAssetId: 'asset-123',
        }),
        { requireAuth: true }
      );
      expect(result).toEqual(mockAsset);
    });

    it('should call API with custom parameters', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await smartPortrait('asset-123', {
        smoothSkin: 80,
        enhanceEyes: 60,
        enhanceLips: 40,
        faceLight: 25,
        age: -10,
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          settings: expect.objectContaining({
            smartPortrait: {
              smoothSkin: 80,
              enhanceEyes: 60,
              enhanceLips: 40,
              faceLight: 25,
              age: -10,
            },
          }),
        }),
        { requireAuth: true }
      );
    });

    it('should use partial custom parameters with defaults for missing ones', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await smartPortrait('asset-123', { smoothSkin: 100 });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          settings: expect.objectContaining({
            smartPortrait: {
              smoothSkin: 100,
              enhanceEyes: 30,
              enhanceLips: 20,
              faceLight: 0,
              age: 0,
            },
          }),
        }),
        { requireAuth: true }
      );
    });

    it('should return null when asset not found in store', async () => {
      const result = await smartPortrait('non-existent-id');

      expect(apiClient.post).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return null when API call fails', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: false,
        error: 'Server error',
      });

      const result = await smartPortrait('asset-123');

      expect(result).toBeNull();
    });

    it('should use replicate as provider', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await smartPortrait('asset-123');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          settings: expect.objectContaining({
            providerId: 'replicate',
          }),
        }),
        expect.anything()
      );
    });
  });

  // ==================== superZoom ====================

  describe('superZoom', () => {
    it('should call API with default scale (4)', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      const result = await superZoom('asset-123');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          assetType: 'IMAGE',
          storagePath: 'images',
          prompt: '',
          settings: expect.objectContaining({
            model: 'recraft-upscale',
            providerId: 'recraft',
            referenceAssetId: 'asset-123',
            upscale: {
              scale: 4,
              enhanceDetails: true,
            },
          }),
          referenceAssetId: 'asset-123',
        }),
        { requireAuth: true }
      );
      expect(result).toEqual(mockAsset);
    });

    it('should call API with custom scale', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await superZoom('asset-123', 6);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          settings: expect.objectContaining({
            upscale: {
              scale: 6,
              enhanceDetails: true,
            },
          }),
        }),
        { requireAuth: true }
      );
    });

    it('should clamp scale to minimum 2', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await superZoom('asset-123', 1);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          settings: expect.objectContaining({
            upscale: expect.objectContaining({
              scale: 2,
            }),
          }),
        }),
        expect.anything()
      );
    });

    it('should clamp scale to maximum 8', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await superZoom('asset-123', 16);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          settings: expect.objectContaining({
            upscale: expect.objectContaining({
              scale: 8,
            }),
          }),
        }),
        expect.anything()
      );
    });

    it('should return null when asset not found in store', async () => {
      const result = await superZoom('non-existent-id');

      expect(apiClient.post).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return null when API call fails', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: false,
      });

      const result = await superZoom('asset-123');

      expect(result).toBeNull();
    });

    it('should always set enhanceDetails to true', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await superZoom('asset-123', 2);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          settings: expect.objectContaining({
            upscale: expect.objectContaining({
              enhanceDetails: true,
            }),
          }),
        }),
        expect.anything()
      );
    });
  });

  // ==================== makeupTransfer ====================

  describe('makeupTransfer', () => {
    it('should call API with default parameters', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      const result = await makeupTransfer('asset-123', 'ref-456');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          assetType: 'IMAGE',
          storagePath: 'images',
          prompt: '',
          settings: expect.objectContaining({
            model: 'makeup-transfer',
            providerId: 'replicate',
            referenceAssetId: 'asset-123',
            makeupTransfer: {
              styleReferenceAssetId: 'ref-456',
              intensity: 80,
              lipOnly: false,
              eyeOnly: false,
            },
          }),
          referenceAssetId: 'asset-123',
        }),
        { requireAuth: true }
      );
      expect(result).toEqual(mockAsset);
    });

    it('should call API with custom parameters', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await makeupTransfer('asset-123', 'ref-456', {
        intensity: 50,
        lipOnly: true,
        eyeOnly: false,
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          settings: expect.objectContaining({
            makeupTransfer: {
              styleReferenceAssetId: 'ref-456',
              intensity: 50,
              lipOnly: true,
              eyeOnly: false,
            },
          }),
        }),
        { requireAuth: true }
      );
    });

    it('should support eye-only mode', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await makeupTransfer('asset-123', 'ref-456', { eyeOnly: true });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          settings: expect.objectContaining({
            makeupTransfer: expect.objectContaining({
              eyeOnly: true,
              lipOnly: false,
            }),
          }),
        }),
        expect.anything()
      );
    });

    it('should return null when target asset not found', async () => {
      const result = await makeupTransfer('non-existent', 'ref-456');

      expect(apiClient.post).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return null when reference asset not found', async () => {
      const result = await makeupTransfer('asset-123', 'non-existent');

      expect(apiClient.post).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return null when both assets not found', async () => {
      const result = await makeupTransfer('non-existent-a', 'non-existent-b');

      expect(apiClient.post).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return null when API call fails', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: false,
      });

      const result = await makeupTransfer('asset-123', 'ref-456');

      expect(result).toBeNull();
    });
  });

  // ==================== photoRestoration ====================

  describe('photoRestoration', () => {
    it('should call API with default parameters (all enabled)', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      const result = await photoRestoration('asset-123');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          assetType: 'IMAGE',
          storagePath: 'images',
          prompt: '',
          settings: expect.objectContaining({
            model: 'photo-restoration',
            providerId: 'replicate',
            referenceAssetId: 'asset-123',
            photoRestoration: {
              colorize: true,
              scratchRemoval: true,
              faceEnhance: true,
            },
          }),
          referenceAssetId: 'asset-123',
        }),
        { requireAuth: true }
      );
      expect(result).toEqual(mockAsset);
    });

    it('should call API with custom parameters', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await photoRestoration('asset-123', {
        colorize: false,
        scratchRemoval: true,
        faceEnhance: false,
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          settings: expect.objectContaining({
            photoRestoration: {
              colorize: false,
              scratchRemoval: true,
              faceEnhance: false,
            },
          }),
        }),
        { requireAuth: true }
      );
    });

    it('should support scratch-removal only mode', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await photoRestoration('asset-123', {
        colorize: false,
        scratchRemoval: true,
        faceEnhance: false,
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          settings: expect.objectContaining({
            photoRestoration: expect.objectContaining({
              scratchRemoval: true,
              colorize: false,
              faceEnhance: false,
            }),
          }),
        }),
        expect.anything()
      );
    });

    it('should return null when asset not found in store', async () => {
      const result = await photoRestoration('non-existent-id');

      expect(apiClient.post).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return null when API call fails', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: false,
        error: 'Restoration failed',
      });

      const result = await photoRestoration('asset-123');

      expect(result).toBeNull();
    });

    it('should use replicate as provider', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await photoRestoration('asset-123');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          settings: expect.objectContaining({
            providerId: 'replicate',
            model: 'photo-restoration',
          }),
        }),
        expect.anything()
      );
    });
  });

  // ==================== landscapeMixer ====================

  describe('landscapeMixer', () => {
    it('should call API with default parameters', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      const result = await landscapeMixer('asset-123', 'ref-456');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          assetType: 'IMAGE',
          storagePath: 'images',
          prompt: 'blend landscapes seamlessly',
          settings: expect.objectContaining({
            model: 'stability-landscape-mixer',
            providerId: 'stability',
            referenceAssetId: 'asset-123',
            landscapeMixer: {
              styleReferenceAssetId: 'ref-456',
              blendStrength: 50,
              preserveForeground: true,
            },
          }),
          referenceAssetId: 'asset-123',
        }),
        { requireAuth: true }
      );
      expect(result).toEqual(mockAsset);
    });

    it('should call API with custom parameters', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await landscapeMixer('asset-123', 'ref-456', {
        prompt: 'sunset mountain landscape',
        blendStrength: 75,
        preserveForeground: false,
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          prompt: 'sunset mountain landscape',
          settings: expect.objectContaining({
            landscapeMixer: {
              styleReferenceAssetId: 'ref-456',
              blendStrength: 75,
              preserveForeground: false,
            },
          }),
        }),
        { requireAuth: true }
      );
    });

    it('should use default prompt when none provided', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await landscapeMixer('asset-123', 'ref-456', { blendStrength: 30 });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          prompt: 'blend landscapes seamlessly',
        }),
        expect.anything()
      );
    });

    it('should return null when target asset not found', async () => {
      const result = await landscapeMixer('non-existent', 'ref-456');

      expect(apiClient.post).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return null when reference asset not found', async () => {
      const result = await landscapeMixer('asset-123', 'non-existent');

      expect(apiClient.post).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return null when API call fails', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: false,
      });

      const result = await landscapeMixer('asset-123', 'ref-456');

      expect(result).toBeNull();
    });

    it('should use stability as provider', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await landscapeMixer('asset-123', 'ref-456');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          settings: expect.objectContaining({
            providerId: 'stability',
          }),
        }),
        expect.anything()
      );
    });

    it('should use asset path from original asset', async () => {
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await landscapeMixer('asset-123', 'ref-456');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          storagePath: 'images',
        }),
        expect.anything()
      );
    });
  });

  // ==================== Network Error Handling ====================

  describe('Network error handling', () => {
    it('smartPortrait should throw on network error', async () => {
      (apiClient.post as Mock).mockRejectedValue(new Error('Network timeout'));

      await expect(smartPortrait('asset-123')).rejects.toThrow('Network timeout');
    });

    it('superZoom should throw on network error', async () => {
      (apiClient.post as Mock).mockRejectedValue(new Error('Network timeout'));

      await expect(superZoom('asset-123')).rejects.toThrow('Network timeout');
    });

    it('makeupTransfer should throw on network error', async () => {
      (apiClient.post as Mock).mockRejectedValue(new Error('Network timeout'));

      await expect(makeupTransfer('asset-123', 'ref-456')).rejects.toThrow('Network timeout');
    });

    it('photoRestoration should throw on network error', async () => {
      (apiClient.post as Mock).mockRejectedValue(new Error('Network timeout'));

      await expect(photoRestoration('asset-123')).rejects.toThrow('Network timeout');
    });

    it('landscapeMixer should throw on network error', async () => {
      (apiClient.post as Mock).mockRejectedValue(new Error('Network timeout'));

      await expect(landscapeMixer('asset-123', 'ref-456')).rejects.toThrow('Network timeout');
    });
  });
});
