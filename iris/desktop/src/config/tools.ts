export interface IrisTool {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  category: 'video' | 'image';
  badge?: 'new' | 'pro' | 'popular';
  mode?: string;
  requiresAsset?: boolean;
  toolType?: 'ai' | 'edit' | 'preset';
}

export const VIDEO_TOOLS: IrisTool[] = [
  {
    id: 'text-to-video',
    title: 'Text to Video',
    description: 'Generate videos from text descriptions',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/public/iris/text-to-video.mp4',
    category: 'video',
  },
  {
    id: 'image-to-video',
    title: 'Image to Video',
    description: 'Animate still images into dynamic videos',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/public/iris/image-to-video.mp4',
    category: 'video',
  },
  {
    id: 'motion-control',
    title: 'Motion Control',
    description: 'Transfer motion from reference videos to your characters',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/public/iris/motion-control.mp4',
    category: 'video',
    badge: 'pro',
    mode: 'motion-control',
  },
  {
    id: 'video-inpaint',
    title: 'Video Inpaint',
    description: 'Remove and replace objects in videos seamlessly',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/public/iris/video1.mp4',
    category: 'video',
    badge: 'pro',
    mode: 'inpaint',
    requiresAsset: true,
  },
  {
    id: 'video-upscale',
    title: 'Video Upscale',
    description: 'Enhance video resolution up to 4K with Topaz AI',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/public/iris/video-upscale.mp4',
    category: 'video',
    badge: 'pro',
    mode: 'upscale',
    requiresAsset: true,
  },
  {
    id: 'video-cut',
    title: 'Video Cut',
    description: 'Trim and edit video clips with precision',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/public/iris/video-cut.mp4',
    category: 'video',
    badge: 'new',
    mode: 'cut',
    requiresAsset: true,
  },
];

export const IMAGE_AI_TOOLS: IrisTool[] = [
  {
    id: 'image-upscale',
    title: 'Image Upscale',
    description: 'Enhance resolution by 2x or 4x with AI detail generation',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/public/iris/upscale.mp4',
    category: 'image',
    badge: 'popular',
    mode: 'upscale',
    requiresAsset: true,
    toolType: 'ai',
  },
  {
    id: 'camera-angle',
    title: 'Camera Angles',
    description: 'Generate consistent images from multiple camera angles',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/public/iris/angle.mp4',
    category: 'image',
    badge: 'new',
    mode: 'angle',
    requiresAsset: true,
    toolType: 'ai',
  },
  {
    id: 'bg-remove',
    title: 'Background Remove',
    description: 'Instantly remove backgrounds with AI precision',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/public/iris/removebg.jpg',
    category: 'image',
    mode: 'bgRemove',
    requiresAsset: true,
    toolType: 'ai',
  },
  {
    id: 'inpaint',
    title: 'Inpaint',
    description: 'Edit specific regions of images with AI',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/public/iris/inpaint.png',
    category: 'image',
    mode: 'inpaint',
    requiresAsset: true,
    toolType: 'ai',
  },
  {
    id: 'outpaint',
    title: 'Outpaint',
    description: 'Extend images beyond their original boundaries',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/public/iris/outpaint.mp4',
    category: 'image',
    mode: 'outpaint',
    requiresAsset: true,
    toolType: 'ai',
  },
  {
    id: 'subject',
    title: 'Subject Mode',
    description: 'Extract and generate variations of subjects',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/public/iris/subject.mp4',
    category: 'image',
    mode: 'subject',
    requiresAsset: true,
    toolType: 'ai',
  },
  {
    id: 'face-restore',
    title: 'Face Restore',
    description: 'Enhance and restore face details with AI',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/public/iris/face-restore.jpg',
    category: 'image',
    badge: 'new',
    mode: 'faceRestore',
    requiresAsset: true,
    toolType: 'ai',
  },
  {
    id: 'colorize',
    title: 'Colorize',
    description: 'Add colors to black & white images with AI',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/public/iris/colorize.jpg',
    category: 'image',
    badge: 'new',
    mode: 'colorize',
    requiresAsset: true,
    toolType: 'ai',
  },
  {
    id: 'sky-replace',
    title: 'Sky Replace',
    description: 'Replace the sky in your photos with AI-generated skies',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/public/iris/sky-replace.jpg',
    category: 'image',
    badge: 'new',
    mode: 'skyReplace',
    requiresAsset: true,
    toolType: 'ai',
  },
  {
    id: 'relight',
    title: 'Relight',
    description: 'Adjust and relight photos with AI-powered lighting control',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/public/iris/relight.jpg',
    category: 'image',
    badge: 'new',
    mode: 'relight',
    requiresAsset: true,
    toolType: 'ai',
  },
  {
    id: 'auto-enhance',
    title: 'Auto Enhance',
    description: 'One-click AI enhancement for sharpness, color, and detail',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/public/iris/auto-enhance.jpg',
    category: 'image',
    badge: 'new',
    mode: 'autoEnhance',
    requiresAsset: true,
    toolType: 'ai',
  },
];

