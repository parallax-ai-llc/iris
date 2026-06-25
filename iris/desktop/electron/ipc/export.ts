/**
 * Export IPC handlers - Local FFmpeg-based video rendering
 *
 * Converts timeline data into FFmpeg filter_complex commands
 * and renders the final video on the user's machine.
 */

import { ipcMain, BrowserWindow, app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, createWriteStream } from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import https from 'https';
import http from 'http';
import { ensureFFmpegAvailable, findFFmpegPathSync, type EnsureProgress } from './ffmpeg-resolver';
import {
  buildOverlayCompositor,
  type OverlayClip,
  type OverlayTrack,
} from './export-overlays';

// Download a remote URL to a local temp file, returns local path
async function downloadToTemp(url: string, ext: string, authToken?: string, redirectCount = 0): Promise<string> {
  if (redirectCount > 5) throw new Error('Too many redirects');
  const tempDir = path.join(app.getPath('temp'), 'iris-export');
  await fs.mkdir(tempDir, { recursive: true });
  const fileName = `asset_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
  const localPath = path.join(tempDir, fileName);

  return new Promise((resolve, reject) => {
    const file = createWriteStream(localPath);
    const protocol = url.startsWith('https') ? https : http;
    const headers: Record<string, string> = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const reqOptions = { headers };

    protocol.get(url, reqOptions, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(localPath).catch(() => {});
        downloadToTemp(res.headers.location, ext, authToken, redirectCount + 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        file.close();
        fs.unlink(localPath).catch(() => {});
        reject(new Error(`HTTP ${res.statusCode} downloading asset`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(localPath); });
      file.on('error', (err) => { file.close(); fs.unlink(localPath).catch(() => {}); reject(err); });
      res.on('error', (err) => { file.close(); fs.unlink(localPath).catch(() => {}); reject(err); });
    }).on('error', (err) => {
      file.close();
      fs.unlink(localPath).catch(() => {});
      reject(err);
    });
  });
}

// Guess file extension from URL or mime
function guessExt(url: string): string {
  const match = url.match(/\.(mp4|mov|webm|mp3|m4a|aac|wav|gif|jpg|jpeg|png|webp)(\?|$)/i);
  return match ? `.${match[1].toLowerCase()}` : '.mp4';
}

// FFmpeg path resolution + auto-install lives in ./ffmpeg-resolver.
// findFFmpegPath() is kept as a thin sync shim for hot paths (probe handlers).
function findFFmpegPath(): string {
  return findFFmpegPathSync();
}

// Check if a local file has an audio stream using ffmpeg -i (parses stderr)
async function checkSourceHasAudio(ffmpegPath: string, filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, ['-i', filePath], { stdio: 'pipe' });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', () => resolve(stderr.includes('Audio:')));
    proc.on('error', () => resolve(false));
  });
}

// ==================== Types ====================

interface SubtitleOverlayEntry {
  /** Base64 PNG data URL from the renderer (set by ExportModal before IPC call). */
  pngDataUrl?: string;
  /** Resolved temp file path written by the export handler. */
  pngPath?: string;
  /** Timeline-relative start time (seconds). */
  startTime: number;
  /** Timeline-relative end time (seconds). */
  endTime: number;
}

interface ExportRequest {
  outputPath: string;
  format: 'mp4' | 'webm' | 'mov' | 'gif';
  quality: 'low' | 'medium' | 'high' | 'ultra';
  frameRate: number;
  width: number;
  height: number;
  duration: number;
  tracks: ExportTrack[];
  includeSubtitles: boolean;
  subtitleFormat?: 'burned' | 'srt' | 'vtt';
  codec?: 'h264' | 'h265' | 'prores' | 'vp9';
  proResProfile?: '422' | '422-hq' | '422-lt' | '422-proxy' | '4444';
  authToken?: string;
  /**
   * Pre-rasterized subtitle PNG overlays from the renderer.
   * When present, these are composited via FFmpeg overlay instead of the ASS burned path,
   * producing pixel-accurate output that matches the editor preview exactly.
   */
  subtitleOverlays?: SubtitleOverlayEntry[];
}

interface ExportTrack {
  id: string;
  type: 'video' | 'audio' | 'subtitle' | 'music' | 'adjustment';
  muted: boolean;
  volume: number;
  clips: ExportClip[];
}

interface ExportClip {
  id: string;
  type: string;
  mediaType?: string; // 'image' for still-image clips (VideoClip with mediaType === 'image')
  startTime: number;
  endTime: number;
  sourceStartTime: number;
  sourceEndTime: number;
  sourceUrl: string;
  // Video specific
  volume?: number;
  muted?: boolean;
  speed?: number;
  /** Natural pixel dimensions of the source image (stored in VideoClip.sourceWidth/Height).
   *  Required so image overlays render at their natural size rather than the full frame. */
  sourceWidth?: number;
  sourceHeight?: number;
  /** CSS/canvas blend mode for overlay compositing. Only 'normal' is currently applied
   *  (mapped to plain overlay filter). Other modes are accepted but fall back to normal. */
  blendMode?: string;
  /** The track that owns this clip. Populated by the ExportRequest builder so the
   *  compositor can determine the base vs overlay tracks without re-scanning. */
  trackId?: string;
  transform?: {
    scale: number;
    rotation: number;
    opacity: number;
    x: number;
    y: number;
  };
  effects?: Array<{
    type: string;
    enabled: boolean;
    filterType?: string;
    filterIntensity?: number;
    filterParams?: Record<string, any>;
    transitionType?: string;
    transitionPosition?: 'start' | 'end' | 'both';
    transitionDuration?: number;
    audioEffectType?: string;
    audioParams?: Record<string, any>;
  }>;
  // Subtitle specific
  text?: string;
  /** Full SubtitleStyle passed through from the editor. The width/height/paddingX/paddingY
   *  fields are used by buildAssContent for lower-third positioning. */
  style?: {
    fontSize: number;
    fontFamily: string;
    fontColor: string;
    backgroundColor: string;
    backgroundOpacity: number;
    position: { x: number; y: number };
    alignment?: 'left' | 'center' | 'right';
    verticalAlign?: 'top' | 'middle' | 'bottom';
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
    stroke?: { color: string; width: number };
    dropShadow?: { color: string; offsetX: number; offsetY: number; blur: number };
    letterSpacing?: number;
    lineHeight?: number;
    textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
    /** Width of the text box as % of the video frame width. */
    width?: number;
    /** Height of the text box as % of the video frame height. */
    height?: number;
    /** Horizontal inner padding in project px. */
    paddingX?: number;
    /** Vertical inner padding in project px. */
    paddingY?: number;
  };
  // Audio/Music specific
  fadeIn?: number;  // seconds
  fadeOut?: number; // seconds
  pan?: number;     // stereo pan -1 (left) to 1 (right)
  gain?: number;    // dB gain
}

interface ExportProgress {
  status: 'preparing' | 'downloading' | 'rendering' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0-100
  message: string;
  error?: string;
  outputPath?: string;
}

// ==================== Quality Presets ====================

// ProRes profile name → FFmpeg profile number
const PRORES_PROFILE_MAP: Record<string, string> = {
  '422-proxy': '0',
  '422-lt': '1',
  '422': '2',
  '422-hq': '3',
  '4444': '4',
};

function getQualityParams(
  quality: string,
  format: string,
  codec?: string,
  proResProfile?: string,
): string[] {
  const params: string[] = [];

  if (format === 'gif') {
    // GIF: only loop flag — fps/palette filters are merged into the main filter chain in buildFFmpegArgs
    params.push('-loop', '0');
    return params;
  }

  if (format === 'webm' || codec === 'vp9') {
    params.push('-c:v', 'libvpx-vp9', '-c:a', 'libopus');
    switch (quality) {
      case 'low':    params.push('-crf', '35', '-b:v', '1M'); break;
      case 'medium': params.push('-crf', '30', '-b:v', '2M'); break;
      case 'high':   params.push('-crf', '25', '-b:v', '4M'); break;
      case 'ultra':  params.push('-crf', '20', '-b:v', '8M'); break;
    }
    return params;
  }

  if (format === 'mov' && codec === 'prores') {
    const profileNum = PRORES_PROFILE_MAP[proResProfile ?? '422'] ?? '2';
    params.push('-c:v', 'prores_ks', '-profile:v', profileNum, '-c:a', 'pcm_s16le');
    return params; // ProRes has no CRF; quality is determined by profile
  }

  // H.265 (HEVC)
  if (codec === 'h265') {
    params.push('-c:v', 'libx265', '-c:a', 'aac');
    switch (quality) {
      case 'low':    params.push('-crf', '32', '-preset', 'fast'); break;
      case 'medium': params.push('-crf', '28', '-preset', 'medium'); break;
      case 'high':   params.push('-crf', '22', '-preset', 'slow'); break;
      case 'ultra':  params.push('-crf', '18', '-preset', 'slow'); break;
    }
    // Force standard 8-bit 4:2:0 chroma so the file plays in QuickTime/VLC/web.
    // Without this, color filters (curves/eq) push the stream to RGB and many
    // players refuse to decode the resulting file.
    params.push('-pix_fmt', 'yuv420p');
    return params;
  }

  // H.264 (default for mp4/mov)
  params.push('-c:v', 'libx264', '-c:a', 'aac');
  switch (quality) {
    case 'low':    params.push('-crf', '28', '-preset', 'fast'); break;
    case 'medium': params.push('-crf', '23', '-preset', 'medium'); break;
    case 'high':   params.push('-crf', '18', '-preset', 'slow'); break;
    case 'ultra':  params.push('-crf', '15', '-preset', 'slow'); break;
  }
  // See note above — required for broad player compatibility, especially when
  // the filter chain (curves/eq) emits RGB intermediates.
  params.push('-pix_fmt', 'yuv420p');
  return params;
}

// ==================== Effect Filter Helpers ====================

/** Converts [x,y][] curve points to FFmpeg curves point string */
function formatCurvePoints(pts: [number, number][]): string {
  if (!pts || pts.length < 2) return '';
  return pts
    .map(([x, y]) => `${Math.max(0, Math.min(1, x)).toFixed(3)}/${Math.max(0, Math.min(1, y)).toFixed(3)}`)
    .join(' ');
}

/** Video filter strings for ClipEffect[] type='filter' */
function buildEffectFilters(effects: ExportClip['effects']): string[] {
  if (!effects) return [];
  const filters: string[] = [];
  for (const fx of effects) {
    if (!fx.enabled || fx.type !== 'filter') continue;
    const v = fx.filterIntensity ?? 50;
    switch (fx.filterType) {
      case 'brightness':
        filters.push(`eq=brightness=${(v / 200).toFixed(3)}`); break;
      case 'contrast':
        filters.push(`eq=contrast=${(1 + v / 100).toFixed(3)}`); break;
      case 'saturation':
        filters.push(`eq=saturation=${(1 + v / 100).toFixed(3)}`); break;
      case 'hue':
        filters.push(`hue=h=${v}`); break;
      case 'blur':
        filters.push(`gblur=sigma=${Math.max(0.5, v / 5).toFixed(1)}`); break;
      case 'grayscale':
        // v=0 → s=1 (no change), v=100 → s=0 (full grayscale)
        filters.push(`hue=s=${Math.max(0, 1 - v / 100).toFixed(3)}`); break;
      case 'sepia':
        filters.push(`colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131`); break;
      case 'invert':
        filters.push(`negate`); break;
      case 'sharpen':
      case 'unsharp-mask':
        filters.push(`unsharp=5:5:${(v / 50).toFixed(2)}:5:5:0`); break;
      case 'gaussian-blur':
        filters.push(`gblur=sigma=${Math.max(0.1, v / 10).toFixed(1)}`); break;
      case 'noise':
        filters.push(`noise=alls=${Math.round(v / 2)}:allf=t+u`); break;
      case 'horizontal-flip':
        filters.push(`hflip`); break;
      case 'vertical-flip':
        filters.push(`vflip`); break;
      case 'mosaic':
        filters.push(`pixelize=w=${Math.max(2, Math.round(v / 5))}:h=${Math.max(2, Math.round(v / 5))}`); break;
      case 'vignette':
        filters.push(`vignette=PI/${Math.max(0.5, 5 - v * 0.04).toFixed(2)}`); break;
      case 'brightness-contrast':
        filters.push(`eq=brightness=${(v / 200).toFixed(3)}:contrast=${(1 + v / 100).toFixed(3)}`); break;
      case 'color-correction': {
        const p = fx.filterParams || {};
        const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

        // Basic
        if (p.exposure) filters.push(`eq=brightness=${((p.exposure as number) / 200).toFixed(3)}`);
        if (p.contrast) filters.push(`eq=contrast=${(1 + (p.contrast as number) / 100).toFixed(3)}`);
        if (p.saturation) filters.push(`eq=saturation=${(1 + (p.saturation as number) / 100).toFixed(3)}`);
        if (p.vibrance) filters.push(`eq=saturation=${(1 + (p.vibrance as number) * 0.006).toFixed(3)}`);
        if (p.temperature != null && (p.temperature as number) !== 0) {
          // colortemperature filter requires FFmpeg 5.0+; use colorbalance for 4.x compat
          const t = (p.temperature as number) / 100; // -1~+1 normalized
          const r = clamp(t * 0.3, -1, 1).toFixed(3);
          const g = clamp(t * 0.05, -1, 1).toFixed(3);
          const b = clamp(-t * 0.3, -1, 1).toFixed(3);
          filters.push(`colorbalance=rs=${r}:gs=${g}:bs=${b}:rm=${r}:gm=${g}:bm=${b}:rh=${r}:gh=${g}:bh=${b}`);
        }
        // Tint: negative = green, positive = magenta
        if (p.tint) {
          const t = (p.tint as number) / 200;
          const gs = clamp(-t, -1, 1).toFixed(3);
          const rs = clamp(t * 0.5, -1, 1).toFixed(3);
          const bs = clamp(t * 0.5, -1, 1).toFixed(3);
          filters.push(`colorbalance=rs=${rs}:gs=${gs}:bs=${bs}:rm=${rs}:gm=${gs}:bm=${bs}:rh=${rs}:gh=${gs}:bh=${bs}`);
        }

        // Tone adjustments via curves
        if (p.highlights) {
          const h = clamp(0.75 + (p.highlights as number) / 400, 0, 1).toFixed(3);
          filters.push(`curves=master='0/0 0.500/0.500 0.750/${h} 1.000/1.000'`);
        }
        if (p.shadows) {
          const s = clamp(0.25 + (p.shadows as number) / 400, 0, 1).toFixed(3);
          filters.push(`curves=master='0.000/0.000 0.250/${s} 0.500/0.500 1.000/1.000'`);
        }
        if (p.whites) {
          const wv = p.whites as number;
          if (wv > 0) {
            const pt = clamp(0.875 + wv / 400, 0, 1).toFixed(3);
            filters.push(`curves=master='0.000/0.000 0.500/0.500 0.875/${pt} 1.000/1.000'`);
          } else {
            const w = clamp(1 + wv / 400, 0, 1).toFixed(3);
            filters.push(`curves=master='0.000/0.000 0.500/0.500 1.000/${w}'`);
          }
        }
        if (p.blacks) {
          const bv = p.blacks as number;
          if (bv > 0) {
            // Lift blacks (fade): raise the shadow floor
            const b = clamp(bv / 400, 0, 0.3).toFixed(3);
            filters.push(`curves=master='0.000/${b} 0.500/0.500 1.000/1.000'`);
          } else {
            // Crush blacks: pull the 0.25 point down toward 0
            const b = clamp(0.25 + bv / 400, 0, 0.25).toFixed(3);
            filters.push(`curves=master='0.000/0.000 0.250/${b} 1.000/1.000'`);
          }
        }
        if (p.fadedFilm) {
          const lift = clamp((p.fadedFilm as number) / 400, 0, 0.3).toFixed(3);
          const ceiling = clamp(1 - (p.fadedFilm as number) / 400, 0.7, 1).toFixed(3);
          filters.push(`curves=master='0.000/${lift} 1.000/${ceiling}'`);
        }

        // User-defined RGB curves
        const masterPts = p.curveMaster as [number, number][] | undefined;
        const redPts = p.curveRed as [number, number][] | undefined;
        const greenPts = p.curveGreen as [number, number][] | undefined;
        const bluePts = p.curveBlue as [number, number][] | undefined;
        const masterStr = formatCurvePoints(masterPts ?? []);
        const redStr = formatCurvePoints(redPts ?? []);
        const greenStr = formatCurvePoints(greenPts ?? []);
        const blueStr = formatCurvePoints(bluePts ?? []);
        if (masterStr || redStr || greenStr || blueStr) {
          const parts: string[] = [];
          if (masterStr) parts.push(`master='${masterStr}'`);
          if (redStr) parts.push(`red='${redStr}'`);
          if (greenStr) parts.push(`green='${greenStr}'`);
          if (blueStr) parts.push(`blue='${blueStr}'`);
          filters.push(`curves=${parts.join(':')}`);
        }

        // Color wheels (three-way: shadows/midtones/highlights)
        const sw = p.shadowsWheel as [number, number] | undefined;
        const mw = p.midtonesWheel as [number, number] | undefined;
        const hw = p.highlightsWheel as [number, number] | undefined;
        const scale = 0.3;
        if ((sw && (sw[0] !== 0 || sw[1] !== 0)) || (mw && (mw[0] !== 0 || mw[1] !== 0)) || (hw && (hw[0] !== 0 || hw[1] !== 0))) {
          const [sx, sy] = sw ?? [0, 0];
          const [mx, my] = mw ?? [0, 0];
          const [hx, hy] = hw ?? [0, 0];
          const cbRs = clamp(sx * scale - sy * 0.15 * scale, -1, 1).toFixed(3);
          const cbGs = clamp(sy * scale, -1, 1).toFixed(3);
          const cbBs = clamp(-sx * scale - sy * 0.15 * scale, -1, 1).toFixed(3);
          const cbRm = clamp(mx * scale - my * 0.15 * scale, -1, 1).toFixed(3);
          const cbGm = clamp(my * scale, -1, 1).toFixed(3);
          const cbBm = clamp(-mx * scale - my * 0.15 * scale, -1, 1).toFixed(3);
          const cbRh = clamp(hx * scale - hy * 0.15 * scale, -1, 1).toFixed(3);
          const cbGh = clamp(hy * scale, -1, 1).toFixed(3);
          const cbBh = clamp(-hx * scale - hy * 0.15 * scale, -1, 1).toFixed(3);
          filters.push(`colorbalance=rs=${cbRs}:gs=${cbGs}:bs=${cbBs}:rm=${cbRm}:gm=${cbGm}:bm=${cbBm}:rh=${cbRh}:gh=${cbGh}:bh=${cbBh}`);
        }
        if (p.shadowsLift) {
          const lift = clamp((p.shadowsLift as number) / 400, 0, 0.3).toFixed(3);
          filters.push(`curves=master='0.000/${lift} 0.500/0.500 1.000/1.000'`);
        }
        if (p.midtonesGamma) {
          const gamma = clamp(1 + (p.midtonesGamma as number) / 100, 0.1, 10).toFixed(3);
          filters.push(`eq=gamma=${gamma}`);
        }
        if (p.highlightsGain) {
          const hg = (p.highlightsGain as number) / 100; // -1~+1
          const pt = clamp(0.75 + hg * 0.25, 0, 1).toFixed(3);
          filters.push(`curves=master='0.000/0.000 0.500/0.500 0.750/${pt} 1.000/1.000'`);
        }

        // HSL Secondary — approximate: average non-zero channels
        const hslSat = p.hslSaturation as number[] | undefined;
        const hslHue = p.hslHue as number[] | undefined;
        const hslLum = p.hslLuminance as number[] | undefined;
        if (hslSat && hslSat.length > 0) {
          const nonZero = hslSat.filter((v) => v !== 0);
          if (nonZero.length > 0) {
            const avg = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
            filters.push(`eq=saturation=${(1 + avg / 100).toFixed(3)}`);
          }
        }
        if (hslHue && hslHue.length > 0) {
          const nonZero = hslHue.filter((v) => v !== 0);
          if (nonZero.length > 0) {
            const avg = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
            filters.push(`hue=h=${avg.toFixed(2)}`);
          }
        }
        if (hslLum && hslLum.length > 0) {
          const nonZero = hslLum.filter((v) => v !== 0);
          if (nonZero.length > 0) {
            const avg = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
            filters.push(`eq=brightness=${(avg / 200).toFixed(3)}`);
          }
        }
        break;
      }
      case 'black-and-white':
        filters.push(`hue=s=0`); break;
      case 'posterize':
        filters.push(`posterize=${Math.max(2, Math.round(8 - v / 15))}`); break;
      case 'find-edges':
        filters.push(`edgedetect=low=0.1:high=0.4`); break;
      case 'threshold': {
        const t = Math.max(0.001, Math.min(0.999, v / 100));
        filters.push(`curves=master='0/0 ${(t - 0.001).toFixed(3)}/0 ${t.toFixed(3)}/1 1/1'`); break;
      }
      case 'emboss':
        filters.push(`convolution=0m=-2 -1 0 -1 1 1 0 1 2:1m=-2 -1 0 -1 1 1 0 1 2:2m=-2 -1 0 -1 1 1 0 1 2:3m=0 0 0 0 1 0 0 0 0`); break;
      case 'solarize': {
        const thr = Math.max(0.001, 1 - v / 100);
        filters.push(`curves=master='0/0 ${thr.toFixed(3)}/1 1/0'`); break;
      }
      case 'anti-alias-blur':
        filters.push(`gblur=sigma=0.5`); break;
      case 'camera-blur':
      case 'compound-blur':
        filters.push(`gblur=sigma=${Math.max(0.1, v / 10).toFixed(1)}`); break;
      case 'median':
        filters.push(`median=radius=${Math.max(1, Math.round(v / 20))}`); break;
      case 'replicate':
        filters.push(`tile=${Math.max(2, Math.round(v / 25) + 1)}x${Math.max(2, Math.round(v / 25) + 1)}`); break;
      case 'equalize':
        filters.push(`histeq=strength=${Math.max(0.01, v / 100).toFixed(2)}`); break;
      case 'auto-levels':
      case 'auto-contrast':
      case 'auto-color':
        filters.push(`normalize`); break;
      case 'tint': {
        const p = fx.filterParams || {};
        const color = (p.color as string) ?? '#ffaa44';
        const hex = color.replace('#', '').padEnd(6, '0');
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        const intensity = v / 100;
        const rr = (1 - intensity + intensity * r).toFixed(3);
        const rg = (intensity * g * 0.3).toFixed(3);
        const rb = (intensity * b * 0.3).toFixed(3);
        const gr = (intensity * r * 0.3).toFixed(3);
        const gg = (1 - intensity + intensity * g).toFixed(3);
        const gb = (intensity * b * 0.3).toFixed(3);
        const br2 = (intensity * r * 0.3).toFixed(3);
        const bg2 = (intensity * g * 0.3).toFixed(3);
        const bb = (1 - intensity + intensity * b).toFixed(3);
        filters.push(`colorchannelmixer=${rr}:${rg}:${rb}:0:${gr}:${gg}:${gb}:0:${br2}:${bg2}:${bb}:0`);
        break;
      }
      case 'proc-amp': {
        const p = fx.filterParams || {};
        if (p.brightness) filters.push(`eq=brightness=${((p.brightness as number) / 200).toFixed(3)}`);
        if (p.contrast) filters.push(`eq=contrast=${(1 + (p.contrast as number) / 100).toFixed(3)}`);
        if (p.saturation) filters.push(`eq=saturation=${(1 + (p.saturation as number) / 100).toFixed(3)}`);
        if (p.hue) filters.push(`hue=h=${p.hue}`);
        break;
      }
      case 'gamma-correction': {
        const p = fx.filterParams || {};
        const gamma = (p.gamma as number) ?? 1.0;
        if (gamma !== 1) filters.push(`eq=gamma=${gamma.toFixed(3)}`);
        break;
      }
      case 'levels': {
        const p = fx.filterParams || {};
        const inMin = ((p.inputBlack as number) ?? 0) / 255;
        const inMax = ((p.inputWhite as number) ?? 255) / 255;
        const outMin = ((p.outputBlack as number) ?? 0) / 255;
        const outMax = ((p.outputWhite as number) ?? 255) / 255;
        filters.push(`colorlevels=rimin=${inMin.toFixed(3)}:gimin=${inMin.toFixed(3)}:bimin=${inMin.toFixed(3)}:rimax=${inMax.toFixed(3)}:gimax=${inMax.toFixed(3)}:bimax=${inMax.toFixed(3)}:romin=${outMin.toFixed(3)}:gomin=${outMin.toFixed(3)}:bomin=${outMin.toFixed(3)}:romax=${outMax.toFixed(3)}:gomax=${outMax.toFixed(3)}:bomax=${outMax.toFixed(3)}`);
        break;
      }
      case 'shadow-highlight': {
        const p = fx.filterParams || {};
        const shadow = ((p.shadowAmount as number) ?? 0) / 100;
        const highlight = ((p.highlightAmount as number) ?? 0) / 100;
        if (shadow !== 0 || highlight !== 0) {
          const shadowOut = Math.min(1, shadow * 0.5).toFixed(3);
          const highlightOut = Math.max(0, 1 - highlight * 0.5).toFixed(3);
          filters.push(`curves=master='0/${shadowOut} 0.5/0.5 1/${highlightOut}'`);
        }
        break;
      }
      case 'channel-mixer': {
        const p = fx.filterParams || {};
        const rr = (p.rr as number) ?? 1; const rg2 = (p.rg as number) ?? 0; const rb2 = (p.rb as number) ?? 0;
        const gr2 = (p.gr as number) ?? 0; const gg2 = (p.gg as number) ?? 1; const gb2 = (p.gb as number) ?? 0;
        const br3 = (p.br as number) ?? 0; const bg3 = (p.bg as number) ?? 0; const bb2 = (p.bb as number) ?? 1;
        filters.push(`colorchannelmixer=${rr}:${rg2}:${rb2}:0:${gr2}:${gg2}:${gb2}:0:${br3}:${bg3}:${bb2}:0`);
        break;
      }
      case 'color-balance-rgb': {
        const p = fx.filterParams || {};
        const r = 1 + ((p.red as number) ?? 0) / 100;
        const g = 1 + ((p.green as number) ?? 0) / 100;
        const b = 1 + ((p.blue as number) ?? 0) / 100;
        filters.push(`colorchannelmixer=${r.toFixed(3)}:0:0:0:0:${g.toFixed(3)}:0:0:0:0:${b.toFixed(3)}:0`);
        break;
      }
      case 'color-balance-hls': {
        const p = fx.filterParams || {};
        if (p.hue) filters.push(`hue=h=${p.hue}`);
        if (p.saturation) filters.push(`eq=saturation=${(1 + (p.saturation as number) / 100).toFixed(3)}`);
        if (p.lightness) filters.push(`eq=brightness=${((p.lightness as number) / 200).toFixed(3)}`);
        break;
      }
      case 'fast-color-corrector':
      case 'luma-corrector': {
        const p = fx.filterParams || {};
        if (p.brightness) filters.push(`eq=brightness=${((p.brightness as number) / 200).toFixed(3)}`);
        if (p.contrast) filters.push(`eq=contrast=${(1 + (p.contrast as number) / 100).toFixed(3)}`);
        if (p.saturation) filters.push(`eq=saturation=${(1 + (p.saturation as number) / 100).toFixed(3)}`);
        if (p.hue) filters.push(`hue=h=${p.hue}`);
        break;
      }
      case 'rgb-color-corrector': {
        const p = fx.filterParams || {};
        const r = 1 + ((p.redGain as number) ?? 0) / 100;
        const g = 1 + ((p.greenGain as number) ?? 0) / 100;
        const b = 1 + ((p.blueGain as number) ?? 0) / 100;
        filters.push(`colorchannelmixer=${r.toFixed(3)}:0:0:0:0:${g.toFixed(3)}:0:0:0:0:${b.toFixed(3)}:0`);
        break;
      }
      case 'asc-cdl': {
        const p = fx.filterParams || {};
        const slope = (p.slope as number) ?? 1;
        const offset = (p.offset as number) ?? 0;
        const power = (p.power as number) ?? 1;
        if (slope !== 1) filters.push(`eq=contrast=${slope.toFixed(3)}`);
        if (offset !== 0) filters.push(`eq=brightness=${(offset / 2).toFixed(3)}`);
        if (power !== 1) filters.push(`eq=gamma=${(1 / power).toFixed(3)}`);
        break;
      }
      case 'rgb-curves': {
        const p = fx.filterParams || {};
        const masterPts2 = p.curveMaster as [number, number][] | undefined;
        const redPts2 = p.curveRed as [number, number][] | undefined;
        const greenPts2 = p.curveGreen as [number, number][] | undefined;
        const bluePts2 = p.curveBlue as [number, number][] | undefined;
        const masterStr2 = formatCurvePoints(masterPts2 ?? []);
        const redStr2 = formatCurvePoints(redPts2 ?? []);
        const greenStr2 = formatCurvePoints(greenPts2 ?? []);
        const blueStr2 = formatCurvePoints(bluePts2 ?? []);
        if (masterStr2 || redStr2 || greenStr2 || blueStr2) {
          const parts2: string[] = [];
          if (masterStr2) parts2.push(`master='${masterStr2}'`);
          if (redStr2) parts2.push(`red='${redStr2}'`);
          if (greenStr2) parts2.push(`green='${greenStr2}'`);
          if (blueStr2) parts2.push(`blue='${blueStr2}'`);
          filters.push(`curves=${parts2.join(':')}`);
        }
        break;
      }
      case 'luma-curve': {
        const p = fx.filterParams || {};
        const pts = p.curveMaster as [number, number][] | undefined;
        const str = formatCurvePoints(pts ?? []);
        if (str) filters.push(`curves=master='${str}'`);
        break;
      }
      case 'three-way-color-corrector': {
        const p = fx.filterParams || {};
        const clamp3 = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
        const sw3 = p.shadowsWheel as [number, number] | undefined;
        const mw3 = p.midtonesWheel as [number, number] | undefined;
        const hw3 = p.highlightsWheel as [number, number] | undefined;
        const sc3 = 0.3;
        const [sx3, sy3] = sw3 ?? [0, 0];
        const [mx3, my3] = mw3 ?? [0, 0];
        const [hx3, hy3] = hw3 ?? [0, 0];
        const anyWheel = sx3 !== 0 || sy3 !== 0 || mx3 !== 0 || my3 !== 0 || hx3 !== 0 || hy3 !== 0;
        if (anyWheel) {
          const rs3 = clamp3(sx3 * sc3 - sy3 * 0.15 * sc3, -1, 1).toFixed(3);
          const gs3 = clamp3(sy3 * sc3, -1, 1).toFixed(3);
          const bs3 = clamp3(-sx3 * sc3 - sy3 * 0.15 * sc3, -1, 1).toFixed(3);
          const rm3 = clamp3(mx3 * sc3 - my3 * 0.15 * sc3, -1, 1).toFixed(3);
          const gm3 = clamp3(my3 * sc3, -1, 1).toFixed(3);
          const bm3 = clamp3(-mx3 * sc3 - my3 * 0.15 * sc3, -1, 1).toFixed(3);
          const rh3 = clamp3(hx3 * sc3 - hy3 * 0.15 * sc3, -1, 1).toFixed(3);
          const gh3 = clamp3(hy3 * sc3, -1, 1).toFixed(3);
          const bh3 = clamp3(-hx3 * sc3 - hy3 * 0.15 * sc3, -1, 1).toFixed(3);
          filters.push(`colorbalance=rs=${rs3}:gs=${gs3}:bs=${bs3}:rm=${rm3}:gm=${gm3}:bm=${bm3}:rh=${rh3}:gh=${gh3}:bh=${bh3}`);
        }
        if (p.shadowsLift) {
          const lift3 = clamp3((p.shadowsLift as number) / 400, 0, 0.3).toFixed(3);
          filters.push(`curves=master='0.000/${lift3} 0.500/0.500 1.000/1.000'`);
        }
        if (p.midtonesGamma) {
          const gamma3 = clamp3(1 + (p.midtonesGamma as number) / 100, 0.1, 10).toFixed(3);
          filters.push(`eq=gamma=${gamma3}`);
        }
        if (p.highlightsGain) {
          const hg3 = (p.highlightsGain as number) / 100;
          const pt3 = clamp3(0.75 + hg3 * 0.25, 0, 1).toFixed(3);
          filters.push(`curves=master='0.000/0.000 0.500/0.500 0.750/${pt3} 1.000/1.000'`);
        }
        break;
      }
      case 'change-color':
      case 'change-to-color': {
        const p = fx.filterParams || {};
        if (p.hue) filters.push(`hue=h=${p.hue}`);
        if (p.saturation) filters.push(`eq=saturation=${(1 + (p.saturation as number) / 100).toFixed(3)}`);
        break;
      }
      case 'video-limiter':
        filters.push(`colorlevels=rimin=0.063:gimin=0.063:bimin=0.063:rimax=0.922:gimax=0.922:bimax=0.922`);
        break;
      case 'crop-effect': {
        const p = fx.filterParams || {};
        if (p.width && p.height) {
          const x = (p.x as number) ?? 0;
          const y = (p.y as number) ?? 0;
          filters.push(`crop=${p.width}:${p.height}:${x}:${y}`);
        }
        break;
      }
      case 'lens-distortion': {
        const p = fx.filterParams || {};
        const k1 = ((p.k1 as number) ?? 0) / 100;
        const k2 = ((p.k2 as number) ?? 0) / 100;
        filters.push(`lenscorrection=k1=${k1.toFixed(4)}:k2=${k2.toFixed(4)}`);
        break;
      }
      case 'corner-pin': {
        const p = fx.filterParams || {};
        const x0 = (p.x0 as number) ?? 0; const y0 = (p.y0 as number) ?? 0;
        const x1 = (p.x1 as number) ?? 1920; const y1 = (p.y1 as number) ?? 0;
        const x2 = (p.x2 as number) ?? 1920; const y2 = (p.y2 as number) ?? 1080;
        const x3 = (p.x3 as number) ?? 0; const y3 = (p.y3 as number) ?? 1080;
        filters.push(`perspective=x0=${x0}:y0=${y0}:x1=${x1}:y1=${y1}:x2=${x2}:y2=${y2}:x3=${x3}:y3=${y3}:sense=source`);
        break;
      }
      case 'directional-blur': {
        const angle = ((fx.filterParams?.angle as number) ?? 0) * Math.PI / 180;
        const dist = Math.max(1, Math.round(v / 5));
        filters.push(`mblur=type=l:r=${dist}:angle=${angle.toFixed(4)}`);
        break;
      }
      case 'glow':
      case 'alpha-glow':
      case 'vr-glow': {
        const glowR = Math.max(1, Math.round(v / 10));
        filters.push(`gblur=sigma=${glowR}`);
        filters.push(`curves=master='0/0 0.7/0.85 1/1'`);
        break;
      }
      case 'channel-blur': {
        const p = fx.filterParams || {};
        const rb = (p.redBlur as number ?? 0);
        const gb = (p.greenBlur as number ?? 0);
        const bb = (p.blueBlur as number ?? 0);
        const avgBlur = (rb + gb + bb) / 3;
        if (avgBlur > 0) filters.push(`gblur=sigma=${Math.max(0.5, avgBlur).toFixed(1)}`);
        break;
      }
      case 'zoom-blur': {
        const p = fx.filterParams || {};
        const zr = Math.max(1, Math.round((p.amount as number ?? 20) / 5));
        filters.push(`mblur=type=z:r=${zr}`);
        break;
      }
      case 'color-pass':
      case 'leave-color': {
        // Approximate: reduce saturation to make non-selected colors near-gray
        // True per-hue isolation requires filter_complex; this is a best-effort
        filters.push(`eq=saturation=0.2`);
        break;
      }
      case 'mirror': {
        const p = fx.filterParams || {};
        const axis = (p.axis as number ?? 0);
        if (axis === 1) filters.push(`vflip`);
        else if (axis === 2) { filters.push(`hflip`); filters.push(`vflip`); }
        else filters.push(`hflip`);
        break;
      }
      case 'offset': {
        const p = fx.filterParams || {};
        const ox = Math.round((p.x as number ?? 0));
        const oy = Math.round((p.y as number ?? 0));
        if (ox !== 0 || oy !== 0) {
          const padW = `iw+${Math.abs(ox) * 2}`;
          const padH = `ih+${Math.abs(oy) * 2}`;
          const padX = ox < 0 ? 0 : Math.abs(ox);
          const padY = oy < 0 ? 0 : Math.abs(oy);
          const cropX = ox < 0 ? Math.abs(ox) : 0;
          const cropY = oy < 0 ? Math.abs(oy) : 0;
          filters.push(`pad=${padW}:${padH}:${padX}:${padY}`);
          filters.push(`crop=iw-${Math.abs(ox) * 2}:ih-${Math.abs(oy) * 2}:${cropX}:${cropY}`);
        }
        break;
      }
      case 'basic-3d': {
        const p = fx.filterParams || {};
        const swivel = ((p.swivel as number ?? 0)) * Math.PI / 180;
        const tilt = ((p.tilt as number ?? 0)) * Math.PI / 180;
        if (Math.abs(swivel) > 0.001) filters.push(`rotate=${swivel.toFixed(4)}:c=black@0`);
        if (Math.abs(tilt) > 0.001) {
          const dy = Math.round(Math.sin(tilt) * 200);
          filters.push(`perspective=x0=0:y0=${dy}:x1=iw:y1=${dy}:x2=0:y2=ih-${dy}:x3=iw:y3=ih-${dy}:sense=source`);
        }
        break;
      }
      case 'transform-effect': {
        const p = fx.filterParams || {};
        const scaleX = ((p.scaleX as number ?? 100)) / 100;
        const scaleY = ((p.scaleY as number ?? 100)) / 100;
        const rotation = ((p.rotation as number ?? 0)) * Math.PI / 180;
        if (Math.abs(scaleX - 1) > 0.001 || Math.abs(scaleY - 1) > 0.001)
          filters.push(`scale=iw*${scaleX.toFixed(3)}:ih*${scaleY.toFixed(3)}`);
        if (Math.abs(rotation) > 0.001) filters.push(`rotate=${rotation.toFixed(4)}:c=black@0`);
        break;
      }
      case 'motion-tile': {
        const p = fx.filterParams || {};
        const cols = Math.max(2, Math.round(200 / ((p.tileWidth as number ?? 100))));
        const rows = Math.max(2, Math.round(200 / ((p.tileHeight as number ?? 100))));
        filters.push(`tile=${cols}x${rows}`);
        break;
      }
      case 'wave-warp':
      case 'ripple-distort': {
        const p = fx.filterParams || {};
        const wh = Math.round((p.waveHeight as number ?? (p.radius as number ?? 10)));
        const ww = Math.max(1, Math.round((p.waveWidth as number ?? 20)));
        filters.push(`geq=r='r(X+${wh}*sin(2*PI*Y/${ww})\\,Y)':g='g(X+${wh}*sin(2*PI*Y/${ww})\\,Y)':b='b(X+${wh}*sin(2*PI*Y/${ww})\\,Y)'`);
        break;
      }
      case 'luma-key': {
        const p = fx.filterParams || {};
        const thr = Math.max(0.001, Math.min(0.999, ((p.threshold as number ?? 50)) / 100));
        const tol = Math.max(0.001, Math.min(0.999, ((p.tolerance as number ?? 20)) / 100));
        const soft = Math.max(0, Math.min(1, ((p.softness as number ?? 10)) / 100));
        filters.push(`lumakey=threshold=${thr.toFixed(3)}:tolerance=${tol.toFixed(3)}:softness=${soft.toFixed(3)}`);
        break;
      }
      case 'color-key':
      case 'non-red-key': {
        const p = fx.filterParams || {};
        const col = (p.color as string ?? '#00ff00').replace('#', '');
        const sim = Math.max(0.01, Math.min(0.99, ((p.tolerance as number ?? 30)) / 100));
        filters.push(`colorkey=color=${col}:similarity=${sim.toFixed(3)}:blend=0.05`);
        break;
      }
      case 'ultra-key': {
        const p = fx.filterParams || {};
        const kc = (p.keyColor as string ?? '#00ff00').replace('#', '0x');
        const sim = Math.max(0.01, Math.min(0.99, ((p.tolerance as number ?? 50)) / 100));
        filters.push(`chromakey=color=${kc}:similarity=${sim.toFixed(3)}:blend=0.05`);
        break;
      }
      case 'posterize-time': {
        const p = fx.filterParams || {};
        const fr = Math.max(1, Math.min(120, Math.round((p.frameRate as number ?? 12))));
        filters.push(`fps=${fr}`);
        break;
      }
      case 'flicker-removal':
      case 'reduce-interlace-flicker': {
        filters.push(`deflicker=s=5:m=am`);
        break;
      }
      case 'edge-feather': {
        const amount = Math.max(0.01, ((fx.filterParams?.amount as number) ?? 10) / 100);
        filters.push(`vignette=PI/${(2 / amount).toFixed(2)}:eval=init`);
        break;
      }
      case 'grid-generate': {
        const p = fx.filterParams || {};
        const gw = Math.max(1, Math.round(p.sizeX as number ?? 50));
        const gh = Math.max(1, Math.round(p.sizeY as number ?? 50));
        const lw = Math.max(1, Math.round(p.lineWidth as number ?? 1));
        filters.push(`drawgrid=x=0:y=0:width=${gw}:height=${gh}:color=white@0.8:t=${lw}`);
        break;
      }
      case 'vr-projection':
      case 'vr-rotate-sphere': {
        const p = fx.filterParams || {};
        const pan = ((p.pan as number ?? p.yaw as number ?? 0)).toFixed(1);
        const tilt2 = ((p.tilt as number ?? p.pitch as number ?? 0)).toFixed(1);
        const roll2 = ((p.roll as number ?? 0)).toFixed(1);
        filters.push(`v360=e:e:yaw=${pan}:pitch=${tilt2}:roll=${roll2}`);
        break;
      }
      case 'vr-de-noise': {
        const p = fx.filterParams || {};
        const s = Math.max(0.1, Math.min(20, ((p.strength as number ?? 50)) / 10));
        filters.push(`hqdn3d=${s.toFixed(1)}:${(s * 0.75).toFixed(1)}:${(s * 6).toFixed(1)}:${(s * 4.5).toFixed(1)}`);
        break;
      }
      case 'vr-sharpen': {
        const p = fx.filterParams || {};
        const amount2 = Math.max(0, Math.min(5, ((p.amount as number ?? 50)) / 100));
        filters.push(`unsharp=5:5:${amount2.toFixed(2)}:5:5:0`);
        break;
      }
      case 'vr-blur': {
        const p = fx.filterParams || {};
        const sigma2 = Math.max(0.5, ((p.radius as number ?? 10)) / 3);
        filters.push(`gblur=sigma=${sigma2.toFixed(1)}`);
        break;
      }
      case 'convolution-kernel': {
        const p = fx.filterParams || {};
        const mat = (p.matrix as string) ?? 'identity';
        if (mat === 'sharpen') {
          filters.push(`convolution=0m=0 -1 0 -1 5 -1 0 -1 0:1m=0 -1 0 -1 5 -1 0 -1 0:2m=0 -1 0 -1 5 -1 0 -1 0:3m=0 0 0 0 1 0 0 0 0`);
        } else if (mat === 'edge-detect') {
          filters.push(`convolution=0m=-1 -1 -1 -1 8 -1 -1 -1 -1:1m=-1 -1 -1 -1 8 -1 -1 -1 -1:2m=-1 -1 -1 -1 8 -1 -1 -1 -1:3m=0 0 0 0 1 0 0 0 0`);
        } else if (mat === 'blur') {
          filters.push(`convolution=0m=1 1 1 1 1 1 1 1 1:1m=1 1 1 1 1 1 1 1 1:2m=1 1 1 1 1 1 1 1 1:3m=0 0 0 0 1 0 0 0 0:0rdiv=9:1rdiv=9:2rdiv=9`);
        }
        break;
      }
      case 'extract-effect': {
        const p = fx.filterParams || {};
        const bv = ((p.blackPoint as number ?? 0)) / 255;
        const wv = Math.max(bv + 0.01, ((p.whitePoint as number ?? 255)) / 255);
        filters.push(`colorlevels=rimin=${bv.toFixed(3)}:gimin=${bv.toFixed(3)}:bimin=${bv.toFixed(3)}:rimax=${wv.toFixed(3)}:gimax=${wv.toFixed(3)}:bimax=${wv.toFixed(3)}`);
        break;
      }
      case 'arithmetic': {
        const p = fx.filterParams || {};
        const op = (p.operator as string ?? 'add');
        const rv = ((p.redValue as number ?? 0)) / 255;
        const gv2 = ((p.greenValue as number ?? 0)) / 255;
        const bv3 = ((p.blueValue as number ?? 0)) / 255;
        if (op === 'add') {
          filters.push(`geq=r='clip(r(X\\,Y)/255+${rv.toFixed(3)}\\,0\\,1)*255':g='clip(g(X\\,Y)/255+${gv2.toFixed(3)}\\,0\\,1)*255':b='clip(b(X\\,Y)/255+${bv3.toFixed(3)}\\,0\\,1)*255'`);
        } else if (op === 'subtract') {
          filters.push(`geq=r='clip(r(X\\,Y)/255-${rv.toFixed(3)}\\,0\\,1)*255':g='clip(g(X\\,Y)/255-${gv2.toFixed(3)}\\,0\\,1)*255':b='clip(b(X\\,Y)/255-${bv3.toFixed(3)}\\,0\\,1)*255'`);
        } else if (op === 'multiply') {
          const rm = Math.max(0.001, 1 + rv); const gm2 = Math.max(0.001, 1 + gv2); const bm2 = Math.max(0.001, 1 + bv3);
          filters.push(`geq=r='clip(r(X\\,Y)/255*${rm.toFixed(3)}\\,0\\,1)*255':g='clip(g(X\\,Y)/255*${gm2.toFixed(3)}\\,0\\,1)*255':b='clip(b(X\\,Y)/255*${bm2.toFixed(3)}\\,0\\,1)*255'`);
        }
        break;
      }
      case 'solid-composite': {
        const p = fx.filterParams || {};
        const col2 = (p.color as string ?? '#000000').replace('#', '').padEnd(6, '0');
        const op2 = Math.max(0, Math.min(1, ((p.opacity as number ?? 50)) / 100));
        const ri = (parseInt(col2.slice(0, 2), 16) / 255) * op2;
        const gi2 = (parseInt(col2.slice(2, 4), 16) / 255) * op2;
        const bi2 = (parseInt(col2.slice(4, 6), 16) / 255) * op2;
        filters.push(`geq=r='clip(r(X\\,Y)/255*(1-${op2.toFixed(3)})+${ri.toFixed(3)}\\,0\\,1)*255':g='clip(g(X\\,Y)/255*(1-${op2.toFixed(3)})+${gi2.toFixed(3)}\\,0\\,1)*255':b='clip(b(X\\,Y)/255*(1-${op2.toFixed(3)})+${bi2.toFixed(3)}\\,0\\,1)*255'`);
        break;
      }
      case 'dust-and-scratches': {
        const p = fx.filterParams || {};
        const r2 = Math.max(1, Math.min(5, Math.round(p.radius as number ?? 1)));
        filters.push(`median=radius=${r2}`);
        break;
      }
      case 'noise-hls': {
        const p = fx.filterParams || {};
        const ln = Math.round(Math.max(0, ((p.lightnessNoise as number ?? 0))) / 2);
        const sn = Math.round(Math.max(0, ((p.saturationNoise as number ?? 0))) / 2);
        const n2 = Math.max(ln, sn);
        if (n2 > 0) filters.push(`noise=alls=${n2}:allf=t+u`);
        break;
      }
      case 'noise-alpha': {
        const p = fx.filterParams || {};
        const an = Math.round(Math.max(0, ((p.amount as number ?? 50))) / 2);
        if (an > 0) filters.push(`noise=c3s=${an}:c3f=t+u`);
        break;
      }
      case 'color-emboss': {
        filters.push(`convolution=0m=-2 -1 0 -1 1 1 0 1 2:1m=-2 -1 0 -1 1 1 0 1 2:2m=-2 -1 0 -1 1 1 0 1 2:3m=0 0 0 0 1 0 0 0 0`);
        break;
      }
      case 'sdr-conform': {
        const p = fx.filterParams || {};
        const alg = (p.toneMapping as string ?? 'hable');
        filters.push(`tonemap=${alg}`);
        break;
      }
      case 'drop-shadow': {
        // Drop shadow requires filter_complex (split+blur+overlay); approximate with vignette
        const p = fx.filterParams || {};
        const softness = Math.max(0.5, ((p.softness as number ?? 5)) / 10);
        filters.push(`gblur=sigma=${softness.toFixed(1)}`);
        break;
      }
      case 'strobe-light':
      case 'strobe-effect': {
        const p = fx.filterParams || {};
        const fr2 = Math.max(1, Math.min(30, Math.round(1 / Math.max(0.033, (p.duration as number ?? 0.05)))));
        filters.push(`fps=${fr2}`);
        break;
      }
      case 'gradient-wipe-effect': {
        // Approximate gradient wipe as a partial brightness ramp
        filters.push(`curves=master='0/0 0.5/0.4 1/1'`);
        break;
      }
      case 'calculations': {
        const p = fx.filterParams || {};
        const srcCh = (p.sourceChannel as string ?? 'red');
        const tgtCh = (p.targetChannel as string ?? 'green');
        // Approximate: add source channel to target via colorchannelmixer
        const rr2 = 1; const rg3 = (tgtCh === 'red' && srcCh === 'green') ? 1 : 0; const rb3 = (tgtCh === 'red' && srcCh === 'blue') ? 1 : 0;
        const gr3 = (tgtCh === 'green' && srcCh === 'red') ? 1 : 0; const gg3 = 1; const gb3 = (tgtCh === 'green' && srcCh === 'blue') ? 1 : 0;
        const br4 = (tgtCh === 'blue' && srcCh === 'red') ? 1 : 0; const bg4 = (tgtCh === 'blue' && srcCh === 'green') ? 1 : 0; const bb3 = 1;
        filters.push(`colorchannelmixer=${rr2}:${rg3}:${rb3}:0:${gr3}:${gg3}:${gb3}:0:${br4}:${bg4}:${bb3}:0`);
        break;
      }
    }
  }
  return filters;
}

/** Audio filter strings for ClipEffect[] type='audio-effect' */
function buildAudioEffectFilters(effects: ExportClip['effects']): string[] {
  if (!effects) return [];
  const filters: string[] = [];
  for (const fx of effects) {
    if (!fx.enabled || fx.type !== 'audio-effect') continue;
    if (fx.audioEffectType === 'eq' || fx.audioEffectType === 'equalizer') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      if (p.low) filters.push(`equalizer=f=320:t=h:w=200:g=${p.low}`);
      if (p.mid) filters.push(`equalizer=f=1000:t=q:w=0.5:g=${p.mid}`);
      if (p.high) filters.push(`equalizer=f=3200:t=h:w=200:g=${p.high}`);
    } else if (fx.audioEffectType === 'compressor') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      filters.push(
        `acompressor=threshold=${p.threshold ?? -24}dB:ratio=${p.ratio ?? 4}` +
        `:attack=${((p.attack ?? 5) / 1000).toFixed(4)}:release=${((p.release ?? 50) / 1000).toFixed(4)}`
      );
    } else if (fx.audioEffectType === 'reverb' || fx.audioEffectType === 'studio-reverb' || fx.audioEffectType === 'convolution-reverb') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const delay = Math.round(p.delay ?? 300);
      const decay = Math.min(0.9, (p.wetLevel ?? 40) / 100);
      filters.push(`aecho=0.8:${(1 - decay).toFixed(2)}:${delay}|${delay * 1.5}|${delay * 2}:${decay}|${decay * 0.6}|${decay * 0.3}`);
    } else if (fx.audioEffectType === 'delay' || fx.audioEffectType === 'analog-delay') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const delayMs = Math.round(p.delay ?? 500);
      const feedback = Math.min(0.9, (p.feedback ?? 30) / 100);
      filters.push(`aecho=0.6:${(1 - feedback).toFixed(2)}:${delayMs}:${feedback.toFixed(2)}`);
    } else if (fx.audioEffectType === 'chorus') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const depth = Math.max(0.1, (p.depth ?? 40) / 100);
      const rate = Math.max(0.1, (p.rate ?? 1.5));
      filters.push(`chorus=0.5:0.9:${Math.round(p.delay ?? 50)}|${Math.round((p.delay ?? 50) * 1.3)}:${depth.toFixed(2)}|${(depth * 0.8).toFixed(2)}:${rate.toFixed(2)}|${(rate * 0.7).toFixed(2)}:s`);
    } else if (fx.audioEffectType === 'flanger') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      filters.push(`flanger=delay=${p.delay ?? 0}:depth=${p.depth ?? 2}:regen=${p.feedback ?? 0}:width=71:speed=${p.rate ?? 0.5}:phase=25:interp=linear`);
    } else if (fx.audioEffectType === 'phaser') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      filters.push(`aphaser=in_gain=0.4:out_gain=0.74:delay=${p.delay ?? 3}:decay=${p.decay ?? 0.4}:speed=${p.rate ?? 0.5}:type=t`);
    } else if (fx.audioEffectType === 'amplify') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const gain = p.gain ?? 0;
      if (gain !== 0) filters.push(`volume=${gain}dB`);
    } else if (fx.audioEffectType === 'hard-limiter') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const limitDb = p.limit ?? -0.1;
      const limitLin = Math.pow(10, limitDb / 20);
      filters.push(`alimiter=limit=${limitLin.toFixed(4)}:attack=5:release=50:level=disabled`);
    } else if (fx.audioEffectType === 'dynamics' || fx.audioEffectType === 'tube-compressor' || fx.audioEffectType === 'single-band-compressor' || fx.audioEffectType === 'multiband-compressor') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const knee = fx.audioEffectType === 'tube-compressor' ? ':knee=6' : '';
      filters.push(
        `acompressor=threshold=${p.threshold ?? -24}dB:ratio=${p.ratio ?? 4}${knee}` +
        `:attack=${((p.attack ?? 5) / 1000).toFixed(4)}:release=${((p.release ?? 50) / 1000).toFixed(4)}`
      );
    } else if (fx.audioEffectType === 'bass') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const gain = p.gain ?? 0;
      if (gain !== 0) filters.push(`bass=gain=${gain}:frequency=${p.frequency ?? 100}:width_type=h:width=200`);
    } else if (fx.audioEffectType === 'treble') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const gain = p.gain ?? 0;
      if (gain !== 0) filters.push(`treble=gain=${gain}:frequency=${p.frequency ?? 3000}:width_type=h:width=2000`);
    } else if (fx.audioEffectType === 'notch-filter') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      filters.push(`bandreject=frequency=${p.frequency ?? 1000}:width_type=q:width=${p.q ?? 10}`);
    } else if (fx.audioEffectType === 'denoise' || fx.audioEffectType === 'noise-reduction' || fx.audioEffectType === 'adaptive-noise-reduction') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const strength = (p.strength ?? 50) / 100;
      const nf = Math.round(-10 - strength * 30);
      const nt = fx.audioEffectType === 'adaptive-noise-reduction' ? ':nt=w' : '';
      filters.push(`afftdn=nf=${nf}${nt}`);
    } else if (fx.audioEffectType === 'dehummer') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      filters.push(`bandreject=frequency=${p.frequency ?? 50}:width_type=o:width=1`);
    } else if (fx.audioEffectType === 'de-esser') {
      filters.push(`equalizer=f=7500:t=o:w=1:g=-6`);
    } else if (fx.audioEffectType === 'stereo-expander') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      filters.push(`extrastereo=m=${Math.max(0, (p.amount ?? 50) / 25)}`);
    } else if (fx.audioEffectType === 'swap-channels') {
      filters.push(`pan=stereo|c0=c1|c1=c0`);
    } else if (fx.audioEffectType === 'fill-left-right') {
      filters.push(`pan=stereo|c0=c0+c1|c1=c0+c1`);
    } else if (fx.audioEffectType === 'invert-audio') {
      filters.push(`aeval='-val(0):-val(1)'`);
    } else if (fx.audioEffectType === 'balance') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const bal = Math.max(-1, Math.min(1, (p.balance ?? 0) / 100));
      const leftVol = Math.max(0, 1 - bal).toFixed(4);
      const rightVol = Math.max(0, 1 + bal).toFixed(4);
      filters.push(`pan=stereo|c0=${leftVol}*c0|c1=${rightVol}*c1`);
    } else if (fx.audioEffectType === 'graphic-eq') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const bands: [number, string][] = [[63,'band0'],[125,'band1'],[250,'band2'],[500,'band3'],[1000,'band4'],[2000,'band5'],[4000,'band6'],[8000,'band7'],[16000,'band8']];
      for (const [freq, key] of bands) {
        const gain = p[key] ?? 0;
        if (gain !== 0) filters.push(`equalizer=f=${freq}:t=o:w=1:g=${gain}`);
      }
    } else if (fx.audioEffectType === 'parametric-eq') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      for (let band = 1; band <= 4; band++) {
        const freq = p[`freq${band}`];
        const gain = p[`gain${band}`];
        const q = p[`q${band}`] ?? 1.0;
        if (freq && gain && gain !== 0) filters.push(`equalizer=f=${freq}:t=q:w=${q}:g=${gain}`);
      }
    } else if (fx.audioEffectType === 'vocal-enhancer') {
      filters.push(`equalizer=f=3000:t=o:w=1:g=3,equalizer=f=10000:t=h:w=3000:g=2`);
    } else if (fx.audioEffectType === 'fft-filter') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      if (p.lowCut) filters.push(`highpass=f=${p.lowCut}`);
      if (p.highCut) filters.push(`lowpass=f=${p.highCut}`);
    } else if (fx.audioEffectType === 'downmixer') {
      filters.push(`pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1`);
    } else if (fx.audioEffectType === 'gain') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      const gainDb = p.gain ?? 0;
      if (gainDb !== 0) filters.push(`volume=${gainDb}dB`);
    } else if (fx.audioEffectType === 'scientific-filter') {
      const p = (fx.audioParams ?? {}) as Record<string, number>;
      if (p.frequency) {
        filters.push(`highpass=f=${p.frequency}`);
      }
    }
  }
  return filters;
}

/** Video fade/transition filter strings — applied after resolution scale */
/**
 * Spatial intra-clip transition filters (zoom, blur). These must run BEFORE
 * the output-resolution scale so that the downstream `scale=W:H:FOAR=decrease`
 * upscales the cropped/blurred region back to the final output size.
 */
function buildSpatialTransitionVideoFilters(
  effects: ExportClip['effects'],
  clipDuration: number,
  outW: number,
  outH: number,
  fps: number,
): string[] {
  if (!effects) return [];
  const filters: string[] = [];
  for (const fx of effects) {
    if (!fx.enabled || fx.type !== 'transition') continue;
    const dur = fx.transitionDuration ?? 0.5;
    const pos = fx.transitionPosition ?? 'start';
    const fadeOutStart = Math.max(0, clipDuration - dur).toFixed(4);
    const t = fx.transitionType;
    if (t === 'zoom' || t === 'cross-zoom' || t === 'zoom-basic' || t === 'multi-spin') {
      // Animate zoom via the `zoompan` filter. zoompan uses `on` (output frame
      // number) inside its `z` expression and requires LITERAL output
      // dimensions in `s` (it does not accept `iw`/`ih`). We pass the project
      // output W×H and fps so the animation is sized correctly.
      const maxZoom = (fx.filterParams?.scale as number | undefined) ?? 1.2;
      const startFrames = Math.max(1, Math.round(dur * fps));
      const endStartFrame = Math.max(0, Math.round((clipDuration - dur) * fps));
      const endFrames = Math.max(1, Math.round(dur * fps));
      const zParts: string[] = [];
      if (pos === 'start' || pos === 'both') {
        // ramp maxZoom → 1 over the first `startFrames` frames
        zParts.push(`if(lte(on,${startFrames}),${maxZoom}-(${maxZoom}-1)*on/${startFrames},1)`);
      }
      if (pos === 'end' || pos === 'both') {
        // ramp 1 → maxZoom over the last `endFrames` frames
        zParts.push(`if(gte(on,${endStartFrame}),1+(${maxZoom}-1)*(on-${endStartFrame})/${endFrames},1)`);
      }
      const zExpr = zParts.length === 1 ? zParts[0] : `max(${zParts.join(',')})`;
      // d=1 means produce 1 output frame per input frame (no still-image zoom).
      // x/y center the zoom on the middle of the frame.
      //
      // CRITICAL: zoompan retimes its output to its `fps` parameter. If the
      // input frame rate differs (e.g. source is 60fps but project is 30fps),
      // the duration of the segment is stretched or squeezed → visible
      // slow-/fast-motion. Force the input rate to match `fps` first.
      filters.push(`fps=${fps}`);
      filters.push(
        `zoompan=z='${zExpr}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${outW}x${outH}:fps=${fps}`
      );
    } else if (t === 'blur' || t === 'blur-transition') {
      const maxBlur = Math.max(1, ((fx.filterParams?.intensity as number | undefined) ?? 20) / 2);
      const STEPS = 10;
      const cmds: string[] = [];
      if (pos === 'start' || pos === 'both') {
        for (let i = 0; i <= STEPS; i++) {
          const tt = (i / STEPS) * dur;
          const sigma = maxBlur * (1 - i / STEPS);
          cmds.push(`${tt.toFixed(4)} gblur sigma ${sigma.toFixed(2)}`);
        }
      }
      if (pos === 'end' || pos === 'both') {
        const startT = clipDuration - dur;
        for (let i = 0; i <= STEPS; i++) {
          const tt = startT + (i / STEPS) * dur;
          const sigma = maxBlur * (i / STEPS);
          cmds.push(`${tt.toFixed(4)} gblur sigma ${sigma.toFixed(2)}`);
        }
      }
      if (pos === 'both') cmds.push(`${dur.toFixed(4)} gblur sigma 0`);
      filters.push(`sendcmd=c='${cmds.join(';')}',gblur=sigma=0`);
    }
  }
  return filters;
}

