/**
 * Artistic (15) + Sketch (14) Filters — Comprehensive Individual Tests
 * Also verifies Render (Phase 11) and Texture/Brush Strokes (Phase 8) filters.
 */
import { describe, it, expect } from 'vitest';
import {
  // Artistic (15)
  coloredPencil,
  cutout,
  dryBrush,
  filmGrain,
  fresco,
  neonGlow,
  paintDaubs,
  paletteKnife,
  plasticWrap,
  posterEdges,
  roughPastels,
  smudgeStick,
  sponge,
  underpainting,
  watercolor,
  // Sketch (14)
  basRelief,
  chalkAndCharcoal,
  charcoal,
  chrome,
  conteCrayon,
  graphicPen,
  halftonePattern,
  notePaper,
  photocopy,
  plaster,
  reticulation,
  stamp,
  tornEdges,
  waterPaper,
  // Render (Phase 11) — verification
  clouds,
  differenceClouds,
  fibers,
  lensFlare,
  lightingEffects,
  flame,
  tree,
  // Texture (Phase 8) — verification
  grain,
  mosaicTiles,
  patchwork,
  stainedGlass,
  texturizer,
  craquelure,
  // Brush Strokes (Phase 8) — verification
  accentedEdges,
  angledStrokes,
  crosshatch,
  darkStrokes,
  inkOutlines,
  spatter,
  sprayedStrokes,
  sumie,
} from '../filters';

// ---------------------------------------------------------------------------
// Helper: gradient 8x8 image with varied pixel values for better detection
// ---------------------------------------------------------------------------
function createGradientImage(width = 8, height = 8): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = Math.round((x / (width - 1)) * 255);       // R: left-right gradient
      data[i + 1] = Math.round((y / (height - 1)) * 255);   // G: top-bottom gradient
      data[i + 2] = Math.round(((x + y) / (width + height - 2)) * 255); // B: diagonal
      data[i + 3] = 200 + Math.round((x / (width - 1)) * 55); // A: 200-255
    }
  }
  return new ImageData(data, width, height);
}

// ---------------------------------------------------------------------------
// Reusable standard test battery
// ---------------------------------------------------------------------------

/** Filters that may modify the alpha channel as part of their algorithm */
const ALPHA_MODIFYING_FILTERS = new Set([
  'flame', 'tree', 'clouds', 'fibers',
  'mosaicTiles', 'patchwork', 'stainedGlass',
  'accentedEdges', 'spatter', 'sprayedStrokes', 'sumie',
]);

function standardTests(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 필터 함수들의 구체 파라미터 타입(number 등)을 받기 위해 any 필요 (unknown은 역변성으로 거부됨)
  fn: (img: ImageData, ...args: any[]) => ImageData,
  extraArgs: unknown[] = [],
) {
  describe(name, () => {
    it('preserves dimensions', () => {
      const img = createGradientImage(8, 6);
      const result = fn(img, ...extraArgs);
      expect(result.width).toBe(8);
      expect(result.height).toBe(6);
    });

    if (ALPHA_MODIFYING_FILTERS.has(name)) {
      it('produces non-zero alpha', () => {
        const img = createGradientImage(4, 4);
        const result = fn(img, ...extraArgs);
        let hasAlpha = false;
        for (let i = 3; i < result.data.length; i += 4) {
          if (result.data[i] > 0) { hasAlpha = true; break; }
        }
        expect(hasAlpha).toBe(true);
      });
    } else {
      it('preserves alpha channel', () => {
        const img = createGradientImage(4, 4);
        const result = fn(img, ...extraArgs);
        for (let i = 3; i < result.data.length; i += 4) {
          expect(result.data[i]).toBe(img.data[i]);
        }
      });
    }

    it('does not mutate input', () => {
      const img = createGradientImage(4, 4);
      const orig = new Uint8ClampedArray(img.data);
      fn(img, ...extraArgs);
      expect(img.data).toEqual(orig);
    });

    it('produces output different from input', () => {
      const img = createGradientImage(8, 8);
      const result = fn(img, ...extraArgs);
      let diffCount = 0;
      for (let i = 0; i < result.data.length; i += 4) {
        if (
          result.data[i] !== img.data[i] ||
          result.data[i + 1] !== img.data[i + 1] ||
          result.data[i + 2] !== img.data[i + 2]
        ) {
          diffCount++;
        }
      }
      expect(diffCount).toBeGreaterThan(0);
    });
  });
}

