import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getProviderLogo = (provider: string) => {
  const logoMap: Record<string, string> = {
    'google': '/model/gemini-color.svg',
    'x': '/model/grok-black.svg',
    'openai': '/model/openai-black.svg',
    'anthropic': '/model/claude-color.svg',
    'deepseek': '/model/deepseek-color.svg',
    'perplexity': '/model/perplexity-color.svg',
  };
  return logoMap[provider] || '';
};

// provider name mapping
export const getProviderName = (provider: string) => {
  const nameMap: Record<string, string> = {
    'google': 'Gemini',
    'x': 'Grok',
    'openai': 'ChatGPT',
    'anthropic': 'Claude',
    'deepseek': 'DeepSeek',
    'perplexity': 'Perplexity'
  };
  return nameMap[provider] || provider;
};

export const getProviderLabel = (provider: string) => {
  switch (provider) {
    case 'openai':
      return 'Open AI';
    case 'x':
      return 'xAI';
    case 'google':
      return 'Google';
    case 'anthropic':
      return 'Anthropic';
    case 'deepseek':
      return 'DeepSeek';
    case 'perplexity':
      return 'Perplexity';
    default:
      return '';
  }
}