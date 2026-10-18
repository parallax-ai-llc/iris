'use client';

import { useState, useEffect } from 'react';
import { cn } from '@editor/lib/convert/string';
import { irisApiClient, WebhookInfo } from '@editor/lib/apis/iris-api-client';
import { toast } from 'sonner';
import { useI18n } from '@editor/hooks/usei18n';
import { Webhook, Loader2, Check, Copy, RefreshCw } from 'lucide-react';
import { ConfirmModal } from '../../../common/ConfirmModal';

export function WebhookUrlSettings({ workflowId }: { workflowId: string }) {
  const { t } = useI18n();
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  useEffect(() => {
    fetchWebhookInfo();
  }, [workflowId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchWebhookInfo = async () => {
    setIsLoading(true);
    try {
      const info = await irisApiClient.getWebhookInfo(workflowId);
      if (info) {
        setWebhookInfo(info);
      }
    } catch (error) {
      console.error('Failed to fetch webhook info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateToken = async () => {
    setIsGenerating(true);
    try {
      const result = await irisApiClient.generateWebhookToken(workflowId);
      if (result) {
        await fetchWebhookInfo();
      } else {
        toast.error('Failed to generate webhook URL');
      }
    } catch {
      toast.error('Failed to generate webhook URL');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerateToken = () => {
    setShowRegenerateConfirm(true);
  };

  const handleConfirmRegenerateToken = async () => {
    setIsGenerating(true);
    try {
      const result = await irisApiClient.regenerateWebhookToken(workflowId);
      if (result) {
        await fetchWebhookInfo();
      } else {
        toast.error('Failed to regenerate webhook URL');
      }
    } catch {
      toast.error('Failed to regenerate webhook URL');
    } finally {
      setIsGenerating(false);
      setShowRegenerateConfirm(false);
    }
  };

  const handleCopyUrl = () => {
    if (webhookInfo?.webhookUrl) {
      navigator.clipboard.writeText(webhookInfo.webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleToggleEnabled = async () => {
    if (!webhookInfo) return;

    const newEnabled = !webhookInfo.enabled;
    setWebhookInfo({ ...webhookInfo, enabled: newEnabled });

    try {
      const success = await irisApiClient.updateWebhookSettings(workflowId, {
        enabled: newEnabled,
      });
      if (!success) {
        setWebhookInfo({ ...webhookInfo, enabled: !newEnabled });
        toast.error('Failed to update webhook');
      }
    } catch {
      setWebhookInfo({ ...webhookInfo, enabled: !newEnabled });
      toast.error('Failed to update webhook');
    }
  };

  if (isLoading) {
    return (
      <div className="p-3 bg-white/5 rounded-lg border border-white/10">
        <div className="flex items-center gap-2 text-white/50 text-xs">
          <Loader2 size={14} className="animate-spin" />
          {t('iris.nodeConfig.loadingWebhook')}
        </div>
      </div>
    );
  }

  if (!webhookInfo?.hasToken) {
    return (
      <div className="p-3 bg-white/5 rounded-lg border border-white/10">
        <div className="flex items-center gap-2 mb-2">
          <Webhook size={14} className="text-blue-400" />
          <span className="text-xs text-white/70">{t('iris.nodeConfig.webhookUrl')}</span>
        </div>
        <button
          onClick={handleGenerateToken}
          disabled={isGenerating}
          className="w-full py-2 bg-slate-400 hover:bg-slate-300 text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              {t('iris.nodeConfig.generating')}
            </>
          ) : (
            <>
              <Webhook size={12} />
              {t('iris.nodeConfig.generateWebhook')}
            </>
          )}
        </button>
        <p className="text-[10px] text-white/40 mt-1">
          {t('iris.nodeConfig.generateHint')}
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 bg-white/5 rounded-lg border border-white/10 space-y-3">
      {/* Header with enable toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Webhook size={14} className="text-blue-400" />
          <span className="text-xs text-white/70">{t('iris.nodeConfig.webhookUrl')}</span>
        </div>
        <button
          onClick={handleToggleEnabled}
          className={cn(
            'relative w-9 h-5 rounded-full transition-colors duration-200',
            webhookInfo.enabled ? 'bg-green-500' : 'bg-white/20'
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200',
              webhookInfo.enabled ? 'translate-x-4' : 'translate-x-0'
            )}
          />
        </button>
      </div>

      {/* URL display */}
      <div className="flex items-center gap-1">
        <div className="flex-1 bg-white/10 rounded px-2 py-1.5 text-[10px] font-mono text-white/70 truncate">
          {webhookInfo.webhookUrl}
        </div>
        <button
          onClick={handleCopyUrl}
          className="p-1.5 bg-white/10 hover:bg-white/20 rounded transition-colors"
          title={t('iris.nodeConfig.copyUrl')}
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
          title={t('iris.nodeConfig.regenerateUrl')}
        >
          <RefreshCw size={12} className={cn('text-white/70', isGenerating && 'animate-spin')} />
        </button>
      </div>

      <ConfirmModal
        isOpen={showRegenerateConfirm}
        onClose={() => !isGenerating && setShowRegenerateConfirm(false)}
        onConfirm={handleConfirmRegenerateToken}
        type="warning"
        title={t('iris.nodeConfig.regenerateUrl') || 'Regenerate webhook URL'}
        message={t('iris.nodeConfig.regenerateConfirm')}
        confirmLabel={t('iris.nodeConfig.regenerateUrl') || 'Regenerate'}
        cancelLabel={t('iris.messages.cancel') || 'Cancel'}
        isLoading={isGenerating}
      />
    </div>
  );
}
