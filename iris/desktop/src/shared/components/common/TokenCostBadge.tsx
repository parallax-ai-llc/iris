/**
 * TokenCostBadge - Display token cost for AI operations
 */

import { memo } from 'react';
import { Coins, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { formatTokenCost } from '@/shared/hooks/useTokenCost';

interface TokenCostBadgeProps {
  cost: number;
  isLoading?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export const TokenCostBadge = memo(function TokenCostBadge({
  cost,
  isLoading = false,
  size = 'sm',
  className,
}: TokenCostBadgeProps) {
  if (isLoading) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
          'bg-white/5 border border-white/10',
          className
        )}
      >
        <Loader2 className="w-3 h-3 text-zinc-400 animate-spin" />
        <span className="text-xs text-zinc-400">...</span>
      </div>
    );
  }

  if (cost === 0) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
          'bg-white/5 border border-white/10',
          className
        )}
      >
        <span className={cn('text-zinc-400', size === 'sm' ? 'text-xs' : 'text-sm')}>
          Free
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
        'bg-white/5 border border-white/10',
        className
      )}
    >
      <Coins className={cn('text-zinc-400', size === 'sm' ? 'w-3 h-3' : 'w-4 h-4')} />
      <span className={cn('text-zinc-300 font-medium', size === 'sm' ? 'text-xs' : 'text-sm')}>
        {formatTokenCost(cost)}
      </span>
    </div>
  );
});

export default TokenCostBadge;
