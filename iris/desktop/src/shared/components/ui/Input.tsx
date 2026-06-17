/**
 * Input - Reusable input component
 */

import { forwardRef, memo } from 'react';
import { cn } from '@/shared/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = memo(
  forwardRef<HTMLInputElement, InputProps>(
    ({ className, label, error, hint, leftIcon, rightIcon, id, ...props }, ref) => {
      const inputId = id || `input-${Math.random().toString(36).slice(2, 9)}`;

      return (
        <div className="w-full">
          {label && (
            <label
              htmlFor={inputId}
              className="block text-sm font-medium text-zinc-300 mb-1.5"
            >
              {label}
            </label>
          )}
          <div className="relative">
            {leftIcon && (
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                {leftIcon}
              </div>
            )}
            <input
              ref={ref}
              id={inputId}
              className={cn(
                'w-full rounded-lg transition-colors',
                'bg-zinc-800 border text-white placeholder-zinc-500',
                'focus:outline-none focus:ring-2 focus:ring-offset-0',
                error
                  ? 'border-red-500 focus:ring-red-500/50 focus:border-red-500'
                  : 'border-zinc-700 focus:ring-white/30/50 focus:border-white/30',
                leftIcon ? 'pl-10' : 'pl-3',
                rightIcon ? 'pr-10' : 'pr-3',
                'py-2 text-sm',
                className
              )}
              aria-invalid={error ? 'true' : 'false'}
              aria-describedby={
                error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
              }
              {...props}
            />
            {rightIcon && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
                {rightIcon}
              </div>
            )}
          </div>
          {error && (
            <p id={`${inputId}-error`} className="text-xs text-red-400 mt-1">
              {error}
            </p>
          )}
          {hint && !error && (
            <p id={`${inputId}-hint`} className="text-xs text-zinc-500 mt-1">
              {hint}
            </p>
          )}
        </div>
      );
    }
  )
);

Input.displayName = 'Input';

export default Input;
