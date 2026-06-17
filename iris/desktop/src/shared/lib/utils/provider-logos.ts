/**
 * Provider logo mapping for model selectors
 * Copied and adapted from web/features/iris/utils/provider-logos.ts
 */

export interface ProviderLogo {
  src: string;
  invert?: boolean; // Apply CSS invert filter for dark backgrounds
}

// Use BASE_URL so paths work under both dev (http://localhost:5173/) and
// production Electron (file:// with base './').
const B = import.meta.env.BASE_URL;

const PROVIDER_LOGOS: Record<string, ProviderLogo> = {
  // Chat providers
  openai: { src: `${B}model/openai-black.svg`, invert: true },
  anthropic: { src: `${B}model/claude-color.svg` },
  google: { src: `${B}model/gemini-color.svg` },
  x: { src: `${B}model/grok-black.svg`, invert: true },
  xai: { src: `${B}model/grok-black.svg`, invert: true },
  grok: { src: `${B}model/grok-black.svg`, invert: true },
  deepseek: { src: `${B}model/deepseek-color.svg` },
  perplexity: { src: `${B}model/perplexity-color.svg` },

  // Video/Image providers
  runway: { src: `${B}model/runway-black.svg`, invert: true },
  kling: { src: `${B}model/kling-color.svg` },
  luma: { src: `${B}model/luma-color.svg` },
  replicate: { src: `${B}model/replicate-black.svg`, invert: true },
  stability: { src: `${B}model/stability-color.svg` },
  minimax: { src: `${B}model/minimax-color.svg` },
  pika: { src: `${B}model/pika-black.svg`, invert: true },
  hailuo: { src: `${B}model/hailuo-color.svg` },
  flux: { src: `${B}model/flux-black.svg`, invert: true },
  blackforestlabs: { src: `${B}model/flux-black.svg`, invert: true },
  bfl: { src: `${B}model/flux-black.svg`, invert: true }, // Alias for blackforestlabs

  // Audio providers
  elevenlabs: { src: `${B}model/elevenlabs-black.svg`, invert: true },

  // Other providers
  fal: { src: `${B}model/fal-color.svg` },
  midjourney: { src: `${B}model/midjourney-black.svg`, invert: true },
  recraft: { src: `${B}model/recraft-white.svg` },
  ideogram: { src: `${B}model/ideogram-white.svg` },
};

/**
 * Get provider logo information
 */
export function getProviderLogo(provider: string): ProviderLogo | null {
  const normalizedProvider = provider.toLowerCase();
  return PROVIDER_LOGOS[normalizedProvider] || null;
}

/**
 * Get CSS style object for provider logo (handles invert filter)
 */
export function getProviderLogoStyle(provider: string): React.CSSProperties {
  const logo = getProviderLogo(provider);
  if (logo?.invert) {
    return { filter: 'invert(1)' };
  }
  return {};
}

/**
 * Get provider display name
 */
export function getProviderName(provider: string): string {
  const names: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    xai: 'xAI',
    x: 'xAI',
    grok: 'xAI',
    deepseek: 'DeepSeek',
    perplexity: 'Perplexity',
    runway: 'Runway',
    kling: 'Kling',
    luma: 'Luma',
    replicate: 'Replicate',
    stability: 'Stability AI',
    minimax: 'Minimax',
    pika: 'Pika',
    hailuo: 'Hailuo',
    flux: 'Flux',
    blackforestlabs: 'Black Forest Labs',
    bfl: 'Black Forest Labs',
    elevenlabs: 'ElevenLabs',
    fal: 'FAL',
    midjourney: 'Midjourney',
    recraft: 'Recraft',
    ideogram: 'Ideogram',
  };

  const normalizedProvider = provider.toLowerCase();
  return names[normalizedProvider] || provider;
}
