/**
 * EmptyState - Empty state placeholder component
 */

import { memo } from 'react';
import { cn } from '@/shared/lib/utils';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState = memo(function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-4',
        className
      )}
    >
      {icon && (
        <div className="text-zinc-700 mb-4">{icon}</div>
      )}
      <h3 className="text-lg font-medium text-zinc-400 mb-2 text-center">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-zinc-500 text-center max-w-md mb-6">
          {description}
        </p>
      )}
      {action}
    </div>
  );
});

export default EmptyState;
