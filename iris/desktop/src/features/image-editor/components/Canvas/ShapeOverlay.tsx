/**
 * ShapeOverlay
 * Handles shape tool drawing: rectangle, ellipse, line, arrow, polygon, star
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import {
  drawShape,
  drawShapePreview,
  getShapeBounds,
  type ShapeDrawOptions,
} from '@/features/image-editor/canvas/shapes';
import { createOffscreenCanvas, screenToImage } from '@/features/image-editor/canvas/canvasEngine';
import { cn } from '@/shared/lib/utils';

interface ShapeOverlayProps {
  imageWidth: number;
  imageHeight: number;
  containerWidth: number;
  containerHeight: number;
  onCommitShape: (canvas: HTMLCanvasElement) => void;
  className?: string;
}

interface Point {
  x: number;
  y: number;
}

export function ShapeOverlay({
  imageWidth,
  imageHeight,
  containerWidth,
  containerHeight,
  onCommitShape,
  className,
}: ShapeOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [shiftKey, setShiftKey] = useState(false);
  const [altKey, setAltKey] = useState(false);

  const {
    editMode,
    shapeTool,
    shapeSettings,
    zoom,
    panOffset,
    rotation,
    flipHorizontal,
    flipVertical,
  } = useImageEditorStore();

  // Track modifier keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftKey(true);
      if (e.key === 'Alt') setAltKey(true);
      if (e.key === 'Escape' && isDrawing) {
        setIsDrawing(false);
        setStartPoint(null);
        setCurrentPoint(null);
        clearCanvas();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftKey(false);
      if (e.key === 'Alt') setAltKey(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
    // clearCanvas is defined just below — adding it to deps creates a TDZ error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawing]);

  // Clear overlay canvas
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, []);

  // Transform screen coordinates to image coordinates
  const getImageCoords = useCallback(
    (e: React.MouseEvent): Point => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };

      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      return screenToImage(
        screenX,
        screenY,
        imageWidth,
        imageHeight,
        containerWidth,
        containerHeight,
        zoom,
        panOffset,
        rotation,
        flipHorizontal,
        flipVertical
      );
    },
    [imageWidth, imageHeight, containerWidth, containerHeight, zoom, panOffset, rotation, flipHorizontal, flipVertical]
  );

  // Get shape draw options from current state
  const getShapeOptions = useCallback((): ShapeDrawOptions | null => {
    if (!startPoint || !currentPoint) return null;

    return {
      x1: startPoint.x,
      y1: startPoint.y,
      x2: currentPoint.x,
      y2: currentPoint.y,
      shiftKey,
      altKey,
    };
  }, [startPoint, currentPoint, shiftKey, altKey]);

  // Start drawing shape
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (editMode !== 'shape') return;
      if (useImageEditorStore.getState().isSpacePanning) return; // Spacebar panning takes priority

      const point = getImageCoords(e);
      setStartPoint(point);
      setCurrentPoint(point);
      setIsDrawing(true);
    },
    [editMode, getImageCoords]
  );

  // Update shape preview
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing) return;

      const point = getImageCoords(e);
      setCurrentPoint(point);
    },
    [isDrawing, getImageCoords]
  );

  // Complete shape drawing
  const handleMouseUp = useCallback(
    (_e: React.MouseEvent) => {
      if (!isDrawing || !startPoint || !currentPoint) return;

      const options = getShapeOptions();
      if (!options) return;

      const bounds = getShapeBounds(options);

      // Only create shape if it has some size
      if (bounds.width > 2 || bounds.height > 2) {
        // Create offscreen canvas for the shape
        const { canvas, ctx } = createOffscreenCanvas(imageWidth, imageHeight, true);

        // Draw the final shape
        drawShape(ctx, shapeTool, options, shapeSettings);

        // Commit the shape
        onCommitShape(canvas);
      }

      setIsDrawing(false);
      setStartPoint(null);
      setCurrentPoint(null);
      clearCanvas();
    },
    [isDrawing, startPoint, currentPoint, getShapeOptions, shapeTool, shapeSettings, imageWidth, imageHeight, onCommitShape, clearCanvas]
  );

  // Render shape preview
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!isDrawing || !startPoint || !currentPoint) return;

    const options = getShapeOptions();
    if (!options) return;

    const scale = zoom / 100;
    const scaledWidth = imageWidth * scale;
    const scaledHeight = imageHeight * scale;
    const offsetX = (containerWidth - scaledWidth) / 2 + panOffset.x;
    const offsetY = (containerHeight - scaledHeight) / 2 + panOffset.y;

    ctx.save();

    // Transform to image coordinates
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    if (rotation !== 0 || flipHorizontal || flipVertical) {
      ctx.translate(imageWidth / 2, imageHeight / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
      ctx.translate(-imageWidth / 2, -imageHeight / 2);
    }

    // Draw preview
    drawShapePreview(ctx, shapeTool, options, shapeSettings);

    ctx.restore();
  }, [
    isDrawing,
    startPoint,
    currentPoint,
    shapeTool,
    shapeSettings,
    shiftKey,
    altKey,
    zoom,
    panOffset,
    rotation,
    flipHorizontal,
    flipVertical,
    imageWidth,
    imageHeight,
    containerWidth,
    containerHeight,
    getShapeOptions,
  ]);

  // Get cursor style
  const getCursor = () => {
    if (editMode !== 'shape') return 'default';
    return 'crosshair';
  };

  if (editMode !== 'shape') {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      width={containerWidth}
      height={containerHeight}
      className={cn('absolute inset-0', editMode === 'shape' ? 'pointer-events-auto' : 'pointer-events-none', className)}
      style={{ cursor: getCursor() }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
}

export default ShapeOverlay;
