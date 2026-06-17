/**
 * AutoCutModal — AI-powered highlight detection and short-form clip generation
 *
 * Two-step flow:
 * Step 1: Configure analysis options → Analyze video
 * Step 2: Review detected highlights → Export selected segments
 */

import { memo, useState, useCallback } from 'react';
import {
  X,
  Scissors,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  Play,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  analyzeVideo,
  cutHighlights,
  type HighlightSegment,
  type ContentType,
} from '@/shared/api/autocut.api';
import { formatTime } from '@/shared/lib/utils/time';

// ==================== Props ====================

interface AutoCutModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetId: string;
  duration?: number; // seconds
  onSeek?: (time: number) => void; // seek preview to time
}

// ==================== Constants ====================

const CONTENT_TYPES: Array<{ value: ContentType; label: string; icon: string }> = [
  { value: 'all', label: 'All', icon: '🎯' },
  { value: 'highlights', label: 'Highlights', icon: '⭐' },
  { value: 'educational', label: 'Educational', icon: '📚' },
  { value: 'funny', label: 'Funny', icon: '😂' },
  { value: 'dramatic', label: 'Dramatic', icon: '🎭' },
];

// ==================== Helpers ====================

const formatTimePadded = (seconds: number) => formatTime(seconds, { padMinutes: true });

function getScoreColor(score: number): string {
  if (score >= 70) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (score >= 40) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  return 'bg-red-500/20 text-red-400 border-red-500/30';
}

function getCategoryColor(category: string): string {
  switch (category) {
    case 'highlight': return 'bg-blue-500/20 text-blue-400';
    case 'educational': return 'bg-purple-500/20 text-purple-400';
    case 'funny': return 'bg-yellow-500/20 text-yellow-400';
    case 'dramatic': return 'bg-red-500/20 text-red-400';
    default: return 'bg-zinc-500/20 text-zinc-400';
  }
}

// ==================== Component ====================

