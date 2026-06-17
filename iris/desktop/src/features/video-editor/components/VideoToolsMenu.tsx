/**
 * VideoToolsMenu - Dropdown menu for AI video editing tools
 */

import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Wrench } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export interface VideoToolOption {
  id: 'upscale' | 'motion-control' | 'inpaint' | 'cut';
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: () => void;
  disabled?: boolean;
}

interface VideoToolsMenuProps {
  options: VideoToolOption[];
  disabled?: boolean;
}

export const VideoToolsMenu = memo(function VideoToolsMenu({
  options,
  disabled = false,
}: VideoToolsMenuProps) {
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

  const handleOptionClick = useCallback((option: VideoToolOption) => {
    if (!option.disabled) {
      option.action();
      setIsOpen(false);
    }
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
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded transition-colors text-sm',
          disabled
            ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            : isOpen
            ? 'bg-zinc-700 text-white'
            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white'
        )}
        title="AI Video Tools"
      >
        <Wrench className="w-4 h-4" />
        Tools
        <ChevronDown
          className={cn('w-3 h-3 transition-transform', isOpen && 'rotate-180')}
        />
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
              disabled={option.disabled}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors',
                option.disabled
                  ? 'text-zinc-500 cursor-not-allowed'
                  : 'text-zinc-300 hover:bg-zinc-700 hover:text-white'
              )}
            >
              <span className="text-zinc-500">{option.icon}</span>
              <div className="flex flex-col">
                <span>{option.label}</span>
                {option.description && (
                  <span className="text-xs text-zinc-500">{option.description}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default VideoToolsMenu;
