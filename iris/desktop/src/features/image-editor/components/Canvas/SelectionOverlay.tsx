/**
 * SelectionOverlay
 * Handles selection tools: rectangle, ellipse, lasso, polygon, magic wand
 * Renders marching ants animation for active selections
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import {
  createRectangleMask,
  createEllipseMask,
  createPolygonMask,
  drawSelectionOutline,
  drawMarchingAnts,
  canvasToMask,
  maskToDataUrl,
  getSelectionBounds,
  addToSelection,
  subtractFromSelection,
  intersectSelection,
  type SelectionBounds,
  type Point,
} from '@/features/image-editor/canvas/selectionEngine';
import { screenToImage, createOffscreenCanvas } from '@/features/image-editor/canvas/canvasEngine';
import { magicWandSelect } from '@/features/image-editor/canvas/floodFill';
import { computeEdgeMap, quickSelect } from '@/features/image-editor/canvas/edgeDetection';
import { cn } from '@/shared/lib/utils';

interface SelectionOverlayProps {
  imageWidth: number;
  imageHeight: number;
  containerWidth: number;
  containerHeight: number;
  mainCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  className?: string;
}

export function SelectionOverlay({
  imageWidth,
  imageHeight,
  containerWidth,
  containerHeight,
  mainCanvasRef,
  className,
}: SelectionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskImageRef = useRef<HTMLImageElement | null>(null);
  const edgeMapRef = useRef<Float32Array | null>(null);
  const compositeImageDataRef = useRef<ImageData | null>(null);
  const quickSelectMaskRef = useRef<Uint8ClampedArray | null>(null);
  const cachedMaskRef = useRef<Uint8ClampedArray | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [lassoPoints, setLassoPoints] = useState<Point[]>([]);
  const [polygonPoints, setPolygonPoints] = useState<Point[]>([]);
  const [maskVersion, setMaskVersion] = useState(0);
  const {
    editMode,
    selectionTool,
    selection,
    setSelection,
    selectionMode,
    selectionTolerance,
    selectionContiguous,
    selectionFeather,
    quickSelectBrushSize,
    colorRangeTolerance,
    colorRangeFuzziness,
    setColorRangeColor,
    isSpacePanning,
    zoom,
    panOffset,
    rotation,
    flipHorizontal,
    flipVertical,
  } = useImageEditorStore();

  // Load mask image when selection changes
  useEffect(() => {
    if (selection?.maskDataUrl) {
      const img = new Image();
      img.onload = () => {
        maskImageRef.current = img;
        setMaskVersion(v => v + 1);
      };
      img.src = selection.maskDataUrl;
    } else {
      maskImageRef.current = null;
    }
  }, [selection?.maskDataUrl]);

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

  // Get current selection bounds from start and current points
  const getCurrentBounds = useCallback(
    (shiftKey: boolean = false): SelectionBounds | null => {
      if (!startPoint || !currentPoint) return null;

      let x = Math.min(startPoint.x, currentPoint.x);
      let y = Math.min(startPoint.y, currentPoint.y);
      let width = Math.abs(currentPoint.x - startPoint.x);
      let height = Math.abs(currentPoint.y - startPoint.y);

      // Constrain to square/circle when shift is held
      if (shiftKey) {
        const size = Math.max(width, height);
        width = size;
        height = size;
        if (currentPoint.x < startPoint.x) x = startPoint.x - size;
        if (currentPoint.y < startPoint.y) y = startPoint.y - size;
      }

      return { x, y, width, height };
    },
    [startPoint, currentPoint]
  );

  // Determine effective selection mode from UI mode + keyboard modifiers (Photoshop standard)
  // Shift = add, Alt = subtract, Shift+Alt = intersect
  const getEffectiveMode = useCallback(
    (shiftKey: boolean, altKey: boolean): 'new' | 'add' | 'subtract' | 'intersect' => {
      if (shiftKey && altKey) return 'intersect';
      if (shiftKey) return 'add';
      if (altKey) return 'subtract';
      return selectionMode;
    },
    [selectionMode]
  );

  // Apply selection with mode (new/add/subtract/intersect)
  const applySelectionMode = useCallback(
    (newMask: Uint8ClampedArray, mode: 'new' | 'add' | 'subtract' | 'intersect') => {
      if (mode === 'new' || !selection?.maskDataUrl) {
        const bounds = getSelectionBounds(newMask, imageWidth, imageHeight);
        setSelection({
          maskDataUrl: maskToDataUrl(newMask, imageWidth, imageHeight),
          bounds,
          feather: selectionFeather,
          isInverted: false,
        });
        return;
      }

      // Load existing mask and combine
      const img = new Image();
      img.onload = () => {
        const { ctx: existingCtx } = createOffscreenCanvas(imageWidth, imageHeight, true);
        existingCtx.drawImage(img, 0, 0, imageWidth, imageHeight);
        const existingData = existingCtx.getImageData(0, 0, imageWidth, imageHeight);
        const existingMask = new Uint8ClampedArray(imageWidth * imageHeight);
        for (let i = 0; i < existingMask.length; i++) {
          existingMask[i] = existingData.data[i * 4];
        }

        let combined: Uint8ClampedArray;
        if (mode === 'add') {
          combined = addToSelection(existingMask, newMask);
        } else if (mode === 'subtract') {
          combined = subtractFromSelection(existingMask, newMask);
        } else {
          combined = intersectSelection(existingMask, newMask);
        }

        const bounds = getSelectionBounds(combined, imageWidth, imageHeight);
        setSelection({
          maskDataUrl: maskToDataUrl(combined, imageWidth, imageHeight),
          bounds,
          feather: selectionFeather,
          isInverted: false,
        });
      };
      img.src = selection.maskDataUrl;
    },
    [selection, imageWidth, imageHeight, setSelection, selectionFeather]
  );

  // Handle Magic Wand selection
  const handleMagicWand = useCallback(
    (point: Point, shiftKey: boolean, altKey: boolean) => {
      if (!mainCanvasRef.current) return;

      const { canvas: compositeCanvas, ctx: compositeCtx } = createOffscreenCanvas(imageWidth, imageHeight, true);
      compositeCtx.drawImage(mainCanvasRef.current, 0, 0);

      const tolerance = selectionTolerance ?? 32;
      const newMask = magicWandSelect(compositeCanvas, point.x, point.y, tolerance, selectionContiguous);

      const mode = getEffectiveMode(shiftKey, altKey);
      applySelectionMode(newMask, mode);
    },
    [mainCanvasRef, imageWidth, imageHeight, selectionTolerance, selectionContiguous, getEffectiveMode, applySelectionMode]
  );

  // Handle Quick Selection - brush-based edge-aware selection
  const handleQuickSelect = useCallback(
    (point: Point, isAdditive: boolean) => {
      if (!mainCanvasRef.current) return;

      // Compute edge map on first stroke (cached)
      if (!edgeMapRef.current || !compositeImageDataRef.current) {
        const { ctx: compositeCtx } = createOffscreenCanvas(imageWidth, imageHeight, true);
        compositeCtx.drawImage(mainCanvasRef.current, 0, 0);
        const imgData = compositeCtx.getImageData(0, 0, imageWidth, imageHeight);
        compositeImageDataRef.current = imgData;
        edgeMapRef.current = computeEdgeMap(imgData);
      }

      const newMask = quickSelect(
        compositeImageDataRef.current,
        point.x,
        point.y,
        quickSelectBrushSize,
        edgeMapRef.current,
        0.3,
        selectionTolerance ?? 40,
        isAdditive ? quickSelectMaskRef.current ?? undefined : undefined
      );

      // Merge with existing mask (always additive during a stroke)
      if (quickSelectMaskRef.current) {
        const merged = addToSelection(quickSelectMaskRef.current, newMask);
        quickSelectMaskRef.current = merged;
      } else {
        quickSelectMaskRef.current = newMask;
      }

      // Update selection in real-time
      const bounds = getSelectionBounds(quickSelectMaskRef.current, imageWidth, imageHeight);
      setSelection({
        maskDataUrl: maskToDataUrl(quickSelectMaskRef.current, imageWidth, imageHeight),
        bounds,
        feather: selectionFeather,
        isInverted: false,
      });
    },
    [mainCanvasRef, imageWidth, imageHeight, quickSelectBrushSize, selectionTolerance, setSelection, selectionFeather]
  );

  // Handle Color Range selection - select all pixels matching a sampled color
  const handleColorRange = useCallback(
    (point: Point, shiftKey: boolean, altKey: boolean) => {
      if (!mainCanvasRef.current) return;

      const { ctx: compositeCtx } = createOffscreenCanvas(imageWidth, imageHeight, true);
      compositeCtx.drawImage(mainCanvasRef.current, 0, 0);
      const imgData = compositeCtx.getImageData(0, 0, imageWidth, imageHeight);
      const pixels = imgData.data;

      const px = Math.max(0, Math.min(Math.round(point.x), imageWidth - 1));
      const py = Math.max(0, Math.min(Math.round(point.y), imageHeight - 1));
      const sampleIdx = (py * imageWidth + px) * 4;
      const sR = pixels[sampleIdx];
      const sG = pixels[sampleIdx + 1];
      const sB = pixels[sampleIdx + 2];

      const hex = `#${sR.toString(16).padStart(2, '0')}${sG.toString(16).padStart(2, '0')}${sB.toString(16).padStart(2, '0')}`;
      setColorRangeColor(hex);

      const tolerance = colorRangeTolerance;
      const fuzziness = colorRangeFuzziness;
      const fuzzRange = (fuzziness / 100) * tolerance;
      const totalRange = tolerance + fuzzRange;

      const newMask = new Uint8ClampedArray(imageWidth * imageHeight);

      for (let i = 0; i < newMask.length; i++) {
        const idx = i * 4;
        const dr = pixels[idx] - sR;
        const dg = pixels[idx + 1] - sG;
        const db = pixels[idx + 2] - sB;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);

        if (dist <= tolerance) {
          newMask[i] = 255;
        } else if (fuzzRange > 0 && dist <= totalRange) {
          newMask[i] = Math.round(255 * (1 - (dist - tolerance) / fuzzRange));
        } else {
          newMask[i] = 0;
        }
      }

      const mode = getEffectiveMode(shiftKey, altKey);
      applySelectionMode(newMask, mode);
    },
    [mainCanvasRef, imageWidth, imageHeight, colorRangeTolerance, colorRangeFuzziness, setColorRangeColor, getEffectiveMode, applySelectionMode]
  );

  // Handle mouse down - start selection
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (editMode !== 'selection') return;
      if (isSpacePanning) return; // Spacebar panning takes priority

      const point = getImageCoords(e);

      // Magic Wand: instant selection on click
      if (selectionTool === 'magicWand') {
        handleMagicWand(point, e.shiftKey, e.altKey);
        return;
      }

      // Color Range: instant selection on click
      if (selectionTool === 'colorRange') {
        handleColorRange(point, e.shiftKey, e.altKey);
        return;
      }

      // Quick Select: start brush-based selection
      if (selectionTool === 'quickSelect') {
        const mode = getEffectiveMode(e.shiftKey, e.altKey);
        // Always clear cached data for new stroke (combining happens at mouseUp)
        edgeMapRef.current = null;
        compositeImageDataRef.current = null;
        quickSelectMaskRef.current = null;
        setIsSelecting(true);
        handleQuickSelect(point, mode !== 'new');
        return;
      }

      if (selectionTool === 'polygonal') {
        // Polygonal: add point on click
        if (polygonPoints.length > 0) {
          // Check if clicking near first point to close
          const first = polygonPoints[0];
          const dist = Math.sqrt((point.x - first.x) ** 2 + (point.y - first.y) ** 2);
          if (dist < 10 && polygonPoints.length >= 3) {
            // Close polygon - apply selection mode
            const mask = createPolygonMask(imageWidth, imageHeight, polygonPoints);
            const mode = getEffectiveMode(e.shiftKey, e.altKey);
            applySelectionMode(mask, mode);
            setPolygonPoints([]);
            setIsSelecting(false);
            return;
          }
        }
        setPolygonPoints((prev) => [...prev, point]);
        setIsSelecting(true);
      } else {
        setStartPoint(point);
        setCurrentPoint(point);
        setIsSelecting(true);

        if (selectionTool === 'lasso') {
          setLassoPoints([point]);
        }
      }
    },
    [editMode, selectionTool, getImageCoords, polygonPoints, imageWidth, imageHeight, handleMagicWand, handleQuickSelect, handleColorRange, getEffectiveMode, applySelectionMode, isSpacePanning]
  );

  // Handle mouse move - update selection preview
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isSelecting && selectionTool !== 'polygonal') return;

      const point = getImageCoords(e);

      // Quick Select: extend selection while dragging
      if (selectionTool === 'quickSelect' && isSelecting) {
        handleQuickSelect(point, true); // Always additive during drag
        return;
      }

      if (selectionTool === 'lasso') {
        setLassoPoints((prev) => [...prev, point]);
      } else if (selectionTool !== 'polygonal') {
        setCurrentPoint(point);
      }

      // Update preview for polygonal tool
      if (selectionTool === 'polygonal' && polygonPoints.length > 0) {
        setCurrentPoint(point);
      }
    },
    [isSelecting, selectionTool, getImageCoords, polygonPoints, handleQuickSelect]
  );

  // Handle mouse up - complete selection
  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!isSelecting || selectionTool === 'polygonal') return;

      // Quick Select: finish stroke (selection already applied in real-time)
      if (selectionTool === 'quickSelect') {
        if (quickSelectMaskRef.current) {
          const mode = getEffectiveMode(e.shiftKey, e.altKey);
          applySelectionMode(quickSelectMaskRef.current, mode);
        }
        setIsSelecting(false);
        return;
      }

      const shiftKey = e.shiftKey;
      const altKey = e.altKey;

      if (selectionTool === 'lasso') {
        if (lassoPoints.length >= 3) {
          const mask = createPolygonMask(imageWidth, imageHeight, lassoPoints);
          const mode = getEffectiveMode(shiftKey, altKey);
          applySelectionMode(mask, mode);
        }
        setLassoPoints([]);
      } else {
        // Rectangle or ellipse - Shift still constrains to square/circle
        const bounds = getCurrentBounds(shiftKey);
        if (bounds && bounds.width > 0 && bounds.height > 0) {
          let mask: Uint8ClampedArray;
          if (selectionTool === 'ellipse') {
            mask = createEllipseMask(imageWidth, imageHeight, bounds);
          } else {
            mask = createRectangleMask(imageWidth, imageHeight, bounds);
          }

          // For rect/ellipse, Shift is used for constraint, so only Alt triggers subtract
          // Use UI selectionMode for add/intersect (via mode toggle buttons)
          const mode = getEffectiveMode(false, altKey);
          applySelectionMode(mask, mode);
        }
      }

      setIsSelecting(false);
      setStartPoint(null);
      setCurrentPoint(null);
    },
    [isSelecting, selectionTool, lassoPoints, imageWidth, imageHeight, getCurrentBounds, getEffectiveMode, applySelectionMode]
  );

  // Handle double click - complete polygon
  const handleDoubleClick = useCallback(() => {
    if (selectionTool === 'polygonal' && polygonPoints.length >= 3) {
      const mask = createPolygonMask(imageWidth, imageHeight, polygonPoints);
      applySelectionMode(mask, selectionMode);
      setPolygonPoints([]);
      setIsSelecting(false);
    }
  }, [selectionTool, polygonPoints, imageWidth, imageHeight, selectionMode, applySelectionMode]);

  // Handle escape key - cancel selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSelecting(false);
        setStartPoint(null);
        setCurrentPoint(null);
        setLassoPoints([]);
        setPolygonPoints([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Cache mask data for marching ants (avoid recomputing every frame)
  useEffect(() => {
    if (!selection?.maskDataUrl) {
      cachedMaskRef.current = null;
      return;
    }
    const maskImg = maskImageRef.current;
    if (!maskImg || !maskImg.complete || maskImg.naturalWidth === 0) return;

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = imageWidth;
    maskCanvas.height = imageHeight;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return;
    maskCtx.drawImage(maskImg, 0, 0, imageWidth, imageHeight);
    cachedMaskRef.current = canvasToMask(maskCanvas);
  }, [selection?.maskDataUrl, maskVersion, imageWidth, imageHeight]);

  // Render selection preview and marching ants with animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number | null = null;
    let offset = 0;
    let lastTime = 0;

    const render = (time: number) => {
      // Advance offset every ~150ms for marching ants animation
      if (time - lastTime > 150) {
        offset = (offset + 1) % 8;
        lastTime = time;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const scale = zoom / 100;
      const scaledWidth = imageWidth * scale;
      const scaledHeight = imageHeight * scale;
      const oX = (containerWidth - scaledWidth) / 2 + panOffset.x;
      const oY = (containerHeight - scaledHeight) / 2 + panOffset.y;

      ctx.save();

      // Transform to image coordinates
      ctx.translate(oX, oY);
      ctx.scale(scale, scale);

      if (rotation !== 0 || flipHorizontal || flipVertical) {
        ctx.translate(imageWidth / 2, imageHeight / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
        ctx.translate(-imageWidth / 2, -imageHeight / 2);
      }

      // Draw existing selection outline with animated marching ants
      if (selection?.bounds) {
        if (selection.maskDataUrl) {
          // Mask-based selection: use drawMarchingAnts for proper animated visualization
          const mask = cachedMaskRef.current;
          if (mask) {
            drawMarchingAnts(ctx, mask, imageWidth, imageHeight, offset);
          }
        } else {
          drawSelectionOutline(
            ctx,
            selection.bounds,
            offset,
            selectionTool === 'ellipse' ? 'ellipse' : 'rectangle'
          );
        }
      }

      // Draw selection preview
      if (isSelecting) {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(0, 120, 255, 0.8)';
        ctx.lineWidth = 1 / scale;
        ctx.fillStyle = 'rgba(0, 120, 255, 0.1)';

        if (selectionTool === 'rectangle' || selectionTool === 'ellipse') {
          const bounds = getCurrentBounds();
          if (bounds) {
            if (selectionTool === 'ellipse') {
              ctx.beginPath();
              ctx.ellipse(
                bounds.x + bounds.width / 2,
                bounds.y + bounds.height / 2,
                bounds.width / 2,
                bounds.height / 2,
                0,
                0,
                Math.PI * 2
              );
              ctx.fill();
              ctx.stroke();
            } else {
              ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
              ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
            }
          }
        } else if (selectionTool === 'lasso' && lassoPoints.length > 1) {
          ctx.beginPath();
          ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
          for (let i = 1; i < lassoPoints.length; i++) {
            ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
          }
          ctx.stroke();
        } else if (selectionTool === 'polygonal' && polygonPoints.length > 0) {
          ctx.beginPath();
          ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
          for (let i = 1; i < polygonPoints.length; i++) {
            ctx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
          }
          if (currentPoint) {
            ctx.lineTo(currentPoint.x, currentPoint.y);
          }
          ctx.stroke();

          // Draw points
          ctx.fillStyle = 'rgba(0, 120, 255, 1)';
          for (const point of polygonPoints) {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 4 / scale, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      ctx.restore();

      // Continue animation loop when there is an active selection
      if (selection?.bounds) {
        animationId = requestAnimationFrame(render);
      }
    };

    // Start animation if selection exists, otherwise render once
    if (selection?.bounds) {
      animationId = requestAnimationFrame(render);
    } else {
      render(0);
    }

    return () => {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [
    selection,
    isSelecting,
    startPoint,
    currentPoint,
    lassoPoints,
    polygonPoints,
    selectionTool,
    zoom,
    panOffset,
    rotation,
    flipHorizontal,
    flipVertical,
    imageWidth,
    imageHeight,
    containerWidth,
    containerHeight,
    getCurrentBounds,
    maskVersion,
  ]);

  // Get cursor style
  const getCursor = () => {
    if (editMode !== 'selection') return 'default';
    return 'crosshair';
  };

  if (editMode !== 'selection') {
    // Still render if there's an active selection to show marching ants
    if (!selection) return null;
  }

  return (
    <canvas
      ref={canvasRef}
      width={containerWidth}
      height={containerHeight}
      className={cn('absolute inset-0', editMode === 'selection' ? 'pointer-events-auto' : 'pointer-events-none', className)}
      style={{ cursor: getCursor() }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    />
  );
}

export default SelectionOverlay;
