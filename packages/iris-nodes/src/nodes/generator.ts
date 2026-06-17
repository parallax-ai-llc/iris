import type { NodeDefinition } from '../types.js';
import { ASPECT_RATIO_OPTIONS, CAMERA_ANGLE_OPTIONS, VOICE_OPTIONS } from '../constants.js';

export const GEN_TEXT_TO_TEXT: NodeDefinition = {
  type: 'GEN_TEXT_TO_TEXT',
  category: 'GENERATOR',
  label: 'Text Generator',
  description: 'Generate text using LLM',
  iconName: 'MessageSquare',
  color: 'purple',
  aiCapability: 'text-to-text',
  inputs: [
    { name: 'prompt', type: 'text', label: 'Prompt', required: true },
    { name: 'context', type: 'text', label: 'Context' },
  ],
  outputs: [
    { name: 'text', type: 'text', label: 'Generated Text' },
  ],
  configFields: [
    { name: 'provider', label: 'Provider', type: 'provider', required: true },
    { name: 'model', label: 'Model', type: 'model', required: true },
    {
      name: 'systemPrompt',
      label: 'System Prompt',
      type: 'textarea',
      placeholder: 'You are a helpful assistant...',
    },
    {
      name: 'temperature',
      label: 'Temperature',
      type: 'slider',
      min: 0,
      max: 2,
      step: 0.1,
      defaultValue: 0.7,
    },
    {
      name: 'enableWebSearch',
      label: 'Enable Web Search',
      type: 'toggle',
      defaultValue: false,
      description: 'Search the web for current information',
    },
    // ─── Agent mode (Phase 1 expansion) ───────────────────────────────────
    // mode='single' = existing one-shot LLM call (backward-compatible default).
    // mode='agent'  = tool-using loop: LLM may call other nodes (selected via
    //                 `tools`) repeatedly until it decides it's done, capped
    //                 by `maxIterations`. Runtime is implemented server-side
    //                 in the iris execution engine — this definition only
    //                 declares the UI surface.
    {
      name: 'mode',
      label: 'Execution Mode',
      type: 'select',
      options: [
        { value: 'single', label: 'Single Call' },
        { value: 'agent', label: 'Agent (Tool-Using Loop)' },
      ],
      defaultValue: 'single',
      description: "Agent: LLM repeatedly calls selected tools until it's done.",
    },
    {
      name: 'tools',
      label: 'Available Tools',
      type: 'node-multi-select',
      dependsOn: { field: 'mode', value: 'agent' },
      description: 'Nodes the agent may call. Picker filters to canBeTool nodes.',
    },
    {
      name: 'maxIterations',
      label: 'Max Iterations',
      type: 'number',
      min: 1,
      max: 50,
      defaultValue: 10,
      dependsOn: { field: 'mode', value: 'agent' },
      description: 'Safety cap on tool-call rounds (prevents runaway loops).',
    },
  ],
};

export const GEN_TEXT_TO_IMAGE: NodeDefinition = {
  type: 'GEN_TEXT_TO_IMAGE',
  category: 'GENERATOR',
  label: 'Image Generator',
  description: 'Generate images from text prompts',
  iconName: 'Image',
  color: 'purple',
  aiCapability: 'text-to-image',
  inputs: [
    { name: 'prompt', type: 'text', label: 'Prompt', required: true },
    { name: 'negativePrompt', type: 'text', label: 'Negative Prompt' },
    { name: 'referenceImage', type: 'image', label: 'Reference Image' },
  ],
  outputs: [
    { name: 'image', type: 'image', label: 'Generated Image' },
  ],
  configFields: [
    { name: 'provider', label: 'Provider', type: 'provider', required: true },
    { name: 'model', label: 'Model', type: 'model', required: true },
    {
      name: 'aspectRatio',
      label: 'Aspect Ratio',
      type: 'select',
      options: ASPECT_RATIO_OPTIONS,
      defaultValue: '1:1',
    },
    {
      name: 'cameraAngle',
      label: 'Camera Angle',
      type: 'select',
      options: CAMERA_ANGLE_OPTIONS,
      defaultValue: '',
      description: 'For 3D-consistent generations',
    },
    {
      name: 'subject',
      label: 'Subject',
      type: 'text',
      placeholder: 'e.g., Blue robot character, Red sports car...',
      description: 'Describe the subject for consistent generation across images',
    },
    {
      name: 'upscale',
      label: 'Upscale',
      type: 'toggle',
      defaultValue: false,
      description: 'Enhance resolution after generation',
    },
    {
      name: 'removeBackground',
      label: 'Remove Background',
      type: 'toggle',
      defaultValue: false,
      description: 'Remove background from result',
    },
  ],
};

