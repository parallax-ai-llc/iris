/**
 * MaskCanvas
 * Handles layer mask editing with brush tools
 * White = visible, Black = hidden, Gray = partial transparency
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import {
  createBrushTip,
  renderBrushDab,
  interpolatePoints,
  calculateSpacing,
  type Point,
  type BrushTip,
} from '@/features/image-editor/canvas/brushEngine';
import {
  createOffscreenCanvas,
  screenToImage,
} from '@/features/image-editor/canvas/canvasEngine';
import { cn } from '@/shared/lib/utils';

interface MaskCanvasProps {
  imageWidth: number;
  imageHeight: number;
  containerWidth: number;
  containerHeight: number;
  onMaskUpdate: (maskDataUrl: string) => void;
  className?: string;
}

export function MaskCanvas({
  imageWidth,
  imageHeight,
  containerWidth,
  containerHeight,
  onMaskUpdate,
  className,
}: MaskCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPoint, setLastPoint] = useState<Point | null>(null);
  const brushTipRef = useRef<BrushTip | null>(null);

  const {
    editMode,
    activeTool,
    brushSettings,
    layers,
    activeLayerId,
    zoom,
    panOffset,
    rotation,
    flipHorizontal,
    flipVertical,
  } = useImageEditorStore();

  // Get active layer's mask
  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const hasMask = !!activeLayer?.mask;

  // Initialize mask canvas from layer mask
  useEffect(() => {
    if (!hasMask || !activeLayer?.mask) return;

    const { canvas, ctx } = createOffscreenCanvas(imageWidth, imageHeight, true);
    maskCanvasRef.current = canvas;

    // Load existing mask
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
    };
    img.src = activeLayer.mask.data;
  }, [hasMask, activeLayer?.mask, imageWidth, imageHeight]);

  // Create brush tip for mask painting
  useEffect(() => {
    if (editMode === 'mask') {
      // Mask brush is always grayscale (white to reveal, black to hide)
      const maskColor = activeTool === 'brush' ? '#ffffff' : '#000000';
      brushTipRef.current = createBrushTip({
        ...brushSettings,
        color: maskColor,
      });
    }
  }, [editMode, activeTool, brushSettings]);

  // Transform screen coordinates to image coordinates
  const getImageCoords = useCallback(
    (e: React.PointerEvent): Point => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };

      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      const coords = screenToImage(
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

      const pressure = 'pressure' in e && e.pressure > 0 ? e.pressure : 1;
      return { x: coords.x, y: coords.y, pressure };
    },
    [imageWidth, imageHeight, containerWidth, containerHeight, zoom, panOffset, rotation, flipHorizontal, flipVertical]
  );

  // Start painting mask
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (editMode !== 'mask' || !hasMask) return;
      if (activeTool !== 'brush' && activeTool !== 'eraser') return;

      e.currentTarget.setPointerCapture(e.pointerId);

      const point = getImageCoords(e);
      setIsDrawing(true);
      setLastPoint(point);

      // Initialize mask canvas if not exists
      if (!maskCanvasRef.current) {
        const { canvas, ctx } = createOffscreenCanvas(imageWidth, imageHeight, true);
        // Start with white (fully visible) mask
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, imageWidth, imageHeight);
        maskCanvasRef.current = canvas;
      }

      // Create brush tip
      const maskColor = activeTool === 'brush' ? '#ffffff' : '#000000';
      brushTipRef.current = createBrushTip({
        ...brushSettings,
        color: maskColor,
      });

      // Draw first dab
      const ctx = maskCanvasRef.current.getContext('2d');
      if (ctx && brushTipRef.current) {
        renderBrushDab(
          ctx,
          brushTipRef.current,
          point.x,
          point.y,
          brushSettings.opacity,
          point.pressure ?? 1
        );
      }

      updateOverlay();
    },
    // updateOverlay is defined later but only invoked here once the user starts
    // painting — adding it to deps would hit a TDZ error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editMode, activeTool, hasMask, brushSettings, imageWidth, imageHeight, getImageCoords]
  );

  // Continue painting mask
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawing || !lastPoint || !maskCanvasRef.current || !brushTipRef.current) return;

      const point = getImageCoords(e);
      const ctx = maskCanvasRef.current.getContext('2d');
      if (!ctx) return;

      const spacing = calculateSpacing(brushSettings.size);
      const points = interpolatePoints(lastPoint, point, spacing);

      for (const p of points) {
        renderBrushDab(
          ctx,
          brushTipRef.current,
          p.x,
          p.y,
          brushSettings.opacity,
          p.pressure ?? 1
        );
      }

      setLastPoint(point);
      updateOverlay();
    },
    // updateOverlay is defined later — see comment in handlePointerDown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isDrawing, lastPoint, brushSettings, getImageCoords]
  );

  // End painting mask
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawing) return;

      e.currentTarget.releasePointerCapture(e.pointerId);

      // Commit mask changes
      if (maskCanvasRef.current) {
        const maskDataUrl = maskCanvasRef.current.toDataURL('image/png');
        onMaskUpdate(maskDataUrl);
      }

      setIsDrawing(false);
      setLastPoint(null);
    },
    [isDrawing, onMaskUpdate]
  );

  // Update overlay to show mask preview
  const updateOverlay = useCallback(() => {
    if (!canvasRef.current || !maskCanvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    const scale = zoom / 100;
    const scaledWidth = imageWidth * scale;
    const scaledHeight = imageHeight * scale;
    const offsetX = (containerWidth - scaledWidth) / 2 + panOffset.x;
    const offsetY = (containerHeight - scaledHeight) / 2 + panOffset.y;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    if (rotation !== 0 || flipHorizontal || flipVertical) {
      ctx.translate(imageWidth / 2, imageHeight / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
      ctx.translate(-imageWidth / 2, -imageHeight / 2);
    }

    // Draw mask with red overlay for hidden areas
    ctx.globalAlpha = 0.5;
    ctx.drawImage(maskCanvasRef.current, 0, 0);

    // Draw red tint over black (hidden) areas
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, imageWidth, imageHeight);

    ctx.restore();
  }, [zoom, imageWidth, imageHeight, containerWidth, containerHeight, panOffset, rotation, flipHorizontal, flipVertical]);

  // Show brush cursor
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (editMode !== 'mask' || isDrawing) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw mask preview if exists
      if (maskCanvasRef.current) {
        updateOverlay();
      }

      // Draw brush cursor
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const scale = zoom / 100;
      const cursorRadius = (brushSettings.size / 2) * scale;

      ctx.save();
      ctx.strokeStyle = activeTool === 'brush' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(screenX, screenY, cursorRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = activeTool === 'brush' ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.8)';
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.arc(screenX, screenY, cursorRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    },
    [editMode, isDrawing, activeTool, brushSettings.size, zoom, updateOverlay]
  );

  const handleMouseLeave = useCallback(() => {
    if (canvasRef.current && !isDrawing) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        if (maskCanvasRef.current) {
          updateOverlay();
        }
      }
    }
  }, [isDrawing, updateOverlay]);

  if (editMode !== 'mask' || !hasMask) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      width={containerWidth}
      height={containerHeight}
      className={cn('absolute inset-0 pointer-events-auto', className)}
      style={{ cursor: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    />
  );
}

export default MaskCanvas;