function buildTransitionVideoFilters(effects: ExportClip['effects'], clipDuration: number): string[] {
  if (!effects) return [];
  const filters: string[] = [];
  for (const fx of effects) {
    if (!fx.enabled || fx.type !== 'transition') continue;
    const dur = fx.transitionDuration ?? 0.5;
    const pos = fx.transitionPosition ?? 'start';
    const fadeOutStart = Math.max(0, clipDuration - dur).toFixed(4);
    const t = fx.transitionType;
    if (t === 'fade' || t === 'dissolve' || t === 'dip-to-black') {
      if (pos === 'start' || pos === 'both') filters.push(`fade=t=in:st=0:d=${dur}`);
      if (pos === 'end' || pos === 'both') filters.push(`fade=t=out:st=${fadeOutStart}:d=${dur}`);
    } else if (t === 'dip-to-white') {
      if (pos === 'start' || pos === 'both') filters.push(`fade=t=in:st=0:d=${dur}:color=white`);
      if (pos === 'end' || pos === 'both') filters.push(`fade=t=out:st=${fadeOutStart}:d=${dur}:color=white`);
    }
    // zoom/blur are spatial transitions and are handled in
    // `buildSpatialTransitionVideoFilters` (which must run BEFORE the
    // output-resolution scale).
    // slide/wipe and other complex types are handled at the junction xfade layer
    // (XFADE_MAP). Intra-clip approximations would require splitting the clip,
    // which is out of scope for this filter helper.
  }
  return filters;
}

