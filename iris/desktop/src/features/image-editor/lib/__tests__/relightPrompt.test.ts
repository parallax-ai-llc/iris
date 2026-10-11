import { describe, it, expect } from 'vitest';
import {
  buildRelightPrompt,
  PRESET_PROMPTS,
  RELIGHT_CUSTOM_PROMPT_MAX,
} from '../relightPrompt';

describe('buildRelightPrompt', () => {
  it('keeps the preset text identical to iris/web ImageRelightCreator', () => {
    // Copied from iris/web/features/iris/components/image/ImageRelightCreator.tsx.
    // If this fails, the two apps no longer send the same relight request.
    expect(PRESET_PROMPTS).toEqual({
      natural: 'soft natural daylight from the left window',
      studio: 'studio lighting setup, key light from upper left, fill light from right',
      dramatic: 'dramatic side lighting, strong shadows, cinematic mood',
      soft: 'soft diffused lighting, no harsh shadows, beauty lighting',
    });
  });

  it('returns the web preset text when direction and color are auto', () => {
    for (const preset of ['natural', 'studio', 'dramatic', 'soft'] as const) {
      expect(buildRelightPrompt({ preset })).toBe(PRESET_PROMPTS[preset]);
      expect(buildRelightPrompt({ preset, direction: 'auto', color: 'auto' })).toBe(PRESET_PROMPTS[preset]);
    }
  });

  it('swaps the preset own direction for the chosen one', () => {
    expect(buildRelightPrompt({ preset: 'natural', direction: 'right' })).toBe(
      'soft natural daylight, light coming from the right',
    );
    expect(buildRelightPrompt({ preset: 'studio', direction: 'left' })).toBe(
      'studio lighting setup with key and fill lights, light coming from the left',
    );
  });

  it('drops "side lighting" from dramatic when the light is above or below', () => {
    expect(buildRelightPrompt({ preset: 'dramatic', direction: 'top' })).toBe(
      'dramatic lighting, strong shadows, cinematic mood, light coming from above',
    );
    expect(buildRelightPrompt({ preset: 'dramatic', direction: 'left' })).toBe(
      'dramatic side lighting, strong shadows, cinematic mood, light coming from the left',
    );
  });

  it('appends the color phrase after the direction', () => {
    expect(buildRelightPrompt({ preset: 'soft', direction: 'bottom', color: 'cool' })).toBe(
      'soft diffused lighting, no harsh shadows, beauty lighting, light coming from below, cool blue light',
    );
    expect(buildRelightPrompt({ preset: 'natural', color: 'warm' })).toBe(
      'soft natural daylight from the left window, warm golden light',
    );
  });

  it('uses trimmed custom text instead of every other control', () => {
    expect(
      buildRelightPrompt({ preset: 'studio', direction: 'top', color: 'neon', custom: '  candle light  ' }),
    ).toBe('candle light');
  });

  it('ignores blank custom text', () => {
    expect(buildRelightPrompt({ preset: 'soft', custom: '   ' })).toBe(PRESET_PROMPTS.soft);
  });

  it('caps custom text length', () => {
    const long = 'a'.repeat(RELIGHT_CUSTOM_PROMPT_MAX + 50);
    expect(buildRelightPrompt({ preset: 'soft', custom: long })).toHaveLength(RELIGHT_CUSTOM_PROMPT_MAX);
  });
});
