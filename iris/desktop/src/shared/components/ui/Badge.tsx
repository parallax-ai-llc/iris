/**
 * Badge - Status and category badge component
 */

import { memo } from 'react';
import { cn } from '@/shared/lib/utils';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'violet';
  size?: 'sm' | 'md';
  className?: string;
}

const variantStyles = {
  default: 'bg-zinc-700/50 text-zinc-300 border-zinc-600/50',
  success: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-600/20 text-amber-400 border-amber-500/30',
  error: 'bg-red-600/20 text-red-400 border-red-500/30',
  info: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
  violet: 'bg-white/10 text-white/70 border-white/20', // Changed from violet to neutral
};

const sizeStyles = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-1 text-xs',
};

export const Badge = memo(function Badge({
  children,
  variant = 'default',
  size = 'md',
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-md border',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {children}
    </span>
  );
});

export default Badge;
