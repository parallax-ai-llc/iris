/**
 * FloatingPanelWrapper - Draggable floating panel wrapper
 * Used to wrap AI panel content over the canvas
 */

import { memo, useState, useCallback, useRef, type ReactNode } from 'react';
import { X, GripHorizontal } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface FloatingPanelWrapperProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  defaultPosition?: { x: number; y: number };
  width?: number;
}

export const FloatingPanelWrapper = memo(function FloatingPanelWrapper({
  title,
  icon,
  children,
  onClose,
  defaultPosition = { x: 16, y: 16 },
  width = 300,
}: FloatingPanelWrapperProps) {
  const [position, setPosition] = useState(defaultPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      offsetX: position.x,
      offsetY: position.y,
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPosition({
        x: dragRef.current.offsetX + dx,
        y: dragRef.current.offsetY + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [position]);

  return (
    <div
      ref={panelRef}
      className={cn(
        'absolute bg-zinc-900/95 backdrop-blur-sm border border-zinc-700 rounded-xl shadow-2xl',
        'flex flex-col overflow-hidden z-20',
        isDragging && 'cursor-grabbing'
      )}
      style={{
        left: position.x,
        top: position.y,
        width,
      }}
    >
      {/* Drag handle / title bar */}
      <div
        onMouseDown={handleMouseDown}
        className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 border-b border-zinc-700/50 cursor-grab select-none"
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="w-3.5 h-3.5 text-zinc-500" />
          {icon}
          <span className="text-xs font-medium text-white">{title}</span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Panel content */}
      <div className="max-h-[70vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
});
