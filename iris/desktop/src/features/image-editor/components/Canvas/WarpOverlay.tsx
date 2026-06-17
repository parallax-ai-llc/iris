/**
 * WarpOverlay - 9-handle mesh warp control overlay
 *
 * Renders a 3×3 grid of draggable handles over the canvas.
 * Connecting lines show the warp mesh. Each handle maps to a
 * warpGrid control point in the store.
 */

import { memo, useCallback, useRef } from 'react';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';

interface WarpOverlayProps {
  imageWidth: number;
  imageHeight: number;
  containerWidth: number;
  containerHeight: number;
  zoom: number;
  panOffsetX: number;
  panOffsetY: number;
  className?: string;
}

export const WarpOverlay = memo(function WarpOverlay({
  imageWidth,
  imageHeight,
  containerWidth,
  containerHeight,
  zoom,
  panOffsetX,
  panOffsetY,
  className = '',
}: WarpOverlayProps) {
  const { warpGrid, updateWarpPoint, applyWarp, exitWarpMode, resetWarpGrid, isWarpMode } =
    useImageEditorStore();

  const dragging = useRef<{ row: number; col: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const scale = zoom / 100;
  const originX = (containerWidth - imageWidth * scale) / 2 + panOffsetX;
  const originY = (containerHeight - imageHeight * scale) / 2 + panOffsetY;

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = e.clientX - rect.left;
      const dy = e.clientY - rect.top;
      const x = (dx - originX) / scale;
      const y = (dy - originY) / scale;
      updateWarpPoint(dragging.current.row, dragging.current.col, x, y);
    },
    [originX, originY, scale, updateWarpPoint]
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = null;
  }, []);

  if (!isWarpMode || !warpGrid) return null;

  const toDisplay = (pt: { x: number; y: number }) => ({
    dx: originX + pt.x * scale,
    dy: originY + pt.y * scale,
  });

  const handlePointerDown = (e: React.PointerEvent, row: number, col: number) => {
    e.preventDefault();
    dragging.current = { row, col };
    (e.target as SVGElement).setPointerCapture(e.pointerId);
  };

  const lines: React.ReactElement[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 2; c++) {
      const p1 = toDisplay(warpGrid[r][c]);
      const p2 = toDisplay(warpGrid[r][c + 1]);
      lines.push(
        <line key={`h-${r}-${c}`}
          x1={p1.dx} y1={p1.dy} x2={p2.dx} y2={p2.dy}
          stroke="rgba(255,255,255,0.7)" strokeWidth="1" strokeDasharray="5 3"
        />
      );
    }
  }
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 2; r++) {
      const p1 = toDisplay(warpGrid[r][c]);
      const p2 = toDisplay(warpGrid[r + 1][c]);
      lines.push(
        <line key={`v-${r}-${c}`}
          x1={p1.dx} y1={p1.dy} x2={p2.dx} y2={p2.dy}
          stroke="rgba(255,255,255,0.7)" strokeWidth="1" strokeDasharray="5 3"
        />
      );
    }
  }

  const handles: React.ReactElement[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const { dx, dy } = toDisplay(warpGrid[r][c]);
      handles.push(
        <circle key={`pt-${r}-${c}`}
          cx={dx} cy={dy} r={6}
          fill="white" stroke="rgba(30,100,255,0.9)" strokeWidth="2"
          style={{ cursor: 'grab' }}
          onPointerDown={(e) => handlePointerDown(e, r, c)}
        />
      );
    }
  }

  return (
    <div
      className={`absolute inset-0 ${className}`}
      style={{ zIndex: 40, pointerEvents: 'none' }}
    >
      <svg
        ref={svgRef}
        style={{
          position: 'absolute', inset: 0,
          width: containerWidth, height: containerHeight,
          pointerEvents: 'all', overflow: 'visible',
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {lines}
        {handles}
      </svg>

      <div
        style={{
          position: 'absolute', bottom: 16, left: '50%',
          transform: 'translateX(-50%)', display: 'flex', gap: 8,
          zIndex: 50, pointerEvents: 'all',
        }}
      >
        <button onClick={resetWarpGrid}
          className="px-3 py-1.5 rounded-md bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-700 transition-colors">
          Reset
        </button>
        <button onClick={exitWarpMode}
          className="px-3 py-1.5 rounded-md bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-700 transition-colors">
          Cancel
        </button>
        <button onClick={() => void applyWarp()}
          className="px-3 py-1.5 rounded-md bg-white text-black text-xs font-medium hover:bg-zinc-200 transition-colors">
          Apply Warp
        </button>
      </div>
    </div>
  );
});
