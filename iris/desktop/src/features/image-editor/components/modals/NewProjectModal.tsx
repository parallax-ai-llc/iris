/**
 * NewProjectModal - Create a new blank PSD project with size, color, and name options
 */

import { memo, useState, useCallback, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, width: number, height: number, bgColor: string | null) => void;
  clipboardImageSize?: { width: number; height: number } | null;
}

const SIZE_PRESETS = [
  { label: 'Full HD', width: 1920, height: 1080 },
  { label: 'Square', width: 1080, height: 1080 },
  { label: 'Portrait', width: 1080, height: 1920 },
  { label: '4K', width: 3840, height: 2160 },
  { label: 'A4 (300dpi)', width: 2480, height: 3508 },
  { label: 'Custom', width: 0, height: 0 },
];

const BG_PRESETS = [
  { label: 'White', value: '#ffffff', display: 'bg-white border border-zinc-600' },
  { label: 'Black', value: '#000000', display: 'bg-black border border-zinc-600' },
  { label: 'Transparent', value: null, display: 'bg-[repeating-conic-gradient(#404040_0%_25%,#303030_0%_50%)] bg-[length:12px_12px] border border-zinc-600' },
  { label: 'Custom', value: 'custom', display: '' },
];

export const NewProjectModal = memo(function NewProjectModal({
  isOpen,
  onClose,
  onCreate,
  clipboardImageSize,
}: NewProjectModalProps) {
  const [name, setName] = useState('Untitled');
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [customWidth, setCustomWidth] = useState(1920);
  const [customHeight, setCustomHeight] = useState(1080);
  const [bgPreset, setBgPreset] = useState(0); // White
  const [customColor, setCustomColor] = useState('#808080');

  // Reset on open and detect clipboard image size
  useEffect(() => {
    if (isOpen) {
      setName('Untitled');
      setBgPreset(0);
      setCustomColor('#808080');

      // If clipboard image size is provided, use it; otherwise use default
      if (clipboardImageSize) {
        setSelectedPreset(SIZE_PRESETS.length - 1); // Select "Custom"
        setCustomWidth(clipboardImageSize.width);
        setCustomHeight(clipboardImageSize.height);
      } else {
        setSelectedPreset(0);
        setCustomWidth(1920);
        setCustomHeight(1080);
      }
    }
  }, [isOpen, clipboardImageSize]);

  // Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const isCustomSize = selectedPreset === SIZE_PRESETS.length - 1;
  const finalWidth = isCustomSize ? customWidth : SIZE_PRESETS[selectedPreset].width;
  const finalHeight = isCustomSize ? customHeight : SIZE_PRESETS[selectedPreset].height;

  const bgValue = BG_PRESETS[bgPreset].value;
  const isCustomBg = bgValue === 'custom';
  const finalBgColor = isCustomBg ? customColor : bgValue;

  const handleCreate = useCallback(() => {
    if (finalWidth < 1 || finalHeight < 1) return;
    const fileName = (name.trim() || 'Untitled') + '.psd';
    onCreate(fileName, finalWidth, finalHeight, finalBgColor);
    onClose();
  }, [name, finalWidth, finalHeight, finalBgColor, onCreate, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-zinc-900 rounded-xl shadow-2xl border border-zinc-700 w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <Plus className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-white">New Project</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* File name */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Name</h3>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Untitled"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Size presets */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Size</h3>
            <div className="grid grid-cols-3 gap-2">
              {SIZE_PRESETS.map((preset, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedPreset(i)}
                  className={cn(
                    'flex flex-col items-center p-2.5 rounded-lg transition-all text-center',
                    selectedPreset === i
                      ? 'bg-white/10 border border-white/20 text-white'
                      : 'bg-zinc-800 border border-transparent text-zinc-400 hover:bg-zinc-700 hover:text-white'
                  )}
                >
                  <span className="text-xs font-medium">{preset.label}</span>
                  {preset.width > 0 && (
                    <span className="text-[10px] text-zinc-500 mt-0.5">{preset.width}x{preset.height}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Custom size inputs */}
            {isCustomSize && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number"
                  value={customWidth}
                  onChange={(e) => setCustomWidth(Math.max(1, parseInt(e.target.value) || 1))}
                  min={1}
                  max={16384}
                  className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white text-center focus:outline-none focus:border-zinc-500"
                  placeholder="Width"
                />
                <span className="text-zinc-500 text-sm">x</span>
                <input
                  type="number"
                  value={customHeight}
                  onChange={(e) => setCustomHeight(Math.max(1, parseInt(e.target.value) || 1))}
                  min={1}
                  max={16384}
                  className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white text-center focus:outline-none focus:border-zinc-500"
                  placeholder="Height"
                />
                <span className="text-zinc-500 text-xs">px</span>
              </div>
            )}
          </div>

          {/* Background color */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Background</h3>
            <div className="flex items-center gap-2">
              {BG_PRESETS.map((preset, i) => (
                <button
                  key={i}
                  onClick={() => setBgPreset(i)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-xs font-medium',
                    bgPreset === i
                      ? 'bg-white/10 border border-white/20 text-white'
                      : 'bg-zinc-800 border border-transparent text-zinc-400 hover:bg-zinc-700 hover:text-white'
                  )}
                >
                  {preset.display && (
                    <div className={cn('w-4 h-4 rounded-sm', preset.display)} />
                  )}
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom color picker */}
            {isCustomBg && (
              <div className="flex items-center gap-3 mt-2">
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  className="w-10 h-8 rounded cursor-pointer border border-zinc-600 bg-transparent"
                />
                <input
                  type="text"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-zinc-500"
                />
              </div>
            )}
          </div>

          {/* Preview info */}
          <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 rounded-lg text-xs text-zinc-500">
            <span>{finalWidth} x {finalHeight} px</span>
            <span>{finalBgColor === null ? 'Transparent' : finalBgColor}</span>
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
            onClick={handleCreate}
            disabled={finalWidth < 1 || finalHeight < 1}
            className={cn(
              'flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium',
              'bg-gradient-to-r from-slate-300 via-white to-slate-300',
              'text-neutral-900 hover:from-white hover:to-white',
              'transition-colors disabled:opacity-50'
            )}
          >
            <Plus className="w-4 h-4" />
            Create
          </button>
        </div>
      </div>
    </div>
  );
});

export default NewProjectModal;
