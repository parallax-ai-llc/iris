import { useId } from 'react';

interface ParallaxSymbolProps {
  className?: string;
}

/**
 * Parallax AI symbol (triangle with three nodes). Same artwork as
 * static/brand/v2-parallax/parallax-mark.svg, inlined so it renders crisp at
 * icon sizes. The gradient id is per instance so several marks on one screen
 * don't share (and break) a single <defs> entry.
 */
export function ParallaxSymbol({ className }: ParallaxSymbolProps) {
  const gradientId = `pxMark-${useId().replace(/:/g, '')}`;
  const fill = `url(#${gradientId})`;
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="3" y1="3" x2="25" y2="26">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.32" stopColor="#B9B9B9" />
          <stop offset="0.52" stopColor="#F7F7F7" />
          <stop offset="0.78" stopColor="#8A8A8A" />
          <stop offset="1" stopColor="#DADADA" />
        </linearGradient>
      </defs>
      <path d="M4 24 L14 5 L24 24" stroke={fill} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="14" cy="5" r="2.6" fill={fill} />
      <circle cx="4" cy="24" r="2" fill={fill} />
      <circle cx="24" cy="24" r="2" fill={fill} />
    </svg>
  );
}
