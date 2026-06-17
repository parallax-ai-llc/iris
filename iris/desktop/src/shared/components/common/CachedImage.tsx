/**
 * CachedImage Component
 * 
 * Displays images with automatic caching for encrypted assets.
 * Falls back to direct URL for non-encrypted content.
 */

import { memo, useState } from 'react';
import { useCachedAssetUrl, needsCaching } from '@/shared/hooks/useCachedAssetUrl';
import { cn } from '@/shared/lib/utils';
import type { IrisAsset } from '@/shared/api/types';

interface CachedImageProps {
  asset: IrisAsset;
  type?: 'preview' | 'thumbnail';
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
  onLoad?: () => void;
  onError?: () => void;
}

export const CachedImage = memo(function CachedImage({
  asset,
  type = 'thumbnail',
  alt,
  className,
  fallback,
  onLoad,
  onError,
}: CachedImageProps) {
  const [imgError, setImgError] = useState(false);
  
  // Determine if we need to use caching
  const directUrl = type === 'thumbnail'
    ? (asset.thumbnailUrl || asset.previewUrl || asset.publicUrl)
    : (asset.previewUrl || asset.publicUrl);
  
  const shouldCache = needsCaching(directUrl);
  
  // Use caching hook only if needed
  const { url: cachedUrl, isLoading } = useCachedAssetUrl(
    shouldCache ? asset : null,
    { type, enabled: shouldCache }
  );
  
  // Final URL to use
  const imageUrl = shouldCache ? cachedUrl : directUrl;
  
  // Handle loading state
  if (shouldCache && isLoading) {
    return (
      <div className={cn('animate-pulse bg-zinc-700', className)}>
        {fallback}
      </div>
    );
  }
  
  // Handle error or no URL
  if (imgError || !imageUrl) {
    return (
      <div className={cn('flex items-center justify-center bg-zinc-800', className)}>
        {fallback}
      </div>
    );
  }
  
  return (
    <img
      src={imageUrl}
      alt={alt || asset.name}
      className={className}
      loading="lazy"
      onLoad={onLoad}
      onError={() => {
        setImgError(true);
        onError?.();
      }}
    />
  );
});

/**
 * CachedVideo Component
 * 
 * Displays video thumbnails/previews with caching
 */
interface CachedVideoProps {
  asset: IrisAsset;
  type?: 'preview' | 'thumbnail';
  className?: string;
  fallback?: React.ReactNode;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}

export const CachedVideo = memo(function CachedVideo({
  asset,
  type = 'thumbnail',
  className,
  fallback,
  autoPlay = false,
  muted = true,
  loop = false,
  controls = false,
  onLoad,
  onError,
}: CachedVideoProps) {
  const [videoError, setVideoError] = useState(false);

  // For video preview/playback (hooks must run unconditionally)
  const directUrl = asset.previewUrl || asset.publicUrl;
  const shouldCache = type !== 'thumbnail' && needsCaching(directUrl);

  const { url: cachedUrl, isLoading } = useCachedAssetUrl(
    shouldCache ? asset : null,
    { type: 'preview', enabled: shouldCache }
  );

  // For thumbnails, use image display
  if (type === 'thumbnail') {
    return (
      <CachedImage
        asset={asset}
        type="thumbnail"
        className={className}
        fallback={fallback}
        onLoad={onLoad}
        onError={onError}
      />
    );
  }
  
  const videoUrl = shouldCache ? cachedUrl : directUrl;
  
  if (shouldCache && isLoading) {
    return (
      <div className={cn('animate-pulse bg-zinc-700', className)}>
        {fallback}
      </div>
    );
  }
  
  if (videoError || !videoUrl) {
    return (
      <div className={cn('flex items-center justify-center bg-zinc-800', className)}>
        {fallback}
      </div>
    );
  }
  
  return (
    <video
      src={videoUrl}
      className={className}
      autoPlay={autoPlay}
      muted={muted}
      loop={loop}
      controls={controls}
      onLoadedData={onLoad}
      onError={() => {
        setVideoError(true);
        onError?.();
      }}
    />
  );
});
