/**
 * EditorCanvas - Main canvas component for image editing
 * Supports zoom, pan, and various editing modes
 */

import { memo, useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle, useMemo } from 'react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { useCachedAssetUrl } from '@/shared/hooks/useCachedAssetUrl';
import { Loader2, ImageIcon } from 'lucide-react';
import { CropOverlay } from './CropOverlay';
import { DrawingCanvas } from './DrawingCanvas';
import { SelectionOverlay } from './SelectionOverlay';
import { ShapeOverlay } from './ShapeOverlay';
import { TextOverlay } from './TextOverlay';
import { MaskCanvas } from './MaskCanvas';
import { WarpOverlay } from './WarpOverlay';
import { PathOverlay } from './PathOverlay';
import { applyAdjustmentsToCanvas, applyTransformsToCanvas, blendWithSelectionMask, maskStrokeCanvas, screenToImage, isCustomBlendMode, applyCustomBlendMode, createOffscreenCanvas, type AdjustmentValues, type TransformValues } from '@/features/image-editor/canvas/canvasEngine';
import { applyClippingMask } from '@/features/image-editor/canvas/layerEffects';
import { applyFilterToCanvas } from '@/features/image-editor/canvas/filters';
import { canvasToMask, invertSelection, featherSelection } from '@/features/image-editor/canvas/selectionEngine';
import { applyCmykPreview, generateGamutWarningOverlay } from '@/features/image-editor/canvas/colorProfile';
import { calculateHistogram, getCanvasImageData } from '@/features/image-editor/canvas/histogram';
import { calculateSnap } from '@/features/image-editor/canvas/snapEngine';

export interface EditorCanvasHandle {
  getCanvas: () => HTMLCanvasElement | null;
  getImageRef: () => HTMLImageElement | null;
  applyClientCrop: () => void;
}

