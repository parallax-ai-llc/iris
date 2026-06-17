// iris/-local adapter over the shared `iris-nodes` package.
//
// The canonical node catalog (types, configs, ports) lives in
// `packages/iris-nodes/`. This file:
//   1. Re-exports types from iris-nodes for downstream consumers.
//   2. Adds iris/-specific concerns: Lucide icons, provider/model dropdowns,
//      category color theme, and the active subset of nodes shown in the
//      web app's NodePalette.
//
// To add a node to the web picker, just append its type to ENABLED_NODE_TYPES
// after defining it in `packages/iris-nodes/src/nodes/`.

import {
  Zap,
  Clock,
  Webhook,
  Bell,
  MessageSquare,
  Image,
  Video,
  Mic,
  FileText,
  Eye,
  Headphones,
  FileSearch,
  ArrowUpCircle,
  Paintbrush,
  Expand,
  Palette,
  User,
  Eraser,
  Film,
  Layers,
  AudioWaveform,
  Timer,
  GitBranch,
  Repeat,
  Merge,
  Scissors,
  RefreshCw,
  Globe,
  Code,
  HardDrive,
  Mail,
  BellRing,
  Move,
  Music,
  Captions,
  Folder,
  Sun,
  Lightbulb,
  Sparkles,
  Crop,
  SlidersHorizontal,
  Variable,
  FileOutput,
  FileInput,
  Filter,
  Network,
  Combine,
  ShieldAlert,
  Workflow,
  Regex,
  CalendarClock,
  Braces,
  Search,
  BookOpen,
  TextSearch,
  Tags,
  Youtube,
  MessageCircle,
  ClipboardList,
  Inbox,
  AudioLines,
  Speech,
  MessageSquareText,
  Sheet,
  type LucideIcon,
} from 'lucide-react';
import {
  NODE_DEFINITIONS as SHARED_NODE_DEFINITIONS,
  getVoicesForProvider as sharedGetVoicesForProvider,
  type NodeDefinition as SharedNodeDefinition,
  type NodeCategory as SharedNodeCategory,
  type PortDefinition as SharedPortDefinition,
  type ConfigFieldDefinition as SharedConfigFieldDefinition,
} from 'iris-nodes';

// Re-export shared types so existing imports keep working.
export type {
  HeaderEntry,
  PortType,
  ConfigFieldType,
} from 'iris-nodes';
export type NodeCategory = SharedNodeCategory;
export type PortDefinition = SharedPortDefinition;
export type ConfigFieldDefinition = SharedConfigFieldDefinition;

// iris/-local NodeDefinition uses a Lucide component instead of an icon name.
export interface NodeDefinition extends Omit<SharedNodeDefinition, 'iconName'> {
  icon: LucideIcon;
}

// Map iconName → Lucide component. Add entries here when introducing nodes
// whose iconName isn't yet mapped.
const ICON_MAP: Record<string, LucideIcon> = {
  Zap, Clock, Webhook, Bell, MessageSquare, Image, Video, Mic, FileText,
  Eye, Headphones, FileSearch, ArrowUpCircle, Paintbrush, Expand, Palette,
  User, Eraser, Film, Layers, AudioWaveform, Timer, GitBranch, Repeat,
  Merge, Scissors, RefreshCw, Globe, Code, HardDrive, Mail, BellRing, Move,
  Music, Captions, Folder, Sun, Lightbulb, Sparkles, Crop, SlidersHorizontal,
  Variable, FileOutput, FileInput,
  // Phase 1 flow control + data formatter icons
  Filter, Network, Combine, ShieldAlert, Workflow, Regex, CalendarClock, Braces,
  // Phase 2 — WEB / doc / structured-extract / categorize icons
  Search, BookOpen, TextSearch, Tags, Youtube,
  // Phase 3 — new triggers / media-edit / outputs
  MessageCircle, ClipboardList, Inbox, AudioLines, Speech, MessageSquareText, Sheet,
};

function withIcon(shared: SharedNodeDefinition): NodeDefinition {
  const { iconName, ...rest } = shared;
  const icon = ICON_MAP[iconName] ?? RefreshCw;
  return { ...rest, icon };
}

