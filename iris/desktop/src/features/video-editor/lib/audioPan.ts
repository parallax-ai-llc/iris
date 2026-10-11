/**
 * Stereo pan law shared by the preview and the FFmpeg export.
 *
 * The preview routes clip audio through a Web Audio `StereoPannerNode`
 * (components/AudioPlayer.tsx). The export reproduces the exact same channel
 * matrix with FFmpeg's `pan` filter (electron/ipc/export-render/audio-filters.ts),
 * so a clip panned to 0.4 sounds the same in both.
 *
 * This file is imported by the Electron main process through a relative path —
 * keep it free of `@/` imports and of anything renderer-only.
 *
 * Algorithm: Web Audio spec, "StereoPannerNode — stereo input" panning.
 *   pan <= 0: x = pan + 1, outL = inL + inR·cos(x·π/2), outR = inR·sin(x·π/2)
 *   pan  > 0: x = pan,     outL = inL·cos(x·π/2),      outR = inR + inL·sin(x·π/2)
 */

export interface StereoPanMatrix {
  /** outL = lFromL·inL + lFromR·inR */
  lFromL: number;
  lFromR: number;
  /** outR = rFromL·inL + rFromR·inR */
  rFromL: number;
  rFromR: number;
}

export function clampPan(pan: number | undefined): number {
  if (pan === undefined || !Number.isFinite(pan)) return 0;
  return Math.max(-1, Math.min(1, pan));
}

export function stereoPannerMatrix(panValue: number | undefined): StereoPanMatrix {
  const pan = clampPan(panValue);
  if (pan <= 0) {
    const x = pan + 1;
    return {
      lFromL: 1,
      lFromR: Math.cos((x * Math.PI) / 2),
      rFromL: 0,
      rFromR: Math.sin((x * Math.PI) / 2),
    };
  }
  const x = pan;
  return {
    lFromL: Math.cos((x * Math.PI) / 2),
    lFromR: 0,
    rFromL: Math.sin((x * Math.PI) / 2),
    rFromR: 1,
  };
}

/** dB → linear amplitude (0 dB = 1, -∞ dB = silence, missing/NaN = 1). */
export function dbToLinear(db: number | undefined): number {
  if (db === -Infinity) return 0;
  if (db === undefined || !Number.isFinite(db) || db === 0) return 1;
  return Math.pow(10, db / 20);
}
