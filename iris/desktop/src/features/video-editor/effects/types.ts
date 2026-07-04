/**
 * Video effect definition types.
 *
 * Pure data modules (no React/DOM/Electron imports) so they can be consumed
 * by both the renderer (effects panel UI) and the Electron main process
 * (FFmpeg export pipeline). Icons are renderer-only and live in
 * components/effectIcons.ts.
 */

/** Mirrors EffectType in src/types/videoProject.types.ts (kept dependency-free). */
export type VideoEffectKind = 'transition' | 'filter' | 'audio-effect';

export interface VideoEffectDefinition {
  id: string;
  name: string;
  type: VideoEffectKind;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultParams: Record<string, any>;
  /** Filters: default intensity applied on insert (falls back to 50). */
  defaultIntensity?: number;
  /** Transitions: FFmpeg xfade transition name used by the export pipeline. */
  xfade?: string;
}

export interface VideoEffectCategory {
  key: string;
  name: string;
  effects: VideoEffectDefinition[];
}
