/**
 * MoreOptionsMenu - Dropdown menu for additional image editor actions
 */

import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export interface MenuOption {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  danger?: boolean;
}

interface MoreOptionsMenuProps {
  options: MenuOption[];
  disabled?: boolean;
}

export const MoreOptionsMenu = memo(function MoreOptionsMenu({
  options,
  disabled = false,
}: MoreOptionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        buttonRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close menu on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  const handleOptionClick = useCallback((option: MenuOption) => {
    option.action();
    setIsOpen(false);
  }, []);

  const toggleMenu = useCallback(() => {
    if (!disabled) {
      setIsOpen((prev) => !prev);
    }
  }, [disabled]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={toggleMenu}
        disabled={disabled}
        className={cn(
          'p-2 rounded-lg transition-colors',
          isOpen
            ? 'bg-zinc-700 text-white'
            : 'text-zinc-400 hover:text-white hover:bg-zinc-800',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
        title="More options"
      >
        <MoreHorizontal className="w-5 h-5" />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          ref={menuRef}
          className={cn(
            'absolute right-0 top-full mt-1 z-50',
            'w-56 py-1 bg-zinc-800 rounded-lg shadow-xl border border-zinc-700',
            'animate-in fade-in slide-in-from-top-1 duration-150'
          )}
        >
          {options.map((option) => (
            <button
              key={option.id}
              onClick={() => handleOptionClick(option)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors',
                option.danger
                  ? 'text-red-400 hover:bg-red-500/10'
                  : 'text-zinc-300 hover:bg-zinc-700 hover:text-white'
              )}
            >
              <span className="text-zinc-500">{option.icon}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default MoreOptionsMenu;
