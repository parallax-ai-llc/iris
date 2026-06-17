/**
 * LibraryPage — Public community library (Iris design)
 */

import { memo, useCallback, useEffect, useState, useRef } from 'react';
import { Library, RefreshCw, X, Play } from 'lucide-react';
import {
  fetchPublicLibraryItems,
  type PublicLibraryItem,
} from '@/shared/api/public-library.api';

type FilterOption = 'ALL' | 'IMAGE' | 'VIDEO';

const FILTER_OPTIONS: { value: FilterOption; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'IMAGE', label: 'Images' },
  { value: 'VIDEO', label: 'Videos' },
];

const PAGE_LIMIT = 30;

interface LibraryItemCardProps {
  item: PublicLibraryItem;
  onClick: (item: PublicLibraryItem) => void;
}

const LibraryItemCard = memo(function LibraryItemCard({ item, onClick }: LibraryItemCardProps) {
  const [loaded, setLoaded] = useState(false);
  const thumbnailUrl = item.publicThumbnailUrl || item.publicMediaUrl;

  return (
    <button onClick={() => onClick(item)} className="dt-libcard">
      {item.assetType === 'IMAGE' ? (
        <img
          src={thumbnailUrl}
          alt={item.prompt || 'Library item'}
          onLoad={() => setLoaded(true)}
          loading="lazy"
          style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.2s' }}
        />
      ) : thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={item.prompt || 'Video'}
          onLoad={() => setLoaded(true)}
          loading="lazy"
          style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.2s' }}
        />
      ) : (
        <div className="img-ph w-full h-full flex items-center justify-center">
          <Play className="w-8 h-8" style={{ color: 'var(--text-4)' }} />
        </div>
      )}

      {item.assetType === 'VIDEO' && (
        <div
          className="absolute top-2 right-2 mono"
          style={{
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 9.5,
            color: '#fff',
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(8px)',
          }}
        >
          VIDEO
        </div>
      )}

      <div className="dt-libcard-overlay">
        <div className="truncate">{item.prompt || 'Untitled'}</div>
      </div>
    </button>
  );
});

interface DetailModalProps {
  item: PublicLibraryItem;
  onClose: () => void;
}

const DetailModal = memo(function DetailModal({ item, onClose }: DetailModalProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="dt-lightbox-backdrop" onClick={onClose}>
      <div className="dt-lightbox" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="dt-lightbox-close">
          <X className="w-4 h-4" />
        </button>

        <div className="dt-lightbox-media">
          {item.assetType === 'IMAGE' ? (
            <img src={item.publicMediaUrl} alt={item.prompt || 'Library item'} />
          ) : (
            <video src={item.publicMediaUrl} controls autoPlay style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          )}
        </div>

        <div className="dt-lightbox-meta">
          {item.prompt && (
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 10 }} className="line-clamp-3">
              {item.prompt}
            </p>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="pill pill-iris">{item.assetType}</span>
            {item.modelId && <span className="pill">Model · {item.modelId}</span>}
            {item.aspectRatio && <span className="pill">{item.aspectRatio}</span>}
            {item.width && item.height && (
              <span className="pill">
                {item.width} × {item.height}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button className="btn btn-primary">Remix</button>
            <button className="btn">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
});

export const LibraryPage = memo(function LibraryPage() {
  const [items, setItems] = useState<PublicLibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [filterBy, setFilterBy] = useState<FilterOption>('ALL');
  const [selectedItem, setSelectedItem] = useState<PublicLibraryItem | null>(null);
  const loaderRef = useRef<HTMLDivElement>(null);

  const fetchItems = useCallback(
    async (nextPage: number, filter: FilterOption, append: boolean) => {
      if (nextPage === 1) setIsLoading(true);
      else setIsLoadingMore(true);

      const result = await fetchPublicLibraryItems({
        assetType: filter === 'ALL' ? undefined : filter,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        page: nextPage,
        limit: PAGE_LIMIT,
      });

      if (result) {
        setItems((prev) => (append ? [...prev, ...result.items] : result.items));
        setHasMore(result.hasMore);
        setPage(nextPage);
      }

      setIsLoading(false);
      setIsLoadingMore(false);
    },
    []
  );

  useEffect(() => {
    fetchItems(1, filterBy, false);
  }, [filterBy, fetchItems]);

  useEffect(() => {
    if (!loaderRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          fetchItems(page + 1, filterBy, true);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, page, filterBy, fetchItems]);

  const handleRefresh = useCallback(() => {
    fetchItems(1, filterBy, false);
  }, [filterBy, fetchItems]);

  return (
    <div className="dt-page-wide">
      <div className="dt-page-head">
        <div>
          <div className="dt-page-eyebrow">Community</div>
          <h1 className="dt-page-title">
            Community <em>shared creations</em>
          </h1>
          <p className="dt-page-sub">
            Browse images and videos shared by the Iris community. Remix or save your favorites.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="btn"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="dt-seg">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterBy(opt.value)}
              className="dt-seg-item"
              data-active={filterBy === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="t-eyebrow" style={{ marginLeft: 'auto' }}>
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      {isLoading ? (
        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}
        >
          {Array.from({ length: 18 }).map((_, i) => (
            <div
              key={i}
              className="img-ph"
              style={{ aspectRatio: '1', borderRadius: 16 }}
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div
          className="iris-card flex flex-col items-center justify-center text-center"
          style={{ padding: 48 }}
        >
          <Library className="w-12 h-12 mb-3" style={{ color: 'var(--text-4)' }} />
          <p style={{ fontSize: 13.5, color: 'var(--text-2)' }}>No items in the library yet</p>
        </div>
      ) : (
        <>
          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}
          >
            {items.map((item) => (
              <LibraryItemCard key={item.id} item={item} onClick={setSelectedItem} />
            ))}
          </div>

          <div ref={loaderRef} className="mt-4 flex justify-center">
            {isLoadingMore && (
              <div
                className="flex items-center gap-2 mono"
                style={{ fontSize: 11, color: 'var(--text-3)' }}
              >
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Loading more…
              </div>
            )}
          </div>
        </>
      )}

      {selectedItem && (
        <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
});

export default LibraryPage;
