/**
 * TextOverlay
 * Handles text input on canvas: click to place, type text, commit as layer
 * Layer is created immediately on text box creation and updated in real-time.
 *
 * Clicking an existing text layer (one carrying `text` data) re-opens it with
 * its content and style instead of creating a new layer; so does a Layers
 * panel double-click (`textEditRequest`). Committing a changed re-edit updates
 * the same layer with one 'Text' history entry; an unchanged or emptied
 * re-edit restores the layer without an entry.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { screenToImage } from '@/features/image-editor/canvas/canvasEngine';
import { renderTextToCanvas } from '@/features/image-editor/canvas/canvasEngine';
import { cn } from '@/shared/lib/utils';
import type { Layer, TextSettings } from '@/features/image-editor/stores/imageEditor.store';
import { findTextLayerAt, isSameText } from '@/features/image-editor/lib/textLayerEdit';

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
  // Bumped on every edit start so the focus effect re-runs even when an edit
  // follows another one without isEditing turning false in between.
  const [editSession, setEditSession] = useState(0);
  const layerIdRef = useRef<string | null>(null);
  const textContentRef = useRef('');
  /** The text layer as it was before a re-edit; null while placing new text. */
  const originalLayerRef = useRef<Layer | null>(null);

  const {
    editMode,
    textSettings,
    setTextSettings,
    textEditRequest,
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
    const layerId = layerIdRef.current;
    const original = originalLayerRef.current;
    const { updateLayer, removeLayer, pushHistory } = useImageEditorStore.getState();
    if (layerId && original?.text) {
      // Re-edit of an existing text layer
      if (!text || isSameText(original.text, text, textSettings)) {
        // Nothing to record: put back exactly what the layer had.
        updateLayer(layerId, {
          imageData: original.imageData,
          width: original.width,
          height: original.height,
          text: original.text,
        });
      } else {
        const settings: TextSettings = { ...textSettings };
        const { canvas } = renderTextToCanvas(text, settings);
        const dataUrl = canvas.toDataURL();
        updateLayer(layerId, {
          imageData: dataUrl,
          width: canvas.width,
          height: canvas.height,
          text: { content: text, settings },
        });
        pushHistory('Text', dataUrl);
      }
    } else if (!text && layerId) {
      // The layer was added without a history entry, so dropping it needs none.
      removeLayer(layerId, { history: false });
    } else if (text && layerId) {
      // Final update with latest text and settings
      const settings: TextSettings = { ...textSettings };
      const { canvas } = renderTextToCanvas(text, settings);
      const dataUrl = canvas.toDataURL();
      updateLayer(layerId, {
        imageData: dataUrl,
        width: canvas.width,
        height: canvas.height,
        text: { content: text, settings },
      });
      pushHistory('Text', dataUrl);
    }
    layerIdRef.current = null;
    originalLayerRef.current = null;
    textContentRef.current = '';
    setIsEditing(false);
  }, [textSettings]);

  // Open an existing text layer for editing with its own content and style
  const startEditingLayer = useCallback((layer: Layer) => {
    if (!layer.text) return;
    const state = useImageEditorStore.getState();
    if (state.activeLayerId !== layer.id) state.setActiveLayer(layer.id);
    setTextSettings(layer.text.settings);
    originalLayerRef.current = { ...layer };
    layerIdRef.current = layer.id;
    textContentRef.current = layer.text.content;
    setEditPos({ x: layer.x, y: layer.y });
    setIsEditing(true);
    setEditSession((n) => n + 1);
  }, [setTextSettings]);

  // Handle click on overlay - place text or finalize existing
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (editMode !== 'text') return;
    if (useImageEditorStore.getState().isSpacePanning) return; // Spacebar panning takes priority

    // If already editing, finalize current text first
    if (isEditing) {
      finalizeEditing();
      return;
    }

    const coords = getImageCoords(e);

    // Clicking an existing text layer edits it (Photoshop Type tool)
    const hit = findTextLayerAt(useImageEditorStore.getState().layers, coords.x, coords.y);
    if (hit) {
      startEditingLayer(hit);
      return;
    }

    // Start new text editing at click position
    setEditPos({ x: coords.x, y: coords.y });

    // Immediately create a text layer
    const { addLayer, updateLayer } = useImageEditorStore.getState();
    const { canvas } = renderTextToCanvas(' ', textSettings);
    // No entry yet: finalizeEditing pushes 'Text' once something was typed.
    const layerId = addLayer(canvas.toDataURL(), 'Text', { history: false });
    if (layerId) {
      updateLayer(layerId, {
        x: coords.x,
        y: coords.y,
        width: canvas.width,
        height: canvas.height,
      });
      layerIdRef.current = layerId;
    }
    originalLayerRef.current = null;
    textContentRef.current = '';
    setIsEditing(true);
    setEditSession((n) => n + 1);
  }, [editMode, isEditing, finalizeEditing, getImageCoords, textSettings, startEditingLayer]);

  // Layers panel double-click: open the requested text layer
  useEffect(() => {
    if (!textEditRequest || editMode !== 'text') return;
    const state = useImageEditorStore.getState();
    state.clearTextEditRequest();
    const layer = state.layers.find((l) => l.id === textEditRequest);
    if (!layer?.text) return;
    if (isEditing) {
      if (layerIdRef.current === layer.id) return;
      finalizeEditing();
    }
    startEditingLayer(layer);
  }, [textEditRequest, editMode, isEditing, finalizeEditing, startEditingLayer]);

  // Focus the editor when editing starts (with the layer's text on a re-edit)
  useEffect(() => {
    if (isEditing && editorRef.current) {
      editorRef.current.innerText = textContentRef.current;
      requestAnimationFrame(() => {
        const el = editorRef.current;
        if (!el) return;
        el.focus();
        // Caret at the end of the existing text
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      });
    }
  }, [isEditing, editSession]);

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
