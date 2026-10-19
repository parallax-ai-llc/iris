'use client';

import { cn } from '@editor/lib/convert/string';
import { InputSourceType } from '@editor/store/iris-editor';

interface SourceTypeButtonProps {
  source: InputSourceType;
  currentSource: InputSourceType;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
}

export function SourceTypeButton({
  source,
  currentSource,
  onClick,
  disabled,
  icon,
  label,
}: SourceTypeButtonProps) {
  const isActive = currentSource === source;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors min-w-[60px]',
        isActive
          ? 'bg-iris-tint-400/20 border border-iris-tint-400/50 text-iris-tint-200'
          : 'bg-iris-fg/5 border border-iris-fg/10 text-iris-fg/50 hover:text-iris-fg/70',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