export const GEN_IMAGE_TO_IMAGE: NodeDefinition = {
  type: 'GEN_IMAGE_TO_IMAGE',
  category: 'GENERATOR',
  label: 'Image to Image',
  description: 'Transform images with AI',
  iconName: 'Layers',
  color: 'purple',
  aiCapability: 'image-to-image',
  inputs: [
    { name: 'image', type: 'image', label: 'Input Image', required: true },
    { name: 'prompt', type: 'text', label: 'Prompt', required: true },
  ],
  outputs: [
    { name: 'image', type: 'image', label: 'Output Image' },
  ],
  configFields: [
    { name: 'provider', label: 'Provider', type: 'provider', required: true },
    { name: 'model', label: 'Model', type: 'model', required: true },
    {
      name: 'strength',
      label: 'Transformation Strength',
      type: 'slider',
      min: 0,
      max: 1,
      step: 0.1,
      defaultValue: 0.75,
    },
  ],
};

export const GEN_TEXT_TO_VIDEO: NodeDefinition = {
  type: 'GEN_TEXT_TO_VIDEO',
  category: 'GENERATOR',
  label: 'Text to Video',
  description: 'Generate videos from text',
  iconName: 'Video',
  color: 'purple',
  aiCapability: 'text-to-video',
  inputs: [
    { name: 'prompt', type: 'text', label: 'Prompt', required: true },
  ],
  outputs: [
    { name: 'video', type: 'video', label: 'Generated Video' },
  ],
  configFields: [
    { name: 'provider', label: 'Provider', type: 'provider', required: true },
    { name: 'model', label: 'Model', type: 'model', required: true },
    {
      name: 'aspectRatio',
      label: 'Aspect Ratio',
      type: 'select',
      options: ASPECT_RATIO_OPTIONS,
      defaultValue: '16:9',
    },
    {
      name: 'duration',
      label: 'Duration',
      type: 'duration',
      defaultValue: '5',
    },
    {
      name: 'cameraAngle',
      label: 'Camera Angle',
      type: 'select',
      options: CAMERA_ANGLE_OPTIONS,
      defaultValue: '',
      description: 'For 3D-consistent generations',
    },
  ],
};

export const GEN_IMAGE_TO_VIDEO: NodeDefinition = {
  type: 'GEN_IMAGE_TO_VIDEO',
  category: 'GENERATOR',
  label: 'Image to Video',
  description: 'Animate images into videos (supports first/last frame for Kling and Seedance)',
  iconName: 'Film',
  color: 'purple',
  aiCapability: 'image-to-video',
  inputs: [
    { name: 'image', type: 'image', label: 'Start Frame', required: true },
    { name: 'endFrame', type: 'image', label: 'End Frame (Optional)' },
    { name: 'prompt', type: 'text', label: 'Motion Prompt', required: true },
  ],
  outputs: [
    { name: 'video', type: 'video', label: 'Generated Video' },
  ],
  configFields: [
    { name: 'provider', label: 'Provider', type: 'provider', required: true },
    { name: 'model', label: 'Model', type: 'model', required: true },
    {
      name: 'mode',
      label: 'Quality Mode',
      type: 'select',
      options: [
        { value: 'std', label: 'Standard' },
        { value: 'pro', label: 'Professional (required for end frame on Kling 2.5/2.6)' },
      ],
      defaultValue: 'std',
      description: 'Pro mode required when using end frame with Kling 2.5/2.6',
    },
    {
      name: 'aspectRatio',
      label: 'Aspect Ratio',
      type: 'select',
      options: ASPECT_RATIO_OPTIONS,
      defaultValue: '16:9',
    },
    {
      name: 'duration',
      label: 'Duration',
      type: 'duration',
      defaultValue: '8',
    },
    {
      name: 'cameraAngle',
      label: 'Camera Angle',
      type: 'select',
      options: CAMERA_ANGLE_OPTIONS,
      defaultValue: '',
      description: 'For 3D-consistent generations',
    },
  ],
};

