import { memo, useState } from 'react';
import { Send, Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ExtensionReview } from '@/shared/api/extension.types';
import { StarRating } from './StarRating';
import { useExtensionStore } from '@/features/extensions/stores/extension.store';

interface ReviewSectionProps {
  reviews: ExtensionReview[];
  extensionId: string;
  onSubmitReview: (rating: number, title?: string, content?: string) => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export const ReviewSection = memo(function ReviewSection({
  reviews,
  extensionId,
  onSubmitReview,
}: ReviewSectionProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { t } = useTranslation('extensions');
  const openReportModal = useExtensionStore((s) => s.openReportModal);

  const handleSubmit = async () => {
    if (rating === 0) return;
    setIsSubmitting(true);
    try {
      onSubmitReview(rating, undefined, comment || undefined);
      setRating(0);
      setComment('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Review form */}
      <div className="mb-6 p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
        <h4 className="text-sm font-medium text-white mb-3">
          {t('review.writeReview')}
        </h4>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-zinc-500">{t('review.yourRating')}</span>
          <StarRating rating={rating} size="md" interactive onChange={setRating} />
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t('review.yourComment')}
          rows={3}
          className="w-full bg-zinc-900/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-zinc-500"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={handleSubmit}
            disabled={rating === 0 || isSubmitting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-zinc-900 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-3 h-3" />
            {t('review.submit')}
          </button>
        </div>
      </div>

      {/* Review list */}
      {reviews.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-8">
          {t('review.noReviews')}
        </p>
      ) : (
        <div className="space-y-0">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="border-b border-zinc-800 py-4 first:pt-0 last:border-0"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] text-zinc-400 flex-shrink-0">
                  {review.user.name?.[0]?.toUpperCase() || '?'}
                </div>
                <span className="text-sm text-white font-medium">
                  {review.user.name || 'Anonymous'}
                </span>
                <StarRating rating={review.rating} size="sm" />
                <span className="text-[10px] text-zinc-600 ml-auto">
                  {timeAgo(review.createdAt)}
                </span>
                <button
                  onClick={() => openReportModal(extensionId, review.id)}
                  className="p-1 text-zinc-600 hover:text-red-400 transition-colors"
                  title={t('report.button')}
                >
                  <Flag className="w-3 h-3" />
                </button>
              </div>
              {review.content && (
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {review.content}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
