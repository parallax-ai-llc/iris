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

// A single shared AudioContext for decoding. Creating one per analysis exhausts the
// browser's small per-page AudioContext budget (~6), which starves the preview
// player's own context (AudioPlayer) and makes playback silent. We only decode here
// (never connect nodes / produce sound), so one reusable, never-closed context is
// enough and stays effectively idle.
let sharedDecodeContext: AudioContext | null = null;
function getDecodeContext(): AudioContext {
  if (!sharedDecodeContext || sharedDecodeContext.state === 'closed') {
    sharedDecodeContext = new AudioContext();
  }
  return sharedDecodeContext;
}

// Concurrency-limited, priority-aware scheduler. Decoding audio is heavy (a full
// fetch + decodeAudioData per source), so running one per visible clip at once spikes
// memory and CPU. We cap concurrent decodes and let higher-priority requests (the
// selected / on-screen clips) jump the queue, so the part the user is looking at
// resolves first and the rest fills in the background.
const MAX_CONCURRENT_ANALYSES = 2;
let activeAnalyses = 0;
interface QueuedTask {
  priority: number;
  start: () => void;
}
const taskQueue: QueuedTask[] = [];

function drainQueue(): void {
  while (activeAnalyses < MAX_CONCURRENT_ANALYSES && taskQueue.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < taskQueue.length; i++) {
      if (taskQueue[i].priority > taskQueue[bestIdx].priority) bestIdx = i;
    }
    const [task] = taskQueue.splice(bestIdx, 1);
    activeAnalyses++;
    task.start();
  }
}

function schedule<T>(priority: number, work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    taskQueue.push({
      priority,
      start: () => {
        work()
          .then(resolve, reject)
          .finally(() => {
            activeAnalyses--;
            drainQueue();
          });
      },
    });
    drainQueue();
  });
}

/**
 * Analyze audio peaks from a URL.
 * Returns an array of `sampleCount` normalized peak values (0–1).
 * Higher `priority` requests run ahead of lower-priority ones in the queue.
 */
async function analyzeWaveform(url: string, sampleCount: number, priority = 0): Promise<number[]> {
  // Return cached result if available
  const key = `${url}:${sampleCount}`;
  const cached = waveformCache.get(key);
  if (cached) return cached;

  // Deduplicate concurrent requests for the same URL+sampleCount
  const pending = pendingAnalysis.get(key);
  if (pending) return pending;

  const promise = schedule(priority, async (): Promise<number[]> => {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();

    // Reuse one shared context; decodeAudioData copies the data so it's never closed.
    const audioBuffer = await getDecodeContext().decodeAudioData(arrayBuffer);

    // Use first channel
    const channelData = audioBuffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channelData.length / sampleCount));
    const peaks: number[] = new Array(sampleCount);

    // Per-block max + running global max in one pass. NOTE: never use
    // Math.max(...peaks) — spreading a large array (50k–180k samples at high
    // resolution) overflows the call stack with RangeError and the analysis fails.
    let globalMax = 1e-6;
    for (let i = 0; i < sampleCount; i++) {
      let max = 0;
      const start = i * blockSize;
      const end = Math.min(start + blockSize, channelData.length);
      for (let j = start; j < end; j++) {
        const abs = Math.abs(channelData[j]);
        if (abs > max) max = abs;
      }
      peaks[i] = max;
      if (max > globalMax) globalMax = max;
    }

    // Normalize: divide by global max so tallest bar = 1.0
    for (let i = 0; i < sampleCount; i++) peaks[i] /= globalMax;

    waveformCache.set(key, peaks);
    return peaks;
  }).finally(() => {
    // Clear the pending marker on both success and failure so a transient error
    // (e.g. a momentary fetch/decode hiccup) can be retried instead of poisoning
    // the URL for the rest of the session.
    pendingAnalysis.delete(key);
  });

  pendingAnalysis.set(key, promise);
  return promise;
}

/**
 * Extract peaks out-of-process via the Electron main process (ffmpeg streaming).
 * Used for long sources that would OOM the in-renderer Web Audio decode. `src` must be
 * a file path, file:// URL, or http(s) URL the main process can read directly.
 */
