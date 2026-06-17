/**
 * ActionButton - Compact action button for Options Bar
 */

import { memo, type ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

interface ActionButtonProps {
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'danger';
  iconOnly?: boolean;
}

export const ActionButton = memo(function ActionButton({
  icon,
  label,
  onClick,
  disabled = false,
  variant = 'default',
  iconOnly = false,
}: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        'flex items-center rounded-md text-[11px] font-medium transition-colors',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        iconOnly ? 'p-1.5' : 'gap-1.5 px-2.5 py-1',
        variant === 'default' && 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white',
        variant === 'primary' && 'bg-white/10 text-white border border-white/20 hover:bg-white/20',
        variant === 'danger' && 'bg-zinc-800 text-zinc-400 hover:bg-red-600/20 hover:text-red-400',
      )}
    >
      {icon}
      {!iconOnly && label}
    </button>
  );
});
