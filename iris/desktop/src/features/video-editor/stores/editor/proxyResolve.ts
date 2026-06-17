/**
 * Proxy-aware playback path resolver.
 *
 * Single source of truth for "what URL should the player point at for this
 * asset?" All video playback consumers (preview, multicam monitor, etc.)
 * should call this hook so the proxy/original swap stays consistent.
 *
 * Rules:
 *   - Proxy mode OFF → return assetId unchanged (caller falls back to the
 *     cached asset URL pipeline).
 *   - Proxy mode ON AND a local proxy file is known → return an
 *     `http://127.0.0.1:<port>/?path=...` URL served by the Electron local
 *     media server. We can NOT return `file://` URLs to <video> directly
 *     because Electron blocks them when webSecurity is on, and they don't
 *     support HTTP range requests via the standard handler. The local
 *     server already implements byte-range streaming for seeking.
 *
 * Export and caption generation must NOT use this hook — they need the
 * original master. They should keep reading `assetPaths` directly.
 */

import { useEffect, useState } from 'react';
import { useEditorStore } from '@/features/video-editor/stores/editor.store';
import { toLocalMediaUrl } from '@/features/video-editor/components/modals/localMediaUrl';

/**
 * Returns the asset id (or a local media HTTP URL) that the playback layer
 * should consume. Re-resolves whenever the asset, proxyMode, or this
 * asset's proxy path changes. Returns the original assetId until the
 * local URL has been fetched (the resolver is sync-friendly: while the
 * URL is loading, playback falls back to the original).
 */
export function useProxyAwareAssetId(
  assetId: string | null | undefined,
): string | null | undefined {
  // Slice subscription so we only re-render when something relevant changes
  const proxyMode = useEditorStore((s) => s.proxyMode);
  const proxyPath = useEditorStore((s) => (assetId ? s.proxyPaths.get(assetId) : undefined));

  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!assetId || !proxyMode || !proxyPath) {
      setResolvedUrl(null);
      return;
    }
    toLocalMediaUrl(proxyPath)
      .then((url) => {
        if (!cancelled) setResolvedUrl(url);
      })
      .catch(() => {
        if (!cancelled) setResolvedUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, proxyMode, proxyPath]);

  if (!assetId) return assetId;
  if (proxyMode && proxyPath && resolvedUrl) return resolvedUrl;
  return assetId;
}
