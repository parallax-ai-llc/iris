/**
 * openImageFile - Opens an image or PSD file locally (no server upload).
 * Extracted from ImageEditorPage.processOpenedFile for reuse.
 */

import { importPsd } from '@/features/image-editor/psd/importPsd';
import { toast } from '@/shared/lib/toast';
import { useEditorTabsStore } from '@/features/image-editor/stores/editorTabs.store';
import { useImageEditorStore } from '@/features/image-editor/stores/imageEditor.store';
import type { IrisAsset } from '@/shared/api/types';

/**
 * Process and open an image file (PSD or regular image) as a new editor tab.
 * All processing is done client-side with no server upload.
 */
export async function openImageFile(fileData: ArrayBuffer, fileName: string): Promise<void> {
  const { openTabWithLayers } = useEditorTabsStore.getState();
  const { setProcessing } = useImageEditorStore.getState();

  if (fileName.toLowerCase().endsWith('.psd')) {
    setProcessing(true, 'Opening PSD...');
    try {
      const result = importPsd(fileData);
      const localAsset: IrisAsset = {
        id: `local-${Date.now()}`, userId: '', name: fileName, storagePath: '',
        currentVersion: 1, assetType: 'IMAGE' as const, mimeType: 'application/x-photoshop',
        sizeBytes: fileData.byteLength, isPublic: false, previewUrl: result.compositeDataUrl || '',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      openTabWithLayers(localAsset, result.layers, result.compositeDataUrl || '', result.width, result.height, result.textLayers);
      toast.success(`Opened ${fileName} with ${result.layers.length} layers`);
    } catch (error) {
      console.error('PSD open error:', error);
      toast.error('Failed to open PSD file');
    } finally {
      setProcessing(false);
    }
  } else {
    return new Promise<void>((resolve) => {
      const blob = new Blob([fileData]);
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          const layer = {
            id: Math.random().toString(36).substring(2, 10),
            name: fileName,
            visible: true,
            locked: false,
            opacity: 100,
            blendMode: 'normal' as const,
            imageData: dataUrl,
            x: 0,
            y: 0,
            width: img.width,
            height: img.height,
          };
          const imgAsset: IrisAsset = {
            id: `local-${Date.now()}`, userId: '', name: fileName, storagePath: '',
            currentVersion: 1, assetType: 'IMAGE' as const, mimeType: 'image/png',
            sizeBytes: fileData.byteLength, isPublic: false, previewUrl: dataUrl,
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          };
          openTabWithLayers(imgAsset, [layer], dataUrl, img.width, img.height);
          toast.success(`Opened ${fileName}`);
        }
        URL.revokeObjectURL(url);
        resolve();
      };
      img.onerror = () => {
        toast.error('Failed to open image');
        URL.revokeObjectURL(url);
        resolve();
      };
      img.src = url;
    });
  }
}
