/**
 * ProviderLogo - Displays AI provider logos with proper styling
 */

import { memo } from 'react';
import { cn } from '@/shared/lib/utils';
import { getProviderLogo, getProviderLogoStyle, getProviderName } from '@/shared/lib/utils/provider-logos';

interface ProviderLogoProps {
  provider: string;
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
  className?: string;
  modelId?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

// Seedance model IDs (use seedance-color.png instead of provider logo)
const SEEDANCE_MODELS = ['seedance-2.0', 'seedance-2.0-fast'];

function isSeedanceModel(modelId?: string): boolean {
  return modelId ? SEEDANCE_MODELS.includes(modelId) : false;
}

const B = import.meta.env.BASE_URL;

export const ProviderLogo = memo(function ProviderLogo({
  provider,
  size = 'md',
  showName = false,
  className,
  modelId,
}: ProviderLogoProps) {
  if (isSeedanceModel(modelId)) {
    const content = (
      <img
        src={`${B}model/seedance-color.png`}
        alt="Seedance"
        className={cn('object-contain', sizeClasses[size])}
      />
    );

    if (showName) {
      return (
        <div className={cn('flex items-center gap-2', className)}>
          {content}
          <span className="text-sm text-zinc-300">Seedance</span>
        </div>
      );
    }

    return <div className={className}>{content}</div>;
  }

  const logo = getProviderLogo(provider);
  const name = getProviderName(provider);

  if (!logo) {
    // Fallback: show first letter of provider name
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded bg-zinc-700 text-zinc-300 font-medium',
          sizeClasses[size],
          className
        )}
      >
        {name[0]?.toUpperCase() || '?'}
      </div>
    );
  }

  const content = (
    <img
      src={logo.src}
      alt={name}
      className={cn('object-contain', sizeClasses[size])}
      style={getProviderLogoStyle(provider)}
    />
  );

  if (showName) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        {content}
        <span className="text-sm text-zinc-300">{name}</span>
      </div>
    );
  }

  return <div className={className}>{content}</div>;
});

export default ProviderLogo;