/** Audio fade/transition filter strings */
function buildTransitionAudioFilters(effects: ExportClip['effects'], clipDuration: number): string[] {
  if (!effects) return [];
  const filters: string[] = [];
  for (const fx of effects) {
    if (!fx.enabled || fx.type !== 'transition') continue;
    const dur = fx.transitionDuration ?? 0.5;
    const pos = fx.transitionPosition ?? 'start';
    const fadeOutStart = Math.max(0, clipDuration - dur).toFixed(4);
    if (
      fx.transitionType === 'fade' || fx.transitionType === 'dissolve' ||
      fx.transitionType === 'dip-to-black' || fx.transitionType === 'dip-to-white'
    ) {
      if (pos === 'start' || pos === 'both') filters.push(`afade=t=in:st=0:d=${dur}`);
      if (pos === 'end' || pos === 'both') filters.push(`afade=t=out:st=${fadeOutStart}:d=${dur}`);
    }
  }
  return filters;
}

// ==================== ASS Subtitle Generator ====================

function hexToAssBGR(hex: string, alpha = 0): string {
  const h = hex.replace('#', '').padEnd(6, '0');
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  const aa = Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase();
  return `&H${aa}${b}${g}${r}`.toUpperCase();
}

function toAssAlignment(
  verticalAlign?: 'top' | 'middle' | 'bottom',
  alignment?: 'left' | 'center' | 'right'
): number {
  const col = alignment === 'left' ? 0 : alignment === 'right' ? 2 : 1;
  const row = verticalAlign === 'top' ? 6 : verticalAlign === 'middle' ? 3 : 0;
  return 1 + col + row;
}

function toAssTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.round((s % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

interface SubClip {
  startTime: number;
  endTime: number;
  text?: string;
  style?: {
    fontSize?: number;
    fontFamily?: string;
    fontColor?: string;
    backgroundColor?: string;
    backgroundOpacity?: number;
    position?: { x: number; y: number };
    alignment?: 'left' | 'center' | 'right';
    verticalAlign?: 'top' | 'middle' | 'bottom';
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
    stroke?: { color: string; width: number };
    dropShadow?: { color: string; offsetX: number; offsetY: number; blur: number };
    letterSpacing?: number;
    lineHeight?: number;
    textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  };
}

function buildAssContent(subs: SubClip[], width: number, height: number): string {
  // No scale needed — preview now renders at project resolution ratio
  const assHeader = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Default style: white text, semi-transparent black background (BorderStyle=3 = opaque box)
    // MarginL/MarginR = 10% of width for ~80% maxWidth wrapping (matching preview)
    `Style: Default,Arial,24,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,3,2,0,2,${Math.round(width * 0.1)},${Math.round(width * 0.1)},30,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  const assEvents = subs.map((sub) => {
    const style = sub.style;
    const tags: string[] = [];

    if (style) {
      // Use \an5 (middle-center anchor) + \pos(x,y) to centre the box at (x%,y%).
      // This matches the preview compositor which uses translate(-50%,-50%) at
      // left=x%, top=y% — the element centre sits exactly at the percentage point.
      // toAssAlignment is kept for the text justification within the box (not for
      // anchor position — \an5 overrides that); we emit \q2 for left-justify only.
      tags.push('\\an5');

      if (style.position) {
        const px = Math.round((style.position.x / 100) * width);
        const py = Math.round((style.position.y / 100) * height);
        tags.push(`\\pos(${px},${py})`);
      }

      // Font
      if (style.fontSize) tags.push(`\\fs${Math.round(style.fontSize)}`);
      if (style.fontFamily) tags.push(`\\fn${style.fontFamily}`);
      if (style.fontColor) tags.push(`\\c${hexToAssBGR(style.fontColor)}&`);
      if (style.fontWeight === 'bold') tags.push('\\b1');
      if (style.fontStyle === 'italic') tags.push('\\i1');

      // Background (ASS BorderStyle=3 = opaque box, \\4c = box colour, \\4a = box alpha).
      // paddingX/paddingY are approximated via \\bord — ASS padding is not per-axis,
      // so we take the larger of the two and use it as the symmetric border width.
      if (style.backgroundColor) {
        const bgAlpha = 1 - (style.backgroundOpacity ?? 0.7); // ASS alpha: 0=opaque, 1=transparent
        tags.push(`\\4c${hexToAssBGR(style.backgroundColor)}&`);
        tags.push(`\\4a&H${Math.round(bgAlpha * 255).toString(16).padStart(2, '0').toUpperCase()}&`);
        const padX = style.paddingX ?? 12;
        const padY = style.paddingY ?? 4;
        const bord = Math.max(padX, padY, 2);
        tags.push(`\\bord${bord}`);
      }

      // Outline/stroke (overrides bord set above if stroke is present — stroke takes priority)
      if (style.stroke) {
        tags.push(`\\3c${hexToAssBGR(style.stroke.color)}&`);
        tags.push(`\\bord${style.stroke.width}`);
      }

      // Drop shadow
      if (style.dropShadow) {
        tags.push(`\\shad${Math.round(style.dropShadow.blur)}`);
        // Shadow colour goes to \\4c; if we already set it for background, this
        // will override it — acceptable for clips that have a shadow but no bg.
        if (!style.backgroundColor) {
          tags.push(`\\4c${hexToAssBGR(style.dropShadow.color)}&`);
        }
      }

      // Letter spacing
      if (style.letterSpacing) tags.push(`\\fsp${style.letterSpacing}`);
    }

    const overrideTags = tags.length > 0 ? `{${tags.join('')}}` : '';
    let text = (sub.text || '').replace(/\n/g, '\\N');

    // Text transform
    if (style?.textTransform === 'uppercase') text = text.toUpperCase();
    else if (style?.textTransform === 'lowercase') text = text.toLowerCase();

    return `Dialogue: 0,${toAssTime(sub.startTime)},${toAssTime(sub.endTime)},Default,,0,0,0,,${overrideTags}${text}`;
  }).join('\n');

  return assHeader + '\n' + assEvents + '\n';
}

// ==================== FFmpeg Command Builder ====================

function buildFFmpegArgs(request: ExportRequest, sourcesWithAudio?: Set<string>): string[] {
  const args: string[] = ['-y']; // Overwrite output

  // ── Determine base track vs overlay tracks ──────────────────────────────────
  // Preview compositing model: tracks[0] = top layer, tracks[N-1] = bottom layer.
  // The base video = the clip from the bottom-most (highest-index) visible video
  // track that contains at least one non-image clip. Everything else is an overlay.
  //
  // request.tracks preserves the store order (index 0 = top-most layer).
  const visibleVideoTracks = request.tracks
    .filter((t) => t.type === 'video' && !t.muted)
    .map((t, storeIndex) => ({ track: t, storeIndex }));

  // Bottom-most visible video track that has at least one non-image video clip
  let baseTrackId: string | null = null;
  for (let i = visibleVideoTracks.length - 1; i >= 0; i--) {
    const { track } = visibleVideoTracks[i];
    const hasRealVideo = track.clips.some(
      (c) => (c.type === 'video' || c.mediaType !== 'image') && c.mediaType !== 'image' && c.sourceUrl,
    );
    if (hasRealVideo) {
      baseTrackId = track.id;
      break;
    }
  }

  // Collect overlay clips: clips on non-base video tracks + image clips on the base track
  const overlayTracks: OverlayTrack[] = [];
  for (const { track, storeIndex } of visibleVideoTracks) {
    const isBaseTrack = track.id === baseTrackId;
    const overlayClips: OverlayClip[] = track.clips.filter((c) => {
      if (!c.sourceUrl) return false;
      // On the base track: only image clips become overlays (real video is handled by base)
      if (isBaseTrack) return c.mediaType === 'image';
      // On non-base tracks: all video/image clips are overlays
      return c.type === 'video' || c.mediaType === 'image';
    }).map((c) => ({
      id: c.id,
      mediaType: c.mediaType,
      startTime: c.startTime,
      endTime: c.endTime,
      sourceStartTime: c.sourceStartTime,
      sourceEndTime: c.sourceEndTime,
      sourceUrl: c.sourceUrl,
      sourceWidth: c.sourceWidth,
      sourceHeight: c.sourceHeight,
      speed: c.speed,
      muted: c.muted,
      effects: c.effects,
      transform: c.transform,
      blendMode: c.blendMode,
    }));

    if (overlayClips.length > 0) {
      overlayTracks.push({ id: track.id, trackIndex: storeIndex, clips: overlayClips });
    }
  }

  const hasOverlays = overlayTracks.length > 0;

  // Collect base track clips (non-image video clips on the base track)
  const baseTrack = request.tracks.find((t) => t.id === baseTrackId);
  const baseVideoClips = baseTrack
    ? baseTrack.clips.filter(
        (c) => (c.type === 'video' || c.mediaType !== 'image') && c.mediaType !== 'image' && c.sourceUrl,
      )
    : [];

  // For the "flat" path (no overlays), collect all video clips across all tracks
  // (existing behaviour — flatten everything into one concat list).
  const videoClips = hasOverlays
    ? baseVideoClips
    : request.tracks
        .filter((t) => t.type === 'video' && !t.muted)
        .flatMap((t) => t.clips.filter((c) => (c.type === 'video' || c.mediaType === 'image') && c.sourceUrl));

  const audioClips = request.tracks
    .filter((t) => (t.type === 'audio' || t.type === 'music') && !t.muted)
    .flatMap((t) =>
      t.clips.filter((c) => (c.type === 'audio' || c.type === 'music') && c.sourceUrl && !c.muted)
    );

  // If no video clips, create a black background
  if (videoClips.length === 0 && !hasOverlays) {
    args.push(
      '-f', 'lavfi',
      '-i', `color=c=black:s=${request.width}x${request.height}:d=${request.duration}:r=${request.frameRate}`
    );
  }

  // Add each video clip as input
  const inputMap: Map<string, number> = new Map();
  let inputIndex = (videoClips.length === 0 && !hasOverlays) ? 1 : 0;

  for (const clip of videoClips) {
    if (!inputMap.has(clip.sourceUrl)) {
      if (clip.mediaType === 'image') {
        // Still image: loop indefinitely, duration controlled by trim filter.
        // -f image2 forces the image2 demuxer regardless of file extension
        // (image assets may be downloaded with .mp4 extension due to unknown MIME type).
        // -framerate is recognized by image2 demuxer and sets the loop frame rate.
        args.push('-loop', '1', '-f', 'image2', '-framerate', String(request.frameRate));
      }
      args.push('-i', clip.sourceUrl);
      inputMap.set(clip.sourceUrl, inputIndex++);
    }
  }

  // Add audio clip inputs
  for (const clip of audioClips) {
    if (!inputMap.has(clip.sourceUrl)) {
      args.push('-i', clip.sourceUrl);
      inputMap.set(clip.sourceUrl, inputIndex++);
    }
  }

  // Overlay inputs are registered lazily inside buildOverlayCompositor via extraInputArgs.
  // Those args must be prepended before the corresponding -i index is referenced, so we
  // collect them into a staging array and splice into `args` after building the filter.

  // When there are overlays we always use filter_complex (complex mode), regardless of
  // how many base clips there are. The simple mode fast-path is only available when there
  // are zero overlay clips AND at most 1 base video + 1 audio track.
  const hasSubtitleOverlays = !!(request.subtitleOverlays && request.subtitleOverlays.length > 0);
  const useSimpleMode = !hasOverlays && !hasSubtitleOverlays && videoClips.length <= 1 && audioClips.length <= 1;

  // If only one video and one audio from same source (simple case)
  if (useSimpleMode) {
    // Simple mode - just apply trim + effects
    const vClip = videoClips[0];
    if (vClip) {
      const speed = vClip.speed || 1;
      const filters: string[] = [];

      // Trim
      const clipOutputDuration = vClip.endTime - vClip.startTime;
      if (vClip.mediaType === 'image') {
        // Still image: duration controlled via filter (loop input has no natural end).
        // fps filter is added only for non-GIF; GIF prepends fps=10 separately later.
        filters.push(`trim=end=${clipOutputDuration}`);
        filters.push('setpts=PTS-STARTPTS');
        if (request.format !== 'gif') {
          filters.push(`fps=${request.frameRate}`);
        }
      } else {
        args.push('-ss', String(vClip.sourceStartTime));
        args.push('-t', String(clipOutputDuration));
      }

      // Speed
      if (speed !== 1 && vClip.mediaType !== 'image') {
        filters.push(`setpts=${1 / speed}*PTS`);
      }

      // Effects
      filters.push(...buildEffectFilters(vClip.effects));

      // Transform
      if (vClip.transform) {
        const t = vClip.transform;
        if (t.rotation !== 0) filters.push(`rotate=${t.rotation * Math.PI / 180}`);
        if (t.scale !== 1) filters.push(`scale=iw*${t.scale}:ih*${t.scale}`);
      }

      // Spatial transitions (zoom/blur) — must run BEFORE the output scale.
      filters.push(...buildSpatialTransitionVideoFilters(vClip.effects, clipOutputDuration, request.width, request.height, request.frameRate));

      // Scale to output resolution. Use trunc(...÷2)*2 to force even dimensions
      // (H.264/265 requires width & height to be divisible by 2).
      const sw = `trunc(${request.width}/2)*2`;
      const sh = `trunc(${request.height}/2)*2`;
      filters.push(`scale=${sw}:${sh}:force_original_aspect_ratio=decrease`);
      filters.push(`pad=${sw}:${sh}:(ow-iw)/2:(oh-ih)/2`);
      filters.push('setsar=1');
      filters.push('format=yuv420p');
      filters.push(`fps=${request.frameRate}`);

      // Temporal transitions (fade/dissolve/dip) — timing-based, safe after scale.
      filters.push(...buildTransitionVideoFilters(vClip.effects, clipOutputDuration));

      // Adjustment track effects (applied on top of video, regardless of clip timing)
      const adjEffects = request.tracks
        .filter((t) => t.type === 'adjustment' && !t.muted)
        .flatMap((t) => t.clips.flatMap((c) => c.effects ?? []));
      filters.push(...buildEffectFilters(adjEffects));

      // Check for effects requiring filter_complex (glow, chroma-key)
      const needsFilterComplex = vClip.effects?.some(fx =>
        fx.enabled && (fx.filterType === 'glow' || fx.filterType === 'chroma-key')
      ) ?? false;

      const glowFxS = vClip.effects?.find(fx => fx.enabled && fx.filterType === 'glow');
      const ckFxS = vClip.effects?.find(fx => fx.enabled && fx.filterType === 'chroma-key');

      if (request.format === 'gif') {
        filters.unshift(`fps=10`);
        const gifChain = filters.join(',') + `,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
        args.push('-vf', gifChain);
        args.push('-loop', '0');
      } else if (needsFilterComplex) {
        let chain = `[0:v]${filters.join(',')}`;
        let outLabel = 'outv0';
        if (glowFxS) {
          const sigma = Math.max(1, Math.round((glowFxS.filterIntensity ?? 50) / 10));
          chain += `[pre_glow];[pre_glow]split[ga][gb];[gb]gblur=sigma=${sigma}[gc];[ga][gc]blend=all_mode=addition`;
          outLabel = 'glowout';
        }
        if (ckFxS) {
          const ckP = ckFxS.filterParams || {};
          const keyColor = ((ckP.keyColor as string) ?? '#00FF00').replace('#', '0x');
          const similarity = Math.max(0.01, Math.min(1.0, ((ckP.similarity as number) ?? 40) / 100));
          const blendAmt = Math.max(0, Math.min(1.0, ((ckP.smoothness as number) ?? 8) / 100));
          const ckW = `trunc(${request.width}/2)*2`;
          const ckH = `trunc(${request.height}/2)*2`;
          args.push('-filter_complex',
            `color=c=black:s=${ckW}x${ckH}:r=${request.frameRate}[ckbg];` +
            `[0:v]${filters.join(',')}` +
            `,chromakey=color=${keyColor}:similarity=${similarity.toFixed(3)}:blend=${blendAmt.toFixed(3)}[ckfg];` +
            `[ckbg][ckfg]overlay=format=auto[${outLabel}]`
          );
          args.push('-map', `[${outLabel}]`);
          args.push(...getQualityParams(request.quality, request.format, request.codec, request.proResProfile));
        } else {
          args.push('-filter_complex', `${chain}[${outLabel}]`);
          args.push('-map', `[${outLabel}]`);
          args.push(...getQualityParams(request.quality, request.format, request.codec, request.proResProfile));
        }
      } else {
        // Burn subtitles if available (ASS fallback — skipped when subtitleOverlays is present)
        if (request.includeSubtitles && request.subtitleFormat === 'burned' && !hasSubtitleOverlays) {
          const allSubs = request.tracks
            .filter((t) => t.type === 'subtitle')
            .flatMap((t) => t.clips)
            .filter((c) => c.text)
            .sort((a, b) => a.startTime - b.startTime);

          if (allSubs.length > 0) {
            const assContent = buildAssContent(allSubs as SubClip[], request.width, request.height);
            const assFileName = `iris_subs_${Date.now()}.ass`;
            const assDir = app.getPath('temp');
            const assPath = path.join(assDir, assFileName);
            filters.push(`ass=${assFileName}`);
            (request as any)._ffmpegCwd = assDir;
            (request as any)._assContent = assContent;
            (request as any)._assPath = assPath;
          }
        }
        args.push('-vf', filters.join(','));
        args.push(...getQualityParams(request.quality, request.format, request.codec, request.proResProfile));
      }

      // Audio filter chain: speed + transitions + audio effects (skip for image clips)
      if (vClip.mediaType !== 'image') {
        const afFilters: string[] = [];
        if (speed !== 1) afFilters.push(`atempo=${speed}`);
        afFilters.push(...buildTransitionAudioFilters(vClip.effects, clipOutputDuration));
        afFilters.push(...buildAudioEffectFilters(vClip.effects));
        if (afFilters.length > 0) args.push('-af', afFilters.join(','));
      }
    } else {
      // No video clips - just black background
      args.push(...getQualityParams(request.quality, request.format, request.codec, request.proResProfile));
    }

    // Audio: explicitly map streams to avoid FFmpeg auto-select ambiguity
    // when video and audio come from separate input files.
    const vClipForMap = videoClips[0];
    const aClipForMap = audioClips[0];
    const videoInputIdx = vClipForMap ? inputMap.get(vClipForMap.sourceUrl) ?? 0 : 0;
    const audioInputIdx = aClipForMap ? inputMap.get(aClipForMap.sourceUrl) : undefined;
    // Treat audio clip as absent if its source has no audio stream (e.g. image placed on audio track)
    const aClipHasAudio = aClipForMap
      ? (!sourcesWithAudio || sourcesWithAudio.has(aClipForMap.sourceUrl))
      : false;
    const effectiveAClip = aClipHasAudio ? aClipForMap : undefined;
    const audioFromSeparateFile = audioInputIdx !== undefined && audioInputIdx !== videoInputIdx && aClipHasAudio;

    if (vClipForMap) args.push('-map', `${videoInputIdx}:v:0`);
    // Disable audio when: image clip + no valid audio source
    if (vClipForMap?.mediaType === 'image' && !effectiveAClip) args.push('-an');

    if (audioFromSeparateFile) {
      // Separate audio file: map its audio stream
      args.push('-map', `${audioInputIdx}:a:0`);
      const track = request.tracks.find((t) => t.clips.some((c) => c.id === effectiveAClip!.id));
      const trackVol = track?.volume ?? 1;
      const clipVol = effectiveAClip!.volume ?? 1;
      const totalVol = trackVol * clipVol;
      const afIdx = args.indexOf('-af');
      if (totalVol !== 1) {
        if (afIdx >= 0) {
          args[afIdx + 1] += `,volume=${totalVol}`;
        } else {
          args.push('-af', `volume=${totalVol}`);
        }
      }
    } else if (effectiveAClip && !audioFromSeparateFile) {
      // Audio from same file as video — must explicitly map audio stream
      args.push('-map', `${videoInputIdx}:a:0`);
      const track = request.tracks.find((t) => t.clips.some((c) => c.id === effectiveAClip.id));
      const trackVol = track?.volume ?? 1;
      const clipVol = effectiveAClip.volume ?? 1;
      const totalVol = trackVol * clipVol;
      if (totalVol !== 1) {
        const afIdx = args.indexOf('-af');
        if (afIdx >= 0) {
          args[afIdx + 1] += `,volume=${totalVol}`;
        } else {
          args.push('-af', `volume=${totalVol}`);
        }
      }
    }
  } else {
    // Complex mode — multiple clips or overlay tracks need filter_complex.
    // When hasOverlays=true, the base track goes through the standard concat path
    // (possibly just a single clip or a black canvas), and then overlay clips are
    // composited on top via the buildOverlayCompositor helper.

    // If there are overlays but no base video clips at all, synthesise a black canvas.
    if (hasOverlays && videoClips.length === 0) {
      // We do not push a lavfi input here — instead push a colour filter source
      // directly into the filter_complex string below. Reserve input slot 0 for the
      // first overlay clip so the lavfi black gen goes through filter_complex.
    }

    const filterParts: string[] = [];
    const concatVideoLabels: string[] = [];
    const concatAudioLabels: string[] = [];

    // Check if the video track is muted — if so, skip audio from video sources
    const videoTrack = request.tracks.find((t) => t.id === baseTrackId && !t.muted)
      ?? request.tracks.find((t) => t.type === 'video' && !t.muted);
    const videoTrackMuted = !videoTrack || videoTrack.muted;

    // Sort by timeline position to detect gaps correctly
    const sortedVideoClips = [...videoClips].sort((a, b) => a.startTime - b.startTime);

    // Workflow assumption: when the project has any dedicated audio/music
    // track with clips on it, the user is treating video as visual-only and
    // managing all sound on the audio track. Extracting the video file's
    // embedded audio would double-up with the audio track's audio (the user
    // reported this as overlapping audio from 0s). In that case, suppress
    // per-video-clip audio extraction entirely — only the audio track plays.
    const hasAudioTrackClips = audioClips.length > 0;
    const skipVideoAudioFor = (_vc: ExportClip) => hasAudioTrackClips;

    // Pre-check: include audio in concat ONLY if ALL video clips have an audio stream.
    // If even one clip lacks audio (image, muted, no stream, or skipped because
    // an audio track is present), skip audio entirely to avoid "unconnected
    // output" errors from orphaned audio filter labels (e.g. agap segments
    // that nothing consumes).
    const allClipsHaveAudio = !videoTrackMuted && !hasAudioTrackClips && sortedVideoClips.every(
      (vc) => !vc.muted && (!sourcesWithAudio || sourcesWithAudio.has(vc.sourceUrl))
    );

    let currentTime = 0;
    let segmentIdx = 0;
    const clipDurationList: number[] = []; // output duration of each segment (including gaps)
    const clipLabelToSortedIdx: Map<string, number> = new Map(); // label → sortedVideoClips index

    // When the same source file is referenced by N>1 clips (e.g. after splitting
    // a clip), every chain that starts from `[inputIdx:v]` competes for the same
    // input pad in filter_complex — only the first chain receives frames, so the
    // remaining clips silently inherit the first clip's effects/output.
    // Pre-split each multi-used input into N independent copies so every clip
    // has its own pad. Same treatment for the audio side.
    const videoUseCount = new Map<number, number>();
    const audioUseCount = new Map<number, number>();
    for (const vc of sortedVideoClips) {
      const idx = inputMap.get(vc.sourceUrl);
      if (idx === undefined) continue;
      videoUseCount.set(idx, (videoUseCount.get(idx) ?? 0) + 1);
      if (allClipsHaveAudio && vc.mediaType !== 'image' && !skipVideoAudioFor(vc)) {
        audioUseCount.set(idx, (audioUseCount.get(idx) ?? 0) + 1);
      }
    }
    // External audio/music track clips also consume the same input pad. Count
    // them so the asplit fan-out below has enough copies for everyone.
    for (const ac of audioClips) {
      const idx = inputMap.get(ac.sourceUrl);
      if (idx === undefined) continue;
      if (sourcesWithAudio && !sourcesWithAudio.has(ac.sourceUrl)) continue;
      audioUseCount.set(idx, (audioUseCount.get(idx) ?? 0) + 1);
    }
    const videoSplitQueue = new Map<number, string[]>();
    const audioSplitQueue = new Map<number, string[]>();
    for (const [idx, n] of videoUseCount) {
      if (n <= 1) continue;
      const labels = Array.from({ length: n }, (_, i) => `vsplit${idx}_${i}`);
      filterParts.push(`[${idx}:v]split=${n}${labels.map((l) => `[${l}]`).join('')}`);
      videoSplitQueue.set(idx, labels);
    }
    for (const [idx, n] of audioUseCount) {
      if (n <= 1) continue;
      const labels = Array.from({ length: n }, (_, i) => `asplit${idx}_${i}`);
      filterParts.push(`[${idx}:a]asplit=${n}${labels.map((l) => `[${l}]`).join('')}`);
      audioSplitQueue.set(idx, labels);
    }
    const takeVideoSrcLabel = (idx: number): string => {
      const q = videoSplitQueue.get(idx);
      if (!q || q.length === 0) return `${idx}:v`;
      return q.shift()!;
    };
    const takeAudioSrcLabel = (idx: number): string => {
      const q = audioSplitQueue.get(idx);
      if (!q || q.length === 0) return `${idx}:a`;
      return q.shift()!;
    };

    const XFADE_MAP: Record<string, string> = {
      'slide': 'slideleft', 'zoom': 'zoomin', 'wipe': 'wipeleft',
      'blur-transition': 'hblur', 'blur': 'hblur',
      'dissolve': 'dissolve', 'fade': 'fade', 'dip-to-black': 'fadeblack', 'dip-to-white': 'fadewhite',
      'additive-dissolve': 'distance', 'non-additive-dissolve': 'pixelize', 'film-dissolve': 'fadegrays',
      'tr-iris': 'circlecrop', 'iris': 'circlecrop', 'iris-box': 'rectcrop', 'iris-cross': 'circlecrop',
      'iris-diamond': 'circlecrop', 'iris-star': 'circlecrop', 'iris-points': 'circlecrop',
      'tr-clock-wipe': 'radial', 'tr-gradient-wipe': 'hblur',
      'barn-doors': 'horzopen', 'radial-wipe': 'radial', 'push': 'coverleft',
      'slide-basic': 'slideleft', 'cross-zoom': 'zoomin', 'zoom-basic': 'zoomin', 'multi-spin': 'zoomin',
      'band-slide': 'squeezeh', 'center-split': 'horzopen', 'center-merge': 'horzclose',
      'band-wipe': 'wipetl', 'random-blocks': 'pixelize', 'random-wipe': 'wipetl',
      'wipe-basic': 'wipeleft', 'linear-wipe': 'wipeleft', 'linear-wipe-transition': 'wipeleft',
      'slash-slide': 'diagtl', 'split': 'vertopen', 'swap': 'hlslice',
      'sliding-bands': 'squeezev', 'pinwheel': 'radial', 'venetian-blinds': 'vdslice',
      'checker-wipe': 'pixelize', 'checkerboard-wipe': 'pixelize', 'inset': 'rectcrop',
      'wedge-wipe': 'wipetl', 'whip-turn': 'smoothright',
    };

    // Helper: insert a black video + silent audio gap segment using inline filter sources
    const addGap = (duration: number) => {
      const vLabel = `gap${segmentIdx}`;
      filterParts.push(
        `color=c=black:s=${request.width}x${request.height}:d=${duration}:r=${request.frameRate},setsar=1[${vLabel}]`
      );
      concatVideoLabels.push(`[${vLabel}]`);
      if (allClipsHaveAudio) {
        const aLabel = `agap${segmentIdx}`;
        filterParts.push(
          `anullsrc=channel_layout=stereo:sample_rate=44100,atrim=end=${duration},asetpts=PTS-STARTPTS[${aLabel}]`
        );
        concatAudioLabels.push(`[${aLabel}]`);
      }
      clipDurationList.push(duration);
      segmentIdx++;
    };

    for (const vClip of sortedVideoClips) {
      // Fill any gap before this clip with black frames
      const gapDuration = vClip.startTime - currentTime;
      if (gapDuration > 0.01) addGap(gapDuration);

      const inputIdx = inputMap.get(vClip.sourceUrl)!;
      const label = `v${segmentIdx}`;
      const speed = vClip.speed || 1;
      const trimFilters: string[] = [];

      // Trim to source range (images use loop source — trim by clip duration only)
      const vClipDuration = vClip.mediaType === 'image'
        ? vClip.endTime - vClip.startTime
        : (vClip.sourceEndTime - vClip.sourceStartTime) / speed;
      if (vClip.mediaType === 'image') {
        trimFilters.push(`trim=end=${vClipDuration}`);
        trimFilters.push(`setpts=PTS-STARTPTS`);
        trimFilters.push(`fps=${request.frameRate}`);
      } else {
        trimFilters.push(`trim=start=${vClip.sourceStartTime}:end=${vClip.sourceEndTime}`);
        trimFilters.push(`setpts=PTS-STARTPTS`);
        // Speed adjustment
        if (speed !== 1) {
          trimFilters.push(`setpts=${1 / speed}*PTS`);
        }
      }

      // Order: trim → speed → transform → effects → resolution normalize → transitions
      // 1. Transform (applied to source dimensions, before resolution scale)
      if (vClip.transform) {
        const t = vClip.transform;
        if (t.rotation !== 0) trimFilters.push(`rotate=${t.rotation * Math.PI / 180}`);
        if (t.scale !== 1) trimFilters.push(`scale=iw*${t.scale}:ih*${t.scale}`);
      }

      // 2. Effects (color/style filters)
      trimFilters.push(...buildEffectFilters(vClip.effects));

      // 3. Spatial transitions (zoom/blur) — must run BEFORE the output scale
      // so the downstream scale upscales the cropped/blurred region back to
      // the final output dimensions.
      trimFilters.push(...buildSpatialTransitionVideoFilters(vClip.effects, vClipDuration, request.width, request.height, request.frameRate));

      // 4. Scale to output resolution. Force even dimensions for H.264/265 compatibility.
      const sw = `trunc(${request.width}/2)*2`;
      const sh = `trunc(${request.height}/2)*2`;
      trimFilters.push(`scale=${sw}:${sh}:force_original_aspect_ratio=decrease`);
      trimFilters.push(`pad=${sw}:${sh}:(ow-iw)/2:(oh-ih)/2`);
      trimFilters.push(`setsar=1`);
      // Normalize pixel format AND frame rate so the downstream xfade-with-black
      // step (and junction xfade) accepts the clip — xfade requires matching
      // dimensions, pixel format AND frame rate on both inputs. Without `fps=`
      // here, source clips at e.g. 60fps would mismatch the 30fps black canvas
      // and xfade silently produces no frames → "Nothing was written" error.
      trimFilters.push(`format=yuv420p`);
      trimFilters.push(`fps=${request.frameRate}`);

      // 5. Temporal transitions (fade/dissolve/dip) — timing-based, safe after scale
      trimFilters.push(...buildTransitionVideoFilters(vClip.effects, vClipDuration));

      const vSrcLabel = takeVideoSrcLabel(inputIdx);
      filterParts.push(`[${vSrcLabel}]${trimFilters.join(',')}[${label}]`);
      concatVideoLabels.push(`[${label}]`);

      // Handle glow effect (requires split/blend — cannot be in linear chain)
      const glowFx = vClip.effects?.find(fx => fx.enabled && fx.filterType === 'glow');
      if (glowFx) {
        const sigma = Math.max(1, Math.round((glowFx.filterIntensity ?? 50) / 10));
        const ga = `${label}ga`, gb = `${label}gb`, gc = `${label}gc`, glowOut = `${label}glow`;
        filterParts.push(
          `[${label}]split[${ga}][${gb}];[${gb}]gblur=sigma=${sigma}[${gc}];[${ga}][${gc}]blend=all_mode=addition[${glowOut}]`
        );
        concatVideoLabels[concatVideoLabels.length - 1] = `[${glowOut}]`;
      }

      // ── Intra-clip xfade transitions vs a black canvas ──────────────────
      // Many transition types (slide/wipe/iris/push/film-dissolve/...) cannot
      // be expressed as a single linear filter, but xfade supports them all
      // and works between any two streams of matching size/timebase. So for
      // each non-fade, non-zoom, non-blur transition placed on this clip we
      // build a black canvas and xfade between it and the clip:
      //   start: black → clip (offset=0, dur=transitionDuration)
      //   end:   clip  → black (offset=clipDur-dur)
      // Multiple transitions chain through tmp labels.
      //
      // fade/dissolve/dip-* are already done via the `fade` filter inside the
      // trim chain. zoom/blur are done via zoompan/sendcmd. We skip those here
      // to avoid double-applying.
      const NON_XFADE_HANDLED = new Set([
        'fade', 'dissolve', 'dip-to-black', 'dip-to-white',
        'zoom', 'cross-zoom', 'zoom-basic', 'multi-spin',
        'blur', 'blur-transition',
      ]);
      const xfadeFxList = (vClip.effects ?? []).filter(
        (fx) =>
          fx.enabled &&
          fx.type === 'transition' &&
          fx.transitionType &&
          fx.transitionType in XFADE_MAP &&
          !NON_XFADE_HANDLED.has(fx.transitionType)
      );
      if (xfadeFxList.length > 0) {
        // color filter's `s=` option requires a literal WxH — expressions like
        // `trunc(.../2)*2` are NOT accepted. Pre-compute even-aligned ints.
        const outW = Math.floor(request.width / 2) * 2;
        const outH = Math.floor(request.height / 2) * 2;
        const fps = request.frameRate;
        const lastLabel = () => concatVideoLabels[concatVideoLabels.length - 1].slice(1, -1);
        let xfStep = 0;
        for (const fx of xfadeFxList) {
          const xfType = XFADE_MAP[fx.transitionType!];
          const dur = Math.min(vClipDuration, fx.transitionDuration ?? 0.5);
          const pos = fx.transitionPosition ?? 'start';
          if (pos === 'start' || pos === 'both') {
            const bgLabel = `${label}xfbg${xfStep}`;
            const outLabel = `${label}xfs${xfStep}`;
            // Black canvas matches the clip's size/fps, with the same yuv420p
            // pixel format so xfade doesn't reject the inputs.
            filterParts.push(
              `color=c=black:s=${outW}x${outH}:d=${vClipDuration.toFixed(4)}:r=${fps},setsar=1,format=yuv420p[${bgLabel}]`
            );
            filterParts.push(
              `[${bgLabel}][${lastLabel()}]xfade=transition=${xfType}:duration=${dur.toFixed(4)}:offset=0[${outLabel}]`
            );
            concatVideoLabels[concatVideoLabels.length - 1] = `[${outLabel}]`;
            xfStep++;
          }
          if (pos === 'end' || pos === 'both') {
            const bgLabel = `${label}xfbg${xfStep}`;
            const outLabel = `${label}xfe${xfStep}`;
            const offset = Math.max(0, vClipDuration - dur);
            filterParts.push(
              `color=c=black:s=${outW}x${outH}:d=${dur.toFixed(4)}:r=${fps},setsar=1,format=yuv420p[${bgLabel}]`
            );
            filterParts.push(
              `[${lastLabel()}][${bgLabel}]xfade=transition=${xfType}:duration=${dur.toFixed(4)}:offset=${offset.toFixed(4)}[${outLabel}]`
            );
            concatVideoLabels[concatVideoLabels.length - 1] = `[${outLabel}]`;
            xfStep++;
          }
        }
      }

      // Handle chroma-key effect (needs background composite)
      const ckFx = vClip.effects?.find(fx => fx.enabled && fx.filterType === 'chroma-key');
      if (ckFx) {
        const ckP = ckFx.filterParams || {};
        const keyColor = ((ckP.keyColor as string) ?? '#00FF00').replace('#', '0x');
        const similarity = Math.max(0.01, Math.min(1.0, ((ckP.similarity as number) ?? 40) / 100));
        const blendAmt = Math.max(0, Math.min(1.0, ((ckP.smoothness as number) ?? 8) / 100));
        const ckSrc = concatVideoLabels[concatVideoLabels.length - 1].slice(1, -1);
        const ckOut = `${label}ck`;
        const ckBg = `${label}ckbg`;
        filterParts.push(
          `color=c=black:s=${request.width}x${request.height}:r=${request.frameRate}[${ckBg}]`
        );
        filterParts.push(
          `[${ckSrc}]chromakey=color=${keyColor}:similarity=${similarity.toFixed(3)}:blend=${blendAmt.toFixed(3)}[${label}fg]`
        );
        filterParts.push(`[${ckBg}][${label}fg]overlay=format=auto[${ckOut}]`);
        concatVideoLabels[concatVideoLabels.length - 1] = `[${ckOut}]`;
      }

      // Extract audio only if ALL clips have audio (prevents orphaned filter labels).
      // Also skip image clips — they have no audio stream ([inputIdx:a] would fail).
      // Also skip if a separate audio track already covers this source — playing
      // both would double the audio.
      if (allClipsHaveAudio && vClip.mediaType !== 'image' && !skipVideoAudioFor(vClip)) {
        const aLabel = `a${segmentIdx}`;
        const audioFilters: string[] = [];
        const _aStart = vClip.sourceStartTime ?? 0;
        const _aEnd = Math.max(_aStart + 0.001, vClip.sourceEndTime ?? 0);
        audioFilters.push(`atrim=start=${_aStart}:end=${_aEnd}`);
        audioFilters.push(`asetpts=PTS-STARTPTS`);
        if (speed !== 1) audioFilters.push(`atempo=${speed}`);
        // Volume
        const trackVol = videoTrack?.volume ?? 1;
        const clipVol = vClip.volume ?? 1;
        const totalVol = trackVol * clipVol;
        if (totalVol !== 1) audioFilters.push(`volume=${totalVol}`);
        // Audio transitions (afade)
        audioFilters.push(...buildTransitionAudioFilters(vClip.effects, vClipDuration));
        // Audio effects (eq, compressor)
        audioFilters.push(...buildAudioEffectFilters(vClip.effects));
        const aSrcLabel = takeAudioSrcLabel(inputIdx);
        filterParts.push(`[${aSrcLabel}]${audioFilters.join(',')}[${aLabel}]`);
        concatAudioLabels.push(`[${aLabel}]`);
      }

      clipDurationList.push(vClipDuration);
      clipLabelToSortedIdx.set(label, sortedVideoClips.indexOf(vClip));

      currentTime = vClip.endTime;
      segmentIdx++;
    }

    // Fill trailing gap to reach total project duration
    if (request.duration - currentTime > 0.01) {
      addGap(request.duration - currentTime);
    }

    // Concat filter — build filter_complex and map in one pass
    const n = concatVideoLabels.length;
    const hasAudio = allClipsHaveAudio && concatAudioLabels.length === n;
    const isGif = request.format === 'gif';

    // Collect junction xfade info between adjacent video segments
    // We need to map concatVideoLabels indices back to sortedVideoClips
    // Build a parallel structure: for each label, which sortedVideoClip it came from (-1 = gap)
    const labelClipMap: Array<number> = []; // index into sortedVideoClips, or -1 for gap
    {
      let prevTime = 0;
      for (let si = 0; si < sortedVideoClips.length; si++) {
        const vc = sortedVideoClips[si];
        if (vc.startTime - prevTime > 0.01) labelClipMap.push(-1); // gap before
        labelClipMap.push(si);
        prevTime = vc.endTime;
      }
      if (request.duration - prevTime > 0.01) labelClipMap.push(-1); // trailing gap
    }

    // Check if any adjacent clip pair has an xfade-supported transition
    let useXfade = false;
    for (let i = 0; i < labelClipMap.length - 1; i++) {
      const leftIdx = labelClipMap[i];
      const rightIdx = labelClipMap[i + 1];
      if (leftIdx < 0 || rightIdx < 0) continue;
      const leftClip = sortedVideoClips[leftIdx];
      const rightClip = sortedVideoClips[rightIdx];
      const endFx = leftClip.effects?.find(fx => fx.enabled && fx.type === 'transition' &&
        (fx.transitionPosition === 'end' || fx.transitionPosition === 'both') &&
        fx.transitionType && fx.transitionType in XFADE_MAP);
      const startFx = rightClip.effects?.find(fx => fx.enabled && fx.type === 'transition' &&
        (fx.transitionPosition === 'start' || fx.transitionPosition === 'both') &&
        fx.transitionType && fx.transitionType in XFADE_MAP);
      if (endFx || startFx) { useXfade = true; break; }
    }

    if (!useXfade) {
      // Regular concat (no xfade transitions)
      if (hasAudio) {
        const interleavedLabels = concatVideoLabels.map((vl, i) => vl + concatAudioLabels[i]).join('');
        filterParts.push(`${interleavedLabels}concat=n=${n}:v=1:a=1[outv][outa]`);
      } else {
        filterParts.push(`${concatVideoLabels.join('')}concat=n=${n}:v=1:a=0[outv]`);
      }
    } else {
      // xfade chain: process segment by segment
      // For segments without xfade, we group and concat them, then xfade at the junction.
      let prevVLabel = concatVideoLabels[0].slice(1, -1);
      let prevALabel = hasAudio ? concatAudioLabels[0].slice(1, -1) : '';
      let accDuration = clipDurationList[0] ?? 0;

      for (let i = 1; i < concatVideoLabels.length; i++) {
        const leftIdx = labelClipMap[i - 1];
        const rightIdx = labelClipMap[i];
        let xfadeType: string | null = null;
        let xfadeDur = 0.5;

        if (leftIdx >= 0 && rightIdx >= 0) {
          const leftClip = sortedVideoClips[leftIdx];
          const rightClip = sortedVideoClips[rightIdx];
          const endFx = leftClip.effects?.find(fx => fx.enabled && fx.type === 'transition' &&
            (fx.transitionPosition === 'end' || fx.transitionPosition === 'both') &&
            fx.transitionType && fx.transitionType in XFADE_MAP);
          const startFx = rightClip.effects?.find(fx => fx.enabled && fx.type === 'transition' &&
            (fx.transitionPosition === 'start' || fx.transitionPosition === 'both') &&
            fx.transitionType && fx.transitionType in XFADE_MAP);
          // Prefer the right (newer) clip's start transition — this is what
          // the user just added on the second split half. Fall back to the
          // left clip's end transition if the right has none.
          const fx = startFx || endFx;
          if (fx) {
            xfadeType = XFADE_MAP[fx.transitionType!];
            xfadeDur = fx.transitionDuration ?? 0.5;
          }
        }

        const curVLabel = concatVideoLabels[i].slice(1, -1);
        const curALabel = hasAudio ? concatAudioLabels[i].slice(1, -1) : '';

        if (xfadeType) {
          const offset = Math.max(0, accDuration - xfadeDur);
          const outVLabel = `xfv${i}`;
          filterParts.push(
            `[${prevVLabel}][${curVLabel}]xfade=transition=${xfadeType}:duration=${xfadeDur}:offset=${offset.toFixed(4)}[${outVLabel}]`
          );
          prevVLabel = outVLabel;
          if (hasAudio) {
            const outALabel = `xfa${i}`;
            filterParts.push(
              `[${prevALabel}][${curALabel}]acrossfade=d=${xfadeDur}:c1=tri:c2=tri[${outALabel}]`
            );
            prevALabel = outALabel;
          }
          accDuration = accDuration - xfadeDur + (clipDurationList[i] ?? 0);
        } else {
          // Hard cut: concat this segment with the previous
          const tmpVLabel = `catv${i}`;
          const catStr = hasAudio
            ? `[${prevVLabel}][${prevALabel}][${curVLabel}][${curALabel}]concat=n=2:v=1:a=1[${tmpVLabel}][cata${i}]`
            : `[${prevVLabel}][${curVLabel}]concat=n=2:v=1:a=0[${tmpVLabel}]`;
          filterParts.push(catStr);
          prevVLabel = tmpVLabel;
          if (hasAudio) prevALabel = `cata${i}`;
          accDuration += clipDurationList[i] ?? 0;
        }
      }

      filterParts.push(`[${prevVLabel}]copy[outv]`);
      if (hasAudio) filterParts.push(`[${prevALabel}]acopy[outa]`);
    }

    // ---- Mix external audio tracks (music/audio tracks) with video audio ----
    // audioClips are separate music/audio track clips positioned on the timeline.
    // We delay each to its startTime, then amix with the video concat audio ([outa]).
    const allAudioToMix: string[] = [];
    if (hasAudio) allAudioToMix.push('[outa]');

    audioClips.forEach((aClip, i) => {
      const inputIdx = inputMap.get(aClip.sourceUrl);
      if (inputIdx === undefined) return;
      // Skip if this source has no audio stream (e.g. image file placed on an audio track)
      if (sourcesWithAudio && !sourcesWithAudio.has(aClip.sourceUrl)) return;
      const extLabel = `extaudio${i}`;
      const track = request.tracks.find((t) => t.clips.some((c) => c.id === aClip.id));
      const trackVol = track?.volume ?? 1;
      const clipVol = aClip.volume ?? 1;
      const totalVol = trackVol * clipVol;
      const aFilters = [
        `atrim=start=${aClip.sourceStartTime}:end=${Math.max(aClip.sourceStartTime + 0.001, aClip.sourceEndTime)}`,
        'asetpts=PTS-STARTPTS',
        // adelay: skip when startTime ≈ 0 (no delay needed).
        // Use pipe-separated ms format (e.g. "5000|5000|5000|5000|5000|5000|5000|5000")
        // for maximum ffmpeg version compatibility — the :all=1 option is not available
        // in older ffmpeg builds and causes "Option not found".
        ...(aClip.startTime > 0.001
          ? [`adelay=${Array(8).fill(Math.round(aClip.startTime * 1000)).join('|')}`]
          : []),
      ];
      if (totalVol !== 1) aFilters.push(`volume=${totalVol}`);
      // dB gain (separate from linear volume)
      if (aClip.gain !== undefined && aClip.gain !== 0) {
        aFilters.push(`volume=${aClip.gain}dB`);
      }
      // Stereo pan: -1=full left, 0=center, 1=full right
      if (aClip.pan !== undefined && aClip.pan !== 0) {
        const leftVol = Math.max(0, 1 - aClip.pan);
        const rightVol = Math.max(0, 1 + aClip.pan);
        aFilters.push(`pan=stereo|c0=${leftVol.toFixed(4)}*c0|c1=${rightVol.toFixed(4)}*c1`);
      }
      // Fade in/out
      const clipDuration = aClip.endTime - aClip.startTime;
      if (aClip.fadeIn && aClip.fadeIn > 0) {
        aFilters.push(`afade=t=in:st=0:d=${aClip.fadeIn}`);
      }
      if (aClip.fadeOut && aClip.fadeOut > 0) {
        aFilters.push(`afade=t=out:st=${(clipDuration - aClip.fadeOut).toFixed(4)}:d=${aClip.fadeOut}`);
      }
      const extASrcLabel = takeAudioSrcLabel(inputIdx);
      filterParts.push(`[${extASrcLabel}]${aFilters.join(',')}[${extLabel}]`);
      allAudioToMix.push(`[${extLabel}]`);
    });

    let finalAudioLabel: string | null = null;
    if (allAudioToMix.length >= 2) {
      filterParts.push(
        `${allAudioToMix.join('')}amix=inputs=${allAudioToMix.length}:duration=longest:normalize=0[finalaudio]`
      );
      finalAudioLabel = '[finalaudio]';
    } else if (allAudioToMix.length === 1) {
      finalAudioLabel = allAudioToMix[0];
    }

    // ---- Handle no-base-video case: synthesise black canvas in filter_complex ----
    // When there are only overlay clips (no non-image video on the base track),
    // the concat produced no [outv] — generate a black canvas of the project duration.
    let baseVideoOutLabel = '[outv]';
    if (hasOverlays && videoClips.length === 0) {
      const bW = Math.floor(request.width / 2) * 2;
      const bH = Math.floor(request.height / 2) * 2;
      filterParts.push(
        `color=c=black:s=${bW}x${bH}:d=${request.duration}:r=${request.frameRate},setsar=1,format=yuv420p[outv_black]`,
      );
      baseVideoOutLabel = '[outv_black]';
    }

    // ---- Overlay compositor ──────────────────────────────────────────────────
    // Composite overlay tracks on top of the base video stream.
    // Overlay inputs are collected via extraInputArgs which must be inserted into
    // `args` before the -filter_complex argument so FFmpeg sees them in order.
    let videoOutLabel = baseVideoOutLabel;

    if (hasOverlays) {
      const extraInputArgs: string[] = [];
      const nextInputIndex = { value: inputIndex };

      // The base stream (yuv420p) is passed directly to the overlay compositor.
      // Overlay clips are in 'rgba' format so ffmpeg's overlay filter composites them
      // correctly on top of the yuv420p base (no explicit format conversion needed here).
      const baseAccLabel = baseVideoOutLabel.replace(/^\[|\]$/g, '');

      const compositorParams = {
        projectWidth: request.width,
        projectHeight: request.height,
        frameRate: request.frameRate,
        accLabel: baseAccLabel,
        filterParts,
        inputMap,
        nextInputIndex,
        extraInputArgs,
        videoSplitQueue,
        audioSplitQueue,
      };

      const finalOverlayLabel = buildOverlayCompositor(
        overlayTracks,
        compositorParams,
        buildEffectFilters,
      );

      // Convert back to yuv420p for the encoder
      const finalYuvLabel = 'outv_composite';
      filterParts.push(`[${finalOverlayLabel}]format=yuv420p[${finalYuvLabel}]`);
      videoOutLabel = `[${finalYuvLabel}]`;

      // Splice overlay inputs before the -filter_complex argument.
      // We push them into `args` now — they will appear after the base inputs
      // already in `args` but before -filter_complex (which we haven't pushed yet).
      args.push(...extraInputArgs);

      // The compositor consumed input slots via nextInputIndex — sync the outer
      // counter so anything added afterwards (subtitle PNGs) gets a fresh slot
      // instead of colliding with an overlay clip's input.
      inputIndex = nextInputIndex.value;
    }

    // ---- Adjustment track effects applied to the final video output ----
    const adjTrackEffects = request.tracks
      .filter((t) => t.type === 'adjustment' && !t.muted)
      .flatMap((t) => t.clips.flatMap((c) => c.effects ?? []));
    const adjVideoFilters = buildEffectFilters(adjTrackEffects);
    if (adjVideoFilters.length > 0) {
      const adjIn = videoOutLabel.replace(/^\[|\]$/g, '');
      filterParts.push(`[${adjIn}]${adjVideoFilters.join(',')}[outv_adj]`);
      videoOutLabel = '[outv_adj]';
    }

    // ---- Subtitle PNG overlays ----
    // Full-frame transparent PNGs rasterized by the renderer and composited here.
    // This path is taken when subtitleOverlays is present (pixel-accurate mode).
    // Each PNG is a still image looped for the clip duration and overlaid at 0,0.
    if (hasSubtitleOverlays && request.subtitleOverlays) {
      const subtitleInputArgs: string[] = [];
      let subInputIdx = inputIndex; // next free input slot after base + audio + overlay inputs

      for (let si = 0; si < request.subtitleOverlays.length; si++) {
        const subOv = request.subtitleOverlays[si];
        if (!subOv.pngPath) continue;

        const clipDur = subOv.endTime - subOv.startTime;
        if (clipDur <= 0) continue;

        subtitleInputArgs.push(
          '-loop', '1',
          '-f', 'image2',
          '-framerate', String(request.frameRate),
          '-i', subOv.pngPath,
        );

        const subProcLabel = `subpng${si}_proc`;
        const subCompLabel = `subpng${si}_comp`;
        // trim to clip duration, reset PTS, convert to rgba for alpha-aware overlay
        filterParts.push(
          `[${subInputIdx}:v]trim=end=${clipDur.toFixed(4)},setpts=PTS-STARTPTS,fps=${request.frameRate},format=rgba[${subProcLabel}]`,
        );
        const curLabel = videoOutLabel.replace(/^\[|\]$/g, '');
        const enable = `between(t,${subOv.startTime.toFixed(4)},${subOv.endTime.toFixed(4)})`;
        filterParts.push(
          `[${curLabel}][${subProcLabel}]overlay=0:0:enable='${enable}'[${subCompLabel}]`,
        );
        videoOutLabel = `[${subCompLabel}]`;
        subInputIdx++;
      }

      // Splice the subtitle PNG inputs into args before -filter_complex
      args.push(...subtitleInputArgs);
    }

    // ---- Burned subtitles (ASS fallback) ----
    // Write subtitle clips to a temp .ass file and overlay via the subtitles filter.
    // Skipped when subtitleOverlays is present (PNG path is used instead).

    if (request.includeSubtitles && request.subtitleFormat === 'burned' && !isGif && !hasSubtitleOverlays) {
      const allSubs = request.tracks
        .filter((t) => t.type === 'subtitle')
        .flatMap((t) => t.clips)
        .filter((c) => c.text)
        .sort((a, b) => a.startTime - b.startTime);

      if (allSubs.length > 0) {
        const assContent = buildAssContent(allSubs as SubClip[], request.width, request.height);
        const assFileName = `iris_subs_complex_${Date.now()}.ass`;
        const assDir = app.getPath('temp');
        const assPath = path.join(assDir, assFileName);
        filterParts.push(`${videoOutLabel}ass=${assFileName}[outv_sub]`);
        videoOutLabel = '[outv_sub]';
        (request as any)._ffmpegCwd = assDir;
        (request as any)._assContent = assContent;
        (request as any)._assPath = assPath;
      }
    }

    if (isGif) {
      // Append palette generation to filter_complex and map the GIF output
      filterParts.push(`${videoOutLabel}fps=10,split[gs0][gs1];[gs0]palettegen[gp];[gs1][gp]paletteuse[gifout]`);
      args.push('-filter_complex', filterParts.join(';'));
      args.push('-map', '[gifout]');
      args.push('-loop', '0');
    } else {
      args.push('-filter_complex', filterParts.join(';'));
      args.push('-map', videoOutLabel);
      if (finalAudioLabel) args.push('-map', finalAudioLabel);
      args.push(...getQualityParams(request.quality, request.format, request.codec, request.proResProfile));
    }
  }

  // Frame rate (not needed for GIF — fps filter handles it)
  if (request.format !== 'gif') {
    args.push('-r', String(request.frameRate));
  }

  // Duration limit
  args.push('-t', String(request.duration));

  // Output
  args.push(request.outputPath);

  return args;
}

