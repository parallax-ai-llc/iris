/**
 * StorageAssetPickerModal - Modal to select assets from library storage
 * Used for selecting reference images in Image-to-Image and Image-to-Video workflows
 */

import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ImageIcon,
  Video,
  Search,
  X,
  Check,
  Loader2,
  FolderOpen,
  ArrowUpDown,
  ChevronDown,
} from 'lucide-react';
import { cn, formatFileSize } from '@/shared/lib/utils';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { CachedImage } from '@/shared/components/common';
import { getAssets } from '@/shared/api/asset.api';
import type { IrisAsset, AssetType } from '@/shared/api/types';

// ==================== Types ====================

interface StorageAssetPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: IrisAsset) => void;
  assetType?: 'IMAGE' | 'VIDEO' | 'all';
  title?: string;
  description?: string;
}

type SortOption = 'newest' | 'oldest' | 'name-asc' | 'name-desc';

// Sort option ids; labels are looked up via i18n at render time.
const SORT_OPTIONS: SortOption[] = ['newest', 'oldest', 'name-asc', 'name-desc'];

const SORT_I18N_KEY: Record<SortOption, string> = {
  newest: 'newest',
  oldest: 'oldest',
  'name-asc': 'nameAsc',
  'name-desc': 'nameDesc',
};

// ==================== Asset Grid Item ====================

interface AssetGridItemProps {
  asset: IrisAsset;
  isSelected: boolean;
  onSelect: () => void;
}

const AssetGridItem = memo(function AssetGridItem({
  asset,
  isSelected,
  onSelect,
}: AssetGridItemProps) {
  const { t } = useTranslation('common');
  const isVideo = asset.assetType === 'VIDEO';

  return (
    <button
      onClick={onSelect}
      className={cn(
        'group relative aspect-square rounded-lg overflow-hidden',
        'bg-zinc-800 border-2 transition-all cursor-pointer',
        'focus:outline-none focus:ring-2 focus:ring-white/30',
        isSelected
          ? 'border-white/50 ring-2 ring-white/20'
          : 'border-transparent hover:border-zinc-600'
      )}
    >
      {/* Thumbnail */}
      <CachedImage
        asset={asset}
        type="thumbnail"
        className="w-full h-full object-cover"
        fallback={
          isVideo ? (
            <Video className="w-8 h-8 text-zinc-600" />
          ) : (
            <ImageIcon className="w-8 h-8 text-zinc-600" />
          )
        }
      />

      {/* Type badge */}
      <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-white/80">
        {isVideo ? t('storage.badgeVideo') : t('storage.badgeImage')}
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute inset-0 bg-white/10 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
            <Check className="w-6 h-6 text-zinc-900" />
          </div>
        </div>
      )}

      {/* Info overlay on hover */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent',
          'opacity-0 group-hover:opacity-100 transition-opacity',
          isSelected && 'opacity-100'
        )}
      >
        <p className="text-xs text-white truncate">{asset.name}</p>
        <p className="text-[10px] text-zinc-400">
          {formatFileSize(asset.sizeBytes)}
        </p>
      </div>
    </button>
  );
});

// ==================== Empty State ====================

const EmptyState = memo(function EmptyState({
  assetType,
}: {
  assetType: 'IMAGE' | 'VIDEO' | 'all';
}) {
  const { t } = useTranslation('common');
  const hintKey =
    assetType === 'IMAGE'
      ? 'storage.emptyHintImages'
      : assetType === 'VIDEO'
        ? 'storage.emptyHintVideos'
        : 'storage.emptyHintAll';
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4">
        <FolderOpen className="w-8 h-8 text-zinc-500" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{t('storage.emptyTitle')}</h3>
      <p className="text-sm text-zinc-400 max-w-sm">{t(hintKey)}</p>
    </div>
  );
});

// ==================== Main Component ====================

