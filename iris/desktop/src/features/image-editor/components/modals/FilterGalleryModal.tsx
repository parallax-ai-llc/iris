/**
 * FilterGalleryModal
 *
 * Photoshop-style Filter Gallery: preview pane on the left, category tabs and
 * thumbnail grid on the right. Thumbnails are generated lazily per category to
 * avoid blocking the main thread on open.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/shared/components/ui/Modal';
import { cn } from '@/shared/lib/utils';
import {
  GALLERY_CATEGORIES,
  GALLERY_FILTERS,
  getFiltersByCategory,
  type GalleryCategory,
  type GalleryFilter,
} from '@/features/image-editor/canvas/filterGalleryCatalog';

const THUMB_SIZE = 128;
const PREVIEW_MAX = 512;

interface FilterGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Raw source canvas — usually the active layer's raster content */
  sourceCanvas: HTMLCanvasElement | null;
  onApply: (filterFn: (d: ImageData) => ImageData, label: string) => void;
}

// ---------- helpers ----------

function drawScaledToFit(
  source: HTMLCanvasElement,
  destW: number,
  destH: number
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = destW;
  c.height = destH;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const scale = Math.min(destW / source.width, destH / source.height);
  const w = source.width * scale;
  const h = source.height * scale;
  ctx.drawImage(source, (destW - w) / 2, (destH - h) / 2, w, h);
  return c;
}

function drawScaledToCover(
  source: HTMLCanvasElement,
  destW: number,
  destH: number
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = destW;
  c.height = destH;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const scale = Math.max(destW / source.width, destH / source.height);
  const w = source.width * scale;
  const h = source.height * scale;
  ctx.drawImage(source, (destW - w) / 2, (destH - h) / 2, w, h);
  return c;
}

function generateThumbnail(
  source: HTMLCanvasElement,
  filter: GalleryFilter
): string {
  const base = drawScaledToCover(source, THUMB_SIZE, THUMB_SIZE);
  const ctx = base.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '';
  try {
    const data = ctx.getImageData(0, 0, THUMB_SIZE, THUMB_SIZE);
    const result = filter.apply(data);
    ctx.putImageData(result, 0, 0);
    return base.toDataURL();
  } catch {
    return base.toDataURL();
  }
}

function generatePreview(
  source: HTMLCanvasElement,
  filter: GalleryFilter | null
): string {
  // Downscale for preview speed while keeping aspect ratio.
  const scale = Math.min(
    1,
    PREVIEW_MAX / Math.max(source.width, source.height)
  );
  const destW = Math.max(1, Math.round(source.width * scale));
  const destH = Math.max(1, Math.round(source.height * scale));
  const base = drawScaledToFit(source, destW, destH);
  if (!filter) return base.toDataURL();
  const ctx = base.getContext('2d', { willReadFrequently: true });
  if (!ctx) return base.toDataURL();
  try {
    const data = ctx.getImageData(0, 0, destW, destH);
    const result = filter.apply(data);
    ctx.putImageData(result, 0, 0);
    return base.toDataURL();
  } catch {
    return base.toDataURL();
  }
}

// ---------- component ----------

