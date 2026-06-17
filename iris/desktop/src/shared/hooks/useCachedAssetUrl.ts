/**
 * Hook for cached asset URLs
 * Provides blob URLs for assets with automatic caching
 */

import { useState, useEffect, useRef } from 'react';
import { getCachedAssetUrl, getCachedAssetUrlById } from '@/shared/api/asset.api';
import type { IrisAsset } from '@/shared/api/types';

interface UseCachedAssetUrlOptions {
  type?: 'preview' | 'thumbnail';
  enabled?: boolean;
}

interface UseCachedAssetUrlResult {
  url: string | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to get cached blob URL for an asset
 * Automatically handles loading state and caching
 */
export function useCachedAssetUrl(
  asset: IrisAsset | null | undefined,
  options: UseCachedAssetUrlOptions = {}
): UseCachedAssetUrlResult {
  const { type = 'thumbnail', enabled = true } = options;
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!asset || !enabled) {
      setUrl(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Use existing URLs if available and not requiring cache
    const existingUrl = type === 'thumbnail' 
      ? (asset.thumbnailUrl || asset.previewUrl || asset.publicUrl)
      : (asset.previewUrl || asset.publicUrl);

    // If URL is a direct URL (http/https, blob, file, data), use it directly without fetching
    if (existingUrl && (existingUrl.startsWith('http') || existingUrl.startsWith('blob:') || existingUrl.startsWith('file:') || existingUrl.startsWith('data:'))) {
      setUrl(existingUrl);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Otherwise, fetch and cache
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getCachedAssetUrl(asset, type)
      .then((blobUrl) => {
        if (!cancelled && mountedRef.current) {
          setUrl(blobUrl);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled && mountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // Re-fetch is keyed on asset id + updatedAt, not the asset object reference,
    // so we intentionally exclude `asset` to avoid spurious re-fetches when the
    // asset object identity changes without underlying data changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.id, asset?.updatedAt, type, enabled]);

  return { url, isLoading, error };
}

/**
 * Hook to get cached blob URL by asset ID
 * Use when full asset object is not available
 */
export function useCachedAssetUrlById(
  assetId: string | null | undefined,
  mimeType: string,
  options: UseCachedAssetUrlOptions = {}
): UseCachedAssetUrlResult {
  const { type = 'thumbnail', enabled = true } = options;
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!assetId || !enabled) {
      setUrl(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    // If assetId is itself a direct URL (blob, file, http), use it directly
    if (assetId.startsWith('blob:') || assetId.startsWith('file:') || assetId.startsWith('http')) {
      setUrl(assetId);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getCachedAssetUrlById(assetId, mimeType, type)
      .then((blobUrl) => {
        if (!cancelled && mountedRef.current) {
          setUrl(blobUrl);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled && mountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [assetId, mimeType, type, enabled]);

  return { url, isLoading, error };
}

/**
 * Helper to determine if asset URL needs caching
 * Returns true if URL is an API route (not a direct http URL)
 */
export function needsCaching(url: string | null | undefined): boolean {
  if (!url) return true;
  return !url.startsWith('http');
}
