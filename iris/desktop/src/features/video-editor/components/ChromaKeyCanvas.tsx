/**
 * ChromaKeyCanvas - Canvas-based chroma-key (green/blue screen) rendering
 *
 * Overlays a transparent canvas on top of the video element and processes
 * each frame. Uses a Web Worker for pixel processing to keep the main thread
 * free. Falls back to main-thread processing if Worker is unavailable.
 */

import { memo, useRef, useEffect, useCallback } from 'react';

interface ChromaKeyCanvasProps {
  videoElement: HTMLVideoElement | null;
  enabled: boolean;
  /** Key color as a 6-digit hex string, e.g. '#00FF00' */
  keyColor: string;
  /** 0-100: how close a pixel must be to the key color to be removed */
  similarity: number;
  /** 0-100: width of the soft-edge transition band */
  smoothness: number;
  /** 0-100: how aggressively to suppress color spill on edge pixels */
  spillReduction: number;
  className?: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '').padEnd(6, '0');
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return [
    Number.isNaN(r) ? 0 : r,
    Number.isNaN(g) ? 0 : g,
    Number.isNaN(b) ? 0 : b,
  ];
}

const MAX_DIST = 441.67; // sqrt(255^2 * 3)

/** Euclidean distance in RGB colour space */
function colorDistance(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number,
): number {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** Main-thread fallback for pixel processing */
function processPixels(
  data: Uint8ClampedArray,
  kr: number, kg: number, kb: number,
  threshold: number, smoothBand: number, spillFactor: number,
) {
  const greenDom = kg >= kr && kg >= kb;
  const blueDom = !greenDom && kb >= kr;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const dist = colorDistance(r, g, b, kr, kg, kb);

    if (dist < threshold) {
      data[i + 3] = 0;
    } else if (smoothBand > 0 && dist < threshold + smoothBand) {
      const edgeProgress = (dist - threshold) / smoothBand;
      data[i + 3] = Math.round(edgeProgress * 255);

      if (spillFactor > 0) {
        const spillAmount = (1 - edgeProgress) * spillFactor;
        if (greenDom) {
          const target = Math.max(r, b);
          data[i + 1] = Math.round(g - (g - target) * spillAmount);
        } else if (blueDom) {
          const target = Math.max(r, g);
          data[i + 2] = Math.round(b - (b - target) * spillAmount);
        }
      }
    }
  }
}

export const ChromaKeyCanvas = memo(function ChromaKeyCanvas({
  videoElement,
  enabled,
  keyColor,
  similarity,
  smoothness,
  spillReduction,
  className,
}: ChromaKeyCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const workerRef = useRef<Worker | null>(null);
  const processingRef = useRef(false);

  const paramsRef = useRef({ keyColor, similarity, smoothness, spillReduction });
  useEffect(() => {
    paramsRef.current = { keyColor, similarity, smoothness, spillReduction };
  }, [keyColor, similarity, smoothness, spillReduction]);

  // Initialize worker
  useEffect(() => {
    if (!enabled) return;
    try {
      const worker = new Worker(
        new URL('../workers/chromaKeyWorker.ts', import.meta.url),
        { type: 'module' },
      );
      workerRef.current = worker;
      return () => {
        worker.terminate();
        workerRef.current = null;
        processingRef.current = false;
        if (offscreenRef.current) {
          offscreenRef.current.width = 0;
          offscreenRef.current.height = 0;
          offscreenRef.current = null;
        }
      };
    } catch {
      // Worker not available — will use main-thread fallback
      workerRef.current = null;
    }
  }, [enabled]);

  const processFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoElement;

    if (!canvas || !video) {
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }

    // Skip frame if worker is still processing previous one
    if (processingRef.current && workerRef.current) {
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const displayWidth = video.videoWidth || video.offsetWidth || canvas.width;
    const displayHeight = video.videoHeight || video.offsetHeight || canvas.height;

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
    }

    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement('canvas');
    }
    const offscreen = offscreenRef.current;
    if (offscreen.width !== displayWidth || offscreen.height !== displayHeight) {
      offscreen.width = displayWidth;
      offscreen.height = displayHeight;
    }

    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!offCtx || !ctx) {
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }

    offCtx.drawImage(video, 0, 0, displayWidth, displayHeight);
    const imageData = offCtx.getImageData(0, 0, displayWidth, displayHeight);

    const { keyColor: kc, similarity: sim, smoothness: smooth, spillReduction: spill } =
      paramsRef.current;
    const keyRgb = hexToRgb(kc);
    const threshold = (sim / 100) * MAX_DIST;
    const smoothBand = (smooth / 100) * MAX_DIST * 0.5;
    const spillFactor = spill / 100;

    const worker = workerRef.current;
    if (worker) {
      // Worker path: transfer buffer (zero-copy)
      processingRef.current = true;

      worker.onmessage = (e: MessageEvent) => {
        if (e.data.type === 'result') {
          processingRef.current = false;
          const resultData = new Uint8ClampedArray(e.data.buffer);
          const result = new ImageData(resultData, displayWidth, displayHeight);
          ctx.clearRect(0, 0, displayWidth, displayHeight);
          ctx.putImageData(result, 0, 0);
        }
      };

      const buffer = imageData.data.buffer.slice(0);
      worker.postMessage(
        {
          type: 'process',
          buffer,
          width: displayWidth,
          height: displayHeight,
          keyColor: keyRgb,
          threshold,
          smoothBand,
          spillFactor,
        },
        [buffer],
      );
    } else {
      // Main-thread fallback
      processPixels(imageData.data, keyRgb[0], keyRgb[1], keyRgb[2], threshold, smoothBand, spillFactor);
      ctx.clearRect(0, 0, displayWidth, displayHeight);
      ctx.putImageData(imageData, 0, 0);
    }

    rafRef.current = requestAnimationFrame(processFrame);
  }, [videoElement]);

  useEffect(() => {
    if (!enabled || !videoElement) return;

    rafRef.current = requestAnimationFrame(processFrame);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [enabled, videoElement, processFrame]);

  // Cleanup offscreen canvas on unmount
  useEffect(() => {
    return () => {
      offscreenRef.current = null;
    };
  }, []);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        objectFit: 'contain',
      }}
    />
  );
});

export default ChromaKeyCanvas;
