import type { NodeCategory, PortType } from '../../../constants/node-definitions';

// Iris handoff palette — stroke / glow / soft tint / text accent per category.
// Used by inline styles in node cards, palette rail, and config panel.
export const categoryPalette: Record<
  NodeCategory,
  { stroke: string; glow: string; soft: string; text: string }
> = {
  TRIGGER: {
    stroke: 'var(--color-iris-cat-trigger, #34d399)',
    glow: 'color-mix(in srgb, var(--color-iris-cat-trigger, #34d399) 55%, transparent)',
    soft: 'color-mix(in srgb, var(--color-iris-cat-trigger, #34d399) 10%, transparent)',
    text: 'var(--color-iris-cat-trigger-text, #6ee7b7)',
  },
  GENERATOR: {
    stroke: 'var(--color-iris-cat-generator, #a78bfa)',
    glow: 'color-mix(in srgb, var(--color-iris-cat-generator, #a78bfa) 60%, transparent)',
    soft: 'color-mix(in srgb, var(--color-iris-cat-generator, #a78bfa) 10%, transparent)',
    text: 'var(--color-iris-cat-generator-text, #c4b5fd)',
  },
  ANALYZER: {
    stroke: 'var(--color-iris-cat-analyzer, #7dd3fc)',
    glow: 'color-mix(in srgb, var(--color-iris-cat-analyzer, #7dd3fc) 55%, transparent)',
    soft: 'color-mix(in srgb, var(--color-iris-cat-analyzer, #7dd3fc) 10%, transparent)',
    text: 'var(--color-iris-cat-analyzer-text, #a5f3fc)',
  },
  EDITOR: {
    stroke: 'var(--color-iris-cat-editor, #fbbf24)',
    glow: 'color-mix(in srgb, var(--color-iris-cat-editor, #fbbf24) 55%, transparent)',
    soft: 'color-mix(in srgb, var(--color-iris-cat-editor, #fbbf24) 10%, transparent)',
    text: 'var(--color-iris-cat-editor-text, #fcd34d)',
  },
  UTILITY: {
    stroke: 'var(--color-iris-cat-utility, #94a3b8)',
    glow: 'color-mix(in srgb, var(--color-iris-cat-utility, #94a3b8) 45%, transparent)',
    soft: 'color-mix(in srgb, var(--color-iris-cat-utility, #94a3b8) 10%, transparent)',
    text: 'var(--color-iris-cat-utility-text, #cbd5e1)',
  },
  WEB: {
    stroke: 'var(--color-iris-cat-web, #818cf8)',
    glow: 'color-mix(in srgb, var(--color-iris-cat-web, #818cf8) 55%, transparent)',
    soft: 'color-mix(in srgb, var(--color-iris-cat-web, #818cf8) 10%, transparent)',
    text: 'var(--color-iris-cat-web-text, #a5b4fc)',
  },
  OUTPUT: {
    stroke: 'var(--color-iris-cat-output, #f0abfc)',
    glow: 'color-mix(in srgb, var(--color-iris-cat-output, #f0abfc) 55%, transparent)',
    soft: 'color-mix(in srgb, var(--color-iris-cat-output, #f0abfc) 10%, transparent)',
    text: 'var(--color-iris-cat-output-text, #f5d0fe)',
  },
};

export const categoryColorClasses: Record<
  NodeCategory,
  { bg: string; border: string; text: string; handle: string }
> = {
  TRIGGER: {
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    text: 'text-green-400',
    handle: 'bg-green-500',
  },
  GENERATOR: {
    bg: 'bg-iris-tint-500/10',
    border: 'border-iris-tint-500/30',
    text: 'text-iris-tint-300',
    handle: 'bg-iris-tint-500',
  },
  ANALYZER: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
    handle: 'bg-blue-500',
  },
  EDITOR: {
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    text: 'text-cyan-400',
    handle: 'bg-cyan-500',
  },
  UTILITY: {
    bg: 'bg-iris-tint-500/10',
    border: 'border-iris-tint-500/30',
    text: 'text-iris-tint-400',
    handle: 'bg-iris-tint-500',
  },
  WEB: {
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/30',
    text: 'text-indigo-400',
    handle: 'bg-indigo-500',
  },
  OUTPUT: {
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/30',
    text: 'text-teal-400',
    handle: 'bg-teal-500',
  },
};

export const portTypeColors: Record<PortType, string> = {
  text: 'bg-cyan-500',
  image: 'bg-iris-tint-400',
  video: 'bg-blue-500',
  audio: 'bg-pink-500',
  document: 'bg-yellow-500',
  json: 'bg-amber-500',
  any: 'bg-iris-tint-400',
  trigger: 'bg-green-500',
};

/** Variant used in the node palette sidebar (has `hover` instead of `handle`) */
export const paletteCategoryColors: Record<
  NodeCategory,
  { bg: string; border: string; text: string; hover: string }
> = {
  TRIGGER: {
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    text: 'text-green-400',
    hover: 'hover:bg-green-500/20',
  },
  GENERATOR: {
    bg: 'bg-iris-tint-500/10',
    border: 'border-iris-tint-500/30',
    text: 'text-iris-tint-300',
    hover: 'hover:bg-iris-tint-500/20',
  },
  ANALYZER: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
    hover: 'hover:bg-blue-500/20',
  },
  EDITOR: {
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    text: 'text-cyan-400',
    hover: 'hover:bg-cyan-500/20',
  },
  UTILITY: {
    bg: 'bg-iris-tint-500/10',
    border: 'border-iris-tint-500/30',
    text: 'text-iris-tint-400',
    hover: 'hover:bg-iris-tint-500/20',
  },
  WEB: {
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/30',
    text: 'text-indigo-400',
    hover: 'hover:bg-indigo-500/20',
  },
  OUTPUT: {
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/30',
    text: 'text-teal-400',
    hover: 'hover:bg-teal-500/20',
  },
};
