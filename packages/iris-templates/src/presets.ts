import type { PresetTemplate, BlankTemplateMeta } from './types.js';

export type { PresetTemplate, BlankTemplateMeta } from './types.js';

// Node label translation keys mapping
export const NODE_LABEL_I18N_KEYS: Record<string, string> = {
  'Manual Trigger': 'manualTrigger',
  'Image Generator': 'imageGenerator',
  'Image Upscale': 'imageUpscale',
  'Background Remove': 'backgroundRemove',
  'Save to Storage': 'saveToStorage',
  'Image to Image': 'imageToImage',
  'Image to Video': 'imageToVideo',
  'Text to Video': 'textToVideo',
  'Text to Music': 'textToMusic',
  'Merge': 'merge',
  'Outline Generator': 'outlineGenerator',
  'Content Writer': 'contentWriter',
  'English Translation': 'englishTranslation',
  'Japanese Translation': 'japaneseTranslation',
  'Chinese Translation': 'chineseTranslation',
  'Script Generator': 'scriptGenerator',
  'Text to Speech': 'textToSpeech',
  'Image Analyzer': 'imageAnalyzer',
  'Report Generator': 'reportGenerator',
  'Document Analyzer': 'documentAnalyzer',
  'Summary Generator': 'summaryGenerator',
  'Webhook Trigger': 'webhookTrigger',
  'Content Generator': 'contentGenerator',
  'Webhook Output': 'webhookOutput',
};

// Input label translation keys mapping
export const INPUT_LABEL_I18N_KEYS: Record<string, string> = {
  'SNS 이미지 프롬프트를 입력하세요': 'snsImagePrompt',
  '상품 이미지를 업로드하세요': 'uploadProductImage',
  '스타일 변환할 이미지를 업로드하세요': 'uploadStyleImage',
  '제품 설명을 입력하세요': 'enterProductDescription',
  '애니메이션할 이미지를 업로드하세요': 'uploadAnimationImage',
  '뮤직비디오 컨셉을 입력하세요': 'enterMusicVideoConcept',
  '블로그 주제를 입력하세요': 'enterBlogTopic',
  '번역할 텍스트를 입력하세요': 'enterTextToTranslate',
  '팟캐스트 주제를 입력하세요': 'enterPodcastTopic',
  '분석할 이미지를 업로드하세요': 'uploadImageToAnalyze',
  '문서 이미지를 업로드하세요 (PDF 페이지, 스캔)': 'uploadDocumentImage',
};

export const categoryColors: Record<string, string> = {
  image: 'from-purple-500 to-pink-500',
  video: 'from-blue-500 to-cyan-500',
  content: 'from-green-500 to-emerald-500',
  automation: 'from-yellow-500 to-orange-500',
  blank: 'from-gray-400 to-slate-600',
};

// Blank canvas template (always available)
export const BLANK_TEMPLATE: BlankTemplateMeta = {
  id: 'blank',
  name: 'Blank Canvas',
  description: 'Start from scratch with an empty workflow',
  category: 'blank',
};

// Model logo mapping based on tags or template name
export function getModelLogo(template: { name: string; tags?: string[] }): string | null {
  const tags = template.tags || [];
  const name = template.name.toLowerCase();

  if (tags.includes('openai') || tags.includes('gpt-5') || tags.includes('gpt-4') || tags.includes('gpt-image') || name.includes('gpt')) {
    return '/model/openai-black.svg';
  }
  if (tags.includes('anthropic') || tags.includes('claude') || name.includes('claude')) {
    return '/model/claude-color.svg';
  }
  if (tags.includes('stability') || tags.includes('stable-diffusion') || name.includes('stable diffusion')) {
    return '/model/stability-color.svg';
  }
  if (tags.includes('flux') || name.includes('flux')) {
    return '/model/flux-black.svg';
  }
  if (tags.includes('fal')) {
    return '/model/fal-color.svg';
  }
  if (tags.includes('kling') || name.includes('kling')) {
    return '/model/kling-color.svg';
  }
  if (tags.includes('luma') || name.includes('luma')) {
    return '/model/luma-color.svg';
  }
  if (tags.includes('runway') || name.includes('runway')) {
    return '/model/runway-black.svg';
  }
  if (tags.includes('elevenlabs') || name.includes('elevenlabs')) {
    return '/model/elevenlabs-black.svg';
  }
  if (tags.includes('google') || tags.includes('gemini') || name.includes('gemini')) {
    return '/model/gemini-color.svg';
  }
  if (tags.includes('xai') || tags.includes('grok') || name.includes('grok')) {
    return '/model/grok-black.svg';
  }
  if (tags.includes('minimax') || name.includes('minimax')) {
    return '/model/minimax-color.svg';
  }
  if (tags.includes('replicate')) {
    return '/model/replicate-black.svg';
  }
  if (tags.includes('pika') || name.includes('pika')) {
    return '/model/pika-black.svg';
  }

  return null;
}

// ================================
// PRESET TEMPLATES
// ================================

