import { memo, useState } from 'react';
import { X, Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useExtensionStore } from '@/features/extensions/stores/extension.store';
import { ReportReason } from '@/shared/api/extension.types';

const REASONS: ReportReason[] = ['spam', 'inappropriate', 'misleading', 'other'];

export const ReportModal = memo(function ReportModal() {
  const { isReportModalOpen, closeReportModal, submitReport, reportTargetReviewId } =
    useExtensionStore();
  const { t } = useTranslation('extensions');

  const [reason, setReason] = useState<ReportReason>('spam');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const success = await submitReport({
        reason,
        description: description.trim() || undefined,
      });
      if (success) {
        setSubmitted(true);
        setTimeout(() => {
          setSubmitted(false);
          setReason('spam');
          setDescription('');
        }, 300);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isReportModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
      <div className="relative w-full max-w-md bg-zinc-900 rounded-2xl border border-zinc-700/50 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-red-400" />
            <h2 className="text-base font-semibold text-white">
              {reportTargetReviewId ? t('report.titleReview') : t('report.title')}
            </h2>
          </div>
          <button
            onClick={closeReportModal}
            className="p-1.5 text-zinc-500 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="p-8 text-center">
            <p className="text-sm text-green-400">{t('report.success')}</p>
          </div>
        ) : (
          <>
            {/* Reason selection */}
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  {t('report.reasonLabel')}
                </label>
                <div className="space-y-2">
                  {REASONS.map((r) => (
                    <label
                      key={r}
                      className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer hover:bg-zinc-800/50 transition-colors"
                    >
                      <input
                        type="radio"
                        name="reason"
                        value={r}
                        checked={reason === r}
                        onChange={() => setReason(r)}
                        className="accent-white"
                      />
                      <span className="text-sm text-zinc-300">
                        {t(`report.reasons.${r}`)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  {t('report.description')}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('report.descriptionPlaceholder')}
                  rows={3}
                  maxLength={2000}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-zinc-500"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-800">
              <button
                onClick={closeReportModal}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                {t('report.cancel')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? t('report.submitting') : t('report.submit')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
