/**
 * Filter Gallery registry.
 *
 * Composes the per-category `*GalleryFilters` arrays into the catalog used by
 * the Filter Gallery modal. Category modules own their registrations — adding
 * a filter never requires touching this file unless a whole new category
 * module is introduced (then it is spread in here once).
 */

import type { GalleryCategory, GalleryFilter } from './types';
import { artisticGalleryFilters } from './artistic';
import { sketchGalleryFilters } from './sketch';
import { stylizeGalleryFilters } from './stylize';
import { structuralStylizeGalleryFilters } from './stylize-structural';
import { brushStrokeGalleryFilters } from './brush-strokes';
import { textureGalleryFilters } from './texture';
import { surfaceTextureGalleryFilters } from './texture-surface';

export const GALLERY_CATEGORIES: { id: GalleryCategory; label: string }[] = [
  { id: 'artistic', label: 'Artistic' },
  { id: 'sketch', label: 'Sketch' },
  { id: 'stylize', label: 'Stylize' },
  { id: 'brush', label: 'Brush Strokes' },
  { id: 'texture', label: 'Texture' },
];

export const GALLERY_FILTERS: GalleryFilter[] = [
  ...artisticGalleryFilters,
  ...sketchGalleryFilters,
  ...stylizeGalleryFilters,
  ...structuralStylizeGalleryFilters,
  ...brushStrokeGalleryFilters,
  ...textureGalleryFilters,
  ...surfaceTextureGalleryFilters,
];

export function getFiltersByCategory(category: GalleryCategory): GalleryFilter[] {
  return GALLERY_FILTERS.filter((f) => f.category === category);
}
