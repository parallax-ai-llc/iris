/**
 * Spinner - Loading spinner component
 */

import { memo } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  label?: string;
}

const sizeStyles = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
};

export const Spinner = memo(function Spinner({
  size = 'md',
  className,
  label,
}: SpinnerProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-2', className)}
      role="status"
      aria-label={label || 'Loading'}
    >
      <Loader2
        className={cn('animate-spin text-white/70', sizeStyles[size])}
      />
      {label && <span className="text-sm text-zinc-400">{label}</span>}
    </div>
  );
});

// Full page loading overlay
export const LoadingOverlay = memo(function LoadingOverlay({
  label,
}: {
  label?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/80 backdrop-blur-sm">
      <Spinner size="xl" label={label} />
    </div>
  );
});

// Inline loading state
export const LoadingPlaceholder = memo(function LoadingPlaceholder({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn('animate-pulse space-y-3', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-zinc-800 rounded"
          style={{ width: `${Math.random() * 40 + 60}%` }}
        />
      ))}
    </div>
  );
});

export default Spinner;
