/**
 * Filter Gallery Catalog
 *
 * Curated list of artistic / sketch / stylize / brush-stroke / texture filters
 * exposed through the Filter Gallery modal. Each entry references an existing
 * function in `@/features/image-editor/canvas/filters` so the modal stays a pure presentation
 * layer.
 */

import * as F from '@/features/image-editor/canvas/filters';

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

export const GALLERY_CATEGORIES: { id: GalleryCategory; label: string }[] = [
  { id: 'artistic', label: 'Artistic' },
  { id: 'sketch', label: 'Sketch' },
  { id: 'stylize', label: 'Stylize' },
  { id: 'brush', label: 'Brush Strokes' },
  { id: 'texture', label: 'Texture' },
];

export const GALLERY_FILTERS: GalleryFilter[] = [
  // ==================== Artistic ====================
  { id: 'coloredPencil', label: 'Colored Pencil', category: 'artistic', apply: (d) => F.coloredPencil(d) },
  { id: 'cutout', label: 'Cutout', category: 'artistic', apply: (d) => F.cutout(d) },
  { id: 'dryBrush', label: 'Dry Brush', category: 'artistic', apply: (d) => F.dryBrush(d) },
  { id: 'filmGrain', label: 'Film Grain', category: 'artistic', apply: (d) => F.filmGrain(d) },
  { id: 'fresco', label: 'Fresco', category: 'artistic', apply: (d) => F.fresco(d) },
  { id: 'neonGlow', label: 'Neon Glow', category: 'artistic', apply: (d) => F.neonGlow(d) },
  { id: 'paintDaubs', label: 'Paint Daubs', category: 'artistic', apply: (d) => F.paintDaubs(d) },
  { id: 'paletteKnife', label: 'Palette Knife', category: 'artistic', apply: (d) => F.paletteKnife(d) },
  { id: 'plasticWrap', label: 'Plastic Wrap', category: 'artistic', apply: (d) => F.plasticWrap(d) },
  { id: 'posterEdges', label: 'Poster Edges', category: 'artistic', apply: (d) => F.posterEdges(d) },
  { id: 'roughPastels', label: 'Rough Pastels', category: 'artistic', apply: (d) => F.roughPastels(d) },
  { id: 'smudgeStick', label: 'Smudge Stick', category: 'artistic', apply: (d) => F.smudgeStick(d) },
  { id: 'sponge', label: 'Sponge', category: 'artistic', apply: (d) => F.sponge(d) },
  { id: 'underpainting', label: 'Underpainting', category: 'artistic', apply: (d) => F.underpainting(d) },
  { id: 'watercolor', label: 'Watercolor', category: 'artistic', apply: (d) => F.watercolor(d) },

  // ==================== Sketch ====================
  { id: 'basRelief', label: 'Bas Relief', category: 'sketch', apply: (d) => F.basRelief(d) },
  { id: 'chalkAndCharcoal', label: 'Chalk & Charcoal', category: 'sketch', apply: (d) => F.chalkAndCharcoal(d) },
  { id: 'charcoal', label: 'Charcoal', category: 'sketch', apply: (d) => F.charcoal(d) },
  { id: 'chrome', label: 'Chrome', category: 'sketch', apply: (d) => F.chrome(d) },
  { id: 'conteCrayon', label: 'Conté Crayon', category: 'sketch', apply: (d) => F.conteCrayon(d) },
  { id: 'graphicPen', label: 'Graphic Pen', category: 'sketch', apply: (d) => F.graphicPen(d) },
  { id: 'halftonePattern', label: 'Halftone Pattern', category: 'sketch', apply: (d) => F.halftonePattern(d) },
  { id: 'notePaper', label: 'Note Paper', category: 'sketch', apply: (d) => F.notePaper(d) },
  { id: 'photocopy', label: 'Photocopy', category: 'sketch', apply: (d) => F.photocopy(d) },
  { id: 'plaster', label: 'Plaster', category: 'sketch', apply: (d) => F.plaster(d) },
  { id: 'reticulation', label: 'Reticulation', category: 'sketch', apply: (d) => F.reticulation(d) },
  { id: 'stamp', label: 'Stamp', category: 'sketch', apply: (d) => F.stamp(d) },
  { id: 'tornEdges', label: 'Torn Edges', category: 'sketch', apply: (d) => F.tornEdges(d) },
  { id: 'waterPaper', label: 'Water Paper', category: 'sketch', apply: (d) => F.waterPaper(d) },

  // ==================== Stylize ====================
  { id: 'emboss', label: 'Emboss', category: 'stylize', apply: (d) => F.emboss(d) },
  { id: 'solarize', label: 'Solarize', category: 'stylize', apply: (d) => F.solarize(d) },
  { id: 'findEdges', label: 'Find Edges', category: 'stylize', apply: (d) => F.findEdges(d) },
  { id: 'traceContour', label: 'Trace Contour', category: 'stylize', apply: (d) => F.traceContour(d) },
  { id: 'diffuse', label: 'Diffuse', category: 'stylize', apply: (d) => F.diffuse(d) },
  { id: 'glowingEdges', label: 'Glowing Edges', category: 'stylize', apply: (d) => F.glowingEdges(d) },
  { id: 'tiles', label: 'Tiles', category: 'stylize', apply: (d) => F.tiles(d) },
  { id: 'wind', label: 'Wind', category: 'stylize', apply: (d) => F.wind(d) },
  { id: 'extrude', label: 'Extrude', category: 'stylize', apply: (d) => F.extrude(d) },
  { id: 'oilPaint', label: 'Oil Paint', category: 'stylize', apply: (d) => F.oilPaint(d) },

  // ==================== Brush Strokes ====================
  { id: 'accentedEdges', label: 'Accented Edges', category: 'brush', apply: (d) => F.accentedEdges(d) },
  { id: 'angledStrokes', label: 'Angled Strokes', category: 'brush', apply: (d) => F.angledStrokes(d) },
  { id: 'crosshatch', label: 'Crosshatch', category: 'brush', apply: (d) => F.crosshatch(d) },
  { id: 'darkStrokes', label: 'Dark Strokes', category: 'brush', apply: (d) => F.darkStrokes(d) },
  { id: 'inkOutlines', label: 'Ink Outlines', category: 'brush', apply: (d) => F.inkOutlines(d) },
  { id: 'spatter', label: 'Spatter', category: 'brush', apply: (d) => F.spatter(d) },
  { id: 'sprayedStrokes', label: 'Sprayed Strokes', category: 'brush', apply: (d) => F.sprayedStrokes(d) },
  { id: 'sumie', label: 'Sumi-e', category: 'brush', apply: (d) => F.sumie(d) },

  // ==================== Texture ====================
  { id: 'grain', label: 'Grain', category: 'texture', apply: (d) => F.grain(d) },
  { id: 'mosaicTiles', label: 'Mosaic Tiles', category: 'texture', apply: (d) => F.mosaicTiles(d) },
  { id: 'patchwork', label: 'Patchwork', category: 'texture', apply: (d) => F.patchwork(d) },
  { id: 'stainedGlass', label: 'Stained Glass', category: 'texture', apply: (d) => F.stainedGlass(d) },
  { id: 'texturizer', label: 'Texturizer', category: 'texture', apply: (d) => F.texturizer(d) },
  { id: 'craquelure', label: 'Craquelure', category: 'texture', apply: (d) => F.craquelure(d) },
];

export function getFiltersByCategory(category: GalleryCategory): GalleryFilter[] {
  return GALLERY_FILTERS.filter((f) => f.category === category);
}
