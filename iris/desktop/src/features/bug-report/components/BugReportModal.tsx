import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Loader2, X } from 'lucide-react';
import { apiClient } from '@/shared/api/client';
import { toast } from '@/shared/lib/toast';

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const submissionTimestamps: number[] = [];

function isRateLimited(): boolean {
  const now = Date.now();
  while (submissionTimestamps.length > 0 && now - submissionTimestamps[0] > RATE_LIMIT_WINDOW_MS) {
    submissionTimestamps.shift();
  }
  return submissionTimestamps.length >= RATE_LIMIT_MAX;
}

function recordSubmission(): void {
  submissionTimestamps.push(Date.now());
}

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  screenshotDataUrl: string | null;
}

export function BugReportModal({ isOpen, onClose, screenshotDataUrl }: BugReportModalProps) {
  const { t } = useTranslation('common');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<'success' | 'error' | null>(null);

  const handleClose = useCallback(() => {
    setMessage('');
    setSubmitResult(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleClose]);

  const rateLimited = isRateLimited();

  const handleSubmit = useCallback(async () => {
    if (!message.trim() || !screenshotDataUrl || isSubmitting || isRateLimited()) return;

    setIsSubmitting(true);
    setSubmitResult(null);

    try {
      const response = await fetch(screenshotDataUrl);
      const blob = await response.blob();
      const appVersion = await window.electronAPI?.app?.getVersion();
      const platform = window.electronAPI?.app?.getPlatform?.() || navigator.platform;

      const result = await apiClient.uploadFile(
        '/api/bug-reports',
        blob,
        'screenshot',
        {
          message: message.trim(),
          ...(appVersion && { appVersion }),
          ...(platform && { platform }),
        },
        { requireAuth: true }
      );

      if (result.success) {
        recordSubmission();
        handleClose();
        toast.success(
          t('titleBar.bugReportThankYou', 'Thank you for your report! We will review it shortly.')
        );
      } else {
        setSubmitResult('error');
      }
    } catch {
      setSubmitResult('error');
    } finally {
      setIsSubmitting(false);
    }
  }, [message, screenshotDataUrl, isSubmitting, handleClose, t]);

  if (!isOpen) return null;

  return (
    <div className="dt-modal-backdrop" onClick={handleClose}>
      <div className="dt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dt-modal-head">
          <div className="dt-modal-title">{t('titleBar.bugReport', 'Bug Report')}</div>
          <button onClick={handleClose} className="btn btn-ghost btn-sm" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {screenshotDataUrl && (
          <div>
            <label className="dt-field-label">Screenshot</label>
            <div className="dt-modal-screenshot">
              <img src={screenshotDataUrl} alt="Screenshot" />
            </div>
          </div>
        )}

        <div>
          <label className="dt-field-label">
            {t('titleBar.bugReportMessageLabel', 'Description')}
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('titleBar.bugReportPlaceholder', 'Please describe the bug…')}
            rows={5}
            maxLength={2000}
            className="iris-textarea"
            style={{ resize: 'none' }}
          />
          <div
            className="mono text-right mt-1"
            style={{ fontSize: 11, color: 'var(--text-4)' }}
          >
            {message.length} / 2000
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          {submitResult === 'error' && (
            <span style={{ fontSize: 12.5, color: 'var(--err)' }}>
              {t('titleBar.bugReportError', 'Failed to submit bug report')}
            </span>
          )}
          {!submitResult && rateLimited && (
            <span style={{ fontSize: 12.5, color: 'var(--warn)' }}>
              {t('titleBar.bugReportRateLimit', 'Too many reports. Please try again later.')}
            </span>
          )}
          {!submitResult && !rateLimited && <span />}
          <div className="dt-modal-actions" style={{ flex: 1 }}>
            <button onClick={handleClose} className="btn btn-ghost">
              {t('buttons.cancel', 'Cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={!message.trim() || isSubmitting || rateLimited}
              className="btn btn-primary"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {t('titleBar.bugReportSubmit', 'Submit')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
