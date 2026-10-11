/**
 * AssetCard (grid) video hover preview: thumbnail stays until the preview can
 * paint a frame, and stays for good if the preview fails.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { IrisAsset } from '@/shared/api/types';

vi.mock('@/shared/hooks/useCachedAssetUrl', () => ({
  useCachedAssetUrl: (_asset: unknown, opts: { type: string }) => ({
    url: opts.type === 'thumbnail' ? 'http://example.test/thumb.jpg' : null,
    isLoading: false,
    error: null,
  }),
}));

import { AssetCard } from '../AssetCard';

const asset = {
  id: 'a1',
  userId: 'u1',
  name: 'clip.mp4',
  storagePath: 'x',
  currentVersion: 1,
  assetType: 'VIDEO',
  mimeType: 'video/mp4',
  sizeBytes: 100,
  isPublic: false,
  previewUrl: 'http://example.test/preview.mp4',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
} as IrisAsset;

function renderCard() {
  const noop = vi.fn();
  const utils = render(
    <AssetCard
      asset={asset}
      isSelected={false}
      onSelect={noop}
      onClick={noop}
      onDownload={noop}
      onDelete={noop}
      onRename={noop}
      onMove={noop}
    />
  );
  const card = utils.container.firstElementChild as HTMLElement;
  const preview = screen.getByTestId('asset-card-preview') as HTMLVideoElement;
  return { card, preview };
}

const thumb = () => screen.queryByAltText('clip.mp4');

describe('AssetCard video hover preview', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps the thumbnail while hovering until the video has a frame', () => {
    const { card, preview } = renderCard();
    fireEvent.mouseEnter(card);
    expect(thumb()).toBeInTheDocument();
    expect(preview.className).toContain('opacity-0');

    fireEvent.loadedData(preview);
    expect(thumb()).not.toBeInTheDocument();
    expect(preview.className).not.toContain('opacity-0');
  });

  it('keeps the thumbnail when the preview fails to load', () => {
    const { card, preview } = renderCard();
    fireEvent.mouseEnter(card);
    fireEvent.error(preview);
    expect(thumb()).toBeInTheDocument();
    expect(preview.className).toContain('opacity-0');
  });
});
