/**
 * Effect registry consistency tests.
 *
 * The XFADE map and filter default intensities used to be inline literals in
 * electron/ipc/export.ts and effectUtils.ts. These tests assert invariants
 * over the composed registry (legacy entries preserved, every transition
 * exportable, ids unique) — adding a new effect or transition through the
 * definition modules must NOT require touching this file.
 */

import { describe, it, expect } from 'vitest';
import {
  ALL_VIDEO_EFFECTS,
  EFFECT_CATEGORY_DEFINITIONS,
  XFADE_MAP,
  getDefaultFilterIntensity,
} from '../registry';

// Pre-refactor electron/ipc/export.ts XFADE_MAP literal ('swirl' added since:
// it silently hard-cut on export before). New transitions extend the map and
// must NOT be added here — the superset assertion below allows growth while
// guaranteeing persisted projects keep exporting with the same xfade names.
const LEGACY_XFADE_ENTRIES: Record<string, string> = {
  'slide': 'slideleft', 'zoom': 'zoomin', 'wipe': 'wipeleft',
  'blur-transition': 'hblur', 'blur': 'hblur',
  'dissolve': 'dissolve', 'fade': 'fade', 'dip-to-black': 'fadeblack', 'dip-to-white': 'fadewhite',
  'additive-dissolve': 'distance', 'non-additive-dissolve': 'pixelize', 'film-dissolve': 'fadegrays',
  'tr-iris': 'circlecrop', 'iris': 'circlecrop', 'iris-box': 'rectcrop', 'iris-cross': 'circlecrop',
  'iris-diamond': 'circlecrop', 'iris-star': 'circlecrop', 'iris-points': 'circlecrop',
  'tr-clock-wipe': 'radial', 'tr-gradient-wipe': 'hblur',
  'barn-doors': 'horzopen', 'radial-wipe': 'radial', 'push': 'coverleft',
  'slide-basic': 'slideleft', 'cross-zoom': 'zoomin', 'zoom-basic': 'zoomin', 'multi-spin': 'zoomin',
  'band-slide': 'squeezeh', 'center-split': 'horzopen', 'center-merge': 'horzclose',
  'band-wipe': 'wipetl', 'random-blocks': 'pixelize', 'random-wipe': 'wipetl',
  'wipe-basic': 'wipeleft', 'linear-wipe': 'wipeleft', 'linear-wipe-transition': 'wipeleft',
  'slash-slide': 'diagtl', 'split': 'vertopen', 'swap': 'hlslice',
  'sliding-bands': 'squeezev', 'pinwheel': 'radial', 'venetian-blinds': 'vdslice',
  'checker-wipe': 'pixelize', 'checkerboard-wipe': 'pixelize', 'inset': 'rectcrop',
  'wedge-wipe': 'wipetl', 'whip-turn': 'smoothright',
};

// Verbatim copy of the pre-refactor effectUtils.ts FILTER_DEFAULTS literal.
const ORIGINAL_FILTER_DEFAULTS: Record<string, number> = {
  brightness: 20,
  contrast: 20,
  saturation: 30,
  hue: 30,
  blur: 5,
  sepia: 100,
  grayscale: 100,
  invert: 100,
  vignette: 50,
};

describe('video effect registry', () => {
  it('keeps every legacy XFADE_MAP entry (persisted projects must export unchanged)', () => {
    for (const [id, xfade] of Object.entries(LEGACY_XFADE_ENTRIES)) {
      expect(XFADE_MAP[id], id).toBe(xfade);
    }
  });

  it('preserves original filter default intensities with 50 fallback', () => {
    for (const [id, value] of Object.entries(ORIGINAL_FILTER_DEFAULTS)) {
      expect(getDefaultFilterIntensity(id), id).toBe(value);
    }
    expect(getDefaultFilterIntensity('posterize')).toBe(50);
    expect(getDefaultFilterIntensity('does-not-exist')).toBe(50);
  });

  it('has unique effect ids across all categories', () => {
    const ids = ALL_VIDEO_EFFECTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps at least the pre-refactor catalog size and well-formed entries', () => {
    expect(EFFECT_CATEGORY_DEFINITIONS.length).toBeGreaterThanOrEqual(20);
    expect(ALL_VIDEO_EFFECTS.length).toBeGreaterThanOrEqual(182);
    for (const c of EFFECT_CATEGORY_DEFINITIONS) {
      expect(c.effects.length, c.key).toBeGreaterThan(0);
      for (const e of c.effects) {
        expect(e.id).toBeTruthy();
        expect(e.name).toBeTruthy();
        expect(['transition', 'filter', 'audio-effect']).toContain(e.type);
      }
    }
  });

  it('only transition definitions declare xfade names', () => {
    for (const e of ALL_VIDEO_EFFECTS) {
      if (e.xfade) expect(e.type, e.id).toBe('transition');
    }
  });

  it('every transition definition declares an xfade (no silent hard-cut on export)', () => {
    // export.ts skips transitions whose id is missing from XFADE_MAP, so a
    // transition without xfade previews in the panel but hard-cuts on export.
    for (const e of ALL_VIDEO_EFFECTS) {
      if (e.type === 'transition') {
        expect(e.xfade, `transition '${e.id}' must declare an xfade`).toBeTruthy();
      }
    }
  });
});
