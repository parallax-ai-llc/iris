/**
 * Filter library shared types.
 *
 * A filter is a pure `(ImageData) => ImageData` function. Filters that should
 * appear in the Filter Gallery modal additionally register a `GalleryFilter`
 * entry in their category module (see ./registry.ts for the composition).
 *
 * To add a new gallery filter you edit exactly one category file:
 *   1. implement the filter function,
 *   2. append an entry to that file's `*GalleryFilters` array.
 */

export type GalleryCategory =
  | 'artistic'
  | 'sketch'
  | 'stylize'
  | 'brush'
  | 'texture';

export interface GalleryFilter {
  id: string;
  label: string;
  category: GalleryCategory;
  apply: (d: ImageData) => ImageData;
}
