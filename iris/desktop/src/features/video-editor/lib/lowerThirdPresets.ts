import type { SubtitleStyle } from '@/types/editor.types';

export interface LowerThirdPreset {
  id: string;
  name: string;
  category: 'minimal' | 'news' | 'corporate' | 'creative';
  style: Partial<SubtitleStyle>;
  description: string;
}

export const LOWER_THIRD_PRESETS: LowerThirdPreset[] = [
  // Minimal
  {
    id: 'lt-clean',
    name: 'Clean',
    category: 'minimal',
    style: {
      fontSize: 28,
      fontFamily: 'Inter',
      fontColor: '#FFFFFF',
      backgroundColor: '#000000',
      backgroundOpacity: 0.6,
      position: { x: 10, y: 85 },
      alignment: 'left',
      verticalAlign: 'bottom',
      animation: 'fade-word',
    },
    description: 'Simple clean lower third',
  },
  {
    id: 'lt-subtle',
    name: 'Subtle',
    category: 'minimal',
    style: {
      fontSize: 24,
      fontFamily: 'Arial',
      fontColor: '#E5E5E5',
      backgroundColor: '#1a1a1a',
      backgroundOpacity: 0.8,
      position: { x: 5, y: 88 },
      alignment: 'left',
      verticalAlign: 'bottom',
      animation: 'slide-up',
    },
    description: 'Understated minimal style',
  },

  // News
  {
    id: 'lt-breaking',
    name: 'Breaking News',
    category: 'news',
    style: {
      fontSize: 32,
      fontFamily: 'Arial',
      fontColor: '#FFFFFF',
      backgroundColor: '#DC2626',
      backgroundOpacity: 0.95,
      position: { x: 0, y: 85 },
      alignment: 'center',
      verticalAlign: 'bottom',
      animation: 'typewriter',
    },
    description: 'Breaking news banner',
  },
  {
    id: 'lt-ticker',
    name: 'News Ticker',
    category: 'news',
    style: {
      fontSize: 20,
      fontFamily: 'Arial',
      fontColor: '#FFFFFF',
      backgroundColor: '#1E3A5F',
      backgroundOpacity: 0.9,
      position: { x: 0, y: 92 },
      alignment: 'left',
      verticalAlign: 'bottom',
      animation: 'none',
    },
    description: 'Scrolling news ticker style',
  },

  // Corporate
  {
    id: 'lt-professional',
    name: 'Professional',
    category: 'corporate',
    style: {
      fontSize: 26,
      fontFamily: 'Inter',
      fontColor: '#FFFFFF',
      backgroundColor: '#1F2937',
      backgroundOpacity: 0.85,
      position: { x: 5, y: 82 },
      alignment: 'left',
      verticalAlign: 'bottom',
      animation: 'slide-up',
    },
    description: 'Professional corporate style',
  },
  {
    id: 'lt-speaker',
    name: 'Speaker ID',
    category: 'corporate',
    style: {
      fontSize: 22,
      fontFamily: 'Inter',
      fontColor: '#F3F4F6',
      backgroundColor: '#111827',
      backgroundOpacity: 0.75,
      position: { x: 5, y: 85 },
      alignment: 'left',
      verticalAlign: 'bottom',
      animation: 'fade-word',
    },
    description: 'Speaker identification overlay',
  },

  // Creative
  {
    id: 'lt-neon',
    name: 'Neon Glow',
    category: 'creative',
    style: {
      fontSize: 30,
      fontFamily: 'Arial',
      fontColor: '#00FF88',
      backgroundColor: '#000000',
      backgroundOpacity: 0.3,
      position: { x: 50, y: 85 },
      alignment: 'center',
      verticalAlign: 'bottom',
      animation: 'glow',
    },
    description: 'Neon glowing text',
  },
  {
    id: 'lt-cinematic',
    name: 'Cinematic',
    category: 'creative',
    style: {
      fontSize: 36,
      fontFamily: 'Georgia',
      fontColor: '#FBBF24',
      backgroundColor: '#000000',
      backgroundOpacity: 0,
      position: { x: 50, y: 80 },
      alignment: 'center',
      verticalAlign: 'bottom',
      animation: 'scale',
    },
    description: 'Cinematic golden text',
  },
];

export function getPresetsByCategory(
  category: LowerThirdPreset['category']
): LowerThirdPreset[] {
  return LOWER_THIRD_PRESETS.filter((p) => p.category === category);
}

export const LOWER_THIRD_CATEGORIES: Array<{
  key: LowerThirdPreset['category'];
  label: string;
}> = [
  { key: 'minimal', label: 'Minimal' },
  { key: 'news', label: 'News' },
  { key: 'corporate', label: 'Corporate' },
  { key: 'creative', label: 'Creative' },
];