// Category colors (theme hint, not the rendered color)
export const CATEGORY_COLORS: Record<NodeCategory, string> = {
  TRIGGER: 'green',
  GENERATOR: 'purple',
  ANALYZER: 'blue',
  EDITOR: 'orange',
  UTILITY: 'gray',
  WEB: 'indigo',
  OUTPUT: 'teal',
};

export const CATEGORY_ICONS: Record<NodeCategory, LucideIcon> = {
  TRIGGER: Zap,
  GENERATOR: Image,
  ANALYZER: Eye,
  EDITOR: Paintbrush,
  UTILITY: RefreshCw,
  WEB: Globe,
  OUTPUT: HardDrive,
};

// ─── iris/-local provider & model catalog ────────────────────────────────────
// (Not in iris-nodes because each consumer may show different available
// providers depending on its env keys / billing.)

export const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google AI' },
  { value: 'xai', label: 'xAI (Grok)' },
  { value: 'stability', label: 'Stability AI' },
  { value: 'runway', label: 'Runway ML' },
  { value: 'kling', label: 'Kling AI' },
  { value: 'luma', label: 'Luma AI' },
  { value: 'fal', label: 'Fal.ai' },
  { value: 'replicate', label: 'Replicate' },
  { value: 'elevenlabs', label: 'ElevenLabs' },
  { value: 'suno', label: 'Suno AI' },
];

