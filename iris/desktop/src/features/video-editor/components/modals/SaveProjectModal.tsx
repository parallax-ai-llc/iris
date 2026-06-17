/**
 * SaveProjectModal - Save project with a name before creating it
 */

import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { X, Save } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface SaveProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  title?: string;
  defaultName?: string;
}

export const SaveProjectModal = memo(function SaveProjectModal({
  isOpen,
  onClose,
  onSave,
  title = 'Save Project',
  defaultName = 'Untitled Project',
}: SaveProjectModalProps) {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [isOpen, defaultName]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSave = useCallback(() => {
    onSave(name.trim() || 'Untitled Project');
    onClose();
  }, [name, onSave, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSave();
    },
    [handleSave]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-zinc-900 rounded-xl shadow-2xl border border-zinc-700 w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <Save className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-white">{title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Project Name</h3>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Untitled Project"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors">
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

export default SaveProjectModal;
