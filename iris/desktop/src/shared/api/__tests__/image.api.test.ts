/**
 * Image API Unit Tests
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { apiClient } from '../client';
import {
  inpaintImage,
  outpaintImage,
  getAssetStatus,
  upscaleImage,
  removeBackground,
  faceRestoreImage,
  colorizeImage,
  getImage,
} from '../image.api';

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

describe('Image API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getImage', () => {
    it('should fetch an image by ID', async () => {
      (apiClient.get as Mock).mockResolvedValue({
        success: true,
        data: mockAsset,
      });

      const result = await getImage('asset-123');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/iris/assets/asset-123',
        { requireAuth: true }
      );
      expect(result).toEqual(mockAsset);
    });

    it('should return null on failure', async () => {
      (apiClient.get as Mock).mockResolvedValue({
        success: false,
        error: 'Not found',
      });

      const result = await getImage('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getAssetStatus', () => {
    it('should return asset status', async () => {
      (apiClient.get as Mock).mockResolvedValue({
        success: true,
        data: mockAsset,
      });

      const result = await getAssetStatus('asset-123');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/iris/assets/asset-123',
        { requireAuth: true }
      );
      expect(result).toEqual({
        status: 'READY',
        asset: mockAsset,
        error: undefined,
      });
    });

    it('should return null on failure', async () => {
      (apiClient.get as Mock).mockResolvedValue({
        success: false,
      });

      const result = await getAssetStatus('asset-123');

      expect(result).toBeNull();
    });

    it('should handle processing status', async () => {
      const processingAsset = {
        ...mockAsset,
        processingStatus: 'PROCESSING',
      };

      (apiClient.get as Mock).mockResolvedValue({
        success: true,
        data: processingAsset,
      });

      const result = await getAssetStatus('asset-123');

      expect(result?.status).toBe('PROCESSING');
    });

    it('should handle error status', async () => {
      const errorAsset = {
        ...mockAsset,
        processingStatus: 'FAILED',
        processingError: 'Processing failed',
      };

      (apiClient.get as Mock).mockResolvedValue({
        success: true,
        data: errorAsset,
      });

      const result = await getAssetStatus('asset-123');

      expect(result?.status).toBe('FAILED');
      expect(result?.error).toBe('Processing failed');
    });
  });

  describe('inpaintImage', () => {
    it('should call API with correct parameters', async () => {
      // First mock for getImage call
      (apiClient.get as Mock).mockResolvedValueOnce({
        success: true,
        data: mockAsset,
      });

      // Second mock for post call
      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      const maskDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const result = await inpaintImage(
        'asset-123',
        'add a flower',
        maskDataUrl,
        'blurry'
      );

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          assetType: 'IMAGE',
          prompt: 'add a flower',
          negativePrompt: 'blurry',
          editMode: 'inpaint',
          referenceAssetId: 'asset-123',
        }),
        { requireAuth: true }
      );
      expect(result).toEqual(mockAsset);
    });

    it('should strip base64 prefix from mask', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce({
        success: true,
        data: mockAsset,
      });

      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      const maskDataUrl = 'data:image/png;base64,ABC123';

      await inpaintImage('asset-123', 'prompt', maskDataUrl);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          maskImageBase64: 'ABC123', // base64 prefix stripped
        }),
        expect.anything()
      );
    });

    it('should return null if asset not found', async () => {
      (apiClient.get as Mock).mockResolvedValue({
        success: false,
      });

      const result = await inpaintImage('non-existent', 'prompt', 'mask');

      expect(result).toBeNull();
    });
  });

  describe('outpaintImage', () => {
    it('should call API with single direction', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce({
        success: true,
        data: mockAsset,
      });

      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await outpaintImage('asset-123', 'right', 256, 'continue the scene');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          editMode: 'outpaint',
          prompt: 'continue the scene',
          outpaint: {
            directions: ['right'],
            expandAmount: 256,
          },
        }),
        { requireAuth: true }
      );
    });

    it('should expand to all directions when "all" is specified', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce({
        success: true,
        data: mockAsset,
      });

      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await outpaintImage('asset-123', 'all', 128);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          outpaint: {
            directions: ['top', 'bottom', 'left', 'right'],
            expandAmount: 128,
          },
        }),
        expect.anything()
      );
    });

    it('should work without prompt', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce({
        success: true,
        data: mockAsset,
      });

      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await outpaintImage('asset-123', 'top', 256);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          prompt: '',
        }),
        expect.anything()
      );
    });
  });

  describe('upscaleImage', () => {
    it('should call API for 2x upscale', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce({
        success: true,
        data: mockAsset,
      });

      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await upscaleImage('asset-123', 2);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          settings: expect.objectContaining({
            model: 'recraft-crisp-upscale',
            upscaleType: 'crisp',
          }),
        }),
        { requireAuth: true }
      );
    });

    it('should call API for 4x upscale', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce({
        success: true,
        data: mockAsset,
      });

      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await upscaleImage('asset-123', 4);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          settings: expect.objectContaining({
            model: 'recraft-creative-upscale',
            upscaleType: 'creative',
          }),
        }),
        { requireAuth: true }
      );
    });
  });

  describe('removeBackground', () => {
    it('should call API with correct parameters', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce({
        success: true,
        data: mockAsset,
      });

      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await removeBackground('asset-123');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          settings: expect.objectContaining({
            model: 'recraft-remove-background',
            removeBackground: true,
          }),
        }),
        { requireAuth: true }
      );
    });
  });

  describe('faceRestoreImage', () => {
    it('should use default model and fidelity', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce({
        success: true,
        data: mockAsset,
      });

      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await faceRestoreImage('asset-123');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          settings: expect.objectContaining({
            model: 'face-restore-codeformer',
            faceRestoreModel: 'codeformer',
            fidelity: 0.5,
          }),
        }),
        { requireAuth: true }
      );
    });

    it('should use custom model and fidelity', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce({
        success: true,
        data: mockAsset,
      });

      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await faceRestoreImage('asset-123', 'gfpgan', 0.8);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          settings: expect.objectContaining({
            model: 'face-restore-gfpgan',
            faceRestoreModel: 'gfpgan',
            fidelity: 0.8,
          }),
        }),
        { requireAuth: true }
      );
    });
  });

  describe('colorizeImage', () => {
    it('should use default style', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce({
        success: true,
        data: mockAsset,
      });

      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await colorizeImage('asset-123');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          settings: expect.objectContaining({
            model: 'colorize-deoldify',
            colorizeStyle: 'natural',
          }),
        }),
        { requireAuth: true }
      );
    });

    it('should use custom style', async () => {
      (apiClient.get as Mock).mockResolvedValueOnce({
        success: true,
        data: mockAsset,
      });

      (apiClient.post as Mock).mockResolvedValue({
        success: true,
        data: { asset: mockAsset },
      });

      await colorizeImage('asset-123', 'cinematic');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/iris/assets/generate',
        expect.objectContaining({
          settings: expect.objectContaining({
            colorizeStyle: 'cinematic',
          }),
        }),
        { requireAuth: true }
      );
    });
  });
});
