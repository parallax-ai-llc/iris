import type { NodeDefinition } from '../types.js';

export const EDIT_MOTION_CONTROL: NodeDefinition = {
  type: 'EDIT_MOTION_CONTROL',
  category: 'EDITOR',
  label: 'Motion Control',
  description: 'Transfer motion from reference video to a subject in reference image (Kling 2.6)',
  iconName: 'Move',
  color: 'orange',
  aiCapability: 'motion-control',
  inputs: [
    { name: 'referenceImage', type: 'image', label: 'Reference Image (Subject)', required: true },
    { name: 'referenceVideo', type: 'video', label: 'Reference Video (Motion)', required: true },
    { name: 'prompt', type: 'text', label: 'Prompt' },
  ],
  outputs: [
    { name: 'video', type: 'video', label: 'Generated Video' },
  ],
  configFields: [
    {
      name: 'characterOrientation',
      label: 'Character Orientation',
      type: 'select',
      options: [
        { value: 'auto', label: 'Auto (adjusts based on video length)' },
        { value: 'image', label: 'Image (max 10s video)' },
        { value: 'video', label: 'Video (max 30s video)' },
      ],
      defaultValue: 'auto',
      description: 'Auto: automatically selects based on video duration. Image: uses image character (max 10s). Video: uses video character (max 30s).',
    },
    {
      name: 'mode',
      label: 'Generation Mode',
      type: 'select',
      options: [
        { value: 'std', label: 'Standard (Cost-effective)' },
        { value: 'pro', label: 'Professional (Higher quality)' },
      ],
      defaultValue: 'std',
      description: 'Video generation quality mode',
    },
    {
      name: 'keepOriginalSound',
      label: 'Keep Original Sound',
      type: 'toggle',
      defaultValue: true,
      description: 'Preserve the original audio from the reference video',
    },
  ],
};

export const EDIT_IMAGE_UPSCALE: NodeDefinition = {
  type: 'EDIT_IMAGE_UPSCALE',
  category: 'EDITOR',
  label: 'Image Upscale',
  description: 'Upscale image resolution',
  iconName: 'ArrowUpCircle',
  color: 'orange',
  inputs: [
    { name: 'image', type: 'image', label: 'Image', required: true },
  ],
  outputs: [
    { name: 'image', type: 'image', label: 'Upscaled Image' },
  ],
  configFields: [
    {
      name: 'scale',
      label: 'Scale Factor',
      type: 'select',
      options: [
        { value: '2', label: '2x' },
        { value: '4', label: '4x' },
      ],
      defaultValue: '2',
    },
  ],
};

export const EDIT_IMAGE_INPAINT: NodeDefinition = {
  type: 'EDIT_IMAGE_INPAINT',
  category: 'EDITOR',
  label: 'Image Inpaint',
  description: 'Fill in or modify image regions',
  iconName: 'Paintbrush',
  color: 'orange',
  inputs: [
    { name: 'image', type: 'image', label: 'Image', required: true },
    { name: 'mask', type: 'image', label: 'Mask', required: true },
    { name: 'prompt', type: 'text', label: 'Prompt', required: true },
  ],
  outputs: [
    { name: 'image', type: 'image', label: 'Edited Image' },
  ],
  configFields: [],
};

