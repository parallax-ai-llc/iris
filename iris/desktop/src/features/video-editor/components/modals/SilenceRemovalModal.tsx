/**
 * SilenceRemovalModal — Client-side silence detection and removal using FFmpeg
 *
 * Multi-step flow:
 * Step 1: Configure threshold and minimum silence duration
 * Step 2: (Conditional) Confirm media merge if multi-clip or has additional tracks
 * Step 3: Review detected silent segments → Remove silence
 */

import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import {
  X,
  Volume2,
  VolumeX,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  AlertTriangle,
  CheckSquare,
  Square,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { formatTime } from '@/shared/lib/utils/time';
import { useEditorStore, type VideoClip } from '@/features/video-editor/stores/editor.store';
import { buildExportRequest } from '@/features/video-editor/lib/buildExportRequest';
import { useVideoProjectStore } from '@/features/video-editor/stores/videoProject.store';
import { toLocalMediaUrl } from './localMediaUrl';
import { probeVideoFile } from '@/features/video-editor/lib/probeMediaFile';
import { useTranslation } from 'react-i18next';

// ==================== Types ====================

interface SilentSegment {
  start: number;
  end: number;
  duration: number;
}

interface SilenceRemovalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ==================== Helpers ====================

const formatTimePadded = (seconds: number) => formatTime(seconds, { padMinutes: true });

// ==================== Component ====================

export const SilenceRemovalModal = memo(function SilenceRemovalModal({
  isOpen,
  onClose,
}: SilenceRemovalModalProps) {
  // Step state
  const [step, setStep] = useState<'configure' | 'merge-confirm' | 'review'>('configure');

  // Step 1: Configuration
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [noiseThresholdDb, setNoiseThresholdDb] = useState(-30);
  const [minSilenceDuration, setMinSilenceDuration] = useState(0.5);
  const [padding, setPadding] = useState(0.05);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [autoThresholdInfo, setAutoThresholdInfo] = useState<{ threshold: number; mean: number } | null>(null);

  // Detection state
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [silentSegments, setSilentSegments] = useState<SilentSegment[]>([]);
  // Which detected silent segments the user has chosen to remove (by index).
  // Unselected segments are kept in the output.
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [totalDuration, setTotalDuration] = useState(0);

  // Processing state
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeProgress, setRemoveProgress] = useState(0);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeSuccess, setRemoveSuccess] = useState(false);

  // Merge state
  const [isMerging, setIsMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState(0);
  const [mergedFilePath, setMergedFilePath] = useState<string | null>(null);

  // Resolve input file path (could be from merge or single clip)
  const [inputFilePath, setInputFilePath] = useState<string | null>(null);

  const { t } = useTranslation('menus');

  // Determine timeline state
  const tracks = useEditorStore((s) => s.tracks);
  const setClientProcessing = useEditorStore((s) => s.setClientProcessing);

  const videoClips = useMemo(() => {
    return tracks
      .filter((t) => t.type === 'video' && !t.muted)
      .flatMap((t) => t.clips)
      .filter((c): c is VideoClip => c.type === 'video') as VideoClip[];
  }, [tracks]);

  const isMultiClip = videoClips.length > 1;

  const hasAdditionalTracks = useMemo(() => {
    const hasAudioClips = tracks
      .filter((t) => (t.type === 'audio' || t.type === 'music') && !t.muted)
      .some((t) => t.clips.length > 0);
    const hasSubtitleClips = tracks
      .filter((t) => t.type === 'subtitle')
      .some((t) => t.clips.length > 0);
    return hasAudioClips || hasSubtitleClips;
  }, [tracks]);

  const needsMerge = isMultiClip || hasAdditionalTracks;

  // Merge confirmation message
  const mergeMessage = useMemo(() => {
    if (isMultiClip) {
      return t('silenceRemovalModal.mergeMessageMultiClip');
    }
    if (hasAdditionalTracks) {
      return t('silenceRemovalModal.mergeMessageAdditionalTracks');
    }
    return '';
  }, [isMultiClip, hasAdditionalTracks, t]);

  // Only the silent segments the user chose to remove are cut out; the rest
  // are kept as part of the output (treated as non-silent).
  const selectedSilentSegments = useMemo(
    () => silentSegments.filter((_, i) => selectedIndices.has(i)),
    [silentSegments, selectedIndices]
  );

  // Calculate non-silent (kept) segments from the SELECTED silent segments
  const nonSilentSegments = useMemo(() => {
    if (selectedSilentSegments.length === 0 || totalDuration === 0) return [];

    const sorted = [...selectedSilentSegments].sort((a, b) => a.start - b.start);
    const segments: Array<{ start: number; end: number }> = [];

    let cursor = 0;
    for (const seg of sorted) {
      const silenceStart = Math.max(0, seg.start - padding);
      const silenceEnd = Math.min(totalDuration, seg.end + padding);

      if (cursor < silenceStart) {
        segments.push({ start: cursor, end: silenceStart });
      }
      cursor = silenceEnd;
    }

    if (cursor < totalDuration) {
      segments.push({ start: cursor, end: totalDuration });
    }

    return segments;
  }, [selectedSilentSegments, totalDuration, padding]);

  // Silence actually being removed = sum of the selected segments' durations.
  const totalSilenceDuration = useMemo(
    () => selectedSilentSegments.reduce((sum, seg) => sum + seg.duration, 0),
    [selectedSilentSegments]
  );

  const estimatedOutputDuration = useMemo(
    () => nonSilentSegments.reduce((sum, seg) => sum + (seg.end - seg.start), 0),
    [nonSilentSegments]
  );

  const toggleSegment = useCallback((idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const allSelected = silentSegments.length > 0 && selectedIndices.size === silentSegments.length;

  const toggleSelectAll = useCallback(() => {
    setSelectedIndices((prev) =>
      prev.size === silentSegments.length
        ? new Set()
        : new Set(silentSegments.map((_, i) => i))
    );
  }, [silentSegments]);

  // Processing flag for window close protection
  const isProcessing = isDetecting || isRemoving || isMerging || isAnalyzing;

  /**
   * In auto mode, run volumedetect on the input file and derive a threshold
   * adapted to the source. Heuristic: mean_volume - 6 dB, clamped to [-50, -18].
   * This adapts to quiet speakers (where -30 dB cuts off real speech) and
   * loud sources alike.
   */
  const resolveThreshold = useCallback(async (filePath: string): Promise<number | null> => {
    if (mode === 'manual') return noiseThresholdDb;
    if (!window.electronAPI?.silenceRemoval?.analyze) return noiseThresholdDb;

    setIsAnalyzing(true);
    try {
      const result = await window.electronAPI.silenceRemoval.analyze({ inputPath: filePath });
      if (!result.success || result.meanVolume === undefined) {
        // Fallback to current value
        return noiseThresholdDb;
      }
      const mean = result.meanVolume;
      const raw = mean - 6;
      const clamped = Math.max(-50, Math.min(-18, Math.round(raw)));
      setAutoThresholdInfo({ threshold: clamped, mean: Math.round(mean * 10) / 10 });
      setNoiseThresholdDb(clamped);
      return clamped;
    } catch {
      return noiseThresholdDb;
    } finally {
      setIsAnalyzing(false);
    }
  }, [mode, noiseThresholdDb]);

  useEffect(() => {
    setClientProcessing(isProcessing);
    return () => {
      setClientProcessing(false);
    };
  }, [isProcessing, setClientProcessing]);

  // Clean up progress listeners on unmount
  useEffect(() => {
    return () => {
      window.electronAPI?.silenceRemoval?.removeProgressListener();
      window.electronAPI?.videoExport?.removeProgressListener();
    };
  }, []);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep('configure');
      setSilentSegments([]);
      setTotalDuration(0);
      setDetectError(null);
      setRemoveError(null);
      setRemoveSuccess(false);
      setInputFilePath(null);
      setMergedFilePath(null);
      setRemoveProgress(0);
      setMergeProgress(0);
      setAutoThresholdInfo(null);
    }
  }, [isOpen]);

  // ==================== Merge Logic ====================

  /**
   * Flatten the whole timeline to a single video by routing it through the
   * SAME export renderer used by the Export modal — so the merged video honors
   * identical text/audio/image/effect rules. We then run silence detection on
   * that file. (Previously this used a separate, divergent FFmpeg merge.)
   */
  const handleMerge = useCallback(async (): Promise<string | null> => {
    if (!window.electronAPI?.videoExport) {
      setDetectError(t('silenceRemovalModal.errors.desktopRequiredMerge'));
      return null;
    }

    setIsMerging(true);
    setMergeProgress(0);

    try {
      const project = useVideoProjectStore.getState().currentProject;
      const width = project?.width || 1920;
      const height = project?.height || 1080;
      const frameRate = project?.frameRate || 30;
      const { tracks: editorTracks, duration } = useEditorStore.getState();
      const authToken = (await window.electronAPI.auth?.getToken?.()) ?? null;

      const request = await buildExportRequest({
        tracks: editorTracks,
        duration,
        width,
        height,
        frameRate,
        format: 'mp4',
        quality: 'high',
        codec: 'h264',
        includeSubtitles: true,
        subtitleFormat: 'burned',
        outputPath: '', // main process renders to a temp file
        authToken,
        range: null,
      });

      // Set up progress listener (export shares the same progress shape)
      window.electronAPI.videoExport.onProgress((data) => {
        setMergeProgress(data.progress);
      });

      const result = await window.electronAPI.videoExport.start(request);

      window.electronAPI.videoExport.removeProgressListener();

      if (!result.success || !result.outputPath) {
        setDetectError(
          t('silenceRemovalModal.errors.mergeFailedPrefix', {
            message: result.error || t('silenceRemovalModal.errors.mergeFailedUnknown'),
          })
        );
        return null;
      }

      setMergedFilePath(result.outputPath);
      setInputFilePath(result.outputPath);
      return result.outputPath;
    } catch (error) {
      console.error('Merge error:', error);
      setDetectError(t('silenceRemovalModal.errors.mergeFailed'));
      return null;
    } finally {
      setIsMerging(false);
    }
  }, [t]);

  // ==================== Detect Logic ====================

  // Run silence detection on an already-resolved (flattened) input file.
  const runDetect = useCallback(async (filePath: string) => {
    if (!window.electronAPI?.silenceRemoval) {
      setDetectError(t('silenceRemovalModal.errors.desktopRequired'));
      return;
    }

    setIsDetecting(true);
    setDetectError(null);

    try {
      window.electronAPI.silenceRemoval.onProgress((_data) => {
        // Progress tracked via detection result
      });

      const threshold = (await resolveThreshold(filePath)) ?? noiseThresholdDb;

      const result = await window.electronAPI.silenceRemoval.detect({
        inputPath: filePath,
        noiseThresholdDb: threshold,
        minSilenceDuration,
      });

      window.electronAPI.silenceRemoval.removeProgressListener();

      if (!result.success) {
        setDetectError(result.error || t('silenceRemovalModal.errors.detectFailed'));
        return;
      }

      if (result.segments.length === 0) {
        setDetectError(t('silenceRemovalModal.errors.noSegments'));
        return;
      }

      setSilentSegments(result.segments);
      // Select every detected segment for removal by default.
      setSelectedIndices(new Set(result.segments.map((_, i) => i)));
      setTotalDuration(result.totalDuration);
      setStep('review');
    } catch (error) {
      console.error('Silence detection error:', error);
      setDetectError(t('silenceRemovalModal.errors.analyzeFailed'));
    } finally {
      setIsDetecting(false);
    }
  }, [noiseThresholdDb, minSilenceDuration, resolveThreshold, t]);

  const handleDetect = useCallback(async () => {
    // Multi-clip / extra-track projects need an explicit (visible) merge confirm.
    if (needsMerge && !inputFilePath) {
      setStep('merge-confirm');
      return;
    }

    // Always analyze the flattened timeline, not the raw source media. Even a
    // single clip is flattened so its in/out trim and speed are respected
    // (otherwise detection runs against the full original source length).
    let filePath = inputFilePath;
    if (!filePath) {
      filePath = await handleMerge();
      if (!filePath) return; // error already surfaced by handleMerge
    }

    await runDetect(filePath);
  }, [needsMerge, inputFilePath, handleMerge, runDetect]);

  // Handle merge confirmation → proceed with detection on the merged file
  const handleConfirmMerge = useCallback(async () => {
    const filePath = await handleMerge();
    if (filePath) {
      setStep('configure');
      await runDetect(filePath);
    }
  }, [handleMerge, runDetect]);

  // ==================== Remove Logic ====================

  const handleRemove = useCallback(async () => {
    if (!inputFilePath || nonSilentSegments.length === 0) return;

    if (!window.electronAPI?.silenceRemoval) {
      setRemoveError(t('silenceRemovalModal.errors.desktopRequiredRemove'));
      return;
    }

    setIsRemoving(true);
    setRemoveError(null);
    setRemoveProgress(0);

    try {
      // Set up progress listener
      window.electronAPI.silenceRemoval.onProgress((data) => {
        setRemoveProgress(data.progress);
      });

      const result = await window.electronAPI.silenceRemoval.remove({
        inputPath: inputFilePath,
        nonSilentSegments,
      });

      window.electronAPI.silenceRemoval.removeProgressListener();

      if (!result.success || !result.outputPath) {
        setRemoveError(result.error || t('silenceRemovalModal.errors.removeFailed'));
        return;
      }

      // Add result to media pool as a local file reference (no upload)
      try {
        const fileUrl = await toLocalMediaUrl(result.outputPath);
        // Extract a poster frame so the media pool / timeline show a thumbnail
        // (same as local file imports). Falls back to null if extraction fails.
        const probe = await probeVideoFile(fileUrl);
        const store = useVideoProjectStore.getState();
        await store.addMedia({
          mediaType: 'video',
          name: `${store.currentProject?.name || 'Video'} (${t('silenceRemovalModal.outputNameSuffix')})`,
          fileUrl,
          thumbnailUrl: probe.thumbnailUrl,
          duration: probe.duration > 0 ? Math.round(probe.duration) : Math.round(estimatedOutputDuration),
          width: probe.width || store.currentProject?.width || 1920,
          height: probe.height || store.currentProject?.height || 1080,
          fileSize: null,
        });

        setRemoveSuccess(true);
      } catch (addError) {
        console.error('Add media error:', addError);
        setRemoveError(t('silenceRemovalModal.errors.addToPoolFailed'));
      }
    } catch (error) {
      console.error('Silence removal error:', error);
      setRemoveError(t('silenceRemovalModal.errors.removeFailed'));
    } finally {
      setIsRemoving(false);
    }
  }, [inputFilePath, nonSilentSegments, estimatedOutputDuration, t]);

  // ==================== Cancel ====================

  const handleCancel = useCallback(() => {
    window.electronAPI?.silenceRemoval?.cancel();
    window.electronAPI?.silenceRemoval?.removeProgressListener();
    // The flatten step runs through the export renderer.
    window.electronAPI?.videoExport?.cancel();
    window.electronAPI?.videoExport?.removeProgressListener();

    // Clean up the flattened temp file if any (prerender.cleanup is a generic unlink).
    if (mergedFilePath) {
      window.electronAPI?.prerender?.cleanup(mergedFilePath).catch(() => {});
    }

    setIsDetecting(false);
    setIsRemoving(false);
    setIsMerging(false);
    onClose();
  }, [mergedFilePath, onClose]);

  const handleBack = useCallback(() => {
    if (step === 'review') {
      setSilentSegments([]);
      setTotalDuration(0);
      setRemoveError(null);
      setRemoveSuccess(false);
      setStep('configure');
    } else if (step === 'merge-confirm') {
      setStep('configure');
    }
  }, [step]);

  // ==================== Render ====================

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={isProcessing ? undefined : handleCancel}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            {step !== 'configure' && !isProcessing && (
              <button
                onClick={handleBack}
                className="p-0.5 hover:bg-zinc-800 rounded transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-zinc-400" />
              </button>
            )}
            <VolumeX className="w-5 h-5 text-zinc-400" />
            {t('silenceRemovalModal.title')}
          </h2>
          <button
            onClick={isProcessing ? undefined : handleCancel}
            disabled={isProcessing}
            className={cn(
              'p-1 rounded transition-colors',
              isProcessing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-zinc-800'
            )}
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {step === 'configure' ? (
            <>
              <p className="text-sm text-zinc-400">
                {t('silenceRemovalModal.description')}
              </p>

              {/* Mode Toggle */}
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-zinc-800 border border-zinc-700">
                <button
                  onClick={() => setMode('auto')}
                  disabled={isDetecting || isMerging || isAnalyzing}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                    mode === 'auto' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
                  )}
                >
                  {t('silenceRemovalModal.modeAuto')}
                </button>
                <button
                  onClick={() => setMode('manual')}
                  disabled={isDetecting || isMerging || isAnalyzing}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                    mode === 'manual' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
                  )}
                >
                  {t('silenceRemovalModal.modeManual')}
                </button>
              </div>

              {mode === 'auto' && (
                <p className="text-xs text-zinc-500">
                  {t('silenceRemovalModal.autoDescription')}
                </p>
              )}

              {mode === 'auto' && autoThresholdInfo && (
                <div className="px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                  <p className="text-xs text-zinc-300">
                    {t('silenceRemovalModal.autoThresholdInfo', {
                      value: autoThresholdInfo.threshold,
                      mean: autoThresholdInfo.mean,
                    })}
                  </p>
                </div>
              )}

              {/* Advanced toggle */}
              {mode === 'auto' && (
                <button
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  {showAdvanced ? '▾' : '▸'} {t('silenceRemovalModal.advancedToggle')}
                </button>
              )}

              {/* Noise Threshold (manual mode or advanced) */}
              {(mode === 'manual' || showAdvanced) && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  {t('silenceRemovalModal.thresholdLabel', { value: noiseThresholdDb })}
                </label>
                <input
                  type="range"
                  min={-60}
                  max={-10}
                  step={1}
                  value={noiseThresholdDb}
                  onChange={(e) => {
                    setNoiseThresholdDb(Number(e.target.value));
                    if (mode === 'auto') setMode('manual');
                  }}
                  disabled={isDetecting || isMerging || isAnalyzing}
                  className="w-full accent-white"
                />
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>{t('silenceRemovalModal.thresholdStrict')}</span>
                  <span>{t('silenceRemovalModal.thresholdLenient')}</span>
                </div>
              </div>
              )}

              {/* Min Silence Duration */}
              {(mode === 'manual' || showAdvanced) && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  {t('silenceRemovalModal.minDurationLabel', { value: minSilenceDuration.toFixed(1) })}
                </label>
                <input
                  type="range"
                  min={0.1}
                  max={5}
                  step={0.1}
                  value={minSilenceDuration}
                  onChange={(e) => setMinSilenceDuration(Number(e.target.value))}
                  disabled={isDetecting || isMerging || isAnalyzing}
                  className="w-full accent-white"
                />
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>{t('silenceRemovalModal.minDurationMin')}</span>
                  <span>{t('silenceRemovalModal.minDurationMax')}</span>
                </div>
              </div>
              )}

              {/* Padding */}
              {(mode === 'manual' || showAdvanced) && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  {t('silenceRemovalModal.paddingLabel', { value: (padding * 1000).toFixed(0) })}
                </label>
                <input
                  type="range"
                  min={0}
                  max={0.5}
                  step={0.01}
                  value={padding}
                  onChange={(e) => setPadding(Number(e.target.value))}
                  disabled={isDetecting || isMerging || isAnalyzing}
                  className="w-full accent-white"
                />
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>{t('silenceRemovalModal.paddingMin')}</span>
                  <span>{t('silenceRemovalModal.paddingMax')}</span>
                </div>
              </div>
              )}

              {/* Detecting progress */}
              {(isDetecting || isMerging || isAnalyzing) && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800 border border-zinc-700">
                  <Loader2 className="w-4 h-4 text-white animate-spin shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-white">
                      {isMerging
                        ? t('silenceRemovalModal.merging')
                        : isAnalyzing
                          ? t('silenceRemovalModal.analyzing')
                          : t('silenceRemovalModal.detecting')}
                    </p>
                    {isMerging && (
                      <div className="mt-1.5 h-1 bg-zinc-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white rounded-full transition-all duration-300"
                          style={{ width: `${mergeProgress}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleCancel}
                    className="text-xs text-zinc-400 hover:text-white transition-colors"
                  >
                    {t('silenceRemovalModal.cancel')}
                  </button>
                </div>
              )}

              {/* Error */}
              {detectError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-300">{detectError}</p>
                </div>
              )}
            </>
          ) : step === 'merge-confirm' ? (
            <>
              {/* Merge Confirmation */}
              <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-300 mb-1">{t('silenceRemovalModal.mergeRequiredTitle')}</p>
                  <p className="text-sm text-amber-200/80">{mergeMessage}</p>
                </div>
              </div>

              {isMerging && (
                <div className="p-3 rounded-lg bg-zinc-800 border border-zinc-700">
                  <div className="flex items-center gap-2 mb-2">
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                    <p className="text-sm text-white">{t('silenceRemovalModal.merging')}</p>
                  </div>
                  <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white rounded-full transition-all duration-300"
                      style={{ width: `${mergeProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {detectError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-300">{detectError}</p>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Review Step */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-400">
                  {t('silenceRemovalModal.selectedCount', {
                    selected: selectedIndices.size,
                    total: silentSegments.length,
                  })}
                </p>
                <button
                  onClick={toggleSelectAll}
                  disabled={isRemoving}
                  className="text-xs text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  {allSelected
                    ? t('silenceRemovalModal.deselectAll')
                    : t('silenceRemovalModal.selectAll')}
                </button>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-center">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-0.5">{t('silenceRemovalModal.statOriginal')}</p>
                  <p className="text-sm font-medium text-white">{formatTimePadded(totalDuration)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-0.5">{t('silenceRemovalModal.statSilence')}</p>
                  <p className="text-sm font-medium text-red-400">{formatTimePadded(totalSilenceDuration)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-0.5">{t('silenceRemovalModal.statEstimated')}</p>
                  <p className="text-sm font-medium text-emerald-400">{formatTimePadded(estimatedOutputDuration)}</p>
                </div>
              </div>

              {/* Segment List */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {silentSegments.map((seg, idx) => {
                  const isSelected = selectedIndices.has(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleSegment(idx)}
                      disabled={isRemoving}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-colors text-left disabled:cursor-not-allowed',
                        isSelected
                          ? 'bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-600'
                          : 'bg-transparent border-zinc-800/50 opacity-50 hover:opacity-80'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {isSelected ? (
                          <CheckSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                        )}
                        <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="text-xs text-zinc-300">
                          {formatTimePadded(seg.start)} — {formatTimePadded(seg.end)}
                        </span>
                      </div>
                      <span className="text-xs text-zinc-500">
                        {seg.duration.toFixed(1)}s
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Processing Progress */}
              {isRemoving && (
                <div className="p-3 rounded-lg bg-zinc-800 border border-zinc-700">
                  <div className="flex items-center gap-2 mb-2">
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                    <p className="text-sm text-white">{t('silenceRemovalModal.removing', { progress: removeProgress })}</p>
                  </div>
                  <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white rounded-full transition-all duration-300"
                      style={{ width: `${removeProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error */}
              {removeError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-300">{removeError}</p>
                </div>
              )}

              {/* Success */}
              {removeSuccess && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-emerald-300">
                    {t('silenceRemovalModal.successMessage')}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 shrink-0">
          {step === 'configure' ? (
            <button
              onClick={handleDetect}
              disabled={isDetecting || isMerging || isAnalyzing || videoClips.length === 0}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors',
                isDetecting || isMerging || isAnalyzing || videoClips.length === 0
                  ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                  : 'bg-white text-black hover:bg-zinc-200'
              )}
            >
              {isDetecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('silenceRemovalModal.detectingButton')}
                </>
              ) : isMerging ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('silenceRemovalModal.mergingButton')}
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" />
                  {t('silenceRemovalModal.detectButton')}
                </>
              )}
            </button>
          ) : step === 'merge-confirm' ? (
            <div className="flex gap-2">
              <button
                onClick={handleBack}
                disabled={isMerging}
                className="flex-1 px-4 py-2.5 rounded-lg font-medium text-sm border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('silenceRemovalModal.cancel')}
              </button>
              <button
                onClick={handleConfirmMerge}
                disabled={isMerging}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors',
                  isMerging
                    ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                    : 'bg-white text-black hover:bg-zinc-200'
                )}
              >
                {isMerging ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('silenceRemovalModal.mergingButton')}
                  </>
                ) : (
                  t('silenceRemovalModal.confirm')
                )}
              </button>
            </div>
          ) : (
            <button
              onClick={isRemoving ? handleCancel : handleRemove}
              disabled={removeSuccess || (nonSilentSegments.length === 0 && !isRemoving)}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors',
                removeSuccess || (nonSilentSegments.length === 0 && !isRemoving)
                  ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                  : isRemoving
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-white text-black hover:bg-zinc-200'
              )}
            >
              {isRemoving ? (
                <>
                  <X className="w-4 h-4" />
                  {t('silenceRemovalModal.cancel')}
                </>
              ) : removeSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  {t('silenceRemovalModal.doneButton')}
                </>
              ) : (
                <>
                  <VolumeX className="w-4 h-4" />
                  {t('silenceRemovalModal.removeButton')}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export default SilenceRemovalModal;
