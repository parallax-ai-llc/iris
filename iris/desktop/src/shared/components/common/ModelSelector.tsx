/**
 * ModelSelector - A dropdown for selecting AI models with provider logos
 */

import { memo, useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { ProviderLogo } from './ProviderLogo';
import { getProviderName } from '@/shared/lib/utils/provider-logos';

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description?: string;
  maxDuration?: number; // For video models
}

interface ModelSelectorProps {
  value: string;
  options: ModelOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export const ModelSelector = memo(function ModelSelector({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = 'Select a model',
  className,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.id === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg',
          'bg-zinc-800 border border-zinc-700 text-white',
          'hover:bg-zinc-750 hover:border-zinc-600',
          'focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'text-sm transition-colors'
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {selectedOption ? (
            <>
              <ProviderLogo provider={selectedOption.provider} size="sm" modelId={selectedOption.id} />
              <span className="truncate">{selectedOption.name}</span>
              {selectedOption.maxDuration && (
                <span className="text-xs text-zinc-500">
                  (max {selectedOption.maxDuration}s)
                </span>
              )}
            </>
          ) : (
            <span className="text-zinc-500">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-zinc-400 flex-shrink-0 transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 py-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-zinc-500">No models available</div>
          ) : (
            options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onChange(option.id);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-left',
                  'hover:bg-zinc-700 transition-colors',
                  value === option.id && 'bg-white/10'
                )}
              >
                <ProviderLogo provider={option.provider} size="sm" modelId={option.id} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white truncate">{option.name}</span>
                    {option.maxDuration && (
                      <span className="text-xs text-zinc-500">
                        ({option.maxDuration}s)
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-500">
                    {getProviderName(option.provider)}
                  </span>
                </div>
                {value === option.id && (
                  <Check className="w-4 h-4 text-white/70 flex-shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
});

export default ModelSelector;