// ===================================================================
// ARTISTIC FILTERS (15)
// ===================================================================

describe('Artistic Filters (15)', () => {
  // 1. coloredPencil
  standardTests('coloredPencil', coloredPencil, [4, 8, 200]);
  describe('coloredPencil — parameters', () => {
    it('accepts pencilWidth', () => {
      const img = createGradientImage();
      const r1 = coloredPencil(img, 1, 8, 200);
      const r2 = coloredPencil(img, 10, 8, 200);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
    it('accepts pressure', () => {
      const img = createGradientImage();
      const r1 = coloredPencil(img, 4, 1, 200);
      const r2 = coloredPencil(img, 4, 20, 200);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
    it('accepts paperBrightness', () => {
      const img = createGradientImage();
      const r1 = coloredPencil(img, 4, 8, 50);
      const r2 = coloredPencil(img, 4, 8, 250);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 2. cutout
  standardTests('cutout', cutout, [6, 4, 2]);
  describe('cutout — parameters', () => {
    it('accepts different levels', () => {
      const img = createGradientImage();
      const r1 = cutout(img, 2);
      const r2 = cutout(img, 20);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 3. dryBrush
  standardTests('dryBrush', dryBrush, [2, 8]);
  describe('dryBrush — parameters', () => {
    it('accepts different brushSize', () => {
      const img = createGradientImage();
      const r1 = dryBrush(img, 1, 8);
      const r2 = dryBrush(img, 5, 8);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
    it('accepts different detail', () => {
      const img = createGradientImage();
      const r1 = dryBrush(img, 2, 2);
      const r2 = dryBrush(img, 2, 15);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 4. filmGrain
  standardTests('filmGrain', filmGrain, [10, 0, 10]);
  describe('filmGrain — parameters', () => {
    it('accepts grain amount', () => {
      const img = createGradientImage();
      const r1 = filmGrain(img, 0, 0, 0);
      // With zero grain, output should be very close to input
      let maxDiff = 0;
      for (let i = 0; i < r1.data.length; i += 4) {
        maxDiff = Math.max(maxDiff, Math.abs(r1.data[i] - img.data[i]));
      }
      expect(maxDiff).toBeLessThanOrEqual(1);
    });
    it('accepts highlightArea and intensity', () => {
      const img = createGradientImage();
      const r1 = filmGrain(img, 50, 100, 10);
      const r2 = filmGrain(img, 50, 0, 1);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 5. fresco
  standardTests('fresco', fresco, [2]);
  describe('fresco — parameters', () => {
    it('accepts brushSize', () => {
      const img = createGradientImage();
      const r1 = fresco(img, 1);
      const r2 = fresco(img, 5);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 6. neonGlow
  standardTests('neonGlow', neonGlow, [5, 20, { r: 0, g: 255, b: 128 }]);
  describe('neonGlow — parameters', () => {
    it('accepts different glowColor', () => {
      const img = createGradientImage();
      const r1 = neonGlow(img, 5, 20, { r: 255, g: 0, b: 0 });
      const r2 = neonGlow(img, 5, 20, { r: 0, g: 0, b: 255 });
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
    it('accepts glowSize and glowBrightness', () => {
      const img = createGradientImage();
      const r1 = neonGlow(img, 1, 5);
      const r2 = neonGlow(img, 10, 50);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 7. paintDaubs
  standardTests('paintDaubs', paintDaubs, [8, 5]);
  describe('paintDaubs — parameters', () => {
    it('accepts different brushSize and sharpness', () => {
      const img = createGradientImage();
      const r1 = paintDaubs(img, 2, 2);
      const r2 = paintDaubs(img, 10, 10);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 8. paletteKnife
  standardTests('paletteKnife', paletteKnife, [10, 3]);
  describe('paletteKnife — parameters', () => {
    it('accepts different strokeSize and detail', () => {
      const img = createGradientImage();
      const r1 = paletteKnife(img, 2, 2);
      const r2 = paletteKnife(img, 10, 10);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 9. plasticWrap
  standardTests('plasticWrap', plasticWrap, [15, 9, 7]);
  describe('plasticWrap — parameters', () => {
    it('accepts strength and smoothness', () => {
      const img = createGradientImage();
      const r1 = plasticWrap(img, 1, 9, 1);
      const r2 = plasticWrap(img, 20, 9, 14);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 10. posterEdges
  standardTests('posterEdges', posterEdges, [2, 1, 6]);
  describe('posterEdges — parameters', () => {
    it('accepts edgeThickness and posterize level', () => {
      const img = createGradientImage();
      const r1 = posterEdges(img, 1, 1, 2);
      const r2 = posterEdges(img, 5, 5, 20);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 11. roughPastels
  standardTests('roughPastels', roughPastels, [6, 4]);
  describe('roughPastels — parameters', () => {
    it('accepts strokeLength and detail', () => {
      const img = createGradientImage();
      const r1 = roughPastels(img, 1, 2);
      const r2 = roughPastels(img, 10, 10);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 12. smudgeStick
  standardTests('smudgeStick', smudgeStick, [2, 12, 10]);
  describe('smudgeStick — parameters', () => {
    it('accepts strokeLength and intensity', () => {
      const img = createGradientImage();
      const r1 = smudgeStick(img, 1, 12, 2);
      const r2 = smudgeStick(img, 5, 12, 15);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 13. sponge
  standardTests('sponge', sponge, [2, 12, 5]);
  describe('sponge — parameters', () => {
    it('accepts brushSize and definition', () => {
      const img = createGradientImage();
      const r1 = sponge(img, 1, 3, 5);
      const r2 = sponge(img, 5, 20, 5);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 14. underpainting
  standardTests('underpainting', underpainting, [4, 8]);
  describe('underpainting — parameters', () => {
    it('accepts brushSize and coverage', () => {
      const img = createGradientImage();
      const r1 = underpainting(img, 1, 2);
      const r2 = underpainting(img, 8, 15);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 15. watercolor
  standardTests('watercolor', watercolor, [9, 0]);
  describe('watercolor — parameters', () => {
    it('accepts detail', () => {
      const img = createGradientImage();
      const r1 = watercolor(img, 2, 0);
      const r2 = watercolor(img, 15, 0);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });
});

// ===================================================================
// SKETCH FILTERS (14)
// ===================================================================

describe('Sketch Filters (14)', () => {
  // 1. basRelief
  standardTests('basRelief', basRelief, [13, 3, 0]);
  describe('basRelief — parameters', () => {
    it('accepts different detail', () => {
      const img = createGradientImage();
      const r1 = basRelief(img, 2, 3, 0);
      const r2 = basRelief(img, 20, 3, 0);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
    it('accepts different lightDirection', () => {
      const img = createGradientImage();
      const r1 = basRelief(img, 13, 3, 0);
      const r2 = basRelief(img, 13, 3, 180);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 2. chalkAndCharcoal
  standardTests('chalkAndCharcoal', chalkAndCharcoal, [6, 6, 1]);
  describe('chalkAndCharcoal — parameters', () => {
    it('accepts different chalkArea and charcoalArea', () => {
      const img = createGradientImage();
      const r1 = chalkAndCharcoal(img, 1, 10, 1);
      const r2 = chalkAndCharcoal(img, 10, 1, 1);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
    it('accepts different pressure', () => {
      const img = createGradientImage();
      const r1 = chalkAndCharcoal(img, 6, 6, 1);
      const r2 = chalkAndCharcoal(img, 6, 6, 5);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 3. charcoal
  standardTests('charcoal', charcoal, [1, 5]);
  describe('charcoal — parameters', () => {
    it('accepts different thickness and detail', () => {
      const img = createGradientImage();
      const r1 = charcoal(img, 1, 2);
      const r2 = charcoal(img, 5, 15);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 4. chrome
  standardTests('chrome', chrome, [4, 7]);
  describe('chrome — parameters', () => {
    it('accepts different detail', () => {
      const img = createGradientImage();
      const r1 = chrome(img, 1, 7);
      const r2 = chrome(img, 10, 7);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 5. conteCrayon
  standardTests('conteCrayon', conteCrayon, [11, 7]);
  describe('conteCrayon — parameters', () => {
    it('accepts different fgLevel and bgLevel', () => {
      const img = createGradientImage();
      const r1 = conteCrayon(img, 2, 15);
      const r2 = conteCrayon(img, 15, 2);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 6. graphicPen
  standardTests('graphicPen', graphicPen, [15, 50, 45]);
  describe('graphicPen — parameters', () => {
    it('accepts different strokeLength', () => {
      const img = createGradientImage();
      const r1 = graphicPen(img, 2, 50, 45);
      const r2 = graphicPen(img, 25, 50, 45);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
    it('accepts different strokeDirection', () => {
      const img = createGradientImage();
      const r1 = graphicPen(img, 15, 50, 0);
      const r2 = graphicPen(img, 15, 50, 90);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 7. halftonePattern
  standardTests('halftonePattern', halftonePattern, [5, 5, 'circle']);
  describe('halftonePattern — parameters', () => {
    it('accepts different patternType', () => {
      const img = createGradientImage();
      const r1 = halftonePattern(img, 5, 5, 'circle');
      const r2 = halftonePattern(img, 5, 5, 'line');
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
    it('accepts dotSize', () => {
      const img = createGradientImage();
      const r1 = halftonePattern(img, 2, 5, 'dot');
      const r2 = halftonePattern(img, 10, 5, 'dot');
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 8. notePaper
  standardTests('notePaper', notePaper, [25, 10, 11]);
  describe('notePaper — parameters', () => {
    it('accepts graininess and relief', () => {
      const img = createGradientImage();
      const r1 = notePaper(img, 25, 1, 2);
      const r2 = notePaper(img, 25, 20, 20);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 9. photocopy
  standardTests('photocopy', photocopy, [7, 8]);
  describe('photocopy — parameters', () => {
    it('accepts different detail and darkness', () => {
      const img = createGradientImage();
      const r1 = photocopy(img, 2, 2);
      const r2 = photocopy(img, 10, 10);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 10. plaster
  standardTests('plaster', plaster, [25, 2, 0]);
  describe('plaster — parameters', () => {
    it('accepts different smoothness and lightDirection', () => {
      const img = createGradientImage();
      const r1 = plaster(img, 25, 1, 0);
      const r2 = plaster(img, 25, 10, 180);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 11. reticulation
  standardTests('reticulation', reticulation, [12, 40, 5]);
  describe('reticulation — parameters', () => {
    it('accepts density, fgLevel, bgLevel', () => {
      const img = createGradientImage();
      const r1 = reticulation(img, 5, 128, 128);
      const r2 = reticulation(img, 30, 0, 255);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });

  // 12. stamp
  standardTests('stamp', stamp, [25, 5]);
  describe('stamp — parameters', () => {
    it('accepts different lightDarkBalance', () => {
      const img = createGradientImage();
      const r1 = stamp(img, 5, 5);
      const r2 = stamp(img, 40, 5);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
    it('produces binary output (0 or 255)', () => {
      const img = createGradientImage();
      const result = stamp(img, 25);
      for (let i = 0; i < result.data.length; i += 4) {
        expect(result.data[i] === 0 || result.data[i] === 255).toBe(true);
        expect(result.data[i + 1] === 0 || result.data[i + 1] === 255).toBe(true);
        expect(result.data[i + 2] === 0 || result.data[i + 2] === 255).toBe(true);
      }
    });
  });

  // 13. tornEdges
  standardTests('tornEdges', tornEdges, [25, 11, 17]);
  describe('tornEdges — parameters', () => {
    it('accepts different imageBalance and contrast', () => {
      const img = createGradientImage();
      const r1 = tornEdges(img, 5, 11, 1);
      const r2 = tornEdges(img, 40, 11, 50);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
    it('produces binary output', () => {
      const img = createGradientImage();
      const result = tornEdges(img, 25, 11, 17);
      for (let i = 0; i < result.data.length; i += 4) {
        expect(result.data[i] === 0 || result.data[i] === 255).toBe(true);
      }
    });
  });

  // 14. waterPaper
  standardTests('waterPaper', waterPaper, [15, 60, 80]);
  describe('waterPaper — parameters', () => {
    it('accepts different fiberLength and brightness', () => {
      const img = createGradientImage();
      const r1 = waterPaper(img, 5, 20, 80);
      const r2 = waterPaper(img, 25, 100, 80);
      let same = true;
      for (let i = 0; i < r1.data.length; i++) { if (r1.data[i] !== r2.data[i]) { same = false; break; } }
      expect(same).toBe(false);
    });
  });
});

// ===================================================================
// RENDER FILTERS (Phase 11) — Verification
// ===================================================================

describe('Render Filters — Phase 11 verification', () => {
  standardTests('clouds', clouds, [42, 32]);
  describe('clouds extras', () => {
    it('is deterministic with same seed', () => {
      const img1 = createGradientImage(10, 10);
      const img2 = createGradientImage(10, 10);
      const r1 = clouds(img1, 123, 32);
      const r2 = clouds(img2, 123, 32);
      expect(r1.data).toEqual(r2.data);
    });
  });

  standardTests('differenceClouds', differenceClouds, [42, 32]);
  standardTests('fibers', fibers, [16, 4, 42]);

  describe('fibers extras', () => {
    it('is deterministic with same seed', () => {
      const img1 = createGradientImage(10, 10);
      const img2 = createGradientImage(10, 10);
      const r1 = fibers(img1, 16, 4, 42);
      const r2 = fibers(img2, 16, 4, 42);
      expect(r1.data).toEqual(r2.data);
    });
  });

  standardTests('lensFlare', lensFlare, [-1, -1, 100, '50-300mm']);

  describe('lensFlare lens types', () => {
    for (const lens of ['50-300mm', '35mm', '105mm'] as const) {
      it(`supports lens type: ${lens}`, () => {
        const img = createGradientImage(16, 16);
        const result = lensFlare(img, -1, -1, 100, lens);
        expect(result.width).toBe(16);
      });
    }
  });

  standardTests('lightingEffects', lightingEffects);
  standardTests('flame', flame);
  standardTests('tree', tree);
});

// ===================================================================
// TEXTURE FILTERS (Phase 8) — Verification
// ===================================================================

describe('Texture Filters — Phase 8 verification', () => {
  standardTests('grain', grain, [40, 50, 'regular']);
  describe('grain types', () => {
    for (const t of ['regular', 'soft', 'sprinkle', 'clumped', 'contrasty', 'enlarged', 'stippled', 'horizontal', 'vertical', 'speckle'] as const) {
      it(`supports grain type: ${t}`, () => {
        const img = createGradientImage();
        const result = grain(img, 40, 50, t);
        expect(result.width).toBe(img.width);
      });
    }
  });

  standardTests('mosaicTiles', mosaicTiles, [5, 1, 10]);
  standardTests('patchwork', patchwork, [5, 3]);
  standardTests('stainedGlass', stainedGlass, [8, 2, 3]);
  standardTests('texturizer', texturizer, ['canvas', 100, 4, 'top']);

  describe('texturizer types', () => {
    for (const t of ['brick', 'burlap', 'canvas', 'sandstone'] as const) {
      it(`supports texture: ${t}`, () => {
        const img = createGradientImage(16, 16);
        const result = texturizer(img, t);
        expect(result.width).toBe(16);
      });
    }
  });

  standardTests('craquelure', craquelure, [15, 6, 9]);
});

// ===================================================================
// BRUSH STROKES FILTERS (Phase 8) — Verification
// ===================================================================

describe('Brush Strokes Filters — Phase 8 verification', () => {
  standardTests('accentedEdges', accentedEdges, [2, 38, 5]);
  standardTests('angledStrokes', angledStrokes, [50, 15, 3]);
  standardTests('crosshatch', crosshatch, [9, 6, 1]);
  standardTests('darkStrokes', darkStrokes, [3, 5, 1]);
  standardTests('inkOutlines', inkOutlines, [4, 20, 10]);
  standardTests('spatter', spatter, [10, 5]);
  standardTests('sprayedStrokes', sprayedStrokes, [12, 7, 0]);
  standardTests('sumie', sumie, [3, 10, 5]);
});
