/**
 * AutoReframeModal — AI-powered video reframing
 *
 * Two-step flow:
 * Step 1: Select target aspect ratio + tracking mode → Analyze video
 * Step 2: Preview crop keyframes → Render reframed video
 */

import { memo, useState, useCallback } from 'react';
import {
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  Crop,
  Smartphone,
  Square,
  Monitor,
  Film,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  analyzeForReframe,
  renderReframe,
  type CropKeyframe,
  type AspectRatio,
  type TrackingMode,
  type MotionSmoothingLevel,
} from '@/shared/api/auto-reframe.api';

// ==================== Props ====================

interface AutoReframeModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetId: string;
  storagePath?: string;
}

// ==================== Constants ====================

const ASPECT_RATIO_OPTIONS: Array<{
  value: AspectRatio;
  label: string;
  description: string;
  icon: typeof Smartphone;
  dims: string;
}> = [
  { value: '9:16', label: '9:16', description: 'TikTok / Reels / Shorts', icon: Smartphone, dims: 'Portrait' },
  { value: '1:1', label: '1:1', description: 'Instagram Square', icon: Square, dims: 'Square' },
  { value: '4:5', label: '4:5', description: 'Instagram Portrait', icon: Smartphone, dims: 'Portrait' },
  { value: '4:3', label: '4:3', description: 'Classic TV', icon: Monitor, dims: 'Standard' },
  { value: '16:9', label: '16:9', description: 'YouTube / Standard', icon: Monitor, dims: 'Landscape' },
  { value: '21:9', label: '21:9', description: 'Ultra-wide / Cinematic', icon: Film, dims: 'Ultra-wide' },
];

const TRACKING_MODES: Array<{ value: TrackingMode; label: string; description: string }> = [
  { value: 'auto', label: 'Auto', description: 'Detect faces and motion automatically' },
  { value: 'face', label: 'Face', description: 'Track faces (best for talking head videos)' },
  { value: 'center', label: 'Center', description: 'Keep center of frame (landscape shots)' },
];

