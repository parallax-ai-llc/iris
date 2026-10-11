/**
 * Dropdown - Reusable dropdown/select component.
 *
 * Keyboard (while open): ArrowUp/Down (disabled options skipped), Home/End,
 * Enter, Escape — the same contract as ModelSelector (useListboxNavigation).
 */

import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useListboxNavigation } from '@/shared/hooks/useListboxNavigation';

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface DropdownProps<T extends string = string> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  label?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
  align?: 'left' | 'right';
}

function DropdownInner<T extends string>({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  label,
  icon,
  disabled = false,
  className,
  menuClassName,
  align = 'left',
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const handleSelect = useCallback(
    (option: DropdownOption<T>) => {
      if (option.disabled) return;
      onChange(option.value);
      setIsOpen(false);
    },
    [onChange]
  );

  const { activeIndex, setActiveIndex, listboxId, optionId } = useListboxNavigation({
    isOpen,
    count: options.length,
    selectedIndex,
    isDisabled: (index) => !!options[index]?.disabled,
    onSelect: (index) => {
      const option = options[index];
      if (option) handleSelect(option);
    },
    onClose: () => setIsOpen(false),
    listboxRef,
    triggerRef: buttonRef,
  });

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {label && (
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
          {label}
        </label>
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm',
          'bg-zinc-800 border border-zinc-700',
          'hover:bg-zinc-700 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-white/30/50 focus:border-white/30',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          isOpen ? 'text-white ring-2 ring-white/50/50 border-white/30' : 'text-zinc-300'
        )}
      >
        {icon}
        <span className="flex-1 text-left truncate">
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-zinc-400 transition-transform duration-150',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          className={cn(
            'absolute z-50 mt-1 py-1 w-full min-w-[160px] focus:outline-none',
            'bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl',
            'animate-in fade-in zoom-in-95 duration-100',
            align === 'right' ? 'right-0' : 'left-0',
            menuClassName
          )}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              id={optionId(index)}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={value === option.value}
              aria-disabled={option.disabled || undefined}
              disabled={option.disabled}
              onClick={() => handleSelect(option)}
              onMouseEnter={() => !option.disabled && setActiveIndex(index)}
              className={cn(
                'w-full px-3 py-2 text-left text-sm transition-colors',
                'flex items-center gap-2',
                option.disabled
                  ? 'text-zinc-600 cursor-not-allowed'
                  : value === option.value
                  ? 'text-white bg-white/10'
                  : 'text-zinc-300 hover:bg-zinc-700 hover:text-white',
                index === activeIndex && !option.disabled && 'bg-zinc-700 text-white'
              )}
            >
              {option.icon}
              <span className="flex-1">{option.label}</span>
              {value === option.value && <Check className="w-4 h-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const Dropdown = memo(DropdownInner) as <T extends string>(
  props: DropdownProps<T>
) => React.ReactElement;

export default Dropdown;