export const IMAGE_PRESET_TOOLS: IrisTool[] = [
  {
    id: '4-panel-portrait',
    title: '4-Panel Portrait',
    description: 'Generate 2x2 grid portraits with different poses and expressions',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/production/public/image/3_1769669309622.png',
    category: 'image',
    badge: 'popular',
    mode: '4panel',
    toolType: 'preset',
  },
  {
    id: 'chibi-sticker',
    title: 'Chibi Sticker Set',
    description: 'Create 3D Pixar-style chibi character sticker sets with 8 expressions',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/production/public/image/3_1769669063757.png',
    category: 'image',
    badge: 'new',
    mode: 'sticker',
    toolType: 'preset',
  },
  {
    id: 'camcorder-collage',
    title: 'Camcorder Collage',
    description: 'Y2K VHS-style 6-panel portrait collage with retro overlays',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/production/public/image/3_1769668969883.png',
    category: 'image',
    badge: 'new',
    mode: 'camcorder',
    toolType: 'preset',
  },
  {
    id: 'fan-edit-collage',
    title: 'Fan Edit Collage',
    description: 'K-pop style digital scrapbook collage with Y2K aesthetics',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/production/public/image/3_1769669912726.png',
    category: 'image',
    mode: 'fanedit',
    toolType: 'preset',
  },
  {
    id: 'product-doc',
    title: 'Product Documentation',
    description: 'Premium product presentation with multi-angle views',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/production/public/image/3_1769669282978.png',
    category: 'image',
    mode: 'productdoc',
    toolType: 'preset',
  },
  {
    id: 'character-sheet',
    title: 'Character Concept Sheet',
    description: 'Character breakdown with full body, outfits, and expression sheet',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/production/public/image/3_1769669714082.png',
    category: 'image',
    mode: 'character',
    toolType: 'preset',
  },
  {
    id: 'popup-map',
    title: '3D Pop-Up Map',
    description: 'Papercraft-style 3D city map with landmarks popping out',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/production/public/image/3_1769669520319.png',
    category: 'image',
    mode: 'popupmap',
    toolType: 'preset',
  },
  {
    id: 'isometric-diorama',
    title: 'Isometric Diorama',
    description: '3D isometric landmark miniatures with unified scale',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/production/public/image/3_1769669821150.png',
    category: 'image',
    mode: 'diorama',
    toolType: 'preset',
  },
  {
    id: 'instagram-3d',
    title: 'Instagram 3D Layout',
    description: 'Instagram UI as physical 3D object with pop-out effect',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/production/public/image/3_1769668979859.png',
    category: 'image',
    badge: 'new',
    mode: 'instagram3d',
    toolType: 'preset',
  },
  {
    id: 'fashion-doc',
    title: 'Fashion Documentation',
    description: 'High-end lookbook style outfit presentation with annotations',
    thumbnailUrl: 'https://storage.googleapis.com/parallax-ai-images/production/public/image/3_1769669701149.png',
    category: 'image',
    mode: 'fashiondoc',
    toolType: 'preset',
  },
];

export const ALL_IMAGE_TOOLS: IrisTool[] = [...IMAGE_AI_TOOLS, ...IMAGE_PRESET_TOOLS];
export const ALL_VIDEO_TOOLS: IrisTool[] = VIDEO_TOOLS;
export const ALL_TOOLS: IrisTool[] = [...VIDEO_TOOLS, ...ALL_IMAGE_TOOLS];

/**
 * Merge extension-registered tools with built-in tools.
 * Extension tools appear after built-in tools in the same category.
 */
export function mergeExtensionTools(
  builtInTools: IrisTool[],
  extensionTools: { id: string; name: string; category: string; icon?: string; description?: string }[]
): IrisTool[] {
  const extAsIrisTools: IrisTool[] = extensionTools.map((et) => ({
    id: et.id,
    title: et.name,
    description: et.description || '',
    thumbnailUrl: '',
    category: (et.category === 'video' ? 'video' : 'image') as 'video' | 'image',
    badge: undefined,
    mode: et.id,
    toolType: 'ai' as const,
  }));

  return [...builtInTools, ...extAsIrisTools];
}