const SMOOTHING_LEVELS: Array<{ value: MotionSmoothingLevel; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

// ==================== Component ====================

export const AutoReframeModal = memo(function AutoReframeModal({
  isOpen,
  onClose,
  assetId,
  storagePath,
}: AutoReframeModalProps) {
  // Step state
  const [step, setStep] = useState<'configure' | 'review'>('configure');

  // Step 1: Configuration
  const [targetAspectRatio, setTargetAspectRatio] = useState<AspectRatio>('9:16');
  const [trackingMode, setTrackingMode] = useState<TrackingMode>('auto');
  const [motionSmoothing, setMotionSmoothing] = useState<MotionSmoothingLevel>('medium');

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Step 2: Review
  const [cropKeyframes, setCropKeyframes] = useState<CropKeyframe[]>([]);
  const [analyzeResult, setAnalyzeResult] = useState<{
    videoDuration: number;
    sourceWidth: number;
    sourceHeight: number;
    targetWidth: number;
    targetHeight: number;
  } | null>(null);

  // Render state
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderSuccess, setRenderSuccess] = useState(false);

  // ==================== Handlers ====================

  const handleAnalyze = useCallback(async () => {
    setIsAnalyzing(true);
    setAnalyzeError(null);

    try {
      const result = await analyzeForReframe({
        sourceAssetId: assetId,
        targetAspectRatio,
        trackingMode,
        motionSmoothing,
      });

      if (!result) {
        setAnalyzeError('Analysis failed. Please try again.');
        return;
      }

      setCropKeyframes(result.cropKeyframes);
      setAnalyzeResult({
        videoDuration: result.videoDuration,
        sourceWidth: result.sourceWidth,
        sourceHeight: result.sourceHeight,
        targetWidth: result.targetWidth,
        targetHeight: result.targetHeight,
      });
      setStep('review');
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  }, [assetId, targetAspectRatio, trackingMode, motionSmoothing]);

  const handleRender = useCallback(async () => {
    if (cropKeyframes.length === 0 || !analyzeResult) return;

    setIsRendering(true);
    setRenderError(null);

    try {
      const result = await renderReframe({
        sourceAssetId: assetId,
        targetAspectRatio,
        cropKeyframes,
        motionSmoothing,
        outputWidth: analyzeResult.targetWidth,
        outputHeight: analyzeResult.targetHeight,
        storagePath: storagePath || 'iris/videos/reframed',
      });

      if (!result) {
        setRenderError('Render failed. Please try again.');
        return;
      }

      setRenderSuccess(true);
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : 'Render failed');
    } finally {
      setIsRendering(false);
    }
  }, [assetId, targetAspectRatio, cropKeyframes, motionSmoothing, analyzeResult, storagePath]);

  const handleClose = useCallback(() => {
    setStep('configure');
    setCropKeyframes([]);
    setAnalyzeResult(null);
    setAnalyzeError(null);
    setRenderError(null);
    setRenderSuccess(false);
    onClose();
  }, [onClose]);

  const handleBack = useCallback(() => {
    setStep('configure');
    setRenderError(null);
    setRenderSuccess(false);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            {step === 'review' && (
              <button
                onClick={handleBack}
                className="p-1 hover:bg-zinc-800 rounded transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-zinc-400" />
              </button>
            )}
            <Crop className="w-5 h-5 text-blue-400" />
            <h2 className="text-white font-semibold text-lg">
              {step === 'configure' ? 'Auto-Reframe' : 'Preview & Export'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {step === 'configure' ? (
            <>
              {/* Aspect Ratio Selection */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-3 block">
                  Target Aspect Ratio
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {ASPECT_RATIO_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.value}
                        onClick={() => setTargetAspectRatio(option.value)}
                        className={cn(
                          'p-3 rounded-lg border text-left transition-all',
                          targetAspectRatio === option.value
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-zinc-700 hover:border-zinc-600 bg-zinc-800/50'
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className="w-4 h-4 text-zinc-400" />
                          <span className="text-sm font-medium text-white">{option.label}</span>
                        </div>
                        <span className="text-xs text-zinc-500">{option.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tracking Mode */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-3 block">
                  Tracking Mode
                </label>
                <div className="space-y-2">
                  {TRACKING_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => setTrackingMode(mode.value)}
                      className={cn(
                        'w-full p-3 rounded-lg border text-left transition-all',
                        trackingMode === mode.value
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-zinc-700 hover:border-zinc-600 bg-zinc-800/50'
                      )}
                    >
                      <span className="text-sm font-medium text-white">{mode.label}</span>
                      <span className="text-xs text-zinc-500 ml-2">{mode.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Motion Smoothing */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-3 block">
                  Motion Smoothing
                </label>
                <div className="flex gap-2">
                  {SMOOTHING_LEVELS.map((level) => (
                    <button
                      key={level.value}
                      onClick={() => setMotionSmoothing(level.value)}
                      className={cn(
                        'flex-1 py-2 px-3 rounded-lg border text-sm transition-all',
                        motionSmoothing === level.value
                          ? 'border-blue-500 bg-blue-500/10 text-white'
                          : 'border-zinc-700 hover:border-zinc-600 text-zinc-400'
                      )}
                    >
                      {level.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {analyzeError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                  <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span className="text-sm text-red-400">{analyzeError}</span>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Analysis Summary */}
              {analyzeResult && (
                <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Source</span>
                    <span className="text-sm text-white">
                      {analyzeResult.sourceWidth}x{analyzeResult.sourceHeight}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Target Crop</span>
                    <span className="text-sm text-white">
                      {analyzeResult.targetWidth}x{analyzeResult.targetHeight}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Aspect Ratio</span>
                    <span className="text-sm text-blue-400 font-medium">{targetAspectRatio}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Keyframes</span>
                    <span className="text-sm text-white">{cropKeyframes.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Duration</span>
                    <span className="text-sm text-white">
                      {Math.round(analyzeResult.videoDuration)}s
                    </span>
                  </div>
                </div>
              )}

              {/* Visual Preview - simplified crop area visualization */}
              <div className="flex justify-center">
                <div
                  className="relative bg-zinc-800 border border-zinc-600 rounded overflow-hidden"
                  style={{ width: 240, height: 135 }}
                >
                  {/* Source frame */}
                  <div className="absolute inset-0 bg-zinc-700/30" />
                  {/* Crop area overlay */}
                  {analyzeResult && cropKeyframes.length > 0 && (
                    <div
                      className="absolute border-2 border-blue-400 bg-blue-400/10 rounded-sm"
                      style={{
                        left: `${(cropKeyframes[0].x / analyzeResult.sourceWidth) * 100}%`,
                        top: `${(cropKeyframes[0].y / analyzeResult.sourceHeight) * 100}%`,
                        width: `${(cropKeyframes[0].width / analyzeResult.sourceWidth) * 100}%`,
                        height: `${(cropKeyframes[0].height / analyzeResult.sourceHeight) * 100}%`,
                      }}
                    >
                      <span className="absolute -top-5 left-0 text-[10px] text-blue-400">
                        {targetAspectRatio}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Success */}
              {renderSuccess && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-sm text-emerald-400">
                    Reframed video exported successfully!
                  </span>
                </div>
              )}

              {/* Render Error */}
              {renderError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                  <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span className="text-sm text-red-400">{renderError}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-zinc-800 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            {renderSuccess ? 'Done' : 'Cancel'}
          </button>

          {step === 'configure' ? (
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className={cn(
                'flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors',
                isAnalyzing
                  ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              )}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Crop className="w-4 h-4" />
                  Analyze
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleRender}
              disabled={isRendering || renderSuccess || cropKeyframes.length === 0}
              className={cn(
                'flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors',
                isRendering || renderSuccess
                  ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              )}
            >
              {isRendering ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Rendering...
                </>
              ) : renderSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Exported
                </>
              ) : (
                <>
                  <Crop className="w-4 h-4" />
                  Export Reframed
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
