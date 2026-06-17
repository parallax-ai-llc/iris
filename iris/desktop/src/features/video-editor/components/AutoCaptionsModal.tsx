/**
 * AutoCaptionsModal — AI-powered auto subtitle generation
 * Uses Whisper/GPT-4o transcription via the subtitle API.
 */

import { memo, useState, useCallback, useMemo, useEffect } from 'react';
import { X, Captions, Loader2, Check, Languages, Coins, Eraser } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { generateSubtitles, removeFillerWords } from '@/shared/api/subtitle.api';
import { useEditorStore } from '@/features/video-editor/stores/editor.store';
import { useTokenCostsStore } from '@/shared/stores/token-costs';
import { useConnectionStore } from '@/shared/stores/connection.store';
import { formatTokenCost } from '@/shared/hooks/useTokenCost';

interface AutoCaptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetId: string;
  duration?: number;
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


export const AutoCaptionsModal = memo(function AutoCaptionsModal({
  isOpen,
  onClose,
  assetId,
  duration,
}: AutoCaptionsModalProps) {
  const [language, setLanguage] = useState('en');
  const [model, setModel] = useState('gpt-4o-mini-transcribe');
  const [removeFillers, setRemoveFillers] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fillerInfo, setFillerInfo] = useState<string | null>(null);

  const { t } = useTranslation('editor');

  const importSubtitleCues = useEditorStore((s) => s.importSubtitleCues);
  const { costs, fetchTokenCosts, getModelTokenCost } = useTokenCostsStore();
  const isServerDisabled = !useConnectionStore((s) => s.isServerConnected);

  const MODELS = useMemo(() => [
    {
      value: 'gpt-4o-mini-transcribe',
      label: t('autoCaptions.models.gpt4oMiniTranscribe.label'),
      description: t('autoCaptions.models.gpt4oMiniTranscribe.description'),
    },
    {
      value: 'gpt-4o-transcribe',
      label: t('autoCaptions.models.gpt4oTranscribe.label'),
      description: t('autoCaptions.models.gpt4oTranscribe.description'),
    },
    {
      value: 'whisper-1',
      label: t('autoCaptions.models.whisper1.label'),
      description: t('autoCaptions.models.whisper1.description'),
    },
  ], [t]);

  useEffect(() => {
    if (isOpen) fetchTokenCosts();
  }, [isOpen, fetchTokenCosts]);

  // Cost for currently selected model
  const tokenCost = useMemo(
    () => getModelTokenCost(model, 'GEN_SPEECH_TO_TEXT', { durationSeconds: duration }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, duration, costs, getModelTokenCost]
  );

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    setSuccess(false);
    setFillerInfo(null);

    try {
      const result = await generateSubtitles({
        assetId,
        language,
        model,
        name: `Auto Captions (${language})`,
      });
      if (result && result.cues && result.cues.length > 0) {
        // Remove filler words if option is enabled
        if (removeFillers && result.id) {
          const fillerResult = await removeFillerWords(result.id, { language });
          if (fillerResult && fillerResult.removedCount > 0) {
            setFillerInfo(t('autoCaptions.fillerRemoved', { count: fillerResult.removedCount }));
            // Import the cleaned cues
            importSubtitleCues(fillerResult.subtitle.cues);
          } else {
            importSubtitleCues(result.cues);
          }
        } else {
          importSubtitleCues(result.cues);
        }
        setSuccess(true);
        setTimeout(onClose, 1500);
      } else {
        setError(t('autoCaptions.errorNoSpeech'));
      }
    } catch {
      setError(t('autoCaptions.errorFailed'));
    } finally {
      setIsGenerating(false);
    }
  }, [assetId, language, model, removeFillers, importSubtitleCues, onClose, t]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Captions className="w-5 h-5 text-zinc-400" />
            {t('autoCaptions.title')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          <p className="text-sm text-zinc-400">
            {t('autoCaptions.description')}
          </p>

          {/* Language */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 uppercase tracking-wide">
              <Languages className="w-3.5 h-3.5" />
              {t('autoCaptions.spokenLanguage')}
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={isGenerating}
              className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/30 disabled:opacity-50"
            >
              {LANGUAGES.map(({ code, label }) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">{t('autoCaptions.model')}</label>
            <div className="space-y-1.5">
              {MODELS.map(({ value, label, description }) => {
                const cost = getModelTokenCost(value, 'GEN_SPEECH_TO_TEXT', { durationSeconds: duration });
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
                    <div className={cn(
                      'w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center',
                      model === value ? 'border-white bg-white' : 'border-zinc-600'
                    )}>
                      {model === value && <div className="w-1.5 h-1.5 rounded-full bg-zinc-900" />}
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
            <div className={cn(
              'w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors',
              removeFillers ? 'bg-white border-white' : 'border-zinc-600'
            )}>
              {removeFillers && <Check className="w-3 h-3 text-zinc-900" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <Eraser className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-sm text-white">{t('autoCaptions.removeFillerWords')}</span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                {t('autoCaptions.removeFillerWordsHint')}
              </p>
            </div>
          </label>

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
                {t('autoCaptions.captionsAdded')}
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
          {/* Token cost for selected model */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            {tokenCost > 0 && (
              <>
                <Coins className="w-3.5 h-3.5" />
                <span>{formatTokenCost(tokenCost)} {t('autoCaptions.tokens')}</span>
                {duration != null && (
                  <span className="text-zinc-600">· {duration.toFixed(0)}s</span>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isGenerating}
              className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {t('autoCaptions.cancel')}
            </button>
            <button
              onClick={handleGenerate}
              disabled={isGenerating || success || isServerDisabled}
              title={isServerDisabled ? t('header.serverRequired') : undefined}
              className={cn(
                'flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
                isGenerating || success || isServerDisabled
                  ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                  : 'bg-white text-zinc-900 hover:bg-zinc-100'
              )}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('autoCaptions.generating')}
                </>
              ) : success ? (
                <>
                  <Check className="w-4 h-4" />
                  {t('autoCaptions.done')}
                </>
              ) : (
                <>
                  <Captions className="w-4 h-4" />
                  {t('autoCaptions.generateCaptions')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default AutoCaptionsModal;
