/**
 * SaveFormatModal - Choose between PSD (layered) or Image (flattened) save
 * PSD mode also lets user pick save destination: Local disk or Cloud upload.
 */

import { memo, useState, useEffect, useRef } from 'react';
import { X, Save, Layers, ImageIcon, HardDrive, Cloud } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export type SaveFormatChoice = 'psd' | 'image';
export type SaveDestination = 'local' | 'cloud';

interface SaveFormatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveImage: (destination: SaveDestination, name: string) => void; // Flatten save with destination
  onSavePsd: (destination: SaveDestination, name: string) => void;   // PSD with destination
  defaultName?: string;
}

export const SaveFormatModal = memo(function SaveFormatModal({
  isOpen,
  onClose,
  onSaveImage,
  onSavePsd,
  defaultName = 'Untitled Project',
}: SaveFormatModalProps) {
  const [name, setName] = useState(defaultName);
  const [format, setFormat] = useState<SaveFormatChoice>('psd');
  const [destination, setDestination] = useState<SaveDestination>('local');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
      setFormat('psd');
      setDestination('local');
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [isOpen, defaultName]);

  // Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmedName = name.trim() || 'Untitled Project';
    if (format === 'image') {
      onSaveImage(destination, trimmedName);
    } else {
      onSavePsd(destination, trimmedName);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-zinc-900 rounded-xl shadow-2xl border border-zinc-700 w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <Save className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-white">Save Project</h2>
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
          {/* Project Name */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Project Name</h3>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Untitled Project"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Format selection */}
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Format</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setFormat('psd')}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-lg transition-all text-center',
                  format === 'psd'
                    ? 'bg-white/10 border border-white/20 text-white'
                    : 'bg-zinc-800 border border-transparent text-zinc-400 hover:bg-zinc-700 hover:text-white'
                )}
              >
                <Layers className="w-6 h-6" />
                <span className="font-medium text-sm">PSD</span>
                <span className="text-xs text-zinc-500">Preserves layers</span>
              </button>

              <button
                onClick={() => setFormat('image')}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-lg transition-all text-center',
                  format === 'image'
                    ? 'bg-white/10 border border-white/20 text-white'
                    : 'bg-zinc-800 border border-transparent text-zinc-400 hover:bg-zinc-700 hover:text-white'
                )}
              >
                <ImageIcon className="w-6 h-6" />
                <span className="font-medium text-sm">Image</span>
                <span className="text-xs text-zinc-500">Flattened PNG</span>
              </button>
            </div>
          </div>

          {/* Destination selection */}
          <div className="space-y-3">
              <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Save to</h3>
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
            <Save className="w-4 h-4" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
});

export default SaveFormatModal;
