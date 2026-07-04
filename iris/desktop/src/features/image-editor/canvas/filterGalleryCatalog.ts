/**
 * Filter Gallery Catalog — compatibility re-export.
 *
 * The catalog now lives in the filter registry: each category module under
 * ./filters/ owns its implementations and gallery registrations, and
 * ./filters/registry.ts composes them. Import from './filters' going forward.
 */

export type { GalleryCategory, GalleryFilter } from './filters/types';
export { GALLERY_CATEGORIES, GALLERY_FILTERS, getFiltersByCategory } from './filters/registry';
