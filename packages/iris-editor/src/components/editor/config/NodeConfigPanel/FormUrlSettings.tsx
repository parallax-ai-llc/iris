'use client';

import { useState, useEffect } from 'react';
import { cn } from '@editor/lib/convert/string';
import { irisApiClient, FormInfo } from '@editor/lib/apis/iris-api-client';
import { toast } from 'sonner';
import { useI18n } from '@editor/hooks/usei18n';
import { ClipboardList, Loader2, Check, Copy, RefreshCw } from 'lucide-react';
import { ConfirmModal } from '../../../common/ConfirmModal';

/**
 * Owner-facing panel for the TRIGGER_FORM node: shows the public form URL
 * (auto-provisioned when the form node is saved) with copy / regenerate.
 */
export function FormUrlSettings({ workflowId }: { workflowId: string }) {
  const { t } = useI18n();
  const [formInfo, setFormInfo] = useState<FormInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  useEffect(() => {
    fetchFormInfo();
  }, [workflowId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchFormInfo = async () => {
    setIsLoading(true);
    try {
      const info = await irisApiClient.getFormInfo(workflowId);
      if (info) {
        setFormInfo(info);
      }
    } catch (error) {
      console.error('Failed to fetch form info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateToken = () => {
    setShowRegenerateConfirm(true);
  };

  const handleConfirmRegenerateToken = async () => {
    setIsGenerating(true);
    try {
      const result = await irisApiClient.regenerateFormToken(workflowId);
      if (result) {
        await fetchFormInfo();
      } else {
        toast.error('Failed to regenerate form URL');
      }
    } catch {
      toast.error('Failed to regenerate form URL');
    } finally {
      setIsGenerating(false);
      setShowRegenerateConfirm(false);
    }
  };

  const handleCopyUrl = () => {
    if (formInfo?.formUrl) {
      navigator.clipboard.writeText(formInfo.formUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="p-3 bg-white/5 rounded-lg border border-white/10">
        <div className="flex items-center gap-2 text-white/50 text-xs">
          <Loader2 size={14} className="animate-spin" />
          Loading form URL…
        </div>
      </div>
    );
  }

  // No token yet (e.g. workflow not saved since the form node was added).
  if (!formInfo?.hasToken || !formInfo.formUrl) {
    return (
      <div className="p-3 bg-white/5 rounded-lg border border-white/10">
        <div className="flex items-center gap-2 mb-1">
          <ClipboardList size={14} className="text-blue-400" />
          <span className="text-xs text-white/70">Form URL</span>
        </div>
        <p className="text-[10px] text-white/40">
          Save the workflow to generate a shareable form URL.
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 bg-white/5 rounded-lg border border-white/10 space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardList size={14} className="text-blue-400" />
        <span className="text-xs text-white/70">Form URL</span>
      </div>

      <div className="flex items-center gap-1">
        <div className="flex-1 bg-white/10 rounded px-2 py-1.5 text-[10px] font-mono text-white/70 truncate">
          {formInfo.formUrl}
        </div>
        <button
          onClick={handleCopyUrl}
          className="p-1.5 bg-white/10 hover:bg-white/20 rounded transition-colors"
          title="Copy URL"
        >
          {copied ? (
            <Check size={12} className="text-green-400" />
          ) : (
            <Copy size={12} className="text-white/70" />
          )}
        </button>
        <button
          onClick={handleRegenerateToken}
          disabled={isGenerating}
          className="p-1.5 bg-white/10 hover:bg-white/20 rounded transition-colors"
          title="Regenerate URL"
        >
          <RefreshCw
            size={12}
            className={cn('text-white/70', isGenerating && 'animate-spin')}
          />
        </button>
      </div>

      <p className="text-[10px] text-white/40">
        Anyone with this link can open the form. Regenerating invalidates the old
        link.
      </p>

      <ConfirmModal
        isOpen={showRegenerateConfirm}
        onClose={() => !isGenerating && setShowRegenerateConfirm(false)}
        onConfirm={handleConfirmRegenerateToken}
        type="warning"
        title="Regenerate form URL"
        message="The current link will stop working. Anyone using it will need the new link."
        confirmLabel="Regenerate"
        cancelLabel={t('iris.messages.cancel') || 'Cancel'}
        isLoading={isGenerating}
      />
    </div>
  );
}