export const GEN_TEXT_TO_SPEECH: NodeDefinition = {
  type: 'GEN_TEXT_TO_SPEECH',
  category: 'GENERATOR',
  label: 'Text to Speech',
  description: 'Convert text to audio',
  iconName: 'Mic',
  color: 'purple',
  aiCapability: 'text-to-speech',
  inputs: [
    { name: 'text', type: 'text', label: 'Text', required: true },
  ],
  outputs: [
    { name: 'audio', type: 'audio', label: 'Audio' },
  ],
  configFields: [
    { name: 'provider', label: 'Provider', type: 'provider', required: true },
    { name: 'model', label: 'Model', type: 'model', required: true },
    {
      name: 'voice',
      label: 'Voice',
      type: 'select',
      options: VOICE_OPTIONS,
      defaultValue: 'alloy',
    },
    {
      name: 'speed',
      label: 'Speed',
      type: 'slider',
      min: 0.25,
      max: 4,
      step: 0.25,
      defaultValue: 1,
    },
  ],
};

export const GEN_SPEECH_TO_TEXT: NodeDefinition = {
  type: 'GEN_SPEECH_TO_TEXT',
  category: 'GENERATOR',
  label: 'Speech to Text',
  description: 'Transcribe audio to text',
  iconName: 'Headphones',
  color: 'purple',
  aiCapability: 'speech-to-text',
  inputs: [
    { name: 'audio', type: 'audio', label: 'Audio', required: true },
  ],
  outputs: [
    { name: 'text', type: 'text', label: 'Transcription' },
  ],
  configFields: [
    { name: 'provider', label: 'Provider', type: 'provider', required: true },
    { name: 'model', label: 'Model', type: 'model', required: true },
    {
      name: 'language',
      label: 'Language',
      type: 'select',
      options: [
        { value: 'auto', label: 'Auto Detect' },
        { value: 'en', label: 'English' },
        { value: 'ko', label: 'Korean' },
        { value: 'ja', label: 'Japanese' },
        { value: 'zh', label: 'Chinese' },
      ],
      defaultValue: 'auto',
    },
  ],
};

export const GEN_VIDEO_SUBTITLE: NodeDefinition = {
  type: 'GEN_VIDEO_SUBTITLE',
  category: 'GENERATOR',
  label: 'Generate Subtitles',
  description: 'Generate SRT/VTT subtitle files from video using AI transcription',
  iconName: 'Captions',
  color: 'purple',
  inputs: [
    { name: 'video', type: 'video', label: 'Video', required: true },
  ],
  outputs: [
    { name: 'srt', type: 'text', label: 'SRT' },
    { name: 'vtt', type: 'text', label: 'VTT' },
    { name: 'text', type: 'text', label: 'Transcript' },
  ],
  configFields: [
    {
      name: 'model',
      label: 'Model',
      type: 'select',
      options: [
        { value: 'gpt-4o-mini-transcribe', label: 'GPT-4o Mini (Fast)' },
        { value: 'gpt-4o-transcribe', label: 'GPT-4o (Best Accuracy)' },
        { value: 'whisper-1', label: 'Whisper (Legacy)' },
      ],
      defaultValue: 'gpt-4o-mini-transcribe',
    },
    {
      name: 'language',
      label: 'Language',
      type: 'select',
      options: [
        { value: 'auto', label: 'Auto Detect' },
        { value: 'en', label: 'English' },
        { value: 'ko', label: 'Korean' },
        { value: 'ja', label: 'Japanese' },
        { value: 'zh', label: 'Chinese' },
        { value: 'es', label: 'Spanish' },
        { value: 'fr', label: 'French' },
        { value: 'de', label: 'German' },
      ],
      defaultValue: 'auto',
    },
    {
      name: 'prompt',
      label: 'Transcription Hint',
      type: 'text',
      placeholder: 'e.g., Medical terminology',
      description: 'Optional context to improve accuracy',
    },
  ],
};

