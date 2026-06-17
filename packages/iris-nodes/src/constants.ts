// Shared option lists used across multiple node definitions.

export const ASPECT_RATIO_OPTIONS = [
  { value: '1:1', label: '1:1 (Square)' },
  { value: '4:3', label: '4:3 (Standard)' },
  { value: '3:4', label: '3:4 (Portrait)' },
  { value: '16:9', label: '16:9 (Widescreen)' },
  { value: '9:16', label: '9:16 (Vertical)' },
  { value: '21:9', label: '21:9 (Ultrawide)' },
];

export const CAMERA_ANGLE_OPTIONS = [
  { value: 'FRONT', label: 'Front' },
  { value: 'BACK', label: 'Back' },
  { value: 'LEFT', label: 'Left' },
  { value: 'RIGHT', label: 'Right' },
  { value: 'TOP', label: 'Top' },
  { value: 'BOTTOM', label: 'Bottom' },
  { value: 'THREE_QUARTER_FRONT_LEFT', label: '3/4 Front Left' },
  { value: 'THREE_QUARTER_FRONT_RIGHT', label: '3/4 Front Right' },
  { value: 'THREE_QUARTER_BACK', label: '3/4 Back' },
];

export const TTS_VOICE_OPTIONS: Record<string, Array<{ value: string; label: string; description?: string }>> = {
  openai: [
    { value: 'alloy', label: 'Alloy', description: 'Neutral and balanced' },
    { value: 'echo', label: 'Echo', description: 'Warm and conversational' },
    { value: 'fable', label: 'Fable', description: 'Expressive and dynamic' },
    { value: 'onyx', label: 'Onyx', description: 'Deep and authoritative' },
    { value: 'nova', label: 'Nova', description: 'Friendly and upbeat' },
    { value: 'shimmer', label: 'Shimmer', description: 'Clear and professional' },
  ],
  elevenlabs: [
    { value: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel', description: 'American female, calm' },
    { value: 'AZnzlk1XvdvUeBnXmlld', label: 'Domi', description: 'American female, strong' },
    { value: 'EXAVITQu4vr4xnSDxMaL', label: 'Bella', description: 'American female, soft' },
    { value: 'ErXwobaYiN019PkySvjV', label: 'Antoni', description: 'American male, well-rounded' },
    { value: 'MF3mGyEYCl7XYWbV9V6O', label: 'Elli', description: 'American female, young' },
    { value: 'TxGEqnHWrfWFTfGW9XjX', label: 'Josh', description: 'American male, young' },
    { value: 'VR6AewLTigWG4xSOukaG', label: 'Arnold', description: 'American male, crisp' },
    { value: 'pNInz6obpgDQGcFmaJgB', label: 'Adam', description: 'American male, deep' },
    { value: 'yoZ06aMxZJJ28mfd3POQ', label: 'Sam', description: 'American male, raspy' },
  ],
};

export const VOICE_OPTIONS = TTS_VOICE_OPTIONS.openai;

export function getVoicesForProvider(provider: string): Array<{ value: string; label: string; description?: string }> {
  const providerLower = provider?.toLowerCase() || '';
  return TTS_VOICE_OPTIONS[providerLower] || TTS_VOICE_OPTIONS.openai;
}
