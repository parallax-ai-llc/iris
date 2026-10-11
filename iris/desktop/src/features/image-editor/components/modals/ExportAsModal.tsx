/**
 * ExportAsModal - Photoshop-style "Export As..." dialog.
 * Lets the user pick a format, filename, quality (for lossy formats),
 * and an export scale before writing the file.
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileType, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'bmp' | 'tiff' | 'pdf';

export interface ExportAsSettings {
  format: ExportFormat;
  quality: number; // 0..1
  scale: number;   // 1 = 100%
  fileName: string;
}

interface ExportAsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (settings: ExportAsSettings) => void;
  defaultFileName?: string;
  currentDimensions?: { width: number; height: number } | null;
}

const FORMAT_OPTIONS: { id: ExportFormat; label: string; description: string; supportsQuality: boolean }[] = [
  { id: 'png', label: 'PNG', description: 'Lossless, supports transparency', supportsQuality: false },
  { id: 'jpeg', label: 'JPEG', description: 'Smaller files, good for photos', supportsQuality: true },
  { id: 'webp', label: 'WebP', description: 'Modern, great compression', supportsQuality: true },
  { id: 'bmp', label: 'BMP', description: 'Uncompressed bitmap', supportsQuality: false },
  { id: 'tiff', label: 'TIFF', description: 'High-quality RGB TIFF', supportsQuality: false },
  { id: 'pdf', label: 'PDF', description: 'Document, printable', supportsQuality: false },
];

const SCALE_PRESETS = [0.5, 1, 1.5, 2, 3];

export const ExportAsModal = memo(function ExportAsModal({
  isOpen,
  onClose,
  onExport,
  defaultFileName = 'export',
  currentDimensions,
}: ExportAsModalProps) {
  const [format, setFormat] = useState<ExportFormat>('png');
  const [quality, setQuality] = useState(92);
  const [scale, setScale] = useState(1);
  const [fileName, setFileName] = useState(defaultFileName);

  useEffect(() => {
    if (!isOpen) return;
    setFormat('png');
    setQuality(92);
    setScale(1);
    setFileName(defaultFileName);
  }, [isOpen, defaultFileName]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const selectedFormat = useMemo(() => FORMAT_OPTIONS.find((f) => f.id === format)!, [format]);

  const scaledDims = useMemo(() => {
    if (!currentDimensions) return null;
    return {
      width: Math.max(1, Math.round(currentDimensions.width * scale)),
      height: Math.max(1, Math.round(currentDimensions.height * scale)),
    };
  }, [currentDimensions, scale]);

  const handleExport = useCallback(() => {
    const cleanName = (fileName.trim() || 'export').replace(/\.[^/.]+$/, '');
    onExport({
      format,
      quality: quality / 100,
      scale,
      fileName: cleanName,
    });
  }, [format, quality, scale, fileName, onExport]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-zinc-900 rounded-xl shadow-2xl border border-zinc-700 w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <Download className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-white">Export As</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* File name */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">File Name</h3>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="export"
                className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />
              <span className="px-2 py-2 text-xs text-zinc-500 bg-zinc-800/60 rounded-lg uppercase">
                .{format}
              </span>
            </div>
          </div>

          {/* Format selection */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Format</h3>
            <div className="grid grid-cols-3 gap-2">
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setFormat(opt.id)}
                  className={cn(
                    'flex flex-col items-start p-2.5 rounded-lg transition-all text-left',
                    format === opt.id
                      ? 'bg-white/10 border border-white/20 text-white'
                      : 'bg-zinc-800 border border-transparent text-zinc-400 hover:bg-zinc-700 hover:text-white'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <FileType className="w-3.5 h-3.5" />
                    <span className="font-medium text-xs">{opt.label}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 mt-0.5 leading-tight">{opt.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quality (lossy formats only) */}
          {selectedFormat.supportsQuality && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Quality</h3>
                <span className="text-sm text-white font-medium tabular-nums">{quality}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-4
                  [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-white"
              />
              <div className="flex justify-between text-[10px] text-zinc-500">
                <span>Smaller file</span>
                <span>Better quality</span>
              </div>
            </div>
          )}

          {/* Scale */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Scale</h3>
            <div className="flex items-center gap-1 bg-zinc-800 rounded-md p-0.5">
              {SCALE_PRESETS.map((s) => (
                <button
                  key={s}
                  onClick={() => setScale(s)}
                  className={cn(
                    'flex-1 px-2 py-1 text-xs rounded transition-colors',
                    scale === s ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
                  )}
                >
                  {s === 1 ? '1×' : `${s}×`}
                </button>
              ))}
            </div>
          </div>

          {/* Preview info */}
          {(currentDimensions || scaledDims) && (
            <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 rounded-lg text-xs">
              <span className="text-zinc-500">Output</span>
              <span className="text-zinc-200">
                {scaledDims ? `${scaledDims.width} × ${scaledDims.height} px` : '—'}
                {scale !== 1 && currentDimensions && (
                  <span className="ml-2 text-zinc-500">
                    (from {currentDimensions.width} × {currentDimensions.height})
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            className={cn(
              'flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium',
              'bg-gradient-to-r from-slate-300 via-white to-slate-300',
              'text-neutral-900 hover:from-white hover:to-white',
              'transition-colors'
            )}
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>
    </div>
  );
});

export default ExportAsModal;