// ─── Desktop-only GENERATOR nodes ───────────────────────────────────────────
// Distinct from the EDIT_IMAGE_* variants — these are positioned as
// generation steps (create new content in a region) rather than edits.

export const GEN_INPAINT: NodeDefinition = {
  type: 'GEN_INPAINT',
  category: 'GENERATOR',
  label: 'Inpaint',
  description: 'Fill masked regions of an image with AI-generated content',
  iconName: 'Paintbrush',
  color: 'purple',
  inputs: [
    { name: 'image', type: 'image', label: 'Image', required: true },
    { name: 'mask', type: 'image', label: 'Mask', required: true },
    { name: 'prompt', type: 'text', label: 'Prompt', required: true },
  ],
  outputs: [{ name: 'image', type: 'image', label: 'Result' }],
  configFields: [
    { name: 'prompt', label: 'Prompt', type: 'textarea', placeholder: 'Describe what to fill in...' },
    { name: 'negativePrompt', label: 'Negative Prompt', type: 'textarea', placeholder: 'What to avoid...' },
  ],
};

export const GEN_OUTPAINT: NodeDefinition = {
  type: 'GEN_OUTPAINT',
  category: 'GENERATOR',
  label: 'Outpaint',
  description: 'Extend an image beyond its original boundaries',
  iconName: 'Expand',
  color: 'purple',
  inputs: [
    { name: 'image', type: 'image', label: 'Image', required: true },
    { name: 'prompt', type: 'text', label: 'Prompt' },
  ],
  outputs: [{ name: 'image', type: 'image', label: 'Expanded Image' }],
  configFields: [
    { name: 'prompt', label: 'Prompt', type: 'textarea', placeholder: 'Describe the expanded area...' },
    {
      name: 'direction',
      label: 'Direction',
      type: 'select',
      options: [
        { value: 'all', label: 'All Sides' },
        { value: 'left', label: 'Left' },
        { value: 'right', label: 'Right' },
        { value: 'up', label: 'Up' },
        { value: 'down', label: 'Down' },
      ],
      defaultValue: 'all',
    },
  ],
};

export const GEN_STYLE_TRANSFER: NodeDefinition = {
  type: 'GEN_STYLE_TRANSFER',
  category: 'GENERATOR',
  label: 'Style Transfer',
  description: 'Apply the visual style of one image to another',
  iconName: 'Palette',
  color: 'purple',
  inputs: [
    { name: 'content', type: 'image', label: 'Content Image', required: true },
    { name: 'style', type: 'image', label: 'Style Reference', required: true },
  ],
  outputs: [{ name: 'image', type: 'image', label: 'Styled Image' }],
  configFields: [
    { name: 'strength', label: 'Style Strength', type: 'slider', min: 0, max: 100, step: 5, defaultValue: 70 },
  ],
};

export const GEN_FACE_SWAP: NodeDefinition = {
  type: 'GEN_FACE_SWAP',
  category: 'GENERATOR',
  label: 'Face Swap',
  description: 'Swap faces between two images',
  iconName: 'User',
  color: 'purple',
  inputs: [
    { name: 'source', type: 'image', label: 'Source Image', required: true },
    { name: 'target', type: 'image', label: 'Target Face', required: true },
  ],
  outputs: [{ name: 'image', type: 'image', label: 'Result' }],
  configFields: [],
};

