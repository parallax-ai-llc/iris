'use client';

import { useState } from 'react';
import { cn } from '@editor/lib/convert/string';
import { HardDrive, X } from 'lucide-react';
import StorageBrowserModal from '@editor/components/StorageBrowserModal';
import { StorageFile } from '@editor/lib/apis/storage-api-client';
import { PortType } from '../../../../constants/node-definitions';
import { PORT_TYPE_EXTENSIONS } from './constants';

interface StorageInputContentProps {
  inputType: PortType;
  storageAssetId: string | undefined;
  displayValue: string | undefined;
  onStorageSelect: (path: string, name: string) => void;
  onClearSelection: () => void;
}

export function StorageInputContent({
  inputType,
  storageAssetId,
  displayValue,
  onStorageSelect,
  onClearSelection,
}: StorageInputContentProps) {
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);

  const handleStorageSelect = (file: StorageFile) => {
    onStorageSelect(file.path, file.name);
    setIsStorageModalOpen(false);
  };

  return (
    <div className="space-y-2">
      {/* Selected file display */}
      {storageAssetId && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-slate-400/10 border border-slate-400/30">
          <HardDrive size={14} className="text-slate-300 flex-shrink-0" />
          <span className="text-xs text-slate-200 truncate flex-1">
            {displayValue || 'Selected file'}
          </span>
          <button
            onClick={onClearSelection}
            className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors flex-shrink-0"
            title="Clear selection"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Browse button */}
      <button
        onClick={() => setIsStorageModalOpen(true)}
        className={cn(
          'w-full flex items-center justify-center gap-2 py-3 rounded-md',
          'border border-dashed border-white/20 hover:border-white/40',
          'text-xs text-white/50 hover:text-white/70',
          'transition-colors cursor-pointer'
        )}
      >
        <HardDrive size={16} />
        <span>{storageAssetId ? 'Change File' : 'Browse Storage'}</span>
      </button>

      {/* Storage Browser Modal */}
      <StorageBrowserModal
        isOpen={isStorageModalOpen}
        onClose={() => setIsStorageModalOpen(false)}
        onSelect={handleStorageSelect}
        allowedExtensions={PORT_TYPE_EXTENSIONS[inputType]}
      />
    </div>
  );
}