export const EDIT_IMAGE_OUTPAINT: NodeDefinition = {
  type: 'EDIT_IMAGE_OUTPAINT',
  category: 'EDITOR',
  label: 'Image Outpaint',
  description: 'Extend image beyond boundaries',
  iconName: 'Expand',
  color: 'orange',
  inputs: [
    { name: 'image', type: 'image', label: 'Image', required: true },
    { name: 'prompt', type: 'text', label: 'Prompt' },
  ],
  outputs: [
    { name: 'image', type: 'image', label: 'Extended Image' },
  ],
  configFields: [
    {
      name: 'direction',
      label: 'Extend Direction',
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

export const EDIT_IMAGE_STYLE: NodeDefinition = {
  type: 'EDIT_IMAGE_STYLE',
  category: 'EDITOR',
  label: 'Style Transfer',
  description: 'Apply artistic styles to images',
  iconName: 'Palette',
  color: 'orange',
  inputs: [
    { name: 'image', type: 'image', label: 'Image', required: true },
    { name: 'styleImage', type: 'image', label: 'Style Image' },
    { name: 'stylePrompt', type: 'text', label: 'Style Prompt' },
  ],
  outputs: [
    { name: 'image', type: 'image', label: 'Styled Image' },
  ],
  configFields: [
    {
      name: 'strength',
      label: 'Style Strength',
      type: 'slider',
      min: 0,
      max: 1,
      step: 0.1,
      defaultValue: 0.75,
    },
  ],
};

export const EDIT_IMAGE_FACE_SWAP: NodeDefinition = {
  type: 'EDIT_IMAGE_FACE_SWAP',
  category: 'EDITOR',
  label: 'Face Swap',
  description: 'Swap faces between images',
  iconName: 'User',
  color: 'orange',
  inputs: [
    { name: 'sourceImage', type: 'image', label: 'Source Image', required: true },
    { name: 'targetImage', type: 'image', label: 'Target Image', required: true },
  ],
  outputs: [
    { name: 'image', type: 'image', label: 'Result Image' },
  ],
  configFields: [],
};

export const EDIT_IMAGE_BG_REMOVE: NodeDefinition = {
  type: 'EDIT_IMAGE_BG_REMOVE',
  category: 'EDITOR',
  label: 'Background Remove',
  description: 'Remove image background',
  iconName: 'Eraser',
  color: 'orange',
  inputs: [
    { name: 'image', type: 'image', label: 'Image', required: true },
  ],
  outputs: [
    { name: 'image', type: 'image', label: 'Image (No BG)' },
    { name: 'mask', type: 'image', label: 'Mask' },
  ],
  configFields: [],
};

export const EDIT_VIDEO_UPSCALE: NodeDefinition = {
  type: 'EDIT_VIDEO_UPSCALE',
  category: 'EDITOR',
  label: 'Video Upscale',
  description: 'Upscale video resolution using AI',
  iconName: 'ArrowUpCircle',
  color: 'orange',
  aiCapability: 'video-upscale',
  inputs: [
    { name: 'video', type: 'video', label: 'Video', required: true },
  ],
  outputs: [
    { name: 'video', type: 'video', label: 'Upscaled Video' },
  ],
  configFields: [
    { name: 'provider', label: 'Provider', type: 'provider', required: true },
    { name: 'model', label: 'Model', type: 'model', required: true },
    {
      name: 'targetResolution',
      label: 'Target Resolution',
      type: 'select',
      options: [
        { value: '720p', label: '720p (HD)' },
        { value: '1080p', label: '1080p (Full HD)' },
        { value: '4k', label: '4K (Ultra HD)' },
      ],
      defaultValue: '1080p',
      description: 'Desired output resolution',
    },
    {
      name: 'targetFps',
      label: 'Target FPS',
      type: 'select',
      options: [
        { value: '15', label: '15 fps' },
        { value: '24', label: '24 fps (Film)' },
        { value: '30', label: '30 fps (Standard)' },
        { value: '60', label: '60 fps (Smooth)' },
      ],
      defaultValue: '30',
      description: 'Output frame rate (15-60 fps)',
    },
  ],
};

export const EDIT_VIDEO_INPAINT: NodeDefinition = {
  type: 'EDIT_VIDEO_INPAINT',
  category: 'EDITOR',
  label: 'Video Inpaint',
  description: 'Remove objects or fill regions in video using mask',
  iconName: 'Eraser',
  color: 'orange',
  aiCapability: 'video-inpaint',
  inputs: [
    { name: 'video', type: 'video', label: 'Video', required: true },
    { name: 'mask', type: 'image', label: 'Mask', required: true },
  ],
  outputs: [
    { name: 'video', type: 'video', label: 'Inpainted Video' },
  ],
  configFields: [
    { name: 'provider', label: 'Provider', type: 'provider', required: true },
    { name: 'model', label: 'Model', type: 'model', required: true },
    {
      name: 'dilateRadius',
      label: 'Mask Dilation',
      type: 'slider',
      min: 0,
      max: 20,
      step: 1,
      defaultValue: 8,
      description: 'Expand mask edges for cleaner removal',
    },
  ],
};

// ─── Desktop-only EDITOR nodes ──────────────────────────────────────────────

export const EDIT_IMAGE_SKY_REPLACE: NodeDefinition = {
  type: 'EDIT_IMAGE_SKY_REPLACE',
  category: 'EDITOR',
  label: 'Sky Replace',
  description: 'Replace the sky in photos with AI-generated skies',
  iconName: 'Sun',
  color: 'blue',
  aiCapability: 'sky-replace',
  inputs: [{ name: 'image', type: 'image', label: 'Image', required: true }],
  outputs: [{ name: 'image', type: 'image', label: 'Result' }],
  configFields: [
    { name: 'prompt', label: 'Sky Description', type: 'text', placeholder: 'blue sky with white clouds, golden hour', defaultValue: 'blue sky with white clouds' },
  ],
};

export const EDIT_IMAGE_RELIGHT: NodeDefinition = {
  type: 'EDIT_IMAGE_RELIGHT',
  category: 'EDITOR',
  label: 'Relight',
  description: 'Adjust and relight photos with AI-powered lighting control',
  iconName: 'Lightbulb',
  color: 'yellow',
  aiCapability: 'relight',
  inputs: [{ name: 'image', type: 'image', label: 'Image', required: true }],
  outputs: [{ name: 'image', type: 'image', label: 'Result' }],
  configFields: [
    { name: 'prompt', label: 'Lighting Style', type: 'text', placeholder: 'soft natural lighting from the left', defaultValue: 'soft natural lighting' },
  ],
};

export const EDIT_IMAGE_AUTO_ENHANCE: NodeDefinition = {
  type: 'EDIT_IMAGE_AUTO_ENHANCE',
  category: 'EDITOR',
  label: 'Auto Enhance',
  description: 'One-click AI enhancement for sharpness, color, and detail',
  iconName: 'Sparkles',
  color: 'purple',
  aiCapability: 'image-enhance',
  inputs: [{ name: 'image', type: 'image', label: 'Image', required: true }],
  outputs: [{ name: 'image', type: 'image', label: 'Enhanced' }],
  configFields: [],
};

export const EDIT_IMAGE_CROP: NodeDefinition = {
  type: 'EDIT_IMAGE_CROP',
  category: 'EDITOR',
  label: 'Image Crop',
  description: 'Crop image to specified dimensions or aspect ratio',
  iconName: 'Crop',
  color: 'orange',
  inputs: [{ name: 'image', type: 'image', label: 'Image', required: true }],
  outputs: [{ name: 'image', type: 'image', label: 'Cropped' }],
  configFields: [
    {
      name: 'aspectRatio',
      label: 'Aspect Ratio',
      type: 'select',
      options: [
        { value: 'free', label: 'Free' },
        { value: '1:1', label: '1:1' },
        { value: '16:9', label: '16:9' },
        { value: '4:3', label: '4:3' },
        { value: '3:2', label: '3:2' },
        { value: '9:16', label: '9:16' },
      ],
      defaultValue: 'free',
    },
  ],
};

export const EDIT_IMAGE_FILTER: NodeDefinition = {
  type: 'EDIT_IMAGE_FILTER',
  category: 'EDITOR',
  label: 'Image Filter',
  description: 'Apply color filters and adjustments to images',
  iconName: 'SlidersHorizontal',
  color: 'orange',
  inputs: [{ name: 'image', type: 'image', label: 'Image', required: true }],
  outputs: [{ name: 'image', type: 'image', label: 'Filtered' }],
  configFields: [
    {
      name: 'filter',
      label: 'Filter',
      type: 'select',
      options: [
        { value: 'none', label: 'None' },
        { value: 'grayscale', label: 'Grayscale' },
        { value: 'sepia', label: 'Sepia' },
        { value: 'vivid', label: 'Vivid' },
        { value: 'cool', label: 'Cool' },
        { value: 'warm', label: 'Warm' },
      ],
      defaultValue: 'none',
    },
    { name: 'brightness', label: 'Brightness', type: 'slider', min: -100, max: 100, step: 5, defaultValue: 0 },
    { name: 'contrast', label: 'Contrast', type: 'slider', min: -100, max: 100, step: 5, defaultValue: 0 },
    { name: 'saturation', label: 'Saturation', type: 'slider', min: -100, max: 100, step: 5, defaultValue: 0 },
  ],
};

export const EDIT_VIDEO_TRIM: NodeDefinition = {
  type: 'EDIT_VIDEO_TRIM',
  category: 'EDITOR',
  label: 'Video Trim',
  description: 'Trim video to a specific time range',
  iconName: 'Scissors',
  color: 'orange',
  inputs: [{ name: 'video', type: 'video', label: 'Video', required: true }],
  outputs: [{ name: 'video', type: 'video', label: 'Trimmed' }],
  configFields: [
    { name: 'startTime', label: 'Start Time (s)', type: 'number', defaultValue: 0 },
    { name: 'endTime', label: 'End Time (s)', type: 'number', placeholder: 'Leave empty for end of video' },
  ],
};

export const EDIT_VIDEO_CROP: NodeDefinition = {
  type: 'EDIT_VIDEO_CROP',
  category: 'EDITOR',
  label: 'Video Crop',
  description: 'Crop video to specified dimensions',
  iconName: 'Crop',
  color: 'orange',
  inputs: [{ name: 'video', type: 'video', label: 'Video', required: true }],
  outputs: [{ name: 'video', type: 'video', label: 'Cropped' }],
  configFields: [
    {
      name: 'aspectRatio',
      label: 'Aspect Ratio',
      type: 'select',
      options: [
        { value: '16:9', label: '16:9' },
        { value: '9:16', label: '9:16' },
        { value: '1:1', label: '1:1' },
        { value: '4:3', label: '4:3' },
      ],
      defaultValue: '16:9',
    },
  ],
};

export const EDIT_AUDIO_TRIM: NodeDefinition = {
  type: 'EDIT_AUDIO_TRIM',
  category: 'EDITOR',
  label: 'Audio Trim',
  description: 'Trim audio to a specific time range',
  iconName: 'Scissors',
  color: 'orange',
  inputs: [{ name: 'audio', type: 'audio', label: 'Audio', required: true }],
  outputs: [{ name: 'audio', type: 'audio', label: 'Trimmed' }],
  configFields: [
    { name: 'startTime', label: 'Start Time (s)', type: 'number', defaultValue: 0 },
    { name: 'endTime', label: 'End Time (s)', type: 'number', placeholder: 'Leave empty for end' },
  ],
};

export const EDIT_MASK_DEFINE: NodeDefinition = {
  type: 'EDIT_MASK_DEFINE',
  category: 'EDITOR',
  label: 'Mask Define',
  description: 'Define a mask region on an image for use in inpainting',
  iconName: 'Layers',
  color: 'orange',
  inputs: [{ name: 'image', type: 'image', label: 'Image', required: true }],
  outputs: [{ name: 'mask', type: 'image', label: 'Mask' }],
  configFields: [
    {
      name: 'mode',
      label: 'Mask Mode',
      type: 'select',
      options: [
        { value: 'auto', label: 'Auto (AI Subject)' },
        { value: 'manual', label: 'Manual' },
      ],
      defaultValue: 'auto',
    },
  ],
};

// ─── Phase 3: 미디어 보강 ───────────────────────────────────────────────────
// 기존 미디어 노드들이 단일 입력 처리 위주였다면, Phase 3은 멀티 소스
// 합성/분리 작업을 추가한다. 설계 사유는 §6.2 참조.

/**
 * 오디오를 보컬/반주/드럼/베이스 stem으로 분리. Demucs (Meta) 또는
 * Spleeter (Deezer). 음악 리믹스, 보컬 추출, karaoke 생성, 팟캐스트
 * 노이즈 분리 등에 활용.
 */
export const EDIT_AUDIO_SEPARATE: NodeDefinition = {
  type: 'EDIT_AUDIO_SEPARATE',
  category: 'EDITOR',
  label: 'Audio Separate',
  description: '오디오를 stem (보컬/반주/드럼/베이스)으로 분리',
  iconName: 'AudioLines',
  color: 'orange',
  aiCapability: 'audio-separation',
  inputs: [
    { name: 'audio', type: 'audio', label: 'Audio', required: true },
  ],
  outputs: [
    { name: 'vocals', type: 'audio', label: 'Vocals' },
    { name: 'instrumental', type: 'audio', label: 'Instrumental' },
    { name: 'drums', type: 'audio', label: 'Drums' },
    { name: 'bass', type: 'audio', label: 'Bass' },
    { name: 'other', type: 'audio', label: 'Other', hideHandle: true },
  ],
  configFields: [
    {
      name: 'model',
      label: 'Model',
      type: 'select',
      options: [
        { value: 'demucs-htdemucs', label: 'Demucs HTDemucs (최고 품질, 4-stem)' },
        { value: 'demucs-htdemucs_ft', label: 'Demucs HTDemucs FT (fine-tuned)' },
        { value: 'spleeter-4stem', label: 'Spleeter 4-stem (빠름)' },
        { value: 'spleeter-2stem', label: 'Spleeter 2-stem (보컬+반주, 최속)' },
      ],
      defaultValue: 'demucs-htdemucs',
    },
    {
      name: 'outputFormat',
      label: 'Output Format',
      type: 'select',
      options: [
        { value: 'wav', label: 'WAV (무손실)' },
        { value: 'mp3', label: 'MP3 (320kbps)' },
        { value: 'flac', label: 'FLAC (무손실 압축)' },
      ],
      defaultValue: 'wav',
    },
  ],
};

/**
 * 여러 비디오 클립을 시간 순서로 이어 붙임. 트랜지션 옵션 (cut/fade/
 * crossfade/wipe). AI 생성 비디오 (5초~10초 클립)를 긴 영상으로 합치는
 * 데 필수.
 */
export const EDIT_VIDEO_MERGE: NodeDefinition = {
  type: 'EDIT_VIDEO_MERGE',
  category: 'EDITOR',
  label: 'Video Merge',
  description: '여러 비디오를 시간 순서로 concat (트랜지션 옵션)',
  iconName: 'Combine',
  color: 'orange',
  inputs: [
    { name: 'video1', type: 'video', label: 'Video 1', required: true },
    { name: 'video2', type: 'video', label: 'Video 2', required: true },
    { name: 'video3', type: 'video', label: 'Video 3' },
    { name: 'video4', type: 'video', label: 'Video 4' },
    { name: 'video5', type: 'video', label: 'Video 5' },
  ],
  outputs: [
    { name: 'video', type: 'video', label: 'Merged Video' },
    { name: 'duration', type: 'any', label: 'Total Duration (sec)', hideHandle: true },
  ],
  configFields: [
    {
      name: 'transition',
      label: 'Transition',
      type: 'select',
      options: [
        { value: 'cut', label: 'Cut (즉시 전환)' },
        { value: 'fade', label: 'Fade (페이드 인/아웃)' },
        { value: 'crossfade', label: 'Crossfade (디졸브)' },
        { value: 'wipe', label: 'Wipe (좌→우)' },
      ],
      defaultValue: 'cut',
    },
    {
      name: 'transitionDurationMs',
      label: 'Transition Duration (ms)',
      type: 'number',
      min: 100,
      max: 5000,
      defaultValue: 500,
      description: 'cut 모드에서는 무시됨.',
      dependsOn: { field: 'transition', value: 'fade' },
    },
    {
      name: 'matchAudioLevels',
      label: 'Normalize Audio Levels',
      type: 'toggle',
      defaultValue: true,
      description: 'true면 클립 간 볼륨 차이를 LUFS 기준으로 자동 보정.',
    },
  ],
};

/**
 * 비디오 위에 텍스트/이미지/워터마크 오버레이. 캡션 추가, 로고 삽입,
 * 자막 burning, branded intro/outro 등. AI 생성 비디오 후처리 표준 작업.
 */
export const EDIT_VIDEO_OVERLAY: NodeDefinition = {
  type: 'EDIT_VIDEO_OVERLAY',
  category: 'EDITOR',
  label: 'Video Overlay',
  description: '비디오 위에 텍스트/이미지/워터마크 오버레이',
  iconName: 'Layers',
  color: 'orange',
  inputs: [
    { name: 'video', type: 'video', label: 'Base Video', required: true },
    { name: 'overlay', type: 'any', label: 'Overlay (image or text)', required: true },
  ],
  outputs: [
    { name: 'video', type: 'video', label: 'Output Video' },
  ],
  configFields: [
    {
      name: 'position',
      label: 'Position',
      type: 'select',
      options: [
        { value: 'top-left', label: 'Top Left' },
        { value: 'top-center', label: 'Top Center' },
        { value: 'top-right', label: 'Top Right' },
        { value: 'middle-left', label: 'Middle Left' },
        { value: 'middle-center', label: 'Center' },
        { value: 'middle-right', label: 'Middle Right' },
        { value: 'bottom-left', label: 'Bottom Left' },
        { value: 'bottom-center', label: 'Bottom Center' },
        { value: 'bottom-right', label: 'Bottom Right' },
      ],
      defaultValue: 'bottom-right',
    },
    {
      name: 'opacity',
      label: 'Opacity',
      type: 'slider',
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 0.85,
    },
    {
      name: 'scale',
      label: 'Scale (%)',
      type: 'slider',
      min: 5,
      max: 100,
      step: 5,
      defaultValue: 20,
      description: '비디오 가로 대비 오버레이 크기.',
    },
    {
      name: 'startTime',
      label: 'Start Time (sec)',
      type: 'number',
      defaultValue: 0,
      description: '0이면 시작부터 노출.',
    },
    {
      name: 'endTime',
      label: 'End Time (sec)',
      type: 'number',
      placeholder: '비워두면 비디오 끝까지',
      description: '비어두면 비디오 끝까지 노출.',
    },
    {
      name: 'fontSize',
      label: 'Font Size (text overlay)',
      type: 'number',
      defaultValue: 32,
      description: 'overlay가 text일 때만.',
    },
    {
      name: 'fontColor',
      label: 'Font Color',
      type: 'text',
      defaultValue: '#FFFFFF',
      description: 'overlay가 text일 때 — hex 또는 색상명.',
    },
  ],
};
