/**
 * Image editor exports that do not change the document: Copy to Clipboard,
 * Export CMYK TIFF / WebP / RGB TIFF / BMP and Export As...
 *
 * Every one of them writes `renderOutput()`, the document re-composited from
 * the layers (lib/documentComposite.ts), never the on-screen canvas, so
 * display-only state (Gamut Warning, Proof Colors, channel view) is not exported.
 */

import { useCallback } from 'react';
import { jsPDF } from 'jspdf';
import type { IrisAsset } from '@/shared/api/types';
import { toast } from '@/shared/lib/toast';
import { downloadCmykTiff } from '@/features/image-editor/canvas/cmykExport';
import {
  exportAsWebP,
  exportAsRgbTiff,
  exportAsBmp,
  downloadBlob,
  downloadBytes,
} from '@/features/image-editor/canvas/formatExport';
import type { ExportAsSettings } from '@/features/image-editor/components/modals/ExportAsModal';

interface UseImageEditorExportsOptions {
  /** The document as it should be written (layers composited, view transform baked). */
  renderOutput: () => Promise<HTMLCanvasElement | null>;
  sourceAsset: IrisAsset | null;
  setProcessing: (isProcessing: boolean, message?: string) => void;
  /** Called when Export As finishes (closes the Export As mode). */
  onExportAsDone: () => void;
}

function baseName(asset: IrisAsset | null): string {
  return asset?.name?.replace(/\.[^.]+$/, '') || 'export';
}

/** Ask for a path and write the bytes (Electron), or download them (browser). */
async function saveBytes(
  bytes: ArrayBuffer | Uint8Array,
  fileName: string,
  filter: { name: string; extensions: string[] },
  mimeType: string,
): Promise<boolean> {
  if (window.electronAPI?.files) {
    const savePath = await window.electronAPI.files.saveFile({ defaultPath: fileName, filters: [filter] });
    if (!savePath) return false;
    const buffer =
      bytes instanceof Uint8Array
        ? (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
        : bytes;
    await window.electronAPI.files.writeFile(savePath, buffer);
    return true;
  }
  if (bytes instanceof Uint8Array) downloadBytes(bytes, fileName, mimeType);
  else downloadBlob(new Blob([bytes], { type: mimeType }), fileName);
  return true;
}

function readPixels(canvas: HTMLCanvasElement): ImageData | null {
  const ctx = canvas.getContext('2d');
  return ctx ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
}

export function useImageEditorExports({
  renderOutput,
  sourceAsset,
  setProcessing,
  onExportAsDone,
}: UseImageEditorExportsOptions) {
  const handleCopyToClipboard = useCallback(async () => {
    try {
      const canvas = await renderOutput();
      if (!canvas) {
        toast.error('Failed to get canvas data');
        return;
      }
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/png', 1);
      });
      if (blob) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast.success('Copied to clipboard');
      }
    } catch (error) {
      console.error('Copy error:', error);
      toast.error('Failed to copy to clipboard');
    }
  }, [renderOutput]);

  const handleExportCmykTiff = useCallback(async () => {
    const canvas = await renderOutput();
    const imageData = canvas && readPixels(canvas);
    if (!imageData) {
      toast.error('Failed to get canvas data');
      return;
    }
    downloadCmykTiff(imageData, `${baseName(sourceAsset)}-cmyk.tif`, 300);
    toast.success('CMYK TIFF exported');
  }, [renderOutput, sourceAsset]);

  const handleExportWebP = useCallback(async () => {
    try {
      const canvas = await renderOutput();
      if (!canvas) {
        toast.error('Failed to get canvas data');
        return;
      }
      const blob = await exportAsWebP(canvas, 0.9);
      const saved = await saveBytes(
        await blob.arrayBuffer(),
        `${baseName(sourceAsset)}.webp`,
        { name: 'WebP Image', extensions: ['webp'] },
        'image/webp',
      );
      if (saved) toast.success('WebP exported');
    } catch (error) {
      console.error('WebP export error:', error);
      toast.error('Failed to export WebP');
    }
  }, [renderOutput, sourceAsset]);

  const handleExportRgbTiff = useCallback(async () => {
    try {
      const canvas = await renderOutput();
      const imageData = canvas && readPixels(canvas);
      if (!imageData) {
        toast.error('Failed to get canvas data');
        return;
      }
      const saved = await saveBytes(
        exportAsRgbTiff(imageData, 72),
        `${baseName(sourceAsset)}-rgb.tif`,
        { name: 'TIFF Image', extensions: ['tif', 'tiff'] },
        'image/tiff',
      );
      if (saved) toast.success('RGB TIFF exported');
    } catch (error) {
      console.error('TIFF export error:', error);
      toast.error('Failed to export TIFF');
    }
  }, [renderOutput, sourceAsset]);

  const handleExportBmp = useCallback(async () => {
    try {
      const canvas = await renderOutput();
      const imageData = canvas && readPixels(canvas);
      if (!imageData) {
        toast.error('Failed to get canvas data');
        return;
      }
      const saved = await saveBytes(
        exportAsBmp(imageData),
        `${baseName(sourceAsset)}.bmp`,
        { name: 'Bitmap Image', extensions: ['bmp'] },
        'image/bmp',
      );
      if (saved) toast.success('BMP exported');
    } catch (error) {
      console.error('BMP export error:', error);
      toast.error('Failed to export BMP');
    }
  }, [renderOutput, sourceAsset]);

  // "Export As..." with format/quality/scale options
  const handleExportAs = useCallback(async (settings: ExportAsSettings) => {
    setProcessing(true, 'Exporting...');
    try {
      const canvas = await renderOutput();
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
      let bytes: ArrayBuffer | Uint8Array;
      let mimeType = `image/${settings.format}`;

      if (settings.format === 'pdf') {
        const orientation = outCanvas.width > outCanvas.height ? 'landscape' : 'portrait';
        const pdf = new jsPDF({ orientation, unit: 'px', format: [outCanvas.width, outCanvas.height] });
        pdf.addImage(outCanvas.toDataURL('image/png', 1.0), 'PNG', 0, 0, outCanvas.width, outCanvas.height);
        bytes = pdf.output('arraybuffer');
        mimeType = 'application/pdf';
      } else if (settings.format === 'tiff' || settings.format === 'bmp') {
        const imageData = readPixels(outCanvas);
        if (!imageData) throw new Error('No 2d context');
        bytes = settings.format === 'tiff' ? exportAsRgbTiff(imageData, 72) : exportAsBmp(imageData);
        mimeType = settings.format === 'tiff' ? 'image/tiff' : 'image/bmp';
      } else if (settings.format === 'webp') {
        bytes = await (await exportAsWebP(outCanvas, settings.quality)).arrayBuffer();
        mimeType = 'image/webp';
      } else {
        const blob = await new Promise<Blob | null>((resolve) => {
          outCanvas.toBlob((b) => resolve(b), mimeType, settings.quality);
        });
        if (!blob) throw new Error('Failed to encode image');
        bytes = await blob.arrayBuffer();
      }

      const saved = await saveBytes(bytes, outputFileName, { name: settings.format.toUpperCase(), extensions: [ext] }, mimeType);
      if (saved) toast.success(`Exported: ${outputFileName}`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export image');
    } finally {
      setProcessing(false);
      onExportAsDone();
    }
  }, [renderOutput, setProcessing, onExportAsDone]);

  return {
    handleCopyToClipboard,
    handleExportCmykTiff,
    handleExportWebP,
    handleExportRgbTiff,
    handleExportBmp,
    handleExportAs,
  };
}