export const FilterGalleryModal = memo(function FilterGalleryModal({
  isOpen,
  onClose,
  sourceCanvas,
  onApply,
}: FilterGalleryModalProps) {
  const [activeCategory, setActiveCategory] = useState<GalleryCategory>('artistic');
  const [selectedFilterId, setSelectedFilterId] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const generationTokenRef = useRef(0);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedFilterId(null);
      setThumbnails({});
      setPreviewUrl(null);
      setOriginalUrl(null);
      setShowOriginal(false);
      setActiveCategory('artistic');
    }
  }, [isOpen]);

  // Cache the unfiltered preview once per open
  useEffect(() => {
    if (!isOpen || !sourceCanvas) return;
    setOriginalUrl(generatePreview(sourceCanvas, null));
  }, [isOpen, sourceCanvas]);

  // Lazily generate thumbnails for the active category
  useEffect(() => {
    if (!isOpen || !sourceCanvas) return;
    const tokenRef = generationTokenRef;
    const token = ++tokenRef.current;
    const filters = getFiltersByCategory(activeCategory);
    let i = 0;

    const tick = () => {
      if (token !== tokenRef.current) return;
      if (i >= filters.length) return;
      const f = filters[i++];
      setThumbnails((prev) => {
        if (prev[f.id]) return prev;
        const url = generateThumbnail(sourceCanvas, f);
        return { ...prev, [f.id]: url };
      });
      // Yield to keep the UI responsive.
      setTimeout(tick, 0);
    };

    tick();
    return () => {
      // Invalidate any in-flight generation for this category
      tokenRef.current++;
    };
  }, [isOpen, sourceCanvas, activeCategory]);

  // Generate preview on filter selection
  useEffect(() => {
    if (!sourceCanvas) return;
    if (!selectedFilterId) {
      setPreviewUrl(null);
      return;
    }
    const filter = GALLERY_FILTERS.find((f) => f.id === selectedFilterId);
    if (!filter) return;
    // Defer to avoid blocking the click
    const id = setTimeout(() => {
      setPreviewUrl(generatePreview(sourceCanvas, filter));
    }, 0);
    return () => clearTimeout(id);
  }, [selectedFilterId, sourceCanvas]);

  // Spacebar hold to show original
  useEffect(() => {
    if (!isOpen) return;
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !showOriginal) {
        e.preventDefault();
        setShowOriginal(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setShowOriginal(false);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [isOpen, showOriginal]);

  const activeFilters = useMemo(
    () => getFiltersByCategory(activeCategory),
    [activeCategory]
  );

  const handleApply = useCallback(() => {
    const selected = GALLERY_FILTERS.find((f) => f.id === selectedFilterId);
    if (!selected) return;
    onApply(selected.apply, selected.label);
    onClose();
  }, [selectedFilterId, onApply, onClose]);

  if (!isOpen) return null;

  const displayUrl = showOriginal ? originalUrl : previewUrl ?? originalUrl;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Filter Gallery"
      description="Preview and apply artistic filters"
      size="full"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!selectedFilterId}
            className="px-4 py-2 rounded-lg bg-white text-zinc-900 hover:bg-zinc-100 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply Filter
          </button>
        </>
      }
    >
      <div className="flex gap-4 h-[60vh] min-h-[400px]">
        {/* Preview pane */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 bg-zinc-950 rounded-lg border border-zinc-800 flex items-center justify-center overflow-hidden">
            {displayUrl ? (
              <img
                src={displayUrl}
                alt="preview"
                className="max-w-full max-h-full object-contain"
                draggable={false}
              />
            ) : (
              <div className="text-xs text-zinc-600">
                {sourceCanvas ? 'Select a filter to preview' : 'No active layer'}
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-500">
            <span>
              {showOriginal
                ? 'Original'
                : selectedFilterId
                  ? GALLERY_FILTERS.find((f) => f.id === selectedFilterId)?.label
                  : 'No filter selected'}
            </span>
            <span>Hold Space to compare with original</span>
          </div>
        </div>

        {/* Category tabs + thumbnail grid */}
        <div className="w-[360px] flex-shrink-0 flex flex-col min-h-0">
          <div className="flex gap-1 mb-3 overflow-x-auto scrollbar-none flex-shrink-0">
            {GALLERY_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-[11px] whitespace-nowrap transition-colors flex-shrink-0',
                  activeCategory === cat.id
                    ? 'bg-white/15 text-white border border-white/25'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white border border-transparent'
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <div className="grid grid-cols-3 gap-2">
              {activeFilters.map((f) => {
                const thumb = thumbnails[f.id];
                const isSelected = selectedFilterId === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFilterId(f.id)}
                    className={cn(
                      'group relative rounded-md overflow-hidden border transition-colors bg-zinc-950',
                      isSelected
                        ? 'border-white/50 ring-2 ring-white/30'
                        : 'border-zinc-800 hover:border-zinc-600'
                    )}
                    title={f.label}
                  >
                    <div className="aspect-square w-full bg-zinc-900 flex items-center justify-center">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={f.label}
                          className="w-full h-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-zinc-700 border-t-zinc-400 animate-spin" />
                      )}
                    </div>
                    <div
                      className={cn(
                        'absolute inset-x-0 bottom-0 px-1.5 py-1 text-[10px] text-white truncate text-center',
                        'bg-gradient-to-t from-black/80 to-transparent'
                      )}
                    >
                      {f.label}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
});

export default FilterGalleryModal;
