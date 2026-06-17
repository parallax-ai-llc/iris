import { memo, useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface StarRatingProps {
  rating: number;
  maxRating?: number;
  size?: 'sm' | 'md';
  interactive?: boolean;
  onChange?: (rating: number) => void;
}

export const StarRating = memo(function StarRating({
  rating,
  maxRating = 5,
  size = 'sm',
  interactive = false,
  onChange,
}: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState(0);
  const displayRating = interactive && hoverRating > 0 ? hoverRating : rating;
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4.5 h-4.5';

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: maxRating }, (_, i) => {
        const starValue = i + 1;
        const isFilled = displayRating >= starValue;
        const isHalf = !isFilled && displayRating >= starValue - 0.5;

        return (
          <button
            key={i}
            type="button"
            disabled={!interactive}
            className={cn(
              'relative',
              interactive && 'cursor-pointer hover:scale-110 transition-transform',
              !interactive && 'cursor-default'
            )}
            onClick={() => interactive && onChange?.(starValue)}
            onMouseEnter={() => interactive && setHoverRating(starValue)}
            onMouseLeave={() => interactive && setHoverRating(0)}
          >
            <Star
              className={cn(
                iconSize,
                isFilled
                  ? 'fill-amber-400 text-amber-400'
                  : isHalf
                    ? 'fill-amber-400/50 text-amber-400'
                    : 'fill-transparent text-zinc-600'
              )}
            />
          </button>
        );
      })}
    </div>
  );
});
