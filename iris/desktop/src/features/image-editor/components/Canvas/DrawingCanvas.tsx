/**
 * DrawingCanvas
 * Handles real-time brush, pencil, and eraser drawing operations
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import {
  createBrushTip,
  renderBrushDab,
  interpolatePoints,
  calculateSpacing,
  renderLinearGradient,
  renderRadialGradient,
  renderAngularGradient,
  renderDiamondGradient,
  renderCloneStamp,
  applyDodgeBurnAtPoint,
  applySpongeAtPoint,
  applyBlurBrushAtPoint,
  applySharpenBrushAtPoint,
  applySmudgeAtPoint,
  applyHealingAtPoint,
  applySpotHealingAtPoint,
  type Point,
  type BrushTip,
  type GradientColorStop,
} from '@/features/image-editor/canvas/brushEngine';
import {
  createOffscreenCanvas,
  screenToImage,
  getPixelColor,
  rgbToHex,
  hexToRgb,
} from '@/features/image-editor/canvas/canvasEngine';
import { bucketFill } from '@/features/image-editor/canvas/floodFill';
import { cn } from '@/shared/lib/utils';

interface DrawingCanvasProps {
  imageWidth: number;
  imageHeight: number;
  containerWidth: number;
  containerHeight: number;
  onCommitStroke: (canvas: HTMLCanvasElement) => void;
  mainCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  className?: string;
}

export function DrawingCanvas({
  imageWidth,
  imageHeight,
  containerWidth,
  containerHeight,
  onCommitStroke,
  mainCanvasRef,
  className,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPoint, setLastPoint] = useState<Point | null>(null);
  const brushTipRef = useRef<BrushTip | null>(null);
  const strokeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Per-stroke working copy of the main canvas for pixel-modify tools
  // (dodge/burn/sponge/blur/sharpen). Lets each dab read progressively-updated
  // pixels so overlapping dabs accumulate within a single stroke, without
  // mutating the live main canvas.
  const pixelSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgEraserSampleRef = useRef<{ r: number; g: number; b: number } | null>(null);

  // Live eraser preview: the eraser must erase in real time (like the brush
  // previews paint), not only on pointer-up. The overlay canvas sits *above* the
  // main canvas, so we can't preview an erase there — instead we apply a live
  // destination-out onto the main canvas, restoring from a pristine snapshot
  // each frame so the operation is non-destructive until commit.
  // - eraserBackingRef: pristine snapshot of the main canvas at stroke start.
  // - eraserMaskRef: alpha mask of what is actually erasable (active layer's
  //   pixels, or the canvas content in legacy no-layer mode). Masking the stroke
  //   by this prevents an erase "indication" over empty/transparent regions.
  // - eraserTmpRef: reusable scratch canvas for building the masked stroke.
  const eraserBackingRef = useRef<HTMLCanvasElement | null>(null);
  const eraserMaskRef = useRef<HTMLCanvasElement | null>(null);
  const eraserTmpRef = useRef<HTMLCanvasElement | null>(null);

  // Use refs for immediate access (state updates are async and can cause missed events)
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);

  // Last stroke end point for Shift+click straight line (Photoshop standard)
  const lastStrokeEndRef = useRef<Point | null>(null);

  // Clone stamp source position
  const [cloneSource, setCloneSource] = useState<Point | null>(null);
  const [cloneOffset, setCloneOffset] = useState<{ dx: number; dy: number } | null>(null);

  // Healing brush source (Alt+click to set)
  const [healingSource, setHealingSource] = useState<Point | null>(null);
  const [healingOffset, setHealingOffset] = useState<{ dx: number; dy: number } | null>(null);

  // Gradient start/end points
  const [gradientStart, setGradientStart] = useState<Point | null>(null);

  const {
    editMode,
    activeTool,
    brushSettings,
    dodgeBurnSettings,
    spongeMode,
    localAdjustStrength,
    gradientSettings,
    zoom,
    panOffset,
    rotation,
    flipHorizontal,
    flipVertical,
    setBrushSettings,
    snapToGrid,
    gridSize,
    isSpacePanning,
  } = useImageEditorStore();

  // Create brush tip when settings change
  useEffect(() => {
    if (editMode === 'drawing' && (activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'background-eraser')) {
      brushTipRef.current = createBrushTip({
        ...brushSettings,
        color: activeTool === 'brush' ? brushSettings.color : '#ffffff',
      });
    } else {
      brushTipRef.current = null;
    }
  }, [editMode, activeTool, brushSettings]);

  // Clear overlay canvas when not in drawing mode
  useEffect(() => {
    if (editMode !== 'drawing' && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  }, [editMode]);

  // Transform screen coordinates to image coordinates
  const getImageCoords = useCallback(
    (e: React.MouseEvent | React.PointerEvent): Point => {
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

      // Get pressure from pointer event if available
      const pressure = 'pressure' in e && e.pressure > 0 ? e.pressure : 1;

      let x = coords.x;
      let y = coords.y;

      // Snap to grid if enabled
      if (snapToGrid && gridSize > 1) {
        x = Math.round(x / gridSize) * gridSize;
        y = Math.round(y / gridSize) * gridSize;
      }

      return { x, y, pressure };
    },
    [imageWidth, imageHeight, containerWidth, containerHeight, zoom, panOffset, rotation, flipHorizontal, flipVertical, snapToGrid, gridSize]
  );

  // Background eraser dab: writes an erase-alpha mask into stroke canvas
  // where pixels similar to sampled color (within tolerance) are marked opaque.
  const paintBackgroundEraserDab = useCallback(
    (strokeCtx: CanvasRenderingContext2D, cx: number, cy: number) => {
      if (!mainCanvasRef.current || !bgEraserSampleRef.current) return;
      const srcCtx = mainCanvasRef.current.getContext('2d', { willReadFrequently: true });
      if (!srcCtx) return;

      const size = Math.max(1, brushSettings.size);
      const half = size / 2;
      const hardness = brushSettings.hardness / 100;
      const tolerance = 48;
      const tol3 = tolerance * 3;
      const sample = bgEraserSampleRef.current;

      const x0 = Math.max(0, Math.floor(cx - half));
      const y0 = Math.max(0, Math.floor(cy - half));
      const w = Math.min(Math.ceil(size), mainCanvasRef.current.width - x0);
      const h = Math.min(Math.ceil(size), mainCanvasRef.current.height - y0);
      if (w <= 0 || h <= 0) return;

      const source = srcCtx.getImageData(x0, y0, w, h);
      const existing = strokeCtx.getImageData(x0, y0, w, h);

      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const dx = (x0 + px + 0.5) - cx;
          const dy = (y0 + py + 0.5) - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > half) continue;

          // Soft edge based on hardness
          const norm = dist / half;
          const edge = hardness >= 1 ? 1 : Math.max(0, Math.min(1, (1 - norm) / Math.max(0.0001, 1 - hardness)));

          const i = (py * w + px) * 4;
          const sr = source.data[i], sg = source.data[i + 1], sb = source.data[i + 2];
          const diff = Math.abs(sr - sample.r) + Math.abs(sg - sample.g) + Math.abs(sb - sample.b);
          if (diff > tol3) continue;

          const eraseFactor = (1 - diff / tol3) * edge;
          const a = Math.round(eraseFactor * 255);
          if (a > existing.data[i + 3]) {
            existing.data[i] = 255;
            existing.data[i + 1] = 255;
            existing.data[i + 2] = 255;
            existing.data[i + 3] = a;
          }
        }
      }
      strokeCtx.putImageData(existing, x0, y0);
    },
    [brushSettings.size, brushSettings.hardness, mainCanvasRef]
  );

  // Handle eyedropper tool
  const handleEyedropper = useCallback(
    (e: React.MouseEvent) => {
      if (!mainCanvasRef.current) return;

      const point = getImageCoords(e);
      const color = getPixelColor(mainCanvasRef.current, point.x, point.y);
      const hex = rgbToHex(color.r, color.g, color.b);

      setBrushSettings({ color: hex });
    },
    [mainCanvasRef, getImageCoords, setBrushSettings]
  );

  // Handle bucket fill tool - operates on active layer
  const handleBucketFill = useCallback(
    async (point: Point) => {
      if (!mainCanvasRef.current) return;

      const { layers, activeLayerId } = useImageEditorStore.getState();
      const activeLayer = activeLayerId ? layers.find(l => l.id === activeLayerId) : null;

      const { r, g, b } = hexToRgb(brushSettings.color);

      if (activeLayer && activeLayer.imageData) {
        // Apply bucket fill to active layer only
        const w = mainCanvasRef.current.width;
        const h = mainCanvasRef.current.height;

        // Load layer content
        const layerCanvas = document.createElement('canvas');
        layerCanvas.width = w;
        layerCanvas.height = h;
        const layerCtx = layerCanvas.getContext('2d', { willReadFrequently: true });
        if (!layerCtx) return;

        const img = await new Promise<HTMLImageElement>((resolve) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => resolve(i);
          i.src = activeLayer.imageData;
        });
        layerCtx.drawImage(img, activeLayer.x, activeLayer.y);

        // Snapshot before fill
        const beforeData = layerCtx.getImageData(0, 0, w, h);

        // Bucket fill on the layer canvas
        bucketFill(layerCanvas, point.x, point.y, { r, g, b }, 32);

        // Extract only the changed pixels as a stroke
        const afterData = layerCtx.getImageData(0, 0, w, h);
        const { canvas: strokeCanvas, ctx: strokeCtx } = createOffscreenCanvas(w, h, true);
        const strokeData = strokeCtx.createImageData(w, h);
        for (let i = 0; i < beforeData.data.length; i += 4) {
          if (
            beforeData.data[i] !== afterData.data[i] ||
            beforeData.data[i + 1] !== afterData.data[i + 1] ||
            beforeData.data[i + 2] !== afterData.data[i + 2] ||
            beforeData.data[i + 3] !== afterData.data[i + 3]
          ) {
            strokeData.data[i] = afterData.data[i];
            strokeData.data[i + 1] = afterData.data[i + 1];
            strokeData.data[i + 2] = afterData.data[i + 2];
            strokeData.data[i + 3] = afterData.data[i + 3];
          }
        }
        strokeCtx.putImageData(strokeData, 0, 0);

        // Pass fill-only stroke to commitStroke (selection mask applied there)
        onCommitStroke(strokeCanvas);
      } else {
        // No active layer fallback: fill on composited canvas
        bucketFill(mainCanvasRef.current, point.x, point.y, { r, g, b }, 32);

        const { canvas, ctx } = createOffscreenCanvas(imageWidth, imageHeight, true);
        ctx.drawImage(mainCanvasRef.current, 0, 0);
        onCommitStroke(canvas);
      }
    },
    [mainCanvasRef, brushSettings.color, imageWidth, imageHeight, onCommitStroke]
  );

  // Handle clone stamp source setting (Alt+click)
  const handleCloneSourceSet = useCallback(
    (point: Point) => {
      setCloneSource(point);
      setCloneOffset(null);
    },
    []
  );

  // Start drawing
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (editMode !== 'drawing') return;
      if (isSpacePanning) return; // Spacebar panning takes priority

      // Handle eyedropper
      if (activeTool === 'eyedropper') {
        handleEyedropper(e);
        return;
      }

      // Alt+click = temporary eyedropper from any painting tool (Photoshop standard)
      // Clone stamp and healing brush use Alt+click for source setting, so exclude them
      if (e.altKey && activeTool !== 'clone' && activeTool !== 'healing') {
        handleEyedropper(e);
        return;
      }

      const point = getImageCoords(e);

      // Handle bucket fill
      if (activeTool === 'bucket') {
        handleBucketFill(point);
        return;
      }

      // Handle clone stamp source setting (Alt+click)
      if (activeTool === 'clone' && e.altKey) {
        handleCloneSourceSet(point);
        return;
      }

      // Handle gradient tool
      if (activeTool === 'gradient') {
        e.currentTarget.setPointerCapture(e.pointerId);
        setGradientStart(point);
        setIsDrawing(true);
        return;
      }

      const isPixelModifyTool = activeTool === 'dodge' || activeTool === 'burn' || activeTool === 'sponge'
        || activeTool === 'smudge' || activeTool === 'blur-brush' || activeTool === 'sharpen-brush';

      // Healing brush: Alt+click sets source
      if (activeTool === 'healing' && e.altKey) {
        setHealingSource(point);
        setHealingOffset(null);
        return;
      }

      // Magic eraser: one-shot flood-fill erase at clicked point
      if (activeTool === 'magic-eraser' && mainCanvasRef.current) {
        const { canvas: strokeCanvas, ctx: strokeCtx } = createOffscreenCanvas(imageWidth, imageHeight, true);
        const srcCtx = mainCanvasRef.current.getContext('2d', { willReadFrequently: true });
        if (srcCtx) {
          const src = srcCtx.getImageData(0, 0, imageWidth, imageHeight);
          const idx = (Math.floor(point.y) * imageWidth + Math.floor(point.x)) * 4;
          const sr = src.data[idx], sg = src.data[idx + 1], sb = src.data[idx + 2];
          const tolerance = 32;
          const tol3 = tolerance * 3;
          const mask = new ImageData(imageWidth, imageHeight);
          // Contiguous flood fill producing an erase-alpha mask (white where erased)
          const visited = new Uint8Array(imageWidth * imageHeight);
          const stack: number[] = [Math.floor(point.x), Math.floor(point.y)];
          while (stack.length > 0) {
            const py = stack.pop()!;
            const px = stack.pop()!;
            if (px < 0 || px >= imageWidth || py < 0 || py >= imageHeight) continue;
            const pidx = py * imageWidth + px;
            if (visited[pidx]) continue;
            const di = pidx * 4;
            if (Math.abs(src.data[di] - sr) + Math.abs(src.data[di + 1] - sg) + Math.abs(src.data[di + 2] - sb) > tol3) continue;
            visited[pidx] = 1;
            mask.data[di] = 255;
            mask.data[di + 1] = 255;
            mask.data[di + 2] = 255;
            mask.data[di + 3] = 255;
            stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
          }
          strokeCtx.putImageData(mask, 0, 0);
          onCommitStroke(strokeCanvas);
        }
        return;
      }

      if (activeTool !== 'brush' && activeTool !== 'pencil' && activeTool !== 'eraser' && activeTool !== 'clone'
        && !isPixelModifyTool && activeTool !== 'healing' && activeTool !== 'spot-healing'
        && activeTool !== 'background-eraser') {
        return;
      }

      // Background eraser: sample color at first click point
      if (activeTool === 'background-eraser' && mainCanvasRef.current) {
        const sampled = getPixelColor(mainCanvasRef.current, point.x, point.y);
        bgEraserSampleRef.current = { r: sampled.r, g: sampled.g, b: sampled.b };
      }

      // Shift+click = draw straight line from last stroke end point (Photoshop standard)
      if (e.shiftKey && lastStrokeEndRef.current && (activeTool === 'brush' || activeTool === 'pencil' || activeTool === 'eraser')) {
        const { canvas, ctx } = createOffscreenCanvas(imageWidth, imageHeight, true);
        const from = lastStrokeEndRef.current;
        const spacing = calculateSpacing(brushSettings.size);
        const points = interpolatePoints(from, point, spacing);

        if (activeTool === 'pencil') {
          ctx.strokeStyle = brushSettings.color;
          ctx.lineWidth = brushSettings.size;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.globalAlpha = brushSettings.opacity;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
        } else {
          const tip = createBrushTip({
            ...brushSettings,
            color: activeTool === 'eraser' ? '#ffffff' : brushSettings.color,
          });
          for (const p of points) {
            renderBrushDab(ctx, tip, p.x, p.y, brushSettings.flow, 1);
          }
        }

        lastStrokeEndRef.current = point;
        onCommitStroke(canvas);
        return;
      }

      // Capture pointer for smooth drawing
      e.currentTarget.setPointerCapture(e.pointerId);

      // Set refs immediately for synchronous access in move handler
      isDrawingRef.current = true;
      lastPointRef.current = point;
      setIsDrawing(true);
      setLastPoint(point);

      // For clone stamp, calculate offset from source
      if (activeTool === 'clone' && cloneSource && !cloneOffset) {
        setCloneOffset({
          dx: cloneSource.x - point.x,
          dy: cloneSource.y - point.y,
        });
      }

      // For healing brush, calculate offset from source
      if (activeTool === 'healing' && healingSource && !healingOffset) {
        setHealingOffset({
          dx: healingSource.x - point.x,
          dy: healingSource.y - point.y,
        });
      }

      // Create stroke canvas
      const { canvas, ctx } = createOffscreenCanvas(imageWidth, imageHeight, true);
      strokeCanvasRef.current = canvas;

      // Eraser/background-eraser: snapshot the pristine main canvas and build the
      // "erasable" alpha mask (active layer pixels, or canvas content in legacy
      // no-layer mode) so the stroke can be previewed live via destination-out.
      if ((activeTool === 'eraser' || activeTool === 'background-eraser') && mainCanvasRef.current) {
        const main = mainCanvasRef.current;
        const backing = document.createElement('canvas');
        backing.width = main.width;
        backing.height = main.height;
        backing.getContext('2d')?.drawImage(main, 0, 0);
        eraserBackingRef.current = backing;

        const { layers, activeLayerId } = useImageEditorStore.getState();
        const activeLayer = activeLayerId ? layers.find(l => l.id === activeLayerId) : null;
        if (activeLayer && activeLayer.imageData) {
          // Mask = active layer's own alpha (loaded async; until ready the live
          // preview simply doesn't erase, so empty layers never flash a mark).
          eraserMaskRef.current = null;
          const maskCanvas = document.createElement('canvas');
          maskCanvas.width = main.width;
          maskCanvas.height = main.height;
          const maskCtx = maskCanvas.getContext('2d');
          const img = new Image();
          img.onload = () => {
            maskCtx?.drawImage(img, activeLayer.x, activeLayer.y);
            eraserMaskRef.current = maskCanvas;
          };
          img.onerror = () => { eraserMaskRef.current = maskCanvas; };
          img.src = activeLayer.imageData;
        } else {
          // Legacy no-layer mode: the canvas content itself is what gets erased.
          eraserMaskRef.current = backing;
        }
      }

      // Create brush tip
      if (activeTool === 'brush' || activeTool === 'eraser') {
        brushTipRef.current = createBrushTip({
          ...brushSettings,
          color: activeTool === 'eraser' ? '#ffffff' : brushSettings.color,
        });
      }

      // For pixel-modify tools: apply first dab at pointer down
      if (isPixelModifyTool && mainCanvasRef.current) {
        // Create a per-stroke working copy of the main canvas so dodge/burn/etc.
        // can read progressively-updated pixels without mutating the live canvas.
        const work = document.createElement('canvas');
        work.width = mainCanvasRef.current.width;
        work.height = mainCanvasRef.current.height;
        const workCtx = work.getContext('2d', { willReadFrequently: true });
        if (workCtx) {
          workCtx.drawImage(mainCanvasRef.current, 0, 0);
          pixelSourceCanvasRef.current = work;
        }
        const srcCtx = workCtx;
        if (srcCtx) {
          if (activeTool === 'dodge' || activeTool === 'burn') {
            applyDodgeBurnAtPoint(srcCtx, ctx, point.x, point.y, brushSettings.size, brushSettings.hardness,
              activeTool as 'dodge' | 'burn', dodgeBurnSettings.range, dodgeBurnSettings.exposure);
          } else if (activeTool === 'sponge') {
            applySpongeAtPoint(srcCtx, ctx, point.x, point.y, brushSettings.size, brushSettings.hardness,
              spongeMode, localAdjustStrength);
          } else if (activeTool === 'blur-brush') {
            applyBlurBrushAtPoint(srcCtx, ctx, point.x, point.y, brushSettings.size, brushSettings.hardness, localAdjustStrength);
          } else if (activeTool === 'sharpen-brush') {
            applySharpenBrushAtPoint(srcCtx, ctx, point.x, point.y, brushSettings.size, brushSettings.hardness, localAdjustStrength);
          }
          // smudge needs prevPoint, handled in move only
        }
      }

      // Healing tools first dab
      if ((activeTool === 'healing' || activeTool === 'spot-healing') && mainCanvasRef.current) {
        const srcCtx = mainCanvasRef.current.getContext('2d', { willReadFrequently: true });
        if (srcCtx) {
          if (activeTool === 'spot-healing') {
            applySpotHealingAtPoint(srcCtx, ctx, point.x, point.y, brushSettings.size, brushSettings.hardness, brushSettings.opacity);
          } else if (activeTool === 'healing' && healingOffset) {
            applyHealingAtPoint(srcCtx, ctx, point.x, point.y, healingOffset.dx, healingOffset.dy,
              brushSettings.size, brushSettings.hardness, brushSettings.opacity);
          }
        }
      }

      // Background eraser: first dab via color-matching mask
      if (activeTool === 'background-eraser') {
        paintBackgroundEraserDab(ctx, point.x, point.y);
        renderStrokePreview();
        return;
      }

      // Draw first dab
      if (brushTipRef.current && activeTool !== 'pencil') {
        // Eraser: draw normally on stroke canvas, destination-out is applied at commit time
        // Use flow for per-dab opacity, opacity will be applied when compositing the stroke
        renderBrushDab(
          ctx,
          brushTipRef.current,
          point.x,
          point.y,
          brushSettings.flow,
          point.pressure ?? 1
        );
      } else if (activeTool === 'pencil') {
        // Pencil is a simple line
        ctx.strokeStyle = brushSettings.color;
        ctx.lineWidth = brushSettings.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
      }

      // Show preview (eraser erases live on the main canvas; others use overlay)
      renderStrokePreview();
    },
    // updateOverlay/isSpacePanning are defined later in the component but are
    // only invoked from this callback when the user paints — by then all hooks
    // have run. Adding them to deps would create a temporal-dead-zone error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editMode, activeTool, brushSettings, dodgeBurnSettings, spongeMode, localAdjustStrength, imageWidth, imageHeight, getImageCoords, handleEyedropper, handleBucketFill, handleCloneSourceSet, cloneSource, cloneOffset, healingSource, healingOffset, mainCanvasRef, onCommitStroke, paintBackgroundEraserDab]
  );

  // Continue drawing
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      // Use ref for immediate check (state might not have updated yet)
      if (!isDrawingRef.current) return;

      let point = getImageCoords(e);

      // Shift held during drag = constrain to horizontal/vertical axis (Photoshop standard)
      if (e.shiftKey && lastPointRef.current) {
        const dx = Math.abs(point.x - lastPointRef.current.x);
        const dy = Math.abs(point.y - lastPointRef.current.y);
        if (dx > dy) {
          point = { x: point.x, y: lastPointRef.current.y, pressure: point.pressure };
        } else {
          point = { x: lastPointRef.current.x, y: point.y, pressure: point.pressure };
        }
      }

      // Handle gradient preview
      if (activeTool === 'gradient' && gradientStart) {
        lastPointRef.current = point;
        setLastPoint(point);
        updateGradientPreview(gradientStart, point);
        return;
      }

      const prevPoint = lastPointRef.current;
      if (!prevPoint || !strokeCanvasRef.current) return;

      const ctx = strokeCanvasRef.current.getContext('2d');
      if (!ctx) return;

      // Healing tools
      if ((activeTool === 'healing' || activeTool === 'spot-healing') && mainCanvasRef.current) {
        const spacing = calculateSpacing(brushSettings.size);
        const points = interpolatePoints(prevPoint, point, spacing);
        const srcCtx = mainCanvasRef.current.getContext('2d', { willReadFrequently: true });
        if (srcCtx) {
          for (const p of points) {
            if (activeTool === 'spot-healing') {
              applySpotHealingAtPoint(srcCtx, ctx, p.x, p.y, brushSettings.size, brushSettings.hardness, brushSettings.opacity);
            } else if (activeTool === 'healing' && healingOffset) {
              applyHealingAtPoint(srcCtx, ctx, p.x, p.y, healingOffset.dx, healingOffset.dy,
                brushSettings.size, brushSettings.hardness, brushSettings.opacity);
            }
          }
        }
      }

      // Pixel-modify tools (dodge/burn/sponge/smudge/blur/sharpen)
      const isPixelModify = activeTool === 'dodge' || activeTool === 'burn' || activeTool === 'sponge'
        || activeTool === 'smudge' || activeTool === 'blur-brush' || activeTool === 'sharpen-brush';

      if (isPixelModify && mainCanvasRef.current) {
        const spacing = calculateSpacing(brushSettings.size);
        const points = interpolatePoints(prevPoint, point, spacing);
        // Read/write against the per-stroke working copy so dabs accumulate.
        const srcCtx = pixelSourceCanvasRef.current?.getContext('2d', { willReadFrequently: true })
          ?? mainCanvasRef.current.getContext('2d', { willReadFrequently: true });
        if (srcCtx) {
          for (const p of points) {
            if (activeTool === 'dodge' || activeTool === 'burn') {
              applyDodgeBurnAtPoint(srcCtx, ctx, p.x, p.y, brushSettings.size, brushSettings.hardness,
                activeTool as 'dodge' | 'burn', dodgeBurnSettings.range, dodgeBurnSettings.exposure);
            } else if (activeTool === 'sponge') {
              applySpongeAtPoint(srcCtx, ctx, p.x, p.y, brushSettings.size, brushSettings.hardness,
                spongeMode, localAdjustStrength);
            } else if (activeTool === 'blur-brush') {
              applyBlurBrushAtPoint(srcCtx, ctx, p.x, p.y, brushSettings.size, brushSettings.hardness, localAdjustStrength);
            } else if (activeTool === 'sharpen-brush') {
              applySharpenBrushAtPoint(srcCtx, ctx, p.x, p.y, brushSettings.size, brushSettings.hardness, localAdjustStrength);
            } else if (activeTool === 'smudge') {
              applySmudgeAtPoint(srcCtx, ctx, p.x, p.y, prevPoint.x, prevPoint.y,
                brushSettings.size, brushSettings.hardness, localAdjustStrength);
            }
          }
        }
      } else if (activeTool === 'pencil') {
        // Pencil: draw line
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      } else if (activeTool === 'clone' && cloneOffset && mainCanvasRef.current) {
        // Clone stamp: copy from source
        const spacing = calculateSpacing(brushSettings.size);
        const points = interpolatePoints(prevPoint, point, spacing);

        for (const p of points) {
          const srcX = p.x + cloneOffset.dx;
          const srcY = p.y + cloneOffset.dy;
          renderCloneStamp(
            mainCanvasRef.current,
            ctx,
            srcX,
            srcY,
            p.x,
            p.y,
            brushSettings.size,
            brushSettings.hardness,
            brushSettings.opacity
          );
        }
      } else if (activeTool === 'background-eraser') {
        // Background eraser: interpolate color-matched erase dabs
        const spacing = calculateSpacing(brushSettings.size);
        const points = interpolatePoints(prevPoint, point, spacing);
        for (const p of points) {
          paintBackgroundEraserDab(ctx, p.x, p.y);
        }
      } else if (brushTipRef.current) {
        // Brush/Eraser: interpolate and draw dabs
        const spacing = calculateSpacing(brushSettings.size);
        const points = interpolatePoints(prevPoint, point, spacing);

        // Eraser: draw normally on stroke canvas, destination-out is applied at commit time

        for (const p of points) {
          // Use flow for per-dab opacity
          renderBrushDab(
            ctx,
            brushTipRef.current,
            p.x,
            p.y,
            brushSettings.flow,
            p.pressure ?? 1
          );
        }
      }

      // Update both ref and state
      lastPointRef.current = point;
      setLastPoint(point);
      renderStrokePreview();
    },
    // updateOverlay/updateGradientPreview are defined later in the component
    // but are only invoked from this callback when the user paints — by then
    // all hooks have run. Adding them to deps would create a TDZ error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTool, brushSettings, dodgeBurnSettings, spongeMode, localAdjustStrength, getImageCoords, gradientStart, cloneOffset, healingOffset, mainCanvasRef, paintBackgroundEraserDab]
  );

  // Update gradient preview on overlay
  const updateGradientPreview = useCallback(
    (start: Point, end: Point) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const scale = zoom / 100;
      const scaledWidth = imageWidth * scale;
      const scaledHeight = imageHeight * scale;
      const offsetX = (containerWidth - scaledWidth) / 2 + panOffset.x;
      const offsetY = (containerHeight - scaledHeight) / 2 + panOffset.y;

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      // Draw gradient preview line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([4 / scale, 4 / scale]);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      // Draw start/end points
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1 / scale;
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(start.x, start.y, 6 / scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(end.x, end.y, 6 / scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    },
    [zoom, imageWidth, imageHeight, containerWidth, containerHeight, panOffset]
  );

  // End drawing
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      // Use ref for immediate check (state might not have updated yet)
      if (!isDrawingRef.current) return;

      e.currentTarget.releasePointerCapture(e.pointerId);

      // Handle gradient tool completion
      if (activeTool === 'gradient' && gradientStart && lastPoint) {
        const { canvas, ctx } = createOffscreenCanvas(imageWidth, imageHeight, true);

        // Convert gradient settings to color stops
        const colorStops: GradientColorStop[] = gradientSettings?.colorStops || [
          { offset: 0, color: brushSettings.color },
          { offset: 1, color: '#ffffff' },
        ];

        const gradientType = gradientSettings?.type || 'linear';
        const dx = lastPoint.x - gradientStart.x;
        const dy = lastPoint.y - gradientStart.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (gradientType === 'linear') {
          renderLinearGradient(ctx, gradientStart.x, gradientStart.y, lastPoint.x, lastPoint.y, colorStops, imageWidth, imageHeight);
        } else if (gradientType === 'radial') {
          renderRadialGradient(ctx, gradientStart.x, gradientStart.y, distance, colorStops, imageWidth, imageHeight);
        } else if (gradientType === 'angular') {
          const angle = Math.atan2(dy, dx);
          renderAngularGradient(ctx, gradientStart.x, gradientStart.y, angle, colorStops, imageWidth, imageHeight);
        } else if (gradientType === 'diamond') {
          renderDiamondGradient(ctx, gradientStart.x, gradientStart.y, distance, colorStops, imageWidth, imageHeight);
        }

        onCommitStroke(canvas);
        setGradientStart(null);
        setLastPoint(null);
        setIsDrawing(false);
        // Clear refs
        isDrawingRef.current = false;
        lastPointRef.current = null;

        // Clear overlay
        if (canvasRef.current) {
          const overlayCtx = canvasRef.current.getContext('2d');
          if (overlayCtx) {
            overlayCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          }
        }
        return;
      }

      if (activeTool === 'pencil' && strokeCanvasRef.current) {
        const ctx = strokeCanvasRef.current.getContext('2d');
        if (ctx) {
          ctx.stroke();
        }
      }

      // The live eraser preview mutated the main canvas in place. Restore the
      // pristine snapshot so the commit path (which re-applies destination-out and
      // re-composites layers) starts from a clean state and erases exactly once.
      if (eraserBackingRef.current && mainCanvasRef.current) {
        const mctx = mainCanvasRef.current.getContext('2d');
        if (mctx) {
          mctx.globalCompositeOperation = 'source-over';
          mctx.globalAlpha = 1;
          mctx.clearRect(0, 0, mainCanvasRef.current.width, mainCanvasRef.current.height);
          mctx.drawImage(eraserBackingRef.current, 0, 0);
        }
        eraserBackingRef.current = null;
        eraserMaskRef.current = null;
      }

      // Commit stroke to main canvas
      if (strokeCanvasRef.current) {
        onCommitStroke(strokeCanvasRef.current);
        strokeCanvasRef.current = null;
      }

      // Release per-stroke working source canvas
      pixelSourceCanvasRef.current = null;

      // Save last stroke endpoint for Shift+click straight line
      if (lastPointRef.current) {
        lastStrokeEndRef.current = lastPointRef.current;
      }

      setIsDrawing(false);
      setLastPoint(null);
      // Clear refs
      isDrawingRef.current = false;
      lastPointRef.current = null;

      // Clear overlay
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
    },
    [activeTool, onCommitStroke, gradientStart, lastPoint, gradientSettings, brushSettings.color, imageWidth, imageHeight, mainCanvasRef]
  );

  // Update overlay canvas to show stroke preview
  const updateOverlay = useCallback(() => {
    if (!canvasRef.current || !strokeCanvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Clear overlay
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    // Calculate transform to match main canvas
    const scale = zoom / 100;
    const scaledWidth = imageWidth * scale;
    const scaledHeight = imageHeight * scale;
    const offsetX = (containerWidth - scaledWidth) / 2 + panOffset.x;
    const offsetY = (containerHeight - scaledHeight) / 2 + panOffset.y;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Apply rotation and flip
    if (rotation !== 0 || flipHorizontal || flipVertical) {
      ctx.translate(imageWidth / 2, imageHeight / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
      ctx.translate(-imageWidth / 2, -imageHeight / 2);
    }

    // Draw stroke preview
    ctx.globalAlpha = brushSettings.opacity / 100;
    ctx.drawImage(strokeCanvasRef.current, 0, 0);
    ctx.globalAlpha = 1;

    ctx.restore();
  }, [zoom, imageWidth, imageHeight, containerWidth, containerHeight, panOffset, rotation, flipHorizontal, flipVertical, brushSettings.opacity]);

  // Live eraser preview: restore the main canvas from its pristine snapshot, then
  // apply the current stroke as destination-out (masked to the erasable region).
  // This makes the eraser act in real time and leaves no mark where there is
  // nothing to erase. Non-destructive: the snapshot is restored before commit.
  const previewEraseOnMain = useCallback(() => {
    const main = mainCanvasRef.current;
    const backing = eraserBackingRef.current;
    const stroke = strokeCanvasRef.current;
    if (!main || !backing || !stroke) return;
    const mctx = main.getContext('2d');
    if (!mctx) return;

    // Restore pristine pixels
    mctx.globalCompositeOperation = 'source-over';
    mctx.globalAlpha = 1;
    mctx.clearRect(0, 0, main.width, main.height);
    mctx.drawImage(backing, 0, 0);

    // Build the erase source: the stroke clipped to the erasable alpha mask, so
    // transparent/empty regions never show a phantom erase. If the mask isn't
    // ready yet (active layer still loading), skip erasing this frame.
    const mask = eraserMaskRef.current;
    let eraseSrc: HTMLCanvasElement | null = null;
    if (mask) {
      const tmp = eraserTmpRef.current ?? document.createElement('canvas');
      tmp.width = main.width;
      tmp.height = main.height;
      eraserTmpRef.current = tmp;
      const tctx = tmp.getContext('2d');
      if (tctx) {
        tctx.globalCompositeOperation = 'source-over';
        tctx.globalAlpha = 1;
        tctx.clearRect(0, 0, tmp.width, tmp.height);
        tctx.drawImage(stroke, 0, 0);
        tctx.globalCompositeOperation = 'destination-in';
        tctx.drawImage(mask, 0, 0);
        tctx.globalCompositeOperation = 'source-over';
        eraseSrc = tmp;
      }
    }

    if (eraseSrc) {
      mctx.globalCompositeOperation = 'destination-out';
      // Mirror commit: regular eraser honors opacity; background-eraser uses the
      // mask's own per-pixel erase strength at full alpha.
      mctx.globalAlpha = activeTool === 'eraser' ? brushSettings.opacity / 100 : 1;
      mctx.drawImage(eraseSrc, 0, 0);
      mctx.globalAlpha = 1;
      mctx.globalCompositeOperation = 'source-over';
    }

    // Keep the overlay clear so no stale white dabs / cursor remain on top.
    if (canvasRef.current) {
      const octx = canvasRef.current.getContext('2d');
      octx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, [mainCanvasRef, activeTool, brushSettings.opacity]);

  // Dispatch the in-stroke preview: eraser tools erase live on the main canvas,
  // every other tool previews its stroke on the overlay as before.
  const renderStrokePreview = useCallback(() => {
    if (activeTool === 'eraser' || activeTool === 'background-eraser') {
      previewEraseOnMain();
    } else {
      updateOverlay();
    }
  }, [activeTool, previewEraseOnMain, updateOverlay]);

  // Show brush cursor preview
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (editMode !== 'drawing' || isDrawing) return;
      const showCursorCircle = activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'pencil'
        || activeTool === 'dodge' || activeTool === 'burn' || activeTool === 'sponge'
        || activeTool === 'smudge' || activeTool === 'blur-brush' || activeTool === 'sharpen-brush'
        || activeTool === 'healing' || activeTool === 'spot-healing';
      if (!showCursorCircle) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear previous cursor
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const point = getImageCoords(e);
      const scale = zoom / 100;
      const scaledWidth = imageWidth * scale;
      const scaledHeight = imageHeight * scale;
      const offsetX = (containerWidth - scaledWidth) / 2 + panOffset.x;
      const offsetY = (containerHeight - scaledHeight) / 2 + panOffset.y;

      // Calculate screen position for cursor
      const screenX = point.x * scale + offsetX;
      const screenY = point.y * scale + offsetY;
      const cursorRadius = (brushSettings.size / 2) * scale;

      // Draw cursor circle
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(screenX, screenY, cursorRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.arc(screenX, screenY, cursorRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    },
    [editMode, isDrawing, activeTool, brushSettings.size, zoom, imageWidth, imageHeight, containerWidth, containerHeight, panOffset, getImageCoords]
  );

  // Clear cursor when leaving canvas
  const handleMouseLeave = useCallback(() => {
    if (canvasRef.current && !isDrawing) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  }, [isDrawing]);

  // Set cursor style
  const getCursor = () => {
    if (editMode !== 'drawing') return 'default';
    if (activeTool === 'eyedropper') return 'crosshair';
    if (activeTool === 'bucket') return 'crosshair';
    if (activeTool === 'gradient') return 'crosshair';
    if (activeTool === 'clone') return cloneSource ? 'crosshair' : 'copy';
    // Tools that show a circle cursor
    const circleTools: string[] = ['brush', 'eraser', 'pencil', 'dodge', 'burn', 'sponge', 'smudge', 'blur-brush', 'sharpen-brush', 'healing', 'spot-healing'];
    if (circleTools.includes(activeTool)) return 'none';
    return 'default';
  };

  // Draw clone stamp source indicator
  useEffect(() => {
    if (activeTool !== 'clone' || !cloneSource || isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = zoom / 100;
    const scaledWidth = imageWidth * scale;
    const scaledHeight = imageHeight * scale;
    const offsetX = (containerWidth - scaledWidth) / 2 + panOffset.x;
    const offsetY = (containerHeight - scaledHeight) / 2 + panOffset.y;

    const screenX = cloneSource.x * scale + offsetX;
    const screenY = cloneSource.y * scale + offsetY;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Draw crosshair at source point
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(screenX - 10, screenY);
    ctx.lineTo(screenX + 10, screenY);
    ctx.moveTo(screenX, screenY - 10);
    ctx.lineTo(screenX, screenY + 10);
    ctx.stroke();

    ctx.restore();
  }, [activeTool, cloneSource, isDrawing, zoom, imageWidth, imageHeight, containerWidth, containerHeight, panOffset]);

  if (editMode !== 'drawing') {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      width={containerWidth}
      height={containerHeight}
      className={cn('absolute inset-0', editMode === 'drawing' ? 'pointer-events-auto' : 'pointer-events-none', className)}
      style={{ cursor: getCursor() }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    />
  );
}

export default DrawingCanvas;
