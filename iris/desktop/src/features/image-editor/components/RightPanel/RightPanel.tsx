/**
 * RightPanel - Persistent right sidebar with Layers/Channels/Paths tabs, History, and Image Info
 * Always visible regardless of current edit mode (Photoshop-style)
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore, type RightPanelTab } from '@/features/image-editor/stores/imageEditor.store';
import { LayersSection } from './sections/LayersSection';
import { ChannelsSection } from './sections/ChannelsSection';
import { PathsSection } from './sections/PathsSection';
import { HistorySection } from './sections/HistorySection';
import { ActionsSection } from './sections/ActionsSection';
import { ImageInfoSection } from './sections/ImageInfoSection';
import { HistogramSection } from './sections/HistogramSection';

const TABS: Array<{ id: RightPanelTab; label: string }> = [
  { id: 'layers', label: 'Layers' },
  { id: 'channels', label: 'Channels' },
  { id: 'paths', label: 'Paths' },
];

// Right panel resize constants
const RIGHT_PANEL_WIDTH_KEY = 'iris:imageEditor:rightPanelWidth';
const RIGHT_PANEL_MIN_WIDTH = 200;
const RIGHT_PANEL_MAX_WIDTH = 600;
const RIGHT_PANEL_DEFAULT_WIDTH = 256; // matches previous w-64

function loadStoredWidth(): number {
  if (typeof window === 'undefined') return RIGHT_PANEL_DEFAULT_WIDTH;
  const raw = window.localStorage.getItem(RIGHT_PANEL_WIDTH_KEY);
  if (!raw) return RIGHT_PANEL_DEFAULT_WIDTH;
  const n = Number(raw);
  if (!Number.isFinite(n)) return RIGHT_PANEL_DEFAULT_WIDTH;
  return Math.min(RIGHT_PANEL_MAX_WIDTH, Math.max(RIGHT_PANEL_MIN_WIDTH, n));
}

export const RightPanel = memo(function RightPanel() {
  const {
    showLayersPanel,
    showHistoryPanel,
    showImageInfoPanel,
    showHistogramPanel,
    showChannelsPanel,
    showPathsPanel,
    rightPanelTab,
    setRightPanelTab,
  } = useImageEditorStore();

  const handleTabChange = useCallback((tab: RightPanelTab) => {
    setRightPanelTab(tab);
  }, [setRightPanelTab]);

  const anyVisible = showLayersPanel || showHistoryPanel || showImageInfoPanel || showHistogramPanel || showChannelsPanel || showPathsPanel;

  // Resizable width (persisted to localStorage)
  const [width, setWidth] = useState<number>(() => loadStoredWidth());
  const [isResizing, setIsResizing] = useState(false);
  const resizingRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(width));
  }, [width]);

  const handleResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizingRef.current = true;
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = width;

    const onMove = (ev: PointerEvent) => {
      if (!resizingRef.current) return;
      // Panel is on the right edge → dragging LEFT increases width.
      const next = startWidth - (ev.clientX - startX);
      const clamped = Math.min(
        RIGHT_PANEL_MAX_WIDTH,
        Math.max(RIGHT_PANEL_MIN_WIDTH, next)
      );
      setWidth(clamped);
    };

    const onUp = () => {
      resizingRef.current = false;
      setIsResizing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [width]);

  const handleResizeDoubleClick = useCallback(() => {
    setWidth(RIGHT_PANEL_DEFAULT_WIDTH);
  }, []);

  if (!anyVisible) return null;

  return (
    <div
      className="relative bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden flex-shrink-0"
      style={{ width }}
    >
      {/* Resize handle — thin strip on the left edge */}
      <div
        onPointerDown={handleResizePointerDown}
        onDoubleClick={handleResizeDoubleClick}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize right panel"
        title="Drag to resize (double-click to reset)"
        className={cn(
          'absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 group',
          'hover:bg-blue-500/60 transition-colors',
          isResizing && 'bg-blue-500/80'
        )}
      />
      {/* Tab bar */}
      <div className="flex border-b border-zinc-800 flex-shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              'flex-1 text-[11px] px-3 py-2 transition-colors',
              rightPanelTab === tab.id
                ? 'bg-zinc-800 text-white border-b-2 border-blue-500'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content + persistent sections */}
      <div className="flex-1 overflow-y-auto">
        {showHistogramPanel && <HistogramSection />}

        {rightPanelTab === 'layers' && showLayersPanel && <LayersSection />}
        {rightPanelTab === 'channels' && showChannelsPanel && <ChannelsSection />}
        {rightPanelTab === 'paths' && showPathsPanel && <PathsSection />}

        {showHistoryPanel && <HistorySection />}
        <ActionsSection />
        {showImageInfoPanel && <ImageInfoSection />}
      </div>
    </div>
  );
});
