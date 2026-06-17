/**
 * useWaveformAnalyzer — Async audio waveform peak extraction
 *
 * Uses the Web Audio API (AudioContext.decodeAudioData) to extract
 * peak amplitude values from an audio/video URL.
 * Results are memoized by URL so each asset is only analyzed once.
 */

import { useEffect, useRef, useState } from 'react';

// Global cache: url → peak array (persists across component remounts)
const waveformCache = new Map<string, number[]>();
const pendingAnalysis = new Map<string, Promise<number[]>>();

/**
 * Analyze audio peaks from a URL.
 * Returns an array of `sampleCount` normalized peak values (0–1).
 */
async function analyzeWaveform(url: string, sampleCount: number): Promise<number[]> {
  // Return cached result if available
  const key = `${url}:${sampleCount}`;
  const cached = waveformCache.get(key);
  if (cached) return cached;

  // Deduplicate concurrent requests for the same URL+sampleCount
  const pending = pendingAnalysis.get(key);
  if (pending) return pending;

  const promise = (async (): Promise<number[]> => {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();

    const audioContext = new AudioContext();
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    } finally {
      await audioContext.close();
    }

    // Use first channel
    const channelData = audioBuffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channelData.length / sampleCount));
    const peaks: number[] = [];

    for (let i = 0; i < sampleCount; i++) {
      let max = 0;
      const start = i * blockSize;
      const end = Math.min(start + blockSize, channelData.length);
      for (let j = start; j < end; j++) {
        const abs = Math.abs(channelData[j]);
        if (abs > max) max = abs;
      }
      peaks.push(max);
    }

    // Normalize: divide by global max so tallest bar = 1.0
    const globalMax = Math.max(...peaks, 1e-6);
    const normalized = peaks.map((p) => p / globalMax);

    waveformCache.set(key, normalized);
    pendingAnalysis.delete(key);
    return normalized;
  })();

  pendingAnalysis.set(key, promise);
  return promise;
}

/**
 * React hook that returns the waveform peaks for a given audio/video URL.
 *
 * @param url       URL to analyze (blob URL or HTTP URL)
 * @param sampleCount  Number of peak samples to extract (default: 100)
 * @returns `{ peaks, isLoading, error }`
 */
export function useWaveformAnalyzer(
  url: string | null | undefined,
  sampleCount = 100
): { peaks: number[] | null; isLoading: boolean; error: Error | null } {
  const [peaks, setPeaks] = useState<number[] | null>(() =>
    url ? (waveformCache.get(`${url}:${sampleCount}`) ?? null) : null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!url) {
      setPeaks(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Already have it in cache
    const cached = waveformCache.get(`${url}:${sampleCount}`);
    if (cached) {
      setPeaks(cached);
      return;
    }

    cancelledRef.current = false;
    setIsLoading(true);
    setError(null);

    analyzeWaveform(url, sampleCount)
      .then((result) => {
        if (!cancelledRef.current) {
          setPeaks(result);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelledRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        }
      });

    return () => {
      cancelledRef.current = true;
    };
  }, [url, sampleCount]);

  return { peaks, isLoading, error };
}

/**
 * Imperatively analyze a waveform without a React component.
 * Useful for store-level or service calls.
 */
export { analyzeWaveform };
