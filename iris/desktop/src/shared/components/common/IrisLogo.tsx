/**
 * IrisLogo - Displays the Iris brand logo
 */

import { memo } from 'react';
import { cn } from '@/shared/lib/utils';
import irisWhiteLogo from '@/assets/logo/iris-white.png';

interface IrisLogoProps {
  variant?: 'default' | 'white' | 'icon';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'h-6',
  md: 'h-8',
  lg: 'h-10',
  xl: 'h-12',
};

export const IrisLogo = memo(function IrisLogo({
  variant = 'white',
  size = 'md',
  className,
}: IrisLogoProps) {
  // Use appropriate logo based on variant
  const logoSrc = variant === 'white'
    ? irisWhiteLogo
    : '/logo/logo.svg';

  return (
    <img
      src={logoSrc}
      alt="Iris"
      className={cn('object-contain', sizeClasses[size], className)}
    />
  );
});

export default IrisLogo;
