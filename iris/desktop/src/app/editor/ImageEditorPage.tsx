/**
 * ImageEditorPage - Photoshop-style image editor page
 * Layout: TitleBar > Header > [ToolPanel | OptionsBar + Canvas + BottomBar | RightPanel]
 */

import { memo, useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import { useEditorTabsStore, setupEditorTabsSync } from '@/features/image-editor/stores/editorTabs.store';
import { ImageEditorStoreProvider } from '@/features/image-editor/stores/imageEditorContext';
import { getOrCreateStore } from '@/features/image-editor/stores/imageEditorRegistry';
import { EditorTabBar } from '@/features/image-editor/components/tabs/EditorTabBar';
import { EditorMenuBar } from '@/features/image-editor/components/tabs/EditorMenuBar';
import { EditorCanvas, EditorCanvasHandle } from '@/features/image-editor/components/Canvas/EditorCanvas';
import { ToolPanel } from '@/features/image-editor/components/Toolbar/ToolPanel';
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
import { ExportAsModal } from '@/features/image-editor/components/modals/ExportAsModal';
import { TitleBar } from '@/app/layout/TitleBar';
import { FullScreenLayout } from '@/app/layout/FullScreenLayout';
import { CloseTabConfirmDialog } from '@/features/image-editor/components/tabs/CloseTabConfirmDialog';
import { PresetCreatorModal } from '@/features/tools/components/PresetCreatorModal';
import { downloadBlob } from '@/features/image-editor/canvas/formatExport';
import { useUIStore } from '@/shared/stores/ui.store';
import { downloadAsset, invalidateAssetCache } from '@/shared/api/asset.api';
import { uploadImage, replaceAssetFile } from '@/shared/api/image.api';
import { exportAsPsd } from '@/features/image-editor/psd/exportPsd';
import { toast } from '@/shared/lib/toast';
import { openImageFile } from '@/features/image-editor/lib/openImageFile';
import { jsPDF } from 'jspdf';
import { useImageEditorLayerShortcuts } from '@/features/image-editor/hooks/useImageEditorLayerShortcuts';
import { useImageEditorShortcuts } from '@/features/image-editor/hooks/useImageEditorShortcuts';
import { textLayersForExport } from '@/features/image-editor/lib/textLayerEdit';
import { renderDocumentForOutput } from '@/features/image-editor/lib/documentComposite';
import { createAfterSaveSlot } from '@/features/image-editor/lib/afterSave';
import { useImageEditorExports } from '@/features/image-editor/hooks/useImageEditorExports';

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
      {/* key: every component below reads the ACTIVE tab's store; a tab switch
          re-mounts the subtree so nothing keeps showing the previous tab (the
          per-tab document state lives in the tab's store and is restored). */}
      <ImageEditorPageInner key={activeTabId} />
    </ImageEditorStoreProvider>
  );
});

