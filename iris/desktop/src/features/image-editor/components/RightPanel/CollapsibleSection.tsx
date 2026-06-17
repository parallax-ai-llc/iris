/**
 * CollapsibleSection - Collapsible section wrapper for right panel
 */

import { memo, useState, useCallback, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
  count?: number;
}

export const CollapsibleSection = memo(function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
  count,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  return (
    <div className="border-b border-zinc-800 last:border-b-0">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
            {title}
          </span>
          {count !== undefined && (
            <span className="text-[10px] text-zinc-500 tabular-nums">({count})</span>
          )}
        </div>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-zinc-500 transition-transform',
            !isOpen && '-rotate-90'
          )}
        />
      </button>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
});
