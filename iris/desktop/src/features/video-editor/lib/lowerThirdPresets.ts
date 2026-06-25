import type { SubtitleStyle } from '@/types/editor.types';

export interface LowerThirdPreset {
  id: string;
  name: string;
  category: 'minimal' | 'news' | 'corporate' | 'creative';
  style: Partial<SubtitleStyle>;
  description: string;
}

// Lower thirds sit in the lower-left "name bar" area by convention. Each preset is a
// full SubtitleStyle slice: name bars hug their text (auto width); news banners span the
// frame (width: 100). Anchor x matches alignment (left→small x, center→50) so nothing
// ever clips off the edge.
export const LOWER_THIRD_PRESETS: LowerThirdPreset[] = [
  // Minimal
  {
    id: 'lt-clean',
    name: 'Clean',
    category: 'minimal',
    style: {
      fontSize: 28,
      fontFamily: 'Inter',
      fontWeight: 'bold',
      fontColor: '#FFFFFF',
      backgroundColor: '#000000',
      backgroundOpacity: 0.55,
      position: { x: 26, y: 84 },
      alignment: 'left',
      verticalAlign: 'bottom',
      width: 42,
      animation: 'slide-up',
      dropShadow: { color: '#000000', offsetX: 0, offsetY: 1, blur: 4 },
    },
    description: 'Simple clean name bar',
  },
  {
    id: 'lt-subtle',
    name: 'Subtle',
    category: 'minimal',
    style: {
      fontSize: 24,
      fontFamily: 'Arial',
      fontColor: '#E5E5E5',
      backgroundColor: '#1A1A1A',
      backgroundOpacity: 0.8,
      position: { x: 26, y: 88 },
      alignment: 'left',
      verticalAlign: 'bottom',
      width: 40,
      animation: 'fade-word',
      letterSpacing: 0.5,
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
      fontWeight: 'bold',
      fontColor: '#FFFFFF',
      backgroundColor: '#DC2626',
      backgroundOpacity: 0.95,
      position: { x: 50, y: 88 },
      alignment: 'center',
      verticalAlign: 'bottom',
      width: 100,
      animation: 'slide-up',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    description: 'Full-width breaking-news banner',
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
      backgroundOpacity: 0.92,
      position: { x: 50, y: 94 },
      alignment: 'left',
      verticalAlign: 'bottom',
      width: 100,
      animation: 'none',
    },
    description: 'Full-width bottom news strip',
  },

  // Corporate
  {
    id: 'lt-professional',
    name: 'Professional',
    category: 'corporate',
    style: {
      fontSize: 26,
      fontFamily: 'Inter',
      fontWeight: 'bold',
      fontColor: '#FFFFFF',
      backgroundColor: '#1F2937',
      backgroundOpacity: 0.85,
      position: { x: 27, y: 82 },
      alignment: 'left',
      verticalAlign: 'bottom',
      width: 44,
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
      position: { x: 26, y: 85 },
      alignment: 'left',
      verticalAlign: 'bottom',
      width: 40,
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
      fontWeight: 'bold',
      fontColor: '#00FF88',
      backgroundColor: '#000000',
      backgroundOpacity: 0.25,
      position: { x: 50, y: 84 },
      alignment: 'center',
      verticalAlign: 'bottom',
      animation: 'glow',
      animationColor: '#00FF88',
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
      // Transparent background — shadow keeps the gold text legible over any footage.
      dropShadow: { color: '#000000', offsetX: 0, offsetY: 2, blur: 8 },
      letterSpacing: 1,
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
