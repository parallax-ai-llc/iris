/**
 * VideoCard hover preview: the thumbnail must stay visible until the preview
 * video can paint a frame, and must stay for good if the preview fails.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { IrisAsset } from '@/shared/api/types';

vi.mock('@/shared/hooks/useCachedAssetUrl', () => ({
  useCachedAssetUrl: () => ({ url: null, isLoading: false, error: null }),
}));

import { VideoCard } from '../VideoCard';

function makeVideo(overrides: Partial<IrisAsset> = {}): IrisAsset {
  return {
    id: 'vid-1',
    userId: 'u1',
    name: 'clip.mp4',
    storagePath: 'x',
    currentVersion: 1,
    assetType: 'VIDEO',
    mimeType: 'video/mp4',
    sizeBytes: 100,
    isPublic: false,
    processingStatus: 'READY',
    thumbnailUrl: 'http://example.test/thumb.jpg',
    previewUrl: 'http://example.test/preview.mp4',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  } as IrisAsset;
}

function renderCard(video = makeVideo()) {
  const utils = render(
    <VideoCard video={video} onClick={vi.fn()} onDownload={vi.fn()} onDelete={vi.fn()} />
  );
  const card = utils.container.firstElementChild as HTMLElement;
  const preview = screen.getByTestId('video-card-preview') as HTMLVideoElement;
  return { ...utils, card, preview };
}

const thumb = () => screen.queryByAltText('clip.mp4');

describe('VideoCard hover preview', () => {
  let playSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the thumbnail and hides the preview when not hovering', () => {
    const { preview } = renderCard();
    expect(thumb()).toBeInTheDocument();
    expect(preview.className).toContain('opacity-0');
  });

  it('keeps the thumbnail while hovering until the video has a frame', () => {
    const { card, preview } = renderCard();
    fireEvent.mouseEnter(card);

    expect(playSpy).toHaveBeenCalled();
    expect(thumb()).toBeInTheDocument();
    expect(preview.className).toContain('opacity-0');

    fireEvent.loadedData(preview);
    expect(thumb()).not.toBeInTheDocument();
    expect(preview.className).not.toContain('opacity-0');
  });

  it('canplay also reveals the preview', () => {
    const { card, preview } = renderCard();
    fireEvent.mouseEnter(card);
    fireEvent.canPlay(preview);
    expect(preview.className).not.toContain('opacity-0');
  });

  it('keeps the thumbnail when the preview fails to load', () => {
    const { card, preview } = renderCard();
    fireEvent.mouseEnter(card);
    fireEvent.error(preview);

    expect(thumb()).toBeInTheDocument();
    expect(preview.className).toContain('opacity-0');

    // A late loadeddata after an error doesn't flip the card to the broken video.
    fireEvent.loadedData(preview);
    expect(thumb()).toBeInTheDocument();
  });

  it('returns to the thumbnail when the pointer leaves', () => {
    const { card, preview } = renderCard();
    fireEvent.mouseEnter(card);
    fireEvent.loadedData(preview);
    expect(thumb()).not.toBeInTheDocument();

    fireEvent.mouseLeave(card);
    expect(thumb()).toBeInTheDocument();
    expect(preview.className).toContain('opacity-0');
  });

  it('shows the film fallback (not a blank card) when there is no thumbnail and the preview fails', () => {
    const { card, preview, container } = renderCard(makeVideo({ thumbnailUrl: undefined, previewUrl: undefined, publicUrl: 'http://example.test/v.mp4' }));
    fireEvent.mouseEnter(card);
    fireEvent.error(preview);
    expect(container.querySelector('.lucide-film')).not.toBeNull();
  });
});
