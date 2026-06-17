/**
 * PathOverlay - Renders vector paths and handles pen tool interaction
 * Shows anchor points, control handles, and path curves
 * Interactive when editMode === 'pen': click to add points, drag for handles
 */

import { memo, useRef, useEffect, useCallback, useState } from 'react';
import { useImageEditorStore, type PathPoint } from '@/features/image-editor/stores/imageEditor.store';
import { screenToImage } from '@/features/image-editor/canvas/canvasEngine';

interface PathOverlayProps {
  imageWidth: number;
  imageHeight: number;
  containerWidth: number;
  containerHeight: number;
  className?: string;
}

const POINT_HIT_RADIUS = 6;
const HANDLE_HIT_RADIUS = 5;

export const PathOverlay = memo(function PathOverlay({
  imageWidth,
  imageHeight,
  containerWidth,
  containerHeight,
  className,
}: PathOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    paths, activePathId, zoom, panOffset, editMode,
    penToolMode, activePointIndex,
    addPath, addPathPoint, updatePathPoint, closePath,
    setActivePointIndex,
    rotation, flipHorizontal, flipVertical,
  } = useImageEditorStore();

  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<'point' | 'handleIn' | 'handleOut' | null>(null);

  const activePath = paths.find((p) => p.id === activePathId);
  const isPenMode = editMode === 'pen';

  // Transform helpers
  const getScale = useCallback(() => zoom / 100, [zoom]);

  const getOffset = useCallback(() => {
    const scale = zoom / 100;
    return {
      x: (containerWidth - imageWidth * scale) / 2 + panOffset.x,
      y: (containerHeight - imageHeight * scale) / 2 + panOffset.y,
    };
  }, [containerWidth, containerHeight, imageWidth, imageHeight, zoom, panOffset]);

  const toScreen = useCallback((x: number, y: number) => {
    const scale = getScale();
    const offset = getOffset();
    return { x: x * scale + offset.x, y: y * scale + offset.y };
  }, [getScale, getOffset]);

  const toImage = useCallback((screenX: number, screenY: number) => {
    return screenToImage(
      screenX, screenY,
      imageWidth, imageHeight,
      containerWidth, containerHeight,
      zoom, panOffset, rotation,
      flipHorizontal, flipVertical
    );
  }, [imageWidth, imageHeight, containerWidth, containerHeight, zoom, panOffset, rotation, flipHorizontal, flipVertical]);

  // Hit testing
  const hitTestPoint = useCallback((screenX: number, screenY: number): number | null => {
    if (!activePath) return null;
    for (let i = 0; i < activePath.points.length; i++) {
      const s = toScreen(activePath.points[i].x, activePath.points[i].y);
      const dist = Math.sqrt((screenX - s.x) ** 2 + (screenY - s.y) ** 2);
      if (dist < POINT_HIT_RADIUS) return i;
    }
    return null;
  }, [activePath, toScreen]);

  const hitTestHandle = useCallback((screenX: number, screenY: number): { index: number; type: 'handleIn' | 'handleOut' } | null => {
    if (!activePath) return null;
    for (let i = 0; i < activePath.points.length; i++) {
      const pt = activePath.points[i];
      if (pt.handleIn) {
        const s = toScreen(pt.handleIn.x, pt.handleIn.y);
        if (Math.sqrt((screenX - s.x) ** 2 + (screenY - s.y) ** 2) < HANDLE_HIT_RADIUS) {
          return { index: i, type: 'handleIn' };
        }
      }
      if (pt.handleOut) {
        const s = toScreen(pt.handleOut.x, pt.handleOut.y);
        if (Math.sqrt((screenX - s.x) ** 2 + (screenY - s.y) ** 2) < HANDLE_HIT_RADIUS) {
          return { index: i, type: 'handleOut' };
        }
      }
    }
    return null;
  }, [activePath, toScreen]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isPenMode) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const imgCoords = toImage(screenX, screenY);

    if (penToolMode === 'create') {
      // Check if clicking on first point to close path
      if (activePath && activePath.points.length >= 2) {
        const firstScreen = toScreen(activePath.points[0].x, activePath.points[0].y);
        const dist = Math.sqrt((screenX - firstScreen.x) ** 2 + (screenY - firstScreen.y) ** 2);
        if (dist < POINT_HIT_RADIUS) {
          closePath(activePath.id);
          return;
        }
      }

      // Create new path if none active
      let pathId = activePathId;
      if (!pathId) {
        pathId = addPath();
      }

      // Add corner point; drag will convert to smooth with handles
      const newPoint: PathPoint = {
        x: imgCoords.x,
        y: imgCoords.y,
        handleIn: null,
        handleOut: null,
        type: 'corner',
      };
      addPathPoint(pathId, newPoint);

      // Track drag start for handle creation
      setIsDragging(true);
      setDragType('handleOut');
      setActivePointIndex(activePath ? activePath.points.length : 0);

    } else {
      // Edit mode: check hit targets
      const handleHit = hitTestHandle(screenX, screenY);
      if (handleHit) {
        setIsDragging(true);
        setDragType(handleHit.type);
        setActivePointIndex(handleHit.index);
        return;
      }

      const pointHit = hitTestPoint(screenX, screenY);
      if (pointHit !== null) {
        setIsDragging(true);
        setDragType('point');
        setActivePointIndex(pointHit);
        return;
      }

      // Click on empty space: deselect point
      setActivePointIndex(null);
    }
  }, [isPenMode, penToolMode, activePath, activePathId, toImage, toScreen, addPath, addPathPoint, closePath, hitTestPoint, hitTestHandle, setActivePointIndex]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPenMode || !isDragging || activePointIndex === null || !activePath) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const imgCoords = toImage(screenX, screenY);

    if (dragType === 'point') {
      // Move the anchor point
      updatePathPoint(activePath.id, activePointIndex, {
        x: imgCoords.x,
        y: imgCoords.y,
      });
    } else if (dragType === 'handleOut') {
      const pt = activePath.points[activePointIndex];
      const handleOut = { x: imgCoords.x, y: imgCoords.y };

      // Alt key: independent handles. Otherwise, mirror for smooth
      const altKey = e.altKey;
      let handleIn = pt.handleIn;
      if (!altKey && pt.type === 'smooth') {
        // Mirror handle around the anchor
        handleIn = {
          x: 2 * pt.x - imgCoords.x,
          y: 2 * pt.y - imgCoords.y,
        };
      }

      updatePathPoint(activePath.id, activePointIndex, {
        handleOut,
        handleIn,
        type: 'smooth',
      });
    } else if (dragType === 'handleIn') {
      const pt = activePath.points[activePointIndex];
      const handleIn = { x: imgCoords.x, y: imgCoords.y };

      const altKey = e.altKey;
      let handleOut = pt.handleOut;
      if (!altKey && pt.type === 'smooth') {
        handleOut = {
          x: 2 * pt.x - imgCoords.x,
          y: 2 * pt.y - imgCoords.y,
        };
      }

      updatePathPoint(activePath.id, activePointIndex, {
        handleIn,
        handleOut,
        type: 'smooth',
      });
    }
  }, [isPenMode, isDragging, activePointIndex, activePath, dragType, toImage, updatePathPoint]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragType(null);
  }, []);

  // Render
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = containerWidth;
    canvas.height = containerHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!activePath || activePath.points.length === 0) return;

    const points = activePath.points;

    // Draw path curve
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();

    points.forEach((pt, i) => {
      const s = toScreen(pt.x, pt.y);
      if (i === 0) {
        ctx.moveTo(s.x, s.y);
      } else {
        const prev = points[i - 1];
        if (prev.handleOut && pt.handleIn) {
          const h1 = toScreen(prev.handleOut.x, prev.handleOut.y);
          const h2 = toScreen(pt.handleIn.x, pt.handleIn.y);
          ctx.bezierCurveTo(h1.x, h1.y, h2.x, h2.y, s.x, s.y);
        } else {
          ctx.lineTo(s.x, s.y);
        }
      }
    });

    if (activePath.closed && points.length > 1) {
      const first = points[0];
      const last = points[points.length - 1];
      const s = toScreen(first.x, first.y);
      if (last.handleOut && first.handleIn) {
        const h1 = toScreen(last.handleOut.x, last.handleOut.y);
        const h2 = toScreen(first.handleIn.x, first.handleIn.y);
        ctx.bezierCurveTo(h1.x, h1.y, h2.x, h2.y, s.x, s.y);
      } else {
        ctx.lineTo(s.x, s.y);
      }
    }

    ctx.stroke();

    // Draw control handles
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;

    points.forEach((pt, i) => {
      const s = toScreen(pt.x, pt.y);
      const isActive = i === activePointIndex;

      if (pt.handleIn) {
        const h = toScreen(pt.handleIn.x, pt.handleIn.y);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(h.x, h.y);
        ctx.stroke();

        ctx.fillStyle = isActive ? '#3b82f6' : '#ffffff';
        ctx.beginPath();
        ctx.arc(h.x, h.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#94a3b8';
        ctx.stroke();
      }

      if (pt.handleOut) {
        const h = toScreen(pt.handleOut.x, pt.handleOut.y);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(h.x, h.y);
        ctx.stroke();

        ctx.fillStyle = isActive ? '#3b82f6' : '#ffffff';
        ctx.beginPath();
        ctx.arc(h.x, h.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#94a3b8';
        ctx.stroke();
      }
    });

    // Draw anchor points
    points.forEach((pt, i) => {
      const s = toScreen(pt.x, pt.y);
      const isActive = i === activePointIndex;
      ctx.fillStyle = isActive ? '#3b82f6' : '#ffffff';
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;

      if (pt.type === 'corner') {
        ctx.fillRect(s.x - 3.5, s.y - 3.5, 7, 7);
        ctx.strokeRect(s.x - 3.5, s.y - 3.5, 7, 7);
      } else {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    });
  }, [activePath, containerWidth, containerHeight, toScreen, activePointIndex]);

  useEffect(() => {
    render();
  }, [render]);

  // When not in pen mode and no path to show, don't render
  if (!isPenMode && (!activePath || activePath.points.length === 0)) return null;

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 ${isPenMode ? '' : 'pointer-events-none'} ${className || ''}`}
      style={{ width: containerWidth, height: containerHeight, cursor: isPenMode ? 'crosshair' : undefined }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
});
