/**
 * useFilterWorker
 * Hook for using the filter worker for heavy image processing
 */

import { useRef, useCallback, useEffect } from 'react';

type FilterType =
  | 'gaussianBlur'
  | 'motionBlur'
  | 'sharpen'
  | 'unsharpMask'
  | 'addNoise'
  | 'reduceNoise'
  | 'vignette'
  | 'pixelate'
  | 'emboss'
  | 'edgeDetect'
  | 'posterize'
  | 'invert'
  | 'grayscale'
  | 'sepia';

interface FilterParams {
  radius?: number;
  angle?: number;
  distance?: number;
  amount?: number;
  threshold?: number;
  noiseAmount?: number;
  monochrome?: boolean;
  strength?: number;
  vignetteAmount?: number;
  vignetteSize?: number;
  blockSize?: number;
  embossStrength?: number;
  embossAngle?: number;
  levels?: number;
}

interface PendingRequest {
  resolve: (result: ImageData) => void;
  reject: (error: Error) => void;
}

export function useFilterWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map());
  const requestIdRef = useRef(0);

  // Initialize worker
  useEffect(() => {
    // Capture the pending map into a local so the cleanup uses the same
    // reference even if the component's ref slot rotates (per React guidance
    // for ref-cleanup patterns).
    const pendingMap = pendingRef.current;

    // Create worker
    workerRef.current = new Worker(
      new URL('../workers/filterWorker.ts', import.meta.url),
      { type: 'module' }
    );

    // Handle messages from worker
    workerRef.current.onmessage = (e) => {
      const { type, id, imageData, success, error } = e.data;

      if (type === 'filterResult') {
        const pending = pendingMap.get(id);
        if (pending) {
          if (success) {
            pending.resolve(imageData);
          } else {
            pending.reject(new Error(error || 'Filter failed'));
          }
          pendingMap.delete(id);
        }
      }
    };

    workerRef.current.onerror = (error) => {
      console.error('Filter worker error:', error);
    };

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      pendingMap.clear();
    };
  }, []);

  // Apply filter using worker
  const applyFilter = useCallback(
    (
      canvas: HTMLCanvasElement,
      filter: FilterType,
      params: FilterParams = {}
    ): Promise<ImageData> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current) {
          reject(new Error('Worker not initialized'));
          return;
        }

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const id = `filter-${requestIdRef.current++}`;

        pendingRef.current.set(id, { resolve, reject });

        workerRef.current.postMessage({
          type: 'applyFilter',
          id,
          filter,
          imageData,
          params,
        });
      });
    },
    []
  );

  // Apply filter and update canvas
  const applyFilterToCanvas = useCallback(
    async (
      canvas: HTMLCanvasElement,
      filter: FilterType,
      params: FilterParams = {}
    ): Promise<void> => {
      const result = await applyFilter(canvas, filter, params);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.putImageData(result, 0, 0);
      }
    },
    [applyFilter]
  );

  return {
    applyFilter,
    applyFilterToCanvas,
    isReady: !!workerRef.current,
  };
}

export default useFilterWorker;
