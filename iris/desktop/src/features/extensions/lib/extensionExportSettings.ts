/**
 * Extension-facing export settings holder (iris.export API backing state).
 *
 * The video editor's real export options live as transient local state inside
 * ExportModal/ExportPanel — there is no app-wide export settings store yet.
 * Until one exists, extensions read/write this holder; it is the single place
 * the renderer answers `iris.export.*` requests from.
 *
 * Preset table mirrors the platform presets offered by the video editor's
 * ExportModal (id/label/dimensions/fps/format only — the fields the
 * `iris.export.getPresets()` SDK contract exposes).
 */

export interface ExtensionExportPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  fps: number;
  format: string;
}

export interface ExtensionExportSettings {
  format: string;
  quality: string;
  frameRate: number;
  width: number;
  height: number;
  [key: string]: unknown;
}

const EXPORT_PRESETS: ExtensionExportPreset[] = [
  { id: 'custom', label: 'Custom', width: 1920, height: 1080, fps: 30, format: 'mp4' },
  { id: 'youtube', label: 'YouTube', width: 1920, height: 1080, fps: 60, format: 'mp4' },
  { id: 'youtube-4k', label: 'YouTube 4K', width: 3840, height: 2160, fps: 60, format: 'mp4' },
  { id: 'tiktok', label: 'TikTok', width: 1080, height: 1920, fps: 30, format: 'mp4' },
  { id: 'reels', label: 'Instagram Reels', width: 1080, height: 1920, fps: 30, format: 'mp4' },
  { id: 'instagram', label: 'Instagram Post', width: 1080, height: 1080, fps: 30, format: 'mp4' },
  { id: 'instagram-story', label: 'Instagram Story', width: 1080, height: 1920, fps: 30, format: 'mp4' },
  { id: 'shorts', label: 'YouTube Shorts', width: 1080, height: 1920, fps: 30, format: 'mp4' },
  { id: 'linkedin', label: 'LinkedIn', width: 1920, height: 1080, fps: 30, format: 'mp4' },
  { id: 'twitter', label: 'X (Twitter)', width: 1280, height: 720, fps: 30, format: 'mp4' },
  { id: 'facebook', label: 'Facebook', width: 1280, height: 720, fps: 30, format: 'mp4' },
];

const DEFAULT_SETTINGS: ExtensionExportSettings = {
  format: 'mp4',
  quality: 'high',
  frameRate: 30,
  width: 1920,
  height: 1080,
};

let currentSettings: ExtensionExportSettings = { ...DEFAULT_SETTINGS };

export function getExtensionExportPresets(): ExtensionExportPreset[] {
  return EXPORT_PRESETS.map((p) => ({ ...p }));
}

/** Apply a preset by id. Returns false when the preset id is unknown. */
export function applyExtensionExportPreset(presetId: string): boolean {
  const preset = EXPORT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return false;
  currentSettings = {
    ...currentSettings,
    format: preset.format,
    frameRate: preset.fps,
    width: preset.width,
    height: preset.height,
  };
  return true;
}

export function getExtensionExportSettings(): ExtensionExportSettings {
  return { ...currentSettings };
}

export function updateExtensionExportSettings(partial: Record<string, unknown>): void {
  currentSettings = { ...currentSettings, ...partial };
}
