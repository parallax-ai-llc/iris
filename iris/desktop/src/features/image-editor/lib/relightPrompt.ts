/**
 * Relight prompt builder.
 *
 * The server's relight adapter (fal IC-Light V2) only reads the request
 * `prompt`, so every Relight control in the desktop panel ends up as words in
 * one lighting sentence. With the default controls (direction and color on
 * "auto") the sentence is exactly the iris/web preset text, so the desktop and
 * web send the same request.
 *
 * Keep PRESET_PROMPTS byte-identical to
 * iris/web/features/iris/components/image/ImageRelightCreator.tsx (PRESET_PROMPTS).
 */

export type RelightPreset = 'natural' | 'studio' | 'dramatic' | 'soft';
export type RelightDirection = 'auto' | 'left' | 'right' | 'top' | 'bottom';
export type RelightColor = 'auto' | 'warm' | 'neutral' | 'cool' | 'neon';

export const RELIGHT_PRESETS: readonly RelightPreset[] = ['natural', 'studio', 'dramatic', 'soft'];
export const RELIGHT_COLORS: readonly RelightColor[] = ['auto', 'warm', 'neutral', 'cool', 'neon'];

/** Max length of the free-text lighting description. */
export const RELIGHT_CUSTOM_PROMPT_MAX = 500;

/** Same text as the iris/web Relight presets. */
export const PRESET_PROMPTS: Record<RelightPreset, string> = {
  natural: 'soft natural daylight from the left window',
  studio: 'studio lighting setup, key light from upper left, fill light from right',
  dramatic: 'dramatic side lighting, strong shadows, cinematic mood',
  soft: 'soft diffused lighting, no harsh shadows, beauty lighting',
};

/**
 * Preset text without its own light direction, used when the user picks a
 * direction so the sentence does not ask for two directions at once.
 */
const PRESET_NEUTRAL: Record<RelightPreset, string> = {
  natural: 'soft natural daylight',
  studio: 'studio lighting setup with key and fill lights',
  dramatic: 'dramatic side lighting, strong shadows, cinematic mood',
  soft: 'soft diffused lighting, no harsh shadows, beauty lighting',
};

/** "Side lighting" contradicts a top or bottom light. */
const DRAMATIC_VERTICAL = 'dramatic lighting, strong shadows, cinematic mood';

const DIRECTION_PHRASE: Record<Exclude<RelightDirection, 'auto'>, string> = {
  left: 'light coming from the left',
  right: 'light coming from the right',
  top: 'light coming from above',
  bottom: 'light coming from below',
};

const COLOR_PHRASE: Record<Exclude<RelightColor, 'auto'>, string> = {
  warm: 'warm golden light',
  neutral: 'neutral white light',
  cool: 'cool blue light',
  neon: 'neon magenta and cyan light',
};

export interface RelightPromptInput {
  preset: RelightPreset;
  direction?: RelightDirection;
  color?: RelightColor;
  /** Free text. When non-blank it replaces everything else (same as web). */
  custom?: string;
}

export function buildRelightPrompt({
  preset,
  direction = 'auto',
  color = 'auto',
  custom,
}: RelightPromptInput): string {
  const trimmed = custom?.trim();
  if (trimmed) return trimmed.slice(0, RELIGHT_CUSTOM_PROMPT_MAX);

  let prompt: string;
  if (direction === 'auto') {
    prompt = PRESET_PROMPTS[preset];
  } else {
    const base =
      preset === 'dramatic' && (direction === 'top' || direction === 'bottom')
        ? DRAMATIC_VERTICAL
        : PRESET_NEUTRAL[preset];
    prompt = `${base}, ${DIRECTION_PHRASE[direction]}`;
  }

  if (color !== 'auto') {
    prompt = `${prompt}, ${COLOR_PHRASE[color]}`;
  }
  return prompt;
}
