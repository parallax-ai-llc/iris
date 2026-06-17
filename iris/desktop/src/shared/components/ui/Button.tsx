/**
 * Button - Reusable button component with variants
 */

import { forwardRef, memo } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles = {
  primary: 'bg-gradient-to-r from-slate-300 via-white to-slate-300 text-neutral-900 hover:from-white hover:to-white focus:ring-white/50',
  secondary: 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white focus:ring-zinc-500',
  ghost: 'bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-white focus:ring-zinc-500',
  danger: 'bg-red-600 text-white hover:bg-red-500 focus:ring-red-500',
  outline: 'bg-transparent border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white focus:ring-zinc-500',
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2',
  icon: 'p-2',
};

export const Button = memo(
  forwardRef<HTMLButtonElement, ButtonProps>(
    (
      {
        className,
        variant = 'secondary',
        size = 'md',
        isLoading = false,
        leftIcon,
        rightIcon,
        disabled,
        children,
        ...props
      },
      ref
    ) => {
      return (
        <button
          ref={ref}
          disabled={disabled || isLoading}
          className={cn(
            'inline-flex items-center justify-center font-medium rounded-lg',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-900',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            variantStyles[variant],
            sizeStyles[size],
            className
          )}
          {...props}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            leftIcon
          )}
          {children}
          {!isLoading && rightIcon}
        </button>
      );
    }
  )
);

Button.displayName = 'Button';

export default Button;
