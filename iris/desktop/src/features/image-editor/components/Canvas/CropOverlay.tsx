/**
 * CropOverlay - Draggable crop region overlay for image editor
 * Displays on top of the canvas when in crop mode
 */

import { memo, useCallback, useState, useEffect } from 'react';
import { useImageEditorStore, CropData } from '@/features/image-editor/stores/imageEditor.store';

interface CropOverlayProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  imageDimensions: { width: number; height: number };
  zoom: number;
  panOffset: { x: number; y: number };
}

type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLE_SIZE = 10;
const MIN_CROP_SIZE = 20;

export const CropOverlay = memo(function CropOverlay({
  containerRef,
  imageDimensions,
  zoom,
  panOffset,
}: CropOverlayProps) {
  const { cropData, cropAspectRatio, setCropData } = useImageEditorStore();

  // Local state for dragging
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<HandlePosition | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialCrop, setInitialCrop] = useState<CropData | null>(null);

  const scale = zoom / 100;

  // Get aspect ratio value
  const getAspectRatio = useCallback((): number | null => {
    if (cropAspectRatio === 'free') return null;
    const [w, h] = cropAspectRatio.split(':').map(Number);
    return w / h;
  }, [cropAspectRatio]);

  // Convert screen coordinates to image coordinates
  const screenToImage = useCallback(
    (screenX: number, screenY: number): { x: number; y: number } => {
      if (!containerRef.current) return { x: 0, y: 0 };

      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // Calculate image position (centered with pan offset)
      const imageScreenX = centerX + panOffset.x - (imageDimensions.width * scale) / 2;
      const imageScreenY = centerY + panOffset.y - (imageDimensions.height * scale) / 2;

      // Convert to image coordinates
      const x = (screenX - rect.left - imageScreenX) / scale;
      const y = (screenY - rect.top - imageScreenY) / scale;

      return { x, y };
    },
    [containerRef, panOffset, imageDimensions, scale]
  );

  // Check if mouse is inside crop area
  const isInsideCrop = useCallback(
    (e: React.MouseEvent): boolean => {
      if (!cropData || !containerRef.current) return false;

      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const imageScreenX = centerX + panOffset.x - (imageDimensions.width * scale) / 2;
      const imageScreenY = centerY + panOffset.y - (imageDimensions.height * scale) / 2;

      const cropScreenX = imageScreenX + cropData.x * scale;
      const cropScreenY = imageScreenY + cropData.y * scale;
      const cropScreenW = cropData.width * scale;
      const cropScreenH = cropData.height * scale;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      return (
        mouseX >= cropScreenX &&
        mouseX <= cropScreenX + cropScreenW &&
        mouseY >= cropScreenY &&
        mouseY <= cropScreenY + cropScreenH
      );
    },
    [cropData, containerRef, panOffset, imageDimensions, scale]
  );

  // Initialize crop data on first drag
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // Left click only

      const target = e.target as HTMLElement;
      const handle = target.dataset.handle as HandlePosition | undefined;

      if (handle && cropData) {
        // Start resizing
        setIsResizing(true);
        setResizeHandle(handle);
        setDragStart({ x: e.clientX, y: e.clientY });
        setInitialCrop({ ...cropData });
      } else if (cropData && isInsideCrop(e)) {
        // Start moving existing crop
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        setInitialCrop({ ...cropData });
      } else {
        // Start creating new crop
        const pos = screenToImage(e.clientX, e.clientY);

        const newCrop: CropData = {
          x: Math.max(0, Math.min(pos.x, imageDimensions.width)),
          y: Math.max(0, Math.min(pos.y, imageDimensions.height)),
          width: 0,
          height: 0,
        };

        setCropData(newCrop);
        setIsResizing(true);
        setResizeHandle('se');
        setDragStart({ x: e.clientX, y: e.clientY });
        setInitialCrop(newCrop);
      }

      e.preventDefault();
    },
    [cropData, screenToImage, setCropData, imageDimensions, isInsideCrop]
  );

  // Handle mouse move for dragging/resizing
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!initialCrop) return;

      const deltaX = (e.clientX - dragStart.x) / scale;
      const deltaY = (e.clientY - dragStart.y) / scale;
      const aspectRatio = getAspectRatio();

      if (isDragging) {
        // Move crop area
        let newX = initialCrop.x + deltaX;
        let newY = initialCrop.y + deltaY;

        // Constrain to image bounds
        newX = Math.max(0, Math.min(newX, imageDimensions.width - initialCrop.width));
        newY = Math.max(0, Math.min(newY, imageDimensions.height - initialCrop.height));

        setCropData({
          ...initialCrop,
          x: newX,
          y: newY,
        });
      } else if (isResizing && resizeHandle) {
        // Resize crop area
        let newX = initialCrop.x;
        let newY = initialCrop.y;
        let newWidth = initialCrop.width;
        let newHeight = initialCrop.height;

        // Handle different resize directions
        if (resizeHandle.includes('e')) {
          newWidth = Math.max(MIN_CROP_SIZE, initialCrop.width + deltaX);
        }
        if (resizeHandle.includes('w')) {
          const widthDelta = Math.min(deltaX, initialCrop.width - MIN_CROP_SIZE);
          newX = initialCrop.x + widthDelta;
          newWidth = initialCrop.width - widthDelta;
        }
        if (resizeHandle.includes('s')) {
          newHeight = Math.max(MIN_CROP_SIZE, initialCrop.height + deltaY);
        }
        if (resizeHandle.includes('n')) {
          const heightDelta = Math.min(deltaY, initialCrop.height - MIN_CROP_SIZE);
          newY = initialCrop.y + heightDelta;
          newHeight = initialCrop.height - heightDelta;
        }

        // Apply aspect ratio constraint
        // Shift key = constrain to current proportions (Photoshop standard)
        const effectiveAspectRatio = aspectRatio ?? (e.shiftKey && initialCrop.width > 0 && initialCrop.height > 0
          ? initialCrop.width / initialCrop.height
          : null);
        if (effectiveAspectRatio) {
          if (resizeHandle.includes('e') || resizeHandle.includes('w')) {
            newHeight = newWidth / effectiveAspectRatio;
          } else {
            newWidth = newHeight * effectiveAspectRatio;
          }
        }

        // Constrain to image bounds
        newX = Math.max(0, newX);
        newY = Math.max(0, newY);
        newWidth = Math.min(newWidth, imageDimensions.width - newX);
        newHeight = Math.min(newHeight, imageDimensions.height - newY);

        setCropData({
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight,
        });
      }
    },
    [
      initialCrop,
      dragStart,
      scale,
      isDragging,
      isResizing,
      resizeHandle,
      imageDimensions,
      setCropData,
      getAspectRatio,
    ]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeHandle(null);
    setInitialCrop(null);
  }, []);

  // Add global mouse listeners
  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  // Calculate crop overlay position in screen coordinates
  const getCropScreenRect = useCallback(() => {
    if (!cropData || !containerRef.current) return null;

    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const imageScreenX = centerX + panOffset.x - (imageDimensions.width * scale) / 2;
    const imageScreenY = centerY + panOffset.y - (imageDimensions.height * scale) / 2;

    return {
      left: imageScreenX + cropData.x * scale,
      top: imageScreenY + cropData.y * scale,
      width: cropData.width * scale,
      height: cropData.height * scale,
    };
  }, [cropData, containerRef, panOffset, imageDimensions, scale]);

  const cropRect = getCropScreenRect();

  // Render resize handles
  const renderHandles = () => {
    if (!cropRect || cropRect.width < MIN_CROP_SIZE || cropRect.height < MIN_CROP_SIZE)
      return null;

    const handles: { position: HandlePosition; style: React.CSSProperties }[] = [
      { position: 'nw', style: { left: -HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2 } },
      { position: 'n', style: { left: '50%', top: -HANDLE_SIZE / 2, transform: 'translateX(-50%)' } },
      { position: 'ne', style: { right: -HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2 } },
      { position: 'e', style: { right: -HANDLE_SIZE / 2, top: '50%', transform: 'translateY(-50%)' } },
      { position: 'se', style: { right: -HANDLE_SIZE / 2, bottom: -HANDLE_SIZE / 2 } },
      { position: 's', style: { left: '50%', bottom: -HANDLE_SIZE / 2, transform: 'translateX(-50%)' } },
      { position: 'sw', style: { left: -HANDLE_SIZE / 2, bottom: -HANDLE_SIZE / 2 } },
      { position: 'w', style: { left: -HANDLE_SIZE / 2, top: '50%', transform: 'translateY(-50%)' } },
    ];

    const getCursor = (pos: HandlePosition) => {
      const cursors: Record<HandlePosition, string> = {
        nw: 'nwse-resize',
        ne: 'nesw-resize',
        sw: 'nesw-resize',
        se: 'nwse-resize',
        n: 'ns-resize',
        s: 'ns-resize',
        e: 'ew-resize',
        w: 'ew-resize',
      };
      return cursors[pos];
    };

    return handles.map(({ position, style }) => (
      <div
        key={position}
        data-handle={position}
        className="absolute bg-white border-2 border-zinc-900 rounded-sm z-10"
        style={{
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          cursor: getCursor(position),
          ...style,
        }}
      />
    ));
  };

  return (
    <div
      className="absolute inset-0 z-20"
      style={{ cursor: isDragging ? 'move' : isResizing ? 'crosshair' : 'crosshair' }}
      onMouseDown={handleMouseDown}
    >
      {/* Dark overlay mask */}
      {cropRect && cropRect.width > 0 && cropRect.height > 0 && (
        <>
          {/* Top */}
          <div
            className="absolute bg-black/50"
            style={{
              left: 0,
              top: 0,
              right: 0,
              height: cropRect.top,
            }}
          />
          {/* Bottom */}
          <div
            className="absolute bg-black/50"
            style={{
              left: 0,
              top: cropRect.top + cropRect.height,
              right: 0,
              bottom: 0,
            }}
          />
          {/* Left */}
          <div
            className="absolute bg-black/50"
            style={{
              left: 0,
              top: cropRect.top,
              width: cropRect.left,
              height: cropRect.height,
            }}
          />
          {/* Right */}
          <div
            className="absolute bg-black/50"
            style={{
              left: cropRect.left + cropRect.width,
              top: cropRect.top,
              right: 0,
              height: cropRect.height,
            }}
          />
        </>
      )}

      {/* Crop region */}
      {cropRect && cropRect.width > 0 && cropRect.height > 0 && (
        <div
          className="absolute border-2 border-white shadow-lg"
          style={{
            left: cropRect.left,
            top: cropRect.top,
            width: cropRect.width,
            height: cropRect.height,
            cursor: 'move',
          }}
        >
          {/* Grid lines (rule of thirds) */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/30" />
            <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/30" />
            <div className="absolute top-1/3 left-0 right-0 h-px bg-white/30" />
            <div className="absolute top-2/3 left-0 right-0 h-px bg-white/30" />
          </div>

          {/* Resize handles */}
          {renderHandles()}
        </div>
      )}
    </div>
  );
});

export default CropOverlay;