export const PRESET_TEMPLATES: PresetTemplate[] = [
  // ================================
  // IMAGE CATEGORY (3 templates)
  // ================================
  {
    id: 'preset-sns-content-image',
    isPreset: true,
    i18nKey: 'snsContentImage',
    name: 'SNS Content Image',
    description: 'Generate SNS images from text prompts with high-quality upscaling',
    category: 'image',
    tags: ['flux', 'image', 'sns', 'upscale'],
    nodeCount: 3,
    presetNodes: [
      {
        nodeId: 'trigger-1',
        type: 'TRIGGER_MANUAL',
        label: 'Manual Trigger',
        positionX: 100,
        positionY: 200,
        config: { inputType: 'text', inputLabel: 'SNS 이미지 프롬프트를 입력하세요' },
      },
      {
        nodeId: 'gen-image-1',
        type: 'GEN_TEXT_TO_IMAGE',
        label: 'Image Generator',
        positionX: 400,
        positionY: 200,
        config: { provider: 'fal', model: 'flux-pro', aspectRatio: '1:1' },
      },
      {
        nodeId: 'upscale-1',
        type: 'EDIT_IMAGE_UPSCALE',
        label: 'Image Upscale',
        positionX: 700,
        positionY: 200,
        config: { scale: '2' },
      },
    ],
    presetEdges: [
      {
        edgeId: 'edge-1',
        sourceNodeId: 'trigger-1',
        sourceHandle: 'text',
        targetNodeId: 'gen-image-1',
        targetHandle: 'prompt',
      },
      {
        edgeId: 'edge-2',
        sourceNodeId: 'gen-image-1',
        sourceHandle: 'image',
        targetNodeId: 'upscale-1',
        targetHandle: 'image',
      },
    ],
  },
  {
    id: 'preset-product-bg-remove',
    isPreset: true,
    i18nKey: 'productBgRemove',
    name: 'Product Background Removal',
    description: 'Automatically remove backgrounds from product images for clean cutouts',
    category: 'image',
    tags: ['background', 'remove', 'product', 'ecommerce'],
    nodeCount: 3,
    presetNodes: [
      {
        nodeId: 'trigger-1',
        type: 'TRIGGER_MANUAL',
        label: 'Manual Trigger',
        positionX: 100,
        positionY: 200,
        config: { inputType: 'image', inputLabel: '상품 이미지를 업로드하세요' },
      },
      {
        nodeId: 'bg-remove-1',
        type: 'EDIT_IMAGE_BG_REMOVE',
        label: 'Background Remove',
        positionX: 400,
        positionY: 200,
        config: {},
      },
      {
        nodeId: 'storage-1',
        type: 'OUTPUT_STORAGE',
        label: 'Save to Storage',
        positionX: 700,
        positionY: 200,
        config: { folder: 'product-images', filename: '{{timestamp}}_product' },
      },
    ],
    presetEdges: [
      {
        edgeId: 'edge-1',
        sourceNodeId: 'trigger-1',
        sourceHandle: 'image',
        targetNodeId: 'bg-remove-1',
        targetHandle: 'image',
      },
      {
        edgeId: 'edge-2',
        sourceNodeId: 'bg-remove-1',
        sourceHandle: 'image',
        targetNodeId: 'storage-1',
        targetHandle: 'data',
      },
    ],
  },
  {
    id: 'preset-ai-style-transfer',
    isPreset: true,
    i18nKey: 'aiStyleTransfer',
    name: 'AI Style Transfer',
    description: 'Transform original images into various art styles',
    category: 'image',
    tags: ['stability', 'style', 'art', 'transform'],
    nodeCount: 3,
    presetNodes: [
      {
        nodeId: 'trigger-1',
        type: 'TRIGGER_MANUAL',
        label: 'Manual Trigger',
        positionX: 100,
        positionY: 200,
        config: { inputType: 'image', inputLabel: '스타일 변환할 이미지를 업로드하세요' },
      },
      {
        nodeId: 'img2img-1',
        type: 'GEN_IMAGE_TO_IMAGE',
        label: 'Image to Image',
        positionX: 400,
        positionY: 200,
        config: { provider: 'stability', model: 'sd3.5-large', strength: 0.75 },
      },
      {
        nodeId: 'upscale-1',
        type: 'EDIT_IMAGE_UPSCALE',
        label: 'Image Upscale',
        positionX: 700,
        positionY: 200,
        config: { scale: '2' },
      },
    ],
    presetEdges: [
      {
        edgeId: 'edge-1',
        sourceNodeId: 'trigger-1',
        sourceHandle: 'image',
        targetNodeId: 'img2img-1',
        targetHandle: 'image',
      },
      {
        edgeId: 'edge-2',
        sourceNodeId: 'img2img-1',
        sourceHandle: 'image',
        targetNodeId: 'upscale-1',
        targetHandle: 'image',
      },
    ],
  },

  // ================================
  // VIDEO CATEGORY (3 templates)
  // ================================
  {
    id: 'preset-product-promo-video',
    isPreset: true,
    i18nKey: 'productPromoVideo',
    name: 'Product Promo Video',
    description: 'Generate images from text descriptions and convert to video',
    category: 'video',
    tags: ['flux', 'kling', 'video', 'promo', 'product'],
    nodeCount: 3,
    presetNodes: [
      {
        nodeId: 'trigger-1',
        type: 'TRIGGER_MANUAL',
        label: 'Manual Trigger',
        positionX: 100,
        positionY: 200,
        config: { inputType: 'text', inputLabel: '제품 설명을 입력하세요' },
      },
      {
        nodeId: 'gen-image-1',
        type: 'GEN_TEXT_TO_IMAGE',
        label: 'Image Generator',
        positionX: 400,
        positionY: 200,
        config: { provider: 'fal', model: 'flux-pro', aspectRatio: '16:9' },
      },
      {
        nodeId: 'img2video-1',
        type: 'GEN_IMAGE_TO_VIDEO',
        label: 'Image to Video',
        positionX: 700,
        positionY: 200,
        config: { provider: 'kling', model: 'kling-2.5', duration: '5', aspectRatio: '16:9' },
      },
    ],
    presetEdges: [
      {
        edgeId: 'edge-1',
        sourceNodeId: 'trigger-1',
        sourceHandle: 'text',
        targetNodeId: 'gen-image-1',
        targetHandle: 'prompt',
      },
      {
        edgeId: 'edge-2',
        sourceNodeId: 'trigger-1',
        sourceHandle: 'text',
        targetNodeId: 'img2video-1',
        targetHandle: 'prompt',
      },
      {
        edgeId: 'edge-3',
        sourceNodeId: 'gen-image-1',
        sourceHandle: 'image',
        targetNodeId: 'img2video-1',
        targetHandle: 'image',
      },
    ],
  },
  {
    id: 'preset-image-animation',
    isPreset: true,
    i18nKey: 'imageAnimation',
    name: 'Image Animation',
    description: 'Transform static images into dynamic videos',
    category: 'video',
    tags: ['kling', 'animation', 'video'],
    nodeCount: 3,
    presetNodes: [
      {
        nodeId: 'trigger-1',
        type: 'TRIGGER_MANUAL',
        label: 'Manual Trigger',
        positionX: 100,
        positionY: 200,
        config: { inputType: 'image', inputLabel: '애니메이션할 이미지를 업로드하세요' },
      },
      {
        nodeId: 'img2video-1',
        type: 'GEN_IMAGE_TO_VIDEO',
        label: 'Image to Video',
        positionX: 400,
        positionY: 200,
        config: { provider: 'kling', model: 'kling-2.5', duration: '5', aspectRatio: '16:9' },
      },
      {
        nodeId: 'storage-1',
        type: 'OUTPUT_STORAGE',
        label: 'Save to Storage',
        positionX: 700,
        positionY: 200,
        config: { folder: 'animated-videos', filename: '{{timestamp}}_animation' },
      },
    ],
    presetEdges: [
      {
        edgeId: 'edge-1',
        sourceNodeId: 'trigger-1',
        sourceHandle: 'image',
        targetNodeId: 'img2video-1',
        targetHandle: 'image',
      },
      {
        edgeId: 'edge-2',
        sourceNodeId: 'img2video-1',
        sourceHandle: 'video',
        targetNodeId: 'storage-1',
        targetHandle: 'data',
      },
    ],
  },
  {
    id: 'preset-ai-music-video',
    isPreset: true,
    i18nKey: 'aiMusicVideo',
    name: 'AI Music Video',
    description: 'Generate video and background music simultaneously from text',
    category: 'video',
    tags: ['runway', 'suno', 'music', 'video'],
    nodeCount: 4,
    presetNodes: [
      {
        nodeId: 'trigger-1',
        type: 'TRIGGER_MANUAL',
        label: 'Manual Trigger',
        positionX: 100,
        positionY: 250,
        config: { inputType: 'text', inputLabel: '뮤직비디오 컨셉을 입력하세요' },
      },
      {
        nodeId: 'gen-video-1',
        type: 'GEN_TEXT_TO_VIDEO',
        label: 'Text to Video',
        positionX: 400,
        positionY: 150,
        config: { provider: 'runway', model: 'gen3a_turbo', duration: '10', aspectRatio: '16:9' },
      },
      {
        nodeId: 'gen-music-1',
        type: 'GEN_TEXT_TO_MUSIC',
        label: 'Text to Music',
        positionX: 400,
        positionY: 350,
        config: { provider: 'suno', model: 'suno-v4.5', instrumental: false },
      },
      {
        nodeId: 'merge-1',
        type: 'UTIL_MERGE',
        label: 'Merge',
        positionX: 700,
        positionY: 250,
        config: { mode: 'object' },
      },
    ],
    presetEdges: [
      {
        edgeId: 'edge-1',
        sourceNodeId: 'trigger-1',
        sourceHandle: 'text',
        targetNodeId: 'gen-video-1',
        targetHandle: 'prompt',
      },
      {
        edgeId: 'edge-2',
        sourceNodeId: 'trigger-1',
        sourceHandle: 'text',
        targetNodeId: 'gen-music-1',
        targetHandle: 'prompt',
      },
      {
        edgeId: 'edge-3',
        sourceNodeId: 'gen-video-1',
        sourceHandle: 'video',
        targetNodeId: 'merge-1',
        targetHandle: 'input1',
      },
      {
        edgeId: 'edge-4',
        sourceNodeId: 'gen-music-1',
        sourceHandle: 'audio',
        targetNodeId: 'merge-1',
        targetHandle: 'input2',
      },
    ],
  },

  // ================================
  // CONTENT CATEGORY (3 templates)
  // ================================
  {
    id: 'preset-blog-post-generator',
    isPreset: true,
    i18nKey: 'blogPostGenerator',
    name: 'Blog Post Generator',
    description: 'Automatically write SEO-optimized blog posts from a topic',
    category: 'content',
    tags: ['anthropic', 'claude', 'blog', 'seo', 'writing'],
    nodeCount: 3,
    presetNodes: [
      {
        nodeId: 'trigger-1',
        type: 'TRIGGER_MANUAL',
        label: 'Manual Trigger',
        positionX: 100,
        positionY: 200,
        config: { inputType: 'text', inputLabel: '블로그 주제를 입력하세요' },
      },
      {
        nodeId: 'gen-outline-1',
        type: 'GEN_TEXT_TO_TEXT',
        label: 'Outline Generator',
        positionX: 400,
        positionY: 200,
        config: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          systemPrompt: 'You are an SEO expert. Create a detailed blog post outline with H2 and H3 headings. Include SEO keywords naturally.',
          temperature: 0.7,
        },
      },
      {
        nodeId: 'gen-content-1',
        type: 'GEN_TEXT_TO_TEXT',
        label: 'Content Writer',
        positionX: 700,
        positionY: 200,
        config: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          systemPrompt: 'You are a professional content writer. Write a complete, engaging blog post based on the given outline. Use markdown formatting.',
          temperature: 0.8,
        },
      },
    ],
    presetEdges: [
      {
        edgeId: 'edge-1',
        sourceNodeId: 'trigger-1',
        sourceHandle: 'text',
        targetNodeId: 'gen-outline-1',
        targetHandle: 'prompt',
      },
      {
        edgeId: 'edge-2',
        sourceNodeId: 'gen-outline-1',
        sourceHandle: 'text',
        targetNodeId: 'gen-content-1',
        targetHandle: 'prompt',
      },
    ],
  },
  {
    id: 'preset-multilingual-translation',
    isPreset: true,
    i18nKey: 'multilingualTranslation',
    name: 'Multilingual Translation',
    description: 'Automatically translate content into multiple languages',
    category: 'content',
    tags: ['openai', 'gpt', 'translation', 'multilingual'],
    nodeCount: 4,
    presetNodes: [
      {
        nodeId: 'trigger-1',
        type: 'TRIGGER_MANUAL',
        label: 'Manual Trigger',
        positionX: 100,
        positionY: 250,
        config: { inputType: 'text', inputLabel: '번역할 텍스트를 입력하세요' },
      },
      {
        nodeId: 'translate-en-1',
        type: 'GEN_TEXT_TO_TEXT',
        label: 'English Translation',
        positionX: 400,
        positionY: 100,
        config: {
          provider: 'openai',
          model: 'gpt-4o',
          systemPrompt: 'You are a professional translator. Translate the following text to English. Preserve the original meaning and tone. Only output the translation.',
          temperature: 0.3,
        },
      },
      {
        nodeId: 'translate-ja-1',
        type: 'GEN_TEXT_TO_TEXT',
        label: 'Japanese Translation',
        positionX: 400,
        positionY: 250,
        config: {
          provider: 'openai',
          model: 'gpt-4o',
          systemPrompt: 'You are a professional translator. Translate the following text to Japanese. Preserve the original meaning and tone. Only output the translation.',
          temperature: 0.3,
        },
      },
      {
        nodeId: 'translate-zh-1',
        type: 'GEN_TEXT_TO_TEXT',
        label: 'Chinese Translation',
        positionX: 400,
        positionY: 400,
        config: {
          provider: 'openai',
          model: 'gpt-4o',
          systemPrompt: 'You are a professional translator. Translate the following text to Simplified Chinese. Preserve the original meaning and tone. Only output the translation.',
          temperature: 0.3,
        },
      },
    ],
    presetEdges: [
      {
        edgeId: 'edge-1',
        sourceNodeId: 'trigger-1',
        sourceHandle: 'text',
        targetNodeId: 'translate-en-1',
        targetHandle: 'prompt',
      },
      {
        edgeId: 'edge-2',
        sourceNodeId: 'trigger-1',
        sourceHandle: 'text',
        targetNodeId: 'translate-ja-1',
        targetHandle: 'prompt',
      },
      {
        edgeId: 'edge-3',
        sourceNodeId: 'trigger-1',
        sourceHandle: 'text',
        targetNodeId: 'translate-zh-1',
        targetHandle: 'prompt',
      },
    ],
  },
  {
    id: 'preset-podcast-script-audio',
    isPreset: true,
    i18nKey: 'podcastScriptAudio',
    name: 'Podcast Script + Audio',
    description: 'Generate script from a topic and synthesize voice',
    category: 'content',
    tags: ['anthropic', 'elevenlabs', 'podcast', 'tts', 'audio'],
    nodeCount: 3,
    presetNodes: [
      {
        nodeId: 'trigger-1',
        type: 'TRIGGER_MANUAL',
        label: 'Manual Trigger',
        positionX: 100,
        positionY: 200,
        config: { inputType: 'text', inputLabel: '팟캐스트 주제를 입력하세요' },
      },
      {
        nodeId: 'gen-script-1',
        type: 'GEN_TEXT_TO_TEXT',
        label: 'Script Generator',
        positionX: 400,
        positionY: 200,
        config: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          systemPrompt: 'You are a podcast scriptwriter. Write a natural, conversational podcast script for a single host. Include intro, main content, and outro. Use natural speech patterns.',
          temperature: 0.8,
        },
      },
      {
        nodeId: 'tts-1',
        type: 'GEN_TEXT_TO_SPEECH',
        label: 'Text to Speech',
        positionX: 700,
        positionY: 200,
        config: { provider: 'elevenlabs', model: 'eleven_multilingual_v2', voice: '21m00Tcm4TlvDq8ikWAM', speed: 1 },
      },
    ],
    presetEdges: [
      {
        edgeId: 'edge-1',
        sourceNodeId: 'trigger-1',
        sourceHandle: 'text',
        targetNodeId: 'gen-script-1',
        targetHandle: 'prompt',
      },
      {
        edgeId: 'edge-2',
        sourceNodeId: 'gen-script-1',
        sourceHandle: 'text',
        targetNodeId: 'tts-1',
        targetHandle: 'text',
      },
    ],
  },

  // ================================
  // AUTOMATION CATEGORY (3 templates)
  // ================================
  {
    id: 'preset-image-analysis-report',
    isPreset: true,
    i18nKey: 'imageAnalysisReport',
    name: 'Image Analysis Report',
    description: 'Analyze images and automatically generate detailed descriptions',
    category: 'automation',
    tags: ['openai', 'gpt', 'analysis', 'report'],
    nodeCount: 4,
    presetNodes: [
      {
        nodeId: 'trigger-1',
        type: 'TRIGGER_MANUAL',
        label: 'Manual Trigger',
        positionX: 100,
        positionY: 200,
        config: { inputType: 'image', inputLabel: '분석할 이미지를 업로드하세요' },
      },
      {
        nodeId: 'analyze-1',
        type: 'ANALYZE_IMAGE',
        label: 'Image Analyzer',
        positionX: 400,
        positionY: 200,
        config: { analysisType: 'describe' },
      },
      {
        nodeId: 'gen-report-1',
        type: 'GEN_TEXT_TO_TEXT',
        label: 'Report Generator',
        positionX: 700,
        positionY: 200,
        config: {
          provider: 'openai',
          model: 'gpt-4o',
          systemPrompt: 'You are an image analysis expert. Based on the image description provided, create a detailed analysis report including: 1) Main subjects 2) Composition analysis 3) Color palette 4) Mood and atmosphere 5) Potential use cases. Format as markdown.',
          temperature: 0.7,
        },
      },
      {
        nodeId: 'storage-1',
        type: 'OUTPUT_STORAGE',
        label: 'Save to Storage',
        positionX: 1000,
        positionY: 200,
        config: { folder: 'analysis-reports', filename: '{{timestamp}}_report' },
      },
    ],
    presetEdges: [
      {
        edgeId: 'edge-1',
        sourceNodeId: 'trigger-1',
        sourceHandle: 'image',
        targetNodeId: 'analyze-1',
        targetHandle: 'image',
      },
      {
        edgeId: 'edge-2',
        sourceNodeId: 'analyze-1',
        sourceHandle: 'description',
        targetNodeId: 'gen-report-1',
        targetHandle: 'prompt',
      },
      {
        edgeId: 'edge-3',
        sourceNodeId: 'gen-report-1',
        sourceHandle: 'text',
        targetNodeId: 'storage-1',
        targetHandle: 'data',
      },
    ],
  },
  {
    id: 'preset-document-summary',
    isPreset: true,
    i18nKey: 'documentSummary',
    name: 'Document Summary Automation',
    description: 'Analyze long documents and generate key summaries',
    category: 'automation',
    tags: ['openai', 'gpt', 'document', 'summary'],
    nodeCount: 3,
    presetNodes: [
      {
        nodeId: 'trigger-1',
        type: 'TRIGGER_MANUAL',
        label: 'Manual Trigger',
        positionX: 100,
        positionY: 200,
        config: { inputType: 'image', inputLabel: '문서 이미지를 업로드하세요 (PDF 페이지, 스캔)' },
      },
      {
        nodeId: 'analyze-doc-1',
        type: 'ANALYZE_DOCUMENT',
        label: 'Document Analyzer',
        positionX: 400,
        positionY: 200,
        config: { model: 'gpt-4o', prompt: 'Extract all text content from this document accurately.' },
      },
      {
        nodeId: 'gen-summary-1',
        type: 'GEN_TEXT_TO_TEXT',
        label: 'Summary Generator',
        positionX: 700,
        positionY: 200,
        config: {
          provider: 'openai',
          model: 'gpt-4o',
          systemPrompt: 'You are a document summarization expert. Create a structured summary including: 1) Executive Summary (2-3 sentences) 2) Key Points (bullet list) 3) Action Items (if any) 4) Important Dates/Numbers. Format as markdown.',
          temperature: 0.5,
        },
      },
    ],
    presetEdges: [
      {
        edgeId: 'edge-1',
        sourceNodeId: 'trigger-1',
        sourceHandle: 'image',
        targetNodeId: 'analyze-doc-1',
        targetHandle: 'document',
      },
      {
        edgeId: 'edge-2',
        sourceNodeId: 'analyze-doc-1',
        sourceHandle: 'analysis',
        targetNodeId: 'gen-summary-1',
        targetHandle: 'prompt',
      },
    ],
  },
  {
    id: 'preset-webhook-content-pipeline',
    isPreset: true,
    i18nKey: 'webhookContentPipeline',
    name: 'Webhook Content Pipeline',
    description: 'Automatic content generation pipeline triggered externally',
    category: 'automation',
    tags: ['webhook', 'automation', 'pipeline'],
    nodeCount: 3,
    presetNodes: [
      {
        nodeId: 'trigger-webhook-1',
        type: 'TRIGGER_WEBHOOK',
        label: 'Webhook Trigger',
        positionX: 100,
        positionY: 200,
        config: {},
      },
      {
        nodeId: 'gen-content-1',
        type: 'GEN_TEXT_TO_TEXT',
        label: 'Content Generator',
        positionX: 400,
        positionY: 200,
        config: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          systemPrompt: 'You are a content generation assistant. Process the incoming webhook data and generate appropriate content based on the payload. Output structured, professional content.',
          temperature: 0.7,
        },
      },
      {
        nodeId: 'output-webhook-1',
        type: 'OUTPUT_WEBHOOK',
        label: 'Webhook Output',
        positionX: 700,
        positionY: 200,
        config: { method: 'POST', url: '' },
      },
    ],
    presetEdges: [
      {
        edgeId: 'edge-1',
        sourceNodeId: 'trigger-webhook-1',
        sourceHandle: 'payload',
        targetNodeId: 'gen-content-1',
        targetHandle: 'prompt',
      },
      {
        edgeId: 'edge-2',
        sourceNodeId: 'gen-content-1',
        sourceHandle: 'text',
        targetNodeId: 'output-webhook-1',
        targetHandle: 'data',
      },
    ],
  },

  // ================================
  // FLAGSHIP TEMPLATES (advanced, multi-stage)
  // ================================

  // --- Deposit Guard: rental move-out inspection & settlement ---
  {
    id: 'preset-deposit-guard',
    isPreset: true,
    i18nKey: 'depositGuard',
    name: 'Deposit Guard',
    description: 'Turn rental move-out inspection photos into an objective deposit-settlement report',
    category: 'automation',
    tags: ['form', 'vision', 'analysis', 'real-estate', 'report'],
    nodeCount: 11,
    presetNodes: [
      {
        nodeId: 'trigger-1',
        type: 'TRIGGER_FORM',
        label: 'Form Trigger',
        positionX: 80,
        positionY: 360,
        config: {
          title: 'Move-out Inspection',
          description: 'Submit move-out photos and contract details',
          requireAuth: true,
          fields:
            '[{"name":"room_photos","type":"file","required":true},{"name":"baseline_urls","type":"textarea"},{"name":"contract","type":"textarea","required":true}]',
        },
      },
      {
        nodeId: 'loop-1',
        type: 'UTIL_LOOP',
        label: 'Loop (per room)',
        positionX: 340,
        positionY: 360,
        config: { maxIterations: 50 },
      },
      {
        nodeId: 'analyze-1',
        type: 'ANALYZE_IMAGE',
        label: 'Image Analyzer',
        positionX: 600,
        positionY: 240,
        config: { analysisType: 'custom' },
      },
      {
        nodeId: 'extract-1',
        type: 'AI_STRUCTURED_EXTRACT',
        label: 'Structured Extract',
        positionX: 860,
        positionY: 240,
        config: {
          provider: 'openai',
          model: 'gpt-4o',
          schema:
            '{ "type": "object", "properties": { "location": {"type":"string"}, "damage_type": {"type":"string"}, "severity": {"type":"string","enum":["low","medium","high"]}, "normal_wear": {"type":"boolean"}, "estimated_repair_cost": {"type":"number"} }, "required": ["location","damage_type","severity","normal_wear"] }',
          instruction: 'Extract a damage line-item from the inspection finding.',
          strict: true,
        },
      },
      {
        nodeId: 'categorize-1',
        type: 'AI_CATEGORIZE',
        label: 'Categorize',
        positionX: 860,
        positionY: 460,
        config: {
          provider: 'openai',
          model: 'gpt-4o',
          categories: 'normal_wear, tenant_fault, needs_review',
          allowMultiple: true,
          allowNone: false,
        },
      },
      {
        nodeId: 'filter-1',
        type: 'UTIL_FILTER',
        label: 'Filter (chargeable)',
        positionX: 1120,
        positionY: 240,
        config: { condition: 'input.normal_wear === false' },
      },
      {
        nodeId: 'aggregate-1',
        type: 'UTIL_AGGREGATE',
        label: 'Aggregate',
        positionX: 1380,
        positionY: 240,
        config: { mode: 'array' },
      },
      {
        nodeId: 'template-1',
        type: 'UTIL_TEMPLATE',
        label: 'Settlement Statement',
        positionX: 1640,
        positionY: 240,
        config: {
          template:
            '# Deposit Settlement\n\nChargeable line-items (needs_review items are flagged for human verification):\n\n{{items}}\n\nTotal deducted: {{total}}',
        },
      },
      {
        nodeId: 'storage-1',
        type: 'OUTPUT_STORAGE',
        label: 'Save to Storage',
        positionX: 1900,
        positionY: 160,
        config: { folder: 'deposit-reports', filename: '{{timestamp}}_settlement' },
      },
      {
        nodeId: 'email-1',
        type: 'OUTPUT_EMAIL',
        label: 'Send Email',
        positionX: 1900,
        positionY: 360,
        config: { to: '', subject: 'Deposit Settlement Report' },
      },
      {
        nodeId: 'sheet-1',
        type: 'OUTPUT_SHEET_APPEND',
        label: 'Sheet Append',
        positionX: 1900,
        positionY: 560,
        config: {
          sheetId: '',
          sheetName: 'Settlements',
          range: 'A:Z',
          createHeaderIfMissing: true,
          valueInputOption: 'USER_ENTERED',
        },
      },
    ],
    presetEdges: [
      { edgeId: 'edge-1', sourceNodeId: 'trigger-1', sourceHandle: 'fields', targetNodeId: 'loop-1', targetHandle: 'items' },
      { edgeId: 'edge-2', sourceNodeId: 'loop-1', sourceHandle: 'item', targetNodeId: 'analyze-1', targetHandle: 'image' },
      { edgeId: 'edge-3', sourceNodeId: 'analyze-1', sourceHandle: 'description', targetNodeId: 'extract-1', targetHandle: 'input' },
      { edgeId: 'edge-4', sourceNodeId: 'analyze-1', sourceHandle: 'description', targetNodeId: 'categorize-1', targetHandle: 'input' },
      { edgeId: 'edge-5', sourceNodeId: 'extract-1', sourceHandle: 'data', targetNodeId: 'filter-1', targetHandle: 'input' },
      { edgeId: 'edge-6', sourceNodeId: 'filter-1', sourceHandle: 'passed', targetNodeId: 'aggregate-1', targetHandle: 'item' },
      { edgeId: 'edge-7', sourceNodeId: 'aggregate-1', sourceHandle: 'collected', targetNodeId: 'template-1', targetHandle: 'data' },
      { edgeId: 'edge-8', sourceNodeId: 'template-1', sourceHandle: 'result', targetNodeId: 'storage-1', targetHandle: 'data' },
      { edgeId: 'edge-9', sourceNodeId: 'template-1', sourceHandle: 'result', targetNodeId: 'email-1', targetHandle: 'content' },
      { edgeId: 'edge-10', sourceNodeId: 'aggregate-1', sourceHandle: 'collected', targetNodeId: 'sheet-1', targetHandle: 'row' },
    ],
  },

  // --- RFQ Auto-Responder: inbound quote-request triage & draft reply ---
  {
    id: 'preset-rfq-auto-responder',
    isPreset: true,
    i18nKey: 'rfqAutoResponder',
    name: 'RFQ Auto-Responder',
    description: 'Read inbound B2B quote requests and produce a draft quote and reply for review',
    category: 'automation',
    tags: ['email', 'b2b', 'sales', 'quote', 'automation'],
    nodeCount: 12,
    presetNodes: [
      {
        nodeId: 'trigger-1',
        type: 'TRIGGER_EMAIL_RECEIVED',
        label: 'Email Received',
        positionX: 80,
        positionY: 320,
        config: { provider: 'gmail', mailbox: 'INBOX', subjectFilter: 'quote|RFQ|inquiry', markAsRead: false },
      },
      {
        nodeId: 'extract-1',
        type: 'AI_STRUCTURED_EXTRACT',
        label: 'Structured Extract',
        positionX: 340,
        positionY: 320,
        config: {
          provider: 'openai',
          model: 'gpt-4o',
          schema:
            '{ "type": "object", "properties": { "item": {"type":"string"}, "quantity": {"type":"number"}, "spec": {"type":"string"}, "material": {"type":"string"}, "lead_time": {"type":"string"}, "options": {"type":"array","items":{"type":"string"}} }, "required": ["item"] }',
          instruction: 'Extract the requested specifications from this quote-request email.',
          strict: true,
        },
      },
      {
        nodeId: 'trycatch-1',
        type: 'UTIL_TRY_CATCH',
        label: 'Try / Catch',
        positionX: 600,
        positionY: 320,
        config: { retries: 1, retryDelayMs: 1000 },
      },
      {
        nodeId: 'router-1',
        type: 'UTIL_ROUTER',
        label: 'Router',
        positionX: 860,
        positionY: 320,
        config: {
          routes:
            '[{ "name": "standard", "condition": "input.item && input.quantity" }, { "name": "missing_info", "condition": "!input.quantity" }]',
        },
      },
      {
        nodeId: 'http-1',
        type: 'UTIL_HTTP_REQUEST',
        label: 'Pricing Lookup',
        positionX: 1120,
        positionY: 200,
        config: { url: 'https://internal.example.com/pricing/{{item}}', method: 'GET', headers: [] },
      },
      {
        nodeId: 'transform-1',
        type: 'UTIL_TRANSFORM',
        label: 'Parse JSON',
        positionX: 1380,
        positionY: 200,
        config: { transformation: 'parseJson' },
      },
      {
        nodeId: 'script-1',
        type: 'UTIL_SCRIPT',
        label: 'Compute Quote',
        positionX: 1640,
        positionY: 200,
        config: { code: 'return { item: input.item, total: (input.quantity || 1) * (input.unit_price || 0) };' },
      },
      {
        nodeId: 'template-1',
        type: 'UTIL_TEMPLATE',
        label: 'Quote + Reply',
        positionX: 1900,
        positionY: 200,
        config: { template: 'Hello,\n\nThank you for your request. Quote for {{item}}: {{total}}.\n\nBest regards,\nSales Team' },
      },
      {
        nodeId: 'email-1',
        type: 'OUTPUT_EMAIL',
        label: 'Draft to Sales',
        positionX: 2160,
        positionY: 120,
        config: { to: '', subject: 'DRAFT Quote — review required' },
      },
      {
        nodeId: 'slack-1',
        type: 'OUTPUT_SLACK_POST',
        label: 'Slack Post',
        positionX: 2160,
        positionY: 300,
        config: { channel: '#sales' },
      },
      {
        nodeId: 'sheet-1',
        type: 'OUTPUT_SHEET_APPEND',
        label: 'Quote Pipeline',
        positionX: 2160,
        positionY: 480,
        config: { sheetId: '', sheetName: 'Quote Pipeline', range: 'A:Z', createHeaderIfMissing: true, valueInputOption: 'USER_ENTERED' },
      },
      {
        nodeId: 'review-email-1',
        type: 'OUTPUT_EMAIL',
        label: 'Human Review',
        positionX: 1120,
        positionY: 460,
        config: { to: '', subject: 'RFQ needs review' },
      },
    ],
    presetEdges: [
      { edgeId: 'edge-1', sourceNodeId: 'trigger-1', sourceHandle: 'body', targetNodeId: 'extract-1', targetHandle: 'input' },
      { edgeId: 'edge-2', sourceNodeId: 'extract-1', sourceHandle: 'data', targetNodeId: 'trycatch-1', targetHandle: 'input' },
      { edgeId: 'edge-3', sourceNodeId: 'trycatch-1', sourceHandle: 'success', targetNodeId: 'router-1', targetHandle: 'input' },
      { edgeId: 'edge-4', sourceNodeId: 'router-1', sourceHandle: 'standard', targetNodeId: 'http-1', targetHandle: 'pathParams' },
      { edgeId: 'edge-5', sourceNodeId: 'http-1', sourceHandle: 'response', targetNodeId: 'transform-1', targetHandle: 'input' },
      { edgeId: 'edge-6', sourceNodeId: 'transform-1', sourceHandle: 'output', targetNodeId: 'script-1', targetHandle: 'input' },
      { edgeId: 'edge-7', sourceNodeId: 'script-1', sourceHandle: 'output', targetNodeId: 'template-1', targetHandle: 'data' },
      { edgeId: 'edge-8', sourceNodeId: 'template-1', sourceHandle: 'result', targetNodeId: 'email-1', targetHandle: 'content' },
      { edgeId: 'edge-9', sourceNodeId: 'template-1', sourceHandle: 'result', targetNodeId: 'slack-1', targetHandle: 'text' },
      { edgeId: 'edge-10', sourceNodeId: 'script-1', sourceHandle: 'output', targetNodeId: 'sheet-1', targetHandle: 'row' },
      { edgeId: 'edge-11', sourceNodeId: 'router-1', sourceHandle: 'missing_info', targetNodeId: 'review-email-1', targetHandle: 'content' },
      { edgeId: 'edge-12', sourceNodeId: 'trycatch-1', sourceHandle: 'error', targetNodeId: 'review-email-1', targetHandle: 'attachments' },
    ],
  },

  // --- Competitor Watchdog: price & promo monitoring with response alerts ---
  {
    id: 'preset-competitor-watchdog',
    isPreset: true,
    i18nKey: 'competitorWatchdog',
    name: 'Competitor Watchdog',
    description: 'Monitor competitor product pages on a schedule, detect changes, and recommend a response',
    category: 'automation',
    tags: ['schedule', 'scraping', 'monitoring', 'price', 'alert'],
    nodeCount: 17,
    presetNodes: [
      {
        nodeId: 'trigger-1',
        type: 'TRIGGER_SCHEDULE',
        label: 'Schedule Trigger',
        positionX: 80,
        positionY: 360,
        config: {
          inputType: 'text',
          inputValue: 'https://competitor.example.com/product-a\nhttps://competitor.example.com/product-b',
          concurrencyPolicy: 'skip',
        },
      },
      {
        nodeId: 'split-script-1',
        type: 'UTIL_SCRIPT',
        label: 'URLs → Array',
        positionX: 320,
        positionY: 360,
        config: { code: 'return String(input || "").split(/\\r?\\n/).map(s => s.trim()).filter(Boolean);' },
      },
      {
        nodeId: 'loop-1',
        type: 'UTIL_LOOP',
        label: 'Loop (per URL)',
        positionX: 560,
        positionY: 360,
        config: { maxIterations: 100 },
      },
      {
        nodeId: 'scraper-1',
        type: 'WEB_SCRAPER',
        label: 'Web Scraper',
        positionX: 800,
        positionY: 260,
        config: { provider: 'jina', maxTokens: 8000 },
      },
      {
        nodeId: 'extract-1',
        type: 'AI_STRUCTURED_EXTRACT',
        label: 'Structured Extract',
        positionX: 1040,
        positionY: 260,
        config: {
          provider: 'openai',
          model: 'gpt-4o',
          schema:
            '{ "type": "object", "properties": { "price": {"type":"number"}, "stock_status": {"type":"string"}, "promo_text": {"type":"string"} } }',
          instruction: 'Extract current price, stock status, and promo text from the product page.',
          strict: false,
        },
      },
      {
        nodeId: 'varget-1',
        type: 'UTIL_VARIABLE_GET',
        label: 'Get Snapshot',
        positionX: 1040,
        positionY: 480,
        config: { name: 'snapshot' },
      },
      {
        nodeId: 'merge-1',
        type: 'UTIL_MERGE',
        label: 'Merge (cur+prev)',
        positionX: 1280,
        positionY: 360,
        config: { mode: 'object' },
      },
      {
        nodeId: 'diff-script-1',
        type: 'UTIL_SCRIPT',
        label: 'Detect Change',
        positionX: 1520,
        positionY: 360,
        config: {
          code:
            'const cur = input.input1 || {}; const prev = input.input2 || {}; return { ...cur, changed: cur.price !== prev.price || cur.promo_text !== prev.promo_text };',
        },
      },
      {
        nodeId: 'filter-1',
        type: 'UTIL_FILTER',
        label: 'Filter (changed)',
        positionX: 1760,
        positionY: 300,
        config: { condition: 'input.changed === true' },
      },
      {
        nodeId: 'varset-1',
        type: 'UTIL_VARIABLE_SET',
        label: 'Set Snapshot',
        positionX: 1760,
        positionY: 520,
        config: { name: 'snapshot' },
      },
      {
        nodeId: 'aggregate-1',
        type: 'UTIL_AGGREGATE',
        label: 'Aggregate',
        positionX: 2000,
        positionY: 300,
        config: { mode: 'array' },
      },
      {
        nodeId: 'transform-sum-1',
        type: 'UTIL_TRANSFORM',
        label: 'Stringify',
        positionX: 2000,
        positionY: 480,
        config: { transformation: 'stringify' },
      },
      {
        nodeId: 'interpret-1',
        type: 'GEN_TEXT_TO_TEXT',
        label: 'Recommend Response',
        positionX: 2240,
        positionY: 300,
        config: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          systemPrompt: 'You are a pricing strategist. Given competitor changes, recommend a concise price/promo response per item.',
          temperature: 0.5,
        },
      },
      {
        nodeId: 'router-1',
        type: 'UTIL_ROUTER',
        label: 'Router',
        positionX: 2480,
        positionY: 300,
        config: { routes: '[{ "name": "urgent", "condition": "/drop|down|lower/i.test(String(input))" }]' },
      },
      {
        nodeId: 'slack-1',
        type: 'OUTPUT_SLACK_POST',
        label: 'Slack Post',
        positionX: 2720,
        positionY: 180,
        config: { channel: '#pricing' },
      },
      {
        nodeId: 'notify-1',
        type: 'OUTPUT_NOTIFICATION',
        label: 'Notification',
        positionX: 2720,
        positionY: 360,
        config: { title: 'Competitor price alert', channel: 'push' },
      },
      {
        nodeId: 'sheet-1',
        type: 'OUTPUT_SHEET_APPEND',
        label: 'Price History',
        positionX: 2720,
        positionY: 540,
        config: { sheetId: '', sheetName: 'Price History', range: 'A:Z', createHeaderIfMissing: true, valueInputOption: 'USER_ENTERED' },
      },
    ],
    presetEdges: [
      { edgeId: 'edge-1', sourceNodeId: 'trigger-1', sourceHandle: 'text', targetNodeId: 'split-script-1', targetHandle: 'input' },
      { edgeId: 'edge-2', sourceNodeId: 'split-script-1', sourceHandle: 'output', targetNodeId: 'loop-1', targetHandle: 'items' },
      { edgeId: 'edge-3', sourceNodeId: 'loop-1', sourceHandle: 'item', targetNodeId: 'scraper-1', targetHandle: 'url' },
      { edgeId: 'edge-4', sourceNodeId: 'scraper-1', sourceHandle: 'markdown', targetNodeId: 'extract-1', targetHandle: 'input' },
      { edgeId: 'edge-5', sourceNodeId: 'extract-1', sourceHandle: 'data', targetNodeId: 'merge-1', targetHandle: 'input1' },
      { edgeId: 'edge-6', sourceNodeId: 'varget-1', sourceHandle: 'value', targetNodeId: 'merge-1', targetHandle: 'input2' },
      { edgeId: 'edge-7', sourceNodeId: 'merge-1', sourceHandle: 'merged', targetNodeId: 'diff-script-1', targetHandle: 'input' },
      { edgeId: 'edge-8', sourceNodeId: 'diff-script-1', sourceHandle: 'output', targetNodeId: 'filter-1', targetHandle: 'input' },
      { edgeId: 'edge-9', sourceNodeId: 'diff-script-1', sourceHandle: 'output', targetNodeId: 'varset-1', targetHandle: 'value' },
      { edgeId: 'edge-10', sourceNodeId: 'filter-1', sourceHandle: 'passed', targetNodeId: 'aggregate-1', targetHandle: 'item' },
      { edgeId: 'edge-11', sourceNodeId: 'aggregate-1', sourceHandle: 'collected', targetNodeId: 'transform-sum-1', targetHandle: 'input' },
      { edgeId: 'edge-12', sourceNodeId: 'transform-sum-1', sourceHandle: 'output', targetNodeId: 'interpret-1', targetHandle: 'prompt' },
      { edgeId: 'edge-13', sourceNodeId: 'interpret-1', sourceHandle: 'text', targetNodeId: 'router-1', targetHandle: 'input' },
      { edgeId: 'edge-14', sourceNodeId: 'router-1', sourceHandle: 'urgent', targetNodeId: 'slack-1', targetHandle: 'text' },
      { edgeId: 'edge-15', sourceNodeId: 'router-1', sourceHandle: 'urgent', targetNodeId: 'notify-1', targetHandle: 'message' },
      { edgeId: 'edge-16', sourceNodeId: 'aggregate-1', sourceHandle: 'collected', targetNodeId: 'sheet-1', targetHandle: 'row' },
    ],
  },

  // --- AI Research Analyst: agent-mode market/competitor research ---
  {
    id: 'preset-ai-research-analyst',
    isPreset: true,
    i18nKey: 'aiResearchAnalyst',
    name: 'AI Research Analyst',
    description: 'Autonomous agent that researches a topic and returns a structured market/competitor report',
    category: 'automation',
    tags: ['agent', 'research', 'web-search', 'anthropic', 'claude'],
    nodeCount: 10,
    presetNodes: [
      {
        nodeId: 'trigger-1',
        type: 'TRIGGER_CHAT',
        label: 'Chat Trigger',
        positionX: 80,
        positionY: 300,
        config: { botName: 'Research Analyst', welcomeMessage: 'What topic should I research?', enableHistory: true, maxHistoryTurns: 20 },
      },
      {
        nodeId: 'agent-1',
        type: 'GEN_TEXT_TO_TEXT',
        label: 'Research Agent',
        positionX: 340,
        positionY: 300,
        config: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          systemPrompt:
            'You are a research analyst. Plan, then search, scrape, and read sources until you have enough evidence to write a sourced market/competitor report. Cite every claim.',
          temperature: 0.4,
          mode: 'agent',
          maxIterations: 8,
          tools: ['web-search-1', 'web-scraper-1', 'doc-qa-1', 'doc-grep-1'],
        },
      },
      {
        nodeId: 'web-search-1',
        type: 'WEB_SEARCH',
        label: 'Web Search (tool)',
        positionX: 200,
        positionY: 520,
        config: { maxResults: 5 },
      },
      {
        nodeId: 'web-scraper-1',
        type: 'WEB_SCRAPER',
        label: 'Web Scraper (tool)',
        positionX: 420,
        positionY: 520,
        config: { provider: 'jina', maxTokens: 8000 },
      },
      {
        nodeId: 'doc-qa-1',
        type: 'DOC_LONG_CONTEXT',
        label: 'Long-Context Q&A (tool)',
        positionX: 640,
        positionY: 520,
        config: { provider: 'anthropic', model: 'claude-sonnet-4-20250514', enableCache: true, temperature: 0.2 },
      },
      {
        nodeId: 'doc-grep-1',
        type: 'DOC_GREP',
        label: 'Document Grep (tool)',
        positionX: 860,
        positionY: 520,
        config: { mode: 'literal', contextLines: 2, maxMatches: 50 },
      },
      {
        nodeId: 'report-extract-1',
        type: 'AI_STRUCTURED_EXTRACT',
        label: 'Report Structure',
        positionX: 620,
        positionY: 300,
        config: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          schema:
            '{ "type": "object", "properties": { "title": {"type":"string"}, "summary": {"type":"string"}, "sections": {"type":"array","items":{"type":"object","properties":{"heading":{"type":"string"},"body":{"type":"string"},"sources":{"type":"array","items":{"type":"string"}}}}} }, "required": ["title","summary","sections"] }',
          instruction: 'Structure the agent report into title, summary, and cited sections.',
          strict: false,
        },
      },
      {
        nodeId: 'template-1',
        type: 'UTIL_TEMPLATE',
        label: 'Render Report',
        positionX: 900,
        positionY: 300,
        config: { template: '# {{title}}\n\n{{summary}}\n\n{{sections}}' },
      },
      {
        nodeId: 'storage-1',
        type: 'OUTPUT_STORAGE',
        label: 'Save to Storage',
        positionX: 1160,
        positionY: 200,
        config: { folder: 'research-reports', filename: '{{timestamp}}_research' },
      },
      {
        nodeId: 'email-1',
        type: 'OUTPUT_EMAIL',
        label: 'Send Email',
        positionX: 1160,
        positionY: 400,
        config: { to: '', subject: 'Research Report' },
      },
    ],
    presetEdges: [
      { edgeId: 'edge-1', sourceNodeId: 'trigger-1', sourceHandle: 'message', targetNodeId: 'agent-1', targetHandle: 'prompt' },
      { edgeId: 'edge-2', sourceNodeId: 'agent-1', sourceHandle: 'text', targetNodeId: 'report-extract-1', targetHandle: 'input' },
      { edgeId: 'edge-3', sourceNodeId: 'report-extract-1', sourceHandle: 'data', targetNodeId: 'template-1', targetHandle: 'data' },
      { edgeId: 'edge-4', sourceNodeId: 'template-1', sourceHandle: 'result', targetNodeId: 'storage-1', targetHandle: 'data' },
      { edgeId: 'edge-5', sourceNodeId: 'template-1', sourceHandle: 'result', targetNodeId: 'email-1', targetHandle: 'content' },
    ],
  },
];