export const StorageAssetPickerModal = memo(function StorageAssetPickerModal({
  isOpen,
  onClose,
  onSelect,
  assetType = 'IMAGE',
  title,
  description,
}: StorageAssetPickerModalProps) {
  const { t } = useTranslation('common');
  // State
  const [assets, setAssets] = useState<IrisAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [selectedAsset, setSelectedAsset] = useState<IrisAsset | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Fetch assets when modal opens or filters change
  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Map sort options to API params
        let apiSortBy: 'name' | 'createdAt' | 'updatedAt' | 'sizeBytes' =
          'createdAt';
        let apiSortOrder: 'asc' | 'desc' = 'desc';

        switch (sortBy) {
          case 'newest':
            apiSortBy = 'createdAt';
            apiSortOrder = 'desc';
            break;
          case 'oldest':
            apiSortBy = 'createdAt';
            apiSortOrder = 'asc';
            break;
          case 'name-asc':
            apiSortBy = 'name';
            apiSortOrder = 'asc';
            break;
          case 'name-desc':
            apiSortBy = 'name';
            apiSortOrder = 'desc';
            break;
        }

        const response = await getAssets({
          type: assetType === 'all' ? undefined : (assetType as AssetType),
          sortBy: apiSortBy,
          sortOrder: apiSortOrder,
          page,
          limit: 30,
        });

        if (response) {
          setAssets(response.assets);
          setTotalPages(response.totalPages);
        }
      } catch (error) {
        console.error('Failed to fetch assets:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [isOpen, assetType, sortBy, page]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedAsset(null);
      setSearchQuery('');
      setPage(1);
    }
  }, [isOpen]);

  // Filter assets by search query
  const filteredAssets = useMemo(() => {
    if (!searchQuery.trim()) return assets;

    const query = searchQuery.toLowerCase();
    return assets.filter(
      (asset) =>
        asset.name?.toLowerCase().includes(query) ||
        asset.path?.toLowerCase().includes(query)
    );
  }, [assets, searchQuery]);

  // Handlers
  const handleSelect = useCallback((asset: IrisAsset) => {
    setSelectedAsset(asset);
  }, []);

  const handleConfirm = useCallback(() => {
    if (selectedAsset) {
      onSelect(selectedAsset);
      onClose();
    }
  }, [selectedAsset, onSelect, onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title ?? t('storage.pickerTitle')}
      description={description ?? t('storage.pickerDescription')}
      size="full"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('buttons.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!selectedAsset}
          >
            {t('buttons.select')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col h-[60vh]">
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('storage.searchPlaceholder')}
              className={cn(
                'w-full pl-9 pr-8 py-2 rounded-lg',
                'bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500',
                'focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent',
                'text-sm'
              )}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-700 rounded"
              >
                <X className="w-3 h-3 text-zinc-400" />
              </button>
            )}
          </div>

          {/* Sort dropdown */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className={cn(
                'appearance-none pl-9 pr-8 py-2 rounded-lg cursor-pointer',
                'bg-zinc-800 border border-zinc-700 text-white',
                'focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent',
                'text-sm'
              )}
            >
              {SORT_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {t(`sort.${SORT_I18N_KEY[value]}`)}
                </option>
              ))}
            </select>
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
          </div>
        </div>

        {/* Asset Grid */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
            </div>
          ) : filteredAssets.length === 0 ? (
            <EmptyState assetType={assetType} />
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
              {filteredAssets.map((asset) => (
                <AssetGridItem
                  key={asset.id}
                  asset={asset}
                  isSelected={selectedAsset?.id === asset.id}
                  onSelect={() => handleSelect(asset)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-zinc-800">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
            >
              {t('buttons.previous')}
            </Button>
            <span className="text-sm text-zinc-400">
              {t('storage.pageOf', { page, total: totalPages })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || isLoading}
            >
              {t('buttons.next')}
            </Button>
          </div>
        )}

        {/* Selected asset preview */}
        {selectedAsset && (
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <div className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg">
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0">
                <CachedImage
                  asset={selectedAsset}
                  type="thumbnail"
                  className="w-full h-full object-cover"
                  fallback={
                    selectedAsset.assetType === 'VIDEO' ? (
                      <Video className="w-6 h-6 text-zinc-600" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-zinc-600" />
                    )
                  }
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {selectedAsset.name}
                </p>
                <p className="text-xs text-zinc-400">
                  {selectedAsset.assetType === 'VIDEO'
                    ? t('storage.assetTypeVideo')
                    : t('storage.assetTypeImage')}{' '}
                  • {formatFileSize(selectedAsset.sizeBytes)}
                </p>
              </div>
              <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
});

export default StorageAssetPickerModal;
