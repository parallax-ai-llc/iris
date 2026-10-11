/**
 * ImageInfoModal - Modal showing image metadata and information
 */

import { memo, useEffect } from 'react';
import { X, Image as ImageIcon, FileType, Calendar, Hash, Maximize } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useCachedAssetUrl } from '@/shared/hooks/useCachedAssetUrl';
import type { IrisAsset } from '@/shared/api/types';

interface ImageInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: IrisAsset | null;
  currentDimensions?: { width: number; height: number };
}

export const ImageInfoModal = memo(function ImageInfoModal({
  isOpen,
  onClose,
  asset,
  currentDimensions,
}: ImageInfoModalProps) {
  // Get cached thumbnail URL
  const { url: thumbnailUrl } = useCachedAssetUrl(asset, {
    type: 'thumbnail',
    enabled: isOpen && !!asset,
  });

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

  if (!isOpen || !asset) return null;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get dimensions from metadata if available
  const originalWidth = asset.metadata?.width as number | undefined;
  const originalHeight = asset.metadata?.height as number | undefined;

  const infoRows = [
    { label: 'Name', value: asset.name, icon: <FileType className="w-4 h-4" /> },
    { label: 'Type', value: asset.mimeType, icon: <ImageIcon className="w-4 h-4" /> },
    ...(originalWidth && originalHeight
      ? [{ label: 'Original Size', value: `${originalWidth} × ${originalHeight} px`, icon: <Maximize className="w-4 h-4" /> }]
      : []),
    ...(currentDimensions
      ? [{ label: 'Current Size', value: `${currentDimensions.width} × ${currentDimensions.height} px`, icon: <Maximize className="w-4 h-4" /> }]
      : []),
    { label: 'File Size', value: formatFileSize(asset.sizeBytes || 0), icon: <Hash className="w-4 h-4" /> },
    { label: 'Created', value: formatDate(asset.createdAt), icon: <Calendar className="w-4 h-4" /> },
    { label: 'Modified', value: formatDate(asset.updatedAt), icon: <Calendar className="w-4 h-4" /> },
  ];

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
            <ImageIcon className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-white">Image Info</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Thumbnail preview */}
          <div className="mb-6 flex justify-center">
            <div className="w-32 h-32 bg-zinc-800 rounded-lg overflow-hidden flex items-center justify-center">
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt={asset.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <ImageIcon className="w-12 h-12 text-zinc-600" />
              )}
            </div>
          </div>

          {/* Info table */}
          <div className="space-y-3">
            {infoRows.map((row, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0"
              >
                <div className="flex items-center gap-2 text-zinc-500">
                  {row.icon}
                  <span className="text-sm">{row.label}</span>
                </div>
                <span className="text-sm text-white font-medium truncate max-w-[200px]">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            className={cn(
              'px-6 py-2 rounded-lg text-sm font-medium',
              'bg-zinc-800 text-white hover:bg-zinc-700',
              'transition-colors'
            )}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
});

export default ImageInfoModal;
