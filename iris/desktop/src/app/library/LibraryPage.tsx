/**
 * LibraryPage — Public community library (Iris design)
 */

import { memo, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useShortcutLayer } from '@/shared/lib/shortcuts';
import { useUIStore } from '@/shared/stores/ui.store';
import { useImageStore } from '@/features/images/stores/image.store';
import { useVideoStore } from '@/features/videos/stores/video.store';
import { Library, RefreshCw, X, Play, Search } from 'lucide-react';
import {
  fetchPublicLibraryItems,
  type PublicLibraryItem,
} from '@/shared/api/public-library.api';
import { filterLibraryItems } from '@/features/library/lib/publicLibrarySearch';

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
  onPrev?: () => void;
  onNext?: () => void;
  onRemix: (item: PublicLibraryItem) => void;
}

const DetailModal = memo(function DetailModal({ item, onClose, onPrev, onNext, onRemix }: DetailModalProps) {
  // Modal layer: blocks page/global shortcuts underneath while it is open.
  useShortcutLayer(
    'modal',
    [
      { keys: 'Escape', run: onClose },
      { keys: 'ArrowLeft', run: () => (onPrev ? onPrev() : false) },
      { keys: 'ArrowRight', run: () => (onNext ? onNext() : false) },
    ],
    { blocking: true },
  );

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
            <button className="btn btn-primary" onClick={() => onRemix(item)}>Remix</button>
          </div>
        </div>
      </div>
    </div>
  );
});

export const LibraryPage = memo(function LibraryPage() {
  const { t } = useTranslation('common');
  const [items, setItems] = useState<PublicLibraryItem[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [filterBy, setFilterBy] = useState<FilterOption>('ALL');
  const [selectedItem, setSelectedItem] = useState<PublicLibraryItem | null>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // The list endpoint has no search parameter: filter what has been loaded.
  const isSearching = query.trim().length > 0;
  const visibleItems = useMemo(() => filterLibraryItems(items, query), [items, query]);
  const selectedIndex = selectedItem ? visibleItems.findIndex((i) => i.id === selectedItem.id) : -1;
  const clearSearch = useCallback(() => {
    setQuery('');
    searchRef.current?.focus();
  }, []);
  const setCurrentPage = useUIStore((s) => s.setCurrentPage);

  // Remix: start a new generation from the shared item's prompt.
  const handleRemix = useCallback(
    (item: PublicLibraryItem) => {
      const prompt = item.prompt ?? '';
      if (item.assetType === 'VIDEO') {
        useVideoStore.getState().setPrompt(prompt);
        setCurrentPage('videos');
      } else {
        useImageStore.getState().setPrompt(prompt);
        setCurrentPage('images');
      }
      setSelectedItem(null);
    },
    [setCurrentPage],
  );

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

  // Infinite scroll pauses while searching, so a narrow filter does not page
  // through the whole library behind the user's back ("Load more" instead).
  useEffect(() => {
    if (!loaderRef.current || isSearching) return;
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
  }, [hasMore, isLoadingMore, page, filterBy, fetchItems, isSearching]);

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
        <div className="relative" style={{ width: 260 }}>
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: 'var(--text-4)' }}
          />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.preventDefault();
                setQuery('');
              }
            }}
            placeholder={t('librarySearch.placeholder')}
            aria-label={t('librarySearch.label')}
            className="iris-input [&::-webkit-search-cancel-button]:appearance-none"
            style={{ paddingLeft: 32, paddingRight: 32, height: 32 }}
          />
          {query && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label={t('librarySearch.clear')}
              title={t('librarySearch.clear')}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-4)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <span className="t-eyebrow" style={{ marginLeft: 'auto' }}>
          {isSearching
            ? t('librarySearch.countFiltered', { shown: visibleItems.length, total: items.length })
            : `${items.length} ${items.length === 1 ? 'item' : 'items'}`}
        </span>
      </div>

      {isSearching && !isLoading && (
        <div
          data-testid="library-search-scope"
          className="flex items-center gap-3 mb-4"
          style={{ fontSize: 12, color: 'var(--text-3)', marginTop: -12 }}
        >
          <span>{t('librarySearch.scope', { count: items.length })}</span>
          {hasMore && (
            <button
              type="button"
              className="btn"
              onClick={() => fetchItems(page + 1, filterBy, true)}
              disabled={isLoadingMore}
            >
              {isLoadingMore && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              {t('librarySearch.loadMore')}
            </button>
          )}
        </div>
      )}

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
      ) : isSearching && visibleItems.length === 0 && items.length > 0 ? (
        <div
          data-testid="library-search-empty"
          className="iris-card flex flex-col items-center justify-center text-center"
          style={{ padding: 48 }}
        >
          <Search className="w-10 h-10 mb-3" style={{ color: 'var(--text-4)' }} />
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', marginBottom: 12 }}>
            {t('librarySearch.noResults', { query: query.trim() })}
          </p>
          <button type="button" className="btn" onClick={clearSearch}>
            {t('librarySearch.clear')}
          </button>
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
            {visibleItems.map((item) => (
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
        <DetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onPrev={selectedIndex > 0 ? () => setSelectedItem(visibleItems[selectedIndex - 1]) : undefined}
          onNext={
            selectedIndex >= 0 && selectedIndex < visibleItems.length - 1
              ? () => setSelectedItem(visibleItems[selectedIndex + 1])
              : undefined
          }
          onRemix={handleRemix}
        />
      )}
    </div>
  );
});

export default LibraryPage;
