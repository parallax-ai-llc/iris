/**
 * PresetCreatorModal - Unified modal for all preset image generation tools.
 * Handles both reference-image and text-input preset types.
 */

import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import {
  X,
  Upload,
  Loader2,
  Sparkles,
  FolderOpen,
  Coins,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { PRESET_TEMPLATES } from '@/config/preset-templates';
import { generateImage, getAssetStatus, uploadImage } from '@/shared/api/image.api';
import { useImageStore } from '@/features/images/stores/image.store';
import { useTokenCostsStore } from '@/shared/stores/token-costs';
import { formatTokenCost } from '@/shared/hooks/useTokenCost';
import { CachedImage } from '@/shared/components/common';
import { StorageAssetPickerModal } from '@/features/storage/components';
import type { IrisAsset } from '@/shared/api/types';

interface PresetCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  presetMode: string;
  /** When opened from editor, auto-use this asset as reference */
  referenceAsset?: IrisAsset | null;
}

export const PresetCreatorModal = memo(function PresetCreatorModal({
  isOpen,
  onClose,
  presetMode,
  referenceAsset,
}: PresetCreatorModalProps) {
  const template = PRESET_TEMPLATES[presetMode];
  const fetchImages = useImageStore((s) => s.fetchImages);
  const model = useImageStore((s) => s.model);

  // Token cost (model-based dynamic pricing)
  const { costs, fetchTokenCosts, getModelTokenCost } = useTokenCostsStore();

  useEffect(() => {
    fetchTokenCosts();
  }, [fetchTokenCosts]);

  const tokenCost = useMemo(() => {
    if (!model) return costs['GEN_TEXT_TO_IMAGE'] ?? 0;
    const modelCost = getModelTokenCost(model, 'GEN_TEXT_TO_IMAGE');
    return modelCost > 0 ? modelCost : (costs['GEN_TEXT_TO_IMAGE'] ?? 0);
  }, [model, getModelTokenCost, costs]);

  // States
  const [customPrompt, setCustomPrompt] = useState('');
  const [textInput, setTextInput] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<IrisAsset | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStoragePickerOpen, setIsStoragePickerOpen] = useState(false);

  // Initialize reference asset from props
  useEffect(() => {
    if (referenceAsset && isOpen) {
      setSelectedAsset(referenceAsset);
    }
  }, [referenceAsset, isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCustomPrompt('');
      setTextInput('');
      setSelectedAsset(null);
      setError(null);
      setIsGenerating(false);
    }
  }, [isOpen]);

  const handleSelectFromLibrary = useCallback((asset: IrisAsset) => {
    setSelectedAsset(asset);
    setIsStoragePickerOpen(false);
  }, []);

  const handleUploadFile = useCallback(async () => {
    if (!window.electronAPI?.files?.selectFile) return;

    const filePath = await window.electronAPI.files.selectFile({
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });

    if (filePath) {
      const fileData = await window.electronAPI.files.readFile(filePath);
      if (fileData) {
        const fileName = filePath.split(/[/\\]/).pop() || 'reference';
        const file = new File([fileData], fileName, { type: 'image/png' });
        const result = await uploadImage(file, { name: `preset_ref_${fileName}` });
        if (result) {
          setSelectedAsset(result);
        }
      }
    }
  }, []);

  const handleClearReference = useCallback(() => {
    setSelectedAsset(null);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!template) return;

    // Build final prompt
    let finalPrompt = template.prompt;

    if (!template.requiresReferenceImage && template.textInputLabel) {
      // Text-input presets: replace {INPUT} placeholder
      if (!textInput.trim()) {
        setError(`Please enter a ${template.textInputLabel?.toLowerCase() || 'value'}.`);
        return;
      }
      finalPrompt = finalPrompt.replace('{INPUT}', textInput.trim());
    }

    if (template.requiresReferenceImage && !selectedAsset) {
      setError('Please select or upload a reference image.');
      return;
    }

    // Append custom prompt
    if (customPrompt.trim()) {
      finalPrompt += `\n\nAdditional details: ${customPrompt.trim()}`;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const result = await generateImage({
        prompt: finalPrompt,
        aspectRatio: template.aspectRatio,
        storagePath: 'images',
        presetMode: template.mode,
        ...(selectedAsset ? { referenceAssetId: selectedAsset.id } : {}),
      });

      if (!result) {
        setError('Failed to start generation. Please try again.');
        setIsGenerating(false);
        return;
      }

      // Poll for completion
      let attempts = 0;
      const maxAttempts = 60;
      const pollInterval = setInterval(async () => {
        attempts++;
        const status = await getAssetStatus(result.id);

        if (!status) {
          if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            setError('Generation timed out. Check the gallery for results.');
            setIsGenerating(false);
          }
          return;
        }

        if (status.status === 'READY' || status.status === 'COMPLETED') {
          clearInterval(pollInterval);
          setIsGenerating(false);
          fetchImages();
          onClose();
        } else if (status.status === 'FAILED' || status.status === 'ERROR') {
          clearInterval(pollInterval);
          setError(status.error || 'Generation failed. Please try again.');
          setIsGenerating(false);
        }
      }, 2000);
    } catch {
      setError('An error occurred. Please try again.');
      setIsGenerating(false);
    }
  }, [template, textInput, customPrompt, selectedAsset, fetchImages, onClose]);

  if (!isOpen || !template) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={!isGenerating ? onClose : undefined}
        />

        {/* Modal */}
        <div className="relative z-10 w-full max-w-2xl max-h-[85vh] bg-zinc-900 rounded-2xl border border-zinc-700 shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-white/60" />
              <div>
                <h2 className="text-lg font-semibold text-white">{template.title}</h2>
                <p className="text-xs text-zinc-400">{template.description}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isGenerating}
              className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Sample Preview */}
            <div className="rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700">
              <img
                src={template.sampleImageUrl}
                alt={`${template.title} sample`}
                className="w-full h-48 object-cover"
              />
            </div>

            {/* Reference Image Section (for image-based presets) */}
            {template.requiresReferenceImage && (
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Reference Image <span className="text-red-400">*</span>
                </label>

                {selectedAsset ? (
                  <div className="relative rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700">
                    <CachedImage
                      asset={selectedAsset}
                      type="preview"
                      className="w-full h-40 object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                      <span className="text-xs text-white truncate max-w-[70%]">
                        {selectedAsset.name || 'Reference image'}
                      </span>
                      <button
                        onClick={handleClearReference}
                        disabled={isGenerating}
                        className="p-1.5 bg-zinc-900/80 hover:bg-red-500/60 rounded-lg text-white transition-colors disabled:opacity-50"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      onClick={() => setIsStoragePickerOpen(true)}
                      disabled={isGenerating}
                      className={cn(
                        'w-full py-3 rounded-xl border border-zinc-700',
                        'flex items-center justify-center gap-2',
                        'bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 hover:text-white',
                        'transition-colors cursor-pointer',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                    >
                      <FolderOpen className="w-5 h-5" />
                      <span className="text-sm font-medium">Select from Library</span>
                    </button>

                    <button
                      onClick={handleUploadFile}
                      disabled={isGenerating}
                      className={cn(
                        'w-full py-2.5 rounded-xl border-2 border-dashed border-zinc-700',
                        'flex items-center justify-center gap-2',
                        'text-zinc-500 hover:text-zinc-400 hover:border-zinc-600',
                        'transition-colors cursor-pointer',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                    >
                      <Upload className="w-4 h-4" />
                      <span className="text-xs">Upload from Computer</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Text Input Section (for location-based presets) */}
            {!template.requiresReferenceImage && template.textInputLabel && (
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  {template.textInputLabel} <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder={template.textInputPlaceholder}
                  disabled={isGenerating}
                  className={cn(
                    'w-full px-4 py-3 rounded-xl',
                    'bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500',
                    'focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'text-sm'
                  )}
                />
              </div>
            )}

            {/* Custom Prompt */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Additional Details (Optional)
              </label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder={template.customPromptPlaceholder || 'Add specific details to customize the output...'}
                disabled={isGenerating}
                className={cn(
                  'w-full h-24 px-4 py-3 rounded-xl resize-none',
                  'bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500',
                  'focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'text-sm leading-relaxed'
                )}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-900/30 border border-red-700/50">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-zinc-800 space-y-3">
            {/* Token cost */}
            {tokenCost > 0 && (
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1 text-zinc-400">
                  <Coins className="w-3 h-3" />
                  <span>Estimated credits</span>
                </div>
                <span className="text-zinc-300">{formatTokenCost(tokenCost)} credits</span>
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className={cn(
                'w-full py-3 rounded-xl font-semibold transition-all',
                'bg-gradient-to-r from-slate-300 via-white to-slate-300',
                'hover:from-white hover:to-white',
                'active:scale-[0.98]',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
                'text-neutral-900 flex items-center justify-center gap-2'
              )}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate {template.title}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Storage Asset Picker */}
      <StorageAssetPickerModal
        isOpen={isStoragePickerOpen}
        onClose={() => setIsStoragePickerOpen(false)}
        onSelect={handleSelectFromLibrary}
        assetType="IMAGE"
        title="Select Reference Image"
        description={`Choose a reference image for ${template.title}`}
      />
    </>
  );
});
