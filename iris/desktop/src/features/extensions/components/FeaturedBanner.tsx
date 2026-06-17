import { memo, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { Extension } from '@/shared/api/extension.types';
import { formatTokenCost } from '@/shared/hooks/useTokenCost';

interface FeaturedBannerProps {
  extensions: Extension[];
  onViewDetail: (id: string) => void;
}

// Gradient backgrounds for featured cards
const GRADIENTS = [
  'from-blue-900/40 to-cyan-900/40',
  'from-rose-900/40 to-orange-900/40',
  'from-emerald-900/40 to-teal-900/40',
  'from-amber-900/40 to-yellow-900/40',
  'from-slate-800/60 to-zinc-800/60',
];

export const FeaturedBanner = memo(function FeaturedBanner({
  extensions,
  onViewDetail,
}: FeaturedBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { t } = useTranslation('extensions');

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % extensions.length);
  }, [extensions.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + extensions.length) % extensions.length);
  }, [extensions.length]);

  // Auto-advance every 5 seconds
  useEffect(() => {
    if (extensions.length <= 1) return;
    const interval = setInterval(goNext, 5000);
    return () => clearInterval(interval);
  }, [extensions.length, goNext]);

  if (extensions.length === 0) return null;

  return (
    <div className="relative group mb-6">
      {/* Carousel container */}
      <div className="overflow-hidden rounded-2xl">
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {extensions.map((ext, i) => (
            <div
              key={ext.id}
              onClick={() => onViewDetail(ext.id)}
              className={cn(
                'w-full flex-shrink-0 relative cursor-pointer',
                'bg-gradient-to-r',
                GRADIENTS[i % GRADIENTS.length],
                'border border-zinc-700/50 rounded-2xl'
              )}
            >
              <div className="px-8 py-8 flex items-center gap-6">
                {/* Icon */}
                <div className="w-20 h-20 rounded-2xl bg-zinc-800/50 flex items-center justify-center text-4xl flex-shrink-0 backdrop-blur-sm">
                  {ext.icon || '📦'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                      {t('featured')}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1 truncate">
                    {ext.name}
                  </h3>
                  <p className="text-sm text-zinc-300 line-clamp-1 mb-2">
                    {ext.shortDescription}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-zinc-400">
                    <span>{ext.author}</span>
                    <span>·</span>
                    <span>
                      {ext.downloadCount.toLocaleString()} {t('card.installs')}
                    </span>
                    <span>·</span>
                    <span>★ {ext.ratingAvg.toFixed(1)}</span>
                  </div>
                </div>

                {/* Price badge */}
                <div className="flex-shrink-0">
                  {ext.price === 0 ? (
                    <span className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-sm font-medium">
                      Free
                    </span>
                  ) : (
                    <span className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 text-sm font-medium">
                      {formatTokenCost(ext.price)} credits
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation arrows */}
      {extensions.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-zinc-900/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-zinc-800"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-zinc-900/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-zinc-800"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </>
      )}

      {/* Dot indicators */}
      {extensions.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {extensions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={cn(
                'w-1.5 h-1.5 rounded-full transition-all',
                i === currentIndex
                  ? 'bg-white w-4'
                  : 'bg-zinc-600 hover:bg-zinc-500'
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
});
