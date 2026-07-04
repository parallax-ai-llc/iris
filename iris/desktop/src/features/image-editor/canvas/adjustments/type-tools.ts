/**
 * Type tools (vertical type layout, type mask, glyph set)
 *
 * Part of the image-editor adjustments library (see ./index.ts barrel),
 * extracted from the former monolithic adjustments.ts.
 */

/**
 * Layout text characters vertically (top-to-bottom).
 * Returns character positions for vertical rendering.
 */
export function verticalTypeLayout(
  text: string,
  x: number,
  y: number,
  charHeight: number,
  charSpacing = 0
): Array<{ char: string; x: number; y: number }> {
  const result: Array<{ char: string; x: number; y: number }> = [];
  let currentY = y;
  for (const ch of text) {
    if (ch === '\n') {
      currentY = y;
      // For vertical, newline = new column (move left for CJK convention)
      continue;
    }
    result.push({ char: ch, x, y: currentY });
    currentY += charHeight + charSpacing;
  }
  return result;
}

/**
 * Create a selection mask from text shape.
 * Returns a Uint8ClampedArray mask where text pixels are 255.
 * Uses a simplified rasterization based on character bounding boxes.
 */
export function typeMask(
  width: number,
  height: number,
  text: string,
  fontSize: number,
  x: number,
  y: number,
  vertical = false
): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(width * height);
  const charW = Math.ceil(fontSize * 0.6);
  const charH = fontSize;

  if (vertical) {
    let cy = y;
    for (const ch of text) {
      if (ch === ' ' || ch === '\n') { cy += charH; continue; }
      for (let py = Math.max(0, cy); py < Math.min(height, cy + charH); py++) {
        for (let px = Math.max(0, x); px < Math.min(width, x + charW); px++) {
          mask[py * width + px] = 255;
        }
      }
      cy += charH;
    }
  } else {
    let cx = x;
    for (const ch of text) {
      if (ch === ' ') { cx += charW; continue; }
      if (ch === '\n') { cx = x; continue; }
      for (let py = Math.max(0, y); py < Math.min(height, y + charH); py++) {
        for (let px = Math.max(0, cx); px < Math.min(width, cx + charW); px++) {
          mask[py * width + px] = 255;
        }
      }
      cx += charW;
    }
  }
  return mask;
}

export interface GlyphInfo {
  char: string;
  unicode: number;
  name: string;
  category: string;
}

/**
 * Get a basic glyph set for the Glyphs panel.
 * Returns common special characters, symbols, and dingbats.
 */
export function getBasicGlyphSet(): GlyphInfo[] {
  const glyphs: GlyphInfo[] = [];
  // Latin punctuation & symbols
  const ranges: Array<[number, number, string]> = [
    [0x00A0, 0x00FF, 'Latin Supplement'],
    [0x2000, 0x206F, 'General Punctuation'],
    [0x2190, 0x21FF, 'Arrows'],
    [0x2200, 0x22FF, 'Math Operators'],
    [0x2600, 0x26FF, 'Misc Symbols'],
  ];
  for (const [start, end, category] of ranges) {
    for (let code = start; code <= end; code++) {
      const ch = String.fromCodePoint(code);
      glyphs.push({ char: ch, unicode: code, name: `U+${code.toString(16).toUpperCase().padStart(4, '0')}`, category });
    }
  }
  return glyphs;
}
