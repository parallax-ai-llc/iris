/**
 * LUT Preset System for the Lumetri Color Panel
 *
 * Instead of loading external .cube LUT files, each preset is a set of
 * predefined color correction parameter values that map directly to the
 * ColorCorrectionParams used in LumetriColorPanel.tsx.
 *
 * Param ranges mirror the ColorSlider min/max values:
 *   exposure, contrast, highlights, shadows, temperature, tint,
 *   vibrance, saturation → all -100 to 100
 */

export interface LutPreset {
  id: string;
  name: string;
  category: 'cinematic' | 'vintage' | 'creative' | 'correction';
  /** Only the keys that deviate from 0 need to be listed. */
  params: {
    exposure?: number;
    contrast?: number;
    highlights?: number;
    shadows?: number;
    whites?: number;
    blacks?: number;
    temperature?: number;
    tint?: number;
    vibrance?: number;
    saturation?: number;
  };
  description: string;
}

// ---------------------------------------------------------------------------
// Category metadata (order, label, accent color for UI)
// ---------------------------------------------------------------------------

export interface LutCategory {
  id: LutPreset['category'];
  label: string;
  /** Tailwind text-color class used in the UI */
  colorClass: string;
}

export const LUT_CATEGORIES: LutCategory[] = [
  { id: 'cinematic', label: 'Cinematic', colorClass: 'text-amber-400' },
  { id: 'vintage',   label: 'Vintage',   colorClass: 'text-orange-400' },
  { id: 'creative',  label: 'Creative',  colorClass: 'text-cyan-400' },
  { id: 'correction',label: 'Correction',colorClass: 'text-zinc-300' },
];

// ---------------------------------------------------------------------------
// Preset catalogue
// ---------------------------------------------------------------------------

export const LUT_PRESETS: LutPreset[] = [
  // ── Cinematic ──────────────────────────────────────────────────────────
  {
    id: 'teal-orange',
    name: 'Teal & Orange',
    category: 'cinematic',
    params: { temperature: -25, tint: 5, contrast: 15, shadows: -10, vibrance: 20, saturation: -10 },
    description: 'Hollywood blockbuster look',
  },
  {
    id: 'film-noir',
    name: 'Film Noir',
    category: 'cinematic',
    params: { saturation: -80, contrast: 35, shadows: -20, highlights: -15, exposure: -5 },
    description: 'Classic black & white noir',
  },
  {
    id: 'bleach-bypass',
    name: 'Bleach Bypass',
    category: 'cinematic',
    params: { saturation: -40, contrast: 30, highlights: 10, shadows: -15 },
    description: 'Desaturated high contrast',
  },
  {
    id: 'golden-hour',
    name: 'Golden Hour',
    category: 'cinematic',
    params: { temperature: 30, tint: 5, exposure: 5, contrast: -5, vibrance: 15 },
    description: 'Warm golden sunset tones',
  },
  {
    id: 'moonlight',
    name: 'Moonlight',
    category: 'cinematic',
    params: { temperature: -35, exposure: -10, contrast: 10, saturation: -20, shadows: 5 },
    description: 'Cool blue night look',
  },

  // ── Vintage ────────────────────────────────────────────────────────────
  {
    id: 'retro-70s',
    name: 'Retro 70s',
    category: 'vintage',
    params: { temperature: 15, saturation: -15, contrast: -10, shadows: 10, vibrance: -10 },
    description: 'Faded 1970s film look',
  },
  {
    id: 'polaroid',
    name: 'Polaroid',
    category: 'vintage',
    params: { temperature: 10, contrast: -15, highlights: 15, saturation: -20, vibrance: 10 },
    description: 'Instant camera aesthetic',
  },
  {
    id: 'vhs',
    name: 'VHS',
    category: 'vintage',
    params: { saturation: -25, contrast: -20, temperature: 5, shadows: 15, highlights: -10 },
    description: 'Retro VHS tape look',
  },

  // ── Creative ───────────────────────────────────────────────────────────
  {
    id: 'neon-nights',
    name: 'Neon Nights',
    category: 'creative',
    params: { saturation: 30, vibrance: 25, contrast: 20, temperature: -15, tint: 10 },
    description: 'Vibrant neon cyberpunk',
  },
  {
    id: 'pastel-dream',
    name: 'Pastel Dream',
    category: 'creative',
    params: { saturation: -30, exposure: 10, contrast: -20, vibrance: -15, highlights: 20 },
    description: 'Soft pastel tones',
  },
  {
    id: 'cross-process',
    name: 'Cross Process',
    category: 'creative',
    params: { temperature: -20, tint: 15, contrast: 25, saturation: 10, vibrance: 15 },
    description: 'Cross-processed film',
  },

  // ── Correction ─────────────────────────────────────────────────────────
  {
    id: 'auto-wb',
    name: 'Auto White Balance',
    category: 'correction',
    params: { temperature: 0, tint: 0 },
    description: 'Reset white balance',
  },
  {
    id: 'brighten',
    name: 'Brighten',
    category: 'correction',
    params: { exposure: 15, shadows: 10, highlights: -5 },
    description: 'Lift shadows and exposure',
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    category: 'correction',
    params: { contrast: 30, shadows: -10, highlights: 10 },
    description: 'Boost contrast range',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return only presets belonging to the given category. */
export function getPresetsByCategory(category: LutPreset['category']): LutPreset[] {
  return LUT_PRESETS.filter((p) => p.category === category);
}

/** Look up a preset by its id. Returns undefined when not found. */
export function findPresetById(id: string): LutPreset | undefined {
  return LUT_PRESETS.find((p) => p.id === id);
}