export const GEN_TEXT_TO_MUSIC: NodeDefinition = {
  type: 'GEN_TEXT_TO_MUSIC',
  category: 'GENERATOR',
  label: 'Text to Music',
  description: 'Generate music from text prompts using Suno AI',
  iconName: 'Music',
  color: 'purple',
  aiCapability: 'text-to-music',
  inputs: [
    { name: 'prompt', type: 'text', label: 'Prompt/Lyrics', required: true },
  ],
  outputs: [
    { name: 'audio', type: 'audio', label: 'Generated Music' },
  ],
  configFields: [
    { name: 'provider', label: 'Provider', type: 'provider', required: true },
    { name: 'model', label: 'Model', type: 'model', required: true },
    {
      name: 'style',
      label: 'Music Style',
      type: 'text',
      placeholder: 'e.g., Jazz, Electronic, Pop, Classical...',
      description: 'Genre or style of music to generate',
    },
    {
      name: 'title',
      label: 'Track Title',
      type: 'text',
      placeholder: 'My Song',
      description: 'Title for the generated track',
    },
    {
      name: 'instrumental',
      label: 'Instrumental Only',
      type: 'toggle',
      defaultValue: false,
      description: 'Generate music without vocals',
    },
    {
      name: 'vocalGender',
      label: 'Vocal Gender',
      type: 'select',
      options: [
        { value: '', label: 'Default' },
        { value: 'm', label: 'Male' },
        { value: 'f', label: 'Female' },
      ],
      defaultValue: '',
      description: 'Gender of vocals (when not instrumental)',
    },
    {
      name: 'negativeTags',
      label: 'Exclude Styles',
      type: 'text',
      placeholder: 'e.g., heavy metal, screaming...',
      description: 'Styles or elements to avoid',
    },
  ],
};

// ─── Phase 3: 미디어 생성 보강 ──────────────────────────────────────────────

/**
 * 비디오의 인물 입모양을 별도 오디오에 동기. SadTalker / Hedra / Sync.so
 * 같은 lip-sync 모델. AI 더빙, 다국어 콘텐츠, talking-head 아바타 등에
 * 활용. 비용·실패율 모두 다른 미디어 노드보다 높으니 server에서 watchdog
 * (max duration, timeout) 필수.
 */
export const GEN_LIP_SYNC: NodeDefinition = {
  type: 'GEN_LIP_SYNC',
  category: 'GENERATOR',
  label: 'Lip Sync',
  description: '비디오 인물의 입모양을 별도 오디오에 동기화',
  iconName: 'Speech',
  color: 'purple',
  aiCapability: 'lip-sync',
  inputs: [
    { name: 'video', type: 'video', label: 'Source Video (face)', required: true },
    { name: 'audio', type: 'audio', label: 'Target Audio', required: true },
  ],
  outputs: [
    { name: 'video', type: 'video', label: 'Lip-synced Video' },
  ],
  configFields: [
    { name: 'provider', label: 'Provider', type: 'provider', required: true },
    { name: 'model', label: 'Model', type: 'model', required: true },
    {
      name: 'quality',
      label: 'Quality',
      type: 'select',
      options: [
        { value: 'fast', label: 'Fast (낮은 품질, ~30s/min)' },
        { value: 'balanced', label: 'Balanced (default)' },
        { value: 'high', label: 'High (최고 품질, ~3x 느림)' },
      ],
      defaultValue: 'balanced',
    },
    {
      name: 'preserveExpression',
      label: 'Preserve Original Expression',
      type: 'toggle',
      defaultValue: true,
      description: '인물 표정은 유지하고 입만 동기 (false면 표정도 음성에 맞춰 변경).',
    },
    {
      name: 'enhanceFace',
      label: 'Enhance Face',
      type: 'toggle',
      defaultValue: false,
      description: 'GFPGAN/CodeFormer로 얼굴 영역 후처리 (추가 비용).',
    },
  ],
};
