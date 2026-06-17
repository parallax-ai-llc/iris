import { ReactNode } from 'react';
import { Image, Video, FileText, Zap, Workflow } from 'lucide-react';
import React from 'react';
import { PRESET_TEMPLATES, categoryColors, type PresetTemplate } from 'iris-templates';

// Template data (preset graphs + metadata) is the single source of truth in the
// `iris-templates` package, shared with iris/web. Only the React icon helpers
// (framework-specific) live here.
export { PRESET_TEMPLATES, categoryColors };
export type { PresetTemplate, TemplateNode, TemplateEdge } from 'iris-templates';

// Back-compat alias: desktop code historically referred to the template type as
// `WorkflowTemplate`. Presets now carry full node/edge graphs.
export type WorkflowTemplate = PresetTemplate;

export const categoryIcons: Record<string, ReactNode> = {
  image: React.createElement(Image, { size: 24 }),
  video: React.createElement(Video, { size: 24 }),
  content: React.createElement(FileText, { size: 24 }),
  automation: React.createElement(Zap, { size: 24 }),
};

export function getCategoryIcon(category: string): ReactNode {
  return categoryIcons[category] || React.createElement(Workflow, { size: 24 });
}

export function getCategoryColor(category: string): string {
  return categoryColors[category] || 'from-gray-400 to-slate-600';
}
