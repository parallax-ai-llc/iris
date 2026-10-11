/**
 * RelightPanel - AI relighting (fal IC-Light V2, same server request as iris/web).
 *
 * Preset, direction and color become one lighting sentence (buildRelightPrompt).
 * Strength is the result layer's opacity, so changing it later costs nothing.
 * The result is scaled to the canvas, masked by the selection when asked, and
 * added as one undoable layer (applyAIResultLayer).
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Coins, Info, Lightbulb, LogIn } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { toast } from '@/shared/lib/toast';
import { IS_SELF_HOST } from '@/config/self-host';
import { useUIStore } from '@/shared/stores/ui.store';
import { formatTokenCost } from '@/shared/hooks/useTokenCost';
import { useImageEditTokenCost } from '@/shared/hooks/useImageEditTokenCost';
import {
  AssetEditError,
  EditWaitAbortedError,
  relightImage,
  waitForEditResult,
} from '@/shared/api/image.api';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { getActiveStore } from '@/features/image-editor/stores/imageEditorRegistry';
import { useAIOperation } from '@/features/image-editor/hooks/useAIOperation';
import { MergeLayersDialog } from '@/features/image-editor/components/shared/MergeLayersDialog';
import { applyAIResultLayer } from '@/features/image-editor/lib/aiResultLayer';
import {
  buildRelightPrompt,
  PRESET_PROMPTS,
  RELIGHT_COLORS,
  RELIGHT_CUSTOM_PROMPT_MAX,
  RELIGHT_PRESETS,
  type RelightColor,
  type RelightDirection,
  type RelightPreset,
} from '@/features/image-editor/lib/relightPrompt';
import { RelightDirectionPicker } from './RelightDirectionPicker';

const SECTION_TITLE = 'text-xs font-medium text-zinc-300 uppercase tracking-wider';

export const RelightPanel = memo(function RelightPanel() {
  const { t } = useTranslation('editor');
  const sourceAsset = useImageEditorStore((s) => s.sourceAsset);
  const isProcessing = useImageEditorStore((s) => s.isProcessing);
  const processingProgress = useImageEditorStore((s) => s.processingProgress);
  const layers = useImageEditorStore((s) => s.layers);
  const hasSelection = useImageEditorStore((s) => !!s.selection?.maskDataUrl);
  const openEditor = useImageEditorStore((s) => s.openEditor);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const openLogin = useUIStore((s) => s.openLogin);

  const [preset, setPreset] = useState<RelightPreset>('natural');
  const [direction, setDirection] = useState<RelightDirection>('auto');
  const [color, setColor] = useState<RelightColor>('auto');
  const [intensity, setIntensity] = useState(100);
  const [customPrompt, setCustomPrompt] = useState('');
  const [addAsNewLayer, setAddAsNewLayer] = useState(true);
  const [onlySelection, setOnlySelection] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);

  const { cost: tokenCost, isLoading: costLoading } = useImageEditTokenCost('relight');
  const { prepareAssetForAI, mergeDialogProps } = useAIOperation();
  const abortRef = useRef<AbortController | null>(null);

  // Closing the panel stops waiting (the server job itself keeps running).
  useEffect(() => () => abortRef.current?.abort(), []);

  const canRun = isAuthenticated && !IS_SELF_HOST && !!sourceAsset?.id && !isProcessing;
  const isCustom = customPrompt.trim().length > 0;
  const usesLayer = addAsNewLayer || layers.length === 0;

  const handleRelight = useCallback(async () => {
    if (!canRun) return;
    setError(null);

    const assetId = await prepareAssetForAI();
    if (!assetId) return;

    // Bind to the tab that started the job, even if the user switches tabs.
    const store = getActiveStore();
    const editor = () => store.getState();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsWaiting(true);
    const prompt = buildRelightPrompt({ preset, direction, color, custom: customPrompt });

    editor().setProcessing(true, t('relight.processing'));
    editor().setProcessingProgress(0);
    try {
      const job = await relightImage(assetId, { prompt });
      const asset = await waitForEditResult(job.id, {
        signal: controller.signal,
        onProgress: (p) => editor().setProcessingProgress(p),
      });

      if (usesLayer && editor().layers.length > 0) {
        const url = asset.previewUrl || asset.publicUrl;
        if (!url) throw new AssetEditError(t('relight.errors.applyFailed'));
        editor().setProcessingProgress(95);
        try {
          await applyAIResultLayer(store, url, {
            name: t('relight.layerName'),
            historyLabel: 'Relight',
            opacity: intensity,
            maskToSelection: onlySelection,
          });
        } catch {
          throw new AssetEditError(t('relight.errors.applyFailed'));
        }
        toast.success(t('relight.successToast'));
      } else {
        openEditor(asset);
      }
    } catch (err) {
      if (err instanceof EditWaitAbortedError) {
        toast.success(t('relight.stoppedToast'));
        return;
      }
      const status = err instanceof AssetEditError ? err.statusCode : undefined;
      const message =
        status === 401
          ? t('relight.errors.loginRequired')
          : status === 402
            ? t('relight.errors.insufficientCredits')
            : err instanceof Error && err.message === 'Processing timeout'
              ? t('relight.errors.timeout')
              : `${t('relight.errors.failed')} ${err instanceof Error ? err.message : ''}`.trim();
      setError(message);
      toast.error(message);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsWaiting(false);
      editor().setProcessing(false);
    }
  }, [canRun, prepareAssetForAI, preset, direction, color, customPrompt, t, usesLayer, intensity, onlySelection, openEditor]);

  const handleStopWaiting = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const inputsDisabled = isProcessing;

  return (
    <div className="p-4 space-y-5" data-testid="relight-panel">
      <MergeLayersDialog {...mergeDialogProps} />

      <div className="flex items-start gap-2 p-3 bg-zinc-800/50 rounded-lg">
        <Info className="w-4 h-4 text-zinc-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-zinc-400">{t('relight.description')}</p>
      </div>

      {/* Preset */}
      <div className="space-y-2">
        <h3 className={SECTION_TITLE}>{t('relight.preset.label')}</h3>
        <div className="grid grid-cols-2 gap-2">
          {RELIGHT_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={preset === p}
              onClick={() => setPreset(p)}
              disabled={inputsDisabled || isCustom}
              className={cn(
                'flex items-center gap-2 py-2 px-3 rounded-lg text-sm text-left transition-colors',
                preset === p
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white',
                (inputsDisabled || isCustom) && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
              {t(`relight.preset.${p}`)}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-zinc-500">{PRESET_PROMPTS[preset]}</p>
      </div>

      {/* Direction */}
      <div className="space-y-2">
        <h3 className={SECTION_TITLE}>{t('relight.direction.label')}</h3>
        <div className="flex items-center gap-3">
          <RelightDirectionPicker
            value={direction}
            onChange={setDirection}
            disabled={inputsDisabled || isCustom}
          />
          <span className="text-xs text-zinc-400">{t(`relight.direction.${direction}`)}</span>
        </div>
      </div>

      {/* Color */}
      <div className="space-y-2">
        <h3 className={SECTION_TITLE}>{t('relight.color.label')}</h3>
        <div className="flex flex-wrap gap-1.5">
          {RELIGHT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              disabled={inputsDisabled || isCustom}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs transition-colors',
                color === c
                  ? 'bg-white/15 text-white ring-1 ring-white/30'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white',
                (inputsDisabled || isCustom) && 'opacity-50 cursor-not-allowed'
              )}
            >
              {t(`relight.color.${c}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Strength = result layer opacity */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="relight-intensity" className={SECTION_TITLE}>
            {t('relight.intensity.label')}
          </label>
          <span className="text-xs text-zinc-500">{intensity}%</span>
        </div>
        <input
          id="relight-intensity"
          type="range"
          min={0}
          max={100}
          value={intensity}
          onChange={(e) => setIntensity(Number(e.target.value))}
          disabled={inputsDisabled}
          className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
            [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <p className="text-[11px] text-zinc-500">{t('relight.intensity.hint')}</p>
      </div>

      {/* Custom description */}
      <div className="space-y-2">
        <label htmlFor="relight-custom" className={SECTION_TITLE}>
          {t('relight.custom.label')}
        </label>
        <textarea
          id="relight-custom"
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value.slice(0, RELIGHT_CUSTOM_PROMPT_MAX))}
          disabled={inputsDisabled}
          placeholder={t('relight.custom.placeholder')}
          rows={3}
          className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-500 resize-none focus:outline-none focus:border-white/30"
        />
        <p className="text-[11px] text-zinc-500">{t('relight.custom.hint')}</p>
      </div>

      {/* Output options */}
      <div className="space-y-2">
        {layers.length > 0 && (
          <label className="flex items-start gap-3 p-3 bg-zinc-800 rounded-lg cursor-pointer hover:bg-zinc-700 transition-colors">
            <input
              type="checkbox"
              checked={addAsNewLayer}
              onChange={(e) => setAddAsNewLayer(e.target.checked)}
              disabled={inputsDisabled}
              className="mt-0.5 w-4 h-4 rounded border-zinc-600 bg-zinc-700"
            />
            <div>
              <span className="text-sm text-zinc-300">{t('relight.output.newLayer')}</span>
              <p className="text-xs text-zinc-500">
                {addAsNewLayer ? t('relight.output.newLayerHint') : t('relight.output.replaceWarning')}
              </p>
            </div>
          </label>
        )}
        {hasSelection && usesLayer && (
          <label className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg cursor-pointer hover:bg-zinc-700 transition-colors">
            <input
              type="checkbox"
              checked={onlySelection}
              onChange={(e) => setOnlySelection(e.target.checked)}
              disabled={inputsDisabled}
              className="w-4 h-4 rounded border-zinc-600 bg-zinc-700"
            />
            <span className="text-sm text-zinc-300">{t('relight.output.onlySelection')}</span>
          </label>
        )}
        <p className="text-[11px] text-zinc-500">{t('relight.output.resolutionNote')}</p>
      </div>

      {/* Account notice */}
      {IS_SELF_HOST ? (
        <div className="p-3 bg-zinc-800/60 border border-zinc-700 rounded-lg">
          <p className="text-xs text-zinc-400">{t('relight.selfHostNotice')}</p>
        </div>
      ) : !isAuthenticated ? (
        <div className="p-3 bg-zinc-800/60 border border-zinc-700 rounded-lg space-y-2">
          <p className="text-xs text-zinc-400">{t('relight.loginRequired')}</p>
          <button
            type="button"
            onClick={openLogin}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-neutral-900 text-xs font-medium hover:bg-zinc-200"
          >
            <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
            {t('relight.loginButton')}
          </button>
        </div>
      ) : null}

      {error && (
        <div role="alert" className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {isWaiting && (
        <div className="space-y-2">
          <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-white/70 transition-all"
              style={{ width: `${Math.round(processingProgress)}%` }}
            />
          </div>
          <button
            type="button"
            onClick={handleStopWaiting}
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 text-xs text-zinc-300 hover:bg-zinc-700"
          >
            {t('relight.stopWaiting')}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={handleRelight}
        disabled={!canRun}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg',
          'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white',
          'text-sm font-medium transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        <Lightbulb className="w-4 h-4" aria-hidden="true" />
        {isProcessing ? t('relight.processing') : t('relight.run')}
        {tokenCost > 0 && !costLoading && (
          <span className="flex items-center gap-1 ml-1 px-2 py-0.5 rounded-full bg-neutral-900/20 text-xs">
            <Coins className="w-3 h-3" aria-hidden="true" />
            {formatTokenCost(tokenCost)}
          </span>
        )}
      </button>
    </div>
  );
});

export default RelightPanel;
