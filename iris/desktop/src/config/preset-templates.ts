/**
 * Preset prompt templates for image generation presets.
 * Each preset has a predefined prompt template, aspect ratio, and UI configuration.
 */

export interface PresetTemplate {
  mode: string;
  title: string;
  description: string;
  prompt: string;
  aspectRatio: string;
  sampleImageUrl: string;
  requiresReferenceImage: boolean;
  /** Label for the text input (location-based presets) */
  textInputLabel?: string;
  textInputPlaceholder?: string;
  /** Placeholder for additional prompt customization */
  customPromptPlaceholder?: string;
}

export const PRESET_TEMPLATES: Record<string, PresetTemplate> = {
  '4panel': {
    mode: '4panel',
    title: '4-Panel Portrait',
    description: 'Generate a 2x2 grid of portraits with 4 different poses and expressions.',
    prompt: `Create a 2x2 grid portrait photo set of the same person with 4 different poses and expressions. Each panel should show:
- Top left: Neutral expression, looking directly at camera
- Top right: Gentle smile, slight head tilt
- Bottom left: Thoughtful expression, looking slightly away
- Bottom right: Bright smile, confident pose

Maintain consistent lighting, background, and style across all panels. Professional photography quality, soft lighting, clean background.`,
    aspectRatio: '3:4',
    sampleImageUrl: 'https://storage.googleapis.com/parallax-ai-images/production/public/image/3_1769669309622.png',
    requiresReferenceImage: true,
    customPromptPlaceholder: 'Add specific details like hairstyle, accessories, clothing...',
  },

  sticker: {
    mode: 'sticker',
    title: 'Chibi Sticker Set',
    description: 'Create 3D Pixar-style chibi character sticker sets with 8 expressions.',
    prompt: `Create a set of 8 3D chibi character stickers in Pixar/Disney style based on the reference image. Each sticker should show the same character with different expressions and poses:

1. Surprised (mouth open, wide eyes)
2. Sad (teary eyes, frown)
3. Confused (tilted head, question mark)
4. Happy (big smile, sparkly eyes)
5. Thinking (hand on chin, looking up)
6. Winking (one eye closed, playful)
7. Peace sign (V gesture, cheerful)
8. Shrugging (shoulders up, palms out)

Style: 3D rendered, cute chibi proportions, white sticker outline, transparent background, soft shadows. Consistent character design across all expressions.`,
    aspectRatio: '1:1',
    sampleImageUrl: 'https://storage.googleapis.com/parallax-ai-images/production/public/image/3_1769669063757.png',
    requiresReferenceImage: true,
    customPromptPlaceholder: 'Describe character traits, outfit, accessories...',
  },

  camcorder: {
    mode: 'camcorder',
    title: 'Camcorder Collage',
    description: 'Y2K VHS-style 6-panel portrait collage with retro overlays.',
    prompt: `Create a 6-panel portrait collage in vintage VHS camcorder recording style. Y2K aesthetic with dreamy, ethereal atmosphere.

Each panel shows the same model with slightly different poses/angles. Include authentic camcorder overlay elements:
- Battery indicator icon
- REC symbol with blinking dot
- Timestamp/timer display
- Viewfinder frame edges

Style: Soft focus, slightly grainy, warm color cast, light leaks, vintage video artifacts. Dreamy and nostalgic mood. Professional fashion editorial quality with retro recording aesthetic.`,
    aspectRatio: '3:4',
    sampleImageUrl: 'https://storage.googleapis.com/parallax-ai-images/production/public/image/3_1769668969883.png',
    requiresReferenceImage: true,
    customPromptPlaceholder: 'Describe outfit, accessories, makeup style...',
  },

  fanedit: {
    mode: 'fanedit',
    title: 'Fan Edit Collage',
    description: 'K-pop style digital scrapbook collage with Y2K aesthetics.',
    prompt: `Create a K-pop fan edit style digital scrapbook collage with Y2K/coquette aesthetic.

Design elements:
- Vintage newspaper texture background
- Multiple photo cutouts with white sticker-style outlines
- Decorative elements: hearts, stars, ribbons, bows, pearls
- Handwritten-style text stickers and labels
- Soft pink, cream, and pastel color palette
- Scattered decorative elements (butterflies, flowers, sparkles)

Style: Digital scrapbook, nostalgic Y2K aesthetic, romantic coquette vibes. Arrange photos in an artistic, overlapping layout with plenty of cute decorations.`,
    aspectRatio: '3:4',
    sampleImageUrl: 'https://storage.googleapis.com/parallax-ai-images/production/public/image/3_1769669912726.png',
    requiresReferenceImage: true,
    customPromptPlaceholder: "Add text like 'Happy Birthday', names, dates, messages...",
  },

  productdoc: {
    mode: 'productdoc',
    title: 'Product Documentation',
    description: 'Premium product presentation with multi-angle views.',
    prompt: `Create a premium product documentation layout in industrial design style.

Layout structure:
- Main hero render: Large, dramatic angle showcasing the product
- Supporting views arranged around: Front, side, back, detail close-up
- Clean white/light gray background
- Subtle shadows for depth

Style: Scandinavian minimalist aesthetic, professional product photography quality. Clean lines, elegant composition. Similar to Apple or high-end electronics product presentations.

Include subtle grid lines or measurement indicators for technical documentation feel.`,
    aspectRatio: '3:4',
    sampleImageUrl: 'https://storage.googleapis.com/parallax-ai-images/production/public/image/3_1769669282978.png',
    requiresReferenceImage: true,
    customPromptPlaceholder: 'Describe product name, materials, key features...',
  },

  character: {
    mode: 'character',
    title: 'Character Concept Sheet',
    description: 'Character breakdown with full body, outfits, and expression sheet.',
    prompt: `Create a character concept sheet with multiple views and details.

Layout:
- Center: Full-body character illustration (front view, neutral pose)
- Left side: Outfit/clothing layers breakdown (showing each layer separately)
- Right side: Expression sheet with 4 different emotions (happy, sad, angry, surprised)
- Bottom: Color palette and design notes

Style: Clean illustration style suitable for animation/game development. Consistent character design across all views. White or light gray background with subtle guides.

Include reference lines and annotations for proportions. Professional character design documentation format.`,
    aspectRatio: '1:1',
    sampleImageUrl: 'https://storage.googleapis.com/parallax-ai-images/production/public/image/3_1769669714082.png',
    requiresReferenceImage: true,
    customPromptPlaceholder: 'Describe personality, outfit style, special features...',
  },

  popupmap: {
    mode: 'popupmap',
    title: '3D Pop-Up Map',
    description: 'Papercraft-style 3D city map with landmarks popping out.',
    prompt: `Create a 3D pop-up book style illustration of {INPUT}.

Design: Paper craft aesthetic where famous landmarks appear to pop out of an open travel book/map. Include:
- Major landmarks as 3D paper cutouts rising from the page
- Surrounding cityscape in layered paper style
- Open book/map base with vintage cartography elements
- Tilt-shift focus effect for miniature feel

Lighting: Golden hour, warm and inviting atmosphere. Soft shadows creating depth between paper layers.

Style: Whimsical, magical travel book illustration. High detail on landmarks, artistic paper texture throughout.`,
    aspectRatio: '16:9',
    sampleImageUrl: 'https://storage.googleapis.com/parallax-ai-images/production/public/image/3_1769669520319.png',
    requiresReferenceImage: false,
    textInputLabel: 'Location',
    textInputPlaceholder: 'e.g., Paris, Tokyo, New York, Italy...',
  },

  diorama: {
    mode: 'diorama',
    title: 'Isometric Diorama',
    description: '3D isometric landmark miniatures with unified scale.',
    prompt: `Create a 3D isometric diorama featuring famous landmarks of {INPUT}.

Design:
- Multiple landmark miniatures arranged on concrete/stone pedestals
- Isometric camera angle (30-degree view)
- Unified scale across all landmarks
- Clean, minimalist presentation
- Small labels or typography identifying each landmark

Style: Architectural model/miniature aesthetic. Realistic materials and textures. Soft studio lighting with subtle shadows. White or light gray background.

Include 4-6 of the most iconic landmarks, arranged in an aesthetically pleasing composition.`,
    aspectRatio: '1:1',
    sampleImageUrl: 'https://storage.googleapis.com/parallax-ai-images/production/public/image/3_1769669821150.png',
    requiresReferenceImage: false,
    textInputLabel: 'Location',
    textInputPlaceholder: 'e.g., Japan, London, Egypt, Brazil...',
  },

  instagram3d: {
    mode: 'instagram3d',
    title: 'Instagram 3D Layout',
    description: 'Instagram UI as physical 3D object with pop-out effect.',
    prompt: `Create a creative 3D visualization where an Instagram post frame exists as a physical 3D object in space.

Design:
- Instagram UI frame rendered as a solid 3D object (floating in space or on a surface)
- The model/subject breaking out of the frame boundaries (pop-out effect)
- Parts of the subject extending beyond the Instagram frame into 3D space
- Dramatic cinematic lighting with depth

Style: Photo-realistic 3D render. The Instagram frame should look like a physical white/glass panel. Strong depth perception with the subject appearing to escape the 2D boundary.

Lighting: Studio or cinematic lighting, emphasizing the 3D effect and depth.`,
    aspectRatio: '1:1',
    sampleImageUrl: 'https://storage.googleapis.com/parallax-ai-images/production/public/image/3_1769668979859.png',
    requiresReferenceImage: true,
    customPromptPlaceholder: 'Describe pose, outfit, or which parts should pop out...',
  },

  fashiondoc: {
    mode: 'fashiondoc',
    title: 'Fashion Documentation',
    description: 'High-end lookbook style outfit presentation with annotations.',
    prompt: `Create a high-end fashion lookbook style outfit documentation layout.

Layout:
- Main view: Full outfit on model (front view)
- Supporting views: Side view, back view, detail shots
- Technical annotations with lines pointing to key features
- Material/fabric callouts
- Clean white or neutral background

Style: Luxury fashion catalog aesthetic. Professional fashion photography quality. Clean, minimal design with elegant typography for labels and annotations.

Include subtle measurement guides and construction detail notes for a technical fashion documentation feel.`,
    aspectRatio: '9:16',
    sampleImageUrl: 'https://storage.googleapis.com/parallax-ai-images/production/public/image/3_1769669701149.png',
    requiresReferenceImage: true,
    customPromptPlaceholder: 'Describe materials, brand, special features...',
  },
};