const ImageEditorPageInner = memo(function ImageEditorPageInner() {
  const {
    sourceAsset,
    resetAllTransforms,
    setProcessing,
    clearDirty,
    editMode,
    setEditMode,
    layers,
    textLayers,
    isCanvasReady,
  } = useImageEditorStore();

  const activeTabId = useEditorTabsStore((s) => s.activeTabId);
  const closeTab = useEditorTabsStore((s) => s.closeTab);
  const requestCloseTab = useEditorTabsStore((s) => s.requestCloseTab);
  const requestLeaveEditor = useEditorTabsStore((s) => s.requestLeaveEditor);
  const openTabWithLayers = useEditorTabsStore((s) => s.openTabWithLayers);
  const pendingClose = useEditorTabsStore((s) => s.pendingClose);

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
  const [currentDimensions, setCurrentDimensions] = useState<{ width: number; height: number } | undefined>();
  const [clipboardImageSize, setClipboardImageSize] = useState<{ width: number; height: number } | null>(null);
  // Preset creator modal state (opened from EditorMenuBar Presets menu)
  const [presetMode, setPresetMode] = useState<string | null>(null);
  // Action to run after a SUCCESSFUL save ("Save and Close"); a cancelled or
  // failed save drops it so the tab stays open (lib/afterSave.ts)
  const afterSaveRef = useRef(createAfterSaveSlot());
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

  // Back / Esc: go to the gallery, tabs stay alive (a dirty local file asks first)
  const handleBack = useCallback(() => {
    requestLeaveEditor();
  }, [requestLeaveEditor]);

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
          const objectUrl = URL.createObjectURL(blob);
          img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            detectedSize = { width: img.naturalWidth, height: img.naturalHeight };
            setClipboardImageSize(detectedSize);
            setShowNewProjectModal(true);
          };
          img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            setClipboardImageSize(null);
            setShowNewProjectModal(true);
          };
          img.src = objectUrl;
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
  const processOpenedFile = useCallback(async (fileData: ArrayBuffer, fileName: string, sourcePath?: string) => {
    await openImageFile(fileData, fileName, sourcePath);
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
        // Same file already open: focus its tab instead of opening a duplicate
        if (useEditorTabsStore.getState().focusTabForPath(filePath)) return;

        const fileData = await window.electronAPI.files.readFile(filePath);
        if (!fileData) {
          toast.error('Failed to read file');
          return;
        }

        const fileName = filePath.split(/[/\\]/).pop() || 'file';
        await processOpenedFile(fileData, fileName, filePath);
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

  // The document as written to files / clipboard: re-composited from the layers
  // (no Gamut Warning, Proof Colors or channel view) with rotation/flip baked in
  const createFinalCanvas = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    return renderDocumentForOutput(useImageEditorStore.getState(), canvasRef.current?.getCanvas() ?? null);
  }, []);

  // PSD: the layers are stored unrotated, so the composite preview and the PSD
  // size are the unrotated document too (rotation/flip are view transforms)
  const createPsdComposite = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    const state = useImageEditorStore.getState();
    return renderDocumentForOutput(
      { ...state, rotation: 0, flipHorizontal: false, flipVertical: false },
      canvasRef.current?.getCanvas() ?? null,
    );
  }, []);

  const { handleCopyToClipboard, handleExportCmykTiff, handleExportWebP, handleExportRgbTiff, handleExportBmp, handleExportAs } =
    useImageEditorExports({
      renderOutput: createFinalCanvas,
      sourceAsset,
      setProcessing,
      onExportAsDone: () => setEditMode('none'),
    });

  // Handle save click - show format choice modal
  const handleSaveClick = useCallback(() => {
    if (!sourceAsset) return;
    setShowSaveFormatModal(true);
  }, [sourceAsset]);

  // Handle save as PSD
  const handleSavePsd = useCallback(async (destination: SaveDestination, name: string) => {
    setShowSaveFormatModal(false);
    if (!sourceAsset) {
      afterSaveRef.current.settle(false);
      return;
    }

    setProcessing(true, 'Exporting PSD...');
    let saved = false;
    try {
      const compositeCanvas = await createPsdComposite();
      const cw = compositeCanvas?.width ?? 1920;
      const ch = compositeCanvas?.height ?? 1080;
      const blob = await exportAsPsd(layers, cw, ch, compositeCanvas, textLayersForExport(layers, textLayers));
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
            saved = true;
            const savedName = savePath.split(/[/\\]/).pop() || fileName;
            toast.success(`Saved: ${savedName}`);
          }
        } else {
          downloadBlob(blob, fileName);
          clearDirty();
          saved = true;
          toast.success(`Downloaded: ${fileName}`);
        }
      } else {
        // Cloud upload
        const file = new File([blob], fileName, { type: 'application/octet-stream' });
        const result = await uploadImage(file);
        if (result) {
          clearDirty();
          saved = true;
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
      // "Save and Close" closes the tab only when the file was written
      afterSaveRef.current.settle(saved);
    }
  }, [sourceAsset, layers, createPsdComposite, setProcessing, clearDirty, textLayers]);

  // Handle local image save with file dialog
  const handleSaveImageLocal = useCallback(async (name: string) => {
    if (!sourceAsset) {
      afterSaveRef.current.settle(false);
      return;
    }

    setProcessing(true, 'Saving...');
    let saved = false;
    try {
      const canvas = await createFinalCanvas();
      if (!canvas) throw new Error('Failed to get canvas data');
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
          saved = true;
          const fileName = savePath.split(/[/\\]/).pop() || saveName;
          toast.success(`Saved: ${fileName}`);
        }
      } else {
        downloadBlob(blob, saveName);
        clearDirty();
        saved = true;
        toast.success(`Downloaded: ${saveName}`);
      }
    } catch (error) {
      console.error('Local save error:', error);
      toast.error('Failed to save image');
    } finally {
      setProcessing(false);
      // "Save and Close" closes the tab only when the file was written
      afterSaveRef.current.settle(saved);
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
    if (!sourceAsset) {
      afterSaveRef.current.settle(false);
      return;
    }

    setProcessing(true, 'Saving...');
    let saved = false;
    try {
      const canvas = await createFinalCanvas();
      if (!canvas) throw new Error('Failed to get canvas data');
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
        saved = true;
        toast.success('Image saved successfully');
      } else {
        throw new Error('Save failed');
      }
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save image');
    } finally {
      setProcessing(false);
      // "Save and Close" closes the tab only when the upload succeeded
      afterSaveRef.current.settle(saved);
    }
  }, [sourceAsset, createFinalCanvas, setProcessing, clearDirty]);

  // Overwrite confirmation dismissed: nothing was saved, keep the tab
  const handleSaveConfirmCancelled = useCallback(() => {
    setShowSaveConfirmModal(false);
    afterSaveRef.current.clear();
  }, []);

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
        const compositeCanvas = await createPsdComposite();
        const cw = compositeCanvas?.width ?? 1920;
        const ch = compositeCanvas?.height ?? 1080;
        const blob = await exportAsPsd(layers, cw, ch, compositeCanvas, textLayersForExport(layers, textLayers));

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

    setProcessing(true, destination === 'cloud' ? 'Uploading...' : 'Exporting...');
    const canvas = await createFinalCanvas();
    if (!canvas) {
      setProcessing(false);
      toast.error('Failed to get canvas data');
      return;
    }

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
  }, [sourceAsset, layers, createFinalCanvas, createPsdComposite, setProcessing, textLayers]);

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

  // Ctrl+W / File > Close Tab: same decision as the tab X (asks only when dirty)
  const handleCloseTab = useCallback(() => {
    if (activeTabId) requestCloseTab(activeTabId);
  }, [activeTabId, requestCloseTab]);

  // "Save and Close" from the close dialog: open the save flow, close after it
  const handleSaveAndClose = useCallback((tabId: string) => {
    afterSaveRef.current.set(() => {
      closeTab(tabId);
    });
    setShowSaveFormatModal(true);
  }, [closeTab]);

  // Keyboard shortcuts — keys live in IMAGE_EDITOR_KEYMAP, routed by the
  // central dispatcher (editor scope beats the global Ctrl+1~0 navigation).
  useImageEditorShortcuts({
    onBack: handleBack,
    onNew: handleNew,
    onOpen: handleOpen,
    onSave: handleSaveClick,
    onSaveAs: () => setShowSaveAsModal(true),
    onCloseTab: handleCloseTab,
    onPaste: pasteImageFromClipboard,
    modalOpen:
      showNewProjectModal ||
      showSaveFormatModal ||
      showSaveConfirmModal ||
      showSaveAsModal ||
      showImageInfoModal ||
      showFilterGalleryModal ||
      pendingClose !== null ||
      presetMode !== null,
  });

  if (!sourceAsset) {
    return (
      <FullScreenLayout className="bg-zinc-900" titleBar={<TitleBar />}>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-500">No image selected</p>
        </div>
      </FullScreenLayout>
    );
  }

  return (
    <FullScreenLayout
      className="bg-zinc-950"
      titleBar={
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
      }
    >
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
        onClose={() => { setShowSaveFormatModal(false); afterSaveRef.current.clear(); }}
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
            onClick={handleSaveConfirmCancelled}
          />
          <div className="relative bg-zinc-900 rounded-xl shadow-2xl border border-zinc-700 w-full max-w-sm mx-4 p-6">
            <h2 className="text-base font-semibold text-white mb-2">Overwrite Original?</h2>
            <p className="text-sm text-zinc-400 mb-6">
              This will permanently replace the original image with your edited version.
              A version record will be saved so you can revert later.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={handleSaveConfirmCancelled}
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

      {/* Unsaved-changes dialog for every close path (tab X, Ctrl+W, menu, Back on a dirty local file) */}
      <CloseTabConfirmDialog onSaveAndClose={handleSaveAndClose} />
    </FullScreenLayout>
  );
});

export default ImageEditorPage;
