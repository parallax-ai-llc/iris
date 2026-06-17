/**
 * SaveAsModal - Modal for saving image with format, quality, and destination options
 */

import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { X, FileImage, FileType, Download, HardDrive, Cloud } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export type SaveFormat = 'png' | 'jpeg' | 'webp' | 'pdf' | 'psd';
export type SaveAsDestination = 'local' | 'cloud';

interface SaveAsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (format: SaveFormat, quality: number, destination: SaveAsDestination, fileName: string) => void;
  fileName?: string;
}

const FORMAT_OPTIONS: { id: SaveFormat; label: string; description: string; supportsQuality: boolean }[] = [
  { id: 'psd', label: 'PSD', description: 'Preserves layers, editable in Photoshop', supportsQuality: false },
  { id: 'png', label: 'PNG', description: 'Lossless compression, supports transparency', supportsQuality: false },
  { id: 'jpeg', label: 'JPEG', description: 'Best for photos, smaller file size', supportsQuality: true },
  { id: 'webp', label: 'WebP', description: 'Modern format, good compression', supportsQuality: true },
  { id: 'pdf', label: 'PDF', description: 'Document format, printable', supportsQuality: false },
];

export const SaveAsModal = memo(function SaveAsModal({
  isOpen,
  onClose,
  onSave,
  fileName = 'image',
}: SaveAsModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<SaveFormat>('png');
  const [quality, setQuality] = useState(92);
  const [destination, setDestination] = useState<SaveAsDestination>('local');
  const [editableName, setEditableName] = useState(fileName);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFormat('png');
      setQuality(92);
      setDestination('local');
      setEditableName(fileName);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [isOpen, fileName]);

  const handleSave = useCallback(() => {
    const cleanName = (editableName.trim() || 'image').replace(/\.[^/.]+$/, '');
    onSave(selectedFormat, quality / 100, destination, cleanName);
  }, [selectedFormat, quality, destination, editableName, onSave]);

  const selectedFormatInfo = FORMAT_OPTIONS.find((f) => f.id === selectedFormat);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-zinc-900 rounded-xl shadow-2xl border border-zinc-700 w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <Download className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-white">Save As</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* File name */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              File Name
            </h3>
            <div className="flex items-center gap-2">
              <FileImage className="w-4 h-4 text-zinc-500 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={editableName}
                onChange={(e) => setEditableName(e.target.value)}
                placeholder="image"
                className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />
              <span className="px-2 py-2 text-xs text-zinc-500 bg-zinc-800/60 rounded-lg uppercase">
                .{selectedFormat}
              </span>
            </div>
          </div>

          {/* Format selection */}
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Format
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {FORMAT_OPTIONS.map((format) => (
                <button
                  key={format.id}
                  onClick={() => setSelectedFormat(format.id)}
                  className={cn(
                    'flex flex-col items-start p-3 rounded-lg transition-all text-left',
                    selectedFormat === format.id
                      ? 'bg-white/10 border border-white/20 text-white'
                      : 'bg-zinc-800 border border-transparent text-zinc-400 hover:bg-zinc-700 hover:text-white'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <FileType className="w-4 h-4" />
                    <span className="font-medium text-sm">{format.label}</span>
                  </div>
                  <span className="text-xs text-zinc-500 mt-1">{format.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quality slider (only for JPEG/WebP) */}
          {selectedFormatInfo?.supportsQuality && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Quality
                </h3>
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
                  [&::-webkit-slider-thumb]:bg-white
                  [&::-webkit-slider-thumb]:shadow-md
                  [&::-webkit-slider-thumb]:cursor-pointer
                  [&::-webkit-slider-thumb]:border-2
                  [&::-webkit-slider-thumb]:border-zinc-300"
              />
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Smaller file</span>
                <span>Better quality</span>
              </div>
            </div>
          )}

          {/* Destination */}
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Save to
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setDestination('local')}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-lg transition-all text-center',
                  destination === 'local'
                    ? 'bg-white/10 border border-white/20 text-white'
                    : 'bg-zinc-800 border border-transparent text-zinc-400 hover:bg-zinc-700 hover:text-white'
                )}
              >
                <HardDrive className="w-5 h-5" />
                <span className="font-medium text-sm">Local</span>
                <span className="text-xs text-zinc-500">Save to disk</span>
              </button>

              <button
                onClick={() => setDestination('cloud')}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-lg transition-all text-center',
                  destination === 'cloud'
                    ? 'bg-white/10 border border-white/20 text-white'
                    : 'bg-zinc-800 border border-transparent text-zinc-400 hover:bg-zinc-700 hover:text-white'
                )}
              >
                <Cloud className="w-5 h-5" />
                <span className="font-medium text-sm">Cloud</span>
                <span className="text-xs text-zinc-500">Upload to library</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className={cn(
              'flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium',
              'bg-gradient-to-r from-slate-300 via-white to-slate-300',
              'text-neutral-900 hover:from-white hover:to-white',
              'transition-colors'
            )}
          >
            <Download className="w-4 h-4" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
});

export default SaveAsModal;