// ==================== Subtitle Export ====================

async function exportSubtitles(
  request: ExportRequest,
  format: 'srt' | 'vtt'
): Promise<string | null> {
  const subtitleTracks = request.tracks.filter((t) => t.type === 'subtitle');
  const allSubs = subtitleTracks.flatMap((t) => t.clips)
    .filter((c) => c.text)
    .sort((a, b) => a.startTime - b.startTime);

  if (allSubs.length === 0) return null;

  const ext = format === 'srt' ? '.srt' : '.vtt';
  const outputPath = request.outputPath.replace(/\.[^.]+$/, ext);

  let content = '';

  if (format === 'vtt') {
    content = 'WEBVTT\n\n';
  }

  allSubs.forEach((sub, i) => {
    const startTC = formatTimecode(sub.startTime, format);
    const endTC = formatTimecode(sub.endTime, format);

    if (format === 'srt') {
      content += `${i + 1}\n${startTC} --> ${endTC}\n${sub.text}\n\n`;
    } else {
      content += `${startTC} --> ${endTC}\n${sub.text}\n\n`;
    }
  });

  await fs.writeFile(outputPath, content, 'utf-8');
  return outputPath;
}

function formatTimecode(seconds: number, format: 'srt' | 'vtt'): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  const sep = format === 'srt' ? ',' : '.';
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(ms).padStart(3, '0')}`;
}

// ==================== Active Export Process ====================

let activeExport: ChildProcess | null = null;

function sendProgress(win: InstanceType<typeof BrowserWindow> | null, progress: ExportProgress) {
  win?.webContents.send('export:progress', progress);
}

// ==================== IPC Handlers ====================

export function setupExportHandlers() {
  // Ensure FFmpeg is available — bundled binary, system install, or auto-download.
  // Streams progress to the renderer so the UI can show "Setting up..." rather
  // than a hard "not found" error.
  ipcMain.handle('export:ensureFFmpeg', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await ensureFFmpegAvailable((p: EnsureProgress) => {
      win?.webContents.send('export:ffmpegSetupProgress', p);
    });
    return result;
  });

  // Back-compat alias — older renderer builds call export:checkFFmpeg.
  // Delegates to the same ensure flow so users always get auto-install.
  ipcMain.handle('export:checkFFmpeg', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await ensureFFmpegAvailable((p: EnsureProgress) => {
      win?.webContents.send('export:ffmpegSetupProgress', p);
    });
    return result;
  });

  // Probe video dimensions from a URL using ffmpeg directly (no full download needed).
  // Uses -probesize and -analyzeduration to limit how much data ffmpeg reads,
  // and kills the process as soon as dimensions are parsed from stderr.
  // Probe duration via ffmpeg. Falls back here when the renderer's
  // <video preload="metadata"> probe returns 0 (encrypted streams,
  // missing previewUrl, unsupported browser codec). Reads only the
  // container header so it's cheap.
  ipcMain.handle('video:probeDuration', async (_, url: string, authToken?: string) => {
    const ffmpegPath = findFFmpegPath();
    return await new Promise<number | null>((resolve) => {
      let resolved = false;
      const safe = (v: number | null) => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(v); } };

      const args: string[] = [];
      if (authToken) args.push('-headers', `Authorization: Bearer ${authToken}\r\n`);
      args.push('-probesize', '5000000', '-analyzeduration', '0', '-i', url);

      const proc = spawn(ffmpegPath, args, { stdio: 'pipe' });
      let stderr = '';
      const tryParse = () => {
        const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
        if (!m) return;
        const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
        proc.kill();
        safe(sec);
      };
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); tryParse(); });
      proc.on('close', () => { tryParse(); safe(null); });
      proc.on('error', () => safe(null));
      const timer = setTimeout(() => { proc.kill(); safe(null); }, 10000);
    });
  });

  ipcMain.handle('video:probeDimensions', async (_, url: string, authToken?: string) => {
    const ffmpegPath = findFFmpegPath();

    return await new Promise<{ width: number; height: number } | null>((resolve) => {
      let resolved = false;
      const safeResolve = (val: { width: number; height: number } | null) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        resolve(val);
      };

      const args: string[] = [];
      if (authToken) {
        // ffmpeg HTTP header option — must end with \r\n
        args.push('-headers', `Authorization: Bearer ${authToken}\r\n`);
      }
      // Limit probe to 5MB / 0 analysis duration — only read container headers
      args.push('-probesize', '5000000', '-analyzeduration', '0', '-i', url);

      const proc = spawn(ffmpegPath, args, { stdio: 'pipe' });
      let stderr = '';

      const tryParse = () => {
        // Parse encoded dimensions from the Video stream line
        const dimMatch = stderr.match(/Video:.*?[, ](\d{2,5})x(\d{2,5})[, ]/);
        if (!dimMatch) return;
        const encodedW = parseInt(dimMatch[1]);
        const encodedH = parseInt(dimMatch[2]);

        // Parse rotation from stream metadata tag or displaymatrix side data
        let rotation = 0;
        const rotateMeta = stderr.match(/rotate\s*:\s*(-?\d+)/);
        if (rotateMeta) {
          rotation = Math.abs(parseInt(rotateMeta[1]));
        } else {
          const displayMatrix = stderr.match(/displaymatrix.*?rotation of (-?\d+\.?\d*) degrees/i);
          if (displayMatrix) {
            rotation = Math.abs(Math.round(parseFloat(displayMatrix[1])));
          }
        }

        const width  = (rotation === 90 || rotation === 270) ? encodedH : encodedW;
        const height = (rotation === 90 || rotation === 270) ? encodedW : encodedH;

        // Kill ffmpeg immediately — we have what we need
        proc.kill();
        safeResolve({ width, height });
      };

      proc.stderr?.on('data', (d: Buffer) => {
        stderr += d.toString();
        tryParse();
      });

      proc.on('close', () => {
        // Final attempt in case dimensions arrived in the last chunk
        tryParse();
        safeResolve(null);
      });
      proc.on('error', () => safeResolve(null));

      // Kill after 10s to avoid hanging
      const timer = setTimeout(() => { proc.kill(); safeResolve(null); }, 10000);
    });
  });

  // Start export rendering
  ipcMain.handle('export:start', async (event, request: ExportRequest) => {
    const win = BrowserWindow.fromWebContents(event.sender);

    // Cancel any existing export
    if (activeExport) {
      activeExport.kill();
      activeExport = null;
    }

    sendProgress(win, {
      status: 'preparing',
      progress: 0,
      message: 'Preparing export...',
    });

    const tempFiles: string[] = [];
    try {
      // Ensure output directory exists
      const outputDir = path.dirname(request.outputPath);
      await fs.mkdir(outputDir, { recursive: true });

      // Resolve sourceUrls — all assets must already be local
      for (const track of request.tracks) {
        for (const clip of track.clips) {
          if (!clip.sourceUrl) continue;

          if (clip.sourceUrl.startsWith('file://')) {
            clip.sourceUrl = decodeURIComponent(clip.sourceUrl.replace(/^file:\/\/\//, ''));
          } else if (clip.sourceUrl.startsWith('http://127.0.0.1:') && clip.sourceUrl.includes('path=')) {
            // Local media server URL — the real local file path is in the ?path= query.
            // Served over HTTP only so <video>/<audio> can Range-stream in the editor.
            const localPath = new URL(clip.sourceUrl).searchParams.get('path');
            if (!localPath) {
              throw new Error(`Invalid local media URL: ${clip.sourceUrl}. Restart the project.`);
            }
            clip.sourceUrl = localPath;
          } else if (clip.sourceUrl.startsWith('http')) {
            throw new Error(`Asset not downloaded locally: ${clip.sourceUrl}. Restart the project.`);
          }
        }
      }

      // Validate: all media clips must have valid local file paths
      const missingFiles: string[] = [];
      for (const track of request.tracks) {
        for (const clip of track.clips) {
          if (clip.sourceUrl && !clip.sourceUrl.startsWith('http') && !existsSync(clip.sourceUrl)) {
            missingFiles.push(`${clip.type}:${clip.sourceUrl}`);
          }
        }
      }
      if (missingFiles.length > 0) {
        console.error('[Export] Missing files:', missingFiles);
      }

      // Write subtitle PNG overlays to temp files (rasterized by the renderer)
      if (request.subtitleOverlays && request.subtitleOverlays.length > 0) {
        const subTempDir = path.join(app.getPath('temp'), 'iris-export');
        await fs.mkdir(subTempDir, { recursive: true });
        for (const overlay of request.subtitleOverlays) {
          if (!overlay.pngDataUrl) continue;
          const b64 = overlay.pngDataUrl.replace(/^data:image\/png;base64,/, '');
          const buf = Buffer.from(b64, 'base64');
          const tmpPng = path.join(
            subTempDir,
            `subtitle_${Date.now()}_${Math.random().toString(36).slice(2)}.png`,
          );
          await fs.writeFile(tmpPng, buf);
          overlay.pngPath = tmpPng;
          tempFiles.push(tmpPng);
        }
      }

      // Export subtitles separately if needed
      if (request.includeSubtitles && request.subtitleFormat && request.subtitleFormat !== 'burned') {
        const subPath = await exportSubtitles(request, request.subtitleFormat);
        if (subPath) {
          sendProgress(win, {
            status: 'preparing',
            progress: 25,
            message: `Subtitles exported to ${path.basename(subPath)}`,
          });
        }
      }

      // Build FFmpeg command
      const ffmpegPath = findFFmpegPath();

      // Probe each unique local source for audio streams
      const sourcesWithAudio = new Set<string>();
      const uniqueLocalPaths = Array.from(new Set(
        request.tracks.flatMap((t) => t.clips).map((c) => c.sourceUrl).filter(Boolean)
      ));
      for (const srcPath of uniqueLocalPaths) {
        if (await checkSourceHasAudio(ffmpegPath, srcPath)) {
          sourcesWithAudio.add(srcPath);
        }
      }

      const args = buildFFmpegArgs(request, sourcesWithAudio);

      // Write burned subtitle ASS file if prepared by buildFFmpegArgs
      const reqWithAss = request as ExportRequest & { _assContent?: string; _assPath?: string };
      if (reqWithAss._assContent && reqWithAss._assPath) {
        await fs.writeFile(reqWithAss._assPath, reqWithAss._assContent, 'utf-8');
        tempFiles.push(reqWithAss._assPath);
      }

      sendProgress(win, {
        status: 'rendering',
        progress: 10,
        message: 'Starting FFmpeg render...',
      });

      // Log the full FFmpeg command for debugging
      const ffmpegCmd = `${ffmpegPath} ${args.join(' ')}`;
      console.log('[Export] FFmpeg command:', ffmpegCmd);
      try { require('fs').writeFileSync(require('path').join(require('os').tmpdir(), 'iris-export-cmd.log'), ffmpegCmd); } catch {};

      // Spawn FFmpeg process
      return new Promise<{ success: boolean; outputPath?: string; error?: string }>((resolve) => {
        const spawnOpts: any = { stdio: 'pipe' };
        if ((request as any)._ffmpegCwd) spawnOpts.cwd = (request as any)._ffmpegCwd;
        const proc = spawn(ffmpegPath, args, spawnOpts);
        activeExport = proc;
        let cancelled = false;
        (proc as any).__onCancel = () => { cancelled = true; };

        let stderr = '';

        proc.stderr?.on('data', (data: Buffer) => {
          const line = data.toString();
          stderr += line;

          // Parse progress from FFmpeg stderr
          // FFmpeg outputs: frame=  123 fps= 30 q=28.0 size=    1234kB time=00:00:04.10 bitrate=2467.2kbits/s speed=1.05x
          const timeMatch = line.match(/time=(\d+):(\d+):(\d+\.\d+)/);
          if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const mins = parseInt(timeMatch[2]);
            const secs = parseFloat(timeMatch[3]);
            const currentTime = hours * 3600 + mins * 60 + secs;
            const progress = Math.min(95, 10 + (currentTime / request.duration) * 85);

            const speedMatch = line.match(/speed=\s*([\d.]+)x/);
            const speed = speedMatch ? parseFloat(speedMatch[1]) : 0;
            const remaining = speed > 0
              ? Math.round((request.duration - currentTime) / speed)
              : 0;

            sendProgress(win, {
              status: 'rendering',
              progress: Math.round(progress),
              message: speed > 0
                ? `Rendering... ${Math.round(progress)}% (${remaining}s remaining)`
                : `Rendering... ${Math.round(progress)}%`,
            });
          }
        });

        const cleanup = () => {
          for (const f of tempFiles) {
            fs.unlink(f).catch(() => {});
          }
        };

        proc.on('close', (code) => {
          activeExport = null;
          cleanup();

          if (cancelled) {
            sendProgress(win, {
              status: 'cancelled',
              progress: 0,
              message: 'Export cancelled',
            });
            resolve({ success: false, error: 'cancelled' });
            return;
          }

          if (code === 0) {
            sendProgress(win, {
              status: 'completed',
              progress: 100,
              message: 'Export completed!',
              outputPath: request.outputPath,
            });
            resolve({ success: true, outputPath: request.outputPath });
          } else {
            const stderrLines = stderr.split('\n').filter(Boolean);
            console.error('[Export] FFmpeg failed. Last stderr lines:\n', stderrLines.slice(-10).join('\n'));
            const errorMsg = stderrLines.slice(-3).join(' | ') || `FFmpeg exited with code ${code}`;
            sendProgress(win, {
              status: 'failed',
              progress: 0,
              message: 'Export failed',
              error: errorMsg,
            });
            resolve({ success: false, error: errorMsg });
          }
        });

        proc.on('error', (err) => {
          activeExport = null;
          cleanup();
          sendProgress(win, {
            status: 'failed',
            progress: 0,
            message: 'Export failed',
            error: err.message,
          });
          resolve({ success: false, error: err.message });
        });
      });
    } catch (err) {
      // Cleanup temp files on error
      for (const f of tempFiles) {
        fs.unlink(f).catch(() => {});
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      sendProgress(win, {
        status: 'failed',
        progress: 0,
        message: 'Export failed',
        error: errorMsg,
      });
      return { success: false, error: errorMsg };
    }
  });

  // Cancel export
  ipcMain.handle('export:cancel', () => {
    if (activeExport) {
      const proc: any = activeExport;
      if (typeof proc.__onCancel === 'function') proc.__onCancel();
      proc.kill(process.platform === 'win32' ? undefined : 'SIGTERM');
      activeExport = null;
      return { cancelled: true };
    }
    return { cancelled: false };
  });

  // Note: proxy:generate has moved to electron/ipc/proxy.ts (setupProxyHandlers)
}
