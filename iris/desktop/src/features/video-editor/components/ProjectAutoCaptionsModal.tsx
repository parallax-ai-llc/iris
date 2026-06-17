/**
 * ProjectAutoCaptionsModal — AI-powered auto subtitle generation for the entire project
 * Processes all video/audio clips on the timeline sequentially,
 * converts asset-relative timestamps to timeline-relative timestamps,
 * and imports the resulting cues as subtitle clips.
 */

import { memo, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { X, Captions, Loader2, Check, Languages, Coins, Eraser } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { generateSubtitles, removeFillerWords, type SubtitleCue } from '@/shared/api/subtitle.api';
import { useEditorStore, type VideoClip, type AudioClip } from '@/features/video-editor/stores/editor.store';
import { useTokenCostsStore } from '@/shared/stores/token-costs';
import { useConnectionStore } from '@/shared/stores/connection.store';
import { formatTokenCost } from '@/shared/hooks/useTokenCost';

interface ProjectAutoCaptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ko', label: '한국어' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'ru', label: 'Русский' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'it', label: 'Italiano' },
];

const MODELS = [
  {
    value: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: 'Best timestamp accuracy for long audio',
  },
  {
    value: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: 'Fast & affordable — may have timestamp drift on long audio',
  },
];

export const ProjectAutoCaptionsModal = memo(function ProjectAutoCaptionsModal({
  isOpen,
  onClose,
}: ProjectAutoCaptionsModalProps) {
  const [language, setLanguage] = useState('en');
  const [model, setModel] = useState('gemini-2.5-flash');
  const [removeFillers, setRemoveFillers] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fillerInfo, setFillerInfo] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    step: 'extracting' | 'transcribing' | 'removing-fillers';
    percent: number;
  } | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [remainingTime, setRemainingTime] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const generationIdRef = useRef(0);
  const generationStartRef = useRef(0);
  const remainingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tracks = useEditorStore((s) => s.tracks);
  const importSubtitleCues = useEditorStore((s) => s.importSubtitleCues);
  const { costs, fetchTokenCosts, getModelTokenCost } = useTokenCostsStore();
  const isServerDisabled = !useConnectionStore((s) => s.isServerConnected);

  useEffect(() => {
    if (isOpen) fetchTokenCosts();
  }, [isOpen, fetchTokenCosts]);

  // Reset state when modal opens — also kills any stale generation
  useEffect(() => {
    if (isOpen) {
      cancelledRef.current = true;       // stop any lingering async
      generationIdRef.current++;         // invalidate stale finally blocks
      setIsGenerating(false);
      setError(null);
      setSuccess(false);
      setFillerInfo(null);
      setProgress(null);

      setShowCancelConfirm(false);
    }
  }, [isOpen]);

  // Use audio clips for transcription (separated audio files). Fall back to video clips if no audio track.
  const mediaClips = useMemo(() => {
    const audioClips = tracks
      .filter((t) => t.type === 'audio')
      .flatMap((t) => t.clips)
      .filter((c): c is AudioClip => c.type === 'audio');
    if (audioClips.length > 0) return audioClips.sort((a, b) => a.startTime - b.startTime);

    return tracks
      .flatMap((t) => t.clips)
      .filter((c): c is VideoClip => c.type === 'video')
      .sort((a, b) => a.startTime - b.startTime);
  }, [tracks]);

  const hasClips = mediaClips.length > 0;

  // Estimate total duration for cost calculation
  const totalDuration = useMemo(() => {
    const uniqueAssets = new Map<string, number>();
    for (const clip of mediaClips) {
      const existing = uniqueAssets.get(clip.assetId) ?? 0;
      const clipDuration = clip.sourceEndTime - clip.sourceStartTime;
      // Use max duration per asset (since we cache, we only transcribe each asset once)
      if (clipDuration > existing) {
        uniqueAssets.set(clip.assetId, clipDuration);
      }
    }
    let total = 0;
    for (const dur of uniqueAssets.values()) total += dur;
    return total;
  }, [mediaClips]);

  const tokenCost = useMemo(
    () => getModelTokenCost(model, 'GEN_SPEECH_TO_TEXT', { durationSeconds: totalDuration }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, totalDuration, costs, getModelTokenCost]
  );

  const handleCancel = useCallback(() => {
    if (isGenerating) {
      setShowCancelConfirm(true);
    } else {
      onClose();
    }
  }, [isGenerating, onClose]);

  const handleConfirmCancel = useCallback(() => {
    cancelledRef.current = true;
    setIsGenerating(false);
    setProgress(null);
    setShowCancelConfirm(false);
    onClose();
  }, [onClose]);

  const handleGenerate = useCallback(async () => {
    const currentGenId = ++generationIdRef.current;
    setIsGenerating(true);
    setError(null);
    setSuccess(false);
    setFillerInfo(null);
    setProgress(null);
    setRemainingTime(null);
    setShowCancelConfirm(false);
    cancelledRef.current = false;
    generationStartRef.current = Date.now();

    try {
      const assetCache = new Map<string, SubtitleCue[]>();
      const allCues: SubtitleCue[] = [];
      let totalFillersRemoved = 0;

      // Progress is based on unique assets (not clips), since multiple clips
      // can share the same source file (e.g. video + audio from one file).
      const uniqueAssetIds = [...new Set(mediaClips.map((c) => c.assetId))];
      const totalAssets = uniqueAssetIds.length;
      const hasElectron = !!window.electronAPI?.audioExtract;
      // Steps: (extract?) + transcribe + (fillers?)
      const stepsPerAsset = (hasElectron ? 1 : 0) + 1 + (removeFillers ? 1 : 0);
      const totalSteps = totalAssets * stepsPerAsset;
      let completedSteps = 0;

      // Estimate total processing time per asset:
      // ffmpeg extract ~3s + Gemini API ~(duration/20 + 10)s + filler ~10s
      const totalDurationSec = mediaClips.reduce((sum, c) => {
        if (!uniqueAssetIds.includes(c.assetId) || sum > 0) return sum;
        return c.sourceEndTime - c.sourceStartTime;
      }, 0);
      const estimatedTotalMs = totalAssets * (
        (hasElectron ? 3000 : 0) +
        (totalDurationSec / 20 + 10) * 1000 +
        (removeFillers ? 10000 : 0)
      );

      // Update remaining time every 500ms
      remainingTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - generationStartRef.current;
        const remaining = Math.max(0, estimatedTotalMs - elapsed);
        if (remaining <= 0) {
          setRemainingTime('almost done...');
        } else {
          const sec = Math.ceil(remaining / 1000);
          setRemainingTime(sec >= 60 ? `~${Math.ceil(sec / 60)}m left` : `~${sec}s left`);
        }
      }, 500);

      for (let i = 0; i < mediaClips.length; i++) {
        if (cancelledRef.current) break;

        const clip = mediaClips[i];
        const assetIndex = uniqueAssetIds.indexOf(clip.assetId) + 1;

        let assetCues = assetCache.get(clip.assetId);
        if (!assetCues) {
          let audioBuffer: ArrayBuffer | undefined;

          // Step 1 (Electron only): Extract audio locally with ffmpeg
          if (hasElectron) {
            setProgress({
              current: assetIndex,
              total: totalAssets,
              step: 'extracting',
              percent: Math.round((completedSteps / totalSteps) * 100),
            });

            let localPath = useEditorStore.getState().getLocalFilePath(clip.assetId);
            if (!localPath) {
              // Download on demand if not already local
              localPath = await useEditorStore.getState().downloadAsset(clip.assetId);
              if (!localPath) throw new Error('Failed to download video file.');
            }
            if (cancelledRef.current) break;

            const extractResult = await window.electronAPI.audioExtract.extract(localPath);
            if (!extractResult.success || !extractResult.audioBuffer) {
              throw new Error(extractResult.error || 'Audio extraction failed');
            }
            audioBuffer = extractResult.audioBuffer;
            completedSteps++;
          }

          if (cancelledRef.current) break;

          // Step 2: Transcribe via API
          setProgress({
            current: assetIndex,
            total: totalAssets,
            step: 'transcribing',
            percent: Math.round((completedSteps / totalSteps) * 100),
          });

          const result = await generateSubtitles(
            { assetId: clip.assetId, language, model, name: `Auto Captions (${language})` },
            audioBuffer
          );

          if (!result) {
            throw new Error('Transcription failed. The server may have timed out.');
          }
          completedSteps++;

          if (cancelledRef.current) break;

          // Step 3 (optional): Remove fillers
          if (removeFillers && result.id) {
            setProgress({
              current: assetIndex,
              total: totalAssets,
              step: 'removing-fillers',
              percent: Math.round((completedSteps / totalSteps) * 100),
            });

            const fillerResult = await removeFillerWords(result.id, { language });
            completedSteps++;

            if (fillerResult && fillerResult.removedCount > 0) {
              totalFillersRemoved += fillerResult.removedCount;
              assetCues = (fillerResult.subtitle.cues ?? []).map(c => ({
                ...c, startTime: c.startTime / 1000, endTime: c.endTime / 1000,
              }));
            } else {
              assetCues = (result.cues ?? []).map(c => ({
                ...c, startTime: c.startTime / 1000, endTime: c.endTime / 1000,
              }));
            }
          } else {
            assetCues = (result.cues ?? []).map(c => ({
              ...c, startTime: c.startTime / 1000, endTime: c.endTime / 1000,
            }));
          }
          assetCache.set(clip.assetId, assetCues);
        }

        if (cancelledRef.current) break;

        // Filter cues that fall within this clip's source range and convert to timeline time
        const offsetCues = assetCues
          .filter((c) => c.startTime >= clip.sourceStartTime && c.startTime < clip.sourceEndTime)
          .map((c) => ({
            ...c,
            id: `${c.id}-${clip.id}`,
            startTime: c.startTime - clip.sourceStartTime + clip.startTime,
            endTime: Math.min(
              c.endTime - clip.sourceStartTime + clip.startTime,
              clip.endTime
            ),
          }));

        allCues.push(...offsetCues);
      }

      // If cancelled, discard results — tokens already consumed but nothing applied
      if (cancelledRef.current) return;

      if (allCues.length > 0) {
        importSubtitleCues(allCues);
        if (totalFillersRemoved > 0) {
          setFillerInfo(`Removed ${totalFillersRemoved} filler word(s)`);
        }
        setSuccess(true);
        setTimeout(onClose, 1500);
      } else {
        setError(
          'No captions were generated. The clips may have no speech, or the language may not match.'
        );
      }
    } catch (err) {
      if (!cancelledRef.current && generationIdRef.current === currentGenId) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(`Failed to generate captions: ${message}`);
      }
    } finally {
      if (remainingTimerRef.current) clearInterval(remainingTimerRef.current);
      setIsGenerating(false);
      setProgress(null);
      setRemainingTime(null);
    }
  }, [mediaClips, language, model, removeFillers, importSubtitleCues, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={isGenerating ? undefined : handleCancel}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Captions className="w-5 h-5 text-zinc-400" />
            Project Auto Captions
          </h2>
          <button
            onClick={handleCancel}
            className="p-1 hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {!hasClips ? (
            <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700 text-center">
              <p className="text-sm text-zinc-400">
                No media clips on the timeline. Add video or audio clips first.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-zinc-400">
                Generate subtitles for all {mediaClips.length} media clip
                {mediaClips.length !== 1 ? 's' : ''} on the timeline.
              </p>

              {/* Language */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  <Languages className="w-3.5 h-3.5" />
                  Spoken Language
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={isGenerating}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/30 disabled:opacity-50"
                >
                  {LANGUAGES.map(({ code, label }) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Model */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  Model
                </label>
                <div className="space-y-1.5">
                  {MODELS.map(({ value, label, description }) => {
                    const cost = getModelTokenCost(value, 'GEN_SPEECH_TO_TEXT', {
                      durationSeconds: totalDuration,
                    });
                    return (
                      <button
                        key={value}
                        onClick={() => setModel(value)}
                        disabled={isGenerating}
                        className={cn(
                          'w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors disabled:opacity-50',
                          model === value
                            ? 'bg-zinc-800 border-zinc-500'
                            : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
                        )}
                      >
                        <div
                          className={cn(
                            'w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center',
                            model === value ? 'border-white bg-white' : 'border-zinc-600'
                          )}
                        >
                          {model === value && (
                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white">{label}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
                        </div>
                        {cost > 0 && (
                          <div className="flex items-center gap-1 text-xs text-zinc-400 flex-shrink-0 mt-0.5">
                            <Coins className="w-3 h-3" />
                            <span>{formatTokenCost(cost)}</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Filler Word Removal */}
              <label
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                  removeFillers
                    ? 'bg-zinc-800 border-zinc-500'
                    : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600',
                  isGenerating && 'opacity-50 cursor-not-allowed'
                )}
              >
                <input
                  type="checkbox"
                  checked={removeFillers}
                  onChange={(e) => setRemoveFillers(e.target.checked)}
                  disabled={isGenerating}
                  className="sr-only"
                />
                <div
                  className={cn(
                    'w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors',
                    removeFillers ? 'bg-white border-white' : 'border-zinc-600'
                  )}
                >
                  {removeFillers && <Check className="w-3 h-3 text-zinc-900" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Eraser className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-sm text-white">Remove filler words</span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Automatically remove &quot;um&quot;, &quot;uh&quot;, &quot;you know&quot; and
                    similar filler words
                  </p>
                </div>
              </label>
            </>
          )}

          {/* Progress */}
          {progress && (
            <div className="p-3 rounded-lg bg-blue-900/30 border border-blue-800 space-y-2">
              <div className="flex items-center justify-between text-sm text-blue-300">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                  <span>
                    {progress.total > 1 && `${progress.current} / ${progress.total} — `}
                    {progress.step === 'extracting' && 'Extracting audio...'}
                    {progress.step === 'transcribing' && 'Transcribing...'}
                    {progress.step === 'removing-fillers' && 'Removing fillers...'}
                  </span>
                </div>
                <span className="text-xs font-medium tabular-nums">
                  {remainingTime ?? `${progress.percent}%`}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-blue-950 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-400 transition-all duration-300 ease-out"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Cancel confirmation */}
          {showCancelConfirm && (
            <div className="p-3 rounded-lg bg-zinc-800 border border-zinc-600 space-y-2.5">
              <p className="text-sm text-zinc-300">
                Credits already used will not be refunded and captions won&apos;t be applied. Cancel anyway?
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="px-3 py-1 rounded-md text-xs text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                >
                  Continue generating
                </button>
                <button
                  onClick={handleConfirmCancel}
                  className="px-3 py-1 rounded-md text-xs font-medium bg-red-600 text-white hover:bg-red-500 transition-colors"
                >
                  Yes, cancel
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-900/30 border border-red-800 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="p-3 rounded-lg bg-green-900/30 border border-green-800 text-sm text-green-300 space-y-1">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 flex-shrink-0" />
                Captions added to timeline!
              </div>
              {fillerInfo && (
                <div className="flex items-center gap-2 text-xs text-green-400/80">
                  <Eraser className="w-3 h-3 flex-shrink-0" />
                  {fillerInfo}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 p-4 border-t border-zinc-800">
          {/* Token cost */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            {tokenCost > 0 && hasClips && (
              <>
                <Coins className="w-3.5 h-3.5" />
                <span>~{formatTokenCost(tokenCost)} credits</span>
                {totalDuration > 0 && (
                  <span className="text-zinc-600">
                    · {totalDuration.toFixed(0)}s
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={isGenerating || success || !hasClips || isServerDisabled}
              title={isServerDisabled ? 'Server connection required' : undefined}
              className={cn(
                'flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
                isGenerating || success || !hasClips || isServerDisabled
                  ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                  : 'bg-white text-zinc-900 hover:bg-zinc-100'
              )}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : success ? (
                <>
                  <Check className="w-4 h-4" />
                  Done!
                </>
              ) : (
                <>
                  <Captions className="w-4 h-4" />
                  Generate Captions
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default ProjectAutoCaptionsModal;
