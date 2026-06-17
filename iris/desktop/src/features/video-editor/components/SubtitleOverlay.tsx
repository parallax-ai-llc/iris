/**
 * SubtitleOverlay - Draggable subtitle display with animation support
 */

import { memo, useRef, useState, useCallback, useEffect } from 'react';
import { Move } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { SubtitleClip } from '@/types/editor.types';

interface SubtitleOverlayProps {
  clip: SubtitleClip;
  currentTime: number;
  isSelected: boolean;
  onSelect: () => void;
  onPositionChange: (position: { x: number; y: number }) => void;
  /** Ratio of container width to project width (e.g. container=640, project=1280 → 0.5) */
  scale?: number;
  /** Actual video display rect inside parent (excluding object-contain letterbox).
   *  When provided, the overlay positions itself in pixels relative to this rect
   *  so % positions map to the real video frame, not the letterboxed parent. */
  videoRect?: { left: number; top: number; width: number; height: number };
}

/** Render animated subtitle text based on animation type */
const AnimatedSubtitleText = memo(function AnimatedSubtitleText({
  text,
  animation,
  animationColor,
  progress,
  fontColor,
}: {
  text: string;
  animation: string;
  animationColor: string;
  progress: number;
  fontColor: string;
}) {
  if (animation === 'none' || !animation) {
    return <>{text}</>;
  }

  const words = text.split(/(\s+)/);
  const wordCount = words.filter((w) => w.trim()).length;

  switch (animation) {
    case 'highlight': {
      const activeWordIdx = Math.floor(progress * wordCount);
      let wordIdx = 0;
      return (
        <>
          {words.map((word, i) => {
            if (!word.trim()) return <span key={i}>{word}</span>;
            const isActive = wordIdx <= activeWordIdx;
            wordIdx++;
            return (
              <span key={i} style={{ color: isActive ? animationColor : fontColor, transition: 'color 0.15s ease' }}>
                {word}
              </span>
            );
          })}
        </>
      );
    }

    case 'typewriter': {
      const totalChars = text.length;
      const visibleChars = Math.floor(progress * totalChars);
      return (
        <>
          <span>{text.slice(0, visibleChars)}</span>
          <span style={{ opacity: 0 }}>{text.slice(visibleChars)}</span>
        </>
      );
    }

    case 'bounce': {
      let wordIdx = 0;
      return (
        <>
          {words.map((word, i) => {
            if (!word.trim()) return <span key={i}>{word}</span>;
            const wordProgress = progress * wordCount - wordIdx;
            const show = wordProgress > 0;
            const bounceOffset = show ? Math.max(0, (1 - wordProgress) * -20) : -30;
            wordIdx++;
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  transform: `translateY(${bounceOffset}px)`,
                  opacity: show ? 1 : 0,
                  transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s',
                }}
              >
                {word}
              </span>
            );
          })}
        </>
      );
    }

    case 'scale': {
      const activeWordIdx = Math.floor(progress * wordCount);
      let wordIdx = 0;
      return (
        <>
          {words.map((word, i) => {
            if (!word.trim()) return <span key={i}>{word}</span>;
            const isActive = wordIdx === activeWordIdx;
            wordIdx++;
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  transform: isActive ? 'scale(1.3)' : 'scale(1)',
                  color: isActive ? animationColor : fontColor,
                  transition: 'transform 0.2s ease, color 0.2s ease',
                }}
              >
                {word}
              </span>
            );
          })}
        </>
      );
    }

    case 'fade-word': {
      let wordIdx = 0;
      return (
        <>
          {words.map((word, i) => {
            if (!word.trim()) return <span key={i}>{word}</span>;
            const wordProgress = progress * wordCount - wordIdx;
            const opacity = Math.min(1, Math.max(0, wordProgress));
            wordIdx++;
            return (
              <span key={i} style={{ opacity, transition: 'opacity 0.25s ease' }}>
                {word}
              </span>
            );
          })}
        </>
      );
    }

    case 'slide-up': {
      const slideOffset = Math.max(0, (1 - progress * 3) * 30);
      return (
        <span
          style={{
            display: 'inline-block',
            transform: `translateY(${slideOffset}px)`,
            opacity: Math.min(1, progress * 4),
            transition: 'transform 0.3s ease-out',
          }}
        >
          {text}
        </span>
      );
    }

    case 'glow': {
      const glowIntensity = 4 + Math.sin(progress * Math.PI * 6) * 4;
      return (
        <span
          style={{
            textShadow: `0 0 ${glowIntensity}px ${animationColor}, 0 0 ${glowIntensity * 2}px ${animationColor}40`,
          }}
        >
          {text}
        </span>
      );
    }

    case 'wave': {
      return (
        <>
          {text.split('').map((char, i) => {
            const waveOffset = Math.sin((progress * 8 - i * 0.3)) * 3;
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  transform: `translateY(${waveOffset}px)`,
                  whiteSpace: char === ' ' ? 'pre' : undefined,
                }}
              >
                {char}
              </span>
            );
          })}
        </>
      );
    }

    default:
      return <>{text}</>;
  }
});

