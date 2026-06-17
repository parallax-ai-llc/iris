/**
 * TextOverlay
 * Handles text input on canvas: click to place, type text, commit as layer
 * Layer is created immediately on text box creation and updated in real-time.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { screenToImage } from '@/features/image-editor/canvas/canvasEngine';
import { renderTextToCanvas } from '@/features/image-editor/canvas/canvasEngine';
import { cn } from '@/shared/lib/utils';

interface TextOverlayProps {
  imageWidth: number;
  imageHeight: number;
  containerWidth: number;
  containerHeight: number;
  onCommitText: (canvas: HTMLCanvasElement, x: number, y: number) => void;
  className?: string;
}

export function TextOverlay({
  imageWidth,
  imageHeight,
  containerWidth,
  containerHeight,
  onCommitText: _onCommitText,
  className,
}: TextOverlayProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editPos, setEditPos] = useState({ x: 0, y: 0 }); // image coordinates
  const layerIdRef = useRef<string | null>(null);
  const textContentRef = useRef('');

  const {
    editMode,
    textSettings,
    setTextSettings,
    zoom,
    panOffset,
    rotation,
    flipHorizontal,
    flipVertical,
  } = useImageEditorStore();

  // Convert image coordinates to screen position for the editor overlay
  const imageToScreen = useCallback((ix: number, iy: number) => {
    const scale = zoom / 100;
    const scaledWidth = imageWidth * scale;
    const scaledHeight = imageHeight * scale;
    const offsetX = (containerWidth - scaledWidth) / 2 + panOffset.x;
    const offsetY = (containerHeight - scaledHeight) / 2 + panOffset.y;
    return {
      x: ix * scale + offsetX,
      y: iy * scale + offsetY,
    };
  }, [zoom, imageWidth, imageHeight, containerWidth, containerHeight, panOffset]);

  // Convert screen coordinates to image coordinates
  const getImageCoords = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    return screenToImage(
      screenX, screenY,
      imageWidth, imageHeight,
      containerWidth, containerHeight,
      zoom, panOffset, rotation, flipHorizontal, flipVertical
    );
  }, [imageWidth, imageHeight, containerWidth, containerHeight, zoom, panOffset, rotation, flipHorizontal, flipVertical]);

  // Update the existing layer with current text content
  const updateTextLayer = useCallback((text: string) => {
    if (!layerIdRef.current) return;
    const { updateLayer } = useImageEditorStore.getState();
    if (!text.trim()) {
      // Render a minimal transparent placeholder so the layer stays valid
      const { canvas } = renderTextToCanvas(' ', textSettings);
      updateLayer(layerIdRef.current, {
        imageData: canvas.toDataURL(),
        width: canvas.width,
        height: canvas.height,
      });
      return;
    }
    const { canvas } = renderTextToCanvas(text, textSettings);
    updateLayer(layerIdRef.current, {
      imageData: canvas.toDataURL(),
      width: canvas.width,
      height: canvas.height,
    });
  }, [textSettings]);

  // Finalize editing: remove layer if empty, otherwise keep it
  const finalizeEditing = useCallback(() => {
    const text = textContentRef.current.trim();
    if (!text && layerIdRef.current) {
      // Remove empty text layer
      const { removeLayer } = useImageEditorStore.getState();
      removeLayer(layerIdRef.current);
    } else if (text && layerIdRef.current) {
      // Final update with latest text and settings
      const { updateLayer, pushHistory } = useImageEditorStore.getState();
      const { canvas } = renderTextToCanvas(text, textSettings);
      updateLayer(layerIdRef.current, {
        imageData: canvas.toDataURL(),
        width: canvas.width,
        height: canvas.height,
      });
      pushHistory('Text', canvas.toDataURL());
    }
    layerIdRef.current = null;
    textContentRef.current = '';
    setIsEditing(false);
  }, [textSettings]);

  // Handle click on overlay - place text or finalize existing
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (editMode !== 'text') return;

    // If already editing, finalize current text first
    if (isEditing) {
      finalizeEditing();
      return;
    }

    // Start new text editing at click position
    const coords = getImageCoords(e);
    setEditPos({ x: coords.x, y: coords.y });

    // Immediately create a text layer
    const { addLayer, updateLayer } = useImageEditorStore.getState();
    const { canvas } = renderTextToCanvas(' ', textSettings);
    const layerId = addLayer(canvas.toDataURL(), 'Text');
    if (layerId) {
      updateLayer(layerId, {
        x: coords.x,
        y: coords.y,
        width: canvas.width,
        height: canvas.height,
      });
      layerIdRef.current = layerId;
    }
    textContentRef.current = '';
    setIsEditing(true);
  }, [editMode, isEditing, finalizeEditing, getImageCoords, textSettings]);

  // Focus the editor when editing starts
  useEffect(() => {
    if (isEditing && editorRef.current) {
      editorRef.current.innerText = '';
      requestAnimationFrame(() => {
        editorRef.current?.focus();
      });
    }
  }, [isEditing]);

  // Handle input changes - update layer in real-time
  const handleInput = useCallback(() => {
    const text = editorRef.current?.innerText || '';
    textContentRef.current = text;
    updateTextLayer(text);
  }, [updateTextLayer]);

  // Handle keyboard shortcuts while editing
  useEffect(() => {
    if (!isEditing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        // Cancel: remove the layer if empty, keep if has content
        finalizeEditing();
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        finalizeEditing();
        return;
      }

      // Text editing shortcuts (Ctrl/Cmd)
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'a': // Select all
            e.stopPropagation();
            return;
          case 'b': // Toggle bold
            e.preventDefault();
            e.stopPropagation();
            setTextSettings({
              fontWeight: textSettings.fontWeight === 'bold' ? 'normal' : 'bold',
            });
            return;
          case 'i': // Toggle italic
            e.preventDefault();
            e.stopPropagation();
            setTextSettings({
              fontStyle: textSettings.fontStyle === 'italic' ? 'normal' : 'italic',
            });
            return;
        }
        // Let other Ctrl shortcuts (Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+Z) pass through natively
        e.stopPropagation();
        return;
      }

      // Stop propagation for all regular typing keys
      e.stopPropagation();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isEditing, textSettings, setTextSettings, finalizeEditing]);

  // Update layer when textSettings change (bold/italic toggle while editing)
  useEffect(() => {
    if (isEditing && layerIdRef.current && textContentRef.current.trim()) {
      updateTextLayer(textContentRef.current);
    }
  }, [isEditing, textSettings, updateTextLayer]);

  // Finalize editing when mode changes (uses ref-based text, doesn't need DOM)
  useEffect(() => {
    if (editMode !== 'text' && isEditing) {
      finalizeEditing();
    }
  }, [editMode, isEditing, finalizeEditing]);

  if (editMode !== 'text') return null;

  const scale = zoom / 100;
  const screenPos = isEditing ? imageToScreen(editPos.x, editPos.y) : { x: 0, y: 0 };

  return (
    <div
      className={cn('absolute inset-0 pointer-events-auto', className)}
      style={{ cursor: isEditing ? 'default' : 'text' }}
      onMouseDown={handleMouseDown}
    >
      {/* Text editor */}
      {isEditing && (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="absolute outline-none whitespace-pre-wrap"
          style={{
            left: screenPos.x,
            top: screenPos.y,
            fontFamily: textSettings.fontFamily,
            fontSize: textSettings.fontSize * scale,
            fontWeight: textSettings.fontWeight,
            fontStyle: textSettings.fontStyle,
            color: textSettings.color,
            textAlign: textSettings.alignment,
            lineHeight: textSettings.lineHeight,
            letterSpacing: textSettings.letterSpacing,
            border: '1px dashed rgba(59, 130, 246, 0.5)',
            padding: '2px 4px',
            minWidth: 20,
            minHeight: textSettings.fontSize * scale,
            background: 'rgba(0, 0, 0, 0.1)',
            caretColor: textSettings.color,
            zIndex: 50,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onInput={handleInput}
        />
      )}
    </div>
  );
}
