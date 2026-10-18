import type { NodeCategory, PortType } from '../../../constants/node-definitions';

// Iris handoff palette — stroke / glow / soft tint / text accent per category.
// Used by inline styles in node cards, palette rail, and config panel.
export const categoryPalette: Record<
  NodeCategory,
  { stroke: string; glow: string; soft: string; text: string }
> = {
  TRIGGER: {
    stroke: '#34d399',
    glow: 'rgba(52,211,153,0.55)',
    soft: 'rgba(52,211,153,0.10)',
    text: '#6ee7b7',
  },
  GENERATOR: {
    stroke: '#a78bfa',
    glow: 'rgba(167,139,250,0.6)',
    soft: 'rgba(167,139,250,0.10)',
    text: '#c4b5fd',
  },
  ANALYZER: {
    stroke: '#7dd3fc',
    glow: 'rgba(125,211,252,0.55)',
    soft: 'rgba(125,211,252,0.10)',
    text: '#a5f3fc',
  },
  EDITOR: {
    stroke: '#fbbf24',
    glow: 'rgba(251,191,36,0.55)',
    soft: 'rgba(251,191,36,0.10)',
    text: '#fcd34d',
  },
  UTILITY: {
    stroke: '#94a3b8',
    glow: 'rgba(148,163,184,0.45)',
    soft: 'rgba(148,163,184,0.10)',
    text: '#cbd5e1',
  },
  WEB: {
    stroke: '#818cf8',
    glow: 'rgba(129,140,248,0.55)',
    soft: 'rgba(129,140,248,0.10)',
    text: '#a5b4fc',
  },
  OUTPUT: {
    stroke: '#f0abfc',
    glow: 'rgba(240,171,252,0.55)',
    soft: 'rgba(240,171,252,0.10)',
    text: '#f5d0fe',
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
    bg: 'bg-zinc-500/10',
    border: 'border-zinc-500/30',
    text: 'text-zinc-300',
    handle: 'bg-zinc-500',
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
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/30',
    text: 'text-gray-400',
    handle: 'bg-gray-500',
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
  image: 'bg-slate-400',
  video: 'bg-blue-500',
  audio: 'bg-pink-500',
  document: 'bg-yellow-500',
  json: 'bg-amber-500',
  any: 'bg-gray-400',
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
    bg: 'bg-zinc-500/10',
    border: 'border-zinc-500/30',
    text: 'text-zinc-300',
    hover: 'hover:bg-zinc-500/20',
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
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/30',
    text: 'text-gray-400',
    hover: 'hover:bg-gray-500/20',
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