export const SubtitleOverlay = memo(function SubtitleOverlay({
  clip,
  currentTime,
  isSelected,
  onSelect,
  onPositionChange,
  scale = 1,
  videoRect,
}: SubtitleOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const style = clip.style;

  const clipDuration = clip.endTime - clip.startTime;
  const progress = clipDuration > 0 ? Math.max(0, Math.min(1, (currentTime - clip.startTime) / clipDuration)) : 0;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect();
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    },
    [onSelect]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!overlayRef.current?.parentElement) return;

      // Use videoRect (actual video frame) for delta when available, otherwise fall back to parent
      let widthPx: number;
      let heightPx: number;
      if (videoRect) {
        widthPx = videoRect.width;
        heightPx = videoRect.height;
      } else {
        const rect = overlayRef.current.parentElement.getBoundingClientRect();
        widthPx = rect.width;
        heightPx = rect.height;
      }

      const deltaX = ((e.clientX - dragStart.x) / widthPx) * 100;
      const deltaY = ((e.clientY - dragStart.y) / heightPx) * 100;

      const newX = Math.max(0, Math.min(100, style.position.x + deltaX));
      const newY = Math.max(0, Math.min(100, style.position.y + deltaY));

      onPositionChange({ x: newX, y: newY });
      setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, style.position, onPositionChange, videoRect]);

  const getTransform = () => {
    const xOffset = style.alignment === 'left' ? '0%' : style.alignment === 'right' ? '-100%' : '-50%';
    const yOffset = style.verticalAlign === 'top' ? '0%' : style.verticalAlign === 'bottom' ? '-100%' : '-50%';
    return `translate(${xOffset}, ${yOffset})`;
  };

  return (
    <div
      ref={overlayRef}
      className={cn(
        'absolute cursor-move select-none transition-all',
        isSelected && 'ring-2 ring-white/50 ring-offset-2 ring-offset-transparent',
        isDragging && 'opacity-80'
      )}
      style={{
        // When videoRect is provided, position in pixels relative to actual video frame
        // (excluding object-contain letterbox). Otherwise fall back to % of parent.
        left: videoRect
          ? `${videoRect.left + (style.position.x / 100) * videoRect.width}px`
          : `${style.position.x}%`,
        top: videoRect
          ? `${videoRect.top + (style.position.y / 100) * videoRect.height}px`
          : `${style.position.y}%`,
        transform: getTransform(),
        fontSize: `${style.fontSize * scale}px`,
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight ?? 'normal',
        fontStyle: style.fontStyle ?? 'normal',
        color: style.fontColor,
        backgroundColor: `${style.backgroundColor}${Math.round(style.backgroundOpacity * 255)
          .toString(16)
          .padStart(2, '0')}`,
        padding: `${4 * scale}px ${12 * scale}px`,
        borderRadius: '4px',
        textAlign: style.alignment,
        maxWidth: '80%',
        zIndex: isSelected ? 10 : 1,
        letterSpacing: style.letterSpacing != null ? `${style.letterSpacing * scale}px` : undefined,
        lineHeight: style.lineHeight != null ? style.lineHeight : undefined,
        textTransform: style.textTransform ?? undefined,
        WebkitTextStroke: style.stroke
          ? `${style.stroke.width * scale}px ${style.stroke.color}`
          : undefined,
        textShadow:
          style.dropShadow && (style.animation ?? 'none') !== 'glow'
            ? `${style.dropShadow.offsetX * scale}px ${style.dropShadow.offsetY * scale}px ${style.dropShadow.blur * scale}px ${style.dropShadow.color}`
            : undefined,
      }}
      onMouseDown={handleMouseDown}
    >
      <AnimatedSubtitleText
        text={clip.text}
        animation={style.animation ?? 'none'}
        animationColor={style.animationColor ?? '#FFD700'}
        progress={progress}
        fontColor={style.fontColor}
      />

      {isSelected && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-0.5 bg-white/10 rounded text-white text-[10px]">
          <Move className="w-3 h-3" />
          Drag to move
        </div>
      )}
    </div>
  );
});
