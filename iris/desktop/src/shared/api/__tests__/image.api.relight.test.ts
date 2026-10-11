/**
 * Relight request + edit result polling.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { apiClient } from '../client';
import {
  AssetEditError,
  EditWaitAbortedError,
  relightImage,
  waitForEditResult,
} from '../image.api';

vi.mock('../client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    uploadFile: vi.fn(),
  },
  isLoggedOut: vi.fn().mockResolvedValue(false),
}));

const source = { id: 'asset-1', path: 'my/folder', processingStatus: 'READY' };
const job = { id: 'job-1', processingStatus: 'PROCESSING' };

describe('relightImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.get as Mock).mockResolvedValue({ success: true, data: source });
  });

  it('sends the same relight request as iris/web with the prompt filled in', async () => {
    (apiClient.post as Mock).mockResolvedValue({ success: true, data: { asset: job } });

    const result = await relightImage('asset-1', { prompt: '  soft natural daylight  ' });

    expect(result).toEqual(job);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/iris/assets/generate',
      expect.objectContaining({
        assetType: 'IMAGE',
        editMode: 'relight',
        prompt: 'soft natural daylight',
        parentAssetId: 'asset-1',
        sourceAssetId: 'asset-1',
        referenceAssetId: 'asset-1',
        storagePath: 'my/folder',
        settings: expect.objectContaining({
          model: 'fal-ai/iclight-v2',
          providerId: 'fal',
          relightSettings: { lightingPrompt: 'soft natural daylight' },
        }),
      }),
      { requireAuth: true },
    );
    const body = (apiClient.post as Mock).mock.calls[0][1];
    expect(body.settings.relightSettings).not.toHaveProperty('lightDirection');
  });

  it('falls back to the images folder when the source asset cannot be read', async () => {
    (apiClient.get as Mock).mockResolvedValue({ success: false });
    (apiClient.post as Mock).mockResolvedValue({ success: true, data: { asset: job } });

    await relightImage('asset-1', { prompt: 'x' });

    expect((apiClient.post as Mock).mock.calls[0][1].storagePath).toBe('images');
  });

  it('rejects an empty prompt without calling the server', async () => {
    await expect(relightImage('asset-1', { prompt: '   ' })).rejects.toBeInstanceOf(AssetEditError);
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('throws AssetEditError with the status code when the job cannot start', async () => {
    (apiClient.post as Mock).mockResolvedValue({ success: false, error: 'Insufficient credits', statusCode: 402 });

    const error = await relightImage('asset-1', { prompt: 'x' }).catch((e) => e);

    expect(error).toBeInstanceOf(AssetEditError);
    expect(error.statusCode).toBe(402);
    expect(error.message).toBe('Insufficient credits');
  });
});

describe('waitForEditResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('polls until READY and reports progress', async () => {
    const done = { id: 'job-1', processingStatus: 'READY', previewUrl: 'https://x/y.png' };
    (apiClient.get as Mock)
      .mockResolvedValueOnce({ success: true, data: { id: 'job-1', processingStatus: 'PROCESSING' } })
      .mockResolvedValueOnce({ success: true, data: done });
    const onProgress = vi.fn();

    const asset = await waitForEditResult('job-1', { intervalMs: 1, onProgress });

    expect(asset).toEqual(done);
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress.mock.calls[0][0]).toBeLessThanOrEqual(90);
  });

  it('throws the server error on FAILED', async () => {
    (apiClient.get as Mock).mockResolvedValue({
      success: true,
      data: { id: 'job-1', processingStatus: 'FAILED', processingError: 'provider down' },
    });

    await expect(waitForEditResult('job-1', { intervalMs: 1 })).rejects.toThrow('provider down');
  });

  it('times out after maxAttempts', async () => {
    (apiClient.get as Mock).mockResolvedValue({
      success: true,
      data: { id: 'job-1', processingStatus: 'PROCESSING' },
    });

    await expect(waitForEditResult('job-1', { intervalMs: 1, maxAttempts: 3 })).rejects.toThrow('Processing timeout');
    expect(apiClient.get).toHaveBeenCalledTimes(3);
  });

  it('stops with EditWaitAbortedError when aborted while waiting', async () => {
    (apiClient.get as Mock).mockResolvedValue({
      success: true,
      data: { id: 'job-1', processingStatus: 'PROCESSING' },
    });
    const controller = new AbortController();

    const pending = waitForEditResult('job-1', { intervalMs: 10_000, signal: controller.signal });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(EditWaitAbortedError);
  });

  it('does not poll when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(waitForEditResult('job-1', { signal: controller.signal })).rejects.toBeInstanceOf(EditWaitAbortedError);
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});