export const MODEL_OPTIONS: Record<string, Record<string, Array<{ value: string; label: string }>>> = {
  'text-to-text': {
    openai: [
      { value: 'gpt-5.2', label: 'GPT 5.2' },
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    ],
    anthropic: [
      { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
      { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
    ],
    google: [
      { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash' },
      { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    ],
    xai: [
      { value: 'grok-3', label: 'Grok 3' },
      { value: 'grok-3-mini', label: 'Grok 3 Mini' },
    ],
  },
  'text-to-image': {
    openai: [
      { value: 'gpt-image-1', label: 'GPT Image 1' },
      { value: 'gpt-image-2', label: 'GPT Image 2' },
    ],
    google: [
      { value: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image' },
      { value: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image' },
    ],
    xai: [
      { value: 'grok-2-image', label: 'Grok 2 Image (Aurora)' },
    ],
    stability: [
      { value: 'sd3.5-large', label: 'SD 3.5 Large' },
      { value: 'sd3.5-large-turbo', label: 'SD 3.5 Large Turbo' },
      { value: 'sd3.5-medium', label: 'SD 3.5 Medium' },
    ],
    fal: [
      { value: 'flux-pro', label: 'Flux Pro' },
      { value: 'flux-dev', label: 'Flux Dev' },
      { value: 'flux-schnell', label: 'Flux Schnell' },
    ],
    replicate: [
      { value: 'sdxl-lightning', label: 'SDXL Lightning' },
      { value: 'sdxl', label: 'SDXL' },
    ],
  },
  'image-to-image': {
    stability: [
      { value: 'sd3.5-large', label: 'SD 3.5 Large' },
      { value: 'sd3.5-medium', label: 'SD 3.5 Medium' },
    ],
    fal: [
      { value: 'flux-dev', label: 'Flux Dev' },
    ],
  },
  'inpaint': {
    google: [
      { value: 'gemini-2.5-flash-preview-05-20', label: 'Gemini 2.5 Flash Image' },
    ],
    stability: [
      { value: 'sd3.5-large', label: 'SD 3.5 Large' },
    ],
    fal: [
      { value: 'flux-fill', label: 'Flux Fill' },
    ],
    replicate: [
      { value: 'sdxl-inpaint', label: 'SDXL Inpaint' },
    ],
  },
  'text-to-video': {
    runway: [
      { value: 'gen3a_turbo', label: 'Gen-3 Alpha Turbo' },
      { value: 'gen3a', label: 'Gen-3 Alpha' },
    ],
    kling: [
      { value: 'kling-2.6', label: 'Kling 2.6' },
      { value: 'kling-2.5', label: 'Kling 2.5' },
      { value: 'kling-2.5-turbo', label: 'Kling 2.5 Turbo' },
      { value: 'kling-2.1', label: 'Kling 2.1' },
      { value: 'kling-2.0', label: 'Kling 2.0' },
    ],
    luma: [
      { value: 'ray-2', label: 'Ray 2' },
      { value: 'ray-1.6', label: 'Ray 1.6' },
    ],
    google: [
      { value: 'veo-3.1-generate-001', label: 'Veo 3.1' },
    ],
    fal: [
      { value: 'minimax-video-01', label: 'MiniMax Video' },
    ],
  },
  'image-to-video': {
    kling: [
      { value: 'kling-2.6', label: 'Kling 2.6 (First/Last Frame)' },
      { value: 'kling-2.5', label: 'Kling 2.5 (First/Last Frame)' },
      { value: 'kling-2.5-turbo', label: 'Kling 2.5 Turbo' },
      { value: 'kling-2.1', label: 'Kling 2.1' },
      { value: 'kling-2.0', label: 'Kling 2.0' },
      { value: 'kling-1.6-standard', label: 'Kling 1.6 Standard' },
    ],
  },
  'text-to-speech': {
    openai: [
      { value: 'tts-1', label: 'TTS-1' },
      { value: 'tts-1-hd', label: 'TTS-1 HD' },
    ],
    elevenlabs: [
      { value: 'eleven_multilingual_v2', label: 'Multilingual v2' },
      { value: 'eleven_turbo_v2', label: 'Turbo v2' },
    ],
  },
  'speech-to-text': {
    openai: [
      { value: 'whisper-1', label: 'Whisper' },
    ],
    google: [
      { value: 'chirp', label: 'Chirp' },
    ],
    elevenlabs: [
      { value: 'scribe_v1', label: 'Scribe v1' },
    ],
  },
  'motion-control': {
    replicate: [
      { value: 'kwaivgi/kling-v2.6-motion-control', label: 'Kling 2.6 Motion Control' },
    ],
  },
  'video-upscale': {
    replicate: [
      { value: 'topazlabs/video-upscale', label: 'Topaz Video Upscale' },
    ],
  },
  'video-inpaint': {
    replicate: [
      { value: 'jd7h/propainter', label: 'ProPainter (Object Removal)' },
      { value: 'ayushunleashed/minimax-remover', label: 'MiniMax Remover (Fast)' },
    ],
  },
  'text-to-music': {
    suno: [
      { value: 'suno-v5', label: 'Suno V5 (Latest)' },
      { value: 'suno-v4.5-all', label: 'Suno V4.5 All' },
      { value: 'suno-v4.5-plus', label: 'Suno V4.5 Plus' },
      { value: 'suno-v4.5', label: 'Suno V4.5' },
      { value: 'suno-v4', label: 'Suno V4' },
    ],
  },
};

export function getModelsForProvider(capability: string, provider: string): Array<{ value: string; label: string }> {
  return MODEL_OPTIONS[capability]?.[provider] ?? [];
}

export function getProvidersForCapability(capability: string): Array<{ value: string; label: string }> {
  const providers = MODEL_OPTIONS[capability];
  if (!providers) return PROVIDER_OPTIONS;
  return PROVIDER_OPTIONS.filter((p) => providers[p.value] !== undefined);
}

// Voice helper re-exported from iris-nodes
export const getVoicesForProvider = sharedGetVoicesForProvider;

// ─── Active node catalog for the web app ────────────────────────────────────
// Subset of iris-nodes shown in the iris/ NodePalette. To toggle a node on
// or off in the web app, edit this list — definitions stay in iris-nodes.

const ENABLED_NODE_TYPES: readonly string[] = [
  // Triggers
  'TRIGGER_MANUAL',
  'TRIGGER_SCHEDULE',
  'TRIGGER_WEBHOOK',
  // Phase 3 — new entry points
  'TRIGGER_CHAT',
  'TRIGGER_FORM',
  'TRIGGER_EMAIL_RECEIVED',
  // 'TRIGGER_EVENT', // Disabled: Event trigger not yet implemented

  // Generators
  'GEN_TEXT_TO_TEXT',
  'GEN_TEXT_TO_IMAGE',
  'GEN_IMAGE_TO_IMAGE',
  'GEN_TEXT_TO_VIDEO',
  'GEN_IMAGE_TO_VIDEO',
  'GEN_TEXT_TO_SPEECH',
  'GEN_SPEECH_TO_TEXT',
  'GEN_VIDEO_SUBTITLE',
  'GEN_TEXT_TO_MUSIC',
  // Phase 3 — talking-head / lip sync
  'GEN_LIP_SYNC',

  // Analyzers
  'ANALYZE_IMAGE',
  'ANALYZE_VIDEO',
  'ANALYZE_TEXT',
  'ANALYZE_AUDIO',
  'ANALYZE_DOCUMENT',
  // Phase 2 — RAG alternatives + structured AI
  'DOC_LONG_CONTEXT',
  'AI_STRUCTURED_EXTRACT',
  'AI_CATEGORIZE',

  // Editors
  'EDIT_IMAGE_UPSCALE',
  'EDIT_IMAGE_INPAINT',
  'EDIT_IMAGE_OUTPAINT',
  'EDIT_IMAGE_STYLE',
  'EDIT_IMAGE_FACE_SWAP',
  'EDIT_IMAGE_BG_REMOVE',
  'EDIT_VIDEO_UPSCALE',
  'EDIT_VIDEO_INPAINT',
  'EDIT_MOTION_CONTROL',
  // Phase 3 — audio split + video composition
  'EDIT_AUDIO_SEPARATE',
  'EDIT_VIDEO_MERGE',
  'EDIT_VIDEO_OVERLAY',

  // Utilities
  'UTIL_DELAY',
  'UTIL_CONDITION',
  'UTIL_LOOP',
  'UTIL_MERGE',
  'UTIL_SPLIT',
  'UTIL_TRANSFORM',
  'UTIL_HTTP_REQUEST',
  // 'UTIL_SCRIPT', // Disabled: Server-side script execution not implemented
  // Phase 1 — flow control
  'UTIL_ROUTER',
  'UTIL_FILTER',
  'UTIL_AGGREGATE',
  'UTIL_TRY_CATCH',
  'UTIL_SUB_WORKFLOW',
  // Phase 1 — data formatters
  'UTIL_REGEX',
  'UTIL_DATE',
  'UTIL_JSON_PATH',
  // Phase 2 — LLM-free document search
  'DOC_GREP',

  // Web (Phase 1 + 2)
  'WEB_SEARCH',
  'WEB_SCRAPER',
  'WEB_YOUTUBE_TRANSCRIPT',

  // Outputs
  'OUTPUT_STORAGE',
  'OUTPUT_WEBHOOK',
  // 'OUTPUT_EMAIL',        // TODO: 이메일 발송 기능 구현 후 활성화
  // 'OUTPUT_NOTIFICATION', // TODO: 알림 기능 구현 후 활성화
  // Phase 3 — Slack post + Google Sheet append
  'OUTPUT_SLACK_POST',
  'OUTPUT_SHEET_APPEND',
];

export const NODE_DEFINITIONS: Record<string, NodeDefinition> = Object.fromEntries(
  ENABLED_NODE_TYPES.flatMap((type) => {
    const shared = SHARED_NODE_DEFINITIONS[type];
    if (!shared) {
      // eslint-disable-next-line no-console
      console.warn(`[iris/node-definitions] Unknown node type in ENABLED_NODE_TYPES: ${type}`);
      return [];
    }
    return [[type, withIcon(shared)]];
  }),
);

// Helpers
export function getNodesByCategory(category: NodeCategory): NodeDefinition[] {
  return Object.values(NODE_DEFINITIONS).filter((node) => node.category === category);
}

export function getNodeCategories(): Array<{ category: NodeCategory; nodes: NodeDefinition[] }> {
  const categories: NodeCategory[] = [
    'TRIGGER',
    'GENERATOR',
    'ANALYZER',
    'EDITOR',
    'UTILITY',
    // Phase 1+2 신설 — Web data collection (Search / Scraper / YouTube Transcript)
    'WEB',
    'OUTPUT',
  ];
  return categories.map((category) => ({
    category,
    nodes: getNodesByCategory(category),
  }));
}

export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return NODE_DEFINITIONS[type];
}

export function getNodeDefaultSettings(type: string): Record<string, unknown> {
  const nodeDef = NODE_DEFINITIONS[type];
  if (!nodeDef?.configFields) return {};

  const settings: Record<string, unknown> = {};
  for (const field of nodeDef.configFields) {
    if (field.defaultValue !== undefined) {
      settings[field.name] = field.defaultValue;
    }
  }
  return settings;
}
