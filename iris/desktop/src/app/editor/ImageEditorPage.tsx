/**
 * ImageEditorPage - Photoshop-style image editor page
 * Layout: TitleBar > Header > [ToolPanel | OptionsBar + Canvas + BottomBar | RightPanel]
 */

import { memo, useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { useEditorTabsStore, setupEditorTabsSync } from '@/features/image-editor/stores/editorTabs.store';
import { ImageEditorStoreProvider } from '@/features/image-editor/stores/imageEditorContext';
import { getOrCreateStore } from '@/features/image-editor/stores/imageEditorRegistry';
import { EditorTabBar } from '@/features/image-editor/components/tabs/EditorTabBar';
import { EditorMenuBar } from '@/features/image-editor/components/tabs/EditorMenuBar';
import { EditorCanvas, EditorCanvasHandle } from '@/features/image-editor/components/Canvas/EditorCanvas';
import { ToolPanel, SHORTCUT_TO_GROUP } from '@/features/image-editor/components/Toolbar/ToolPanel';
import { RightPanel } from '@/features/image-editor/components/RightPanel/RightPanel';
import { OptionsBar } from '@/features/image-editor/components/OptionsBar/OptionsBar';
import { FloatingAIPanel } from '@/features/image-editor/components/FloatingPanel/FloatingAIPanel';
import { ZoomControls } from '@/features/image-editor/components/shared/ZoomControls';
import { SaveAsModal, SaveFormat, SaveAsDestination } from '@/features/image-editor/components/modals/SaveAsModal';
import { SaveFormatModal, type SaveDestination } from '@/features/image-editor/components/modals/SaveFormatModal';
import { NewProjectModal } from '@/features/image-editor/components/modals/NewProjectModal';
import { ImageInfoModal } from '@/features/image-editor/components/modals/ImageInfoModal';
import { FilterGalleryModal } from '@/features/image-editor/components/modals/FilterGalleryModal';
import { InpaintModal } from '@/features/image-editor/components/modals/InpaintModal';
import { CanvasSizeModal } from '@/features/image-editor/components/modals/CanvasSizeModal';
import { ImageSizeModal } from '@/features/image-editor/components/modals/ImageSizeModal';
import { ExportAsModal, ExportAsSettings } from '@/features/image-editor/components/modals/ExportAsModal';
import { TitleBar } from '@/app/layout/TitleBar';
import { ConfirmDialog } from '@/shared/components/ui/Modal';
import { PresetCreatorModal } from '@/features/tools/components/PresetCreatorModal';
import { EditorChatPanel } from '@/features/image-editor/components/Chat/EditorChatPanel';
import { downloadCmykTiff } from '@/features/image-editor/canvas/cmykExport';
import { exportAsWebP, exportAsRgbTiff, exportAsBmp, downloadBlob, downloadBytes } from '@/features/image-editor/canvas/formatExport';
import { useUIStore } from '@/shared/stores/ui.store';
import { downloadAsset, invalidateAssetCache } from '@/shared/api/asset.api';
import { uploadImage, replaceAssetFile } from '@/shared/api/image.api';
import { exportAsPsd } from '@/features/image-editor/psd/exportPsd';
import { toast } from '@/shared/lib/toast';
import { openImageFile } from '@/features/image-editor/lib/openImageFile';
import { jsPDF } from 'jspdf';
import { useImageEditorLayerShortcuts } from '@/features/image-editor/hooks/useImageEditorLayerShortcuts';

/**
 * Outer wrapper — provides the active tab's store via React context so that
 * all editor components read from the correct per-tab store instance.
 */
export const ImageEditorPage = memo(function ImageEditorPage() {
  const activeTabId = useEditorTabsStore((s) => s.activeTabId);

  const activeStore = useMemo(
    () => (activeTabId ? getOrCreateStore(activeTabId) : null),
    [activeTabId],
  );

  if (!activeStore) return null;

  return (
    <ImageEditorStoreProvider store={activeStore}>
      <ImageEditorPageInner />
    </ImageEditorStoreProvider>
  );
});

const ImageEditorPageInner = memo(function ImageEditorPageInner() {
  const {
    sourceAsset,
    canUndo,
    canRedo,
    undo,
    redo,
    rotation,
    flipHorizontal,
    flipVertical,
    resetAllTransforms,
    setProcessing,
    isDirty,
    clearDirty,
    editMode,
    setEditMode,
    setActiveTool,
    brushSettings,
    setBrushSettings,
    zoomIn,
    zoomOut,
    toggleLayersPanel,
    toggleImageInfoPanel,
    layers,
    textLayers,
    clearSelection,
    invertSelection,
    isCanvasReady,
    resetDefaultColors,
    swapColors,
    selectionTool,
    setSelectionTool,
    activeTool,
    navigationTool,
    setNavigationTool,
    lastUsedToolPerGroup,
    setLastUsedToolForGroup,
    zoomToFit,
    zoomTo100,
  } = useImageEditorStore();

  const { activeTabId, closeTab, hideEditor, openTabWithLayers } = useEditorTabsStore();
  const { t } = useTranslation('common');

  // Photoshop-style layer shortcuts (Ctrl+J, Ctrl+E, ...) — only active
  // while the image editor page is mounted.
  useImageEditorLayerShortcuts();

  // Sync isDirty between imageEditor store and editorTabs store
  useEffect(() => {
    const cleanup = setupEditorTabsSync();
    return cleanup;
  }, []);

  // Pending tool mode from ToolsPage
  const pendingToolMode = useUIStore((s) => s.pendingToolMode);
  const clearPendingToolMode = useUIStore((s) => s.clearPendingToolMode);

  // Refs
  const canvasRef = useRef<EditorCanvasHandle>(null);

  // Modal states
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showSaveFormatModal, setShowSaveFormatModal] = useState(false);
  const [showSaveConfirmModal, setShowSaveConfirmModal] = useState(false);
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [showImageInfoModal, setShowImageInfoModal] = useState(false);
  const [showFilterGalleryModal, setShowFilterGalleryModal] = useState(false);
  const [filterGallerySource, setFilterGallerySource] = useState<HTMLCanvasElement | null>(null);
  const [showCloseConfirmModal, setShowCloseConfirmModal] = useState(false);
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null);
  const [showLocalBackConfirm, setShowLocalBackConfirm] = useState(false);
  const [currentDimensions, setCurrentDimensions] = useState<{ width: number; height: number } | undefined>();
  const [clipboardImageSize, setClipboardImageSize] = useState<{ width: number; height: number } | null>(null);
  // Preset creator modal state (opened from EditorMenuBar Presets menu)
  const [presetMode, setPresetMode] = useState<string | null>(null);
  // Callback to run after save completes (used by "Save and Close")
  const onAfterSaveRef = useRef<(() => void) | null>(null);
  // Store the save name and destination chosen in SaveFormatModal for use by handleSaveConfirmed
  const pendingSaveNameRef = useRef<string>('');
  const pendingSaveDestRef = useRef<'local' | 'cloud'>('cloud');

  // Auto-activate pending tool mode when editor opens with an asset
  useEffect(() => {
    if (pendingToolMode && pendingToolMode.category === 'image' && pendingToolMode.mode && sourceAsset) {
      const timer = setTimeout(() => {
        setEditMode(pendingToolMode.mode as typeof editMode);
        clearPendingToolMode();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [pendingToolMode, sourceAsset, setEditMode, clearPendingToolMode, editMode]);

  // Sync current canvas dimensions whenever the Export As modal opens so the
  // preview ("Output: WxH px") reflects the live canvas size.
  useEffect(() => {
    if (editMode !== 'export') return;
    const canvas = canvasRef.current?.getCanvas();
    if (canvas) {
      setCurrentDimensions({ width: canvas.width, height: canvas.height });
    }
  }, [editMode]);

  // Handle back navigation (go to gallery, keep tabs alive)
  const handleBack = useCallback(() => {
    const isLocalAsset = sourceAsset?.id?.startsWith('local-');
    if (isLocalAsset) {
      setShowLocalBackConfirm(true);
      return;
    }
    hideEditor();
  }, [hideEditor, sourceAsset]);

  // Handle new project - open modal and detect clipboard image size
  const handleNew = useCallback(async () => {
    let detectedSize: { width: number; height: number } | null = null;

    // Try to read clipboard image size
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageTypes = item.types.filter(type => type.startsWith('image/'));
        if (imageTypes.length > 0) {
          const blob = await item.getType(imageTypes[0]);
          const img = new Image();
          img.onload = () => {
            detectedSize = { width: img.naturalWidth, height: img.naturalHeight };
            setClipboardImageSize(detectedSize);
            setShowNewProjectModal(true);
          };
          img.onerror = () => {
            setClipboardImageSize(null);
            setShowNewProjectModal(true);
          };
          img.src = URL.createObjectURL(blob);
          return; // Exit early, we'll set the modal in the onload callback
        }
      }
    } catch (error) {
      console.error('Failed to read clipboard:', error);
    }

    // If no image found or error occurred, just open modal
    setClipboardImageSize(null);
    setShowNewProjectModal(true);
  }, []);

  // Handle create project from modal
  const handleCreateProject = useCallback((name: string, width: number, height: number, bgColor: string | null) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    if (bgColor) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);
      }
    }
    const dataUrl = canvas.toDataURL('image/png');
    const layer = {
      id: Math.random().toString(36).substring(2, 10),
      name: 'Background',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'normal' as const,
      imageData: dataUrl,
      x: 0,
      y: 0,
      width,
      height,
    };
    const newAsset = {
      id: `local-${Date.now()}`, userId: '', name, storagePath: '',
      currentVersion: 1, assetType: 'IMAGE' as const, mimeType: 'application/x-photoshop',
      sizeBytes: 0, isPublic: false, previewUrl: dataUrl,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    openTabWithLayers(newAsset, [layer], dataUrl, width, height);
  }, [openTabWithLayers]);

  // Paste image from clipboard as a new layer
  const pasteImageFromClipboard = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageTypes = item.types.filter(type => type.startsWith('image/'));
        if (imageTypes.length > 0) {
          const blob = await item.getType(imageTypes[0]);
          const dataUrl = await blobToDataUrl(blob);

          const state = useImageEditorStore.getState();
          const layerId = state.addLayer(dataUrl, `Pasted Layer ${state.layers.length + 1}`);
          state.setActiveLayer(layerId);

          toast.success('Image pasted from clipboard');
          return;
        }
      }
      toast.error('No image found in clipboard');
    } catch (error) {
      console.error('Paste error:', error);
      toast.error('Failed to paste from clipboard');
    }
  }, []);

  // Helper function to convert blob to data URL
  const blobToDataUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Process file data after opening (shared between Electron and browser paths)
  const processOpenedFile = useCallback(async (fileData: ArrayBuffer, fileName: string) => {
    await openImageFile(fileData, fileName);
  }, []);

  // Handle open file (PSD or image)
  const handleOpen = useCallback(async () => {
    if (window.electronAPI?.files) {
      try {
        const filePath = await window.electronAPI.files.selectFile({
          filters: [
            { name: 'All Supported', extensions: ['psd', 'png', 'jpg', 'jpeg', 'webp'] },
            { name: 'Photoshop', extensions: ['psd'] },
            { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
          ],
        });
        if (!filePath) return;

        const fileData = await window.electronAPI.files.readFile(filePath);
        if (!fileData) {
          toast.error('Failed to read file');
          return;
        }

        const fileName = filePath.split(/[/\\]/).pop() || 'file';
        await processOpenedFile(fileData, fileName);
      } catch (error) {
        console.error('Open error:', error);
        toast.error('Failed to open file');
      }
    } else {
      // Fallback: browser file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.psd,.png,.jpg,.jpeg,.webp';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const fileData = await file.arrayBuffer();
          await processOpenedFile(fileData, file.name);
        } catch (error) {
          console.error('Open error:', error);
          toast.error('Failed to open file');
        }
      };
      input.click();
    }
  }, [processOpenedFile]);

  // Create final canvas with all transforms applied
  const createFinalCanvas = useCallback((): HTMLCanvasElement | null => {
    const canvas = canvasRef.current?.getCanvas();
    if (!canvas) return null;

    const hasTransforms = rotation !== 0 || flipHorizontal || flipVertical;

    if (!hasTransforms) {
      return canvas;
    }

    // Create a new canvas with transforms baked in
    const finalCanvas = document.createElement('canvas');
    const ctx = finalCanvas.getContext('2d');
    if (!ctx) return null;

    // Calculate dimensions for rotated canvas
    const radians = (rotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(radians));
    const cos = Math.abs(Math.cos(radians));
    const newWidth = Math.round(canvas.width * cos + canvas.height * sin);
    const newHeight = Math.round(canvas.width * sin + canvas.height * cos);

    finalCanvas.width = newWidth;
    finalCanvas.height = newHeight;

    // Apply transforms
    ctx.translate(newWidth / 2, newHeight / 2);
    ctx.rotate(radians);
    ctx.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

    return finalCanvas;
  }, [rotation, flipHorizontal, flipVertical]);

  // Handle save click - show format choice modal
  const handleSaveClick = useCallback(() => {
    if (!sourceAsset) return;
    setShowSaveFormatModal(true);
  }, [sourceAsset]);

  // Handle save as PSD
  const handleSavePsd = useCallback(async (destination: SaveDestination, name: string) => {
    setShowSaveFormatModal(false);
    if (!sourceAsset) return;

    setProcessing(true, 'Exporting PSD...');
    try {
      const compositeCanvas = createFinalCanvas();
      const cw = compositeCanvas?.width ?? 1920;
      const ch = compositeCanvas?.height ?? 1080;
      const blob = await exportAsPsd(layers, cw, ch, compositeCanvas, textLayers);
      const fileName = name.replace(/\.[^/.]+$/, '') + '.psd';

      if (destination === 'local') {
        if (window.electronAPI?.files) {
          const savePath = await window.electronAPI.files.saveFile({
            defaultPath: fileName,
            filters: [{ name: 'Photoshop Document', extensions: ['psd'] }],
          });
          if (savePath) {
            const arrayBuffer = await blob.arrayBuffer();
            await window.electronAPI.files.writeFile(savePath, arrayBuffer);
            clearDirty();
            const savedName = savePath.split(/[/\\]/).pop() || fileName;
            toast.success(`Saved: ${savedName}`);
          }
        } else {
          downloadBlob(blob, fileName);
          clearDirty();
          toast.success(`Downloaded: ${fileName}`);
        }
      } else {
        // Cloud upload
        const file = new File([blob], fileName, { type: 'application/octet-stream' });
        const result = await uploadImage(file);
        if (result) {
          clearDirty();
          toast.success('PSD uploaded to library');
        } else {
          throw new Error('Upload failed');
        }
      }
    } catch (error) {
      console.error('PSD save error:', error);
      toast.error('Failed to save PSD');
    } finally {
      setProcessing(false);
      if (onAfterSaveRef.current) {
        onAfterSaveRef.current();
        onAfterSaveRef.current = null;
      }
    }
  }, [sourceAsset, layers, createFinalCanvas, setProcessing, clearDirty, textLayers]);

  // Handle local image save with file dialog
  const handleSaveImageLocal = useCallback(async (name: string) => {
    if (!sourceAsset) return;

    const canvas = createFinalCanvas();
    if (!canvas) {
      toast.error('Failed to get canvas data');
      return;
    }

    setProcessing(true, 'Saving...');
    try {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/png', 1);
      });
      if (!blob) throw new Error('Failed to create image blob');

      const saveName = (name || sourceAsset.name).replace(/\.[^/.]+$/, '') + '.png';

      if (window.electronAPI?.files) {
        const savePath = await window.electronAPI.files.saveFile({
          defaultPath: saveName,
          filters: [{ name: 'PNG Image', extensions: ['png'] }],
        });
        if (savePath) {
          const arrayBuffer = await blob.arrayBuffer();
          await window.electronAPI.files.writeFile(savePath, arrayBuffer);
          clearDirty();
          const fileName = savePath.split(/[/\\]/).pop() || saveName;
          toast.success(`Saved: ${fileName}`);
        }
      } else {
        downloadBlob(blob, saveName);
        clearDirty();
        toast.success(`Downloaded: ${saveName}`);
      }
    } catch (error) {
      console.error('Local save error:', error);
      toast.error('Failed to save image');
    } finally {
      setProcessing(false);
      if (onAfterSaveRef.current) {
        onAfterSaveRef.current();
        onAfterSaveRef.current = null;
      }
    }
  }, [sourceAsset, createFinalCanvas, setProcessing, clearDirty]);

  // Handle "Image" choice from SaveFormatModal
  const handleSaveImageChoice = useCallback((destination: 'local' | 'cloud', name: string) => {
    pendingSaveNameRef.current = name;
    pendingSaveDestRef.current = destination;
    setShowSaveFormatModal(false);
    if (destination === 'local') {
      // Local save: go directly to save (no overwrite confirmation needed)
      handleSaveImageLocal(name);
    } else {
      // Cloud save: show overwrite confirmation
      setShowSaveConfirmModal(true);
    }
  }, [handleSaveImageLocal]);

  // Handle confirmed save - replace existing asset file
  const handleSaveConfirmed = useCallback(async () => {
    setShowSaveConfirmModal(false);
    if (!sourceAsset) return;

    const canvas = createFinalCanvas();
    if (!canvas) {
      toast.error('Failed to get canvas data');
      return;
    }

    setProcessing(true, 'Saving...');

    try {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/png', 1);
      });

      if (!blob) {
        throw new Error('Failed to create image blob');
      }

      const saveName = pendingSaveNameRef.current || sourceAsset.name;
      const file = new File([blob], saveName, { type: 'image/png' });
      const result = await replaceAssetFile(sourceAsset.id, file);

      if (result) {
        await invalidateAssetCache(sourceAsset.id);
        clearDirty();
        toast.success('Image saved successfully');
      } else {
        throw new Error('Save failed');
      }
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save image');
    } finally {
      setProcessing(false);
      if (onAfterSaveRef.current) {
        onAfterSaveRef.current();
        onAfterSaveRef.current = null;
      }
    }
  }, [sourceAsset, createFinalCanvas, setProcessing, clearDirty]);

  // Handle save as
  const handleSaveAs = useCallback(async (
    format: SaveFormat,
    quality: number,
    destination: SaveAsDestination,
    name: string,
  ) => {
    if (!sourceAsset) return;

    setShowSaveAsModal(false);

    const baseName = (name.trim() || sourceAsset.name.replace(/\.[^/.]+$/, '') || 'image').replace(/\.[^/.]+$/, '');
    const ext = format;
    const outputFileName = `${baseName}.${ext}`;

    // PSD export path
    if (format === 'psd') {
      setProcessing(true, destination === 'cloud' ? 'Uploading PSD...' : 'Exporting PSD...');
      try {
        const compositeCanvas = createFinalCanvas();
        const cw = compositeCanvas?.width ?? 1920;
        const ch = compositeCanvas?.height ?? 1080;
        const blob = await exportAsPsd(layers, cw, ch, compositeCanvas, textLayers);

        if (destination === 'cloud') {
          const file = new File([blob], outputFileName, { type: 'application/octet-stream' });
          const result = await uploadImage(file);
          if (result) {
            toast.success('PSD uploaded to library');
          } else {
            throw new Error('Upload failed');
          }
        } else if (window.electronAPI?.files) {
          const savePath = await window.electronAPI.files.saveFile({
            defaultPath: outputFileName,
            filters: [{ name: 'Photoshop Document', extensions: ['psd'] }],
          });
          if (savePath) {
            const arrayBuffer = await blob.arrayBuffer();
            await window.electronAPI.files.writeFile(savePath, arrayBuffer);
            const savedName = savePath.split(/[/\\]/).pop() || outputFileName;
            toast.success(`Saved: ${savedName}`);
          }
        } else {
          downloadBlob(blob, outputFileName);
          toast.success(`Downloaded: ${outputFileName}`);
        }
      } catch (error) {
        console.error('PSD save-as error:', error);
        toast.error(destination === 'cloud' ? 'Failed to upload PSD' : 'Failed to export PSD');
      } finally {
        setProcessing(false);
      }
      return;
    }

    const canvas = createFinalCanvas();
    if (!canvas) {
      toast.error('Failed to get canvas data');
      return;
    }

    setProcessing(true, destination === 'cloud' ? 'Uploading...' : 'Exporting...');

    try {
      let blob: Blob | null = null;

      // First check if canvas is accessible (not tainted)
      let imgData: string;
      try {
        imgData = canvas.toDataURL('image/png', 1.0);
      } catch (canvasError) {
        console.error('Canvas security error:', canvasError);
        toast.error('Cannot export: Image security restriction');
        setProcessing(false);
        return;
      }

      if (format === 'pdf') {
        try {
          const orientation = canvas.width > canvas.height ? 'landscape' : 'portrait';
          const pdf = new jsPDF({
            orientation,
            unit: 'px',
            format: [canvas.width, canvas.height],
          });
          pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
          const arrayBuffer = pdf.output('arraybuffer');
          blob = new Blob([arrayBuffer], { type: 'application/pdf' });
        } catch (pdfError) {
          console.error('PDF generation error:', pdfError);
          toast.error(`PDF failed: ${pdfError instanceof Error ? pdfError.message : 'Unknown error'}`);
          setProcessing(false);
          return;
        }
      } else {
        const mimeType = `image/${format}`;
        blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), mimeType, quality);
        });
      }

      if (!blob) {
        throw new Error('Failed to create file');
      }

      if (destination === 'cloud') {
        const mime = format === 'pdf' ? 'application/pdf' : `image/${format}`;
        const file = new File([blob], outputFileName, { type: mime });
        const result = await uploadImage(file);
        if (result) {
          toast.success(`Uploaded: ${outputFileName}`);
        } else {
          throw new Error('Upload failed');
        }
      } else if (window.electronAPI?.files) {
        const savePath = await window.electronAPI.files.saveFile({
          defaultPath: outputFileName,
          filters: [
            {
              name: format === 'pdf' ? 'PDF Document' : 'Images',
              extensions: [ext],
            },
          ],
        });

        if (savePath) {
          const arrayBuffer = await blob.arrayBuffer();
          await window.electronAPI.files.writeFile(savePath, arrayBuffer);
          const savedFileName = savePath.split(/[/\\]/).pop() || outputFileName;
          toast.success(`Saved: ${savedFileName}`);
        }
      } else {
        downloadBlob(blob, outputFileName);
        toast.success(`Downloaded: ${outputFileName}`);
      }
    } catch (error) {
      console.error('Save as error:', error);
      toast.error(destination === 'cloud' ? 'Failed to upload image' : 'Failed to export image');
    } finally {
      setProcessing(false);
    }
  }, [sourceAsset, layers, createFinalCanvas, setProcessing, textLayers]);

  // Handle download original
  const handleDownloadOriginal = useCallback(async () => {
    if (!sourceAsset) return;

    setProcessing(true, 'Downloading...');
    try {
      const result = await downloadAsset(sourceAsset);
      if (result) {
        toast.success('Downloaded successfully');
      } else {
        throw new Error('Download failed');
      }
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download');
    } finally {
      setProcessing(false);
    }
  }, [sourceAsset, setProcessing]);

  // Handle copy to clipboard
  const handleCopyToClipboard = useCallback(async () => {
    const canvas = createFinalCanvas();
    if (!canvas) {
      toast.error('Failed to get canvas data');
      return;
    }

    try {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/png', 1);
      });

      if (blob) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        toast.success('Copied to clipboard');
      }
    } catch (error) {
      console.error('Copy error:', error);
      toast.error('Failed to copy to clipboard');
    }
  }, [createFinalCanvas]);

  // Export CMYK TIFF
  const handleExportCmykTiff = useCallback(() => {
    const canvas = createFinalCanvas();
    if (!canvas) {
      toast.error('Failed to get canvas data');
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const filename = sourceAsset?.name?.replace(/\.[^.]+$/, '') || 'export';
    downloadCmykTiff(imageData, `${filename}-cmyk.tif`, 300);
    toast.success('CMYK TIFF exported');
  }, [createFinalCanvas, sourceAsset]);

  // Export WebP
  const handleExportWebP = useCallback(async () => {
    const canvas = createFinalCanvas();
    if (!canvas) {
      toast.error('Failed to get canvas data');
      return;
    }
    const filename = sourceAsset?.name?.replace(/\.[^.]+$/, '') || 'export';
    try {
      const blob = await exportAsWebP(canvas, 0.9);
      if (window.electronAPI?.files) {
        const savePath = await window.electronAPI.files.saveFile({
          defaultPath: `${filename}.webp`,
          filters: [{ name: 'WebP Image', extensions: ['webp'] }],
        });
        if (savePath) {
          const arrayBuffer = await blob.arrayBuffer();
          await window.electronAPI.files.writeFile(savePath, arrayBuffer);
          toast.success('WebP exported');
        }
      } else {
        downloadBlob(blob, `${filename}.webp`);
        toast.success('WebP exported');
      }
    } catch (error) {
      console.error('WebP export error:', error);
      toast.error('Failed to export WebP');
    }
  }, [createFinalCanvas, sourceAsset]);

  // Export RGB TIFF
  const handleExportRgbTiff = useCallback(() => {
    const canvas = createFinalCanvas();
    if (!canvas) {
      toast.error('Failed to get canvas data');
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const filename = sourceAsset?.name?.replace(/\.[^.]+$/, '') || 'export';
    const tiffBytes = exportAsRgbTiff(imageData, 72);
    if (window.electronAPI?.files) {
      (async () => {
        const savePath = await window.electronAPI!.files!.saveFile({
          defaultPath: `${filename}-rgb.tif`,
          filters: [{ name: 'TIFF Image', extensions: ['tif', 'tiff'] }],
        });
        if (savePath) {
          await window.electronAPI!.files!.writeFile(savePath, tiffBytes.buffer as ArrayBuffer);
          toast.success('RGB TIFF exported');
        }
      })();
    } else {
      downloadBytes(tiffBytes, `${filename}-rgb.tif`, 'image/tiff');
      toast.success('RGB TIFF exported');
    }
  }, [createFinalCanvas, sourceAsset]);

  // Export BMP
  const handleExportBmp = useCallback(() => {
    const canvas = createFinalCanvas();
    if (!canvas) {
      toast.error('Failed to get canvas data');
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const filename = sourceAsset?.name?.replace(/\.[^.]+$/, '') || 'export';
    const bmpBytes = exportAsBmp(imageData);
    if (window.electronAPI?.files) {
      (async () => {
        const savePath = await window.electronAPI!.files!.saveFile({
          defaultPath: `${filename}.bmp`,
          filters: [{ name: 'Bitmap Image', extensions: ['bmp'] }],
        });
        if (savePath) {
          await window.electronAPI!.files!.writeFile(savePath, bmpBytes.buffer as ArrayBuffer);
          toast.success('BMP exported');
        }
      })();
    } else {
      downloadBytes(bmpBytes, `${filename}.bmp`, 'image/bmp');
      toast.success('BMP exported');
    }
  }, [createFinalCanvas, sourceAsset]);

  // Handle "Export As..." with format/quality/scale options
  const handleExportAs = useCallback(async (settings: ExportAsSettings) => {
    const canvas = createFinalCanvas();
    if (!canvas) {
      toast.error('Failed to get canvas data');
      return;
    }

    // Apply scale into an off-screen canvas if needed
    let outCanvas: HTMLCanvasElement = canvas;
    if (settings.scale !== 1) {
      const w = Math.max(1, Math.round(canvas.width * settings.scale));
      const h = Math.max(1, Math.round(canvas.height * settings.scale));
      const tmp = document.createElement('canvas');
      tmp.width = w;
      tmp.height = h;
      const tctx = tmp.getContext('2d');
      if (!tctx) {
        toast.error('Failed to scale canvas');
        return;
      }
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = 'high';
      tctx.drawImage(canvas, 0, 0, w, h);
      outCanvas = tmp;
    }

    const ext = settings.format === 'jpeg' ? 'jpg' : settings.format;
    const outputFileName = `${settings.fileName}.${ext}`;

    setProcessing(true, 'Exporting...');
    try {
      let bytes: ArrayBuffer | null = null;
      let mimeType = `image/${settings.format}`;

      if (settings.format === 'pdf') {
        const orientation = outCanvas.width > outCanvas.height ? 'landscape' : 'portrait';
        const pdf = new jsPDF({ orientation, unit: 'px', format: [outCanvas.width, outCanvas.height] });
        const imgData = outCanvas.toDataURL('image/png', 1.0);
        pdf.addImage(imgData, 'PNG', 0, 0, outCanvas.width, outCanvas.height);
        bytes = pdf.output('arraybuffer');
        mimeType = 'application/pdf';
      } else if (settings.format === 'tiff') {
        const ctx = outCanvas.getContext('2d');
        if (!ctx) throw new Error('No 2d context');
        const imgData = ctx.getImageData(0, 0, outCanvas.width, outCanvas.height);
        const tiffBytes = exportAsRgbTiff(imgData, 72);
        bytes = tiffBytes.buffer.slice(tiffBytes.byteOffset, tiffBytes.byteOffset + tiffBytes.byteLength) as ArrayBuffer;
        mimeType = 'image/tiff';
      } else if (settings.format === 'bmp') {
        const ctx = outCanvas.getContext('2d');
        if (!ctx) throw new Error('No 2d context');
        const imgData = ctx.getImageData(0, 0, outCanvas.width, outCanvas.height);
        const bmpBytes = exportAsBmp(imgData);
        bytes = bmpBytes.buffer.slice(bmpBytes.byteOffset, bmpBytes.byteOffset + bmpBytes.byteLength) as ArrayBuffer;
        mimeType = 'image/bmp';
      } else if (settings.format === 'webp') {
        const blob = await exportAsWebP(outCanvas, settings.quality);
        bytes = await blob.arrayBuffer();
        mimeType = 'image/webp';
      } else {
        const blob = await new Promise<Blob | null>((resolve) => {
          outCanvas.toBlob((b) => resolve(b), mimeType, settings.quality);
        });
        if (!blob) throw new Error('Failed to encode image');
        bytes = await blob.arrayBuffer();
      }

      if (!bytes) throw new Error('Failed to create file');

      if (window.electronAPI?.files) {
        const savePath = await window.electronAPI.files.saveFile({
          defaultPath: outputFileName,
          filters: [
            { name: settings.format.toUpperCase(), extensions: [ext] },
          ],
        });
        if (savePath) {
          await window.electronAPI.files.writeFile(savePath, bytes);
          const savedName = savePath.split(/[/\\]/).pop() || outputFileName;
          toast.success(`Exported: ${savedName}`);
        }
      } else {
        const blob = new Blob([bytes], { type: mimeType });
        downloadBlob(blob, outputFileName);
        toast.success(`Exported: ${outputFileName}`);
      }
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export image');
    } finally {
      setProcessing(false);
      setEditMode('none');
    }
  }, [createFinalCanvas, setProcessing, setEditMode]);

  // Handle reset all changes
  const handleResetChanges = useCallback(() => {
    resetAllTransforms();
    toast.success('All changes reset');
  }, [resetAllTransforms]);

  // Handle show image info
  const handleShowInfo = useCallback(() => {
    const canvas = canvasRef.current?.getCanvas();
    if (canvas) {
      setCurrentDimensions({ width: canvas.width, height: canvas.height });
    }
    setShowImageInfoModal(true);
  }, []);

  // Close tab handler for menu bar
  const handleCloseTab = useCallback(() => {
    if (activeTabId) {
      if (isDirty) {
        setPendingCloseTabId(activeTabId);
        setShowCloseConfirmModal(true);
      } else {
        closeTab(activeTabId);
      }
    }
  }, [activeTabId, isDirty, closeTab]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape: prioritize closing menus/modes before closing editor
      if (e.key === 'Escape') {
        // If any modal is open, let the modal handle Escape
        if (showNewProjectModal || showSaveFormatModal || showSaveConfirmModal || showSaveAsModal || showImageInfoModal || showCloseConfirmModal || showLocalBackConfirm || presetMode) {
          return;
        }
        // If in an edit mode (not 'none'), reset to 'none' first
        if (editMode !== 'none') {
          setEditMode('none');
          return;
        }
        // Only close editor if no mode is active
        handleBack();
        return;
      }

      // While typing in an input/textarea/contenteditable (e.g. file-name field
      // inside Save / Export / Canvas Size modals), never hijack the keystroke —
      // bail before any preventDefault below so normal text editing (incl. IME
      // composition, Ctrl+A/V/Z, etc.) works.
      const target = e.target as HTMLElement | null;
      if (
        target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        )
      ) {
        return;
      }

      // Enter: apply crop when in crop mode
      if (e.key === 'Enter' && editMode === 'crop') {
        e.preventDefault();
        useImageEditorStore.getState().applyCrop();
        return;
      }

      // Ctrl/Cmd + Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo()) undo();
        return;
      }

      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y for redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        if (canRedo()) redo();
        return;
      }

      // Ctrl/Cmd + W for close tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) {
          if (isDirty) {
            setPendingCloseTabId(activeTabId);
            setShowCloseConfirmModal(true);
          } else {
            closeTab(activeTabId);
          }
        }
        return;
      }

      // Ctrl/Cmd + N for new
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleNew();
        return;
      }

      // Ctrl/Cmd + V for paste image from clipboard
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        pasteImageFromClipboard();
        return;
      }

      // Ctrl/Cmd + O for open
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        handleOpen();
        return;
      }

      // Ctrl/Cmd + Shift + S for save as (must check before plain Ctrl+S)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        setShowSaveAsModal(true);
        return;
      }

      // Ctrl/Cmd + S for save
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 's') {
        e.preventDefault();
        handleSaveClick();
        return;
      }

      // Ctrl/Cmd + T for free transform (Photoshop standard)
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        setEditMode('freeTransform');
        return;
      }

      // Ctrl/Cmd + = for zoom in
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomIn();
        return;
      }

      // Ctrl/Cmd + - for zoom out
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        zoomOut();
        return;
      }

      // Ctrl/Cmd + 0 for fit to view (Photoshop standard)
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        e.stopImmediatePropagation(); // Prevent global nav shortcut
        zoomToFit();
        return;
      }

      // Ctrl/Cmd + 1 for 100% zoom (Photoshop standard)
      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        e.stopImmediatePropagation(); // Prevent global nav shortcut
        zoomTo100();
        return;
      }

      // Ctrl/Cmd + D for deselect
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        clearSelection();
        return;
      }

      // Ctrl/Cmd + A for select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        const state = useImageEditorStore.getState();
        const { layers, activeLayerId } = state;
        const layer = layers.find(l => l.id === activeLayerId);
        if (layer) {
          const w = layer.width || 0;
          const h = layer.height || 0;
          if (w > 0 && h > 0) {
            state.setSelection({
              bounds: { x: 0, y: 0, width: w, height: h },
              maskDataUrl: '',
              feather: 0,
              isInverted: false,
            });
          }
        }
        return;
      }

      // Ctrl/Cmd + Shift + I for invert selection
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        invertSelection();
        return;
      }

      // F-key shortcuts (no modifier needed)
      if (e.key === 'F7') {
        e.preventDefault();
        toggleLayersPanel();
        return;
      }
      if (e.key === 'F8') {
        e.preventDefault();
        toggleImageInfoPanel();
        return;
      }

      // --- Single-key tool shortcuts (Photoshop-style) ---
      // Skip if modifier keys held. (Input-target guard handled at top.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();

      // Brush size shortcuts
      if (key === '[') {
        e.preventDefault();
        setBrushSettings({ size: Math.max(1, brushSettings.size - 5) });
        return;
      }
      if (key === ']') {
        e.preventDefault();
        setBrushSettings({ size: Math.min(500, brushSettings.size + 5) });
        return;
      }

      // D = Reset default colors (Photoshop standard: black foreground, white background)
      if (key === 'd') {
        e.preventDefault();
        resetDefaultColors();
        return;
      }

      // X = Swap foreground/background colors (Photoshop standard)
      if (key === 'x') {
        e.preventDefault();
        swapColors();
        return;
      }

      // Photoshop-standard tool shortcuts with group cycling
      // Single-tool shortcuts
      const singleShortcuts: Record<string, { editMode?: string; navigationTool?: 'hand' | 'zoom' }> = {
        v: { editMode: 'move' },
        c: { editMode: 'crop' },
        p: { editMode: 'pen' },
        t: { editMode: 'text' },
        u: { editMode: 'shape' },
        h: { navigationTool: 'hand' },
        z: { navigationTool: 'zoom' },
      };

      const single = singleShortcuts[key];
      if (single) {
        e.preventDefault();
        if (single.navigationTool) {
          setNavigationTool(single.navigationTool);
        } else {
          setNavigationTool('none');
          if (single.editMode) setEditMode(single.editMode as typeof editMode);
        }
        return;
      }

      // Group-cycling shortcuts: repeated press cycles through group items
      const group = SHORTCUT_TO_GROUP[key];
      if (group) {
        e.preventDefault();
        const items = group.items;
        const lastUsed = lastUsedToolPerGroup[group.groupId] || items[0].id;

        // Check if already in this group to determine cycling
        const isInGroup = items.some((item) => {
          const a = item.action;
          if (a.type === 'drawTool') return editMode === 'drawing' && activeTool === a.tool;
          if (a.type === 'selectionTool') return editMode === 'selection' && selectionTool === a.tool;
          if (a.type === 'editMode') return editMode === a.mode;
          if (a.type === 'navigationTool') return navigationTool === a.tool;
          return false;
        });

        let targetItem: typeof items[0];
        if (isInGroup && items.length > 1) {
          // Cycle to next item in group
          const currentIdx = items.findIndex((item) => {
            const a = item.action;
            if (a.type === 'drawTool') return activeTool === a.tool;
            if (a.type === 'selectionTool') return selectionTool === a.tool;
            if (a.type === 'editMode') return editMode === a.mode;
            if (a.type === 'navigationTool') return navigationTool === a.tool;
            return false;
          });
          const nextIdx = (currentIdx + 1) % items.length;
          targetItem = items[nextIdx];
        } else {
          // Activate last-used item in group
          targetItem = items.find((i) => i.id === lastUsed) || items[0];
        }

        setLastUsedToolForGroup(group.groupId, targetItem.id);
        const action = targetItem.action;
        if (action.type === 'navigationTool') {
          setNavigationTool(action.tool);
        } else {
          setNavigationTool('none');
          if (action.type === 'drawTool') {
            setEditMode('drawing');
            setActiveTool(action.tool as Parameters<typeof setActiveTool>[0]);
          } else if (action.type === 'selectionTool') {
            setSelectionTool(action.tool as Parameters<typeof setSelectionTool>[0]);
            setEditMode('selection');
          } else if (action.type === 'editMode') {
            setEditMode(action.mode as typeof editMode);
          }
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBack, handleNew, handleOpen, handleSaveClick, canUndo, canRedo, undo, redo, editMode, setEditMode, setActiveTool, activeTool, selectionTool, setSelectionTool, navigationTool, setNavigationTool, lastUsedToolPerGroup, setLastUsedToolForGroup, brushSettings.size, setBrushSettings, zoomIn, zoomOut, zoomToFit, zoomTo100, toggleLayersPanel, toggleImageInfoPanel, clearSelection, invertSelection, resetDefaultColors, swapColors, showNewProjectModal, showSaveFormatModal, showSaveConfirmModal, showSaveAsModal, showImageInfoModal, showCloseConfirmModal, showLocalBackConfirm, presetMode, pasteImageFromClipboard, activeTabId, closeTab, isDirty]);

  if (!sourceAsset) {
    return (
      <div className="h-screen flex flex-col bg-zinc-900 overflow-hidden">
        <TitleBar />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-500">No image selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-950 overflow-hidden">
      <TitleBar
        hideNav
        leftContent={
          <EditorMenuBar
            onNew={handleNew}
            onOpen={handleOpen}
            onSave={handleSaveClick}
            onSaveAs={() => setShowSaveAsModal(true)}
            onDownloadOriginal={handleDownloadOriginal}
            onCopyToClipboard={handleCopyToClipboard}
            onExportCmykTiff={handleExportCmykTiff}
            onExportWebP={handleExportWebP}
            onExportRgbTiff={handleExportRgbTiff}
            onExportBmp={handleExportBmp}
            onResetChanges={handleResetChanges}
            onShowInfo={handleShowInfo}
            onCloseTab={handleCloseTab}
            onBackToGallery={handleBack}
            onOpenPreset={setPresetMode}
            onOpenFilterGallery={() => {
              // Prefer the active raster layer; fall back to the composite canvas.
              const state = useImageEditorStore.getState();
              const activeLayer = state.layers.find((l) => l.id === state.activeLayerId && !!l.imageData)
                ?? state.layers.find((l) => !!l.imageData);
              if (activeLayer?.imageData) {
                const img = new Image();
                img.onload = () => {
                  const c = document.createElement('canvas');
                  c.width = img.naturalWidth;
                  c.height = img.naturalHeight;
                  const ctx = c.getContext('2d');
                  if (ctx) ctx.drawImage(img, 0, 0);
                  setFilterGallerySource(c);
                  setShowFilterGalleryModal(true);
                };
                img.src = activeLayer.imageData;
              } else {
                const composite = canvasRef.current?.getCanvas() ?? null;
                setFilterGallerySource(composite);
                setShowFilterGalleryModal(true);
              }
            }}
          />
        }
      />
      {/* Tab bar */}
      <EditorTabBar />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Tool Panel */}
        <ToolPanel />

        {/* Center: Options Bar + Canvas + Bottom Bar */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Options Bar */}
          <OptionsBar />

          {/* Canvas area */}
          <div className="flex-1 relative overflow-hidden">
            <EditorCanvas ref={canvasRef} />
            {/* Floating AI panel (renders over canvas when AI mode is active) */}
            <FloatingAIPanel />
            {/* Canvas loading overlay — prevents flash of empty canvas */}
            {/* Only show loading overlay for actual images, not for blank new projects */}
            {sourceAsset?.id && !sourceAsset.id.startsWith('local-') && !isCanvasReady && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-900">
                <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-zinc-800/50 border border-zinc-700/50">
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
          </div>

          {/* Bottom bar: Zoom only */}
          <div className="flex items-center justify-end px-4 py-1.5 bg-zinc-900 border-t border-zinc-800">
            <ZoomControls />
          </div>

          {/* AI Chat Panel */}
          <EditorChatPanel />
        </div>

        {/* Right: Persistent Panel (Layers/History/Info) */}
        <RightPanel />
      </div>

      {/* Modals */}
      <InpaintModal
        isOpen={editMode === 'inpaint'}
        onClose={() => setEditMode('none')}
        canvasRef={canvasRef}
      />

      <CanvasSizeModal
        isOpen={editMode === 'canvasSize'}
        onClose={() => setEditMode('none')}
      />

      <ImageSizeModal
        isOpen={editMode === 'imageSize'}
        onClose={() => setEditMode('none')}
      />

      <ExportAsModal
        isOpen={editMode === 'export'}
        onClose={() => setEditMode('none')}
        onExport={handleExportAs}
        defaultFileName={sourceAsset?.name?.replace(/\.[^/.]+$/, '') || 'export'}
        currentDimensions={currentDimensions ?? null}
      />

      <NewProjectModal
        isOpen={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        onCreate={handleCreateProject}
        clipboardImageSize={clipboardImageSize}
      />

      <SaveFormatModal
        isOpen={showSaveFormatModal}
        onClose={() => { setShowSaveFormatModal(false); onAfterSaveRef.current = null; }}
        onSaveImage={handleSaveImageChoice}
        onSavePsd={handleSavePsd}
        defaultName={sourceAsset?.name?.replace(/\.[^/.]+$/, '') || 'Untitled Project'}
      />

      <SaveAsModal
        isOpen={showSaveAsModal}
        onClose={() => setShowSaveAsModal(false)}
        onSave={handleSaveAs}
        fileName={sourceAsset.name.replace(/\.[^/.]+$/, '')}
      />

      <ImageInfoModal
        isOpen={showImageInfoModal}
        onClose={() => setShowImageInfoModal(false)}
        asset={sourceAsset}
        currentDimensions={currentDimensions}
      />

      <FilterGalleryModal
        isOpen={showFilterGalleryModal}
        onClose={() => {
          setShowFilterGalleryModal(false);
          setFilterGallerySource(null);
        }}
        sourceCanvas={filterGallerySource}
        onApply={(filterFn, label) => {
          useImageEditorStore.getState().applyCanvasFilter(filterFn, label);
        }}
      />

      {/* Save Confirmation Modal */}
      {showSaveConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowSaveConfirmModal(false)}
          />
          <div className="relative bg-zinc-900 rounded-xl shadow-2xl border border-zinc-700 w-full max-w-sm mx-4 p-6">
            <h2 className="text-base font-semibold text-white mb-2">Overwrite Original?</h2>
            <p className="text-sm text-zinc-400 mb-6">
              This will permanently replace the original image with your edited version.
              A version record will be saved so you can revert later.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowSaveConfirmModal(false)}
                className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfirmed}
                className={cn(
                  'flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium',
                  'bg-white text-zinc-900 hover:bg-zinc-100 transition-colors'
                )}
              >
                <Save className="w-4 h-4" />
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preset Creator Modal (from EditorMenuBar Presets menu) */}
      {presetMode && (
        <PresetCreatorModal
          isOpen={!!presetMode}
          onClose={() => setPresetMode(null)}
          presetMode={presetMode}
          referenceAsset={sourceAsset}
        />
      )}

      {/* Local file back confirmation */}
      <ConfirmDialog
        isOpen={showLocalBackConfirm}
        onClose={() => setShowLocalBackConfirm(false)}
        onConfirm={() => { setShowLocalBackConfirm(false); hideEditor(); }}
        title={t('editor.localFileWarning.imageTitle')}
        message={t('editor.localFileWarning.imageMessage')}
        confirmText={t('editor.localFileWarning.closeWithoutSaving')}
        cancelText={t('buttons.cancel')}
        variant="danger"
      />

      {/* Close Tab Confirmation Modal (dirty tab) */}
      <ConfirmDialog
        isOpen={showCloseConfirmModal}
        onClose={() => { setShowCloseConfirmModal(false); setPendingCloseTabId(null); }}
        onConfirm={() => {
          setShowCloseConfirmModal(false);
          if (pendingCloseTabId) {
            clearDirty();
            closeTab(pendingCloseTabId);
            setPendingCloseTabId(null);
          }
        }}
        title={t('editor.closeTabWarning.title')}
        message={t('editor.closeTabWarning.message')}
        confirmText={t('editor.closeTabWarning.closeWithoutSaving')}
        cancelText={t('buttons.cancel')}
        variant="danger"
        secondaryAction={{
          text: t('editor.closeTabWarning.saveAndClose'),
          onClick: () => {
            setShowCloseConfirmModal(false);
            if (pendingCloseTabId) {
              const tabToClose = pendingCloseTabId;
              onAfterSaveRef.current = () => {
                closeTab(tabToClose);
              };
              setPendingCloseTabId(null);
              setShowSaveFormatModal(true);
            }
          },
        }}
      />
    </div>
  );
});

export default ImageEditorPage;