export const EditorCanvas = memo(forwardRef<EditorCanvasHandle>(function EditorCanvas(_, ref) {
  const {
    sourceAsset,
    zoom,
    panOffset,
    setPanOffset,
    editMode,
    isProcessing,
    showGrid,
    showRulers,
    showGuides,
    gridSize,
    guides,
    addGuide,
    rotation,
    flipHorizontal,
    flipVertical,
    cropData,
    setCropData,
    setEditMode,
    pushHistory,
    registerCropApplyCallback,
    adjustments,
    activeFilterPreset,
    resetAdjustments,
    registerAdjustmentsApplyCallback,
    registerFilterApplyCallback,
    setRotation,
    setFlipHorizontal,
    setFlipVertical,
    registerTransformsApplyCallback,
    layers,
    activeLayerId,
    updateLayer,
    addLayer,
    setActiveLayer,
    history,
    historyIndex,
    isWarpMode,
    activeChannelId,
    channelVisibility,
    colorProofing,
    gamutWarning,
    setCanvasReady,
    isSpacePanning,
    setIsSpacePanning,
    navigationTool,
    duplicateLayer,
    activeSnapLines,
    canvasWidth: storeCanvasWidth,
    canvasHeight: storeCanvasHeight,
  } = useImageEditorStore();

  // Load selection mask as Uint8ClampedArray (with feather/invert applied)
  const loadSelectionMask = useCallback(async (
    width: number, height: number
  ): Promise<Uint8ClampedArray | null> => {
    const { selection, selectionFeather } = useImageEditorStore.getState();
    if (!selection?.maskDataUrl) return null;

    const img = await new Promise<HTMLImageElement>((resolve) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => resolve(i);
      i.src = selection.maskDataUrl;
    });

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!maskCtx) return null;
    maskCtx.drawImage(img, 0, 0, width, height);

    let mask = canvasToMask(maskCanvas);

    if (selection.isInverted) {
      mask = invertSelection(mask);
    }
    if (selectionFeather > 0) {
      mask = featherSelection(mask, width, height, selectionFeather);
    }

    return mask;
  }, []);

  // Canvas refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  // Image state
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [showLoader, setShowLoader] = useState(true); // Ensures loader is visible for minimum time
  const imageRef = useRef<HTMLImageElement | null>(null);
  const loadStartTimeRef = useRef<number>(0);

  // Container dimensions for overlay components
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });

  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });

  // Spacebar panning state (Photoshop-style: hold space to temporarily pan)
  const isSpaceHeldRef = useRef(false);

  // Shift key tracking for snap disable (like isSpaceHeldRef pattern)
  const isShiftHeldRef = useRef(false);

  // Move layer drag state (refs to avoid stale closures in window listeners)
  const isMovingLayerRef = useRef(false);
  const moveLayerIdRef = useRef<string | null>(null);
  const moveOffsetRef = useRef({ x: 0, y: 0 });

  // Debounced history push for keyboard nudge
  const nudgeHistoryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Layer image cache to avoid re-parsing base64 every render
  const layerImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Clean up stale cache entries when layers change
  useEffect(() => {
    const currentImageDatas = new Set(layers.map(l => l.imageData).filter(Boolean));
    const cache = layerImageCacheRef.current;
    for (const key of cache.keys()) {
      if (!currentImageDatas.has(key)) {
        cache.delete(key);
      }
    }
  }, [layers]);

  // Drag-and-drop state for importing images as layers
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    const { addLayer } = useImageEditorStore.getState();
    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        addLayer(dataUrl, file.name.replace(/\.[^.]+$/, ''));
      };
      reader.readAsDataURL(file);
    });
  }, []);

  // Ruler drag state for creating guides
  const [rulerDrag, setRulerDrag] = useState<{ orientation: 'horizontal' | 'vertical'; active: boolean; position: number } | null>(null);

  // Apply client-side crop (layer-based if active layer exists)
  const applyClientCrop = useCallback(async () => {
    if (!cropData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Layer-based crop: crop all layers and resize canvas
    if (layers.length > 0) {
      const cropX = Math.round(cropData.x);
      const cropY = Math.round(cropData.y);
      const cropW = Math.round(cropData.width);
      const cropH = Math.round(cropData.height);

      // Crop each layer's imageData to the crop region
      for (const layer of layers) {
        if (!layer.imageData) continue;
        const lx = layer.x ?? 0;
        const ly = layer.y ?? 0;
        const img = await new Promise<HTMLImageElement>((resolve) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => resolve(i);
          i.src = layer.imageData;
        });

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = cropW;
        tempCanvas.height = cropH;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) continue;

        // Draw the layer offset by the crop origin
        tempCtx.drawImage(img, lx - cropX, ly - cropY);

        updateLayer(layer.id, {
          imageData: tempCanvas.toDataURL(),
          x: 0,
          y: 0,
          width: cropW,
          height: cropH,
        });
      }

      // Resize main canvas
      canvas.width = cropW;
      canvas.height = cropH;

      // Resize overlay canvas
      if (overlayCanvasRef.current) {
        overlayCanvasRef.current.width = cropW;
        overlayCanvasRef.current.height = cropH;
      }

      // Update dimensions
      setImageDimensions({ width: cropW, height: cropH });
      useImageEditorStore.setState({ canvasWidth: cropW, canvasHeight: cropH });

      // Push to history
      pushHistory('Crop', canvas.toDataURL());

      // Reset crop state
      setCropData(null);
      setEditMode('none');
      return;
    }

    // Legacy no-layer mode: apply to whole canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = Math.round(cropData.width);
    tempCanvas.height = Math.round(cropData.height);
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    // Draw cropped portion to temp canvas
    tempCtx.drawImage(
      canvas,
      Math.round(cropData.x),
      Math.round(cropData.y),
      Math.round(cropData.width),
      Math.round(cropData.height),
      0,
      0,
      Math.round(cropData.width),
      Math.round(cropData.height)
    );

    // Resize main canvas and draw cropped result
    canvas.width = Math.round(cropData.width);
    canvas.height = Math.round(cropData.height);
    ctx.drawImage(tempCanvas, 0, 0);

    // Update overlay canvas size
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width = Math.round(cropData.width);
      overlayCanvasRef.current.height = Math.round(cropData.height);
    }

    // Update dimensions state
    const newW = Math.round(cropData.width);
    const newH = Math.round(cropData.height);
    setImageDimensions({ width: newW, height: newH });
    useImageEditorStore.setState({ canvasWidth: newW, canvasHeight: newH });

    // Push to history
    pushHistory('Crop', canvas.toDataURL());

    // Reset crop state
    setCropData(null);
    setEditMode('none');
  }, [cropData, setCropData, setEditMode, pushHistory, layers, updateLayer]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
    getImageRef: () => imageRef.current,
    applyClientCrop,
  }), [applyClientCrop]);

  // Register crop apply callback with store
  useEffect(() => {
    registerCropApplyCallback(applyClientCrop);
    return () => {
      registerCropApplyCallback(null);
    };
  }, [applyClientCrop, registerCropApplyCallback]);

  // Apply adjustments to canvas (layer-based if active layer exists)
  const applyAdjustmentsHandler = useCallback(async () => {
    if (!canvasRef.current) return;
    const historyLabel = activeFilterPreset !== 'none' ? 'Filter' : 'Adjustments';

    // Resolve a raster target layer: prefer active layer, otherwise auto-select
    // the first raster layer (one with imageData).
    let targetLayerId = activeLayerId;
    let targetLayer = targetLayerId ? layers.find(l => l.id === targetLayerId) : null;
    if (!targetLayer || !targetLayer.imageData) {
      const firstRaster = layers.find(l => !!l.imageData);
      if (firstRaster) {
        targetLayerId = firstRaster.id;
        targetLayer = firstRaster;
        setActiveLayer(firstRaster.id);
      }
    }

    // If there's a resolved target layer, apply adjustments to that layer only
    if (targetLayerId && targetLayer && targetLayer.imageData) {
      {
        const activeLayer = targetLayer;
        // Load the layer's image into a temp canvas at its own dimensions
        const img = await new Promise<HTMLImageElement>((resolve) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => resolve(i);
          i.src = activeLayer.imageData;
        });

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.naturalWidth || canvasRef.current.width;
        tempCanvas.height = img.naturalHeight || canvasRef.current.height;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) return;

        tempCtx.drawImage(img, 0, 0);

        // Apply adjustments to the layer's canvas only
        let result = applyAdjustmentsToCanvas(tempCanvas, adjustments as AdjustmentValues);

        // If there's an active selection, blend adjusted with original using mask
        const selMask = await loadSelectionMask(tempCanvas.width, tempCanvas.height);
        if (selMask) {
          result = blendWithSelectionMask(tempCanvas, result, selMask);
        }

        // Update layer's imageData
        updateLayer(targetLayerId, { imageData: result.toDataURL() });

        // Defer history push until after updateLayer has composited via renderAllLayers
        requestAnimationFrame(() => {
          if (canvasRef.current) {
            pushHistory(historyLabel, canvasRef.current.toDataURL());
          }
        });
        resetAdjustments();
        return;
      }
    }

    // No raster layer available: silently no-op when layers exist
    if (layers.length > 0) {
      resetAdjustments();
      return;
    }

    // Legacy no-layer mode: apply to whole canvas
    const result = applyAdjustmentsToCanvas(
      canvasRef.current,
      adjustments as AdjustmentValues
    );

    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.drawImage(result, 0, 0);
    }

    pushHistory(historyLabel, canvasRef.current.toDataURL());
    resetAdjustments();
  }, [adjustments, activeFilterPreset, pushHistory, resetAdjustments, activeLayerId, layers, updateLayer, setActiveLayer, loadSelectionMask]);

  // Register adjustments apply callback with store
  useEffect(() => {
    registerAdjustmentsApplyCallback(applyAdjustmentsHandler);
    return () => {
      registerAdjustmentsApplyCallback(null);
    };
  }, [applyAdjustmentsHandler, registerAdjustmentsApplyCallback]);

  // Apply filter to canvas (layer-based if active layer exists)
  const applyFilterHandler = useCallback(async (filterFn: (imageData: ImageData) => ImageData, label: string) => {
    if (!canvasRef.current) return;

    // Resolve a raster target layer: prefer active layer, otherwise auto-select
    // the first raster layer (one with imageData).
    let targetLayerId = activeLayerId;
    let targetLayer = targetLayerId ? layers.find(l => l.id === targetLayerId) : null;
    if (!targetLayer || !targetLayer.imageData) {
      const firstRaster = layers.find(l => !!l.imageData);
      if (firstRaster) {
        targetLayerId = firstRaster.id;
        targetLayer = firstRaster;
        setActiveLayer(firstRaster.id);
      }
    }

    // No raster layer exists: create a blank transparent raster layer sized to the
    // canvas so that generator/render filters (Clouds, Fibers, Flame, Tree, etc.)
    // have a surface to write onto. This also lets any other filter run on a
    // fresh layer instead of silently no-oping.
    if (!targetLayer || !targetLayer.imageData) {
      const { canvasWidth, canvasHeight } = useImageEditorStore.getState();
      const w = canvasWidth || canvasRef.current.width;
      const h = canvasHeight || canvasRef.current.height;
      if (w > 0 && h > 0) {
        const blank = document.createElement('canvas');
        blank.width = w;
        blank.height = h;
        // Transparent by default; that's fine — render filters overwrite pixels.
        const newId = addLayer(blank.toDataURL(), label);
        targetLayerId = newId;
        targetLayer = { id: newId, imageData: blank.toDataURL() } as typeof targetLayer;
        setActiveLayer(newId);
      }
    }

    if (targetLayerId && targetLayer && targetLayer.imageData) {
      {
        const activeLayer = targetLayer;
        const img = await new Promise<HTMLImageElement>((resolve) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => resolve(i);
          i.src = activeLayer.imageData;
        });

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.naturalWidth || canvasRef.current.width;
        tempCanvas.height = img.naturalHeight || canvasRef.current.height;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) return;

        tempCtx.drawImage(img, 0, 0);

        // Apply filter to the layer's canvas
        let result = applyFilterToCanvas(tempCanvas, filterFn);

        // If there's an active selection, blend filtered with original using mask
        const selMask = await loadSelectionMask(tempCanvas.width, tempCanvas.height);
        if (selMask) {
          result = blendWithSelectionMask(tempCanvas, result, selMask);
        }

        updateLayer(targetLayerId, { imageData: result.toDataURL() });
        requestAnimationFrame(() => {
          if (canvasRef.current) {
            pushHistory(label, canvasRef.current.toDataURL());
          }
        });
        return;
      }
    }

    // No raster layer available: silently no-op when layers exist
    if (layers.length > 0) return;

    // Legacy no-layer mode: apply to whole canvas
    const result = applyFilterToCanvas(canvasRef.current, filterFn);
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.drawImage(result, 0, 0);
    }

    pushHistory(label, canvasRef.current.toDataURL());
  }, [pushHistory, activeLayerId, layers, updateLayer, setActiveLayer, addLayer, loadSelectionMask]);

  // Register filter apply callback with store
  useEffect(() => {
    registerFilterApplyCallback(applyFilterHandler);
    return () => {
      registerFilterApplyCallback(null);
    };
  }, [applyFilterHandler, registerFilterApplyCallback]);

  // Apply transforms to canvas (bake rotation/flip into pixels) - layer-based if active layer exists
  const applyTransformsHandler = useCallback(async () => {
    if (!canvasRef.current) return;

    const transforms: TransformValues = {
      rotation,
      flipHorizontal,
      flipVertical,
    };

    // Only apply if there are actual transforms
    if (rotation === 0 && !flipHorizontal && !flipVertical) return;

    // If there's an active layer, apply transforms to that layer only
    if (activeLayerId) {
      const activeLayer = layers.find(l => l.id === activeLayerId);
      if (activeLayer && activeLayer.imageData) {
        // Load the layer's image at its own dimensions
        const img = await new Promise<HTMLImageElement>((resolve) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => resolve(i);
          i.src = activeLayer.imageData;
        });

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.naturalWidth || canvasRef.current.width;
        tempCanvas.height = img.naturalHeight || canvasRef.current.height;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) return;

        tempCtx.drawImage(img, 0, 0);

        // Apply transforms to the layer's canvas only
        const result = applyTransformsToCanvas(tempCanvas, transforms);

        // Update layer's imageData and dimensions
        updateLayer(activeLayerId, {
          imageData: result.toDataURL(),
          width: result.width,
          height: result.height,
        });

        // Push to history
        pushHistory('Transform', canvasRef.current.toDataURL());

        // Reset transforms without marking dirty
        setRotation(0, false);
        setFlipHorizontal(false);
        setFlipVertical(false);
        return;
      }
    }

    // No active layer: skip if layers exist (edits must target a layer)
    if (layers.length > 0) {
      setRotation(0, false);
      setFlipHorizontal(false);
      setFlipVertical(false);
      return;
    }

    // Legacy no-layer mode: apply to whole canvas
    const result = applyTransformsToCanvas(canvasRef.current, transforms);

    canvasRef.current.width = result.width;
    canvasRef.current.height = result.height;

    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.drawImage(result, 0, 0);
    }

    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width = result.width;
      overlayCanvasRef.current.height = result.height;
    }

    setImageDimensions({ width: result.width, height: result.height });
    pushHistory('Transform', canvasRef.current.toDataURL());
    setRotation(0, false);
    setFlipHorizontal(false);
    setFlipVertical(false);
  }, [rotation, flipHorizontal, flipVertical, pushHistory, setRotation, setFlipHorizontal, setFlipVertical, activeLayerId, layers, updateLayer]);

  // Register transforms apply callback with store
  useEffect(() => {
    registerTransformsApplyCallback(applyTransformsHandler);
    return () => {
      registerTransformsApplyCallback(null);
    };
  }, [applyTransformsHandler, registerTransformsApplyCallback]);

  // Get cached image URL
  const { url: cachedImageUrl } = useCachedAssetUrl(sourceAsset, {
    type: 'preview',
    enabled: !!sourceAsset,
  });

  // Use only cachedImageUrl to prevent double-load when URLs differ
  const imageUrl = cachedImageUrl;

  // Debounced histogram updater (300ms debounce)
  const histogramTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateHistogram = useCallback(() => {
    if (histogramTimerRef.current) clearTimeout(histogramTimerRef.current);
    histogramTimerRef.current = setTimeout(() => {
      if (!canvasRef.current) return;
      const imageData = getCanvasImageData(canvasRef.current);
      if (imageData) {
        const histogram = calculateHistogram(imageData);
        useImageEditorStore.getState().setHistogramData(histogram);
      }
    }, 300);
  }, []);

  // Minimum loader display time (ms)
  const MIN_LOADER_TIME = 300;

  // Load image and setup canvas
  useEffect(() => {
    if (!imageUrl) return;

    loadStartTimeRef.current = Date.now();
    setIsImageLoading(true);
    setShowLoader(true);
    setCanvasReady(false);

    const img = new Image();
    img.crossOrigin = 'anonymous';

    const hideLoaderWithDelay = () => {
      const elapsed = Date.now() - loadStartTimeRef.current;
      const remainingTime = Math.max(0, MIN_LOADER_TIME - elapsed);

      setTimeout(() => {
        setIsImageLoading(false);
        setShowLoader(false);
      }, remainingTime);
    };

    img.onload = () => {
      imageRef.current = img;
      setImageDimensions({ width: img.width, height: img.height });

      // Sync canvas dimensions to store (for layer merging / flatten)
      const { canvasWidth, canvasHeight } = useImageEditorStore.getState();
      if (canvasWidth === 0 || canvasHeight === 0) {
        useImageEditorStore.setState({ canvasWidth: img.width, canvasHeight: img.height });
      }

      // Setup main canvas
      if (canvasRef.current) {
        canvasRef.current.width = img.width;
        canvasRef.current.height = img.height;
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
        }

        // Create Background layer with the image data (Photoshop-style)
        // Only create if no layers exist yet
        const { layers: currentLayers } = useImageEditorStore.getState();
        if (currentLayers.length === 0) {
          const imageData = canvasRef.current.toDataURL();
          const layerId = addLayer(imageData, 'Background');
          updateLayer(layerId, { width: img.width, height: img.height });
          setActiveLayer(layerId);
          // Push initial state so undo works from the start (don't mark dirty)
          const canvas = canvasRef.current;
          requestAnimationFrame(() => {
            if (canvas) {
              const { pushHistory: ph } = useImageEditorStore.getState();
              ph('Open', canvas.toDataURL(), false);
            }
          });
        }
      }

      // Setup overlay canvas
      if (overlayCanvasRef.current) {
        overlayCanvasRef.current.width = img.width;
        overlayCanvasRef.current.height = img.height;
      }

      // Initial histogram calculation
      updateHistogram();

      hideLoaderWithDelay();
      setCanvasReady(true);
    };

    img.onerror = () => {
      hideLoaderWithDelay();
      setCanvasReady(true);
      console.error('Failed to load image:', imageUrl);
    };

    img.src = imageUrl;
  }, [imageUrl, updateHistogram, addLayer, setActiveLayer, setCanvasReady, updateLayer]);

  // Sync DOM canvas + overlay + local imageDimensions whenever the store's
  // canvasWidth/canvasHeight change (e.g. Image Size / Canvas Size modals).
  useEffect(() => {
    if (storeCanvasWidth <= 0 || storeCanvasHeight <= 0) return;
    if (imageDimensions.width === storeCanvasWidth && imageDimensions.height === storeCanvasHeight) return;

    if (canvasRef.current) {
      canvasRef.current.width = storeCanvasWidth;
      canvasRef.current.height = storeCanvasHeight;
    }
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width = storeCanvasWidth;
      overlayCanvasRef.current.height = storeCanvasHeight;
    }
    setImageDimensions({ width: storeCanvasWidth, height: storeCanvasHeight });
  }, [storeCanvasWidth, storeCanvasHeight, imageDimensions.width, imageDimensions.height]);

  // Track container dimensions for overlay components
  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        setContainerDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  // Build CSS filter string for active layer preview
  const activeLayerFilterString = useMemo(() => {
    const filters: string[] = [];
    if (adjustments.brightness !== 0 || adjustments.exposure !== 0) {
      filters.push(`brightness(${1 + (adjustments.brightness + adjustments.exposure) / 100})`);
    }
    if (adjustments.contrast !== 0) {
      filters.push(`contrast(${1 + adjustments.contrast / 100})`);
    }
    if (adjustments.saturation !== 0) {
      filters.push(`saturate(${1 + adjustments.saturation / 100})`);
    }
    if (adjustments.hue !== 0) {
      filters.push(`hue-rotate(${adjustments.hue}deg)`);
    }
    return filters.length > 0 ? filters.join(' ') : 'none';
  }, [adjustments.brightness, adjustments.exposure, adjustments.contrast, adjustments.saturation, adjustments.hue]);

  // Re-render all layers to canvas (Photoshop-style compositing)
  const renderAllLayers = useCallback(async () => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // If no layers, clear canvas
    if (layers.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    // Load all layer images FIRST (before clearing to prevent blink)
    const images = await Promise.all(
      layers.map(layer => {
        if (!layer.imageData) return Promise.resolve(null);

        // Reuse cached image if available
        const cached = layerImageCacheRef.current.get(layer.imageData);
        if (cached) return Promise.resolve(cached);

        return new Promise<HTMLImageElement | null>((resolve) => {
          const img = new Image();
          img.onload = () => {
            layerImageCacheRef.current.set(layer.imageData, img);
            resolve(img);
          };
          img.onerror = () => resolve(null);
          img.src = layer.imageData;
        });
      })
    );

    // NOW clear and draw all at once (no blink)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // NOTE: We do NOT draw the original imageRef here anymore.
    // The Background layer (created on image load) already contains the image data.
    // This is the proper Photoshop-style behavior where all content is in layers.

    // Draw each visible layer from bottom to top
    // Apply filter preview ONLY to the active layer
    // Supports Photoshop-style clipping mask groups

    // Helper: render a single layer to a temp canvas
    const renderLayerToCanvas = (layer: typeof layers[0], index: number): HTMLCanvasElement | null => {
      if (layer.type === 'adjustment' && layer.adjustmentValues) {
        // Adjustment layers modify what's below them - handled separately
        return null;
      }
      const img = images[index];
      if (!img) return null;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return null;

      // Apply CSS filter preview only to the active layer
      if (layer.id === activeLayerId && activeLayerFilterString !== 'none') {
        tempCtx.filter = activeLayerFilterString;
      }
      tempCtx.drawImage(img, layer.x, layer.y);
      if (layer.id === activeLayerId && activeLayerFilterString !== 'none') {
        tempCtx.filter = 'none';
      }
      return tempCanvas;
    };

    // Pre-scan: identify clipping groups (base + consecutive clippingMask=true layers)
    // A clipping group starts with a non-clipping layer (base) followed by one or more clippingMask layers
    let i = 0;
    while (i < layers.length) {
      const layer = layers[i];

      if (!layer.visible) {
        i++;
        continue;
      }

      // Adjustment layers: apply their adjustments to the composited canvas so far
      // Supports opacity, blendMode, and mask for non-destructive editing
      if (layer.type === 'adjustment' && layer.adjustmentValues) {
        // Capture "before" state
        const beforeImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const beforeCanvas = document.createElement('canvas');
        beforeCanvas.width = canvas.width;
        beforeCanvas.height = canvas.height;
        const beforeCtx = beforeCanvas.getContext('2d');
        if (beforeCtx) {
          beforeCtx.putImageData(beforeImageData, 0, 0);

          // Create "after" state with adjustments applied
          const afterCanvas = applyAdjustmentsToCanvas(beforeCanvas, {
            exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0,
            gamma: 1, temperature: 0, tint: 0, saturation: 0, vibrance: 0, hue: 0,
            clarity: 0, levels: null, curves: null,
            ...layer.adjustmentValues,
          } as AdjustmentValues);

          const adjOpacity = layer.opacity / 100;
          const hasMask = layer.mask?.enabled && layer.mask?.data;
          const needsBlend = adjOpacity < 1 || layer.blendMode !== 'normal' || hasMask;

          if (!needsBlend) {
            // Full opacity, normal blend, no mask → direct replace
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(afterCanvas, 0, 0);
          } else {
            // Non-destructive blend: mix before/after per pixel based on opacity, blend mode, and mask
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Start with "before" as base
            ctx.drawImage(beforeCanvas, 0, 0);

            // Create a diff canvas: shows only the adjustment effect (after - before via blend)
            // We achieve this by drawing "after" on top with the adjustment layer's blend mode and opacity
            // For normal blend: this interpolates between before and after based on opacity
            if (hasMask) {
              // With mask: create masked adjustment effect
              const maskCanvas = document.createElement('canvas');
              maskCanvas.width = canvas.width;
              maskCanvas.height = canvas.height;
              const maskCtx = maskCanvas.getContext('2d');
              if (maskCtx) {
                // Draw the adjusted result
                maskCtx.drawImage(afterCanvas, 0, 0);
                // Apply mask: use destination-in to keep only masked areas
                const maskImg = await new Promise<HTMLImageElement>((resolve) => {
                  const mi = new Image();
                  mi.onload = () => resolve(mi);
                  mi.onerror = () => resolve(mi);
                  mi.src = layer.mask!.data;
                });
                maskCtx.globalCompositeOperation = 'destination-in';
                maskCtx.drawImage(maskImg, 0, 0);
                maskCtx.globalCompositeOperation = 'source-over';

                // Also need unmasked "before" for areas outside the mask
                // Draw before canvas, then overlay masked adjusted areas
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(beforeCanvas, 0, 0);

                // Blend masked adjustment on top
                if (isCustomBlendMode(layer.blendMode)) {
                  const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                  const { canvas: curCanvas, ctx: curCtx } = createOffscreenCanvas(canvas.width, canvas.height);
                  curCtx.putImageData(currentData, 0, 0);
                  const blended = applyCustomBlendMode(curCanvas, maskCanvas, layer.blendMode, adjOpacity * 100);
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(blended, 0, 0);
                } else {
                  ctx.globalAlpha = adjOpacity;
                  ctx.globalCompositeOperation = layer.blendMode === 'normal' ? 'source-over' : layer.blendMode as GlobalCompositeOperation;
                  ctx.drawImage(maskCanvas, 0, 0);
                  ctx.globalAlpha = 1;
                }
                ctx.globalCompositeOperation = 'source-over';
              }
            } else {
              // No mask: blend after on top of before with opacity and blend mode
              // For normal blend mode, we need to show the difference only
              // Clear and redraw: before as base, then overlay the "effect difference"
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(beforeCanvas, 0, 0);

              // Create effect-only canvas (difference between after and before)
              const effectCanvas = document.createElement('canvas');
              effectCanvas.width = canvas.width;
              effectCanvas.height = canvas.height;
              const effectCtx = effectCanvas.getContext('2d');
              if (effectCtx) {
                // For normal blend: pixel-level interpolation between before and after
                const beforeData = beforeCtx.getImageData(0, 0, canvas.width, canvas.height);
                const afterCtx2 = afterCanvas.getContext('2d');
                if (afterCtx2) {
                  const afterData = afterCtx2.getImageData(0, 0, canvas.width, canvas.height);
                  const resultData = effectCtx.createImageData(canvas.width, canvas.height);

                  for (let p = 0; p < beforeData.data.length; p += 4) {
                    // Interpolate between before and after based on opacity
                    resultData.data[p] = beforeData.data[p] + (afterData.data[p] - beforeData.data[p]) * adjOpacity;
                    resultData.data[p + 1] = beforeData.data[p + 1] + (afterData.data[p + 1] - beforeData.data[p + 1]) * adjOpacity;
                    resultData.data[p + 2] = beforeData.data[p + 2] + (afterData.data[p + 2] - beforeData.data[p + 2]) * adjOpacity;
                    resultData.data[p + 3] = afterData.data[p + 3]; // preserve alpha
                  }

                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  ctx.putImageData(resultData, 0, 0);
                }
              }
            }
          }
        }
        i++;
        continue;
      }

      // Check if next layers form a clipping group with this layer as base
      const clippingLayers: { layer: typeof layers[0]; index: number }[] = [];
      let j = i + 1;
      while (j < layers.length && layers[j].clippingMask) {
        if (layers[j].visible) {
          clippingLayers.push({ layer: layers[j], index: j });
        }
        j++;
      }

      if (clippingLayers.length > 0) {
        // This is a clipping group: base layer + clipping layers
        const baseCanvas = renderLayerToCanvas(layer, i);
        if (baseCanvas) {
          // Apply each clipping layer using source-atop compositing
          let groupCanvas = baseCanvas;
          for (const clip of clippingLayers) {
            const clipLayerCanvas = renderLayerToCanvas(clip.layer, clip.index);
            if (clipLayerCanvas) {
              // Apply opacity to clipping layer before clipping
              if (clip.layer.opacity < 100) {
                const opacityCanvas = document.createElement('canvas');
                opacityCanvas.width = canvas.width;
                opacityCanvas.height = canvas.height;
                const opacityCtx = opacityCanvas.getContext('2d');
                if (opacityCtx) {
                  opacityCtx.globalAlpha = clip.layer.opacity / 100;
                  opacityCtx.drawImage(clipLayerCanvas, 0, 0);
                  groupCanvas = applyClippingMask(opacityCanvas, groupCanvas);
                }
              } else {
                groupCanvas = applyClippingMask(clipLayerCanvas, groupCanvas);
              }
            }
          }

          // Draw the composited clipping group to main canvas with base layer's blend mode & opacity
          if (isCustomBlendMode(layer.blendMode)) {
            const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const { canvas: currentCanvas, ctx: currentCtx } = createOffscreenCanvas(canvas.width, canvas.height);
            currentCtx.putImageData(currentData, 0, 0);
            const blended = applyCustomBlendMode(currentCanvas, groupCanvas, layer.blendMode, layer.opacity);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(blended, 0, 0);
          } else {
            ctx.globalAlpha = layer.opacity / 100;
            ctx.globalCompositeOperation = layer.blendMode === 'normal' ? 'source-over' : layer.blendMode as GlobalCompositeOperation;
            ctx.drawImage(groupCanvas, 0, 0);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
          }
        }
        i = j; // Skip past the clipping group
      } else {
        // Regular layer (no clipping group)
        const img = images[i];
        if (img) {
          if (isCustomBlendMode(layer.blendMode)) {
            // Render layer to temp canvas first
            const { canvas: layerTmp, ctx: layerTmpCtx } = createOffscreenCanvas(canvas.width, canvas.height);
            if (layer.id === activeLayerId && activeLayerFilterString !== 'none') {
              layerTmpCtx.filter = activeLayerFilterString;
            }
            layerTmpCtx.drawImage(img, layer.x, layer.y);
            layerTmpCtx.filter = 'none';

            const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const { canvas: currentCanvas, ctx: currentCtx } = createOffscreenCanvas(canvas.width, canvas.height);
            currentCtx.putImageData(currentData, 0, 0);
            const blended = applyCustomBlendMode(currentCanvas, layerTmp, layer.blendMode, layer.opacity);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(blended, 0, 0);
          } else {
            ctx.globalAlpha = layer.opacity / 100;
            ctx.globalCompositeOperation = layer.blendMode === 'normal' ? 'source-over' : layer.blendMode as GlobalCompositeOperation;

            if (layer.id === activeLayerId && activeLayerFilterString !== 'none') {
              ctx.filter = activeLayerFilterString;
            }

            ctx.drawImage(img, layer.x, layer.y);

            if (layer.id === activeLayerId && activeLayerFilterString !== 'none') {
              ctx.filter = 'none';
            }

            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
          }
        }
        i++;
      }
    }

    // Apply channel visibility filtering (Photoshop-style channel view)
    // This is non-destructive: renderAllLayers always composites from source layer data,
    // so channel filtering only affects the display, not the stored pixel data.
    const showSingleChannel = activeChannelId !== 'rgb' && (activeChannelId === 'red' || activeChannelId === 'green' || activeChannelId === 'blue');
    const redVisible = channelVisibility.red;
    const greenVisible = channelVisibility.green;
    const blueVisible = channelVisibility.blue;
    const allVisible = redVisible && greenVisible && blueVisible;

    if (showSingleChannel) {
      // Single channel view: display one channel as grayscale (Photoshop behavior)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const channelOffset = activeChannelId === 'red' ? 0 : activeChannelId === 'green' ? 1 : 2;
      for (let i = 0; i < data.length; i += 4) {
        const val = data[i + channelOffset];
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
      }
      ctx.putImageData(imageData, 0, 0);
    } else if (!allVisible) {
      // Composite view with some channels hidden: zero out hidden channels
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        if (!redVisible) data[i] = 0;
        if (!greenVisible) data[i + 1] = 0;
        if (!blueVisible) data[i + 2] = 0;
      }
      ctx.putImageData(imageData, 0, 0);
    }
    // When allVisible && activeChannelId === 'rgb': no filtering needed, show full color

    // CMYK proof colors: round-trip RGB→CMYK→RGB to simulate gamut loss
    if (colorProofing) {
      const proofData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      applyCmykPreview(proofData);
      ctx.putImageData(proofData, 0, 0);
    }

    // Gamut warning overlay: highlight out-of-gamut pixels
    if (gamutWarning) {
      const srcData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const overlay = generateGamutWarningOverlay(srcData);
      // Draw overlay on top using a temp canvas
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = canvas.width;
      tmpCanvas.height = canvas.height;
      const tmpCtx = tmpCanvas.getContext('2d');
      if (tmpCtx) {
        tmpCtx.putImageData(overlay, 0, 0);
        ctx.drawImage(tmpCanvas, 0, 0);
      }
    }
  }, [layers, activeLayerId, activeLayerFilterString, activeChannelId, channelVisibility, colorProofing, gamutWarning]);

  // Re-render when layers change, then update histogram
  useEffect(() => {
    renderAllLayers().then(() => {
      updateHistogram();
    });
  }, [renderAllLayers, updateHistogram]);

  // Restore canvas when historyIndex changes (undo/redo/jump)
  // For layer-based mode, layer restoration in store triggers renderAllLayers above.
  // For non-layer fallback, we draw the saved imageData directly.
  const prevHistoryIndexRef = useRef(historyIndex);
  useEffect(() => {
    if (prevHistoryIndexRef.current === historyIndex) return;
    prevHistoryIndexRef.current = historyIndex;

    if (historyIndex < 0 || !history[historyIndex]) return;

    const targetState = history[historyIndex];

    // If layers were restored by the store (undo/redo already sets layers),
    // renderAllLayers will handle the canvas update.
    // For the non-layer fallback, draw imageData directly.
    if (!targetState.layers || targetState.layers.length === 0) {
      if (!canvasRef.current || !targetState.imageData) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        setImageDimensions({ width: img.width, height: img.height });
        updateHistogram();
      };
      img.src = targetState.imageData;
    }
  }, [historyIndex, history, updateHistogram]);

  // Helper to merge stroke with layer asynchronously
  const mergeStrokeWithLayer = useCallback(async (
    strokeCanvas: HTMLCanvasElement,
    layer: typeof layers[0],
    historyLabel: string
  ): Promise<void> => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // IMMEDIATELY draw to main canvas for visual feedback (prevents blink)
    const { brushSettings, activeTool } = useImageEditorStore.getState();
    const isEraser = activeTool === 'eraser' || activeTool === 'background-eraser' || activeTool === 'magic-eraser';
    if (isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
    }
    ctx.globalAlpha = isEraser && activeTool !== 'eraser' ? 1 : brushSettings.opacity / 100;
    ctx.drawImage(strokeCanvas, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Create a new canvas to merge the stroke with the layer
    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = canvas.width;
    layerCanvas.height = canvas.height;
    const layerCtx = layerCanvas.getContext('2d');
    if (!layerCtx) return;

    if (layer.imageData) {
      // Load existing layer image
      const img = await new Promise<HTMLImageElement>((resolve) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => resolve(i);
        i.src = layer.imageData;
      });
      layerCtx.drawImage(img, layer.x, layer.y);
    }

    // Mask the stroke to selection if active
    const selMask = await loadSelectionMask(canvas.width, canvas.height);
    const maskedStroke = selMask ? maskStrokeCanvas(strokeCanvas, selMask) : strokeCanvas;

    // Draw the new stroke on top with brush opacity (eraser uses destination-out)
    if (isEraser) {
      layerCtx.globalCompositeOperation = 'destination-out';
    }
    layerCtx.globalAlpha = isEraser && activeTool !== 'eraser' ? 1 : brushSettings.opacity / 100;
    layerCtx.drawImage(maskedStroke, 0, 0);
    layerCtx.globalAlpha = 1;
    layerCtx.globalCompositeOperation = 'source-over';

    // Update the layer's imageData
    const newImageData = layerCanvas.toDataURL();
    updateLayer(layer.id, {
      imageData: newImageData,
      width: layerCanvas.width,
      height: layerCanvas.height,
    });

    // Push to history
    pushHistory(historyLabel, canvas.toDataURL());
  }, [updateLayer, pushHistory, loadSelectionMask]);

  // Commit drawing stroke to active layer or main canvas
  const commitStroke = useCallback((strokeCanvas: HTMLCanvasElement) => {
    if (!canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // If there's an active layer, update that layer's imageData
    if (activeLayerId) {
      const activeLayer = layers.find(l => l.id === activeLayerId);
      if (activeLayer) {
        mergeStrokeWithLayer(strokeCanvas, activeLayer, 'Brush Stroke');
        return;
      }
    }

    // No active layer: skip if layers exist (edits must target a layer)
    if (layers.length > 0) return;

    // Legacy no-layer mode: draw directly to main canvas
    const { brushSettings, activeTool } = useImageEditorStore.getState();
    const isEraser = activeTool === 'eraser' || activeTool === 'background-eraser' || activeTool === 'magic-eraser';
    if (isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
    }
    ctx.globalAlpha = isEraser && activeTool !== 'eraser' ? 1 : brushSettings.opacity / 100;
    ctx.drawImage(strokeCanvas, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    pushHistory('Brush Stroke', canvasRef.current.toDataURL());
  }, [pushHistory, activeLayerId, layers, mergeStrokeWithLayer]);

  // Commit shape to active layer or main canvas
  const commitShape = useCallback((shapeCanvas: HTMLCanvasElement) => {
    if (!canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // If there's an active layer, update that layer's imageData
    if (activeLayerId) {
      const activeLayer = layers.find(l => l.id === activeLayerId);
      if (activeLayer) {
        mergeStrokeWithLayer(shapeCanvas, activeLayer, 'Shape');
        return;
      }
    }

    // No active layer: skip if layers exist (edits must target a layer)
    if (layers.length > 0) return;

    // Legacy no-layer mode: draw directly to main canvas
    ctx.drawImage(shapeCanvas, 0, 0);
    pushHistory('Shape', canvasRef.current.toDataURL());
  }, [pushHistory, activeLayerId, layers, mergeStrokeWithLayer]);

  // Commit text to a new layer
  const commitText = useCallback((textCanvas: HTMLCanvasElement, x: number, y: number) => {
    if (!canvasRef.current) return;

    const layerId = addLayer(textCanvas.toDataURL(), 'Text');
    if (layerId) {
      updateLayer(layerId, {
        x,
        y,
        width: textCanvas.width,
        height: textCanvas.height,
      });
    }
    pushHistory('Text', canvasRef.current.toDataURL());
  }, [addLayer, updateLayer, pushHistory]);

  // Update layer mask
  const updateMask = useCallback((maskDataUrl: string) => {
    const { layers, activeLayerId, updateLayer } = useImageEditorStore.getState();
    if (!activeLayerId) return;
    const activeLayer = layers.find(l => l.id === activeLayerId);
    if (activeLayer?.mask) {
      updateLayer(activeLayerId, {
        mask: {
          ...activeLayer.mask,
          data: maskDataUrl,
        },
      });
    }
  }, []);

  // Draw grid and guides overlay
  useEffect(() => {
    if (!overlayCanvasRef.current) return;

    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!showGrid && !showGuides && activeSnapLines.length === 0) return;

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;

      for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      for (let y = 0; y <= canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }

    // Draw guides
    if (showGuides) {
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      for (const y of guides.horizontal) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      for (const x of guides.vertical) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      ctx.setLineDash([]);
    }

    // Draw active snap lines (cyan)
    if (activeSnapLines.length > 0) {
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);

      for (const line of activeSnapLines) {
        ctx.beginPath();
        if (line.orientation === 'h') {
          ctx.moveTo(0, line.position);
          ctx.lineTo(canvas.width, line.position);
        } else {
          ctx.moveTo(line.position, 0);
          ctx.lineTo(line.position, canvas.height);
        }
        ctx.stroke();
      }
    }
  }, [showGrid, showGuides, gridSize, guides, imageDimensions, activeSnapLines]);

  // Convert screen coords to image coords for move tool
  const getImageCoordsForMove = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const state = useImageEditorStore.getState();
    return screenToImage(
      clientX - rect.left,
      clientY - rect.top,
      imageDimensions.width,
      imageDimensions.height,
      containerDimensions.width,
      containerDimensions.height,
      state.zoom,
      state.panOffset,
      state.rotation,
      state.flipHorizontal,
      state.flipVertical
    );
  }, [imageDimensions, containerDimensions]);

  // Hit test layers for move tool (top to bottom, clamped to canvas bounds)
  const hitTestLayersForMove = useCallback((point: { x: number; y: number }) => {
    // Only allow hits within canvas bounds
    if (point.x < 0 || point.y < 0 || point.x > imageDimensions.width || point.y > imageDimensions.height) {
      return null;
    }
    const { layers: currentLayers } = useImageEditorStore.getState();
    for (let i = currentLayers.length - 1; i >= 0; i--) {
      const layer = currentLayers[i];
      if (!layer.visible || layer.locked) continue;
      if (layer.type === 'group' || layer.type === 'adjustment') continue;
      const lx = layer.x ?? 0;
      const ly = layer.y ?? 0;
      const lw = layer.width || imageDimensions.width;
      const lh = layer.height || imageDimensions.height;
      if (point.x >= lx && point.x <= lx + lw && point.y >= ly && point.y <= ly + lh) {
        return layer;
      }
    }
    return null;
  }, [imageDimensions]);

  // Handle mouse down for panning and move
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Spacebar + left click = pan (Photoshop hand tool, works in any mode)
    if (e.button === 0 && isSpaceHeldRef.current) {
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Hand navigation tool: left click = pan
    if (e.button === 0 && navigationTool === 'hand') {
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      e.preventDefault();
      return;
    }

    // Zoom navigation tool: left click = zoom in, Alt+click = zoom out
    if (e.button === 0 && navigationTool === 'zoom') {
      const { zoom: currentZoom, setZoom } = useImageEditorStore.getState();
      const delta = e.altKey ? -25 : 25;
      setZoom(currentZoom + delta);
      e.preventDefault();
      return;
    }

    // Skip if overlay components handle this mode
    if (editMode === 'drawing' || editMode === 'selection' || editMode === 'shape' || editMode === 'mask' || editMode === 'text') {
      return;
    }

    // Middle mouse button for pan (any mode)
    if (e.button === 1) {
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      e.preventDefault();
      return;
    }

    // Left click in select/move mode: try to drag a layer
    // Alt+drag = duplicate layer (Photoshop standard)
    if (e.button === 0 && (editMode === 'select' || editMode === 'move')) {
      const point = getImageCoordsForMove(e.clientX, e.clientY);
      const hitLayer = hitTestLayersForMove(point);
      if (hitLayer) {
        let targetId = hitLayer.id;
        // Alt+drag: duplicate layer first, then move the copy
        if (e.altKey) {
          const newId = duplicateLayer(hitLayer.id);
          if (newId) {
            targetId = newId;
          }
        }
        setActiveLayer(targetId);
        moveLayerIdRef.current = targetId;
        const targetLayer = e.altKey
          ? useImageEditorStore.getState().layers.find(l => l.id === targetId) ?? hitLayer
          : hitLayer;
        moveOffsetRef.current = {
          x: point.x - (targetLayer.x ?? 0),
          y: point.y - (targetLayer.y ?? 0),
        };
        isMovingLayerRef.current = true;
      }
      e.preventDefault();
      return;
    }
  }, [editMode, getImageCoordsForMove, hitTestLayersForMove, setActiveLayer, duplicateLayer, navigationTool]);

  // Global window listeners for move drag (so drag works outside canvas)
  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!isMovingLayerRef.current || !moveLayerIdRef.current) return;
      const point = getImageCoordsForMove(e.clientX, e.clientY);
      let newX = Math.round(point.x - moveOffsetRef.current.x);
      let newY = Math.round(point.y - moveOffsetRef.current.y);

      const state = useImageEditorStore.getState();
      const movingLayer = state.layers.find(l => l.id === moveLayerIdRef.current);
      if (!movingLayer) return;

      // Shift = precision mode (no snapping)
      if (!isShiftHeldRef.current) {
        const otherLayers = state.smartGuidesEnabled
          ? state.layers.filter(l => l.id !== moveLayerIdRef.current && l.visible && !l.locked && l.type !== 'group' && l.type !== 'adjustment')
          : [];
        const snap = calculateSnap(
          newX, newY,
          movingLayer.width || imageDimensions.width,
          movingLayer.height || imageDimensions.height,
          state.canvasWidth || imageDimensions.width,
          state.canvasHeight || imageDimensions.height,
          otherLayers.map(l => ({ x: l.x ?? 0, y: l.y ?? 0, width: l.width || imageDimensions.width, height: l.height || imageDimensions.height })),
          { smartGuides: state.smartGuidesEnabled }
        );
        newX = snap.x;
        newY = snap.y;
        state.setActiveSnapLines(snap.snapLines);
      } else {
        state.setActiveSnapLines([]);
      }

      state.updateLayer(moveLayerIdRef.current, { x: newX, y: newY });
    };

    const handleWindowMouseUp = () => {
      if (isMovingLayerRef.current && moveLayerIdRef.current) {
        // Wait for renderAllLayers to finish, then push history
        requestAnimationFrame(() => {
          if (canvasRef.current) {
            const { pushHistory } = useImageEditorStore.getState();
            pushHistory('Move Layer', canvasRef.current.toDataURL());
          }
        });
      }
      isMovingLayerRef.current = false;
      moveLayerIdRef.current = null;
      useImageEditorStore.getState().setActiveSnapLines([]);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [getImageCoordsForMove, imageDimensions.height, imageDimensions.width]);

  // Keyboard shortcuts: arrow nudge + delete selection + CMYK proofing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+Y: toggle gamut warning (Ctrl+Y is handled by ImageEditorPage for Redo)
      if (e.ctrlKey && e.shiftKey && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        useImageEditorStore.getState().toggleGamutWarning();
        return;
      }

      // Don't intercept keyboard when editing text content
      const active = document.activeElement;
      if (active && (
        active.getAttribute('contenteditable') === 'true' ||
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA'
      )) {
        return;
      }

      // Delete/Backspace: erase selected area on active layer
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const state = useImageEditorStore.getState();
        const { selection, activeLayerId, layers, updateLayer, clearSelection, pushHistory } = state;
        if (!selection?.maskDataUrl || !activeLayerId) return;
        const layer = layers.find(l => l.id === activeLayerId);
        if (!layer || layer.locked || !layer.imageData) return;

        e.preventDefault();

        // Load layer image and mask, erase masked area
        const layerImg = new Image();
        layerImg.onload = () => {
          const maskImg = new Image();
          maskImg.onload = () => {
            const c = document.createElement('canvas');
            c.width = layer.width || layerImg.width;
            c.height = layer.height || layerImg.height;
            const ctx = c.getContext('2d');
            if (!ctx) return;

            // Draw layer
            ctx.drawImage(layerImg, 0, 0, c.width, c.height);

            // Convert mask (R channel = mask value, A = 255) to alpha-based mask
            // destination-out uses source alpha to erase, so we must move mask value to alpha channel
            const alphaMaskCanvas = document.createElement('canvas');
            alphaMaskCanvas.width = c.width;
            alphaMaskCanvas.height = c.height;
            const alphaMaskCtx = alphaMaskCanvas.getContext('2d');
            if (!alphaMaskCtx) return;
            alphaMaskCtx.drawImage(maskImg, 0, 0, c.width, c.height);
            const maskData = alphaMaskCtx.getImageData(0, 0, c.width, c.height);
            const pixels = maskData.data;
            for (let i = 0; i < pixels.length; i += 4) {
              pixels[i + 3] = pixels[i]; // A = R (mask value)
              pixels[i] = 0;
              pixels[i + 1] = 0;
              pixels[i + 2] = 0;
            }
            alphaMaskCtx.putImageData(maskData, 0, 0);

            // Erase masked area using corrected alpha mask
            ctx.globalCompositeOperation = 'destination-out';
            ctx.drawImage(alphaMaskCanvas, 0, 0);
            ctx.globalCompositeOperation = 'source-over';

            const newImageData = c.toDataURL('image/png');
            updateLayer(activeLayerId, { imageData: newImageData });
            clearSelection();

            // Push history after render
            requestAnimationFrame(() => {
              if (canvasRef.current) {
                pushHistory('Delete Selection', canvasRef.current.toDataURL());
              }
            });
          };
          maskImg.src = selection.maskDataUrl!;
        };
        layerImg.src = layer.imageData;
        return;
      }

      // Arrow keys: nudge layer in select mode
      if (editMode !== 'select') return;
      const { activeLayerId, layers, updateLayer } = useImageEditorStore.getState();
      if (!activeLayerId) return;
      const layer = layers.find(l => l.id === activeLayerId);
      if (!layer || layer.locked) return;

      let dx = 0;
      let dy = 0;
      const step = e.shiftKey ? 10 : 1;

      switch (e.key) {
        case 'ArrowUp': dy = -step; break;
        case 'ArrowDown': dy = step; break;
        case 'ArrowLeft': dx = -step; break;
        case 'ArrowRight': dx = step; break;
        default: return;
      }

      e.preventDefault();
      updateLayer(activeLayerId, { x: (layer.x ?? 0) + dx, y: (layer.y ?? 0) + dy });

      // Debounced history push: wait 300ms after last nudge so rapid presses create one entry
      if (nudgeHistoryTimeoutRef.current) {
        clearTimeout(nudgeHistoryTimeoutRef.current);
      }
      nudgeHistoryTimeoutRef.current = setTimeout(() => {
        requestAnimationFrame(() => {
          if (canvasRef.current) {
            const { pushHistory } = useImageEditorStore.getState();
            pushHistory('Nudge Layer', canvasRef.current.toDataURL());
          }
        });
      }, 300);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (nudgeHistoryTimeoutRef.current) {
        clearTimeout(nudgeHistoryTimeoutRef.current);
      }
    };
  }, [editMode]);

  // Spacebar panning (Photoshop-style: hold Space to temporarily activate hand tool)
  useEffect(() => {
    const handleSpaceDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      // Don't intercept when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      e.preventDefault();
      isSpaceHeldRef.current = true;
      setIsSpacePanning(true);
    };
    const handleSpaceUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      isSpaceHeldRef.current = false;
      setIsSpacePanning(false);
      if (isPanning) {
        setIsPanning(false);
      }
    };
    // Also handle blur (e.g. user switches window while holding space)
    const handleBlur = () => {
      isSpaceHeldRef.current = false;
      setIsSpacePanning(false);
    };
    window.addEventListener('keydown', handleSpaceDown);
    window.addEventListener('keyup', handleSpaceUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleSpaceDown);
      window.removeEventListener('keyup', handleSpaceUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [setIsSpacePanning, isPanning]);

  // Shift key tracking for snap disable during layer move
  useEffect(() => {
    const handleShiftDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') isShiftHeldRef.current = true;
    };
    const handleShiftUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') isShiftHeldRef.current = false;
    };
    const handleBlurShift = () => {
      isShiftHeldRef.current = false;
    };
    window.addEventListener('keydown', handleShiftDown);
    window.addEventListener('keyup', handleShiftUp);
    window.addEventListener('blur', handleBlurShift);
    return () => {
      window.removeEventListener('keydown', handleShiftDown);
      window.removeEventListener('keyup', handleShiftUp);
      window.removeEventListener('blur', handleBlurShift);
    };
  }, []);

  // Handle mouse move for panning and move hover
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Panning mode
    if (isPanning) {
      const dx = e.clientX - lastPanPoint.x;
      const dy = e.clientY - lastPanPoint.y;
      setPanOffset({
        x: panOffset.x + dx,
        y: panOffset.y + dy,
      });
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }

    // Select/move mode hover cursor
    if ((editMode === 'select' || editMode === 'move') && !isMovingLayerRef.current) {
      const point = getImageCoordsForMove(e.clientX, e.clientY);
      const hitLayer = hitTestLayersForMove(point);
      // cursor stays default per user preference
      void hitLayer;
    }
  }, [isPanning, lastPanPoint, panOffset, setPanOffset, editMode, getImageCoordsForMove, hitTestLayersForMove]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Handle wheel for zoom (non-passive listener to allow preventDefault)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -10 : 10;
      const { zoom, setZoom } = useImageEditorStore.getState();
      setZoom(zoom + delta);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const canvasScale = zoom / 100;

  // Determine cursor based on mode
  // Build CSS filter string for real-time adjustment/filter preview
  // Filter preview is now applied per-layer in renderAllLayers via ctx.filter
  // (no more global CSS filter on the canvas element)

  const getCursor = () => {
    if (isPanning) return 'grabbing';
    if (isSpacePanning || navigationTool === 'hand') return 'grab';
    if (navigationTool === 'zoom') return 'zoom-in';
    if (editMode === 'select' || editMode === 'move') return 'move';
    if (editMode === 'crop') return 'crosshair';
    if (editMode === 'drawing') return 'default'; // DrawingCanvas handles its own cursor
    if (editMode === 'selection') return 'default'; // SelectionOverlay handles its own cursor
    if (editMode === 'shape') return 'default'; // ShapeOverlay handles its own cursor
    if (editMode === 'mask') return 'default'; // MaskCanvas handles its own cursor
    if (editMode === 'text') return 'text';
    return 'default';
  };

  // Convert screen position to image coordinate (for ruler drag → guide creation)
  const screenToImageCoord = useCallback((screenPos: number, orientation: 'horizontal' | 'vertical') => {
    const scale = zoom / 100;
    const isH = orientation === 'horizontal';
    const containerSize = isH ? containerDimensions.width : containerDimensions.height;
    const imageSize = isH ? imageDimensions.width : imageDimensions.height;
    const scaledSize = imageSize * scale;
    const offset = isH ? panOffset.x : panOffset.y;
    const origin = (containerSize - scaledSize) / 2 + offset;
    return Math.round((screenPos - origin) / scale);
  }, [zoom, panOffset, containerDimensions, imageDimensions]);

  // Ruler drag handlers
  const handleRulerMouseDown = useCallback((orientation: 'horizontal' | 'vertical') => (e: React.MouseEvent) => {
    e.preventDefault();
    setRulerDrag({ orientation, active: true, position: 0 });
  }, []);

  // Global mouse move/up for ruler drag (creates guide on release)
  useEffect(() => {
    if (!rulerDrag?.active) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pos = rulerDrag.orientation === 'horizontal'
        ? e.clientY - rect.top
        : e.clientX - rect.left;
      setRulerDrag(prev => prev ? { ...prev, position: pos } : null);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!rulerDrag) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const screenPos = rulerDrag.orientation === 'horizontal'
          ? e.clientY - rect.top
          : e.clientX - rect.left;
        const imageCoord = screenToImageCoord(screenPos, rulerDrag.orientation);
        // Only add if within reasonable image bounds
        const maxSize = rulerDrag.orientation === 'horizontal' ? imageDimensions.height : imageDimensions.width;
        if (imageCoord >= 0 && imageCoord <= maxSize) {
          addGuide(rulerDrag.orientation, imageCoord);
        }
      }
      setRulerDrag(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [rulerDrag, screenToImageCoord, addGuide, imageDimensions]);

  // Ruler rendering helper
  const renderRuler = useCallback((orientation: 'horizontal' | 'vertical') => {
    const scale = zoom / 100;
    const isH = orientation === 'horizontal';
    const offset = isH ? panOffset.x : panOffset.y;
    const containerSize = isH ? containerDimensions.width : containerDimensions.height;
    const imageSize = isH ? imageDimensions.width : imageDimensions.height;
    const scaledSize = imageSize * scale;
    const origin = (containerSize - scaledSize) / 2 + offset;

    // Determine tick interval based on zoom
    let tickInterval = 100;
    if (scale >= 4) tickInterval = 10;
    else if (scale >= 2) tickInterval = 25;
    else if (scale >= 1) tickInterval = 50;
    else if (scale >= 0.5) tickInterval = 100;
    else tickInterval = 200;

    const ticks: React.ReactNode[] = [];
    const startPx = Math.floor(-origin / scale / tickInterval) * tickInterval;
    const endPx = Math.ceil((containerSize - origin) / scale / tickInterval) * tickInterval;

    for (let px = startPx; px <= endPx; px += tickInterval) {
      const screenPos = origin + px * scale;
      if (screenPos < 0 || screenPos > containerSize) continue;

      const isMajor = px % (tickInterval * 2) === 0;
      const pos = Math.round(screenPos);

      ticks.push(
        <div key={px} className="absolute" style={isH
          ? { left: pos, top: 0, height: '100%' }
          : { top: pos, left: 0, width: '100%' }
        }>
          <div className={cn(
            'bg-zinc-500',
            isH ? 'w-px' : 'h-px',
            isH ? (isMajor ? 'h-3' : 'h-1.5') : (isMajor ? 'w-3' : 'w-1.5'),
            isH ? 'absolute bottom-0' : 'absolute right-0'
          )} />
          {isMajor && (
            <span className={cn(
              'text-[8px] text-zinc-500 absolute select-none',
              isH ? 'left-0.5 top-0' : 'top-0.5 left-0.5'
            )} style={isH ? undefined : { writingMode: 'vertical-lr' }}>
              {px}
            </span>
          )}
        </div>
      );
    }
    return ticks;
  }, [zoom, panOffset, containerDimensions, imageDimensions]);

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Horizontal ruler */}
      {showRulers && (
        <div
          className="h-5 bg-zinc-800 border-b border-zinc-700 relative overflow-hidden flex-shrink-0 cursor-s-resize"
          style={{ marginLeft: 20 }}
          onMouseDown={handleRulerMouseDown('horizontal')}
        >
          {renderRuler('horizontal')}
        </div>
      )}
      <div className="flex flex-1 min-h-0">
        {/* Vertical ruler */}
        {showRulers && (
          <div
            className="w-5 bg-zinc-800 border-r border-zinc-700 relative overflow-hidden flex-shrink-0 cursor-e-resize"
            onMouseDown={handleRulerMouseDown('vertical')}
          >
            {renderRuler('vertical')}
          </div>
        )}
        <div
          ref={containerRef}
          className={cn(
            'flex-1 overflow-hidden flex items-center justify-center',
            'bg-zinc-900 relative'
          )}
          style={{ cursor: getCursor() }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >

      {/* Drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-500/10 border-2 border-dashed border-blue-400 z-40 pointer-events-none">
          <div className="flex flex-col items-center gap-2 px-6 py-4 rounded-xl bg-zinc-900/80 backdrop-blur-sm">
            <ImageIcon className="w-8 h-8 text-blue-400" />
            <span className="text-sm text-blue-300 font-medium">Drop to add as layer</span>
          </div>
        </div>
      )}

      {/* Loading state */}
      {showLoader && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/95 z-20 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-zinc-800/50 border border-zinc-700/50">
            {/* Animated loader ring */}
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 rounded-full border-2 border-zinc-700" />
              <div className="absolute inset-0 rounded-full border-2 border-t-white border-r-transparent border-b-transparent border-l-transparent animate-spin" />
              <Loader2 className="absolute inset-2 w-10 h-10 text-white/50" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm font-medium text-white">Loading image</span>
              <span className="text-xs text-zinc-500">Please wait...</span>
            </div>
          </div>
        </div>
      )}

      {/* Processing overlay */}
      {isProcessing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-30">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-12 h-12 text-white/70 animate-spin" />
            <span className="text-sm text-white">Processing...</span>
          </div>
        </div>
      )}

      {/* Canvas container with transform */}
      <div
        className="relative"
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${canvasScale}) rotate(${rotation}deg) scaleX(${flipHorizontal ? -1 : 1}) scaleY(${flipVertical ? -1 : 1})`,
          transformOrigin: 'center center',
          opacity: showLoader ? 0 : 1,
          transition: 'opacity 0.3s ease-in-out',
          backgroundImage: `
            linear-gradient(45deg, #c0c0c0 25%, transparent 25%),
            linear-gradient(-45deg, #c0c0c0 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #c0c0c0 75%),
            linear-gradient(-45deg, transparent 75%, #c0c0c0 75%)
          `,
          backgroundColor: '#ffffff',
          backgroundSize: '10px 10px',
          backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px',
        }}
      >
        {/* Main canvas */}
        <canvas
          ref={canvasRef}
          className="max-w-none shadow-2xl outline outline-1 outline-zinc-500/50"
          style={{ display: 'block', position: 'relative' }}
        />

        {/* Overlay canvas (for grid, guides, selections) */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute top-0 left-0 max-w-none pointer-events-none"
          style={{ display: 'block' }}
        />
      </div>

      {/* Empty state */}
      {!showLoader && !imageUrl && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-zinc-600">
            <ImageIcon className="w-16 h-16" />
            <span className="text-sm">No image loaded</span>
          </div>
        </div>
      )}

      {/* Crop overlay */}
      {editMode === 'crop' && !isImageLoading && imageDimensions.width > 0 && (
        <CropOverlay
          containerRef={containerRef}
          imageDimensions={imageDimensions}
          zoom={zoom}
          panOffset={panOffset}
        />
      )}

      {/* Drawing overlay */}
      {!isImageLoading && imageDimensions.width > 0 && containerDimensions.width > 0 && (
        <DrawingCanvas
          imageWidth={imageDimensions.width}
          imageHeight={imageDimensions.height}
          containerWidth={containerDimensions.width}
          containerHeight={containerDimensions.height}
          onCommitStroke={commitStroke}
          mainCanvasRef={canvasRef}
          className="z-10"
        />
      )}

      {/* Selection overlay */}
      {!isImageLoading && imageDimensions.width > 0 && containerDimensions.width > 0 && (
        <SelectionOverlay
          imageWidth={imageDimensions.width}
          imageHeight={imageDimensions.height}
          containerWidth={containerDimensions.width}
          containerHeight={containerDimensions.height}
          mainCanvasRef={canvasRef}
          className="z-10"
        />
      )}

      {/* Shape overlay */}
      {!isImageLoading && imageDimensions.width > 0 && containerDimensions.width > 0 && (
        <ShapeOverlay
          imageWidth={imageDimensions.width}
          imageHeight={imageDimensions.height}
          containerWidth={containerDimensions.width}
          containerHeight={containerDimensions.height}
          onCommitShape={commitShape}
          className="z-10"
        />
      )}

      {/* Text overlay */}
      {!isImageLoading && imageDimensions.width > 0 && containerDimensions.width > 0 && (
        <TextOverlay
          imageWidth={imageDimensions.width}
          imageHeight={imageDimensions.height}
          containerWidth={containerDimensions.width}
          containerHeight={containerDimensions.height}
          onCommitText={commitText}
          className="z-10"
        />
      )}

      {/* Mask editing overlay */}
      {!isImageLoading && imageDimensions.width > 0 && containerDimensions.width > 0 && (
        <MaskCanvas
          imageWidth={imageDimensions.width}
          imageHeight={imageDimensions.height}
          containerWidth={containerDimensions.width}
          containerHeight={containerDimensions.height}
          onMaskUpdate={updateMask}
          className="z-10"
        />
      )}

      {/* Warp overlay */}
      {isWarpMode && !isImageLoading && imageDimensions.width > 0 && containerDimensions.width > 0 && (
        <WarpOverlay
          imageWidth={imageDimensions.width}
          imageHeight={imageDimensions.height}
          containerWidth={containerDimensions.width}
          containerHeight={containerDimensions.height}
          zoom={zoom}
          panOffsetX={panOffset.x}
          panOffsetY={panOffset.y}
          className="z-20"
        />
      )}

      {/* Path overlay */}
      {!isImageLoading && imageDimensions.width > 0 && containerDimensions.width > 0 && (
        <PathOverlay
          imageWidth={imageDimensions.width}
          imageHeight={imageDimensions.height}
          containerWidth={containerDimensions.width}
          containerHeight={containerDimensions.height}
          className="z-15"
        />
      )}

      {/* Image dimensions display */}
      {!showLoader && imageDimensions.width > 0 && (
        <div className="absolute bottom-4 left-4 px-2 py-1 bg-black/60 rounded text-xs text-zinc-400">
          {imageDimensions.width} × {imageDimensions.height}
        </div>
      )}

      {/* Guide drag preview line */}
      {rulerDrag?.active && (
        <div
          className="absolute pointer-events-none z-50"
          style={rulerDrag.orientation === 'horizontal'
            ? { left: 0, right: 0, top: rulerDrag.position, height: 1, backgroundColor: 'rgba(59, 130, 246, 0.8)' }
            : { top: 0, bottom: 0, left: rulerDrag.position, width: 1, backgroundColor: 'rgba(59, 130, 246, 0.8)' }
          }
        />
      )}
    </div>
      </div>
    </div>
  );
}));

export default EditorCanvas;
