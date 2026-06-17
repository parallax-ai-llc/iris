/**
 * Provider logo mapping for model selectors
 */

export interface ProviderLogo {
  src: string;
  invert?: boolean; // Apply CSS invert filter for dark backgrounds
}

const PROVIDER_LOGOS: Record<string, ProviderLogo> = {
  // Chat providers
  openai: { src: '/model/openai-black.svg', invert: true },
  anthropic: { src: '/model/claude-color.svg' },
  google: { src: '/model/gemini-color.svg' },
  x: { src: '/model/grok-black.svg', invert: true },
  xai: { src: '/model/grok-black.svg', invert: true },
  grok: { src: '/model/grok-black.svg', invert: true },
  deepseek: { src: '/model/deepseek-color.svg' },
  perplexity: { src: '/model/perplexity-color.svg' },

  // Video/Image providers
  runway: { src: '/model/runway-black.svg', invert: true },
  kling: { src: '/model/kling-color.svg' },
  luma: { src: '/model/luma-color.svg' },
  replicate: { src: '/model/replicate-black.svg', invert: true },
  stability: { src: '/model/stability-color.svg' },
  minimax: { src: '/model/minimax-color.svg' },
  pika: { src: '/model/pika-black.svg', invert: true },
  hailuo: { src: '/model/hailuo-color.svg' },
  flux: { src: '/model/flux-black.svg', invert: true },
  blackforestlabs: { src: '/model/flux-black.svg', invert: true },

  // Audio providers
  elevenlabs: { src: '/model/elevenlabs-black.svg', invert: true },

  // Other providers
  fal: { src: '/model/fal-color.svg' },
  midjourney: { src: '/model/midjourney-black.svg', invert: true },
  heygen: { src: '/model/heygen-color.svg' },
  recraft: { src: '/model/recraft-white.svg' },
  ideogram: { src: '/model/ideogram-white.svg' },
};

export function getProviderLogo(provider: string): ProviderLogo | null {
  const normalizedProvider = provider.toLowerCase();
  return PROVIDER_LOGOS[normalizedProvider] || null;
}

export function getProviderLogoStyle(provider: string): React.CSSProperties {
  const logo = getProviderLogo(provider);
  if (logo?.invert) {
    return { filter: 'invert(1)' };
  }
  return {};
}