async function analyzeWaveformViaMain(src: string, sampleCount: number, priority = 0): Promise<number[]> {
  const key = `main:${src}:${sampleCount}`;
  const cached = waveformCache.get(key);
  if (cached) return cached;
  const pending = pendingAnalysis.get(key);
  if (pending) return pending;

  const api = typeof window !== 'undefined' ? window.electronAPI?.waveform : undefined;
  if (!api?.extractPeaks) throw new Error('Native waveform extractor unavailable');

  const promise = schedule(priority, async (): Promise<number[]> => {
    const res = await api.extractPeaks({ src, sampleCount });
    if (!res?.success || !Array.isArray(res.peaks) || res.peaks.length === 0) {
      throw new Error(res?.error || 'Native waveform extraction failed');
    }
    waveformCache.set(key, res.peaks);
    return res.peaks;
  }).finally(() => pendingAnalysis.delete(key));

  pendingAnalysis.set(key, promise);
  return promise;
}

// Above this source duration we refuse the in-browser Web Audio path: decodeAudioData
// must hold the ENTIRE decoded PCM in memory at once (~10MB per minute, mono), so an
// hours-long source would spike multiple GB and crash the renderer. Such sources are
// handled out-of-process (ffmpeg streaming) instead; here we simply skip to avoid OOM.
export const MAX_WEB_DECODE_SECONDS = 900; // 15 min

interface UseWaveformAnalyzerOptions {
  /** Higher = analyzed sooner (e.g. selected/visible clips). Default 0. */
  priority?: number;
  /** Source media duration (s); used to skip the OOM-prone web decode on long files. */
  sourceDuration?: number;
  /**
   * ffmpeg-readable source (file path / file:// / http(s) URL) used for long sources
   * via the main process. When the source is too long for web decode and this is
   * absent, no waveform is produced (a placeholder is shown instead).
   */
  mainSrc?: string | null;
}

/**
 * React hook that returns the waveform peaks for a given audio/video URL.
 *
 * @param url          URL to analyze (blob URL or HTTP URL)
 * @param sampleCount  Number of peak samples to extract (default: 100)
 * @returns `{ peaks, isLoading, error, tooLongForWebDecode }`
 */
export function useWaveformAnalyzer(
  url: string | null | undefined,
  sampleCount = 100,
  options: UseWaveformAnalyzerOptions = {}
): { peaks: number[] | null; isLoading: boolean; error: Error | null; tooLongForWebDecode: boolean } {
  const { priority = 0, sourceDuration, mainSrc } = options;
  const tooLongForWebDecode = !!sourceDuration && sourceDuration > MAX_WEB_DECODE_SECONDS;

  const [peaks, setPeaks] = useState<number[] | null>(() =>
    url ? (waveformCache.get(`${url}:${sampleCount}`) ?? null) : null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    const onResult = (result: number[]) => {
      if (!cancelledRef.current) { setPeaks(result); setIsLoading(false); }
    };
    const onError = (err: unknown) => {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      }
    };

    // Long source → out-of-process ffmpeg extraction (avoids the renderer OOM).
    if (tooLongForWebDecode) {
      if (!mainSrc) {
        setPeaks(null);
        setIsLoading(false);
        setError(null);
        return;
      }
      const cached = waveformCache.get(`main:${mainSrc}:${sampleCount}`);
      if (cached) {
        setPeaks(cached);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      analyzeWaveformViaMain(mainSrc, sampleCount, priority).then(onResult, onError);
      return () => { cancelledRef.current = true; };
    }

    // Short source → in-renderer Web Audio decode.
    if (!url) {
      setPeaks(null);
      setIsLoading(false);
      setError(null);
      return;
    }
    const cached = waveformCache.get(`${url}:${sampleCount}`);
    if (cached) {
      setPeaks(cached);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    analyzeWaveform(url, sampleCount, priority).then(onResult, onError);

    return () => {
      cancelledRef.current = true;
    };
  }, [url, sampleCount, priority, tooLongForWebDecode, mainSrc]);

  return { peaks, isLoading, error, tooLongForWebDecode };
}

/**
 * Imperatively analyze a waveform without a React component.
 * Useful for store-level or service calls.
 */
export { analyzeWaveform };