export const AutoCutModal = memo(function AutoCutModal({
  isOpen,
  onClose,
  assetId,
  duration,
  onSeek,
}: AutoCutModalProps) {
  // Step state
  const [step, setStep] = useState<'configure' | 'review'>('configure');

  // Step 1: Configuration
  const [contentType, setContentType] = useState<ContentType>('all');
  const [targetClipCount, setTargetClipCount] = useState(5);
  const [minClipDuration, setMinClipDuration] = useState(15);
  const [maxClipDuration, setMaxClipDuration] = useState(60);
  const [useSceneDetection, setUseSceneDetection] = useState(false);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Step 2: Review
  const [segments, setSegments] = useState<HighlightSegment[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [autoSubtitles, setAutoSubtitles] = useState(false);

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);

  // ==================== Handlers ====================

  const handleAnalyze = useCallback(async () => {
    setIsAnalyzing(true);
    setAnalyzeError(null);

    try {
      const result = await analyzeVideo({
        sourceAssetId: assetId,
        contentType,
        targetClipCount,
        minClipDuration,
        maxClipDuration,
        useSceneDetection,
      });

      if (result && result.segments.length > 0) {
        setSegments(result.segments);
        setSelectedIds(new Set(result.segments.map((s) => s.id)));
        setStep('review');
      } else {
        setAnalyzeError(
          'No highlights detected. The video may be too short or have insufficient speech content.'
        );
      }
    } catch {
      setAnalyzeError('Failed to analyze video. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [assetId, contentType, targetClipCount, minClipDuration, maxClipDuration, useSceneDetection]);

  const handleToggleSegment = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(segments.map((s) => s.id)));
  }, [segments]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleExport = useCallback(async () => {
    const selected = segments.filter((s) => selectedIds.has(s.id));
    if (selected.length === 0) return;

    setIsExporting(true);
    setExportError(null);

    try {
      const result = await cutHighlights({
        sourceAssetId: assetId,
        segments: selected.map((s) => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          label: s.label,
        })),
        exportMode: 'individual',
        storagePath: 'iris/videos/autocut',
        autoSubtitles,
      });

      if (result && result.totalCreated > 0) {
        setExportSuccess(true);
        setTimeout(onClose, 1500);
      } else {
        setExportError('Failed to export clips.');
      }
    } catch {
      setExportError('Failed to export clips. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [segments, selectedIds, assetId, autoSubtitles, onClose]);

  const handleBack = useCallback(() => {
    setStep('configure');
    setExportError(null);
    setExportSuccess(false);
  }, []);

  // ==================== Render ====================

  if (!isOpen) return null;

  const selectedCount = selectedIds.size;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            {step === 'review' && (
              <button
                onClick={handleBack}
                className="p-0.5 hover:bg-zinc-800 rounded transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-zinc-400" />
              </button>
            )}
            <Scissors className="w-5 h-5 text-zinc-400" />
            AI AutoCut
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {step === 'configure' ? (
            <>
              <p className="text-sm text-zinc-400">
                AI analyzes your video transcript to detect the most engaging moments for short-form clips.
              </p>

              {/* Content Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  Content Focus
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {CONTENT_TYPES.map(({ value, label, icon }) => (
                    <button
                      key={value}
                      onClick={() => setContentType(value)}
                      disabled={isAnalyzing}
                      className={cn(
                        'flex flex-col items-center gap-1 px-2 py-2 rounded-lg border text-xs transition-colors',
                        contentType === value
                          ? 'border-white/30 bg-white/10 text-white'
                          : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600'
                      )}
                    >
                      <span className="text-base">{icon}</span>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Clip Count */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  Target Clips: {targetClipCount}
                </label>
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={targetClipCount}
                  onChange={(e) => setTargetClipCount(Number(e.target.value))}
                  disabled={isAnalyzing}
                  className="w-full accent-white"
                />
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>1</span>
                  <span>20</span>
                </div>
              </div>

              {/* Duration Range */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                    Min Duration: {minClipDuration}s
                  </label>
                  <input
                    type="range"
                    min={3}
                    max={120}
                    value={minClipDuration}
                    onChange={(e) => setMinClipDuration(Number(e.target.value))}
                    disabled={isAnalyzing}
                    className="w-full accent-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                    Max Duration: {maxClipDuration}s
                  </label>
                  <input
                    type="range"
                    min={10}
                    max={300}
                    value={maxClipDuration}
                    onChange={(e) => setMaxClipDuration(Number(e.target.value))}
                    disabled={isAnalyzing}
                    className="w-full accent-white"
                  />
                </div>
              </div>

              {/* Scene Detection Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useSceneDetection}
                  onChange={(e) => setUseSceneDetection(e.target.checked)}
                  disabled={isAnalyzing}
                  className="rounded border-zinc-600 bg-zinc-800 text-white focus:ring-0"
                />
                <span className="text-sm text-zinc-300">
                  Use scene detection (snaps cuts to visual transitions)
                </span>
              </label>

              {/* Video Info */}
              {duration != null && duration > 0 && (
                <div className="text-xs text-zinc-500">
                  Video duration: {formatTimePadded(duration)}
                </div>
              )}

              {/* Error */}
              {analyzeError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-300">{analyzeError}</p>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Review Step */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-400">
                  {segments.length} highlight(s) detected. Select clips to export.
                </p>
                <div className="flex gap-2 text-xs">
                  <button
                    onClick={handleSelectAll}
                    className="text-zinc-400 hover:text-white transition-colors"
                  >
                    Select All
                  </button>
                  <span className="text-zinc-600">|</span>
                  <button
                    onClick={handleDeselectAll}
                    className="text-zinc-400 hover:text-white transition-colors"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Segment List */}
              <div className="space-y-2">
                {segments.map((seg) => (
                  <div
                    key={seg.id}
                    className={cn(
                      'border rounded-lg p-3 transition-colors cursor-pointer',
                      selectedIds.has(seg.id)
                        ? 'border-white/20 bg-white/5'
                        : 'border-zinc-700/50 bg-zinc-800/50 opacity-60'
                    )}
                    onClick={() => handleToggleSegment(seg.id)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={selectedIds.has(seg.id)}
                        onChange={() => handleToggleSegment(seg.id)}
                        className="mt-1 rounded border-zinc-600 bg-zinc-800 text-white focus:ring-0"
                      />

                      <div className="flex-1 min-w-0">
                        {/* Title row */}
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={cn(
                              'px-1.5 py-0.5 rounded text-[10px] font-medium border',
                              getScoreColor(seg.score)
                            )}
                          >
                            {seg.score}
                          </span>
                          <span className="text-sm font-medium text-white truncate">
                            {seg.label}
                          </span>
                          <span
                            className={cn(
                              'px-1.5 py-0.5 rounded text-[10px]',
                              getCategoryColor(seg.category)
                            )}
                          >
                            {seg.category}
                          </span>
                        </div>

                        {/* Time range */}
                        <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
                          <span>
                            {formatTimePadded(seg.startTime)} – {formatTimePadded(seg.endTime)}
                          </span>
                          <span className="text-zinc-600">
                            ({Math.round(seg.endTime - seg.startTime)}s)
                          </span>
                          {onSeek && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSeek(seg.startTime);
                              }}
                              className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors"
                            >
                              <Play className="w-3 h-3" />
                              Preview
                            </button>
                          )}
                        </div>

                        {/* Reason */}
                        <p className="text-xs text-zinc-500 line-clamp-1">
                          {seg.reason}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Auto Subtitles Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSubtitles}
                  onChange={(e) => setAutoSubtitles(e.target.checked)}
                  disabled={isExporting}
                  className="rounded border-zinc-600 bg-zinc-800 text-white focus:ring-0"
                />
                <span className="text-sm text-zinc-300">
                  Auto-generate subtitles for each clip
                </span>
              </label>

              {/* Export Error */}
              {exportError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-300">{exportError}</p>
                </div>
              )}

              {/* Export Success */}
              {exportSuccess && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-emerald-300">
                    Clips exported successfully!
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
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors',
                isAnalyzing
                  ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                  : 'bg-white text-black hover:bg-zinc-200'
              )}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Analyze Video
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleExport}
              disabled={isExporting || selectedCount === 0 || exportSuccess}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors',
                isExporting || selectedCount === 0 || exportSuccess
                  ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                  : 'bg-white text-black hover:bg-zinc-200'
              )}
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Exporting...
                </>
              ) : exportSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Done!
                </>
              ) : (
                <>
                  <Scissors className="w-4 h-4" />
                  Export {selectedCount} Clip{selectedCount !== 1 ? 's' : ''}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export default AutoCutModal;
