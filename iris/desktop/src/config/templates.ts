import { ReactNode } from 'react';
import { Image, Video, FileText, Zap, Workflow } from 'lucide-react';
import React from 'react';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  tags?: string[];
  nodeCount?: number;
  usageCount?: number;
}

export const categoryIcons: Record<string, ReactNode> = {
  image: React.createElement(Image, { size: 24 }),
  video: React.createElement(Video, { size: 24 }),
  content: React.createElement(FileText, { size: 24 }),
  automation: React.createElement(Zap, { size: 24 }),
};

export const categoryColors: Record<string, string> = {
  image: 'from-purple-500 to-pink-500',
  video: 'from-blue-500 to-cyan-500',
  content: 'from-green-500 to-emerald-500',
  automation: 'from-yellow-500 to-orange-500',
};

export const PRESET_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'preset-sns-content-image',
    name: 'SNS Content Image',
    description: 'Generate SNS images from text prompts with high-quality upscaling',
    category: 'image',
    tags: ['flux', 'image', 'sns', 'upscale'],
    nodeCount: 3,
  },
  {
    id: 'preset-product-bg-remove',
    name: 'Product Background Removal',
    description: 'Automatically remove backgrounds from product images for clean cutouts',
    category: 'image',
    tags: ['background', 'remove', 'product', 'ecommerce'],
    nodeCount: 3,
  },
  {
    id: 'preset-ai-style-transfer',
    name: 'AI Style Transfer',
    description: 'Transform original images into various art styles',
    category: 'image',
    tags: ['stability', 'style', 'art', 'transform'],
    nodeCount: 3,
  },
  {
    id: 'preset-product-promo-video',
    name: 'Product Promo Video',
    description: 'Generate images from text descriptions and convert to video',
    category: 'video',
    tags: ['flux', 'kling', 'video', 'promo', 'product'],
    nodeCount: 3,
  },
  {
    id: 'preset-image-animation',
    name: 'Image Animation',
    description: 'Transform static images into dynamic videos',
    category: 'video',
    tags: ['kling', 'animation', 'video'],
    nodeCount: 3,
  },
  {
    id: 'preset-ai-music-video',
    name: 'AI Music Video',
    description: 'Generate video and background music simultaneously from text',
    category: 'video',
    tags: ['runway', 'suno', 'music', 'video'],
    nodeCount: 4,
  },
  {
    id: 'preset-blog-post-generator',
    name: 'Blog Post Generator',
    description: 'Automatically write SEO-optimized blog posts from a topic',
    category: 'content',
    tags: ['anthropic', 'claude', 'blog', 'seo', 'writing'],
    nodeCount: 3,
  },
  {
    id: 'preset-multilingual-translation',
    name: 'Multilingual Translation',
    description: 'Automatically translate content into multiple languages',
    category: 'content',
    tags: ['openai', 'gpt', 'translation', 'multilingual'],
    nodeCount: 4,
  },
  {
    id: 'preset-podcast-script-audio',
    name: 'Podcast Script + Audio',
    description: 'Generate script from a topic and synthesize voice',
    category: 'content',
    tags: ['anthropic', 'elevenlabs', 'podcast', 'tts', 'audio'],
    nodeCount: 3,
  },
  {
    id: 'preset-image-analysis-report',
    name: 'Image Analysis Report',
    description: 'Analyze images and automatically generate detailed descriptions',
    category: 'automation',
    tags: ['openai', 'gpt', 'analysis', 'report'],
    nodeCount: 4,
  },
  {
    id: 'preset-document-summary',
    name: 'Document Summary Automation',
    description: 'Analyze long documents and generate key summaries',
    category: 'automation',
    tags: ['openai', 'gpt', 'document', 'summary'],
    nodeCount: 3,
  },
  {
    id: 'preset-webhook-content-pipeline',
    name: 'Webhook Content Pipeline',
    description: 'Automatic content generation pipeline triggered externally',
    category: 'automation',
    tags: ['webhook', 'automation', 'pipeline'],
    nodeCount: 3,
  },

  // ================================
  // FLAGSHIP TEMPLATES (advanced, multi-stage)
  // ================================
  {
    id: 'preset-deposit-guard',
    name: 'Deposit Guard',
    description: 'Turn rental move-out inspection photos into an objective deposit-settlement report',
    category: 'automation',
    tags: ['form', 'vision', 'analysis', 'real-estate', 'report'],
    nodeCount: 11,
  },
  {
    id: 'preset-rfq-auto-responder',
    name: 'RFQ Auto-Responder',
    description: 'Read inbound B2B quote requests and produce a draft quote and reply for review',
    category: 'automation',
    tags: ['email', 'b2b', 'sales', 'quote', 'automation'],
    nodeCount: 12,
  },
  {
    id: 'preset-competitor-watchdog',
    name: 'Competitor Watchdog',
    description: 'Monitor competitor product pages on a schedule, detect changes, and recommend a response',
    category: 'automation',
    tags: ['schedule', 'scraping', 'monitoring', 'price', 'alert'],
    nodeCount: 17,
  },
  {
    id: 'preset-ai-research-analyst',
    name: 'AI Research Analyst',
    description: 'Autonomous agent that researches a topic and returns a structured market/competitor report',
    category: 'automation',
    tags: ['agent', 'research', 'web-search', 'anthropic', 'claude'],
    nodeCount: 10,
  },
];

export function getCategoryIcon(category: string): ReactNode {
  return categoryIcons[category] || React.createElement(Workflow, { size: 24 });
}

export function getCategoryColor(category: string): string {
  return categoryColors[category] || 'from-gray-500 to-gray-600';
}
