/**
 * PillButtonGroup - Horizontal pill-style button group
 */

import { memo, type ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

interface PillOption {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface PillButtonGroupProps {
  options: PillOption[];
  value: string;
  onChange: (value: string) => void;
}

export const PillButtonGroup = memo(function PillButtonGroup({
  options,
  value,
  onChange,
}: PillButtonGroupProps) {
  return (
    <div className="flex items-center bg-zinc-800 rounded-md p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors',
            value === option.id
              ? 'bg-white/10 text-white'
              : 'text-zinc-400 hover:text-white'
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
});
