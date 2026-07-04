/**
 * Image Filters Library — barrel.
 *
 * Filters are grouped into category modules so a new filter is added by
 * editing exactly one category file (implementation + gallery registration).
 * See ./registry.ts for the Filter Gallery registry and CONTRIBUTING for the
 * step-by-step guide.
 */
export * from './core';
export * from './blur';
export * from './sharpen';
export * from './noise';
export * from './color';
export * from './distort';
export * from './liquify';
export * from './lens';
export * from './artistic';
export * from './sketch';
export * from './stylize';
export * from './stylize-structural';
export * from './brush-strokes';
export * from './pixelate';
export * from './texture';
export * from './texture-surface';
export * from './render';
export * from './utility';
export * from './types';
export { GALLERY_FILTERS, GALLERY_CATEGORIES, getFiltersByCategory } from './registry';
