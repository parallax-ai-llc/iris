/**
 * useHoverVideoPreview - hover-to-play preview for gallery cards.
 *
 * A card shows its thumbnail until the preview video can actually paint a
 * frame (loadeddata / canplay). If the video never gets there (still loading,
 * network failure, unsupported source) the thumbnail stays — the card never
 * goes blank. Readiness and error reset whenever the source changes (e.g. the
 * cached preview URL replaces the direct URL once hovering starts).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface HoverVideoPreview {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** True only while active AND the video has a frame to show. */
  showVideo: boolean;
  /** The current source failed to load. */
  hasError: boolean;
  /** Spread onto the <video> element. */
  videoHandlers: {
    onLoadedData: () => void;
    onCanPlay: () => void;
    onError: () => void;
  };
}

export function useHoverVideoPreview(src: string | null | undefined, active: boolean): HoverVideoPreview {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [trackedSrc, setTrackedSrc] = useState(src);

  // New source → previous readiness/error no longer applies.
  if (src !== trackedSrc) {
    setTrackedSrc(src);
    setIsReady(false);
    setHasError(false);
  }

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (active && !hasError) {
      try {
        el.currentTime = 0;
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch(() => {
          // Ignore play errors (autoplay policy, aborted load)
        });
      } catch {
        // play() not available (e.g. test env) — preview just stays on thumbnail
      }
    } else {
      try {
        el.pause();
        el.currentTime = 0;
      } catch {
        // ignore
      }
    }
  }, [active, hasError, src]);

  const markReady = useCallback(() => setIsReady(true), []);
  const markError = useCallback(() => setHasError(true), []);

  return {
    videoRef,
    showVideo: active && isReady && !hasError,
    hasError,
    videoHandlers: { onLoadedData: markReady, onCanPlay: markReady, onError: markError },
  };
}
